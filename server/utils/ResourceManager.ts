/**
 * Resource Manager - Prevents memory leaks and manages resource lifecycle
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from './logger';

interface ResourceInfo {
  id: string;
  type: ResourceType;
  size?: number;
  created: Date;
  lastAccessed: Date;
  accessCount: number;
  metadata?: any;
}

export enum ResourceType {
  BUFFER = 'buffer',
  CONNECTION = 'connection',
  TIMER = 'timer',
  STREAM = 'stream',
  CACHE = 'cache',
  SESSION = 'session',
  PROCESS = 'process'
}

interface ResourceLimits {
  maxSize?: number;
  maxAge?: number;
  maxItems?: number;
  maxIdleTime?: number;
}

interface ResourcePool<T> {
  items: Map<string, T>;
  info: Map<string, ResourceInfo>;
  limits: ResourceLimits;
}

/**
 * Comprehensive resource management system to prevent memory leaks
 */
export class ResourceManager extends EventEmitter {
  private static instance: ResourceManager;
  private resources: Map<ResourceType, ResourcePool<any>> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  private metrics = {
    totalAllocated: 0,
    totalReleased: 0,
    currentActive: 0,
    leaksDetected: 0
  };

  private constructor() {
    super();
    this.initializeResourcePools();
    this.startCleanupProcess();
    this.setupProcessHandlers();
  }

  static getInstance(): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager();
    }
    return ResourceManager.instance;
  }

  /**
   * Initialize resource pools with limits
   */
  private initializeResourcePools(): void {
    // Buffer pool for terminal outputs
    this.resources.set(ResourceType.BUFFER, {
      items: new Map(),
      info: new Map(),
      limits: {
        maxSize: 10 * 1024 * 1024, // 10MB per buffer
        maxItems: 100,
        maxIdleTime: 300000 // 5 minutes
      }
    });

    // WebSocket connections
    this.resources.set(ResourceType.CONNECTION, {
      items: new Map(),
      info: new Map(),
      limits: {
        maxItems: 1000,
        maxIdleTime: 600000 // 10 minutes
      }
    });

    // Timers and intervals
    this.resources.set(ResourceType.TIMER, {
      items: new Map(),
      info: new Map(),
      limits: {
        maxItems: 500,
        maxAge: 3600000 // 1 hour
      }
    });

    // Streams (file, network)
    this.resources.set(ResourceType.STREAM, {
      items: new Map(),
      info: new Map(),
      limits: {
        maxItems: 200,
        maxIdleTime: 120000 // 2 minutes
      }
    });

    // Cache entries
    this.resources.set(ResourceType.CACHE, {
      items: new Map(),
      info: new Map(),
      limits: {
        maxItems: 10000,
        maxAge: 1800000, // 30 minutes
        maxSize: 100 * 1024 * 1024 // 100MB total
      }
    });

    // Terminal sessions
    this.resources.set(ResourceType.SESSION, {
      items: new Map(),
      info: new Map(),
      limits: {
        maxItems: 50,
        maxIdleTime: 1800000 // 30 minutes
      }
    });

    // Child processes
    this.resources.set(ResourceType.PROCESS, {
      items: new Map(),
      info: new Map(),
      limits: {
        maxItems: 20,
        maxAge: 7200000 // 2 hours
      }
    });
  }

  /**
   * Allocate a resource
   */
  allocate<T>(
    type: ResourceType,
    id: string,
    resource: T,
    metadata?: any
  ): boolean {
    const pool = this.resources.get(type);
    if (!pool) {
      logger.error(LogCategory.SYSTEM, `Unknown resource type: ${type}`);
      return false;
    }

    // Check limits before allocation
    if (pool.limits.maxItems && pool.items.size >= pool.limits.maxItems) {
      // Try to evict old resources
      this.evictOldestResource(type);

      // Check again
      if (pool.items.size >= pool.limits.maxItems) {
        logger.warn(LogCategory.SYSTEM, `Resource limit reached for ${type}`);
        this.emit('limit:reached', type, pool.limits.maxItems);
        return false;
      }
    }

    // Check size limits for buffers
    if (type === ResourceType.BUFFER && pool.limits.maxSize) {
      const buffer = resource as any;
      if (buffer.length && buffer.length > pool.limits.maxSize) {
        logger.warn(LogCategory.SYSTEM, `Buffer size exceeds limit: ${buffer.length}`);
        return false;
      }
    }

    // Store resource
    pool.items.set(id, resource);
    pool.info.set(id, {
      id,
      type,
      created: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      metadata,
      size: this.getResourceSize(resource)
    });

    this.metrics.totalAllocated++;
    this.metrics.currentActive++;

    logger.debug(LogCategory.SYSTEM, `Resource allocated: ${type}/${id}`);
    this.emit('resource:allocated', type, id);

    return true;
  }

  /**
   * Get a resource
   */
  get<T>(type: ResourceType, id: string): T | null {
    const pool = this.resources.get(type);
    if (!pool) return null;

    const resource = pool.items.get(id);
    if (!resource) return null;

    // Update access info
    const info = pool.info.get(id);
    if (info) {
      info.lastAccessed = new Date();
      info.accessCount++;
    }

    return resource;
  }

  /**
   * Release a resource
   */
  release(type: ResourceType, id: string): boolean {
    const pool = this.resources.get(type);
    if (!pool) return false;

    const resource = pool.items.get(id);
    if (!resource) return false;

    // Clean up the resource
    this.cleanupResource(type, resource);

    // Remove from pool
    pool.items.delete(id);
    pool.info.delete(id);

    this.metrics.totalReleased++;
    this.metrics.currentActive--;

    logger.debug(LogCategory.SYSTEM, `Resource released: ${type}/${id}`);
    this.emit('resource:released', type, id);

    return true;
  }

  /**
   * Release all resources of a type
   */
  releaseAll(type: ResourceType): number {
    const pool = this.resources.get(type);
    if (!pool) return 0;

    const count = pool.items.size;

    for (const [id, resource] of pool.items) {
      this.cleanupResource(type, resource);
    }

    pool.items.clear();
    pool.info.clear();

    this.metrics.totalReleased += count;
    this.metrics.currentActive -= count;

    logger.info(LogCategory.SYSTEM, `Released ${count} resources of type ${type}`);
    return count;
  }

  /**
   * Clean up a specific resource
   */
  private cleanupResource(type: ResourceType, resource: any): void {
    try {
      switch (type) {
        case ResourceType.BUFFER:
          // Clear buffer contents
          if (Buffer.isBuffer(resource)) {
            resource.fill(0);
          }
          break;

        case ResourceType.CONNECTION:
          // Close WebSocket connection
          if (resource.close && typeof resource.close === 'function') {
            resource.close();
          }
          if (resource.disconnect && typeof resource.disconnect === 'function') {
            resource.disconnect();
          }
          break;

        case ResourceType.TIMER:
          // Clear timer/interval
          if (typeof resource === 'object' && resource._onTimeout) {
            clearTimeout(resource);
          } else {
            clearInterval(resource);
          }
          break;

        case ResourceType.STREAM:
          // Close stream
          if (resource.destroy && typeof resource.destroy === 'function') {
            resource.destroy();
          }
          if (resource.close && typeof resource.close === 'function') {
            resource.close();
          }
          break;

        case ResourceType.PROCESS:
          // Kill child process
          if (resource.kill && typeof resource.kill === 'function') {
            resource.kill('SIGTERM');
          }
          break;

        case ResourceType.SESSION:
          // Clean up terminal session
          if (resource.cleanup && typeof resource.cleanup === 'function') {
            resource.cleanup();
          }
          break;
      }
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Error cleaning up resource: ${type}`, error);
    }
  }

  /**
   * Get resource size in bytes
   */
  private getResourceSize(resource: any): number {
    if (Buffer.isBuffer(resource)) {
      return resource.length;
    }
    if (typeof resource === 'string') {
      return resource.length * 2; // Approximate UTF-16 size
    }
    if (Array.isArray(resource)) {
      return resource.length * 8; // Approximate
    }
    return 0;
  }

  /**
   * Evict the oldest resource of a type
   */
  private evictOldestResource(type: ResourceType): boolean {
    const pool = this.resources.get(type);
    if (!pool || pool.items.size === 0) return false;

    let oldestId: string | null = null;
    let oldestTime = Date.now();

    for (const [id, info] of pool.info) {
      if (info.created.getTime() < oldestTime) {
        oldestTime = info.created.getTime();
        oldestId = id;
      }
    }

    if (oldestId) {
      logger.debug(LogCategory.SYSTEM, `Evicting old resource: ${type}/${oldestId}`);
      return this.release(type, oldestId);
    }

    return false;
  }

  /**
   * Start periodic cleanup process
   */
  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 30000); // Every 30 seconds
  }

  /**
   * Perform cleanup of idle and expired resources
   */
  private performCleanup(): void {
    const now = Date.now();
    let totalCleaned = 0;

    for (const [type, pool] of this.resources) {
      const toRemove: string[] = [];

      for (const [id, info] of pool.info) {
        let shouldRemove = false;

        // Check max age
        if (pool.limits.maxAge) {
          const age = now - info.created.getTime();
          if (age > pool.limits.maxAge) {
            shouldRemove = true;
            logger.debug(LogCategory.SYSTEM, `Resource expired: ${type}/${id} (age: ${age}ms)`);
          }
        }

        // Check idle time
        if (pool.limits.maxIdleTime) {
          const idleTime = now - info.lastAccessed.getTime();
          if (idleTime > pool.limits.maxIdleTime) {
            shouldRemove = true;
            logger.debug(LogCategory.SYSTEM, `Resource idle: ${type}/${id} (idle: ${idleTime}ms)`);
          }
        }

        if (shouldRemove) {
          toRemove.push(id);
        }
      }

      // Remove marked resources
      for (const id of toRemove) {
        this.release(type, id);
        totalCleaned++;
      }
    }

    if (totalCleaned > 0) {
      logger.info(LogCategory.SYSTEM, `Cleanup: Released ${totalCleaned} idle/expired resources`);
      this.emit('cleanup:complete', totalCleaned);
    }

    // Check for potential leaks
    this.detectMemoryLeaks();
  }

  /**
   * Detect potential memory leaks
   */
  private detectMemoryLeaks(): void {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const externalMB = Math.round(memUsage.external / 1024 / 1024);

    // Check for high memory usage
    const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapPercentage > 85) {
      logger.warn(LogCategory.SYSTEM, `High heap usage: ${heapPercentage.toFixed(1)}% (${heapUsedMB}MB/${heapTotalMB}MB)`);
      this.emit('memory:high', heapPercentage, memUsage);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info(LogCategory.SYSTEM, 'Forced garbage collection');
      }
    }

    // Check for growing resource pools
    for (const [type, pool] of this.resources) {
      if (pool.items.size > (pool.limits.maxItems || 1000) * 0.8) {
        logger.warn(LogCategory.SYSTEM, `Resource pool near limit: ${type} (${pool.items.size} items)`);
        this.metrics.leaksDetected++;
      }
    }
  }

  /**
   * Get resource statistics
   */
  getStatistics(): any {
    const stats: any = {
      metrics: this.metrics,
      pools: {}
    };

    for (const [type, pool] of this.resources) {
      stats.pools[type] = {
        count: pool.items.size,
        limits: pool.limits,
        oldestAge: this.getOldestResourceAge(type),
        totalSize: this.getPoolSize(type)
      };
    }

    stats.memory = {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    };

    return stats;
  }

  /**
   * Get oldest resource age in a pool
   */
  private getOldestResourceAge(type: ResourceType): number {
    const pool = this.resources.get(type);
    if (!pool || pool.info.size === 0) return 0;

    const now = Date.now();
    let oldest = 0;

    for (const info of pool.info.values()) {
      const age = now - info.created.getTime();
      if (age > oldest) oldest = age;
    }

    return oldest;
  }

  /**
   * Get total size of a resource pool
   */
  private getPoolSize(type: ResourceType): number {
    const pool = this.resources.get(type);
    if (!pool) return 0;

    let totalSize = 0;
    for (const info of pool.info.values()) {
      totalSize += info.size || 0;
    }

    return totalSize;
  }

  /**
   * Setup process handlers for cleanup
   */
  private setupProcessHandlers(): void {
    const cleanup = () => {
      logger.info(LogCategory.SYSTEM, 'Resource manager shutting down...');

      // Clear all resources
      for (const type of this.resources.keys()) {
        const count = this.releaseAll(type);
        if (count > 0) {
          logger.info(LogCategory.SYSTEM, `Released ${count} ${type} resources on shutdown`);
        }
      }

      // Stop cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Force cleanup of all resources
   */
  forceCleanup(): void {
    logger.warn(LogCategory.SYSTEM, 'Forcing cleanup of all resources...');

    let totalCleaned = 0;
    for (const type of this.resources.keys()) {
      totalCleaned += this.releaseAll(type);
    }

    logger.info(LogCategory.SYSTEM, `Force cleanup complete: ${totalCleaned} resources released`);
    this.emit('cleanup:forced', totalCleaned);
  }
}

// Export singleton instance
export const resourceManager = ResourceManager.getInstance();