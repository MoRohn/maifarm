/**
 * Error Recovery Service - Comprehensive error handling and recovery
 *
 * Provides:
 * - Automatic error recovery with exponential backoff
 * - Circuit breaker pattern for failing services
 * - Error classification and prioritization
 * - Recovery strategies based on error types
 * - Detailed error metrics and reporting
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { db } from '../database/connection';
import { redisClientManager } from './redisClientManager';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  DATABASE = 'database',
  REDIS = 'redis',
  NETWORK = 'network',
  FILESYSTEM = 'filesystem',
  TMUX = 'tmux',
  API = 'api',
  MEMORY = 'memory',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown'
}

export interface ErrorContext {
  service: string;
  operation: string;
  farmId?: string;
  agentId?: string;
  userId?: string;
  metadata?: any;
}

export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'circuit-break' | 'escalate';
  maxAttempts?: number;
  backoffMultiplier?: number;
  fallbackAction?: () => Promise<any>;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
}

export interface ErrorRecord {
  id: string;
  timestamp: Date;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  context: ErrorContext;
  recoveryAttempts: number;
  recovered: boolean;
  recoveryStrategy?: RecoveryStrategy;
}

interface CircuitBreaker {
  service: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successCount: number;
  lastFailure?: Date;
  nextRetry?: Date;
}

class ErrorRecoveryService extends EventEmitter {
  private static instance: ErrorRecoveryService;
  private errorHistory: Map<string, ErrorRecord[]> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private recoveryQueues: Map<ErrorCategory, Array<() => Promise<void>>> = new Map();
  private metrics: {
    totalErrors: number;
    recoveredErrors: number;
    failedRecoveries: number;
    circuitBreaksTriggered: number;
  } = {
    totalErrors: 0,
    recoveredErrors: 0,
    failedRecoveries: 0,
    circuitBreaksTriggered: 0
  };

  // Recovery strategies by error category
  private readonly RECOVERY_STRATEGIES: Record<ErrorCategory, RecoveryStrategy> = {
    [ErrorCategory.DATABASE]: {
      type: 'retry',
      maxAttempts: 5,
      backoffMultiplier: 2
    },
    [ErrorCategory.REDIS]: {
      type: 'circuit-break',
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 30000,
      maxAttempts: 3
    },
    [ErrorCategory.NETWORK]: {
      type: 'retry',
      maxAttempts: 3,
      backoffMultiplier: 1.5
    },
    [ErrorCategory.FILESYSTEM]: {
      type: 'fallback',
      maxAttempts: 2,
      fallbackAction: async () => {
        logger.warn(LogCategory.ERROR, 'Filesystem fallback: Using in-memory storage');
      }
    },
    [ErrorCategory.TMUX]: {
      type: 'retry',
      maxAttempts: 3,
      backoffMultiplier: 1
    },
    [ErrorCategory.API]: {
      type: 'circuit-break',
      circuitBreakerThreshold: 10,
      circuitBreakerTimeout: 60000
    },
    [ErrorCategory.MEMORY]: {
      type: 'escalate',
      maxAttempts: 1
    },
    [ErrorCategory.TIMEOUT]: {
      type: 'retry',
      maxAttempts: 2,
      backoffMultiplier: 2
    },
    [ErrorCategory.VALIDATION]: {
      type: 'escalate',
      maxAttempts: 1
    },
    [ErrorCategory.UNKNOWN]: {
      type: 'retry',
      maxAttempts: 2,
      backoffMultiplier: 1.5
    }
  };

  private constructor() {
    super();
    this.setupErrorHandlers();
    this.startMetricsReporting();
  }

  static getInstance(): ErrorRecoveryService {
    if (!ErrorRecoveryService.instance) {
      ErrorRecoveryService.instance = new ErrorRecoveryService();
    }
    return ErrorRecoveryService.instance;
  }

  /**
   * Setup global error handlers
   */
  private setupErrorHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error(LogCategory.ERROR, 'Uncaught Exception:', error);
      this.handleError(error, {
        service: 'global',
        operation: 'uncaughtException'
      }, ErrorSeverity.CRITICAL);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error(LogCategory.ERROR, 'Unhandled Promise Rejection:', reason);
      this.handleError(new Error(reason), {
        service: 'global',
        operation: 'unhandledRejection'
      }, ErrorSeverity.HIGH);
    });

    // Handle process warnings
    process.on('warning', (warning: Error) => {
      logger.warn(LogCategory.ERROR, 'Process Warning:', warning);
      this.handleError(warning, {
        service: 'global',
        operation: 'processWarning'
      }, ErrorSeverity.LOW);
    });
  }

  /**
   * Handle an error with automatic recovery
   */
  async handleError(
    error: Error,
    context: ErrorContext,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): Promise<boolean> {
    this.metrics.totalErrors++;

    const category = this.categorizeError(error);
    const errorRecord: ErrorRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      category,
      severity,
      message: error.message,
      stack: error.stack,
      context,
      recoveryAttempts: 0,
      recovered: false
    };

    // Store error history
    this.addToHistory(context.service, errorRecord);

    // Log error
    this.logError(errorRecord);

    // Check circuit breaker
    if (this.isCircuitOpen(context.service)) {
      logger.warn(LogCategory.ERROR, `Circuit breaker open for ${context.service}`);
      this.metrics.circuitBreaksTriggered++;
      return false;
    }

    // Attempt recovery
    const recovered = await this.attemptRecovery(errorRecord);

    if (recovered) {
      this.metrics.recoveredErrors++;
      errorRecord.recovered = true;
      this.emit('errorRecovered', errorRecord);
    } else {
      this.metrics.failedRecoveries++;
      this.emit('recoveryFailed', errorRecord);

      // Update circuit breaker
      this.updateCircuitBreaker(context.service, false);
    }

    // Send alerts for critical errors
    if (severity === ErrorSeverity.CRITICAL && !recovered) {
      await this.sendCriticalAlert(errorRecord);
    }

    return recovered;
  }

  /**
   * Categorize error based on its properties
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    if (message.includes('database') || message.includes('postgres') || message.includes('pg')) {
      return ErrorCategory.DATABASE;
    }

    if (message.includes('redis') || message.includes('cache')) {
      return ErrorCategory.REDIS;
    }

    if (message.includes('econnrefused') || message.includes('timeout') || message.includes('network')) {
      return ErrorCategory.NETWORK;
    }

    if (message.includes('enoent') || message.includes('eacces') || message.includes('file')) {
      return ErrorCategory.FILESYSTEM;
    }

    if (message.includes('tmux') || message.includes('session') || message.includes('pane')) {
      return ErrorCategory.TMUX;
    }

    if (message.includes('api') || message.includes('request') || message.includes('response')) {
      return ErrorCategory.API;
    }

    if (message.includes('heap') || message.includes('memory') || stack.includes('oom')) {
      return ErrorCategory.MEMORY;
    }

    if (message.includes('timeout') || message.includes('deadline')) {
      return ErrorCategory.TIMEOUT;
    }

    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Attempt to recover from an error
   */
  private async attemptRecovery(errorRecord: ErrorRecord): Promise<boolean> {
    const strategy = this.RECOVERY_STRATEGIES[errorRecord.category];
    errorRecord.recoveryStrategy = strategy;

    switch (strategy.type) {
      case 'retry':
        return await this.retryWithBackoff(errorRecord, strategy);

      case 'fallback':
        return await this.executeFallback(errorRecord, strategy);

      case 'circuit-break':
        return await this.handleCircuitBreak(errorRecord, strategy);

      case 'escalate':
        return await this.escalateError(errorRecord);

      default:
        return false;
    }
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff(
    errorRecord: ErrorRecord,
    strategy: RecoveryStrategy
  ): Promise<boolean> {
    const maxAttempts = strategy.maxAttempts || 3;
    const backoffMultiplier = strategy.backoffMultiplier || 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      errorRecord.recoveryAttempts = attempt;

      // Calculate delay
      const delay = Math.min(1000 * Math.pow(backoffMultiplier, attempt - 1), 30000);

      logger.info(LogCategory.ERROR,
        `Recovery attempt ${attempt}/${maxAttempts} for ${errorRecord.context.service} after ${delay}ms`
      );

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        // Attempt operation based on context
        const success = await this.retryOperation(errorRecord.context);

        if (success) {
          logger.info(LogCategory.ERROR,
            `Recovery successful for ${errorRecord.context.service} on attempt ${attempt}`
          );
          return true;
        }
      } catch (retryError) {
        logger.debug(LogCategory.ERROR,
          `Recovery attempt ${attempt} failed:`, retryError
        );
      }
    }

    return false;
  }

  /**
   * Execute fallback action
   */
  private async executeFallback(
    errorRecord: ErrorRecord,
    strategy: RecoveryStrategy
  ): Promise<boolean> {
    try {
      if (strategy.fallbackAction) {
        await strategy.fallbackAction();
        logger.info(LogCategory.ERROR, `Fallback executed for ${errorRecord.context.service}`);
        return true;
      }
      return false;
    } catch (fallbackError) {
      logger.error(LogCategory.ERROR, 'Fallback execution failed:', fallbackError);
      return false;
    }
  }

  /**
   * Handle circuit breaker pattern
   */
  private async handleCircuitBreak(
    errorRecord: ErrorRecord,
    strategy: RecoveryStrategy
  ): Promise<boolean> {
    const service = errorRecord.context.service;
    let breaker = this.circuitBreakers.get(service);

    if (!breaker) {
      breaker = {
        service,
        state: 'closed',
        failures: 0,
        successCount: 0
      };
      this.circuitBreakers.set(service, breaker);
    }

    breaker.failures++;
    breaker.lastFailure = new Date();

    // Check if threshold reached
    if (breaker.failures >= (strategy.circuitBreakerThreshold || 5)) {
      breaker.state = 'open';
      breaker.nextRetry = new Date(Date.now() + (strategy.circuitBreakerTimeout || 30000));

      logger.warn(LogCategory.ERROR,
        `Circuit breaker opened for ${service}. Next retry at ${breaker.nextRetry}`
      );

      this.metrics.circuitBreaksTriggered++;

      // Schedule circuit reset
      setTimeout(() => {
        this.resetCircuitBreaker(service);
      }, strategy.circuitBreakerTimeout || 30000);

      return false;
    }

    // Try retry with backoff
    return await this.retryWithBackoff(errorRecord, strategy);
  }

  /**
   * Escalate error to higher level
   */
  private async escalateError(errorRecord: ErrorRecord): Promise<boolean> {
    logger.error(LogCategory.ERROR,
      `Escalating error for ${errorRecord.context.service}: ${errorRecord.message}`
    );

    // Send alert
    await this.sendCriticalAlert(errorRecord);

    // Emit escalation event
    this.emit('errorEscalated', errorRecord);

    return false;
  }

  /**
   * Retry specific operation based on context
   */
  private async retryOperation(context: ErrorContext): Promise<boolean> {
    try {
      switch (context.service) {
        case 'database':
          // Test database connection
          await db.query('SELECT 1');
          return true;

        case 'redis':
          // Test Redis connection
          if (redisClientManager.isConnected()) {
            const client = redisClientManager.getRegularClient();
            await client.ping();
            return true;
          }
          return false;

        case 'filesystem':
          // Test filesystem access
          const fs = await import('fs/promises');
          await fs.access('/tmp', fs.constants.W_OK);
          return true;

        default:
          // Generic health check
          return true;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitOpen(service: string): boolean {
    const breaker = this.circuitBreakers.get(service);

    if (!breaker) return false;

    if (breaker.state === 'open') {
      // Check if ready for half-open
      if (breaker.nextRetry && new Date() >= breaker.nextRetry) {
        breaker.state = 'half-open';
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Update circuit breaker state
   */
  private updateCircuitBreaker(service: string, success: boolean): void {
    let breaker = this.circuitBreakers.get(service);

    if (!breaker) {
      breaker = {
        service,
        state: 'closed',
        failures: 0,
        successCount: 0
      };
      this.circuitBreakers.set(service, breaker);
    }

    if (success) {
      if (breaker.state === 'half-open') {
        breaker.successCount++;
        if (breaker.successCount >= 3) {
          // Close circuit after successful operations
          breaker.state = 'closed';
          breaker.failures = 0;
          breaker.successCount = 0;
          logger.info(LogCategory.ERROR, `Circuit breaker closed for ${service}`);
        }
      }
    } else {
      breaker.failures++;
      if (breaker.state === 'half-open') {
        // Reopen circuit on failure in half-open state
        breaker.state = 'open';
        breaker.nextRetry = new Date(Date.now() + 60000);
        logger.warn(LogCategory.ERROR, `Circuit breaker reopened for ${service}`);
      }
    }
  }

  /**
   * Reset circuit breaker to half-open state
   */
  private resetCircuitBreaker(service: string): void {
    const breaker = this.circuitBreakers.get(service);
    if (breaker && breaker.state === 'open') {
      breaker.state = 'half-open';
      breaker.successCount = 0;
      logger.info(LogCategory.ERROR, `Circuit breaker half-open for ${service}`);
    }
  }

  /**
   * Add error to history
   */
  private addToHistory(service: string, errorRecord: ErrorRecord): void {
    let history = this.errorHistory.get(service) || [];
    history.push(errorRecord);

    // Keep only last 100 errors per service
    if (history.length > 100) {
      history = history.slice(-100);
    }

    this.errorHistory.set(service, history);
  }

  /**
   * Log error based on severity
   */
  private logError(errorRecord: ErrorRecord): void {
    const message = `[${errorRecord.context.service}] ${errorRecord.context.operation}: ${errorRecord.message}`;

    switch (errorRecord.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error(LogCategory.ERROR, `CRITICAL: ${message}`, errorRecord.stack);
        break;
      case ErrorSeverity.HIGH:
        logger.error(LogCategory.ERROR, `HIGH: ${message}`);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn(LogCategory.ERROR, `MEDIUM: ${message}`);
        break;
      case ErrorSeverity.LOW:
        logger.info(LogCategory.ERROR, `LOW: ${message}`);
        break;
    }
  }

  /**
   * Send critical alert
   */
  private async sendCriticalAlert(errorRecord: ErrorRecord): Promise<void> {
    // Log to database
    try {
      await db.query(
        `INSERT INTO alerts (severity, category, message, context, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          errorRecord.severity,
          errorRecord.category,
          errorRecord.message,
          JSON.stringify(errorRecord.context),
          errorRecord.timestamp
        ]
      );
    } catch (dbError) {
      logger.error(LogCategory.ERROR, 'Failed to log alert to database:', dbError);
    }

    // Send WebSocket notification
    websocketManager.broadcast('alert:critical', {
      errorId: errorRecord.id,
      severity: errorRecord.severity,
      category: errorRecord.category,
      message: errorRecord.message,
      context: errorRecord.context,
      timestamp: errorRecord.timestamp
    });

    // Emit event for external handlers
    this.emit('criticalAlert', errorRecord);
  }

  /**
   * Start periodic metrics reporting
   */
  private startMetricsReporting(): void {
    setInterval(() => {
      const report = this.getMetricsReport();
      logger.info(LogCategory.ERROR, 'Error Recovery Metrics:', report);

      // Broadcast metrics
      websocketManager.broadcast('metrics:errorRecovery', report);
    }, 60000); // Every minute
  }

  /**
   * Get metrics report
   */
  getMetricsReport(): any {
    const circuitBreakerStatus: any = {};
    for (const [service, breaker] of this.circuitBreakers) {
      circuitBreakerStatus[service] = {
        state: breaker.state,
        failures: breaker.failures,
        lastFailure: breaker.lastFailure
      };
    }

    return {
      ...this.metrics,
      errorRate: this.metrics.totalErrors > 0
        ? (this.metrics.failedRecoveries / this.metrics.totalErrors) * 100
        : 0,
      recoveryRate: this.metrics.totalErrors > 0
        ? (this.metrics.recoveredErrors / this.metrics.totalErrors) * 100
        : 0,
      circuitBreakers: circuitBreakerStatus,
      errorsByCategory: this.getErrorsByCategory()
    };
  }

  /**
   * Get error count by category
   */
  private getErrorsByCategory(): Record<ErrorCategory, number> {
    const counts: Partial<Record<ErrorCategory, number>> = {};

    for (const history of this.errorHistory.values()) {
      for (const error of history) {
        counts[error.category] = (counts[error.category] || 0) + 1;
      }
    }

    return counts as Record<ErrorCategory, number>;
  }

  /**
   * Get error history for a service
   */
  getErrorHistory(service: string): ErrorRecord[] {
    return this.errorHistory.get(service) || [];
  }

  /**
   * Clear error history
   */
  clearHistory(service?: string): void {
    if (service) {
      this.errorHistory.delete(service);
    } else {
      this.errorHistory.clear();
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalErrors: 0,
      recoveredErrors: 0,
      failedRecoveries: 0,
      circuitBreaksTriggered: 0
    };
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.ERROR, 'Shutting down ErrorRecoveryService');

    // Clear all timers and listeners
    this.removeAllListeners();
    this.errorHistory.clear();
    this.circuitBreakers.clear();
    this.recoveryQueues.clear();
  }
}

// Export singleton instance
export const errorRecoveryService = ErrorRecoveryService.getInstance();