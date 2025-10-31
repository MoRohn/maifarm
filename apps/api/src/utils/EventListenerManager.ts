/**
 * EventListenerManager - Prevents memory leaks by tracking and cleaning up event listeners
 * Provides automatic cleanup, leak detection, and lifecycle management
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from './logger';

interface ListenerInfo {
  eventName: string;
  listener: Function;
  once: boolean;
  addedAt: Date;
  source: string;
}

interface ListenerStats {
  totalAdded: number;
  totalRemoved: number;
  currentActive: number;
  possibleLeaks: number;
}

/**
 * WeakMap to track listener cleanup functions without preventing garbage collection
 */
const cleanupRegistry = new WeakMap<object, Set<() => void>>();

/**
 * Global registry of all managed event emitters
 */
const emitterRegistry = new Map<string, ManagedEventEmitter>();

/**
 * ManagedEventEmitter - Wrapper class that tracks all listeners
 */
export class ManagedEventEmitter extends EventEmitter {
  private listeners: Map<string, Set<ListenerInfo>> = new Map();
  private stats: ListenerStats = {
    totalAdded: 0,
    totalRemoved: 0,
    currentActive: 0,
    possibleLeaks: 0
  };
  private readonly maxListenersPerEvent: number;
  private readonly leakThreshold: number;
  private readonly name: string;
  private cleanupScheduled = false;

  constructor(name: string, maxListenersPerEvent = 10, leakThreshold = 100) {
    super();
    this.name = name;
    this.maxListenersPerEvent = maxListenersPerEvent;
    this.leakThreshold = leakThreshold;

    // Set max listeners to prevent warning
    this.setMaxListeners(maxListenersPerEvent);

    // Register this emitter
    emitterRegistry.set(name, this);

    // Schedule periodic cleanup
    this.scheduleCleanup();
  }

  /**
   * Override on() to track listeners
   */
  on(eventName: string, listener: Function): this {
    this.trackListener(eventName, listener, false);
    super.on(eventName, listener);
    return this;
  }

  /**
   * Override once() to track one-time listeners
   */
  once(eventName: string, listener: Function): this {
    this.trackListener(eventName, listener, true);
    super.once(eventName, listener);
    return this;
  }

  /**
   * Override addListener() to track listeners
   */
  addListener(eventName: string, listener: Function): this {
    return this.on(eventName, listener);
  }

  /**
   * Override removeListener() to update tracking
   */
  removeListener(eventName: string, listener: Function): this {
    this.untrackListener(eventName, listener);
    super.removeListener(eventName, listener);
    return this;
  }

  /**
   * Override off() to update tracking
   */
  off(eventName: string, listener: Function): this {
    return this.removeListener(eventName, listener);
  }

  /**
   * Override removeAllListeners() to update tracking
   */
  removeAllListeners(eventName?: string): this {
    if (eventName) {
      const listeners = this.listeners.get(eventName);
      if (listeners) {
        this.stats.currentActive -= listeners.size;
        this.stats.totalRemoved += listeners.size;
        this.listeners.delete(eventName);
      }
    } else {
      let totalRemoved = 0;
      this.listeners.forEach((listeners) => {
        totalRemoved += listeners.size;
      });
      this.stats.currentActive = 0;
      this.stats.totalRemoved += totalRemoved;
      this.listeners.clear();
    }

    super.removeAllListeners(eventName);
    return this;
  }

  /**
   * Track a listener being added
   */
  private trackListener(eventName: string, listener: Function, once: boolean): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const listeners = this.listeners.get(eventName)!;
    const listenerInfo: ListenerInfo = {
      eventName,
      listener,
      once,
      addedAt: new Date(),
      source: this.getCallerSource()
    };

    listeners.add(listenerInfo);
    this.stats.totalAdded++;
    this.stats.currentActive++;

    // Check for potential memory leak
    if (listeners.size > this.maxListenersPerEvent) {
      logger.warn(LogCategory.SYSTEM,
        `Possible memory leak detected in ${this.name}: Event '${eventName}' has ${listeners.size} listeners`);
      this.stats.possibleLeaks++;
    }

    // Check total active listeners
    if (this.stats.currentActive > this.leakThreshold) {
      logger.error(LogCategory.SYSTEM,
        `Memory leak likely in ${this.name}: ${this.stats.currentActive} active listeners`);
    }
  }

  /**
   * Untrack a listener being removed
   */
  private untrackListener(eventName: string, listener: Function): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;

    const toRemove = Array.from(listeners).find(l => l.listener === listener);
    if (toRemove) {
      listeners.delete(toRemove);
      this.stats.currentActive--;
      this.stats.totalRemoved++;

      if (listeners.size === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  /**
   * Get caller source for debugging
   */
  private getCallerSource(): string {
    const error = new Error();
    const stack = error.stack?.split('\n');
    // Return the 4th line of stack trace (skipping this method, trackListener, and on/once)
    return stack?.[4]?.trim() || 'unknown';
  }

  /**
   * Schedule periodic cleanup
   */
  private scheduleCleanup(): void {
    if (this.cleanupScheduled) return;

    this.cleanupScheduled = true;
    setInterval(() => {
      this.cleanupStaleListeners();
    }, 60000); // Every minute
  }

  /**
   * Clean up stale listeners (for debugging one-time listeners that weren't called)
   */
  private cleanupStaleListeners(): void {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    this.listeners.forEach((listeners, eventName) => {
      const staleListeners = Array.from(listeners).filter(l => {
        if (l.once) {
          const age = now.getTime() - l.addedAt.getTime();
          return age > staleThreshold;
        }
        return false;
      });

      staleListeners.forEach(l => {
        logger.warn(LogCategory.SYSTEM,
          `Removing stale one-time listener in ${this.name} for event '${eventName}' (added ${l.addedAt})`);
        this.removeListener(eventName, l.listener);
      });
    });
  }

  /**
   * Get statistics about this emitter
   */
  getStats(): ListenerStats {
    return { ...this.stats };
  }

  /**
   * Get detailed listener information
   */
  getListenerInfo(): Map<string, ListenerInfo[]> {
    const info = new Map<string, ListenerInfo[]>();
    this.listeners.forEach((listeners, eventName) => {
      info.set(eventName, Array.from(listeners));
    });
    return info;
  }

  /**
   * Cleanup all listeners and unregister
   */
  destroy(): void {
    this.removeAllListeners();
    emitterRegistry.delete(this.name);
    logger.info(LogCategory.SYSTEM, `ManagedEventEmitter ${this.name} destroyed`);
  }
}

/**
 * AutoCleanupListener - Automatically removes listeners when parent object is destroyed
 */
export class AutoCleanupListener {
  private cleanupFunctions: Set<() => void> = new Set();
  private readonly owner: string;

  constructor(owner: string) {
    this.owner = owner;
  }

  /**
   * Add a listener with automatic cleanup
   */
  addListener(
    emitter: EventEmitter,
    event: string,
    listener: Function,
    once = false
  ): void {
    // Add the listener
    if (once) {
      emitter.once(event, listener as any);
    } else {
      emitter.on(event, listener as any);
    }

    // Register cleanup
    const cleanup = () => {
      emitter.removeListener(event, listener as any);
    };

    this.cleanupFunctions.add(cleanup);
  }

  /**
   * Remove all listeners registered through this instance
   */
  removeAll(): void {
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions.clear();
    logger.debug(LogCategory.SYSTEM, `AutoCleanupListener ${this.owner} cleaned up`);
  }

  /**
   * Destructor - automatically cleanup when object is destroyed
   */
  destroy(): void {
    this.removeAll();
  }
}

/**
 * Memory leak detection utilities
 */
export class MemoryLeakDetector {
  private static checkInterval: NodeJS.Timeout | null = null;
  private static baselineMemory: number = 0;
  private static measurements: number[] = [];
  private static readonly MAX_MEASUREMENTS = 10;

  /**
   * Start monitoring for memory leaks
   */
  static startMonitoring(intervalMs = 30000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.baselineMemory = process.memoryUsage().heapUsed;
    this.measurements = [];

    this.checkInterval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);

    logger.info(LogCategory.SYSTEM, 'Memory leak detection started');
  }

  /**
   * Stop monitoring
   */
  static stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info(LogCategory.SYSTEM, 'Memory leak detection stopped');
  }

  /**
   * Check current memory usage
   */
  private static checkMemory(): void {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;

    this.measurements.push(heapUsed);
    if (this.measurements.length > this.MAX_MEASUREMENTS) {
      this.measurements.shift();
    }

    // Check for consistent growth
    if (this.measurements.length >= 5) {
      const isGrowing = this.measurements.every((val, idx) => {
        if (idx === 0) return true;
        return val > this.measurements[idx - 1];
      });

      if (isGrowing) {
        const growth = heapUsed - this.baselineMemory;
        const growthMB = Math.round(growth / 1024 / 1024);

        logger.warn(LogCategory.SYSTEM,
          `Potential memory leak detected: ${growthMB}MB growth since baseline`);

        // Log emitter statistics
        this.logEmitterStats();
      }
    }

    // Check absolute memory usage
    const heapUsedMB = Math.round(heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

    if (heapUsedMB > heapTotalMB * 0.9) {
      logger.error(LogCategory.SYSTEM,
        `Critical memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${Math.round(heapUsedMB / heapTotalMB * 100)}%)`);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info(LogCategory.SYSTEM, 'Forced garbage collection');
      }
    }
  }

  /**
   * Log statistics for all managed emitters
   */
  private static logEmitterStats(): void {
    emitterRegistry.forEach((emitter, name) => {
      const stats = emitter.getStats();
      if (stats.currentActive > 50 || stats.possibleLeaks > 0) {
        logger.warn(LogCategory.SYSTEM,
          `Emitter ${name} stats: Active=${stats.currentActive}, Added=${stats.totalAdded}, Removed=${stats.totalRemoved}, Leaks=${stats.possibleLeaks}`);
      }
    });
  }

  /**
   * Get memory statistics
   */
  static getMemoryStats(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    measurements: number[];
  } {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024),
      measurements: this.measurements.map(m => Math.round(m / 1024 / 1024))
    };
  }
}

/**
 * Global cleanup registry for all emitters
 */
export class GlobalCleanupRegistry {
  /**
   * Cleanup all registered emitters
   */
  static cleanupAll(): void {
    let cleaned = 0;
    emitterRegistry.forEach((emitter, name) => {
      logger.info(LogCategory.SYSTEM, `Cleaning up emitter: ${name}`);
      emitter.destroy();
      cleaned++;
    });
    logger.info(LogCategory.SYSTEM, `Cleaned up ${cleaned} event emitters`);
  }

  /**
   * Get all registered emitters
   */
  static getAllEmitters(): Map<string, ManagedEventEmitter> {
    return new Map(emitterRegistry);
  }

  /**
   * Get statistics for all emitters
   */
  static getAllStats(): Map<string, ListenerStats> {
    const stats = new Map<string, ListenerStats>();
    emitterRegistry.forEach((emitter, name) => {
      stats.set(name, emitter.getStats());
    });
    return stats;
  }
}

// Export singleton detector
export const memoryLeakDetector = MemoryLeakDetector;

// Start monitoring on module load in development
if (process.env.NODE_ENV === 'development') {
  MemoryLeakDetector.startMonitoring(60000); // Check every minute
}

// Cleanup on process exit
process.on('exit', () => {
  GlobalCleanupRegistry.cleanupAll();
});

process.on('SIGINT', () => {
  GlobalCleanupRegistry.cleanupAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  GlobalCleanupRegistry.cleanupAll();
  process.exit(0);
});