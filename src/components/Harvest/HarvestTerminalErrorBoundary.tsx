import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  farmId?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class HarvestTerminalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorCount: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error('[HarvestTerminalErrorBoundary] Caught error:', error);
    console.error('[HarvestTerminalErrorBoundary] Error info:', errorInfo);
    
    // Update state with error details
    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Log specific error patterns for GoWild debugging
    if (error.message?.includes('agentId') || error.message?.includes('Cannot read')) {
      console.error('[HarvestTerminalErrorBoundary] Data type error detected - likely GoWild terminal issue');
    }
    
    // You can also log to a service here
    // logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    });
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI when error occurs
      return (
        <div className="bg-gray-900 rounded-xl p-8 border border-red-500/30">
          <div className="flex items-center justify-center mb-6">
            <AlertTriangle className="w-12 h-12 text-red-500 mr-4" />
            <h2 className="text-2xl font-bold text-red-400">Terminal Display Error</h2>
          </div>
          
          <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
            <p className="text-gray-300 mb-2">
              The terminal encountered an error while displaying output.
            </p>
            {this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                  Error Details (click to expand)
                </summary>
                <div className="mt-2 bg-gray-900/50 rounded p-3 font-mono text-xs text-red-400">
                  <p className="mb-2">{this.state.error.toString()}</p>
                  {this.state.errorInfo && (
                    <pre className="whitespace-pre-wrap break-all overflow-x-auto">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>

          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={this.handleReset}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
            >
              <RefreshCw className="w-5 h-5" />
              <span>Retry Terminal Display</span>
            </button>
            
            {this.props.farmId && (
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Reload Page
              </button>
            )}
          </div>

          {this.state.errorCount > 2 && (
            <div className="mt-6 bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
              <p className="text-yellow-400 text-sm">
                Multiple errors detected. This might be a GoWild terminal streaming issue.
                Try refreshing the page or checking the server logs.
              </p>
            </div>
          )}
        </div>
      );
    }

    // Normal render when no error
    return this.props.children;
  }
}