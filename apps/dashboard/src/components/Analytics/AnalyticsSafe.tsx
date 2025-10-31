import React, { Suspense, useState, useEffect } from 'react';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Loader2, AlertTriangle } from 'lucide-react';

// Lazy load the main Analytics component with better error handling
const AnalyticsLazy = React.lazy(() =>
  import('./Analytics')
    .then(module => {
      console.log('[AnalyticsSafe] Analytics module loaded successfully');
      return module;
    })
    .catch(err => {
      console.error('[AnalyticsSafe] Failed to load Analytics component:', err);
      // Return a fallback component instead of throwing
      return {
        default: () => (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center p-8 max-w-md">
              <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-orange-500" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Module Load Error
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Failed to load Analytics module: {err.message}
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Reload Page
                </button>
                <a
                  href="/home"
                  className="block w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-center"
                >
                  Return to Dashboard
                </a>
              </div>
            </div>
          </div>
        )
      };
    })
);

/**
 * Safe wrapper for Analytics page with error boundary and loading state
 * This prevents the entire app from crashing if Analytics has issues
 */
export const AnalyticsSafe: React.FC = () => {
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    // Log when component mounts
    console.log('[AnalyticsSafe] Component mounted');
    console.log('[AnalyticsSafe] Current path:', window.location.pathname);
    return () => {
      console.log('[AnalyticsSafe] Component unmounted');
    };
  }, []);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-8 max-w-md">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Load Error
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {loadError.message}
          </p>
          <pre className="text-xs text-left bg-gray-800 text-gray-200 p-4 rounded mb-4 overflow-auto">
            {loadError.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('[AnalyticsSafe] ErrorBoundary caught error:', error);
        console.error('[AnalyticsSafe] Error info:', errorInfo);
        // Don't set load error here - the fallback will handle it
      }}
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--background)' }}>
          <div className="text-center p-8 max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-orange-500" />
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
              Analytics Temporarily Unavailable
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              We're experiencing issues loading the Analytics page. This could be due to:
            </p>
            <ul className="text-left text-sm text-gray-600 dark:text-gray-400 space-y-2 mb-6 pl-4">
              <li>• Missing chart dependencies</li>
              <li>• API connection issues</li>
              <li>• WebSocket connectivity problems</li>
              <li>• Browser compatibility issues</li>
            </ul>
            <div className="space-y-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                Reload Page
              </button>
              <a
                href="/home"
                className="block w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-center font-medium"
              >
                Return to Dashboard
              </a>
            </div>
          </div>
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Loading Analytics...</p>
            </div>
          </div>
        }
      >
        <AnalyticsLazy />
      </Suspense>
    </ErrorBoundary>
  );
};

export default AnalyticsSafe;
