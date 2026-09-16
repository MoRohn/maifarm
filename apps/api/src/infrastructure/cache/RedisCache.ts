import { createClient, RedisClientType, SetOptions } from 'redis';
import { Pool } from 'generic-pool';
import { logger } from '../../utils/logger';
import { circuitBreakerManager } from '../resilience/CircuitBreaker';
import { correlationLogger } from '../logging/CorrelationLogger';
import crypto from 'crypto';

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
  compress?: boolean;
  encrypt?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
  avgGetTime: number;
  avgSetTime: number;
  memoryUsage?: number;
  connectedClients?: number;
}

export interface CacheEntry<T = any> {
  value: T;
  metadata: {
    created: Date;
    accessed: Date;
    accessCount: number;
    ttl?: number;
    compressed?: boolean;
    encrypted?: boolean;
  };
}

/**
 * Redis Cache with connection pooling and advanced features
 */
export class RedisCache {
  private static instance: RedisCache;
  private pool: Pool<RedisClientType>;
  private stats: CacheStats;
  private timings: { get: number[]; set: number[] } = { get: [], set: [] };
  private readonly encryptionKey: Buffer;
  private readonly circuit;

  private constructor() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
      avgGetTime: 0,
      avgSetTime: 0
    };

    // Setup encryption key
    const key = process.env.CACHE_ENCRYPTION_KEY || 'default-cache-key-32-chars-long!!';
    this.encryptionKey = Buffer.from(key.padEnd(32, '!').slice(0, 32));

    // Setup circuit breaker
    this.circuit = circuitBreakerManager.getCircuit('redis-cache', {
      failureThreshold: 5,
      resetTimeout: 30000,
      timeout: 5000
    });

    // Create connection pool
    this.pool = this.createPool();
    
    // Start stats collector
    this.startStatsCollector();
  }

  static getInstance(): RedisCache {
    if (!RedisCache.instance) {
      RedisCache.instance = new RedisCache();
    }
    return RedisCache.instance;
  }

  /**
   * Create Redis connection pool
   */
  private createPool(): Pool<RedisClientType> {
    const factory = {
      create: async (): Promise<RedisClientType> => {
        const client = createClient({
          url: process.env.REDIS_URL || 'redis://localhost:6379',
          socket: {
            connectTimeout: 5000,
            keepAlive: 5000,
            reconnectStrategy: (retries: number) => {
              if (retries > 10) {
                logger.error('[RedisCache] Max reconnection attempts reached');
                return new Error('Max reconnection attempts');
              }
              return Math.min(retries * 100, 3000);
            }
          }
        });

        client.on('error', (err) => {
          logger.error('[RedisCache] Redis client error', err);
          this.stats.errors++;
        });

        client.on('ready', () => {
          logger.info('[RedisCache] Redis client ready');
        });

        await client.connect();
        return client as RedisClientType;
      },
      destroy: async (client: RedisClientType): Promise<void> => {
        await client.quit();
      },
      validate: async (client: RedisClientType): Promise<boolean> => {
        try {
          await client.ping();
          return true;
        } catch {
          return false;
        }
      }
    };

    return Pool.createPool(factory, {
      min: parseInt(process.env.REDIS_POOL_MIN || '2'),
      max: parseInt(process.env.REDIS_POOL_MAX || '10'),
      maxWaitingClients: 50,
      testOnBorrow: true,
      acquireTimeoutMillis: 3000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      evictionRunIntervalMillis: 60000
    });
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string, options?: CacheOptions): Promise<T | null> {
    return this.circuit.execute(async () => {
      const startTime = Date.now();
      const fullKey = this.buildKey(key, options?.prefix);

      const client = await this.pool.acquire();
      try {
        const data = await client.get(fullKey);
        
        if (!data) {
          this.stats.misses++;
          this.updateHitRate();
          return null;
        }

        // Parse cache entry
        const entry: CacheEntry<T> = JSON.parse(data);
        
        // Decrypt if needed
        let value = entry.value;
        if (entry.metadata.encrypted && options?.encrypt !== false) {
          value = this.decrypt(value as unknown as string);
        }

        // Update access metadata
        entry.metadata.accessed = new Date();
        entry.metadata.accessCount++;
        await client.set(fullKey, JSON.stringify(entry), {
          KEEPTTL: true
        });

        this.stats.hits++;
        this.updateHitRate();
        this.recordTiming('get', Date.now() - startTime);

        correlationLogger.debug(`[RedisCache] Cache hit for ${key}`, {
          metadata: { key: fullKey, accessCount: entry.metadata.accessCount }
        });

        return value;

      } finally {
        await this.pool.release(client);
      }
    });
  }

  /**
   * Set value in cache
   */
  async set<T = any>(
    key: string,
    value: T,
    options?: CacheOptions
  ): Promise<boolean> {
    return this.circuit.execute(async () => {
      const startTime = Date.now();
      const fullKey = this.buildKey(key, options?.prefix);
      const ttl = options?.ttl || 3600; // 1 hour default

      const client = await this.pool.acquire();
      try {
        // Encrypt if needed
        let processedValue = value;
        if (options?.encrypt) {
          processedValue = this.encrypt(JSON.stringify(value)) as T;
        }

        // Create cache entry
        const entry: CacheEntry<T> = {
          value: processedValue,
          metadata: {
            created: new Date(),
            accessed: new Date(),
            accessCount: 0,
            ttl,
            compressed: options?.compress,
            encrypted: options?.encrypt
          }
        };

        const setOptions: SetOptions = {
          EX: ttl
        };

        await client.set(fullKey, JSON.stringify(entry), setOptions);
        
        this.stats.sets++;
        this.recordTiming('set', Date.now() - startTime);

        correlationLogger.debug(`[RedisCache] Cached value for ${key}`, {
          metadata: { key: fullKey, ttl }
        });

        return true;

      } finally {
        await this.pool.release(client);
      }
    });
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    return this.circuit.execute(async () => {
      const fullKey = this.buildKey(key, options?.prefix);

      const client = await this.pool.acquire();
      try {
        const result = await client.del(fullKey);
        this.stats.deletes++;

        correlationLogger.debug(`[RedisCache] Deleted key ${key}`, {
          metadata: { key: fullKey, deleted: result > 0 }
        });

        return result > 0;

      } finally {
        await this.pool.release(client);
      }
    });
  }

  /**
   * Check if key exists
   */
  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    return this.circuit.execute(async () => {
      const fullKey = this.buildKey(key, options?.prefix);

      const client = await this.pool.acquire();
      try {
        const result = await client.exists(fullKey);
        return result > 0;
      } finally {
        await this.pool.release(client);
      }
    });
  }

  /**
   * Get multiple values
   */
  async mget<T = any>(keys: string[], options?: CacheOptions): Promise<(T | null)[]> {
    return this.circuit.execute(async () => {
      const fullKeys = keys.map(key => this.buildKey(key, options?.prefix));

      const client = await this.pool.acquire();
      try {
        const values = await client.mGet(fullKeys);
        
        return values.map((data, index) => {
          if (!data) {
            this.stats.misses++;
            return null;
          }

          try {
            const entry: CacheEntry<T> = JSON.parse(data);
            this.stats.hits++;
            
            let value = entry.value;
            if (entry.metadata.encrypted && options?.encrypt !== false) {
              value = this.decrypt(value as unknown as string);
            }
            
            return value;
          } catch {
            this.stats.errors++;
            return null;
          }
        });

      } finally {
        await this.pool.release(client);
        this.updateHitRate();
      }
    });
  }

  /**
   * Set multiple values
   */
  async mset<T = any>(
    items: Array<{ key: string; value: T }>,
    options?: CacheOptions
  ): Promise<boolean> {
    return this.circuit.execute(async () => {
      const client = await this.pool.acquire();
      try {
        const pipeline = client.multi();
        
        for (const item of items) {
          const fullKey = this.buildKey(item.key, options?.prefix);
          const ttl = options?.ttl || 3600;

          let processedValue = item.value;
          if (options?.encrypt) {
            processedValue = this.encrypt(JSON.stringify(item.value)) as T;
          }

          const entry: CacheEntry<T> = {
            value: processedValue,
            metadata: {
              created: new Date(),
              accessed: new Date(),
              accessCount: 0,
              ttl,
              compressed: options?.compress,
              encrypted: options?.encrypt
            }
          };

          pipeline.set(fullKey, JSON.stringify(entry), { EX: ttl });
        }

        await pipeline.exec();
        this.stats.sets += items.length;
        
        return true;

      } finally {
        await this.pool.release(client);
      }
    });
  }

  /**
   * Clear cache by pattern
   */
  async clearPattern(pattern: string): Promise<number> {
    return this.circuit.execute(async () => {
      const client = await this.pool.acquire();
      try {
        const keys = await client.keys(pattern);
        if (keys.length === 0) return 0;

        const result = await client.del(keys);
        this.stats.deletes += result;

        correlationLogger.info(`[RedisCache] Cleared ${result} keys matching ${pattern}`);
        
        return result;

      } finally {
        await this.pool.release(client);
      }
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const client = await this.pool.acquire();
    try {
      const info = await client.info('memory');
      const clients = await client.clientList();
      
      // Parse memory usage
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : undefined;

      return {
        ...this.stats,
        memoryUsage,
        connectedClients: clients.length
      };

    } catch (error) {
      logger.error('[RedisCache] Failed to get stats', error);
      return this.stats;
    } finally {
      await this.pool.release(client);
    }
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmUp(
    loader: () => Promise<Array<{ key: string; value: any }>>,
    options?: CacheOptions
  ): Promise<void> {
    try {
      const items = await loader();
      await this.mset(items, options);
      
      correlationLogger.info(`[RedisCache] Warmed up cache with ${items.length} items`);
    } catch (error) {
      logger.error('[RedisCache] Failed to warm up cache', error);
    }
  }

  /**
   * Invalidate cache entries
   */
  async invalidate(keys: string | string[], options?: CacheOptions): Promise<number> {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;

    for (const key of keyArray) {
      const result = await this.delete(key, options);
      if (result) deleted++;
    }

    return deleted;
  }

  /**
   * Build full cache key
   */
  private buildKey(key: string, prefix?: string): string {
    const parts = [
      prefix || 'maifarm',
      key
    ].filter(Boolean);
    
    return parts.join(':');
  }

  /**
   * Encrypt value
   */
  private encrypt(value: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt value
   */
  private decrypt(encrypted: string): any {
    const [ivHex, encryptedData] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Record timing
   */
  private recordTiming(operation: 'get' | 'set', duration: number): void {
    this.timings[operation].push(duration);
    
    // Keep only last 100 timings
    if (this.timings[operation].length > 100) {
      this.timings[operation].shift();
    }

    // Update average
    const avg = this.timings[operation].reduce((a, b) => a + b, 0) / this.timings[operation].length;
    
    if (operation === 'get') {
      this.stats.avgGetTime = avg;
    } else {
      this.stats.avgSetTime = avg;
    }
  }

  /**
   * Start stats collector interval
   */
  private startStatsCollector(): void {
    setInterval(async () => {
      const stats = await this.getStats();
      
      if (stats.hitRate < 0.5 && stats.hits + stats.misses > 100) {
        logger.warn('[RedisCache] Low cache hit rate', { hitRate: stats.hitRate });
      }

      if (stats.avgGetTime > 100) {
        logger.warn('[RedisCache] High average get time', { avgGetTime: stats.avgGetTime });
      }
    }, 60000); // Every minute
  }

  /**
   * Shutdown cache pool
   */
  async shutdown(): Promise<void> {
    await this.pool.drain();
    await this.pool.clear();
  }
}

// Export singleton instance
export const redisCache = RedisCache.getInstance();