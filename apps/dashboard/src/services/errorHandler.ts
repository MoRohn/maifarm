import { toast } from 'react-hot-toast';

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ErrorReport {
  id: string;
  timestamp: Date;
  message: string;
  stack?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: ErrorContext;
  type: 'websocket' | 'api' | 'ui' | 'system';
  resolved: boolean;
}

class ErrorHandlerService {
  private errors: ErrorReport[] = [];
  private maxErrors = 1000;
  private errorListeners: Set<(error: ErrorReport) => void> = new Set();
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 3;

  constructor() {
    // Set up global error handlers
    this.setupGlobalHandlers();
  }

  private setupGlobalHandlers() {
    // Small delay to avoid catching initialization errors
    setTimeout(() => {
      // Handle unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        // Ignore certain initialization errors
        if (event.reason?.message?.includes('Failed to fetch dynamically imported module')) {
          console.warn('Module loading error - this is normal during development');
          event.preventDefault();
          return;
        }
        
        this.logError(
          new Error(event.reason?.message || 'Unhandled promise rejection'),
          {
            component: 'Global',
            action: 'Promise rejection',
            metadata: { reason: event.reason }
          },
          'critical'
        );
        event.preventDefault();
      });

      // Handle global errors
      window.addEventListener('error', (event) => {
        // Ignore certain initialization errors
        if (event.message?.includes('Failed to fetch dynamically imported module')) {
          console.warn('Module loading error - this is normal during development');
          return;
        }
        
        this.logError(
          new Error(event.message),
          {
            component: 'Global',
            action: 'Runtime error',
            metadata: { 
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno
            }
          },
          'high'
        );
      });
    }, 1000); // 1 second delay to let the app initialize
  }

  logError(
    error: Error | string,
    context: ErrorContext = {},
    severity: ErrorReport['severity'] = 'medium',
    type: ErrorReport['type'] = 'system'
  ): string {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? undefined : error.stack;

    const errorReport: ErrorReport = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      message: errorMessage,
      stack: errorStack,
      severity,
      context,
      type,
      resolved: false
    };

    // Add to errors array
    this.errors.unshift(errorReport);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Notify listeners
    this.errorListeners.forEach(listener => listener(errorReport));

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorHandler]', errorReport);
    }

    // Send to monitoring service (if available)
    this.sendErrorToMonitoring(errorReport);

    return errorReport.id;
  }

  handleWebSocketError(error: Error | Event, retryCallback?: () => void): void {
    const errorMessage = error instanceof Error ? error.message : 'WebSocket connection failed';
    const context: ErrorContext = {
      component: 'WebSocket',
      action: 'Connection',
      metadata: {
        readyState: (error as any)?.target?.readyState,
        url: (error as any)?.target?.url
      }
    };

    const errorId = this.logError(errorMessage, context, 'high', 'websocket');

    // Handle retry logic
    if (retryCallback) {
      const retryCount = this.retryAttempts.get(errorId) || 0;
      if (retryCount < this.maxRetries) {
        this.retryAttempts.set(errorId, retryCount + 1);
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        
        setTimeout(() => {
          console.log(`[ErrorHandler] Retrying WebSocket connection (attempt ${retryCount + 1}/${this.maxRetries})`);
          retryCallback();
        }, delay);
      } else {
        // Show user-friendly error after max retries
        toast.error(this.getErrorMessage('websocket_max_retries'));
      }
    }
  }

  handleAPIError(
    error: any,
    endpoint: string,
    method: string,
    retryCallback?: () => Promise<any>
  ): void {
    const context: ErrorContext = {
      component: 'API',
      action: `${method} ${endpoint}`,
      metadata: {
        status: error.status,
        statusText: error.statusText,
        response: error.data
      }
    };

    const severity = error.status >= 500 ? 'high' : 'medium';
    const errorId = this.logError(
      error.message || `API Error: ${error.status}`,
      context,
      severity,
      'api'
    );

    // Show user-friendly message
    const userMessage = this.getErrorMessage(`api_${error.status}`, endpoint);
    toast.error(userMessage);

    // Handle retry for 5xx errors
    if (error.status >= 500 && retryCallback) {
      const retryCount = this.retryAttempts.get(errorId) || 0;
      if (retryCount < this.maxRetries) {
        this.retryAttempts.set(errorId, retryCount + 1);
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        
        setTimeout(async () => {
          try {
            await retryCallback();
            this.markErrorResolved(errorId);
          } catch (retryError) {
            // Retry failed, will be handled by the next iteration
          }
        }, delay);
      }
    }
  }

  getErrorMessage(errorCode: string, context?: string): string {
    const errorMessages: Record<string, string> = {
      // WebSocket errors
      'websocket_connection_failed': 'Unable to connect to the server. Please check your connection.',
      'websocket_max_retries': 'Connection failed after multiple attempts. Please refresh the page.',
      'websocket_disconnected': 'Lost connection to the server. Attempting to reconnect...',
      
      // API errors
      'api_400': 'Invalid request. Please check your input.',
      'api_401': 'Authentication required. Please log in.',
      'api_403': 'You do not have permission to perform this action.',
      'api_404': `The requested ${context || 'resource'} was not found.`,
      'api_429': 'Too many requests. Please slow down.',
      'api_500': 'Server error. Our team has been notified.',
      'api_502': 'Server is temporarily unavailable. Please try again.',
      'api_503': 'Service is undergoing maintenance. Please try again later.',
      
      // General errors
      'network_error': 'Network error. Please check your internet connection.',
      'unknown_error': 'An unexpected error occurred. Please try again.',
      'offline_mode': 'You are currently offline. Some features may be limited.'
    };

    return errorMessages[errorCode] || errorMessages['unknown_error'];
  }

  sendErrorToMonitoring(error: ErrorReport): void {
    // In production, this would send to a monitoring service
    // For now, we'll store in localStorage for debugging
    try {
      const storedErrors = localStorage.getItem('maifarm_errors');
      const errors = storedErrors ? JSON.parse(storedErrors) : [];
      errors.unshift({
        ...error,
        timestamp: error.timestamp.toISOString()
      });
      
      // Keep only last 100 errors in localStorage
      localStorage.setItem(
        'maifarm_errors',
        JSON.stringify(errors.slice(0, 100))
      );
    } catch (e) {
      // Ignore localStorage errors
    }

    // Also send to backend if available (commented out until endpoint is implemented)
    // if (navigator.onLine) {
    //   fetch('/api/monitoring/errors', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(error)
    //   }).catch(() => {
    //     // Ignore monitoring errors
    //   });
    // }
  }

  markErrorResolved(errorId: string): void {
    const error = this.errors.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      this.retryAttempts.delete(errorId);
    }
  }

  getErrors(filter?: {
    type?: ErrorReport['type'];
    severity?: ErrorReport['severity'];
    resolved?: boolean;
    since?: Date;
  }): ErrorReport[] {
    return this.errors.filter(error => {
      if (filter?.type && error.type !== filter.type) return false;
      if (filter?.severity && error.severity !== filter.severity) return false;
      if (filter?.resolved !== undefined && error.resolved !== filter.resolved) return false;
      if (filter?.since && error.timestamp < filter.since) return false;
      return true;
    });
  }

  clearErrors(): void {
    this.errors = [];
    this.retryAttempts.clear();
  }

  subscribe(listener: (error: ErrorReport) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  // Utility method for tracking connection failures
  trackConnectionFailure(service: string, details?: any): void {
    this.logError(
      `Connection to ${service} failed`,
      {
        component: 'Connection',
        action: `Connect to ${service}`,
        metadata: details
      },
      'high',
      'system'
    );
  }

  // Utility method for tracking successful recovery
  trackRecovery(service: string, errorId?: string): void {
    if (errorId) {
      this.markErrorResolved(errorId);
    }
    
    console.log(`[ErrorHandler] ${service} connection recovered`);
  }

  // Alert on extended downtime
  alertOnDowntime(service: string, downtimeMinutes: number): void {
    if (downtimeMinutes >= 5) {
      this.logError(
        `${service} has been down for ${downtimeMinutes} minutes`,
        {
          component: 'Monitoring',
          action: 'Downtime alert',
          metadata: { service, downtimeMinutes }
        },
        'critical',
        'system'
      );
      
      // Show persistent notification
      toast.error(
        `${service} has been unavailable for ${downtimeMinutes} minutes. Please contact support if this persists.`,
        { duration: 10000 }
      );
    }
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandlerService();

// Export types
export type { ErrorHandlerService };