import React, { Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, Terminal, Bug, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  terminalId?: string;
  agentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  showDetails: boolean;
  isRecovering: boolean;
}

export class EnhancedTerminalErrorBoundary extends Component<Props, State> {
  private retryTimeoutId?: NodeJS.Timeout;
  private errorLogBuffer: Array<{ timestamp: Date; error: Error }> = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      showDetails: false,
      isRecovering: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to buffer
    this.errorLogBuffer.push({
      timestamp: new Date(),
      error
    });

    // Keep only last 10 errors
    if (this.errorLogBuffer.length > 10) {
      this.errorLogBuffer.shift();
    }

    // Update state
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🔴 Terminal Error Boundary Caught Error`);
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Component Stack:', errorInfo.componentStack);
      console.groupEnd();
    }

    // Auto-retry after 5 seconds if error count is low
    if (this.state.errorCount < 3) {
      this.scheduleAutoRetry();
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  scheduleAutoRetry = () => {
    this.retryTimeoutId = setTimeout(() => {
      this.handleRetry();
    }, 5000);
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isRecovering: true
    });

    // Reset recovering state after animation
    setTimeout(() => {
      this.setState({ isRecovering: false });
    }, 500);
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      showDetails: false,
      isRecovering: false
    });
    this.errorLogBuffer = [];
  };

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  render() {
    const { hasError, error, errorInfo, errorCount, showDetails, isRecovering } = this.state;
    const { children, fallback, terminalId, agentName } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return <>{fallback}</>;
      }

      // Default error UI
      return (
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="terminal-error-boundary min-h-[400px] flex items-center justify-center p-8"
          >
            <div className="max-w-2xl w-full">
              <motion.div
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                className="bg-red-950/50 border border-red-800 rounded-lg p-6 backdrop-blur-sm"
              >
                {/* Error Header */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-red-900/50 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-red-300 mb-1">
                      Terminal Error
                    </h3>
                    <p className="text-sm text-red-400">
                      {agentName && `${agentName} - `}
                      {terminalId && `ID: ${terminalId}`}
                    </p>
                  </div>
                  {errorCount > 1 && (
                    <div className="px-2 py-1 bg-red-900/50 rounded text-xs text-red-400">
                      Error #{errorCount}
                    </div>
                  )}
                </div>

                {/* Error Message */}
                <div className="mb-4">
                  <p className="text-gray-300 mb-2">
                    {error.message || 'An unexpected error occurred in the terminal component.'}
                  </p>
                  {error.name && error.name !== 'Error' && (
                    <p className="text-sm text-gray-400">
                      Error Type: <span className="font-mono">{error.name}</span>
                    </p>
                  )}
                </div>

                {/* Error Details Toggle */}
                <button
                  onClick={this.toggleDetails}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 mb-4 transition-colors"
                  aria-expanded={showDetails}
                >
                  <Bug className="w-4 h-4" />
                  <span>Technical Details</span>
                  {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {/* Error Details */}
                <AnimatePresence>
                  {showDetails && errorInfo && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mb-4 p-4 bg-gray-900/50 rounded-lg">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2">Stack Trace:</h4>
                        <pre className="text-xs text-gray-500 overflow-x-auto whitespace-pre-wrap font-mono">
                          {error.stack}
                        </pre>
                        {errorInfo.componentStack && (
                          <>
                            <h4 className="text-sm font-semibold text-gray-400 mt-4 mb-2">
                              Component Stack:
                            </h4>
                            <pre className="text-xs text-gray-500 overflow-x-auto whitespace-pre-wrap font-mono">
                              {errorInfo.componentStack}
                            </pre>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={this.handleRetry}
                    disabled={isRecovering}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-lg transition-colors"
                    aria-label="Retry loading terminal"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRecovering ? 'animate-spin' : ''}`} />
                    <span>{isRecovering ? 'Retrying...' : 'Retry'}</span>
                  </button>

                  <button
                    onClick={this.handleReset}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    aria-label="Reset terminal"
                  >
                    <Terminal className="w-4 h-4" />
                    <span>Reset Terminal</span>
                  </button>
                </div>

                {/* Auto-retry notification */}
                {errorCount < 3 && !isRecovering && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 text-xs text-gray-500"
                  >
                    Terminal will automatically retry in a few seconds...
                  </motion.p>
                )}

                {/* Max retries reached */}
                {errorCount >= 3 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg"
                  >
                    <p className="text-sm text-yellow-400">
                      Multiple errors detected. The terminal component may need to be restarted or there may be an issue with the connection.
                    </p>
                  </motion.div>
                )}
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }

    // Show recovering animation
    if (isRecovering) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="terminal-recovering min-h-[400px] flex items-center justify-center"
        >
          <div className="flex items-center gap-3 text-blue-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Recovering terminal...</span>
          </div>
        </motion.div>
      );
    }

    // Render children normally
    return <>{children}</>;
  }
}