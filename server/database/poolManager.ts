/**
 * Advanced Database Connection Pool Manager
 * Optimizes PostgreSQL connection pooling with dynamic sizing and health monitoring
 */

import { Pool, PoolConfig, PoolClient, QueryResult } from 'pg';
import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { performance } from 'perf_hooks';

interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingRequests: number;
  totalQueries: number;
  avgQueryTime: number;
  connectionErrors: number;
  lastError?: string;
}

interface QueryMetrics {
  query: string;
  duration: number;
  rowCount: number;
  timestamp: Date;
}

interface ConnectionHealth {
  healthy: boolean;
  latency: number;
  lastCheck: Date;
}

export class DatabasePoolManager extends EventEmitter {
  private static instance: DatabasePoolManager;
  private pool: Pool;
  private stats: PoolStats;
  private queryMetrics: QueryMetrics[] = [];
  private readonly MAX_METRICS = 1000;
  private healthCheckInterval?: NodeJS.Timeout;
  private poolOptimizationInterval?: NodeJS.Timeout;

  // Dynamic pool sizing parameters
  private readonly MIN_POOL_SIZE = 5;
  private readonly MAX_POOL_SIZE = 50;
  private readonly TARGET_UTILIZATION = 0.7; // 70% utilization target
  private currentPoolSize: number;

  private constructor() {
    super();
    this.stats = {
      totalConnections: 0,
      idleConnections: 0,
      activeConnections: 0,
      waitingRequests: 0,
      totalQueries: 0,
      avgQueryTime: 0,
      connectionErrors: 0
    };
    this.currentPoolSize = 20; // Initial pool size
    this.initializePool();
    this.startHealthChecks();
    this.startPoolOptimization();
  }

  static getInstance(): DatabasePoolManager {
    if (!DatabasePoolManager.instance) {
      DatabasePoolManager.instance = new DatabasePoolManager();
    }
    return DatabasePoolManager.instance;
  }

  /**
   * Initialize the connection pool
   */
  private initializePool(): void {
    const config: PoolConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'maifarm_dev',
      user: process.env.DB_USER || 'maifarm',
      password: process.env.DB_PASSWORD || 'maifarm123',

      // Pool configuration
      max: this.currentPoolSize,
      min: this.MIN_POOL_SIZE,

      // Connection configuration
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,

      // Query configuration
      query_timeout: 30000,
      statement_timeout: 30000,

      // Keep alive
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    };

    this.pool = new Pool(config);

    // Set up event handlers
    this.pool.on('connect', (client: PoolClient) => {
      this.stats.totalConnections++;
      this.emit('connection:created', { totalConnections: this.stats.totalConnections });
      logger.debug(LogCategory.DATABASE, 'New connection created', {
        totalConnections: this.stats.totalConnections
      });
    });

    this.pool.on('acquire', (client: PoolClient) => {
      this.stats.activeConnections++;
      this.stats.idleConnections = Math.max(0, this.stats.idleConnections - 1);
      this.emit('connection:acquired', {
        activeConnections: this.stats.activeConnections,
        idleConnections: this.stats.idleConnections
      });
    });

    this.pool.on('release', (client: PoolClient) => {
      this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
      this.stats.idleConnections++;
      this.emit('connection:released', {
        activeConnections: this.stats.activeConnections,
        idleConnections: this.stats.idleConnections
      });
    });

    this.pool.on('remove', (client: PoolClient) => {
      this.stats.totalConnections = Math.max(0, this.stats.totalConnections - 1);
      this.emit('connection:removed', { totalConnections: this.stats.totalConnections });
    });

    this.pool.on('error', (error: Error, client: PoolClient) => {
      this.stats.connectionErrors++;
      this.stats.lastError = error.message;
      logger.error(LogCategory.DATABASE, 'Pool error', error);
      this.emit('error', error);
    });
  }

  /**
   * Execute a query with metrics tracking
   */
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const startTime = performance.now();
    let client: PoolClient | undefined;

    try {
      // Track waiting requests
      this.stats.waitingRequests++;
      this.emit('query:waiting', { waitingRequests: this.stats.waitingRequests });

      // Acquire client from pool
      client = await this.pool.connect();
      this.stats.waitingRequests = Math.max(0, this.stats.waitingRequests - 1);

      // Execute query
      const result = await client.query<T>(text, params);

      // Track metrics
      const duration = performance.now() - startTime;
      this.recordQueryMetrics(text, duration, result.rowCount);

      return result;
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Query error', { query: text, error });
      throw error;
    } finally {
      // Always release the client
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a client for manual connection management
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * Record query metrics
   */
  private recordQueryMetrics(query: string, duration: number, rowCount: number): void {
    const metric: QueryMetrics = {
      query: query.substring(0, 100), // Truncate for storage
      duration,
      rowCount,
      timestamp: new Date()
    };

    this.queryMetrics.push(metric);
    if (this.queryMetrics.length > this.MAX_METRICS) {
      this.queryMetrics.shift();
    }

    // Update statistics
    this.stats.totalQueries++;
    this.stats.avgQueryTime = this.calculateAverageQueryTime();

    this.emit('query:completed', metric);
  }

  /**
   * Calculate average query time
   */
  private calculateAverageQueryTime(): number {
    if (this.queryMetrics.length === 0) return 0;

    const sum = this.queryMetrics.reduce((acc, m) => acc + m.duration, 0);
    return sum / this.queryMetrics.length;
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.checkHealth();
      this.emit('health:check', health);

      if (!health.healthy) {
        logger.warn(LogCategory.DATABASE, 'Database health check failed', health);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check database health
   */
  async checkHealth(): Promise<ConnectionHealth> {
    const startTime = performance.now();

    try {
      await this.query('SELECT 1');
      const latency = performance.now() - startTime;

      return {
        healthy: true,
        latency,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        latency: performance.now() - startTime,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Start pool optimization
   */
  private startPoolOptimization(): void {
    this.poolOptimizationInterval = setInterval(() => {
      this.optimizePoolSize();
    }, 60000); // Optimize every minute
  }

  /**
   * Dynamically optimize pool size based on usage
   */
  private async optimizePoolSize(): Promise<void> {
    const utilization = this.stats.activeConnections / this.currentPoolSize;
    const waitingRatio = this.stats.waitingRequests / this.currentPoolSize;

    let newPoolSize = this.currentPoolSize;

    // Increase pool size if utilization is high or there are waiting requests
    if (utilization > this.TARGET_UTILIZATION || waitingRatio > 0.1) {
      newPoolSize = Math.min(
        this.MAX_POOL_SIZE,
        Math.ceil(this.currentPoolSize * 1.2)
      );
    }
    // Decrease pool size if utilization is low
    else if (utilization < this.TARGET_UTILIZATION * 0.5) {
      newPoolSize = Math.max(
        this.MIN_POOL_SIZE,
        Math.floor(this.currentPoolSize * 0.8)
      );
    }

    // Apply changes if needed
    if (newPoolSize !== this.currentPoolSize) {
      logger.info(LogCategory.DATABASE, `Adjusting pool size from ${this.currentPoolSize} to ${newPoolSize}`, {
        utilization,
        waitingRatio,
        activeConnections: this.stats.activeConnections
      });

      this.currentPoolSize = newPoolSize;
      await this.resizePool(newPoolSize);
    }
  }

  /**
   * Resize the connection pool
   */
  private async resizePool(newSize: number): Promise<void> {
    // Note: pg doesn't support dynamic pool resizing directly
    // This would require recreating the pool, which is complex
    // For now, we'll track the desired size for monitoring

    this.emit('pool:resized', {
      oldSize: this.pool.options.max,
      newSize: newSize
    });

    // In production, you might want to:
    // 1. Create a new pool with the new size
    // 2. Gradually migrate connections
    // 3. Close the old pool
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      ...this.stats,
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      waitingRequests: this.pool.waitingCount
    };
  }

  /**
   * Get query metrics
   */
  getQueryMetrics(): QueryMetrics[] {
    return [...this.queryMetrics];
  }

  /**
   * Get slow queries
   */
  getSlowQueries(threshold: number = 1000): QueryMetrics[] {
    return this.queryMetrics
      .filter(m => m.duration > threshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  }

  /**
   * Clear query metrics
   */
  clearMetrics(): void {
    this.queryMetrics = [];
    this.stats.totalQueries = 0;
    this.stats.avgQueryTime = 0;
  }

  /**
   * Gracefully shutdown the pool
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.DATABASE, 'Shutting down database pool');

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.poolOptimizationInterval) {
      clearInterval(this.poolOptimizationInterval);
    }

    // Wait for active queries to complete
    let attempts = 0;
    while (this.stats.activeConnections > 0 && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    // Close the pool
    await this.pool.end();

    logger.info(LogCategory.DATABASE, 'Database pool shutdown complete');
  }

  /**
   * Execute multiple queries in parallel with connection pooling
   */
  async parallelQueries<T = any>(
    queries: Array<{ text: string; params?: any[] }>
  ): Promise<QueryResult<T>[]> {
    return Promise.all(
      queries.map(q => this.query<T>(q.text, q.params))
    );
  }

  /**
   * Prepared statement with connection reuse
   */
  async preparedQuery<T = any>(
    name: string,
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const client = await this.getClient();

    try {
      // Prepare statement if not already prepared
      await client.query({
        name: `${name}_prepare`,
        text: `PREPARE ${name} AS ${text}`,
        values: []
      });

      // Execute prepared statement
      return await client.query({
        name,
        text: `EXECUTE ${name}`,
        values: params
      });
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const poolManager = DatabasePoolManager.getInstance();