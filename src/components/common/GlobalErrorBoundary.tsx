/**
 * Global Error Boundary Component
 * Catches and handles all unhandled errors in the React component tree
 * Provides recovery mechanisms and error reporting
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  lastErrorTime: Date | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  private readonly MAX_ERROR_COUNT = 5;
  private readonly ERROR_RESET_TIME = 60000; // 1 minute
  private errorResetTimer?: NodeJS.Timeout;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      lastErrorTime: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      lastErrorTime: new Date()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by GlobalErrorBoundary:', error, errorInfo);
    }

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Send error to monitoring service
    this.reportError(error, errorInfo);

    // Update error count
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Check if we should show catastrophic error
    if (this.state.errorCount >= this.MAX_ERROR_COUNT) {
      this.showCatastrophicError();
    }

    // Set timer to reset error count
    this.scheduleErrorCountReset();
  }

  componentWillUnmount() {
    if (this.errorResetTimer) {
      clearTimeout(this.errorResetTimer);
    }
  }

  private scheduleErrorCountReset() {
    if (this.errorResetTimer) {
      clearTimeout(this.errorResetTimer);
    }

    this.errorResetTimer = setTimeout(() => {
      this.setState({ errorCount: 0 });
    }, this.ERROR_RESET_TIME);
  }

  private reportError(error: Error, errorInfo: ErrorInfo) {
    // Send to backend error tracking
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Send to backend (non-blocking)
    fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorReport)
    }).catch(err => {
      console.error('Failed to report error:', err);
    });
  }

  private showCatastrophicError() {
    // Show a more serious error message when too many errors occur
    console.error('Catastrophic error: Too many errors in a short time period');
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private getErrorMessage(): string {
    const { error } = this.state;
    
    if (!error) return 'An unexpected error occurred';
    
    // User-friendly error messages
    if (error.message.includes('Network')) {
      return 'Network connection issue. Please check your internet connection.';
    }
    if (error.message.includes('chunk')) {
      return 'Application resources failed to load. Please refresh the page.';
    }
    if (error.message.includes('WebSocket')) {
      return 'Real-time connection lost. Some features may be unavailable.';
    }
    
    // Default to error message
    return error.message || 'An unexpected error occurred';
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      const isDevelopment = process.env.NODE_ENV === 'development';
      const { error, errorInfo, errorCount } = this.state;

      // Catastrophic error UI
      if (errorCount >= this.MAX_ERROR_COUNT) {
        return (
          <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-6">
              <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
                Critical Error
              </h1>
              <p className="text-center text-gray-600 mb-6">
                The application is experiencing multiple errors and may be unstable.
                Please refresh the page to continue.
              </p>
              <button
                onClick={this.handleReload}
                className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
              >
                Refresh Application
              </button>
            </div>
          </div>
        );
      }

      // Regular error UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl overflow-hidden">
            {/* Error Header */}
            <div className="bg-yellow-50 border-b border-yellow-100 p-6">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-3 flex-1">
                  <h2 className="text-lg font-medium text-gray-900">
                    Something went wrong
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {this.getErrorMessage()}
                  </p>
                </div>
              </div>
            </div>

            {/* Error Details (Development Only) */}
            {isDevelopment && error && (
              <div className="p-6 border-b border-gray-200">
                <details className="group">
                  <summary className="cursor-pointer list-none flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 flex items-center">
                      <Bug className="w-4 h-4 mr-2" />
                      Error Details (Development Mode)
                    </span>
                    <span className="text-gray-400 group-open:rotate-90 transition-transform">
                      ▶
                    </span>
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Error Message
                      </h4>
                      <pre className="mt-1 text-xs text-red-600 bg-red-50 p-2 rounded overflow-x-auto">
                        {error.toString()}
                      </pre>
                    </div>
                    {error.stack && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Stack Trace
                        </h4>
                        <pre className="mt-1 text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                          {error.stack}
                        </pre>
                      </div>
                    )}
                    {errorInfo?.componentStack && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                          Component Stack
                        </h4>
                        <pre className="mt-1 text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

            {/* Recovery Actions */}
            <div className="p-6 bg-gray-50">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={this.handleReset}
                  className="flex-1 flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </button>
                <button
                  onClick={this.handleReload}
                  className="flex-1 flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reload Page
                </button>
                <button
                  onClick={this.handleGoHome}
                  className="flex-1 flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go to Dashboard
                </button>
              </div>
              
              {errorCount > 1 && (
                <p className="mt-3 text-xs text-gray-500 text-center">
                  Error count: {errorCount} | Errors will reset after 1 minute of stability
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook to use error boundary programmatically
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return {
    throwError: setError,
    clearError: () => setError(null)
  };
}

/**
 * Higher-order component to wrap components with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
): React.ComponentType<P> {
  return (props: P) => (
    <GlobalErrorBoundary fallback={fallback}>
      <Component {...props} />
    </GlobalErrorBoundary>
  );
}