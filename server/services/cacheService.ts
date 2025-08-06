import { redis } from '../database/connection';
import { EventEmitter } from 'events';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Cache key prefix
  useMemoryOnly?: boolean; // Force memory-only mode
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class CacheService extends EventEmitter {
  private inMemoryCache: Map<string, CacheEntry<any>> = new Map();
  private isRedisAvailable = false;
  private retryTimeout: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private maxRetries = 10;
  private baseRetryDelay = 1000; // 1 second
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: Date | null = null;

  constructor() {
    super();
    this.checkRedisConnection();
    this.startCleanupInterval();
    this.startHealthCheckInterval();
  }

  private async checkRedisConnection(): Promise<boolean> {
    try {
      if (!redis) {
        throw new Error('Redis client not initialized');
      }
      
      // Try to ping Redis with timeout
      const pingPromise = redis.ping();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis ping timeout')), 2000)
      );
      
      await Promise.race([pingPromise, timeoutPromise]);
      
      if (!this.isRedisAvailable) {
        console.log('[CacheService] Redis connection restored');
        this.emit('redis:connected');
      }
      
      this.isRedisAvailable = true;
      this.retryCount = 0;
      this.lastHealthCheck = new Date();
      return true;
    } catch (error) {
      if (this.isRedisAvailable) {
        console.warn('[CacheService] Redis connection lost, falling back to in-memory cache');
        this.emit('redis:disconnected');
      }
      
      this.isRedisAvailable = false;
      this.scheduleRetry();
      return false;
    }
  }

  private startHealthCheckInterval() {
    // Periodic health check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkRedisConnection();
    }, 30000);
  }

  private scheduleRetry() {
    if (this.retryCount >= this.maxRetries) {
      console.warn('[CacheService] Max Redis reconnection attempts reached, continuing with in-memory cache only');
      return;
    }

    // Clear existing retry timeout
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.retryCount) + Math.random() * 1000,
      30000 // Max 30 seconds
    );

    this.retryTimeout = setTimeout(() => {
      this.retryCount++;
      console.log(`Cache Service: Attempting Redis reconnection (${this.retryCount}/${this.maxRetries})`);
      this.checkRedisConnection();
    }, delay);
  }

  private startCleanupInterval() {
    // Clean up expired in-memory cache entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.inMemoryCache.entries()) {
        if (entry.expiresAt && entry.expiresAt < now) {
          this.inMemoryCache.delete(key);
        }
      }
    }, 60000);
  }

  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const fullKey = this.buildKey(key, options.prefix);

    // Try Redis first if available
    if (this.isRedisAvailable) {
      try {
        const value = await redis.get(fullKey);
        if (value) {
          return JSON.parse(value);
        }
      } catch (error) {
        console.error('Cache Service: Redis get error:', error);
        this.isRedisAvailable = false;
        this.scheduleRetry();
      }
    }

    // Fallback to in-memory cache
    const entry = this.inMemoryCache.get(fullKey);
    if (entry) {
      if (!entry.expiresAt || entry.expiresAt > Date.now()) {
        return entry.value;
      }
      // Clean up expired entry
      this.inMemoryCache.delete(fullKey);
    }

    return null;
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const fullKey = this.buildKey(key, options.prefix);
    const ttl = options.ttl || 3600; // Default 1 hour

    // Try Redis first if available
    if (this.isRedisAvailable) {
      try {
        await redis.setEx(fullKey, ttl, JSON.stringify(value));
        // Also store in memory as backup
        this.setInMemory(fullKey, value, ttl);
        return;
      } catch (error) {
        console.error('Cache Service: Redis set error:', error);
        this.isRedisAvailable = false;
        this.scheduleRetry();
      }
    }

    // Fallback to in-memory cache
    this.setInMemory(fullKey, value, ttl);
  }

  private setInMemory<T>(key: string, value: T, ttl: number) {
    const expiresAt = ttl > 0 ? Date.now() + (ttl * 1000) : 0;
    this.inMemoryCache.set(key, { value, expiresAt });
  }

  async delete(key: string, options: CacheOptions = {}): Promise<void> {
    const fullKey = this.buildKey(key, options.prefix);

    // Try Redis first if available
    if (this.isRedisAvailable) {
      try {
        await redis.del(fullKey);
      } catch (error) {
        console.error('Cache Service: Redis delete error:', error);
        this.isRedisAvailable = false;
        this.scheduleRetry();
      }
    }

    // Always delete from in-memory cache
    this.inMemoryCache.delete(fullKey);
  }

  async flush(prefix?: string): Promise<void> {
    if (prefix) {
      // Delete keys with specific prefix
      const pattern = this.buildKey('*', prefix);
      
      // Try Redis first if available
      if (this.isRedisAvailable) {
        try {
          const keys = await redis.keys(pattern);
          if (keys.length > 0) {
            await redis.del(keys);
          }
        } catch (error) {
          console.error('Cache Service: Redis flush error:', error);
          this.isRedisAvailable = false;
          this.scheduleRetry();
        }
      }

      // Clean in-memory cache
      for (const key of this.inMemoryCache.keys()) {
        if (key.startsWith(prefix + ':')) {
          this.inMemoryCache.delete(key);
        }
      }
    } else {
      // Flush all
      if (this.isRedisAvailable) {
        try {
          await redis.flushAll();
        } catch (error) {
          console.error('Cache Service: Redis flush all error:', error);
          this.isRedisAvailable = false;
          this.scheduleRetry();
        }
      }
      this.inMemoryCache.clear();
    }
  }

  async mget<T>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
    const fullKeys = keys.map(key => this.buildKey(key, options.prefix));
    const results: (T | null)[] = [];

    // Try Redis first if available
    if (this.isRedisAvailable) {
      try {
        const values = await redis.mGet(fullKeys);
        return values.map(value => value ? JSON.parse(value) : null);
      } catch (error) {
        console.error('Cache Service: Redis mget error:', error);
        this.isRedisAvailable = false;
        this.scheduleRetry();
      }
    }

    // Fallback to in-memory cache
    for (const fullKey of fullKeys) {
      const entry = this.inMemoryCache.get(fullKey);
      if (entry && (!entry.expiresAt || entry.expiresAt > Date.now())) {
        results.push(entry.value);
      } else {
        results.push(null);
      }
    }

    return results;
  }

  async mset<T>(items: Array<{ key: string; value: T }>, options: CacheOptions = {}): Promise<void> {
    const ttl = options.ttl || 3600;

    // Try Redis first if available
    if (this.isRedisAvailable) {
      try {
        const pipeline = redis.multi();
        for (const item of items) {
          const fullKey = this.buildKey(item.key, options.prefix);
          pipeline.setEx(fullKey, ttl, JSON.stringify(item.value));
          // Also store in memory as backup
          this.setInMemory(fullKey, item.value, ttl);
        }
        await pipeline.exec();
        return;
      } catch (error) {
        console.error('Cache Service: Redis mset error:', error);
        this.isRedisAvailable = false;
        this.scheduleRetry();
      }
    }

    // Fallback to in-memory cache
    for (const item of items) {
      const fullKey = this.buildKey(item.key, options.prefix);
      this.setInMemory(fullKey, item.value, ttl);
    }
  }

  private buildKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  getStatus(): { isRedisAvailable: boolean; inMemoryCacheSize: number; retryCount: number } {
    return {
      isRedisAvailable: this.isRedisAvailable,
      inMemoryCacheSize: this.inMemoryCache.size,
      retryCount: this.retryCount
    };
  }

  // Clean up on shutdown
  async shutdown() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Export for testing
export { CacheService };