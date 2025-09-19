/**
 * Component-level Error Boundaries
 * Provides granular error handling for specific components
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface BaseErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  isolate?: boolean; // If true, errors won't propagate up
  componentName?: string;
}

interface BaseErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Base error boundary class
 */
class BaseErrorBoundary extends Component<BaseErrorBoundaryProps, BaseErrorBoundaryState> {
  private resetKeysCache?: Array<string | number>;

  constructor(props: BaseErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
    this.resetKeysCache = props.resetKeys;
  }

  static getDerivedStateFromError(error: Error): BaseErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, componentName, isolate } = this.props;
    
    // Log the error
    console.error(`Error in ${componentName || 'Component'}:`, error, errorInfo);
    
    // Call custom error handler
    if (onError) {
      onError(error, errorInfo);
    }
    
    // If not isolated, let error propagate after logging
    if (!isolate) {
      // Re-throw in next tick to allow logging
      setTimeout(() => {
        throw error;
      }, 0);
    }
  }

  componentDidUpdate(prevProps: BaseErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    
    // Reset on prop changes if enabled
    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetError();
    }
    
    // Reset if resetKeys changed
    if (hasError && resetKeys && this.resetKeysCache) {
      const hasResetKeyChanged = resetKeys.some(
        (key, idx) => key !== this.resetKeysCache![idx]
      );
      
      if (hasResetKeyChanged) {
        this.resetError();
        this.resetKeysCache = resetKeys;
      }
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null
    });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, componentName } = this.props;

    if (hasError) {
      if (fallback) {
        return <>{fallback}</>;
      }

      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">
                {componentName ? `Error in ${componentName}` : 'Component Error'}
              </h3>
              <p className="mt-1 text-sm text-red-700">
                {error?.message || 'An unexpected error occurred'}
              </p>
              <button
                onClick={this.resetError}
                className="mt-2 text-sm text-red-600 hover:text-red-800 underline flex items-center"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Terminal-specific error boundary
 */
export class TerminalErrorBoundary extends Component<
  { children: ReactNode; sessionId?: string },
  BaseErrorBoundaryState
> {
  state: BaseErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): BaseErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Terminal Error:', error, errorInfo);
    
    // Report terminal-specific error
    if (this.props.sessionId) {
      fetch('/api/errors/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.props.sessionId,
          error: error.message,
          stack: error.stack
        })
      }).catch(console.error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400 p-4">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Terminal Connection Error</h3>
            <p className="text-sm mb-4">
              Failed to establish terminal connection
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Reload Terminal
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * WebSocket-specific error boundary
 */
export class WebSocketErrorBoundary extends Component<
  { children: ReactNode },
  BaseErrorBoundaryState & { retryCount: number }
> {
  state = {
    hasError: false,
    error: null as Error | null,
    retryCount: 0
  };

  private readonly MAX_RETRIES = 3;

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('WebSocket Error:', error, errorInfo);
    
    // Auto-retry for WebSocket errors
    if (error.message.includes('WebSocket') && this.state.retryCount < this.MAX_RETRIES) {
      setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          error: null,
          retryCount: prev.retryCount + 1
        }));
      }, 2000 * (this.state.retryCount + 1)); // Exponential backoff
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <div className="ml-3">
              <p className="text-sm text-yellow-800">
                WebSocket connection issue. Attempting to reconnect...
              </p>
              {this.state.retryCount > 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  Retry attempt {this.state.retryCount} of {this.MAX_RETRIES}
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
 * Chart/Visualization error boundary
 */
export class ChartErrorBoundary extends Component<
  { children: ReactNode; chartName?: string },
  BaseErrorBoundaryState
> {
  state: BaseErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): BaseErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Chart Error (${this.props.chartName}):`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-64 bg-gray-50 border border-gray-200 rounded">
          <div className="text-center text-gray-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm font-medium">Unable to render chart</p>
            <p className="text-xs mt-1">
              {this.state.error?.message || 'Visualization error'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Form error boundary with validation state preservation
 */
export class FormErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  BaseErrorBoundaryState & { formData?: any }
> {
  state = {
    hasError: false,
    error: null as Error | null,
    formData: undefined
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Form Error:', error, errorInfo);
    
    // Try to preserve form data
    try {
      const formElements = document.querySelectorAll('input, textarea, select');
      const formData: any = {};
      
      formElements.forEach((element: any) => {
        if (element.name) {
          formData[element.name] = element.value;
        }
      });
      
      this.setState({ formData });
    } catch (e) {
      console.error('Failed to preserve form data:', e);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-sm font-medium text-red-800 mb-2">
            Form Submission Error
          </h3>
          <p className="text-sm text-red-700 mb-3">
            {this.state.error?.message || 'Failed to process form'}
          </p>
          {this.state.formData && (
            <p className="text-xs text-red-600 mb-3">
              Your form data has been preserved.
            </p>
          )}
          <button
            onClick={this.handleReset}
            className="text-sm px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry Form
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Export configured error boundaries
 */
export const ComponentErrorBoundary = BaseErrorBoundary;

/**
 * Hook for using error boundaries
 */
export function useComponentErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { captureError, resetError };
}