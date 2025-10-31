/**
 * CacheManager - Intelligent caching layer for performance optimization
 *
 * Features:
 * - LRU (Least Recently Used) cache implementation
 * - TTL (Time To Live) support
 * - Size-based eviction
 * - Memory pressure awareness
 * - Statistics tracking
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../../utils/logger';

interface CacheEntry<T> {
  value: T;
  size: number;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  ttl?: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  itemCount: number;
}

export class LRUCache<K, V> extends EventEmitter {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private readonly maxSize: number;
  private readonly maxItems: number;
  private currentSize: number = 0;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    itemCount: 0
  };

  constructor(maxItems: number = 1000, maxSizeMB: number = 100) {
    super();
    this.maxItems = maxItems;
    this.maxSize = maxSizeMB * 1024 * 1024; // Convert MB to bytes
  }

  /**
   * Get a value from cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    if (entry.ttl && Date.now() > entry.createdAt + entry.ttl) {
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access info (move to end for LRU)
    this.cache.delete(key);
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: K, value: V, ttl?: number): void {
    // Calculate size (rough estimate)
    const size = this.estimateSize(value);

    // Check if we need to evict
    while (this.cache.size >= this.maxItems || this.currentSize + size > this.maxSize) {
      this.evictOldest();
    }

    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Add new entry
    const entry: CacheEntry<V> = {
      value,
      size,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      ttl
    };

    this.cache.set(key, entry);
    this.currentSize += size;
    this.stats.itemCount = this.cache.size;
    this.stats.size = this.currentSize;

    this.emit('cache:set', { key, size });
  }

  /**
   * Delete a value from cache
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.currentSize -= entry.size;
    this.stats.itemCount = this.cache.size;
    this.stats.size = this.currentSize;

    this.emit('cache:delete', { key });
    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    this.stats.itemCount = 0;
    this.stats.size = 0;
    this.emit('cache:clear');
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (entry.ttl && Date.now() > entry.createdAt + entry.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Private helper methods
   */

  private evictOldest(): void {
    // LRU: First item is oldest (least recently used)
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.delete(firstKey);
      this.stats.evictions++;
      this.emit('cache:evict', { key: firstKey });
    }
  }

  private estimateSize(value: V): number {
    // Rough estimation of object size in bytes
    if (typeof value === 'string') {
      return value.length * 2; // Unicode characters
    } else if (typeof value === 'number') {
      return 8;
    } else if (typeof value === 'boolean') {
      return 4;
    } else if (value instanceof Buffer) {
      return value.length;
    } else if (typeof value === 'object' && value !== null) {
      // Rough estimate for objects
      try {
        return JSON.stringify(value).length * 2;
      } catch {
        return 1024; // Default size for non-serializable objects
      }
    }
    return 256; // Default size
  }
}

/**
 * Global cache manager for different cache types
 */
export class CacheManager {
  private static instance: CacheManager;
  private caches: Map<string, LRUCache<any, any>> = new Map();

  private constructor() {
    this.initialize();
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  private initialize(): void {
    // Create default caches
    this.createCache('terminal', 100, 50); // 100 items, 50MB
    this.createCache('farms', 1000, 20); // 1000 items, 20MB
    this.createCache('agents', 5000, 10); // 5000 items, 10MB
    this.createCache('metrics', 10000, 30); // 10000 items, 30MB

    logger.info(LogCategory.SYSTEM, 'CacheManager initialized');
  }

  /**
   * Create a new cache
   */
  createCache(name: string, maxItems: number, maxSizeMB: number): LRUCache<any, any> {
    const cache = new LRUCache(maxItems, maxSizeMB);
    this.caches.set(name, cache);

    // Log cache events
    cache.on('cache:evict', ({ key }) => {
      logger.debug(LogCategory.SYSTEM, `Cache ${name} evicted key: ${key}`);
    });

    return cache;
  }

  /**
   * Get a cache by name
   */
  getCache(name: string): LRUCache<any, any> | undefined {
    return this.caches.get(name);
  }

  /**
   * Get all cache statistics
   */
  getAllStats(): Map<string, CacheStats> {
    const stats = new Map<string, CacheStats>();
    for (const [name, cache] of this.caches) {
      stats.set(name, cache.getStats());
    }
    return stats;
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    logger.info(LogCategory.SYSTEM, 'All caches cleared');
  }

  /**
   * Get total memory usage
   */
  getTotalMemoryUsage(): number {
    let total = 0;
    for (const cache of this.caches.values()) {
      total += cache.getStats().size;
    }
    return total;
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();