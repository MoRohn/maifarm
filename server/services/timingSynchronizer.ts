/**
 * Timing Synchronization Service
 * Ensures proper sequencing and timing of farm operations
 */

import { EventEmitter } from 'events';
import { structuredLogger, LogCategory, LogContext } from '../utils/structuredLogger';
import { TIMING } from '../../shared/types/unified';

export interface TimedOperation {
  id: string;
  name: string;
  startTime: Date;
  expectedDuration: number;
  timeout: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  dependencies?: string[];
  retryCount?: number;
  maxRetries?: number;
}

export interface SynchronizationPoint {
  name: string;
  operations: string[];
  completed: Set<string>;
  timeout: number;
  callback?: () => void;
}

/**
 * Service to manage timing and synchronization of operations
 */
export class TimingSynchronizer extends EventEmitter {
  private static instance: TimingSynchronizer;
  private operations: Map<string, TimedOperation> = new Map();
  private syncPoints: Map<string, SynchronizationPoint> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  
  private constructor() {
    super();
  }
  
  static getInstance(): TimingSynchronizer {
    if (!TimingSynchronizer.instance) {
      TimingSynchronizer.instance = new TimingSynchronizer();
    }
    return TimingSynchronizer.instance;
  }
  
  /**
   * Start a timed operation with dependency checking
   */
  async startOperation(
    id: string,
    name: string,
    expectedDuration: number,
    options: {
      timeout?: number;
      dependencies?: string[];
      maxRetries?: number;
      context?: LogContext;
    } = {}
  ): Promise<void> {
    const { timeout = expectedDuration * 2, dependencies = [], maxRetries = 0, context } = options;
    
    // Check dependencies
    if (dependencies.length > 0) {
      const unmetDeps = dependencies.filter(depId => {
        const dep = this.operations.get(depId);
        return !dep || dep.status !== 'completed';
      });
      
      if (unmetDeps.length > 0) {
        structuredLogger.debug(LogCategory.SYSTEM, `Operation ${name} waiting for dependencies: ${unmetDeps.join(', ')}`, context);
        // Wait for dependencies with timeout
        await this.waitForDependencies(id, unmetDeps, timeout);
      }
    }
    
    const operation: TimedOperation = {
      id,
      name,
      startTime: new Date(),
      expectedDuration,
      timeout,
      status: 'running',
      dependencies,
      retryCount: 0,
      maxRetries
    };
    
    this.operations.set(id, operation);
    structuredLogger.info(LogCategory.SYSTEM, `Started operation: ${name}`, context);
    
    // Set timeout timer
    const timer = setTimeout(() => {
      this.handleTimeout(id);
    }, timeout);
    
    this.timers.set(id, timer);
    
    // Emit event
    this.emit('operation:started', operation);
  }
  
  /**
   * Complete an operation
   */
  completeOperation(id: string, context?: LogContext): void {
    const operation = this.operations.get(id);
    if (!operation) return;
    
    operation.status = 'completed';
    const duration = Date.now() - operation.startTime.getTime();
    
    structuredLogger.info(
      LogCategory.SYSTEM,
      `Completed operation: ${operation.name} in ${duration}ms`,
      context
    );
    
    // Clear timeout timer
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    
    // Check sync points
    this.checkSyncPoints(id);
    
    // Emit event
    this.emit('operation:completed', operation);
  }
  
  /**
   * Fail an operation with retry logic
   */
  async failOperation(id: string, error: Error, context?: LogContext): Promise<void> {
    const operation = this.operations.get(id);
    if (!operation) return;
    
    operation.retryCount = (operation.retryCount || 0) + 1;
    
    if (operation.retryCount <= (operation.maxRetries || 0)) {
      structuredLogger.warn(
        LogCategory.SYSTEM,
        `Operation ${operation.name} failed, retrying (${operation.retryCount}/${operation.maxRetries}): ${error.message}`,
        context
      );
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, operation.retryCount - 1), TIMING.RECOVERY_MAX_DELAY);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Reset and retry
      operation.status = 'running';
      operation.startTime = new Date();
      
      // Reset timeout
      const timer = this.timers.get(id);
      if (timer) clearTimeout(timer);
      
      const newTimer = setTimeout(() => {
        this.handleTimeout(id);
      }, operation.timeout);
      
      this.timers.set(id, newTimer);
      
      this.emit('operation:retrying', operation);
    } else {
      operation.status = 'failed';
      
      structuredLogger.error(
        LogCategory.SYSTEM,
        `Operation ${operation.name} failed after ${operation.retryCount} retries: ${error.message}`,
        context
      );
      
      // Clear timeout timer
      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(id);
      }
      
      this.emit('operation:failed', operation);
    }
  }
  
  /**
   * Handle operation timeout
   */
  private handleTimeout(id: string): void {
    const operation = this.operations.get(id);
    if (!operation || operation.status !== 'running') return;
    
    operation.status = 'timeout';
    
    structuredLogger.error(
      LogCategory.SYSTEM,
      `Operation ${operation.name} timed out after ${operation.timeout}ms`
    );
    
    this.timers.delete(id);
    this.emit('operation:timeout', operation);
  }
  
  /**
   * Wait for dependencies with timeout
   */
  private async waitForDependencies(
    operationId: string,
    dependencies: string[],
    timeout: number
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const unmet = dependencies.filter(depId => {
        const dep = this.operations.get(depId);
        return !dep || dep.status !== 'completed';
      });
      
      if (unmet.length === 0) {
        return; // All dependencies met
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Dependencies not met within timeout: ${dependencies.join(', ')}`);
  }
  
  /**
   * Create a synchronization point
   */
  createSyncPoint(
    name: string,
    operationIds: string[],
    timeout: number,
    callback?: () => void
  ): void {
    const syncPoint: SynchronizationPoint = {
      name,
      operations: operationIds,
      completed: new Set(),
      timeout,
      callback
    };
    
    this.syncPoints.set(name, syncPoint);
    
    // Set timeout for sync point
    setTimeout(() => {
      const point = this.syncPoints.get(name);
      if (point && point.completed.size < point.operations.length) {
        structuredLogger.error(
          LogCategory.SYSTEM,
          `Sync point ${name} timed out. Completed: ${point.completed.size}/${point.operations.length}`
        );
        this.emit('syncpoint:timeout', point);
      }
    }, timeout);
  }
  
  /**
   * Check if any sync points are satisfied
   */
  private checkSyncPoints(operationId: string): void {
    for (const [name, syncPoint] of this.syncPoints) {
      if (syncPoint.operations.includes(operationId)) {
        syncPoint.completed.add(operationId);
        
        if (syncPoint.completed.size === syncPoint.operations.length) {
          structuredLogger.info(
            LogCategory.SYSTEM,
            `Sync point ${name} reached. All operations completed.`
          );
          
          if (syncPoint.callback) {
            syncPoint.callback();
          }
          
          this.emit('syncpoint:reached', syncPoint);
          this.syncPoints.delete(name);
        }
      }
    }
  }
  
  /**
   * Get operation status
   */
  getOperationStatus(id: string): TimedOperation | undefined {
    return this.operations.get(id);
  }
  
  /**
   * Clear completed operations (cleanup)
   */
  clearCompleted(): void {
    for (const [id, operation] of this.operations) {
      if (operation.status === 'completed' || operation.status === 'failed') {
        this.operations.delete(id);
      }
    }
  }
  
  /**
   * Reset all operations (for testing)
   */
  reset(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    
    this.operations.clear();
    this.syncPoints.clear();
    this.timers.clear();
  }
}

// Export singleton instance
export const timingSynchronizer = TimingSynchronizer.getInstance();