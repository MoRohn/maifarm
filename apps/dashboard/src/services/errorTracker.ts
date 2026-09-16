/**
 * ErrorTracker Service - Centralized error tracking and reporting
 * Logs errors to console, sends to analytics, and maintains error history
 */

import { ErrorInfo } from 'react';

interface ErrorLog {
  error: Error;
  errorInfo?: ErrorInfo;
  componentName: string;
  level: 'page' | 'component' | 'app';
  errorId: string;
  errorCount: number;
  timestamp: string;
  userAgent: string;
  url: string;
  stack?: string;
  metadata?: Record<string, any>;
}

interface ErrorSummary {
  message: string;
  count: number;
  firstOccurrence: string;
  lastOccurrence: string;
  componentNames: string[];
}

class ErrorTracker {
  private errors: ErrorLog[] = [];
  private errorSummaries = new Map<string, ErrorSummary>();
  private maxErrorsStored = 100;
  private analyticsEndpoint = '/api/errors';
  private isProduction = process.env.NODE_ENV === 'production';
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupUnhandledErrorHandlers();
    this.loadPersistedErrors();
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Setup global error handlers
   */
  private setupUnhandledErrorHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError({
        error: new Error(event.reason),
        componentName: 'Global',
        level: 'app',
        errorId: `unhandled-${Date.now()}`,
        errorCount: 1,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        metadata: {
          type: 'unhandledrejection',
          reason: event.reason,
        },
      });
    });

    // Handle global errors
    window.addEventListener('error', (event) => {
      this.logError({
        error: event.error || new Error(event.message),
        componentName: 'Global',
        level: 'app',
        errorId: `global-${Date.now()}`,
        errorCount: 1,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        metadata: {
          type: 'error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });
  }

  /**
   * Load persisted errors from localStorage
   */
  private loadPersistedErrors(): void {
    try {
      const persistedErrors = localStorage.getItem('maifarm-error-logs');
      if (persistedErrors) {
        this.errors = JSON.parse(persistedErrors);
        this.rebuildSummaries();
      }
    } catch (error) {
      console.error('Failed to load persisted errors:', error);
    }
  }

  /**
   * Persist errors to localStorage
   */
  private persistErrors(): void {
    try {
      // Keep only recent errors
      const recentErrors = this.errors.slice(-this.maxErrorsStored);
      localStorage.setItem('maifarm-error-logs', JSON.stringify(recentErrors));
    } catch (error) {
      console.error('Failed to persist errors:', error);
    }
  }

  /**
   * Rebuild error summaries from error logs
   */
  private rebuildSummaries(): void {
    this.errorSummaries.clear();
    for (const errorLog of this.errors) {
      this.updateErrorSummary(errorLog);
    }
  }

  /**
   * Update error summary for a specific error
   */
  private updateErrorSummary(errorLog: ErrorLog): void {
    const key = errorLog.error.message;
    const existing = this.errorSummaries.get(key);

    if (existing) {
      existing.count++;
      existing.lastOccurrence = errorLog.timestamp;
      if (!existing.componentNames.includes(errorLog.componentName)) {
        existing.componentNames.push(errorLog.componentName);
      }
    } else {
      this.errorSummaries.set(key, {
        message: errorLog.error.message,
        count: 1,
        firstOccurrence: errorLog.timestamp,
        lastOccurrence: errorLog.timestamp,
        componentNames: [errorLog.componentName],
      });
    }
  }

  /**
   * Log an error
   */
  public logError(errorLog: ErrorLog): void {
    // Add to internal storage
    this.errors.push(errorLog);
    this.updateErrorSummary(errorLog);

    // Trim errors if exceeding max
    if (this.errors.length > this.maxErrorsStored) {
      this.errors = this.errors.slice(-this.maxErrorsStored);
    }

    // Persist to localStorage
    this.persistErrors();

    // Log to console in development
    if (!this.isProduction) {
      console.group(`🚨 Error: ${errorLog.componentName}`);
      console.error('Error:', errorLog.error);
      console.log('Error ID:', errorLog.errorId);
      console.log('Component:', errorLog.componentName);
      console.log('Level:', errorLog.level);
      console.log('URL:', errorLog.url);
      if (errorLog.metadata) {
        console.log('Metadata:', errorLog.metadata);
      }
      if (errorLog.errorInfo) {
        console.log('Component Stack:', errorLog.errorInfo.componentStack);
      }
      console.groupEnd();
    }

    // Send to analytics in production
    if (this.isProduction) {
      this.sendToAnalytics(errorLog);
    }
  }

  /**
   * Send error to analytics endpoint
   */
  private async sendToAnalytics(errorLog: ErrorLog): Promise<void> {
    try {
      const payload = {
        ...errorLog,
        sessionId: this.sessionId,
        error: {
          message: errorLog.error.message,
          stack: errorLog.error.stack,
          name: errorLog.error.name,
        },
      };

      await fetch(this.analyticsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Silently fail - don't cause additional errors
      console.error('Failed to send error to analytics:', error);
    }
  }

  /**
   * Get all logged errors
   */
  public getErrors(): ErrorLog[] {
    return [...this.errors];
  }

  /**
   * Get error summaries
   */
  public getErrorSummaries(): ErrorSummary[] {
    return Array.from(this.errorSummaries.values());
  }

  /**
   * Get errors by component
   */
  public getErrorsByComponent(componentName: string): ErrorLog[] {
    return this.errors.filter((e) => e.componentName === componentName);
  }

  /**
   * Get errors by level
   */
  public getErrorsByLevel(level: 'page' | 'component' | 'app'): ErrorLog[] {
    return this.errors.filter((e) => e.level === level);
  }

  /**
   * Get recent errors
   */
  public getRecentErrors(count: number = 10): ErrorLog[] {
    return this.errors.slice(-count);
  }

  /**
   * Clear all errors
   */
  public clearErrors(): void {
    this.errors = [];
    this.errorSummaries.clear();
    localStorage.removeItem('maifarm-error-logs');
  }

  /**
   * Export errors as JSON
   */
  public exportErrors(): string {
    return JSON.stringify(
      {
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        errors: this.errors,
        summaries: this.getErrorSummaries(),
      },
      null,
      2
    );
  }

  /**
   * Get error statistics
   */
  public getStatistics(): {
    totalErrors: number;
    uniqueErrors: number;
    errorsByLevel: Record<string, number>;
    errorsByComponent: Record<string, number>;
    mostFrequentError: ErrorSummary | null;
  } {
    const errorsByLevel: Record<string, number> = {};
    const errorsByComponent: Record<string, number> = {};

    for (const error of this.errors) {
      // Count by level
      errorsByLevel[error.level] = (errorsByLevel[error.level] || 0) + 1;

      // Count by component
      errorsByComponent[error.componentName] =
        (errorsByComponent[error.componentName] || 0) + 1;
    }

    // Find most frequent error
    let mostFrequentError: ErrorSummary | null = null;
    let maxCount = 0;
    for (const summary of this.errorSummaries.values()) {
      if (summary.count > maxCount) {
        maxCount = summary.count;
        mostFrequentError = summary;
      }
    }

    return {
      totalErrors: this.errors.length,
      uniqueErrors: this.errorSummaries.size,
      errorsByLevel,
      errorsByComponent,
      mostFrequentError,
    };
  }
}

// Create and export singleton instance
export const errorTracker = new ErrorTracker();

// Export type for use in other files
export type { ErrorLog, ErrorSummary };