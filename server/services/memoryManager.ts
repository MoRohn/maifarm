/**
 * Memory Management Service
 * Monitors and manages memory usage across the application
 * Implements garbage collection, cache clearing, and memory leak prevention
 */

import * as os from 'os';
import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';

interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  percentage: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number; // Resident Set Size
}

interface MemoryThresholds {
  warning: number; // percentage
  critical: number; // percentage
  heapLimit: number; // bytes
}

interface MemoryLeakDetection {
  samples: number[];
  sampleInterval: number;
  leakThreshold: number; // MB increase per minute
}

class MemoryManager extends EventEmitter {
  private static instance: MemoryManager;
  private monitorInterval: NodeJS.Timer | null = null;
  private gcInterval: NodeJS.Timer | null = null;
  private leakDetection: MemoryLeakDetection;
  private memoryHistory: MemoryMetrics[] = [];
  private maxHistorySize = 100;

  private readonly thresholds: MemoryThresholds = {
    warning: 70,
    critical: 85,
    heapLimit: 1024 * 1024 * 1024 * 2 // 2GB
  };

  private constructor() {
    super();
    this.leakDetection = {
      samples: [],
      sampleInterval: 60000, // 1 minute
      leakThreshold: 50 // 50MB per minute
    };
  }

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * Start memory monitoring
   */
  public startMonitoring(intervalMs: number = 30000): void {
    if (this.monitorInterval) {
      logger.warn(LogCategory.SYSTEM, 'Memory monitoring already started');
      return;
    }

    logger.info(LogCategory.SYSTEM, 'Starting memory monitoring');

    // Monitor memory usage
    this.monitorInterval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);

    // Periodic garbage collection
    this.gcInterval = setInterval(() => {
      this.forceGarbageCollection();
    }, 300000); // Every 5 minutes

    // Start leak detection
    this.startLeakDetection();

    this.emit('monitoring:started');
  }

  /**
   * Stop memory monitoring
   */
  public stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }

    logger.info(LogCategory.SYSTEM, 'Memory monitoring stopped');
    this.emit('monitoring:stopped');
  }

  /**
   * Get current memory metrics
   */
  public getMemoryMetrics(): MemoryMetrics {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percentage: (usedMem / totalMem) * 100,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    };
  }

  /**
   * Check memory and trigger alerts if needed
   */
  private checkMemory(): void {
    const metrics = this.getMemoryMetrics();

    // Add to history
    this.memoryHistory.push(metrics);
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }

    // Check thresholds
    if (metrics.percentage > this.thresholds.critical) {
      this.handleCriticalMemory(metrics);
    } else if (metrics.percentage > this.thresholds.warning) {
      this.handleWarningMemory(metrics);
    }

    // Check heap limit
    if (metrics.heapUsed > this.thresholds.heapLimit) {
      this.handleHeapLimitExceeded(metrics);
    }

    // Broadcast metrics
    websocketManager.broadcast('metrics:memory', {
      ...metrics,
      timestamp: new Date()
    });

    this.emit('metrics:updated', metrics);
  }

  /**
   * Handle critical memory situation
   */
  private handleCriticalMemory(metrics: MemoryMetrics): void {
    logger.error(LogCategory.SYSTEM, `CRITICAL: Memory usage at ${metrics.percentage.toFixed(2)}%`);

    // Force garbage collection
    this.forceGarbageCollection();

    // Clear caches
    this.clearCaches();

    // Emit critical event
    this.emit('memory:critical', metrics);

    // Send alert
    websocketManager.broadcast('alert:critical', {
      type: 'memory',
      message: `Critical memory usage: ${metrics.percentage.toFixed(2)}%`,
      metrics,
      timestamp: new Date()
    });
  }

  /**
   * Handle warning memory situation
   */
  private handleWarningMemory(metrics: MemoryMetrics): void {
    logger.warn(LogCategory.SYSTEM, `Warning: Memory usage at ${metrics.percentage.toFixed(2)}%`);

    this.emit('memory:warning', metrics);

    websocketManager.broadcast('alert:warning', {
      type: 'memory',
      message: `High memory usage: ${metrics.percentage.toFixed(2)}%`,
      metrics,
      timestamp: new Date()
    });
  }

  /**
   * Handle heap limit exceeded
   */
  private handleHeapLimitExceeded(metrics: MemoryMetrics): void {
    logger.error(LogCategory.SYSTEM, `Heap limit exceeded: ${(metrics.heapUsed / 1024 / 1024).toFixed(2)}MB`);

    // Force aggressive garbage collection
    this.forceGarbageCollection(true);

    // Clear all non-essential caches
    this.clearCaches(true);

    this.emit('heap:limit:exceeded', metrics);
  }

  /**
   * Force garbage collection
   */
  private forceGarbageCollection(aggressive: boolean = false): void {
    if (!global.gc) {
      logger.debug(LogCategory.SYSTEM, 'Garbage collection not available (run with --expose-gc)');
      return;
    }

    const beforeHeap = process.memoryUsage().heapUsed;

    if (aggressive) {
      // Multiple GC passes for aggressive cleaning
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
    } else {
      global.gc();
    }

    const afterHeap = process.memoryUsage().heapUsed;
    const freed = beforeHeap - afterHeap;

    logger.info(LogCategory.SYSTEM,
      `Garbage collection freed ${(freed / 1024 / 1024).toFixed(2)}MB`
    );

    this.emit('gc:completed', { freed, aggressive });
  }

  /**
   * Clear application caches
   */
  private async clearCaches(aggressive: boolean = false): Promise<void> {
    logger.info(LogCategory.SYSTEM, `Clearing caches (aggressive: ${aggressive})`);

    try {
      // Clear Redis caches if aggressive
      if (aggressive) {
        const { redis } = await import('../database/connection');
        await redis.flushdb();
        logger.info(LogCategory.SYSTEM, 'Redis cache cleared');
      }

      // Clear in-memory caches
      this.clearInMemoryCaches();

      // Clear old terminal outputs
      await this.clearOldTerminalOutputs();

      this.emit('caches:cleared', { aggressive });
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Failed to clear caches:', error);
    }
  }

  /**
   * Clear in-memory caches
   */
  private clearInMemoryCaches(): void {
    // Clear require cache for non-essential modules
    const essentialModules = ['express', 'socket.io', 'pg', 'redis'];

    Object.keys(require.cache).forEach(key => {
      const shouldKeep = essentialModules.some(module => key.includes(module));
      if (!shouldKeep && key.includes('node_modules')) {
        delete require.cache[key];
      }
    });
  }

  /**
   * Clear old terminal outputs
   */
  private async clearOldTerminalOutputs(): Promise<void> {
    const { pathConfig } = await import('../config/paths');
    const fs = await import('fs');
    const path = await import('path');

    const paths = pathConfig.getPaths();
    const terminalDir = paths.TERMINAL_DIR;

    try {
      const files = await fs.promises.readdir(terminalDir);
      const now = Date.now();
      const maxAge = 3600000; // 1 hour

      for (const file of files) {
        const filePath = path.join(terminalDir, file);
        const stats = await fs.promises.stat(filePath);

        if (now - stats.mtimeMs > maxAge) {
          await fs.promises.unlink(filePath);
          logger.debug(LogCategory.SYSTEM, `Deleted old terminal output: ${file}`);
        }
      }
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Failed to clear terminal outputs:', error);
    }
  }

  /**
   * Start memory leak detection
   */
  private startLeakDetection(): void {
    setInterval(() => {
      const metrics = this.getMemoryMetrics();
      this.leakDetection.samples.push(metrics.heapUsed);

      // Keep only last 10 samples
      if (this.leakDetection.samples.length > 10) {
        this.leakDetection.samples.shift();
      }

      // Check for potential leak (continuous growth)
      if (this.leakDetection.samples.length >= 5) {
        const isLeaking = this.detectMemoryLeak();
        if (isLeaking) {
          this.handleMemoryLeak();
        }
      }
    }, this.leakDetection.sampleInterval);
  }

  /**
   * Detect memory leak pattern
   */
  private detectMemoryLeak(): boolean {
    const samples = this.leakDetection.samples;
    if (samples.length < 5) return false;

    // Check if memory is continuously increasing
    let increasingCount = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] > samples[i - 1]) {
        increasingCount++;
      }
    }

    // If 80% of samples show increase, likely a leak
    const leakRatio = increasingCount / (samples.length - 1);
    if (leakRatio < 0.8) return false;

    // Calculate growth rate (MB per minute)
    const firstSample = samples[0];
    const lastSample = samples[samples.length - 1];
    const growthBytes = lastSample - firstSample;
    const growthMB = growthBytes / 1024 / 1024;
    const timeMinutes = (samples.length - 1) * (this.leakDetection.sampleInterval / 60000);
    const growthRate = growthMB / timeMinutes;

    return growthRate > this.leakDetection.leakThreshold;
  }

  /**
   * Handle detected memory leak
   */
  private handleMemoryLeak(): void {
    logger.error(LogCategory.SYSTEM, 'Potential memory leak detected!');

    // Get heap snapshot for debugging
    this.captureHeapSnapshot();

    // Aggressive cleanup
    this.forceGarbageCollection(true);
    this.clearCaches(true);

    // Emit leak event
    this.emit('memory:leak:detected', {
      samples: this.leakDetection.samples,
      timestamp: new Date()
    });

    // Send critical alert
    websocketManager.broadcast('alert:critical', {
      type: 'memory_leak',
      message: 'Potential memory leak detected',
      samples: this.leakDetection.samples,
      timestamp: new Date()
    });
  }

  /**
   * Capture heap snapshot for debugging
   */
  private captureHeapSnapshot(): void {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
      logger.info(LogCategory.SYSTEM, 'Heap snapshot disabled in production');
      return;
    }

    try {
      const v8 = require('v8');
      const fs = require('fs');
      const path = require('path');

      const filename = `heap-${Date.now()}.heapsnapshot`;
      const filepath = path.join(process.cwd(), 'logs', filename);

      const stream = fs.createWriteStream(filepath);
      v8.writeHeapSnapshot(stream);

      logger.info(LogCategory.SYSTEM, `Heap snapshot saved to ${filepath}`);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Failed to capture heap snapshot:', error);
    }
  }

  /**
   * Get memory history
   */
  public getMemoryHistory(): MemoryMetrics[] {
    return [...this.memoryHistory];
  }

  /**
   * Set memory thresholds
   */
  public setThresholds(thresholds: Partial<MemoryThresholds>): void {
    Object.assign(this.thresholds, thresholds);
    logger.info(LogCategory.SYSTEM, 'Memory thresholds updated:', this.thresholds);
  }

  /**
   * Get memory health status
   */
  public getHealthStatus(): {
    healthy: boolean;
    metrics: MemoryMetrics;
    message: string;
  } {
    const metrics = this.getMemoryMetrics();
    const healthy = metrics.percentage < this.thresholds.warning;

    let message = 'Memory usage normal';
    if (metrics.percentage > this.thresholds.critical) {
      message = 'Critical memory usage';
    } else if (metrics.percentage > this.thresholds.warning) {
      message = 'High memory usage';
    }

    return { healthy, metrics, message };
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();

// Export types
export type { MemoryMetrics, MemoryThresholds };