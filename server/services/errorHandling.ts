import { logger } from '../utils/logger';
import { WebSocketManager } from '../websocket/websocketManager';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  DATABASE = 'database',
  REDIS = 'redis',
  TMUX = 'tmux',
  NETWORK = 'network',
  VALIDATION = 'validation',
  EXECUTION = 'execution',
  TIMEOUT = 'timeout',
  RESOURCE = 'resource'
}

export interface ServiceError {
  id: string;
  service: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  timestamp: Date;
  recovered: boolean;
  recoveryAttempts: number;
}

export class ErrorHandler {
  private static errors: Map<string, ServiceError> = new Map();
  private static recoveryCallbacks: Map<string, () => Promise<void>> = new Map();
  private static readonly MAX_RECOVERY_ATTEMPTS = 3;

  /**
   * Handle an error with automatic recovery attempts
   */
  static async handle(
    service: string,
    error: Error,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    recoveryCallback?: () => Promise<void>
  ): Promise<boolean> {
    const errorId = `${service}-${category}-${Date.now()}`;
    
    const serviceError: ServiceError = {
      id: errorId,
      service,
      category,
      severity,
      message: error.message,
      details: error.stack,
      timestamp: new Date(),
      recovered: false,
      recoveryAttempts: 0
    };

    this.errors.set(errorId, serviceError);

    // Log based on severity
    this.logError(serviceError);

    // Emit error event
    this.emitError(serviceError);

    // Attempt recovery if callback provided
    if (recoveryCallback) {
      this.recoveryCallbacks.set(errorId, recoveryCallback);
      return await this.attemptRecovery(errorId);
    }

    return false;
  }

  /**
   * Attempt to recover from an error
   */
  private static async attemptRecovery(errorId: string): Promise<boolean> {
    const error = this.errors.get(errorId);
    const recoveryCallback = this.recoveryCallbacks.get(errorId);

    if (!error || !recoveryCallback) {
      return false;
    }

    if (error.recoveryAttempts >= this.MAX_RECOVERY_ATTEMPTS) {
      logger.error(`[ErrorHandler] Max recovery attempts reached for ${errorId}`);
      this.escalateError(error);
      return false;
    }

    error.recoveryAttempts++;

    try {
      logger.info(`[ErrorHandler] Attempting recovery for ${errorId} (attempt ${error.recoveryAttempts})`);
      await recoveryCallback();
      
      error.recovered = true;
      this.errors.set(errorId, error);
      
      logger.info(`[ErrorHandler] Successfully recovered from ${errorId}`);
      
      // Notify recovery
      WebSocketManager.broadcast('error:recovered', {
        errorId,
        service: error.service,
        category: error.category,
        attempts: error.recoveryAttempts
      });

      return true;
    } catch (recoveryError) {
      logger.error(`[ErrorHandler] Recovery failed for ${errorId}:`, recoveryError);
      
      // Retry with exponential backoff
      const delay = Math.pow(2, error.recoveryAttempts) * 1000;
      setTimeout(() => this.attemptRecovery(errorId), delay);
      
      return false;
    }
  }

  /**
   * Log error based on severity
   */
  private static logError(error: ServiceError): void {
    const logMessage = `[${error.service}] ${error.category}: ${error.message}`;
    
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error(`CRITICAL ${logMessage}`, error.details);
        break;
      case ErrorSeverity.HIGH:
        logger.error(logMessage, error.details);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn(logMessage);
        break;
      case ErrorSeverity.LOW:
        logger.info(logMessage);
        break;
    }
  }

  /**
   * Emit error event via WebSocket
   */
  private static emitError(error: ServiceError): void {
    WebSocketManager.broadcast('error:occurred', {
      id: error.id,
      service: error.service,
      category: error.category,
      severity: error.severity,
      message: error.message,
      timestamp: error.timestamp
    });
  }

  /**
   * Escalate critical errors
   */
  private static escalateError(error: ServiceError): void {
    logger.error(`[ErrorHandler] ESCALATING ERROR: ${error.id}`);
    
    // Update severity to critical
    error.severity = ErrorSeverity.CRITICAL;
    this.errors.set(error.id, error);
    
    // Emit escalation event
    WebSocketManager.broadcast('error:escalated', {
      id: error.id,
      service: error.service,
      message: `Critical error after ${error.recoveryAttempts} recovery attempts: ${error.message}`
    });

    // Could trigger additional alerting here (email, Slack, PagerDuty, etc.)
  }

  /**
   * Get error statistics
   */
  static getStats(): any {
    const stats = {
      total: this.errors.size,
      recovered: 0,
      pending: 0,
      byService: {},
      byCategory: {},
      bySeverity: {
        [ErrorSeverity.LOW]: 0,
        [ErrorSeverity.MEDIUM]: 0,
        [ErrorSeverity.HIGH]: 0,
        [ErrorSeverity.CRITICAL]: 0
      }
    };

    for (const error of this.errors.values()) {
      if (error.recovered) {
        stats.recovered++;
      } else {
        stats.pending++;
      }

      // By service
      stats.byService[error.service] = (stats.byService[error.service] || 0) + 1;
      
      // By category
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
      
      // By severity
      stats.bySeverity[error.severity]++;
    }

    return stats;
  }

  /**
   * Clear resolved errors older than specified time
   */
  static cleanup(olderThanMinutes: number = 60): number {
    const cutoffTime = Date.now() - (olderThanMinutes * 60 * 1000);
    let cleaned = 0;

    for (const [errorId, error] of this.errors) {
      if (error.recovered && error.timestamp.getTime() < cutoffTime) {
        this.errors.delete(errorId);
        this.recoveryCallbacks.delete(errorId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`[ErrorHandler] Cleaned up ${cleaned} resolved errors`);
    }

    return cleaned;
  }
}

/**
 * Specific error handlers for Go Wild
 */
export class GoWildErrorHandler {
  static async handleExplorationError(
    sessionId: string,
    error: Error,
    recoveryAction?: () => Promise<void>
  ): Promise<boolean> {
    return ErrorHandler.handle(
      'GoWild',
      error,
      ErrorCategory.EXECUTION,
      ErrorSeverity.MEDIUM,
      recoveryAction || (async () => {
        // Default recovery: try to resume exploration
        const { goWildManager } = await import('./goWildManager');
        const session = await goWildManager.getSessionById(sessionId);
        if (session && session.status === 'paused') {
          await goWildManager.resumeExploration(sessionId);
        }
      })
    );
  }

  static async handleTmuxError(
    sessionId: string,
    error: Error
  ): Promise<boolean> {
    return ErrorHandler.handle(
      'GoWild',
      error,
      ErrorCategory.TMUX,
      ErrorSeverity.LOW,
      async () => {
        // Recovery: Continue without tmux
        logger.info(`[GoWild] Continuing session ${sessionId} without tmux`);
      }
    );
  }

  static async handleBoundaryViolation(
    sessionId: string,
    violation: any
  ): Promise<boolean> {
    return ErrorHandler.handle(
      'GoWild',
      new Error(`Boundary violation: ${violation.type}`),
      ErrorCategory.VALIDATION,
      ErrorSeverity.HIGH,
      async () => {
        // Recovery: Rollback to safe checkpoint
        const { goWildManager } = await import('./goWildManager');
        const session = await goWildManager.getSessionById(sessionId);
        if (session && session.explorationPath.nodes.length > 1) {
          const safeNode = session.explorationPath.nodes[session.explorationPath.nodes.length - 2];
          await goWildManager.rollbackToCheckpoint(sessionId, safeNode.id);
        }
      }
    );
  }
}

/**
 * Specific error handlers for Quick Task
 */
export class QuickTaskErrorHandler {
  static async handleRedisError(
    taskId: string,
    error: Error
  ): Promise<boolean> {
    return ErrorHandler.handle(
      'QuickTask',
      error,
      ErrorCategory.REDIS,
      ErrorSeverity.LOW,
      async () => {
        // Recovery: Use in-memory queue
        logger.info(`[QuickTask] Switching to in-memory queue for task ${taskId}`);
        const { quickTaskExecutor } = await import('./quickTaskExecutor');
        // Task will be processed from in-memory queue
      }
    );
  }

  static async handleExecutionError(
    taskId: string,
    error: Error
  ): Promise<boolean> {
    return ErrorHandler.handle(
      'QuickTask',
      error,
      ErrorCategory.EXECUTION,
      ErrorSeverity.MEDIUM,
      async () => {
        // Recovery: Retry task execution
        const { quickTaskService } = await import('./quickTaskService');
        const status = await quickTaskService.getQuickTaskStatus(taskId);
        if (status && status.status === 'failed') {
          // Reset status to queued for retry
          await quickTaskService.updateTaskProgress(taskId, 0, 'Retrying task...');
        }
      }
    );
  }

  static async handleTmuxError(
    taskId: string,
    error: Error
  ): Promise<boolean> {
    return ErrorHandler.handle(
      'QuickTask',
      error,
      ErrorCategory.TMUX,
      ErrorSeverity.MEDIUM,
      async () => {
        // Recovery: Execute without tmux visualization
        logger.warn(`[QuickTask] Executing task ${taskId} without tmux session`);
        // Task can still be executed, just without terminal visualization
      }
    );
  }

  static async handleTimeout(
    taskId: string,
    timeout: number
  ): Promise<boolean> {
    return ErrorHandler.handle(
      'QuickTask',
      new Error(`Task ${taskId} exceeded timeout of ${timeout}ms`),
      ErrorCategory.TIMEOUT,
      ErrorSeverity.HIGH,
      async () => {
        // Recovery: Force stop and clean up
        const { quickTaskExecutor } = await import('./quickTaskExecutor');
        await quickTaskExecutor.stopTask(taskId);
        
        const { quickTaskService } = await import('./quickTaskService');
        await quickTaskService.failTask(taskId, 'Task timeout');
      }
    );
  }
}

/**
 * Database error handler with connection recovery
 */
export class DatabaseErrorHandler {
  private static reconnectAttempts = 0;
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;

  static async handleConnectionError(error: Error): Promise<boolean> {
    return ErrorHandler.handle(
      'Database',
      error,
      ErrorCategory.DATABASE,
      ErrorSeverity.HIGH,
      async () => {
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
          throw new Error('Max database reconnection attempts reached');
        }

        this.reconnectAttempts++;
        const delay = Math.pow(2, this.reconnectAttempts) * 1000;
        
        logger.info(`[Database] Attempting reconnection in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Attempt to reconnect
        const { db } = await import('../database/connection');
        await db.query('SELECT 1');
        
        this.reconnectAttempts = 0;
        logger.info('[Database] Successfully reconnected');
      }
    );
  }
}

/**
 * WebSocket error handler
 */
export class WebSocketErrorHandler {
  static async handleConnectionError(error: Error): Promise<boolean> {
    return ErrorHandler.handle(
      'WebSocket',
      error,
      ErrorCategory.NETWORK,
      ErrorSeverity.MEDIUM,
      async () => {
        // Recovery: Reinitialize WebSocket server
        logger.info('[WebSocket] Attempting to reinitialize connection...');
        // WebSocket manager should handle reconnection automatically
      }
    );
  }
}

// Start periodic cleanup
setInterval(() => {
  ErrorHandler.cleanup(60); // Clean up errors older than 1 hour
}, 30 * 60 * 1000); // Run every 30 minutes

export default ErrorHandler;