import { Pool, PoolConfig } from 'pg';
import { createClient } from 'redis';
import { logger } from '../config/logging';
import { poolManager } from './poolManager';

// PostgreSQL connection pool with dynamic sizing for PM2 clusters
const calculatePoolSize = (): number => {
  // Get PM2 instance count (if running in cluster mode)
  const instances = parseInt(process.env.PM2_INSTANCES || process.env.NODE_APP_INSTANCE || '1');
  const requestedSize = parseInt(process.env.DB_POOL_SIZE || '50');

  // Reserve 20 connections for admin/migrations, distribute remainder across instances
  const maxPostgresConnections = parseInt(process.env.DB_MAX_CONNECTIONS || '100');
  const availableConnections = maxPostgresConnections - 20;
  const perInstanceMax = Math.floor(availableConnections / instances);

  // Use the smaller of requested size or per-instance maximum
  return Math.min(requestedSize, perInstanceMax);
};

const pgConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'maifarm',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: calculatePoolSize(), // Dynamic sizing for cluster mode
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Increased from 2s to 5s for better stability
  // Increased statement timeout to prevent harvest query timeouts
  statement_timeout: 60000, // 60 seconds max per query (was 30s)
  // Add query timeout for better resource management
  query_timeout: 60000, // Match statement timeout
  // Allow queueing when pool is full
  allowExitOnIdle: false,
};

const pgPool = new Pool(pgConfig);

// Enhanced Database wrapper with advanced pooling and monitoring
class DatabaseWrapper {
  private connectionRetries = 0;
  private maxRetries = 5;
  private retryDelay = 1000; // Start with 1 second
  private isConnected = false;

  async query(text: string, params?: any[]): Promise<any> {
    // Use the advanced pool manager for all queries
    try {
      const result = await poolManager.query(text, params);
      this.isConnected = true;
      this.connectionRetries = 0;
      return result;
    } catch (error: any) {
      const errorMessage = this.normalizeError(error);

      // Check if this is a connection error
      if (this.isConnectionError(error, errorMessage)) {
        logger.error('DATABASE', `Connection lost, attempting to reconnect...`);
        this.isConnected = false;

        // Retry with exponential backoff
        if (this.connectionRetries < this.maxRetries) {
          this.connectionRetries++;
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
          this.retryDelay = Math.min(this.retryDelay * 2, 30000);
          return this.query(text, params); // Recursive retry
        }
      }

      // Check if this is an expected "already exists" or similar warning
      if (this.matchesPatterns(errorMessage, [
        'already exists',
        'does not exist',
        'duplicate key value'
      ])) {
        // Log as info instead of error for these expected cases
        logger.info('DATABASE', `Skipping: ${errorMessage}`);
      } else {
        // Log actual errors including normalized context
        logger.error('DATABASE', `Query failed: ${errorMessage}`);
      }

      throw error;
    }
  }

  private normalizeError(error: unknown): string {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (typeof (error as any)?.message === 'string') return (error as any).message;

    if (Array.isArray(error)) {
      return error.map(item => this.normalizeError(item)).join('; ');
    }

    if (typeof error === 'object') {
      const aggregateErrors = (error as any)?.errors;
      if (Array.isArray(aggregateErrors)) {
        return aggregateErrors.map((err: unknown) => this.normalizeError(err)).join('; ');
      }
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }

    return String(error);
  }

  private matchesPatterns(value: string, patterns: string[]): boolean {
    return patterns.some(pattern => value.includes(pattern));
  }

  private isConnectionError(error: unknown, normalized: string): boolean {
    const connectionPatterns = [
      'ECONNREFUSED',
      'Connection terminated',
      'Connection lost',
      'ECONNRESET',
      'EPERM'
    ];

    if (this.matchesPatterns(normalized, connectionPatterns)) {
      return true;
    }

    if (!error || typeof error !== 'object') {
      return false;
    }

    const aggregateErrors = (error as any)?.errors;
    if (Array.isArray(aggregateErrors)) {
      return aggregateErrors.some((innerError: unknown) =>
        this.isConnectionError(innerError, this.normalizeError(innerError))
      );
    }

    const nestedMessage = typeof (error as any)?.message === 'string'
      ? (error as any).message
      : undefined;

    if (nestedMessage) {
      return this.matchesPatterns(nestedMessage, connectionPatterns);
    }

    return false;
  }

  // Use poolManager's transaction method
  async transaction(callback: (client: any) => Promise<any>): Promise<any> {
    return poolManager.transaction(callback);
  }

  // Get pool statistics
  getPoolStats() {
    return poolManager.getStats();
  }

  // Get slow queries
  getSlowQueries(threshold?: number) {
    return poolManager.getSlowQueries(threshold);
  }
  
  async ensureConnection(): Promise<void> {
    while (this.connectionRetries < this.maxRetries) {
      try {
        // Test the connection using pool manager
        const health = await poolManager.checkHealth();
        if (health.healthy) {
          this.isConnected = true;
          this.connectionRetries = 0; // Reset on success
          this.retryDelay = 1000; // Reset delay
          return;
        }
        throw new Error('Database health check failed');
      } catch (error) {
        this.connectionRetries++;
        const nextDelay = Math.min(this.retryDelay * 2, 30000); // Max 30 seconds
        
        logger.warn('DATABASE', 
          `Connection attempt ${this.connectionRetries}/${this.maxRetries} failed. ` +
          `Retrying in ${nextDelay/1000}s...`);
        
        if (this.connectionRetries >= this.maxRetries) {
          logger.error('DATABASE', 'Maximum connection retries exceeded');
          throw new Error('Database connection failed after maximum retries');
        }
        
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        this.retryDelay = nextDelay;
      }
    }
  }
  
  async connect() {
    try {
      const client = await pgPool.connect();
      this.isConnected = true;
      return client;
    } catch (error) {
      logger.error('DATABASE', 'PostgreSQL connect failed:', error);
      this.isConnected = false;
      throw error;
    }
  }
  
  async end() {
    this.isConnected = false;
    return pgPool.end();
  }
  
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      poolSize: pgPool.totalCount,
      idleConnections: pgPool.idleCount,
      waitingClients: pgPool.waitingCount
    };
  }
}

export const db = new DatabaseWrapper();

// Redis connection for caching and sessions
const redisConfig: any = {
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    reconnectStrategy: (retries: number): number | false => {
      if (retries > 10) {
        console.log('Redis: Maximum reconnection attempts reached, running without cache');
        // Return false to stop reconnecting and allow fallback to memory cache
        return false;
      }
      // Exponential backoff with max delay of 3 seconds
      const delay = Math.min(retries * 100, 3000);
      console.log(`Redis: Reconnection attempt ${retries}, retrying in ${delay}ms`);
      return delay;
    },
    connectTimeout: 5000,
    commandTimeout: 5000
  },
  // Disable offline queue to prevent hanging when Redis is down
  enableOfflineQueue: false,
  // Return errors instead of throwing when Redis is down
  lazyConnect: true
};

// Add password if configured
if (process.env.REDIS_PASSWORD) {
  redisConfig.password = process.env.REDIS_PASSWORD;
}

// Add database selection if configured
if (process.env.REDIS_DB) {
  redisConfig.database = parseInt(process.env.REDIS_DB);
}

// Use REDIS_URL if provided (takes precedence)
if (process.env.REDIS_URL) {
  redisConfig.url = process.env.REDIS_URL;
  // Remove socket config if URL is provided
  delete redisConfig.socket;
}

// Create separate Redis clients for different purposes
// Regular client for general commands
export const redis = createClient(redisConfig);

// Dedicated pub/sub clients (to avoid context conflicts)
export const redisPub = createClient(redisConfig);
export const redisSub = createClient(redisConfig);

// Database health check
export async function checkDatabaseHealth(): Promise<{ postgres: boolean; redis: boolean; connectionStatus: any }> {
  let postgresHealthy = false;
  let redisHealthy = false;

  try {
    // Add timeout for postgres health check
    const pgPromise = pgPool.query('SELECT 1');
    const pgTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('PostgreSQL health check timeout')), 1000)
    );
    
    try {
      const result = await Promise.race([pgPromise, pgTimeout]) as any;
      postgresHealthy = result.rows.length > 0;
    } catch (pgError: any) {
      logger.warn('DATABASE', 'PostgreSQL health check failed:', pgError.message);
      // Don't throw, just mark as unhealthy
      postgresHealthy = false;
    }
  } catch (error: any) {
    logger.error('DATABASE', 'PostgreSQL health check error:', error.message);
    postgresHealthy = false;
  }

  try {
    // Add timeout for redis health check
    if (redis.isReady) {
      const redisPromise = redis.ping();
      const redisTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis health check timeout')), 1000)
      );
      
      try {
        await Promise.race([redisPromise, redisTimeout]);
        redisHealthy = true;
      } catch (redisError: any) {
        console.warn('Redis health check failed:', redisError.message);
        redisHealthy = false;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Redis health check failed:', errorMessage);
  }

  return { 
    postgres: postgresHealthy, 
    redis: redisHealthy, 
    connectionStatus: db.getConnectionStatus()
  };
}

// Initialize connections with proper error handling
export async function initializeDatabase() {
  let postgresConnected = false;
  let redisConnected = false;

  // Always require PostgreSQL connection
  try {
    // Ensure connection with retry logic
    await db.ensureConnection();
    
    // Test PostgreSQL connection
    await pgPool.query('SELECT NOW()');
    logger.info('DATABASE', '✅ PostgreSQL connected successfully');
    postgresConnected = true;
  } catch (error: any) {
    logger.error('DATABASE', '❌ PostgreSQL connection failed:', error.message);
    
    // Provide helpful error messages
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n⚠️  PostgreSQL is not running. Please start it with one of:');
      console.error('   - npm run setup:postgres (automated setup)');
      console.error('   - brew services start postgresql@15 (macOS)');
      console.error('   - docker-compose up postgres (Docker)');
      console.error('   - sudo systemctl start postgresql (Linux)\n');
    } else if (error.message.includes('password authentication failed')) {
      console.error('\n⚠️  PostgreSQL authentication failed. Check your .env.development file:');
      console.error('   DB_USER=maifarm');
      console.error('   DB_PASSWORD=maifarm123');
      console.error('   DB_NAME=maifarm_dev\n');
    }
    
    // Don't continue without database
    throw new Error('Cannot start server without PostgreSQL connection');
  }

  try {
    // Connect all Redis clients
    const redisClients = [
      { client: redis, name: 'Main' },
      { client: redisPub, name: 'Publisher' },
      { client: redisSub, name: 'Subscriber' }
    ];

    for (const { client, name } of redisClients) {
      try {
        // Attempt connection without checking state first to avoid race condition
        // If already connected, Redis will throw "Socket already opened" error which we catch below
        if (!client.isOpen) {
          const connectPromise = client.connect();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Redis ${name} connection timeout`)), 5000)
          );

          await Promise.race([connectPromise, timeoutPromise]);
          console.log(`Redis ${name} connected successfully`);
        } else {
          console.log(`Redis ${name} already connected, skipping reconnection`);
        }
      } catch (connError: any) {
        // Handle "already connected" error gracefully
        if (connError.message && connError.message.includes('Socket already opened')) {
          console.log(`Redis ${name} already connected (detected via error)`);
        } else {
          // Propagate other errors to outer catch block
          throw connError;
        }
      }
    }
    redisConnected = true;
  } catch (error) {
    // Check if error is about existing connection
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Socket already opened')) {
      console.log('Redis socket already opened, treating as connected');
      redisConnected = true;
    } else {
      console.warn('Redis connection failed - running without caching:', errorMessage);
      console.warn('To enable caching, please start Redis or run: docker-compose up redis');
      // Redis will continue trying to reconnect in the background based on reconnectStrategy
    }
  }

  // Only run migrations if PostgreSQL is connected
  if (postgresConnected) {
    try {
      // Use the unified migration system
      logger.info('DATABASE', '🚀 Running database migrations...');
      
      const { UnifiedMigrationRunner } = await import('./unifiedMigrationRunner');
      const migrationRunner = new UnifiedMigrationRunner(pgPool);
      
      // Get status before running
      const statusBefore = await migrationRunner.getStatus();
      logger.info('DATABASE', 
        `Migration status: ${statusBefore.applied}/${statusBefore.total} applied, ` +
        `${statusBefore.pending} pending`);
      
      // Run migrations
      const result = await migrationRunner.runMigrations();
      
      // Log results
      if (result.success) {
        logger.info('DATABASE', 
          `✅ Migrations complete: ${result.applied.length} new migrations applied`);
      } else {
        logger.warn('DATABASE', 
          `⚠️  Migrations completed with errors: ${result.failed.length} failed`);
        
        // Log specific failures
        for (const [version, error] of result.errors) {
          logger.error('DATABASE', `  Migration ${version} failed: ${error}`);
        }
      }
      
    } catch (error: any) {
      logger.error('DATABASE', 'Migration system failed:', error.message);
      
      // Still try to continue if migrations fail (tables might already exist)
      logger.warn('DATABASE', 'Continuing with existing database schema...');
    }
  }

  // Return connection status
  return { postgresConnected, redisConnected };
}


// Graceful shutdown
export async function closeDatabaseConnections() {
  try {
    await db.end();
    // Only try to quit Redis if it's connected
    if (redis.isOpen) {
      await redis.quit();
    }
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error closing database connections:', error);
  }
}
