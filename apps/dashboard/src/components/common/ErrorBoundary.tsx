import React, { Component, ErrorInfo, ReactNode } from 'react';
import { errorHandler } from '@/services/errorHandler';
import { logger } from '@/services/monitoring/logger';
import SafeErrorPage from '../ErrorPage/SafeErrorPage';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (_error: Error, _errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorId: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Always log the error to console for debugging
    console.error('========================================');
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Error Stack:', error.stack);
    console.error('========================================');
    
    // Log error to monitoring services - wrap in try-catch to prevent cascading errors
    let errorId = null;
    
    try {
      // Only log to errorHandler if it's available and initialized
      if (typeof errorHandler !== 'undefined' && errorHandler.logError) {
        errorId = errorHandler.logError(
          error,
          {
            component: errorInfo.componentStack?.split('\n')[1]?.trim() || 'Unknown',
            action: 'Component render',
            metadata: {
              componentStack: errorInfo.componentStack
            }
          },
          'critical',
          'ui'
        );
      }
    } catch (handlerError) {
      console.error('Failed to log error:', handlerError);
    }

    try {
      // Only log to logger if it's available and initialized
      if (typeof logger !== 'undefined' && logger.critical) {
        logger.critical('UI', 'Component crashed', {
          error: error.toString(),
          stack: error.stack,
          componentStack: errorInfo.componentStack
        });
      }
    } catch (loggerError) {
      console.error('Logger not available:', loggerError);
    }

    this.setState({
      errorInfo,
      errorId
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        // Make sure fallback is renderable - if it's an object, wrap it in a div
        if (typeof this.props.fallback === 'object' && !React.isValidElement(this.props.fallback)) {
          return <div>Error: Unable to render fallback</div>;
        }
        return <>{this.props.fallback}</>;
      }

      // Use the SafeErrorPage component that doesn't rely on Router context
      return <SafeErrorPage error={this.state.error || undefined} resetError={this.handleReset} />;
    }

    return this.props.children;
  }
}

// Higher-order component for easier use
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}