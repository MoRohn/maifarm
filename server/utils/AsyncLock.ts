/**
 * Async Lock Manager - Prevents race conditions in critical sections
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from './logger';

interface LockRequest {
  id: string;
  resolve: () => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeout: NodeJS.Timeout;
}

interface LockInfo {
  holder: string;
  acquired: Date;
  released?: Date;
}

/**
 * Async lock implementation to prevent race conditions
 * Provides mutual exclusion for critical sections
 */
export class AsyncLock extends EventEmitter {
  private locks: Map<string, LockInfo> = new Map();
  private queues: Map<string, LockRequest[]> = new Map();
  private readonly defaultTimeout: number;
  private readonly maxQueueSize: number;
  private readonly deadlockTimeout: number;
  private deadlockChecker?: NodeJS.Timeout;

  constructor(options: {
    defaultTimeout?: number;
    maxQueueSize?: number;
    deadlockTimeout?: number;
  } = {}) {
    super();
    this.defaultTimeout = options.defaultTimeout || 30000; // 30 seconds
    this.maxQueueSize = options.maxQueueSize || 100;
    this.deadlockTimeout = options.deadlockTimeout || 60000; // 1 minute
    this.startDeadlockDetection();
  }

  /**
   * Acquire a lock for a resource
   */
  async acquire(resource: string, holderId: string, timeout?: number): Promise<() => void> {
    const effectiveTimeout = timeout || this.defaultTimeout;

    // Check if lock is already held by this holder (reentrant)
    const existingLock = this.locks.get(resource);
    if (existingLock?.holder === holderId) {
      logger.debug(LogCategory.SYSTEM, `Lock reentrant: ${resource} by ${holderId}`);
      return () => this.release(resource, holderId);
    }

    // If lock is available, acquire it immediately
    if (!existingLock) {
      this.locks.set(resource, {
        holder: holderId,
        acquired: new Date()
      });

      logger.debug(LogCategory.SYSTEM, `Lock acquired: ${resource} by ${holderId}`);
      this.emit('lock:acquired', resource, holderId);

      return () => this.release(resource, holderId);
    }

    // Lock is held, add to queue
    return new Promise((resolve, reject) => {
      const queue = this.queues.get(resource) || [];

      // Check queue size limit
      if (queue.length >= this.maxQueueSize) {
        reject(new Error(`Lock queue full for resource: ${resource}`));
        return;
      }

      const request: LockRequest = {
        id: holderId,
        resolve: () => {
          clearTimeout(request.timeout);
          this.locks.set(resource, {
            holder: holderId,
            acquired: new Date()
          });
          logger.debug(LogCategory.SYSTEM, `Lock acquired from queue: ${resource} by ${holderId}`);
          this.emit('lock:acquired', resource, holderId);
          resolve(() => this.release(resource, holderId));
        },
        reject: (error) => {
          clearTimeout(request.timeout);
          reject(error);
        },
        timestamp: Date.now(),
        timeout: setTimeout(() => {
          // Remove from queue
          const idx = queue.indexOf(request);
          if (idx >= 0) {
            queue.splice(idx, 1);
          }
          reject(new Error(`Lock timeout for resource: ${resource}`));
        }, effectiveTimeout)
      };

      queue.push(request);
      this.queues.set(resource, queue);

      logger.debug(LogCategory.SYSTEM, `Lock queued: ${resource} for ${holderId} (queue size: ${queue.length})`);
    });
  }

  /**
   * Try to acquire a lock without waiting
   */
  tryAcquire(resource: string, holderId: string): (() => void) | null {
    const existingLock = this.locks.get(resource);

    // Check if already held by this holder
    if (existingLock?.holder === holderId) {
      return () => this.release(resource, holderId);
    }

    // If lock is available, acquire it
    if (!existingLock) {
      this.locks.set(resource, {
        holder: holderId,
        acquired: new Date()
      });

      logger.debug(LogCategory.SYSTEM, `Lock try-acquired: ${resource} by ${holderId}`);
      this.emit('lock:acquired', resource, holderId);

      return () => this.release(resource, holderId);
    }

    // Lock is held by another holder
    return null;
  }

  /**
   * Release a lock
   */
  release(resource: string, holderId: string): void {
    const lock = this.locks.get(resource);

    if (!lock) {
      logger.warn(LogCategory.SYSTEM, `Attempted to release non-existent lock: ${resource}`);
      return;
    }

    if (lock.holder !== holderId) {
      logger.error(LogCategory.SYSTEM, `Lock release mismatch: ${resource} held by ${lock.holder}, release attempted by ${holderId}`);
      return;
    }

    // Mark as released and remove
    lock.released = new Date();
    this.locks.delete(resource);

    logger.debug(LogCategory.SYSTEM, `Lock released: ${resource} by ${holderId}`);
    this.emit('lock:released', resource, holderId);

    // Process queue
    const queue = this.queues.get(resource);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      this.queues.set(resource, queue);

      // Grant lock to next in queue
      process.nextTick(() => next.resolve());
    }
  }

  /**
   * Release all locks held by a specific holder
   */
  releaseAll(holderId: string): void {
    const resources: string[] = [];

    for (const [resource, lock] of this.locks.entries()) {
      if (lock.holder === holderId) {
        resources.push(resource);
      }
    }

    for (const resource of resources) {
      this.release(resource, holderId);
    }

    if (resources.length > 0) {
      logger.info(LogCategory.SYSTEM, `Released ${resources.length} locks for holder: ${holderId}`);
    }
  }

  /**
   * Check if a resource is locked
   */
  isLocked(resource: string): boolean {
    return this.locks.has(resource);
  }

  /**
   * Get lock holder for a resource
   */
  getHolder(resource: string): string | null {
    return this.locks.get(resource)?.holder || null;
  }

  /**
   * Get all active locks
   */
  getActiveLocks(): Map<string, LockInfo> {
    return new Map(this.locks);
  }

  /**
   * Get queue size for a resource
   */
  getQueueSize(resource: string): number {
    return this.queues.get(resource)?.length || 0;
  }

  /**
   * Start deadlock detection
   */
  private startDeadlockDetection(): void {
    this.deadlockChecker = setInterval(() => {
      const now = Date.now();

      for (const [resource, lock] of this.locks.entries()) {
        const holdTime = now - lock.acquired.getTime();

        if (holdTime > this.deadlockTimeout) {
          logger.error(LogCategory.SYSTEM, `Potential deadlock detected: ${resource} held by ${lock.holder} for ${holdTime}ms`);
          this.emit('deadlock:detected', resource, lock.holder, holdTime);

          // Force release if configured
          if (process.env.FORCE_DEADLOCK_RELEASE === 'true') {
            logger.warn(LogCategory.SYSTEM, `Force releasing deadlocked resource: ${resource}`);
            this.locks.delete(resource);
            this.processQueue(resource);
          }
        }
      }

      // Check for stuck queue items
      for (const [resource, queue] of this.queues.entries()) {
        for (const request of queue) {
          const waitTime = now - request.timestamp;

          if (waitTime > this.deadlockTimeout) {
            logger.warn(LogCategory.SYSTEM, `Long queue wait: ${resource} for ${request.id} (${waitTime}ms)`);
          }
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Process waiting queue for a resource
   */
  private processQueue(resource: string): void {
    const queue = this.queues.get(resource);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      this.queues.set(resource, queue);
      process.nextTick(() => next.resolve());
    }
  }

  /**
   * Stop deadlock detection
   */
  stopDeadlockDetection(): void {
    if (this.deadlockChecker) {
      clearInterval(this.deadlockChecker);
      this.deadlockChecker = undefined;
    }
  }

  /**
   * Clear all locks and queues
   */
  clear(): void {
    // Reject all queued requests
    for (const [resource, queue] of this.queues.entries()) {
      for (const request of queue) {
        clearTimeout(request.timeout);
        request.reject(new Error('Lock manager cleared'));
      }
    }

    this.locks.clear();
    this.queues.clear();
    this.stopDeadlockDetection();

    logger.info(LogCategory.SYSTEM, 'Lock manager cleared');
  }
}

// Export singleton instance
export const lockManager = new AsyncLock({
  defaultTimeout: 30000,
  maxQueueSize: 100,
  deadlockTimeout: 60000
});