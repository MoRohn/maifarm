/**
 * Unified Error Types for MaiFarm Application
 * Provides structured error handling across all services
 */

export enum ErrorCode {
  // General Errors (1000-1099)
  UNKNOWN = 1000,
  INTERNAL_SERVER = 1001,
  VALIDATION_FAILED = 1002,
  NOT_FOUND = 1003,
  ALREADY_EXISTS = 1004,
  OPERATION_FAILED = 1005,
  TIMEOUT = 1006,
  RATE_LIMITED = 1007,

  // Authentication & Authorization (1100-1199)
  UNAUTHORIZED = 1100,
  FORBIDDEN = 1101,
  TOKEN_EXPIRED = 1102,
  TOKEN_INVALID = 1103,
  API_KEY_INVALID = 1104,
  API_KEY_MISSING = 1105,
  SESSION_EXPIRED = 1106,

  // Database Errors (1200-1299)
  DB_CONNECTION_FAILED = 1200,
  DB_QUERY_FAILED = 1201,
  DB_TRANSACTION_FAILED = 1202,
  DB_MIGRATION_FAILED = 1203,
  DB_CONSTRAINT_VIOLATION = 1204,
  DB_DEADLOCK = 1205,

  // Farm Management Errors (1300-1399)
  FARM_NOT_FOUND = 1300,
  FARM_LAUNCH_FAILED = 1301,
  FARM_ALREADY_RUNNING = 1302,
  FARM_TIMEOUT = 1303,
  FARM_INVALID_CONFIG = 1304,
  FARM_WORKSPACE_ERROR = 1305,
  FARM_ORPHANED = 1306,

  // Agent Errors (1400-1499)
  AGENT_NOT_FOUND = 1400,
  AGENT_LAUNCH_FAILED = 1401,
  AGENT_UNHEALTHY = 1402,
  AGENT_DISCONNECTED = 1403,
  AGENT_RECOVERY_FAILED = 1404,
  AGENT_COUNT_INVALID = 1405,
  AGENT_TASK_FAILED = 1406,

  // Task Errors (1500-1599)
  TASK_NOT_FOUND = 1500,
  TASK_EXECUTION_FAILED = 1501,
  TASK_TIMEOUT = 1502,
  TASK_CANCELLED = 1503,
  TASK_DEPENDENCY_FAILED = 1504,
  QUICK_TASK_FAILED = 1505,

  // Terminal & Tmux Errors (1600-1699)
  TMUX_SESSION_NOT_FOUND = 1600,
  TMUX_LAUNCH_FAILED = 1601,
  TMUX_PIPE_FAILED = 1602,
  TERMINAL_STREAM_FAILED = 1603,
  TERMINAL_OUTPUT_ERROR = 1604,
  SESSION_RECOVERY_FAILED = 1605,

  // Harvest Errors (1700-1799)
  HARVEST_NOT_FOUND = 1700,
  HARVEST_COLLECTION_FAILED = 1701,
  HARVEST_DIRECTORY_ERROR = 1702,
  HARVEST_INTEGRITY_FAILED = 1703,
  HARVEST_EXPORT_FAILED = 1704,

  // WebSocket Errors (1800-1899)
  WS_CONNECTION_FAILED = 1800,
  WS_BROADCAST_FAILED = 1801,
  WS_ROOM_NOT_FOUND = 1802,
  WS_MESSAGE_INVALID = 1803,

  // AI Provider Errors (1900-1999)
  PROVIDER_NOT_CONFIGURED = 1900,
  PROVIDER_API_ERROR = 1901,
  PROVIDER_RATE_LIMITED = 1902,
  PROVIDER_QUOTA_EXCEEDED = 1903,
  PROVIDER_MODEL_NOT_FOUND = 1904,

  // File System Errors (2000-2099)
  FILE_NOT_FOUND = 2000,
  FILE_ACCESS_DENIED = 2001,
  FILE_WRITE_FAILED = 2002,
  DIRECTORY_CREATE_FAILED = 2003,
  PATH_VALIDATION_FAILED = 2004,

  // Barn & Storage Errors (2100-2199)
  BARN_ITEM_NOT_FOUND = 2100,
  BARN_SYNC_FAILED = 2101,
  BARN_ACCESS_DENIED = 2102,

  // Validation Errors (2200-2299)
  YAML_INVALID = 2200,
  CONFIG_INVALID = 2201,
  INPUT_INVALID = 2202,
  SCHEMA_VALIDATION_FAILED = 2203
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorContext {
  correlationId?: string;
  userId?: string;
  farmId?: string;
  agentId?: string;
  taskId?: string;
  sessionName?: string;
  [key: string]: any;
}

export class MaiFarmError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly context?: ErrorContext;
  public readonly timestamp: Date;
  public readonly isRetryable: boolean;
  public readonly originalError?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: ErrorContext,
    isRetryable: boolean = false,
    originalError?: Error
  ) {
    super(message);
    this.name = 'MaiFarmError';
    this.code = code;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date();
    this.isRetryable = isRetryable;
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MaiFarmError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      isRetryable: this.isRetryable,
      stack: this.stack
    };
  }

  static fromError(error: Error, code: ErrorCode = ErrorCode.UNKNOWN, context?: ErrorContext): MaiFarmError {
    if (error instanceof MaiFarmError) {
      return error;
    }
    return new MaiFarmError(
      code,
      error.message,
      ErrorSeverity.MEDIUM,
      context,
      false,
      error
    );
  }
}

export class ValidationError extends MaiFarmError {
  constructor(message: string, context?: ErrorContext) {
    super(ErrorCode.VALIDATION_FAILED, message, ErrorSeverity.LOW, context, false);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends MaiFarmError {
  constructor(code: ErrorCode, message: string, context?: ErrorContext, isRetryable: boolean = true) {
    super(code, message, ErrorSeverity.HIGH, context, isRetryable);
    this.name = 'DatabaseError';
  }
}

export class FarmError extends MaiFarmError {
  constructor(code: ErrorCode, message: string, context?: ErrorContext) {
    super(code, message, ErrorSeverity.HIGH, context, false);
    this.name = 'FarmError';
  }
}

export class AgentError extends MaiFarmError {
  constructor(code: ErrorCode, message: string, context?: ErrorContext, isRetryable: boolean = true) {
    super(code, message, ErrorSeverity.HIGH, context, isRetryable);
    this.name = 'AgentError';
  }
}

export class TmuxError extends MaiFarmError {
  constructor(code: ErrorCode, message: string, context?: ErrorContext) {
    super(code, message, ErrorSeverity.HIGH, context, true);
    this.name = 'TmuxError';
  }
}

export class ProviderError extends MaiFarmError {
  constructor(code: ErrorCode, message: string, context?: ErrorContext, isRetryable: boolean = false) {
    super(code, message, ErrorSeverity.CRITICAL, context, isRetryable);
    this.name = 'ProviderError';
  }
}

/**
 * Error handler utility functions
 */
export class ErrorHandler {
  static handle(error: Error, context?: ErrorContext): MaiFarmError {
    if (error instanceof MaiFarmError) {
      return error;
    }

    // Map common errors to specific error codes
    if (error.message.includes('ECONNREFUSED')) {
      return new DatabaseError(ErrorCode.DB_CONNECTION_FAILED, 'Database connection refused', context);
    }

    if (error.message.includes('timeout')) {
      return new MaiFarmError(ErrorCode.TIMEOUT, error.message, ErrorSeverity.HIGH, context, true);
    }

    if (error.message.includes('not found')) {
      return new MaiFarmError(ErrorCode.NOT_FOUND, error.message, ErrorSeverity.LOW, context);
    }

    return MaiFarmError.fromError(error, ErrorCode.UNKNOWN, context);
  }

  static isRetryable(error: Error): boolean {
    if (error instanceof MaiFarmError) {
      return error.isRetryable;
    }
    // Default retry logic for common errors
    const retryablePatterns = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'timeout',
      'rate limit'
    ];
    return retryablePatterns.some(pattern =>
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  static getSeverity(error: Error): ErrorSeverity {
    if (error instanceof MaiFarmError) {
      return error.severity;
    }
    return ErrorSeverity.MEDIUM;
  }

  static logError(error: Error, logger: any): void {
    const maifarmError = ErrorHandler.handle(error);
    const logData = {
      code: maifarmError.code,
      message: maifarmError.message,
      severity: maifarmError.severity,
      context: maifarmError.context,
      timestamp: maifarmError.timestamp,
      stack: maifarmError.stack
    };

    switch (maifarmError.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('CRITICAL ERROR', logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('Error occurred', logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Warning', logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('Info', logData);
        break;
    }
  }
}