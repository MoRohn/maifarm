import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { redisCache } from '../cache/RedisCache';
import { correlationLogger } from '../logging/CorrelationLogger';

export interface QueryPlan {
  query: string;
  plan: any;
  executionTime: number;
  rowsReturned: number;
  cached: boolean;
  optimizations: string[];
}

export interface QueryStats {
  totalQueries: number;
  averageTime: number;
  slowQueries: Array<{
    query: string;
    time: number;
    timestamp: Date;
  }>;
  cacheHitRate: number;
  optimizedQueries: number;
}

/**
 * Query Optimizer for database performance
 */
export class QueryOptimizer {
  private static instance: QueryOptimizer;
  private queryStats: Map<string, { count: number; totalTime: number }> = new Map();
  private slowQueryThreshold = 100; // ms
  private slowQueries: Array<{ query: string; time: number; timestamp: Date }> = [];
  private queryPlans: Map<string, QueryPlan> = new Map();

  private constructor(private pool: Pool) {
    this.startAnalyzer();
  }

  static getInstance(pool: Pool): QueryOptimizer {
    if (!QueryOptimizer.instance) {
      QueryOptimizer.instance = new QueryOptimizer(pool);
    }
    return QueryOptimizer.instance;
  }

  /**
   * Execute optimized query with caching
   */
  async executeQuery<T = any>(
    query: string,
    params?: any[],
    options?: {
      cache?: boolean;
      cacheTTL?: number;
      forceRefresh?: boolean;
    }
  ): Promise<T[]> {
    const startTime = Date.now();
    const queryHash = this.hashQuery(query, params);

    // Check cache first
    if (options?.cache && !options?.forceRefresh) {
      const cached = await redisCache.get<T[]>(queryHash, {
        prefix: 'query',
        ttl: options.cacheTTL || 300
      });

      if (cached) {
        correlationLogger.debug('[QueryOptimizer] Cache hit for query', {
          metadata: { queryHash, executionTime: Date.now() - startTime }
        });
        return cached;
      }
    }

    // Optimize query
    const optimizedQuery = await this.optimizeQuery(query);

    // Execute query
    const client = await this.pool.connect();
    try {
      const result = await client.query<T>(optimizedQuery, params);
      const executionTime = Date.now() - startTime;

      // Track statistics
      this.trackQuery(query, executionTime);

      // Cache if enabled
      if (options?.cache) {
        await redisCache.set(queryHash, result.rows, {
          prefix: 'query',
          ttl: options.cacheTTL || 300
        });
      }

      // Log slow queries
      if (executionTime > this.slowQueryThreshold) {
        this.logSlowQuery(query, executionTime);
      }

      return result.rows;

    } finally {
      client.release();
    }
  }

  /**
   * Batch execute multiple queries
   */
  async batchExecute<T = any>(
    queries: Array<{
      query: string;
      params?: any[];
      cache?: boolean;
    }>
  ): Promise<T[][]> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const results: T[][] = [];
      
      for (const { query, params, cache } of queries) {
        const result = await this.executeQuery<T>(query, params, { cache });
        results.push(result);
      }
      
      await client.query('COMMIT');
      return results;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Optimize query
   */
  private async optimizeQuery(query: string): Promise<string> {
    const optimizations: string[] = [];
    let optimized = query;

    // Add LIMIT if not present for SELECT
    if (optimized.match(/^SELECT/i) && !optimized.match(/LIMIT/i)) {
      optimized += ' LIMIT 1000';
      optimizations.push('Added LIMIT clause');
    }

    // Convert NOT IN to NOT EXISTS for better performance
    if (optimized.includes('NOT IN')) {
      optimized = this.convertNotInToNotExists(optimized);
      optimizations.push('Converted NOT IN to NOT EXISTS');
    }

    // Add index hints for known slow patterns
    optimized = this.addIndexHints(optimized);
    if (optimized !== query) {
      optimizations.push('Added index hints');
    }

    // Store optimization info
    if (optimizations.length > 0) {
      correlationLogger.debug('[QueryOptimizer] Query optimized', {
        metadata: { optimizations }
      });
    }

    return optimized;
  }

  /**
   * Convert NOT IN to NOT EXISTS
   */
  private convertNotInToNotExists(query: string): string {
    // Simple pattern matching - would need more sophisticated parsing for production
    return query.replace(
      /WHERE\s+(\w+)\s+NOT\s+IN\s*\((.*?)\)/gi,
      'WHERE NOT EXISTS ($2 WHERE $1 = subquery.$1)'
    );
  }

  /**
   * Add index hints
   */
  private addIndexHints(query: string): string {
    // Add index hints for known patterns
    const patterns = [
      {
        pattern: /FROM\s+farms\s+WHERE\s+status/i,
        hint: 'FROM farms USE INDEX (idx_farms_status) WHERE status'
      },
      {
        pattern: /FROM\s+agents\s+WHERE\s+farm_id/i,
        hint: 'FROM agents USE INDEX (idx_agents_farm_id) WHERE farm_id'
      }
    ];

    let optimized = query;
    for (const { pattern, hint } of patterns) {
      if (pattern.test(query)) {
        optimized = query.replace(pattern, hint);
        break;
      }
    }

    return optimized;
  }

  /**
   * Analyze query execution plan
   */
  async analyzeQuery(query: string, params?: any[]): Promise<QueryPlan> {
    const client = await this.pool.connect();
    
    try {
      // Get execution plan
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
      const result = await client.query(explainQuery, params);
      
      const plan = result.rows[0]['QUERY PLAN'][0];
      
      const queryPlan: QueryPlan = {
        query,
        plan,
        executionTime: plan['Execution Time'],
        rowsReturned: plan['Plan']['Actual Rows'],
        cached: false,
        optimizations: this.suggestOptimizations(plan)
      };

      this.queryPlans.set(query, queryPlan);
      
      return queryPlan;

    } finally {
      client.release();
    }
  }

  /**
   * Suggest optimizations based on query plan
   */
  private suggestOptimizations(plan: any): string[] {
    const suggestions: string[] = [];
    
    // Check for sequential scans
    if (JSON.stringify(plan).includes('Seq Scan')) {
      suggestions.push('Consider adding an index to avoid sequential scan');
    }

    // Check for high cost
    if (plan['Plan']['Total Cost'] > 1000) {
      suggestions.push('Query has high cost, consider optimization');
    }

    // Check for missing indexes
    if (plan['Plan']['Filter']) {
      suggestions.push('Consider adding index for filter condition');
    }

    // Check for sorting
    if (JSON.stringify(plan).includes('Sort')) {
      suggestions.push('Consider adding index for ORDER BY clause');
    }

    return suggestions;
  }

  /**
   * Track query statistics
   */
  private trackQuery(query: string, executionTime: number): void {
    const stats = this.queryStats.get(query) || { count: 0, totalTime: 0 };
    stats.count++;
    stats.totalTime += executionTime;
    this.queryStats.set(query, stats);
  }

  /**
   * Log slow query
   */
  private logSlowQuery(query: string, executionTime: number): void {
    const slowQuery = {
      query,
      time: executionTime,
      timestamp: new Date()
    };

    this.slowQueries.push(slowQuery);
    
    // Keep only last 100 slow queries
    if (this.slowQueries.length > 100) {
      this.slowQueries.shift();
    }

    correlationLogger.warn('[QueryOptimizer] Slow query detected', {
      metadata: { query, executionTime }
    });
  }

  /**
   * Get query statistics
   */
  getStats(): QueryStats {
    let totalQueries = 0;
    let totalTime = 0;
    let optimizedQueries = 0;

    this.queryStats.forEach(stats => {
      totalQueries += stats.count;
      totalTime += stats.totalTime;
    });

    this.queryPlans.forEach(plan => {
      if (plan.optimizations.length > 0) {
        optimizedQueries++;
      }
    });

    return {
      totalQueries,
      averageTime: totalQueries > 0 ? totalTime / totalQueries : 0,
      slowQueries: this.slowQueries.slice(-10),
      cacheHitRate: 0, // Would need to track this
      optimizedQueries
    };
  }

  /**
   * Create indexes for optimization
   */
  async createIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_farms_status_created ON farms(status, created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_farm_status ON agents(farm_id, status)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_harvests_farm_created ON harvests(farm_id, created_at DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_user_date ON token_usage(user_id, created_at DESC)'
    ];

    const client = await this.pool.connect();
    try {
      for (const index of indexes) {
        await client.query(index);
        logger.info(`[QueryOptimizer] Created index: ${index.split(' ')[5]}`);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Hash query for caching
   */
  private hashQuery(query: string, params?: any[]): string {
    const crypto = require('crypto');
    const data = query + JSON.stringify(params || []);
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Start query analyzer
   */
  private startAnalyzer(): void {
    setInterval(() => {
      const stats = this.getStats();
      
      if (stats.averageTime > 100) {
        logger.warn('[QueryOptimizer] High average query time', {
          averageTime: stats.averageTime
        });
      }

      if (stats.slowQueries.length > 50) {
        logger.warn('[QueryOptimizer] Many slow queries detected', {
          count: stats.slowQueries.length
        });
      }
    }, 300000); // Every 5 minutes
  }
}

/**
 * Request Batcher for batching similar requests
 */
export class RequestBatcher<T = any> {
  private batch: Array<{
    key: string;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
  }> = [];
  private timeout?: NodeJS.Timeout;
  private processing = false;

  constructor(
    private batchProcessor: (keys: string[]) => Promise<Map<string, T>>,
    private options: {
      maxBatchSize?: number;
      batchTimeout?: number;
      deduplicate?: boolean;
    } = {}
  ) {
    this.options.maxBatchSize = options.maxBatchSize || 100;
    this.options.batchTimeout = options.batchTimeout || 10;
    this.options.deduplicate = options.deduplicate ?? true;
  }

  /**
   * Add request to batch
   */
  async add(key: string): Promise<T> {
    return new Promise((resolve, reject) => {
      // Deduplicate if enabled
      if (this.options.deduplicate) {
        const existing = this.batch.find(item => item.key === key);
        if (existing) {
          // Share the same promise
          return new Promise((res, rej) => {
            const originalResolve = existing.resolve;
            existing.resolve = (value) => {
              originalResolve(value);
              res(value);
            };
            const originalReject = existing.reject;
            existing.reject = (error) => {
              originalReject(error);
              rej(error);
            };
          });
        }
      }

      this.batch.push({ key, resolve, reject });

      // Process if batch is full
      if (this.batch.length >= this.options.maxBatchSize!) {
        this.processBatch();
      } else {
        // Schedule batch processing
        this.scheduleBatch();
      }
    });
  }

  /**
   * Schedule batch processing
   */
  private scheduleBatch(): void {
    if (this.timeout) return;

    this.timeout = setTimeout(() => {
      this.processBatch();
    }, this.options.batchTimeout);
  }

  /**
   * Process current batch
   */
  private async processBatch(): Promise<void> {
    if (this.processing || this.batch.length === 0) return;

    this.processing = true;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    const currentBatch = [...this.batch];
    this.batch = [];

    try {
      const keys = currentBatch.map(item => item.key);
      const results = await this.batchProcessor(keys);

      currentBatch.forEach(item => {
        const result = results.get(item.key);
        if (result !== undefined) {
          item.resolve(result);
        } else {
          item.reject(new Error(`No result for key: ${item.key}`));
        }
      });

    } catch (error) {
      currentBatch.forEach(item => {
        item.reject(error as Error);
      });
    } finally {
      this.processing = false;
    }
  }
}