export enum ErrorCategory {
  NETWORK = 'network',
  WEBSOCKET = 'websocket',
  API = 'api',
  AUTH = 'auth',
  VALIDATION = 'validation',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface ErrorContext {
  endpoint?: string;
  operation?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

interface LoggedError {
  id: string;
  timestamp: Date;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: ErrorContext;
  stack?: string;
}

class ErrorLogger {
  private errors: LoggedError[] = [];
  private maxErrors = 100;

  log(error: Error | string, category: ErrorCategory, severity: ErrorSeverity, context: ErrorContext = {}) {
    const loggedError: LoggedError = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      message: typeof error === 'string' ? error : error.message,
      category,
      severity,
      context,
      stack: typeof error === 'string' ? undefined : error.stack
    };

    this.errors.unshift(loggedError);
    
    // Keep only the latest errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Log to console based on severity
    if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH) {
      console.error('[Error Logger]', loggedError);
    } else {
      console.warn('[Error Logger]', loggedError);
    }

    // In production, send critical errors to monitoring service
    if (severity === ErrorSeverity.CRITICAL && import.meta.env.PROD) {
      this.sendToMonitoring(loggedError);
    }
  }

  private sendToMonitoring(error: LoggedError) {
    // TODO: Implement integration with error monitoring service (e.g., Sentry)
    console.error('Critical error occurred:', error);
  }

  getErrors(category?: ErrorCategory, severity?: ErrorSeverity): LoggedError[] {
    let filtered = this.errors;
    
    if (category) {
      filtered = filtered.filter(e => e.category === category);
    }
    
    if (severity) {
      filtered = filtered.filter(e => e.severity === severity);
    }
    
    return filtered;
  }

  clearErrors() {
    this.errors = [];
  }

  getErrorStats() {
    const stats = {
      total: this.errors.length,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      recentErrors: this.errors.slice(0, 10)
    };

    for (const error of this.errors) {
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    }

    return stats;
  }
}

// Singleton instance
export const errorLogger = new ErrorLogger();

// Main logging function
export function logError(
  error: Error | string, 
  options: {
    category: ErrorCategory;
    severity: ErrorSeverity;
    operation?: string;
    endpoint?: string;
    userId?: string;
    metadata?: Record<string, any>;
  }
) {
  const { category, severity, ...context } = options;
  errorLogger.log(error, category, severity, context);
}

// Convenience functions
export function logWebSocketError(error: Error | string, context?: ErrorContext) {
  // Skip logging if backend warning already shown
  if (window.__backendWarningShown) {
    return;
  }
  errorLogger.log(
    error,
    ErrorCategory.WEBSOCKET,
    ErrorSeverity.MEDIUM,
    context
  );
}

export function logAPIError(error: Error | string, context?: ErrorContext) {
  errorLogger.log(
    error,
    ErrorCategory.API,
    context?.metadata?.status >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
    context
  );
}

export function logNetworkError(error: Error | string, context?: ErrorContext) {
  errorLogger.log(
    error,
    ErrorCategory.NETWORK,
    ErrorSeverity.HIGH,
    context
  );
}

export function logAuthError(error: Error | string, context?: ErrorContext) {
  errorLogger.log(
    error,
    ErrorCategory.AUTH,
    ErrorSeverity.HIGH,
    context
  );
}

export function logValidationError(error: Error | string, context?: ErrorContext) {
  errorLogger.log(
    error,
    ErrorCategory.VALIDATION,
    ErrorSeverity.LOW,
    context
  );
}

export function logCriticalError(error: Error | string, category: ErrorCategory = ErrorCategory.UNKNOWN, context?: ErrorContext) {
  errorLogger.log(
    error,
    category,
    ErrorSeverity.CRITICAL,
    context
  );
}