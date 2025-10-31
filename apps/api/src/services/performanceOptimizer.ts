/**
 * Performance Optimizer for Production
 * Implements caching, batching, and resource optimization strategies
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { redis } from './redis';
import { LRUCache } from 'lru-cache';
import * as os from 'os';

export interface CacheConfig {
  ttl?: number;          // Time to live in ms
  maxSize?: number;      // Maximum cache entries
  updateOnHit?: boolean; // Refresh TTL on cache hit
}

export interface BatchConfig {
  maxSize: number;      // Maximum batch size
  maxWait: number;      // Maximum wait time in ms
  processor: (items: any[]) => Promise<void>;
}

/**
 * High-performance cache with multiple storage tiers
 */
export class TieredCache {
  private memoryCache: LRUCache<string, any>;
  private redisEnabled: boolean = false;

  constructor(private config: CacheConfig = {}) {
    this.config = {
      ttl: 60000,        // 1 minute default
      maxSize: 1000,     // 1000 items default
      updateOnHit: true,
      ...config
    };

    // Initialize memory cache
    this.memoryCache = new LRUCache({
      max: this.config.maxSize!,
      ttl: this.config.ttl!,
      updateAgeOnGet: this.config.updateOnHit!
    });

    // Check Redis availability
    this.checkRedisAvailability();
  }

  /**
   * Check if Redis is available
   */
  private async checkRedisAvailability(): Promise<void> {
    try {
      const client = await redis.getClient();
      await client.ping();
      this.redisEnabled = true;
      logger.info(LogCategory.PERFORMANCE, 'Redis cache tier enabled');
    } catch (error) {
      this.redisEnabled = false;
      logger.warn(LogCategory.PERFORMANCE, 'Redis unavailable, using memory cache only');
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    // Check memory cache first
    const memValue = this.memoryCache.get(key);
    if (memValue !== undefined) {
      return memValue;
    }

    // Check Redis if available
    if (this.redisEnabled) {
      try {
        const client = await redis.getClient();
        const redisValue = await client.get(key);
        if (redisValue) {
          const parsed = JSON.parse(redisValue);
          // Promote to memory cache
          this.memoryCache.set(key, parsed);
          return parsed;
        }
      } catch (error) {
        logger.error(LogCategory.PERFORMANCE, 'Redis cache get error:', error);
      }
    }

    return undefined;
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const effectiveTtl = ttl || this.config.ttl!;

    // Set in memory cache
    this.memoryCache.set(key, value);

    // Set in Redis if available
    if (this.redisEnabled) {
      try {
        const client = await redis.getClient();
        await client.setEx(key, Math.floor(effectiveTtl / 1000), JSON.stringify(value));
      } catch (error) {
        logger.error(LogCategory.PERFORMANCE, 'Redis cache set error:', error);
      }
    }
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);

    if (this.redisEnabled) {
      try {
        const client = await redis.getClient();
        await client.del(key);
      } catch (error) {
        logger.error(LogCategory.PERFORMANCE, 'Redis cache delete error:', error);
      }
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();

    if (this.redisEnabled) {
      try {
        const client = await redis.getClient();
        await client.flushdb();
      } catch (error) {
        logger.error(LogCategory.PERFORMANCE, 'Redis cache clear error:', error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      memoryCache: {
        size: this.memoryCache.size,
        maxSize: this.config.maxSize
      },
      redisEnabled: this.redisEnabled
    };
  }
}

/**
 * Batch processor for reducing database/API calls
 */
export class BatchProcessor<T> extends EventEmitter {
  private batch: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private config: BatchConfig) {
    super();
  }

  /**
   * Add item to batch
   */
  add(item: T): void {
    this.batch.push(item);

    // Process if batch is full
    if (this.batch.length >= this.config.maxSize) {
      this.flush();
      return;
    }

    // Set timer if not already set
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
      }, this.config.maxWait);
    }
  }

  /**
   * Add multiple items to batch
   */
  addMany(items: T[]): void {
    for (const item of items) {
      this.add(item);
    }
  }

  /**
   * Flush the batch
   */
  async flush(): Promise<void> {
    if (this.processing || this.batch.length === 0) {
      return;
    }

    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Get current batch and reset
    const currentBatch = [...this.batch];
    this.batch = [];

    // Process batch
    this.processing = true;
    try {
      await this.config.processor(currentBatch);
      this.emit('batch-processed', {
        size: currentBatch.length,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error(LogCategory.PERFORMANCE, 'Batch processing error:', error);
      this.emit('batch-error', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get current batch size
   */
  getSize(): number {
    return this.batch.length;
  }

  /**
   * Clear the batch
   */
  clear(): void {
    this.batch = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Resource pool for connection management
 */
export class ResourcePool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private waiting: Array<(resource: T) => void> = [];
  private createResource: () => Promise<T>;
  private destroyResource: (resource: T) => Promise<void>;

  constructor(
    private config: {
      min: number;
      max: number;
      acquireTimeout?: number;
      idleTimeout?: number;
      create: () => Promise<T>;
      destroy: (resource: T) => Promise<void>;
      validate?: (resource: T) => Promise<boolean>;
    }
  ) {
    this.createResource = config.create;
    this.destroyResource = config.destroy;

    // Initialize minimum pool
    this.initialize();
  }

  /**
   * Initialize the pool with minimum resources
   */
  private async initialize(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < this.config.min; i++) {
      promises.push(this.addResource());
    }

    await Promise.all(promises);
    logger.info(LogCategory.PERFORMANCE,
      `Resource pool initialized with ${this.config.min} resources`);
  }

  /**
   * Add a new resource to the pool
   */
  private async addResource(): Promise<void> {
    try {
      const resource = await this.createResource();
      this.available.push(resource);
    } catch (error) {
      logger.error(LogCategory.PERFORMANCE, 'Failed to create resource:', error);
    }
  }

  /**
   * Acquire a resource from the pool
   */
  async acquire(): Promise<T> {
    // Return available resource if exists
    if (this.available.length > 0) {
      const resource = this.available.pop()!;

      // Validate resource if validator provided
      if (this.config.validate) {
        const isValid = await this.config.validate(resource);
        if (!isValid) {
          await this.destroyResource(resource);
          return this.acquire(); // Retry with new resource
        }
      }

      this.inUse.add(resource);
      return resource;
    }

    // Create new resource if under max limit
    if (this.available.length + this.inUse.size < this.config.max) {
      const resource = await this.createResource();
      this.inUse.add(resource);
      return resource;
    }

    // Wait for resource to become available
    return new Promise((resolve, reject) => {
      const timeout = this.config.acquireTimeout || 30000;

      const timer = setTimeout(() => {
        const index = this.waiting.indexOf(resolve);
        if (index > -1) {
          this.waiting.splice(index, 1);
        }
        reject(new Error('Resource acquisition timeout'));
      }, timeout);

      this.waiting.push((resource) => {
        clearTimeout(timer);
        resolve(resource);
      });
    });
  }

  /**
   * Release a resource back to the pool
   */
  async release(resource: T): Promise<void> {
    this.inUse.delete(resource);

    // Give to waiting request if any
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      this.inUse.add(resource);
      resolve(resource);
      return;
    }

    // Return to available pool
    this.available.push(resource);

    // Destroy excess resources
    if (this.available.length > this.config.min) {
      const excess = this.available.pop()!;
      await this.destroyResource(excess);
    }
  }

  /**
   * Destroy a resource
   */
  async destroy(resource: T): Promise<void> {
    this.inUse.delete(resource);
    const index = this.available.indexOf(resource);
    if (index > -1) {
      this.available.splice(index, 1);
    }

    await this.destroyResource(resource);

    // Create replacement if below minimum
    if (this.available.length + this.inUse.size < this.config.min) {
      await this.addResource();
    }
  }

  /**
   * Drain the pool
   */
  async drain(): Promise<void> {
    // Wait for all in-use resources to be released
    while (this.inUse.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Destroy all resources
    const destroyPromises = this.available.map(resource =>
      this.destroyResource(resource)
    );

    await Promise.all(destroyPromises);
    this.available = [];

    logger.info(LogCategory.PERFORMANCE, 'Resource pool drained');
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      waiting: this.waiting.length,
      total: this.available.length + this.inUse.size
    };
  }
}

/**
 * Memory manager for preventing OOM errors
 */
export class MemoryManager extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;
  private gcForced = false;

  constructor(
    private config: {
      maxHeapUsage?: number;  // Max heap usage in bytes
      checkInterval?: number;  // Check interval in ms
      gcThreshold?: number;    // Force GC threshold percentage
    } = {}
  ) {
    super();

    this.config = {
      maxHeapUsage: os.totalmem() * 0.75,  // 75% of system memory
      checkInterval: 30000,                 // 30 seconds
      gcThreshold: 80,                      // 80% threshold
      ...config
    };

    this.startMonitoring();
  }

  /**
   * Start memory monitoring
   */
  private startMonitoring(): void {
    this.checkInterval = setInterval(() => {
      this.checkMemory();
    }, this.config.checkInterval!);

    logger.info(LogCategory.PERFORMANCE, 'Memory monitoring started');
  }

  /**
   * Check memory usage
   */
  private checkMemory(): void {
    const usage = process.memoryUsage();
    const heapPercentage = (usage.heapUsed / usage.heapTotal) * 100;

    // Emit memory stats
    this.emit('memory-stats', {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      heapPercentage,
      rss: usage.rss,
      external: usage.external
    });

    // Check if we need to force GC
    if (heapPercentage > this.config.gcThreshold! && !this.gcForced) {
      this.forceGarbageCollection();
    }

    // Check if heap usage exceeds maximum
    if (usage.heapUsed > this.config.maxHeapUsage!) {
      logger.error(LogCategory.PERFORMANCE,
        `Heap usage (${usage.heapUsed}) exceeds maximum (${this.config.maxHeapUsage})`);
      this.emit('memory-critical', usage);
    }
  }

  /**
   * Force garbage collection
   */
  private forceGarbageCollection(): void {
    if (!global.gc) {
      logger.warn(LogCategory.PERFORMANCE,
        'Garbage collection not exposed. Run with --expose-gc flag');
      return;
    }

    this.gcForced = true;
    const before = process.memoryUsage().heapUsed;

    global.gc();

    const after = process.memoryUsage().heapUsed;
    const freed = before - after;

    logger.info(LogCategory.PERFORMANCE,
      `Forced GC freed ${freed} bytes (${(freed / 1024 / 1024).toFixed(2)} MB)`);

    this.emit('gc-completed', { before, after, freed });

    // Reset flag after 5 minutes
    setTimeout(() => {
      this.gcForced = false;
    }, 300000);
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const usage = process.memoryUsage();
    const system = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    };

    return {
      process: {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        heapPercentage: (usage.heapUsed / usage.heapTotal) * 100,
        rss: usage.rss,
        external: usage.external
      },
      system,
      limits: {
        maxHeap: this.config.maxHeapUsage,
        gcThreshold: this.config.gcThreshold
      }
    };
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info(LogCategory.PERFORMANCE, 'Memory monitoring stopped');
  }
}

/**
 * Performance Optimizer singleton
 */
export class PerformanceOptimizer {
  private static instance: PerformanceOptimizer;
  private caches: Map<string, TieredCache> = new Map();
  private batchers: Map<string, BatchProcessor<any>> = new Map();
  private pools: Map<string, ResourcePool<any>> = new Map();
  private memoryManager: MemoryManager;

  private constructor() {
    this.memoryManager = new MemoryManager();

    // Monitor memory events
    this.memoryManager.on('memory-critical', (stats) => {
      logger.error(LogCategory.PERFORMANCE, 'CRITICAL: Memory usage critical', stats);
      // Could trigger emergency cleanup here
    });
  }

  static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }

  /**
   * Get or create a cache
   */
  getCache(name: string, config?: CacheConfig): TieredCache {
    if (!this.caches.has(name)) {
      this.caches.set(name, new TieredCache(config));
    }
    return this.caches.get(name)!;
  }

  /**
   * Get or create a batch processor
   */
  getBatcher<T>(name: string, config: BatchConfig): BatchProcessor<T> {
    if (!this.batchers.has(name)) {
      this.batchers.set(name, new BatchProcessor<T>(config));
    }
    return this.batchers.get(name)! as BatchProcessor<T>;
  }

  /**
   * Get or create a resource pool
   */
  getPool<T>(name: string, config: any): ResourcePool<T> {
    if (!this.pools.has(name)) {
      this.pools.set(name, new ResourcePool<T>(config));
    }
    return this.pools.get(name)! as ResourcePool<T>;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const cacheStats: Record<string, any> = {};
    this.caches.forEach((cache, name) => {
      cacheStats[name] = cache.getStats();
    });

    const poolStats: Record<string, any> = {};
    this.pools.forEach((pool, name) => {
      poolStats[name] = pool.getStats();
    });

    return {
      memory: this.memoryManager.getStats(),
      caches: cacheStats,
      pools: poolStats,
      batchers: this.batchers.size
    };
  }

  /**
   * Clear all caches
   */
  async clearAllCaches(): Promise<void> {
    const promises: Promise<void>[] = [];

    this.caches.forEach(cache => {
      promises.push(cache.clear());
    });

    await Promise.all(promises);
    logger.info(LogCategory.PERFORMANCE, 'All caches cleared');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Stop memory monitoring
    this.memoryManager.stop();

    // Clear all caches
    await this.clearAllCaches();

    // Drain all pools
    const drainPromises: Promise<void>[] = [];
    this.pools.forEach(pool => {
      drainPromises.push(pool.drain());
    });
    await Promise.all(drainPromises);

    // Clear batchers
    this.batchers.forEach(batcher => batcher.clear());

    logger.info(LogCategory.PERFORMANCE, 'Performance optimizer cleaned up');
  }
}

export const performanceOptimizer = PerformanceOptimizer.getInstance();