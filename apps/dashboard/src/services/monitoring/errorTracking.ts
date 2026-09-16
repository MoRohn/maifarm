/**
 * Error Tracking Service
 * Integrates with Sentry for production error monitoring
 */

import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

interface ErrorContext {
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
  farmId?: string;
  agentId?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

interface ErrorReport {
  message: string;
  level: 'error' | 'warning' | 'info';
  context?: ErrorContext;
  fingerprint?: string[];
  tags?: Record<string, string>;
}

class ErrorTrackingService {
  private initialized = false;
  private environment = import.meta.env.MODE;
  private dsn = import.meta.env.VITE_SENTRY_DSN;

  /**
   * Initialize Sentry error tracking
   */
  initialize() {
    if (this.initialized || !this.dsn || this.environment === 'development') {
      console.log('[ErrorTracking] Skipping initialization in development');
      return;
    }

    try {
      Sentry.init({
        dsn: this.dsn,
        environment: this.environment,
        integrations: [
          new BrowserTracing(),
          new Sentry.Replay({
            maskAllText: true,
            blockAllMedia: false,
          }),
        ],
        tracesSampleRate: this.environment === 'production' ? 0.1 : 1.0,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
        beforeSend(event, hint) {
          // Filter out certain errors
          if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) {
            return null; // Ignore ResizeObserver errors
          }

          // Sanitize sensitive data
          if (event.request?.cookies) {
            delete event.request.cookies;
          }

          return event;
        },
      });

      this.initialized = true;
      console.log('[ErrorTracking] Sentry initialized successfully');
    } catch (error) {
      console.error('[ErrorTracking] Failed to initialize Sentry:', error);
    }
  }

  /**
   * Set user context for error tracking
   */
  setUser(user: ErrorContext['user']) {
    if (!this.initialized) return;

    Sentry.setUser(user || null);
  }

  /**
   * Clear user context
   */
  clearUser() {
    if (!this.initialized) return;

    Sentry.setUser(null);
  }

  /**
   * Capture an exception with context
   */
  captureException(error: Error, context?: ErrorContext) {
    if (!this.initialized) {
      console.error('[ErrorTracking] Exception:', error, context);
      return;
    }

    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext('errorContext', context);

        if (context.tags) {
          Object.entries(context.tags).forEach(([key, value]) => {
            scope.setTag(key, value);
          });
        }

        if (context.user) {
          scope.setUser(context.user);
        }
      }

      Sentry.captureException(error);
    });
  }

  /**
   * Capture a message with context
   */
  captureMessage(report: ErrorReport) {
    if (!this.initialized) {
      console.log('[ErrorTracking] Message:', report.message, report.context);
      return;
    }

    Sentry.withScope((scope) => {
      if (report.context) {
        scope.setContext('messageContext', report.context);
      }

      if (report.tags) {
        Object.entries(report.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }

      if (report.fingerprint) {
        scope.setFingerprint(report.fingerprint);
      }

      const level = report.level === 'warning' ? 'warning' :
                    report.level === 'info' ? 'info' : 'error';

      Sentry.captureMessage(report.message, level);
    });
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(
    message: string,
    category: string,
    data?: Record<string, unknown>
  ) {
    if (!this.initialized) return;

    Sentry.addBreadcrumb({
      message,
      category,
      level: 'info',
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * Start a transaction for performance monitoring
   */
  startTransaction(name: string, op: string) {
    if (!this.initialized) return null;

    return Sentry.startTransaction({
      name,
      op,
    });
  }

  /**
   * Capture feedback from user
   */
  captureFeedback(feedback: {
    message: string;
    email?: string;
    name?: string;
    url?: string;
  }) {
    if (!this.initialized) {
      console.log('[ErrorTracking] User feedback:', feedback);
      return;
    }

    const user = Sentry.getCurrentHub().getScope()?.getUser();

    Sentry.captureMessage(`User Feedback: ${feedback.message}`, 'info');

    Sentry.withScope((scope) => {
      scope.setContext('feedback', {
        ...feedback,
        user: user || { email: feedback.email, name: feedback.name },
        timestamp: new Date().toISOString(),
      });

      scope.setTag('type', 'user-feedback');

      Sentry.captureMessage(feedback.message, 'info');
    });
  }

  /**
   * Monitor WebSocket connection issues
   */
  trackWebSocketError(error: Error, details?: {
    url?: string;
    readyState?: number;
    reconnectAttempts?: number;
  }) {
    this.captureException(error, {
      action: 'websocket_error',
      metadata: details,
    });
  }

  /**
   * Monitor API errors
   */
  trackApiError(error: Error, details?: {
    endpoint?: string;
    method?: string;
    statusCode?: number;
    responseTime?: number;
  }) {
    this.captureException(error, {
      action: 'api_error',
      metadata: details,
    });
  }

  /**
   * Monitor farm operation errors
   */
  trackFarmError(error: Error, farmId: string, operation: string) {
    this.captureException(error, {
      farmId,
      action: `farm_${operation}`,
      tags: {
        component: 'farm',
        operation,
      },
    });
  }

  /**
   * Monitor agent errors
   */
  trackAgentError(error: Error, agentId: string, farmId: string) {
    this.captureException(error, {
      agentId,
      farmId,
      action: 'agent_error',
      tags: {
        component: 'agent',
      },
    });
  }

  /**
   * Performance monitoring
   */
  measurePerformance(name: string, callback: () => void | Promise<void>) {
    const transaction = this.startTransaction(name, 'custom');

    const start = performance.now();

    const result = callback();

    if (result instanceof Promise) {
      return result.finally(() => {
        const duration = performance.now() - start;
        this.addBreadcrumb(`Performance: ${name}`, 'performance', {
          duration: `${duration.toFixed(2)}ms`,
        });
        transaction?.finish();
      });
    } else {
      const duration = performance.now() - start;
      this.addBreadcrumb(`Performance: ${name}`, 'performance', {
        duration: `${duration.toFixed(2)}ms`,
      });
      transaction?.finish();
    }
  }

  /**
   * Create error boundary wrapper
   */
  createErrorBoundary(fallback?: React.ComponentType<{ error: Error }>) {
    return Sentry.ErrorBoundary;
  }

  /**
   * Profiler for React components
   */
  withProfiler<P extends object>(
    Component: React.ComponentType<P>,
    name?: string
  ) {
    return Sentry.withProfiler(Component, { name });
  }
}

// Export singleton instance
export const errorTracking = new ErrorTrackingService();

// Export types
export type { ErrorContext, ErrorReport };