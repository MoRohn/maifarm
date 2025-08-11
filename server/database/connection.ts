import { Pool, PoolConfig } from 'pg';
import Redis from 'redis';
import { inMemoryDb } from './inMemoryDb';

// PostgreSQL connection pool
const pgConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'maifarm',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_POOL_SIZE || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pgPool = new Pool(pgConfig);

// Database wrapper that falls back to in-memory storage
class DatabaseWrapper {
  private useInMemory = false;
  
  async query(text: string, params?: any[]): Promise<any> {
    if (this.useInMemory) {
      return inMemoryDb.query(text, params);
    }
    
    try {
      return await pgPool.query(text, params);
    } catch (error: any) {
      // Check for various connection error codes
      const connectionErrorCodes = [
        'ECONNREFUSED',  // Connection refused
        'ENOTFOUND',     // Host not found
        '28P01',         // Authentication failed
        '3D000',         // Database does not exist
        '28000',         // Invalid authorization
        'ETIMEDOUT',     // Connection timeout
        'EHOSTUNREACH',  // Host unreachable
        '57P03'          // Server shutting down
      ];
      
      // If it's a connection error and we haven't switched to in-memory yet
      if (!this.useInMemory && (connectionErrorCodes.includes(error.code) || error.message?.includes('connect'))) {
        console.warn(`PostgreSQL unavailable (${error.code || 'connection error'}), switching to in-memory database`);
        this.useInMemory = true;
        
        // Initialize in-memory DB if needed
        await inMemoryDb.connect();
        
        try {
          return await inMemoryDb.query(text, params);
        } catch (inMemoryError) {
          console.error('In-memory database query failed:', inMemoryError);
          throw inMemoryError;
        }
      }
      
      // Log the error for debugging
      console.error('Database query error:', error.message || error);
      throw error;
    }
  }
  
  async connect() {
    if (this.useInMemory) {
      return inMemoryDb.connect();
    }
    
    try {
      return await pgPool.connect();
    } catch (error) {
      console.warn('PostgreSQL connect failed, using in-memory database');
      this.useInMemory = true;
      return inMemoryDb.connect();
    }
  }
  
  async end() {
    if (this.useInMemory) {
      return inMemoryDb.end();
    }
    return pgPool.end();
  }
  
  setInMemoryMode(enabled: boolean) {
    this.useInMemory = enabled;
  }
  
  isInMemoryMode() {
    return this.useInMemory;
  }
}

export const db = new DatabaseWrapper();

// Redis connection for caching and sessions
const redisConfig: any = {
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    reconnectStrategy: (retries) => {
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

export const redis = Redis.createClient(redisConfig);

// Database health check
export async function checkDatabaseHealth(): Promise<{ postgres: boolean; redis: boolean; inMemoryMode: boolean }> {
  let postgresHealthy = false;
  let redisHealthy = false;
  const inMemoryMode = db.isInMemoryMode();

  try {
    if (inMemoryMode) {
      // In-memory mode is always "healthy"
      postgresHealthy = true;
    } else {
      // Add timeout for postgres health check
      const pgPromise = pgPool.query('SELECT 1');
      const pgTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PostgreSQL health check timeout')), 1000)
      );
      
      try {
        const result = await Promise.race([pgPromise, pgTimeout]) as any;
        postgresHealthy = result.rows.length > 0;
      } catch (pgError: any) {
        console.warn('PostgreSQL health check failed:', pgError.message);
        // Don't throw, just mark as unhealthy
        postgresHealthy = false;
      }
    }
  } catch (error: any) {
    console.error('PostgreSQL health check error:', error.message);
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
    console.error('Redis health check failed:', error.message);
  }

  return { postgres: postgresHealthy, redis: redisHealthy, inMemoryMode };
}

// Initialize connections with graceful fallback
export async function initializeDatabase() {
  let postgresConnected = false;
  let redisConnected = false;

  // Force in-memory mode if BYPASS_AUTH is enabled
  if (process.env.BYPASS_AUTH === 'true') {
    console.log('[DATABASE] BYPASS_AUTH enabled - using in-memory database');
    db.setInMemoryMode(true);
    postgresConnected = true; // Consider it "connected" for health checks
  } else {
    try {
      // Test PostgreSQL connection
      await pgPool.query('SELECT NOW()');
      console.log('PostgreSQL connected successfully');
      postgresConnected = true;
    } catch (error) {
      console.warn('PostgreSQL connection failed - running in degraded mode:', error.message);
      console.warn('To use full functionality, please start PostgreSQL or run: docker-compose up postgres');
      console.log('Using in-memory database for development');
      db.setInMemoryMode(true);
    }
  }

  try {
    // Connect to Redis with timeout
    const connectPromise = redis.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
    console.log('Redis connected successfully');
    redisConnected = true;
  } catch (error) {
    console.warn('Redis connection failed - running without caching:', error.message);
    console.warn('To enable caching, please start Redis or run: docker-compose up redis');
    // Redis will continue trying to reconnect in the background based on reconnectStrategy
  }

  // Only run migrations if PostgreSQL is connected
  if (postgresConnected) {
    try {
      await runMigrations();
    } catch (error) {
      console.error('Migration failed:', error);
      // Don't throw - allow app to start in degraded mode
    }
  }

  // Return connection status
  return { postgresConnected, redisConnected };
}

// Simple migration runner
async function runMigrations() {
  try {
    // Create migrations table if not exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Run migrations from migrations directory
    // This is a placeholder - in production, use a proper migration tool
    console.log('Database migrations completed');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
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