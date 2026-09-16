/**
 * EnhancedErrorBoundary - Production-grade error boundary with recovery
 * Catches errors, logs to tracking service, and provides user-friendly fallback
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { errorTracker } from '@/services/errorTracker';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'component' | 'app';
  componentName?: string;
  enableAutoRecovery?: boolean;
  maxRecoveryAttempts?: number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  recoveryAttempts: number;
  errorId: string | null;
}

export class EnhancedErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      recoveryAttempts: 0,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, componentName, level = 'component' } = this.props;
    const { errorCount, errorId } = this.state;

    // Log to error tracking service
    errorTracker.logError({
      error,
      errorInfo,
      componentName: componentName || 'Unknown',
      level,
      errorId: errorId!,
      errorCount: errorCount + 1,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      stack: error.stack,
    });

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo);
    }

    // Update state with error info
    this.setState({
      errorInfo,
      errorCount: errorCount + 1,
    });

    // Attempt auto-recovery if enabled
    if (this.props.enableAutoRecovery) {
      this.attemptAutoRecovery();
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by boundary:', error);
      console.error('Error info:', errorInfo);
      console.error('Component stack:', errorInfo.componentStack);
    }
  }

  attemptAutoRecovery = () => {
    const { maxRecoveryAttempts = 3 } = this.props;
    const { recoveryAttempts } = this.state;

    if (recoveryAttempts < maxRecoveryAttempts) {
      // Clear any existing timeout
      if (this.retryTimeoutId) {
        clearTimeout(this.retryTimeoutId);
      }

      // Exponential backoff for recovery attempts
      const delay = Math.min(1000 * Math.pow(2, recoveryAttempts), 10000);

      this.retryTimeoutId = setTimeout(() => {
        this.setState({
          hasError: false,
          error: null,
          errorInfo: null,
          recoveryAttempts: recoveryAttempts + 1,
        });
      }, delay);
    }
  };

  handleReset = () => {
    // Clear any pending recovery timeout
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }

    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      recoveryAttempts: 0,
      errorId: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReportBug = () => {
    const { error, errorId } = this.state;
    const bugReportUrl = `/support/report-bug?errorId=${errorId}&error=${encodeURIComponent(
      error?.message || 'Unknown error'
    )}`;
    window.open(bugReportUrl, '_blank');
  };

  componentWillUnmount() {
    // Clean up any pending timeouts
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  render() {
    const { hasError, error, errorInfo, errorCount, recoveryAttempts, errorId } = this.state;
    const { children, fallback, level = 'component', maxRecoveryAttempts = 3 } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return <>{fallback}</>;
      }

      // Default error UI based on level
      const isAppLevel = level === 'app';
      const isPageLevel = level === 'page';

      return (
        <div className={`error-boundary-fallback ${level}-error`}>
          <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-md w-full">
              <div className="bg-white shadow-lg rounded-lg p-6">
                {/* Error Icon and Title */}
                <div className="flex items-center justify-center mb-6">
                  <div className="rounded-full bg-red-100 p-3">
                    <AlertTriangle className="h-12 w-12 text-red-600" />
                  </div>
                </div>

                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    {isAppLevel
                      ? 'Application Error'
                      : isPageLevel
                      ? 'Page Error'
                      : 'Something went wrong'}
                  </h1>
                  <p className="text-gray-600 text-sm">
                    {recoveryAttempts > 0 && recoveryAttempts < maxRecoveryAttempts
                      ? `Auto-recovery attempt ${recoveryAttempts} of ${maxRecoveryAttempts}...`
                      : 'An unexpected error occurred. The error has been logged.'}
                  </p>
                </div>

                {/* Error Details (Development Only) */}
                {process.env.NODE_ENV === 'development' && error && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-md">
                    <h3 className="text-sm font-medium text-gray-900 mb-2">Error Details:</h3>
                    <p className="text-xs text-red-600 font-mono break-all">{error.message}</p>
                    {errorId && (
                      <p className="text-xs text-gray-500 mt-2">Error ID: {errorId}</p>
                    )}
                    {errorCount > 1 && (
                      <p className="text-xs text-gray-500 mt-1">
                        This error has occurred {errorCount} times
                      </p>
                    )}
                  </div>
                )}

                {/* Stack Trace (Development Only) */}
                {process.env.NODE_ENV === 'development' && errorInfo && (
                  <details className="mb-6">
                    <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                      Show Component Stack
                    </summary>
                    <pre className="mt-2 text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48">
                      {errorInfo.componentStack}
                    </pre>
                  </details>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-3">
                  <button
                    onClick={this.handleReset}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </button>

                  {isPageLevel && (
                    <button
                      onClick={this.handleGoHome}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                    >
                      <Home className="h-4 w-4" />
                      Go to Home
                    </button>
                  )}

                  {isAppLevel && (
                    <button
                      onClick={this.handleReload}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reload Application
                    </button>
                  )}

                  <button
                    onClick={this.handleReportBug}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    <Bug className="h-4 w-4" />
                    Report This Issue
                  </button>
                </div>

                {/* Support Information */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">
                    If this problem persists, please contact support with error ID:
                    <br />
                    <code className="font-mono text-gray-700">{errorId}</code>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Hook to wrap a component with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <EnhancedErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </EnhancedErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}