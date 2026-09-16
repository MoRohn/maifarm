/**
 * XenoSync Performance Optimizer
 * Addresses critical performance bottlenecks in XenoSync integration
 */

import { logger, LogCategory } from '../utils/logger';
import { structuredLogger, LogContext } from '../utils/structuredLogger';
import { EventEmitter } from 'events';
import * as os from 'os';

interface PerformanceMetrics {
  terminalLatency: number;
  sessionCreationTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  activeConnections: number;
  queuedMessages: number;
}

interface OptimizationStrategy {
  name: string;
  condition: (metrics: PerformanceMetrics) => boolean;
  apply: () => Promise<void>;
  priority: number;
}

export class XenoSyncPerformanceOptimizer extends EventEmitter {
  private static instance: XenoSyncPerformanceOptimizer;
  private metrics: PerformanceMetrics;
  private strategies: OptimizationStrategy[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITOR_INTERVAL = 5000; // 5 seconds
  private readonly LATENCY_THRESHOLD = 100; // 100ms
  private readonly MEMORY_THRESHOLD = 0.8; // 80% of available memory
  
  private constructor() {
    super();
    this.metrics = this.initializeMetrics();
    this.setupOptimizationStrategies();
  }
  
  static getInstance(): XenoSyncPerformanceOptimizer {
    if (!XenoSyncPerformanceOptimizer.instance) {
      XenoSyncPerformanceOptimizer.instance = new XenoSyncPerformanceOptimizer();
    }
    return XenoSyncPerformanceOptimizer.instance;
  }
  
  private initializeMetrics(): PerformanceMetrics {
    return {
      terminalLatency: 0,
      sessionCreationTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      activeConnections: 0,
      queuedMessages: 0
    };
  }
  
  private setupOptimizationStrategies(): void {
    // Strategy 1: Reduce terminal streaming frequency under high load
    this.strategies.push({
      name: 'ReduceStreamingFrequency',
      condition: (m) => m.terminalLatency > this.LATENCY_THRESHOLD,
      apply: async () => {
        structuredLogger.info(LogCategory.SYSTEM, 'Applying terminal streaming frequency reduction', {
          correlationId: 'perf-opt-001',
          strategy: 'ReduceStreamingFrequency'
        });
        
        // Implement adaptive streaming interval
        // NOTE: UnifiedTerminalStreamService doesn't yet implement setCaptureInterval
        // This optimization is preserved for future implementation
        const { unifiedTerminalStreamService } = await import('./UnifiedTerminalStreamService');
        const service = (unifiedTerminalStreamService as any);
        if (service.setCaptureInterval) {
          service.setCaptureInterval(2000); // Increase to 2s during high load
        }
      },
      priority: 1
    });
    
    // Strategy 2: Cache session lookups more aggressively
    this.strategies.push({
      name: 'ExtendSessionCache',
      condition: (m) => m.sessionCreationTime > 1000, // > 1 second
      apply: async () => {
        structuredLogger.info(LogCategory.SYSTEM, 'Extending session cache TTL', {
          correlationId: 'perf-opt-002',
          strategy: 'ExtendSessionCache'
        });
        
        const { sessionManager } = await import('./sessionManager');
        // Extend cache TTL to 60 seconds
        (sessionManager as any).setCacheTTL?.(60000);
      },
      priority: 2
    });
    
    // Strategy 3: Batch WebSocket messages
    this.strategies.push({
      name: 'BatchWebSocketMessages',
      condition: (m) => m.queuedMessages > 100,
      apply: async () => {
        structuredLogger.info(LogCategory.WEBSOCKET, 'Enabling message batching', {
          correlationId: 'perf-opt-003',
          strategy: 'BatchWebSocketMessages'
        });
        
        const { websocketManager } = await import('../websocket/websocketManager');
        (websocketManager as any).enableBatching?.(true, 50); // Batch size of 50
      },
      priority: 3
    });
    
    // Strategy 4: Memory pressure relief
    this.strategies.push({
      name: 'MemoryPressureRelief',
      condition: (m) => {
        const totalMem = os.totalmem();
        const usedMem = totalMem - os.freemem();
        return (usedMem / totalMem) > this.MEMORY_THRESHOLD;
      },
      apply: async () => {
        structuredLogger.warn(LogCategory.SYSTEM, 'High memory usage detected, triggering garbage collection', {
          correlationId: 'perf-opt-004',
          strategy: 'MemoryPressureRelief'
        });
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        // Clear caches
        await this.clearCaches();
      },
      priority: 0 // Highest priority
    });
  }
  
  /**
   * Start performance monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return;
    }
    
    structuredLogger.info(LogCategory.SYSTEM, 'Starting XenoSync performance monitoring');
    
    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
      await this.applyOptimizations();
    }, this.MONITOR_INTERVAL);
  }
  
  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      structuredLogger.info(LogCategory.SYSTEM, 'Stopped XenoSync performance monitoring');
    }
  }
  
  /**
   * Collect current performance metrics
   */
  private async collectMetrics(): Promise<void> {
    const startTime = Date.now();
    
    // Update basic metrics
    this.metrics.memoryUsage = process.memoryUsage();
    this.metrics.cpuUsage = process.cpuUsage();
    
    // Measure terminal latency (simplified)
    // NOTE: UnifiedTerminalStreamService doesn't yet implement getAverageLatency
    try {
      const { unifiedTerminalStreamService } = await import('./UnifiedTerminalStreamService');
      const service = (unifiedTerminalStreamService as any);
      if (service.getAverageLatency) {
        this.metrics.terminalLatency = await service.getAverageLatency();
      }
    } catch (error) {
      // Service might not be available
    }
    
    // Count active WebSocket connections
    try {
      const { websocketManager } = await import('../websocket/websocketManager');
      this.metrics.activeConnections = (websocketManager as any).getActiveConnections?.() || 0;
      this.metrics.queuedMessages = (websocketManager as any).getQueuedMessageCount?.() || 0;
    } catch (error) {
      // Service might not be available
    }
    
    const collectTime = Date.now() - startTime;
    if (collectTime > 100) {
      structuredLogger.warn(LogCategory.SYSTEM, `Metrics collection took ${collectTime}ms`);
    }
  }
  
  /**
   * Apply optimization strategies based on current metrics
   */
  private async applyOptimizations(): Promise<void> {
    // Sort strategies by priority (lower number = higher priority)
    const sortedStrategies = [...this.strategies].sort((a, b) => a.priority - b.priority);
    
    for (const strategy of sortedStrategies) {
      if (strategy.condition(this.metrics)) {
        try {
          await strategy.apply();
          this.emit('optimization:applied', {
            strategy: strategy.name,
            metrics: this.metrics
          });
        } catch (error) {
          structuredLogger.error(LogCategory.SYSTEM, 
            `Failed to apply optimization strategy: ${strategy.name}`, 
            undefined, 
            error
          );
        }
      }
    }
  }
  
  /**
   * Clear various caches to free memory
   */
  private async clearCaches(): Promise<void> {
    // Clear session name cache
    const { sessionManager } = await import('./sessionManager');
    (sessionManager as any).clearCache?.();
    
    // Clear terminal output buffers
    // NOTE: UnifiedTerminalStreamService doesn't yet implement clearBuffers
    const { unifiedTerminalStreamService } = await import('./UnifiedTerminalStreamService');
    (unifiedTerminalStreamService as any).clearBuffers?.();
    
    // Clear structured logger correlation store
    structuredLogger.cleanupOldCorrelations();
    
    structuredLogger.info(LogCategory.SYSTEM, 'Cleared caches to free memory');
  }
  
  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Record terminal operation latency
   */
  recordTerminalLatency(latencyMs: number): void {
    // Use exponential moving average for smoothing
    const alpha = 0.3;
    this.metrics.terminalLatency = alpha * latencyMs + (1 - alpha) * this.metrics.terminalLatency;
    
    if (latencyMs > this.LATENCY_THRESHOLD * 2) {
      structuredLogger.warn(LogCategory.TERMINAL, 
        `High terminal latency detected: ${latencyMs}ms`, 
        { latency: latencyMs }
      );
    }
  }
  
  /**
   * Record session creation time
   */
  recordSessionCreationTime(timeMs: number): void {
    this.metrics.sessionCreationTime = timeMs;
    
    if (timeMs > 3000) {
      structuredLogger.warn(LogCategory.SYSTEM, 
        `Slow session creation: ${timeMs}ms`, 
        { creationTime: timeMs }
      );
    }
  }
}

// Export singleton instance
export const xenoSyncPerformanceOptimizer = XenoSyncPerformanceOptimizer.getInstance();