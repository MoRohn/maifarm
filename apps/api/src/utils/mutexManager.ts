/**
 * Mutex Manager for preventing race conditions
 * Provides distributed locking mechanism for critical sections
 */

import { EventEmitter } from 'events';
import { structuredLogger, LogCategory } from './structuredLogger';

export interface MutexLock {
  id: string;
  resource: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
  released: boolean;
}

export interface LockOptions {
  timeout?: number;      // Max time to wait for lock (ms)
  ttl?: number;         // Time to live for lock (ms)
  retryInterval?: number; // Retry interval (ms)
}

/**
 * Mutex manager for coordinating access to shared resources
 */
export class MutexManager extends EventEmitter {
  private static instance: MutexManager;
  private locks: Map<string, MutexLock> = new Map();
  private waitQueues: Map<string, Array<{
    owner: string;
    resolve: (lock: MutexLock) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>> = new Map();
  
  private readonly DEFAULT_TTL = 30000; // 30 seconds
  private readonly DEFAULT_TIMEOUT = 10000; // 10 seconds
  private readonly DEFAULT_RETRY_INTERVAL = 100; // 100ms
  
  private constructor() {
    super();
    this.startCleanupTimer();
  }
  
  static getInstance(): MutexManager {
    if (!MutexManager.instance) {
      MutexManager.instance = new MutexManager();
    }
    return MutexManager.instance;
  }
  
  /**
   * Acquire a lock on a resource
   */
  async acquire(
    resource: string,
    owner: string,
    options: LockOptions = {}
  ): Promise<MutexLock> {
    const {
      timeout = this.DEFAULT_TIMEOUT,
      ttl = this.DEFAULT_TTL,
      retryInterval = this.DEFAULT_RETRY_INTERVAL
    } = options;
    
    const lockId = `${resource}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Try to acquire immediately
    const existingLock = this.locks.get(resource);
    if (!existingLock || this.isExpired(existingLock)) {
      return this.createLock(lockId, resource, owner, ttl);
    }
    
    // Lock is held, add to wait queue
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.removeFromWaitQueue(resource, owner);
        reject(new Error(`Timeout acquiring lock for ${resource} after ${timeout}ms`));
      }, timeout);
      
      // Add to wait queue
      if (!this.waitQueues.has(resource)) {
        this.waitQueues.set(resource, []);
      }
      
      this.waitQueues.get(resource)!.push({
        owner,
        resolve,
        reject,
        timeout: timeoutHandle
      });
      
      structuredLogger.debug(
        LogCategory.SYSTEM,
        `Lock for ${resource} held by ${existingLock.owner}, ${owner} added to wait queue`
      );
    });
  }
  
  /**
   * Try to acquire a lock without waiting
   */
  tryAcquire(
    resource: string,
    owner: string,
    ttl: number = this.DEFAULT_TTL
  ): MutexLock | null {
    const existingLock = this.locks.get(resource);
    if (!existingLock || this.isExpired(existingLock)) {
      const lockId = `${resource}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      return this.createLock(lockId, resource, owner, ttl);
    }
    return null;
  }
  
  /**
   * Release a lock
   */
  release(lockId: string): boolean {
    // Find lock by ID
    let lock: MutexLock | undefined;
    let resource: string | undefined;
    
    for (const [res, lck] of this.locks) {
      if (lck.id === lockId) {
        lock = lck;
        resource = res;
        break;
      }
    }
    
    if (!lock || !resource) {
      structuredLogger.warn(LogCategory.SYSTEM, `Attempted to release non-existent lock: ${lockId}`);
      return false;
    }
    
    if (lock.released) {
      structuredLogger.warn(LogCategory.SYSTEM, `Lock ${lockId} already released`);
      return false;
    }
    
    lock.released = true;
    this.locks.delete(resource);
    
    structuredLogger.debug(
      LogCategory.SYSTEM,
      `Lock ${lockId} for ${resource} released by ${lock.owner}`
    );
    
    // Process wait queue
    this.processWaitQueue(resource);
    
    this.emit('lock:released', lock);
    return true;
  }
  
  /**
   * Release all locks held by an owner
   */
  releaseAll(owner: string): number {
    let count = 0;
    const toRelease: string[] = [];
    
    for (const [resource, lock] of this.locks) {
      if (lock.owner === owner && !lock.released) {
        toRelease.push(lock.id);
      }
    }
    
    for (const lockId of toRelease) {
      if (this.release(lockId)) {
        count++;
      }
    }
    
    if (count > 0) {
      structuredLogger.info(
        LogCategory.SYSTEM,
        `Released ${count} locks held by ${owner}`
      );
    }
    
    return count;
  }
  
  /**
   * Check if a resource is locked
   */
  isLocked(resource: string): boolean {
    const lock = this.locks.get(resource);
    return lock !== undefined && !this.isExpired(lock) && !lock.released;
  }
  
  /**
   * Get lock info for a resource
   */
  getLockInfo(resource: string): MutexLock | null {
    const lock = this.locks.get(resource);
    if (lock && !this.isExpired(lock) && !lock.released) {
      return lock;
    }
    return null;
  }
  
  /**
   * Create a new lock
   */
  private createLock(
    id: string,
    resource: string,
    owner: string,
    ttl: number
  ): MutexLock {
    const now = new Date();
    const lock: MutexLock = {
      id,
      resource,
      owner,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + ttl),
      released: false
    };
    
    this.locks.set(resource, lock);
    
    structuredLogger.debug(
      LogCategory.SYSTEM,
      `Lock ${id} acquired for ${resource} by ${owner} (TTL: ${ttl}ms)`
    );
    
    this.emit('lock:acquired', lock);
    
    // Auto-release on expiry
    setTimeout(() => {
      if (!lock.released && this.locks.get(resource)?.id === id) {
        structuredLogger.warn(
          LogCategory.SYSTEM,
          `Lock ${id} for ${resource} expired, auto-releasing`
        );
        this.release(id);
      }
    }, ttl);
    
    return lock;
  }
  
  /**
   * Check if a lock is expired
   */
  private isExpired(lock: MutexLock): boolean {
    return new Date() > lock.expiresAt;
  }
  
  /**
   * Process wait queue for a resource
   */
  private processWaitQueue(resource: string): void {
    const queue = this.waitQueues.get(resource);
    if (!queue || queue.length === 0) return;
    
    const next = queue.shift();
    if (!next) return;
    
    // Clear timeout
    clearTimeout(next.timeout);
    
    // Try to acquire lock for next in queue
    const lockId = `${resource}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const lock = this.createLock(lockId, resource, next.owner, this.DEFAULT_TTL);
    
    next.resolve(lock);
    
    // Clean up empty queue
    if (queue.length === 0) {
      this.waitQueues.delete(resource);
    }
  }
  
  /**
   * Remove an owner from wait queue
   */
  private removeFromWaitQueue(resource: string, owner: string): void {
    const queue = this.waitQueues.get(resource);
    if (!queue) return;
    
    const index = queue.findIndex(item => item.owner === owner);
    if (index !== -1) {
      const item = queue[index];
      clearTimeout(item.timeout);
      queue.splice(index, 1);
      
      if (queue.length === 0) {
        this.waitQueues.delete(resource);
      }
    }
  }
  
  /**
   * Clean up expired locks periodically
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      for (const [resource, lock] of this.locks) {
        if (this.isExpired(lock) && !lock.released) {
          structuredLogger.debug(
            LogCategory.SYSTEM,
            `Cleaning up expired lock ${lock.id} for ${resource}`
          );
          this.release(lock.id);
        }
      }
    }, 10000); // Every 10 seconds
  }
  
  /**
   * Get statistics
   */
  getStats(): {
    activeLocks: number;
    waitingCount: number;
    resources: string[];
  } {
    let waitingCount = 0;
    for (const queue of this.waitQueues.values()) {
      waitingCount += queue.length;
    }
    
    return {
      activeLocks: this.locks.size,
      waitingCount,
      resources: Array.from(this.locks.keys())
    };
  }
  
  /**
   * Reset (for testing)
   */
  reset(): void {
    // Clear all timeouts in wait queues
    for (const queue of this.waitQueues.values()) {
      for (const item of queue) {
        clearTimeout(item.timeout);
      }
    }
    
    this.locks.clear();
    this.waitQueues.clear();
  }
}

// Export singleton instance
export const mutexManager = MutexManager.getInstance();