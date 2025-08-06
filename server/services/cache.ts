import { redis } from '../database/connection';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  useMemoryFallback?: boolean;
}

class CacheService {
  private memoryCache: Map<string, { value: any; expiry?: number }> = new Map();
  private isRedisConnected: boolean = false;
  private readonly DEFAULT_TTL = 3600; // 1 hour default TTL

  constructor() {
    this.checkRedisConnection();
    
    // Monitor Redis connection status
    redis.on('ready', () => {
      this.isRedisConnected = true;
      console.log('[Cache] Redis connected - using Redis cache');
    });
    
    redis.on('error', (err) => {
      console.warn('[Cache] Redis error:', err.message);
      this.isRedisConnected = false;
    });
    
    redis.on('end', () => {
      this.isRedisConnected = false;
      console.log('[Cache] Redis disconnected - falling back to memory cache');
    });
    
    // Clean up expired memory cache entries periodically
    setInterval(() => this.cleanupMemoryCache(), 60000); // Every minute
  }

  private async checkRedisConnection() {
    try {
      if (redis.isReady) {
        await redis.ping();
        this.isRedisConnected = true;
      } else {
        this.isRedisConnected = false;
      }
    } catch (error) {
      this.isRedisConnected = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      // Try Redis first if connected
      if (this.isRedisConnected) {
        const value = await redis.get(key);
        if (value) {
          return JSON.parse(value) as T;
        }
      }
    } catch (error) {
      console.warn(`[Cache] Redis get error for key ${key}:`, error.message);
    }
    
    // Fallback to memory cache
    const cached = this.memoryCache.get(key);
    if (cached) {
      // Check if expired
      if (cached.expiry && cached.expiry < Date.now()) {
        this.memoryCache.delete(key);
        return null;
      }
      return cached.value as T;
    }
    
    return null;
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const ttl = options.ttl || this.DEFAULT_TTL;
    const serialized = JSON.stringify(value);
    
    try {
      // Try Redis first if connected
      if (this.isRedisConnected) {
        if (ttl > 0) {
          await redis.setEx(key, ttl, serialized);
        } else {
          await redis.set(key, serialized);
        }
      }
    } catch (error) {
      console.warn(`[Cache] Redis set error for key ${key}:`, error.message);
    }
    
    // Always set in memory cache as fallback
    const expiry = ttl > 0 ? Date.now() + (ttl * 1000) : undefined;
    this.memoryCache.set(key, { value, expiry });
  }

  async delete(key: string): Promise<void> {
    try {
      // Try Redis first if connected
      if (this.isRedisConnected) {
        await redis.del(key);
      }
    } catch (error) {
      console.warn(`[Cache] Redis delete error for key ${key}:`, error.message);
    }
    
    // Always delete from memory cache
    this.memoryCache.delete(key);
  }

  async flush(): Promise<void> {
    try {
      // Try Redis flush if connected
      if (this.isRedisConnected) {
        await redis.flushDb();
      }
    } catch (error) {
      console.warn('[Cache] Redis flush error:', error.message);
    }
    
    // Always clear memory cache
    this.memoryCache.clear();
  }

  async exists(key: string): Promise<boolean> {
    try {
      // Check Redis first if connected
      if (this.isRedisConnected) {
        const exists = await redis.exists(key);
        if (exists > 0) return true;
      }
    } catch (error) {
      console.warn(`[Cache] Redis exists error for key ${key}:`, error.message);
    }
    
    // Check memory cache
    const cached = this.memoryCache.get(key);
    if (cached) {
      // Check if expired
      if (cached.expiry && cached.expiry < Date.now()) {
        this.memoryCache.delete(key);
        return false;
      }
      return true;
    }
    
    return false;
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    const results: (T | null)[] = [];
    
    for (const key of keys) {
      const value = await this.get<T>(key);
      results.push(value);
    }
    
    return results;
  }

  async setMany<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, { ttl: entry.ttl });
    }
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      // Try Redis first if connected
      if (this.isRedisConnected) {
        return await redis.incrBy(key, amount);
      }
    } catch (error) {
      console.warn(`[Cache] Redis increment error for key ${key}:`, error.message);
    }
    
    // Fallback to memory cache
    const current = await this.get<number>(key) || 0;
    const newValue = current + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async decrement(key: string, amount: number = 1): Promise<number> {
    return this.increment(key, -amount);
  }

  isConnected(): boolean {
    return this.isRedisConnected;
  }

  getStatus(): { redis: boolean; memory: number } {
    return {
      redis: this.isRedisConnected,
      memory: this.memoryCache.size
    };
  }

  private cleanupMemoryCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, cached] of this.memoryCache.entries()) {
      if (cached.expiry && cached.expiry < now) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[Cache] Cleaned up ${cleaned} expired memory cache entries`);
    }
  }

  // Cache key generators for common patterns
  static keys = {
    farm: (id: string) => `farm:${id}`,
    farmList: (userId?: string) => userId ? `farms:user:${userId}` : 'farms:all',
    agent: (id: string) => `agent:${id}`,
    agentList: (farmId: string) => `agents:farm:${farmId}`,
    task: (id: string) => `task:${id}`,
    taskList: (farmId: string) => `tasks:farm:${farmId}`,
    metrics: (farmId: string) => `metrics:farm:${farmId}`,
    session: (sessionId: string) => `session:${sessionId}`,
    user: (userId: string) => `user:${userId}`,
    harvest: (id: string) => `harvest:${id}`,
    harvestList: (farmId: string) => `harvests:farm:${farmId}`,
    workflow: (id: string) => `workflow:${id}`,
    analytics: (type: string, period: string) => `analytics:${type}:${period}`
  };
}

// Export singleton instance
export const cacheService = new CacheService();

// Export class for testing
export { CacheService };