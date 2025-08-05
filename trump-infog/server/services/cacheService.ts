import NodeCache from 'node-cache';
import { ICacheService, CacheOptions } from './types.js';

export class CacheService implements ICacheService {
  private cache: NodeCache;
  private defaultTTL: number = 3600; // 1 hour default

  constructor() {
    this.cache = new NodeCache({
      stdTTL: this.defaultTTL,
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false // For better performance
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = this.cache.get<T>(key);
      return value !== undefined ? value : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl || this.defaultTTL;
      const namespace = options?.namespace || '';
      const fullKey = namespace ? `${namespace}:${key}` : key;
      
      this.cache.set(fullKey, value, ttl);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      return this.cache.del(key) > 0;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async clear(namespace?: string): Promise<void> {
    try {
      if (namespace) {
        const keys = this.cache.keys();
        const namespaceKeys = keys.filter(key => key.startsWith(`${namespace}:`));
        this.cache.del(namespaceKeys);
      } else {
        this.cache.flushAll();
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  getStats() {
    return this.cache.getStats();
  }
}

export const cacheService = new CacheService();