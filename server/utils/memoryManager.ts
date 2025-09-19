/**
 * Memory Management Service
 * Monitors and manages memory usage in long-running processes
 * Prevents memory leaks and triggers cleanup when thresholds are exceeded
 */

import { EventEmitter } from 'events';
import * as v8 from 'v8';
import { logger } from './logger';
import { LogCategory } from './logger';

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  percentage: number;
}

export interface MemoryThresholds {
  warningThreshold: number;  // Percentage (e.g., 70)
  criticalThreshold: number; // Percentage (e.g., 85)
  maxHeapSize: number;       // Bytes (e.g., 1GB)
}

export interface CleanupTarget {
  name: string;
  cleanup: () => void | Promise<void>;
  priority: number; // Lower = higher priority
}

export class MemoryManager extends EventEmitter {
  private static instance: MemoryManager;
  private monitorInterval?: NodeJS.Timeout;
  private cleanupTargets: Map<string, CleanupTarget> = new Map();
  private lastCleanup: Date = new Date();
  private readonly MIN_CLEANUP_INTERVAL = 30000; // 30 seconds
  
  private readonly DEFAULT_THRESHOLDS: MemoryThresholds = {
    warningThreshold: 70,
    criticalThreshold: 85,
    maxHeapSize: 1024 * 1024 * 1024 // 1GB
  };
  
  private thresholds: MemoryThresholds;
  private isCleanupInProgress = false;
  
  private constructor() {
    super();
    this.thresholds = { ...this.DEFAULT_THRESHOLDS };
    
    // Register default cleanup handlers
    this.registerDefaultCleanupHandlers();
    
    logger.info(LogCategory.MONITORING, 'Memory manager initialized', {
      thresholds: this.thresholds
    });
  }
  
  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }
  
  /**
   * Start monitoring memory usage
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);
    
    // Initial check
    this.checkMemoryUsage();
    
    logger.info(LogCategory.MONITORING, `Memory monitoring started (interval: ${intervalMs}ms)`);
  }
  
  /**
   * Stop monitoring memory usage
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
      logger.info(LogCategory.MONITORING, 'Memory monitoring stopped');
    }
  }
  
  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    
    const percentage = Math.round((memUsage.heapUsed / heapStats.heap_size_limit) * 100);
    
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers || 0,
      percentage
    };
  }
  
  /**
   * Check memory usage and trigger cleanup if needed
   */
  private async checkMemoryUsage(): Promise<void> {
    const stats = this.getMemoryStats();
    
    // Emit memory stats event
    this.emit('memory:stats', stats);
    
    // Log memory usage
    const logData = {
      heapUsedMB: Math.round(stats.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(stats.heapTotal / 1024 / 1024),
      rssMB: Math.round(stats.rss / 1024 / 1024),
      percentage: stats.percentage
    };
    
    if (stats.percentage >= this.thresholds.criticalThreshold) {
      logger.error(LogCategory.MONITORING, 'Critical memory usage detected', logData);
      await this.triggerCleanup('critical');
    } else if (stats.percentage >= this.thresholds.warningThreshold) {
      logger.warn(LogCategory.MONITORING, 'High memory usage detected', logData);
      await this.triggerCleanup('warning');
    } else if (stats.heapUsed > this.thresholds.maxHeapSize) {
      logger.warn(LogCategory.MONITORING, 'Heap size exceeded threshold', logData);
      await this.triggerCleanup('heap_exceeded');
    } else {
      // Log normal memory usage less frequently
      if (Math.random() < 0.1) { // 10% chance to log
        logger.debug(LogCategory.MONITORING, 'Memory usage normal', logData);
      }
    }
  }
  
  /**
   * Trigger memory cleanup
   */
  private async triggerCleanup(reason: string): Promise<void> {
    // Prevent concurrent cleanups
    if (this.isCleanupInProgress) {
      logger.debug(LogCategory.MONITORING, 'Cleanup already in progress, skipping');
      return;
    }
    
    // Check minimum interval between cleanups
    const timeSinceLastCleanup = Date.now() - this.lastCleanup.getTime();
    if (timeSinceLastCleanup < this.MIN_CLEANUP_INTERVAL) {
      logger.debug(LogCategory.MONITORING, 
        `Skipping cleanup, too soon since last cleanup (${timeSinceLastCleanup}ms ago)`);
      return;
    }
    
    this.isCleanupInProgress = true;
    const startTime = Date.now();
    
    logger.info(LogCategory.MONITORING, `Starting memory cleanup (reason: ${reason})`);
    
    try {
      // Sort cleanup targets by priority
      const sortedTargets = Array.from(this.cleanupTargets.values())
        .sort((a, b) => a.priority - b.priority);
      
      // Execute cleanup handlers
      for (const target of sortedTargets) {
        try {
          logger.debug(LogCategory.MONITORING, `Running cleanup: ${target.name}`);
          await target.cleanup();
        } catch (error) {
          logger.error(LogCategory.MONITORING, 
            `Cleanup handler failed: ${target.name}`, error);
        }
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.debug(LogCategory.MONITORING, 'Forced garbage collection');
      }
      
      // Get memory stats after cleanup
      const afterStats = this.getMemoryStats();
      const duration = Date.now() - startTime;
      
      logger.info(LogCategory.MONITORING, 'Memory cleanup completed', {
        duration,
        beforePercentage: this.getMemoryStats().percentage,
        afterPercentage: afterStats.percentage,
        freedMB: Math.round((this.getMemoryStats().heapUsed - afterStats.heapUsed) / 1024 / 1024)
      });
      
      this.lastCleanup = new Date();
      this.emit('cleanup:completed', { reason, duration, afterStats });
      
    } finally {
      this.isCleanupInProgress = false;
    }
  }
  
  /**
   * Register a cleanup handler
   */
  registerCleanupHandler(name: string, cleanup: () => void | Promise<void>, priority: number = 50): void {
    this.cleanupTargets.set(name, { name, cleanup, priority });
    logger.debug(LogCategory.MONITORING, `Registered cleanup handler: ${name} (priority: ${priority})`);
  }
  
  /**
   * Unregister a cleanup handler
   */
  unregisterCleanupHandler(name: string): void {
    if (this.cleanupTargets.delete(name)) {
      logger.debug(LogCategory.MONITORING, `Unregistered cleanup handler: ${name}`);
    }
  }
  
  /**
   * Register default cleanup handlers
   */
  private registerDefaultCleanupHandlers(): void {
    // Clear old WeakMap/WeakSet entries (automatic)
    this.registerCleanupHandler('weak_collections', () => {
      // WeakMaps and WeakSets clean up automatically
      // This is just a placeholder to trigger GC
      if (global.gc) global.gc();
    }, 10);
    
    // Clear expired cache entries
    this.registerCleanupHandler('cache_cleanup', async () => {
      const { terminalService } = await import('../services/terminalOutputCache');
      const stats = terminalOutputCache.getStats();
      if (stats.totalSessions > 20) {
        // Force cleanup if too many sessions cached
        terminalOutputCache.clear();
        logger.info(LogCategory.MONITORING, 'Cleared terminal output cache due to memory pressure');
      }
    }, 20);
    
    // Clear old log entries
    this.registerCleanupHandler('log_cleanup', () => {
      // Clear old throttled log entries
      const { logThrottling } = require('./logThrottling');
      if (logThrottling && typeof logThrottling.cleanup === 'function') {
        logThrottling.cleanup();
      }
    }, 30);
    
    // Clear old broadcast hashes in terminal service
    this.registerCleanupHandler('terminal_hashes', async () => {
      const { terminalService } = await import('../services/unified/terminalService');
      // This would need to be implemented in terminalStreamService
      // For now, just trigger GC
      if (global.gc) global.gc();
    }, 40);
  }
  
  /**
   * Update memory thresholds
   */
  updateThresholds(thresholds: Partial<MemoryThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info(LogCategory.MONITORING, 'Memory thresholds updated', this.thresholds);
  }
  
  /**
   * Force a manual cleanup
   */
  async forceCleanup(): Promise<void> {
    logger.info(LogCategory.MONITORING, 'Manual cleanup triggered');
    await this.triggerCleanup('manual');
  }
  
  /**
   * Get memory usage summary
   */
  getMemorySummary(): {
    stats: MemoryStats;
    thresholds: MemoryThresholds;
    cleanupHandlers: string[];
    lastCleanup: Date;
    isMonitoring: boolean;
  } {
    return {
      stats: this.getMemoryStats(),
      thresholds: this.thresholds,
      cleanupHandlers: Array.from(this.cleanupTargets.keys()),
      lastCleanup: this.lastCleanup,
      isMonitoring: !!this.monitorInterval
    };
  }
  
  /**
   * Destroy the memory manager
   */
  destroy(): void {
    this.stopMonitoring();
    this.cleanupTargets.clear();
    this.removeAllListeners();
    logger.info(LogCategory.MONITORING, 'Memory manager destroyed');
  }
}

// Singleton instance
export const memoryManager = MemoryManager.getInstance();

/**
 * Memory leak detector for development
 */
export class MemoryLeakDetector {
  private snapshots: Map<string, any> = new Map();
  private heapSnapshots: Map<string, any> = new Map();
  
  /**
   * Take a heap snapshot
   */
  takeSnapshot(label: string): void {
    if (process.env.NODE_ENV !== 'development') {
      return; // Only in development
    }
    
    const snapshot = v8.writeHeapSnapshot();
    this.heapSnapshots.set(label, snapshot);
    
    const stats = memoryManager.getMemoryStats();
    this.snapshots.set(label, stats);
    
    logger.debug(LogCategory.MONITORING, `Heap snapshot taken: ${label}`, stats);
  }
  
  /**
   * Compare two snapshots
   */
  compareSnapshots(label1: string, label2: string): {
    heapDiff: number;
    rssDiff: number;
    percentageDiff: number;
  } | null {
    const snap1 = this.snapshots.get(label1);
    const snap2 = this.snapshots.get(label2);
    
    if (!snap1 || !snap2) {
      return null;
    }
    
    return {
      heapDiff: snap2.heapUsed - snap1.heapUsed,
      rssDiff: snap2.rss - snap1.rss,
      percentageDiff: snap2.percentage - snap1.percentage
    };
  }
  
  /**
   * Clear all snapshots
   */
  clearSnapshots(): void {
    this.snapshots.clear();
    this.heapSnapshots.clear();
  }
}

export const memoryLeakDetector = new MemoryLeakDetector();