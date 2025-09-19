/**
 * MemoryManager - Centralized memory management and cleanup service
 *
 * Prevents memory leaks by:
 * - Tracking service registrations
 * - Monitoring memory usage
 * - Triggering cleanup when needed
 * - Managing event listeners
 * - Implementing resource limits
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../../utils/logger';
import { productionConfig } from '../../config/production';

interface ServiceRegistration {
  name: string;
  getMemoryUsage: () => number;
  cleanup: () => void | Promise<void>;
  priority?: number; // Lower number = higher priority for cleanup
}

interface MemoryThresholds {
  warning: number;  // 70% of heap
  critical: number; // 85% of heap
  emergency: number; // 95% of heap
}

export class MemoryManager extends EventEmitter {
  private static instance: MemoryManager;
  private services: Map<string, ServiceRegistration> = new Map();
  private eventListeners: Map<string, Set<Function>> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private isCleaningUp = false;

  private readonly thresholds: MemoryThresholds = {
    warning: productionConfig.memory.warningThreshold,
    critical: productionConfig.memory.criticalThreshold,
    emergency: productionConfig.memory.emergencyThreshold
  };

  private readonly MONITOR_INTERVAL = productionConfig.memory.monitorInterval;
  private readonly MAX_HEAP_SIZE = productionConfig.memory.maxHeapSize;

  private constructor() {
    super();
    this.initialize();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  private initialize(): void {
    // Start memory monitoring
    this.startMonitoring();

    // Set up process handlers
    this.setupProcessHandlers();

    // Enable garbage collection tracking if available
    if (global.gc) {
      logger.info(LogCategory.SYSTEM, 'Manual garbage collection enabled');
    }

    logger.info(LogCategory.SYSTEM, 'MemoryManager initialized');
  }

  /**
   * Register a service for memory management
   */
  registerService(name: string, registration: Omit<ServiceRegistration, 'name'>): void {
    this.services.set(name, { name, ...registration });
    logger.debug(LogCategory.SYSTEM, `Service registered for memory management: ${name}`);
  }

  /**
   * Unregister a service
   */
  unregisterService(name: string): void {
    const service = this.services.get(name);
    if (service) {
      // Clean up the service
      this.cleanupService(service);
      this.services.delete(name);
      logger.debug(LogCategory.SYSTEM, `Service unregistered: ${name}`);
    }
  }

  /**
   * Track an event listener for automatic cleanup
   */
  trackEventListener(emitter: EventEmitter, event: string, listener: Function): void {
    const key = `${emitter.constructor.name}:${event}`;

    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, new Set());
    }

    this.eventListeners.get(key)!.add(listener);
  }

  /**
   * Track an interval for automatic cleanup
   */
  trackInterval(id: string, interval: NodeJS.Timeout): void {
    this.intervals.set(id, interval);
  }

  /**
   * Track a timeout for automatic cleanup
   */
  trackTimeout(id: string, timeout: NodeJS.Timeout): void {
    this.timeouts.set(id, timeout);
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    percentage: number;
    rss: number;
  } {
    const memUsage = process.memoryUsage();
    // Use dynamic import for v8 in ESM context
    let heapSizeLimit = this.MAX_HEAP_SIZE;

    // Calculate percentage based on the heap size limit, not the current heap total
    // For now, use a reasonable heap limit (8GB) as the max
    // In production, this should be configured based on available system memory
    const percentage = memUsage.heapUsed / heapSizeLimit;

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      percentage: percentage
    };
  }

  /**
   * Force cleanup of a specific service
   */
  async cleanupService(service: ServiceRegistration): Promise<void> {
    try {
      await Promise.resolve(service.cleanup());
      logger.debug(LogCategory.SYSTEM, `Service cleaned up: ${service.name}`);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Error cleaning up service ${service.name}:`, error);
    }
  }

  /**
   * Perform memory cleanup based on priority
   */
  async performCleanup(level: 'warning' | 'critical' | 'emergency' = 'warning'): Promise<void> {
    if (this.isCleaningUp) {
      logger.debug(LogCategory.SYSTEM, 'Cleanup already in progress, skipping');
      return;
    }

    this.isCleaningUp = true;
    logger.info(LogCategory.SYSTEM, `Performing ${level} memory cleanup`);

    try {
      // Sort services by priority
      const sortedServices = Array.from(this.services.values())
        .sort((a, b) => (a.priority || 999) - (b.priority || 999));

      // Determine how many services to clean based on level
      const cleanupCount = level === 'emergency' ? sortedServices.length :
                           level === 'critical' ? Math.ceil(sortedServices.length * 0.5) :
                           Math.ceil(sortedServices.length * 0.25);

      // Clean up services
      for (let i = 0; i < cleanupCount && i < sortedServices.length; i++) {
        await this.cleanupService(sortedServices[i]);
      }

      // Clear intervals and timeouts if critical
      if (level === 'critical' || level === 'emergency') {
        this.clearTrackedResources();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.debug(LogCategory.SYSTEM, 'Forced garbage collection');
      }

      // Emit cleanup event
      this.emit('cleanup:completed', { level, memoryAfter: this.getMemoryStats() });

    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Error during cleanup:', error);
    } finally {
      this.isCleaningUp = false;
    }
  }

  /**
   * Clear tracked intervals and timeouts
   */
  private clearTrackedResources(): void {
    // Clear intervals
    for (const [id, interval] of this.intervals.entries()) {
      clearInterval(interval);
      this.intervals.delete(id);
    }

    // Clear timeouts
    for (const [id, timeout] of this.timeouts.entries()) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }

    logger.debug(LogCategory.SYSTEM, 'Cleared tracked resources');
  }

  /**
   * Start memory monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const stats = this.getMemoryStats();
      const percentage = stats.percentage;

      // Log memory stats periodically
      logger.debug(LogCategory.SYSTEM, 'Memory usage:', {
        heapUsed: `${Math.round(stats.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(stats.heapTotal / 1024 / 1024)}MB`,
        percentage: `${Math.round(percentage * 100)}%`
      });

      // Check thresholds
      if (percentage >= this.thresholds.emergency) {
        logger.error(LogCategory.SYSTEM, 'Emergency memory threshold exceeded!');
        this.performCleanup('emergency');
      } else if (percentage >= this.thresholds.critical) {
        logger.warn(LogCategory.SYSTEM, 'Critical memory threshold exceeded');
        this.performCleanup('critical');
      } else if (percentage >= this.thresholds.warning) {
        logger.info(LogCategory.SYSTEM, 'Warning memory threshold exceeded');
        this.performCleanup('warning');
      }

      // Emit memory stats for monitoring
      this.emit('memory:stats', stats);

    }, this.MONITOR_INTERVAL);
  }

  /**
   * Set up process event handlers
   */
  private setupProcessHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error(LogCategory.SYSTEM, 'Uncaught exception:', error);
      this.performEmergencyCleanup();
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error(LogCategory.SYSTEM, 'Unhandled rejection:', reason);
    });

    // Handle warnings
    process.on('warning', (warning) => {
      logger.warn(LogCategory.SYSTEM, 'Process warning:', warning);

      // Check for memory-related warnings
      if (warning.message.includes('memory')) {
        this.performCleanup('warning');
      }
    });

    // Handle shutdown
    const shutdownHandler = async () => {
      logger.info(LogCategory.SYSTEM, 'MemoryManager shutting down...');

      // Stop monitoring
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }

      // Clean up all services
      await this.performCleanup('emergency');

      // Clear all tracked resources
      this.clearTrackedResources();

      logger.info(LogCategory.SYSTEM, 'MemoryManager shutdown complete');
    };

    process.once('SIGINT', shutdownHandler);
    process.once('SIGTERM', shutdownHandler);
  }

  /**
   * Perform emergency cleanup
   */
  private async performEmergencyCleanup(): Promise<void> {
    logger.error(LogCategory.SYSTEM, 'Performing emergency cleanup');

    try {
      // Clear all tracked resources immediately
      this.clearTrackedResources();

      // Clean up all services
      await this.performCleanup('emergency');

      // Force multiple garbage collections
      if (global.gc) {
        for (let i = 0; i < 3; i++) {
          global.gc();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Error during emergency cleanup:', error);
    }
  }

  /**
   * Get detailed memory report
   */
  getMemoryReport(): {
    stats: ReturnType<typeof this.getMemoryStats>;
    services: { name: string; memory: number }[];
    trackedResources: {
      eventListeners: number;
      intervals: number;
      timeouts: number;
    };
  } {
    const stats = this.getMemoryStats();

    const services = Array.from(this.services.entries()).map(([name, service]) => ({
      name,
      memory: service.getMemoryUsage()
    }));

    return {
      stats,
      services,
      trackedResources: {
        eventListeners: this.eventListeners.size,
        intervals: this.intervals.size,
        timeouts: this.timeouts.size
      }
    };
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();