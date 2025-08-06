import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, RefreshCw, Terminal, AlertTriangle } from 'lucide-react';
import errorDog from '../../assets/error-dog.png';

interface ErrorPageProps {
  error?: Error;
  resetError?: () => void;
}

const ErrorPage: React.FC<ErrorPageProps> = ({ error, resetError }) => {
  const navigate = useNavigate();
  
  // Check for error passed from global handler
  const storedError = React.useMemo(() => {
    const errorStr = sessionStorage.getItem('lastError');
    if (errorStr) {
      try {
        const parsed = JSON.parse(errorStr);
        sessionStorage.removeItem('lastError'); // Clear after reading
        // Only create an Error if there's actually a message
        if (parsed && parsed.message) {
          return new Error(parsed.message);
        }
      } catch (e) {
        console.warn('Failed to parse stored error:', e);
      }
    }
    return null;
  }, []);
  
  const displayError = error || storedError;
  
  // If no error to display and user navigated directly to /error, redirect to home
  React.useEffect(() => {
    if (!displayError && !error) {
      console.log('No error to display, redirecting to home...');
      navigate('/home', { replace: true });
    }
  }, [displayError, error, navigate]);

  const dogPuns = [
    "Doggone it! We fetched an error instead of your page!",
    "Ruff day! Something went wrong on our end.",
    "Paws for a moment... We've encountered an error!",
    "This is im-paw-sible! An error occurred.",
    "Fur real? We've hit a snag!",
    "Woof! We're having a ruff time loading this page.",
    "Un-fur-tunately, something went wrong!",
    "Howl-arious! We messed something up.",
    "Pup Pupp-please forgive me, we made a mess."
  ];

  const randomPun = dogPuns[Math.floor(Math.random() * dogPuns.length)];

  const handleReset = () => {
    if (resetError) {
      resetError();
    }
    window.location.href = '/';
  };

  const handleRebuild = () => {
    // Clear all caches and storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear service worker caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => registration.unregister());
      });
    }
    
    // Force reload
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        {/* Error Dog Image */}
        <div className="mb-8 relative">
          <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full"></div>
          <img 
            src={errorDog} 
            alt="Error Dog - A pixelated golden retriever puppy looking apologetic"
            className="relative z-10 mx-auto w-64 h-64 object-contain pixelated"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Error Message */}
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 font-mono">
          {randomPun}
        </h1>

        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
          Our AI agents are sniffing around to find out what went wrong. 
          In the meantime, you can try these options:
        </p>

        {/* Error Details Window */}
        {displayError && (
          <div className="mb-8 max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Window Header */}
              <div className="bg-red-500 dark:bg-red-600 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-white" />
                  <h3 className="font-semibold text-white">Error Details</h3>
                </div>
                <div className="flex gap-1">
                  <div className="w-3 h-3 bg-red-300 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-300 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-300 rounded-full"></div>
                </div>
              </div>
              
              {/* Window Content */}
              <div className="p-6">
                {/* Error Message */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Error Message:</h4>
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-700 dark:text-red-300 font-mono break-all">
                      {displayError.message || 'Unknown error occurred'}
                    </p>
                  </div>
                </div>

                {/* Error Type */}
                {displayError.name && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Error Type:</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                      {displayError.name}
                    </p>
                  </div>
                )}

                {/* Timestamp */}
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Occurred At:</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {new Date().toLocaleString()}
                  </p>
                </div>

                {/* Stack Trace */}
                {displayError.stack && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Stack Trace:</h4>
                    <div className="bg-gray-900 dark:bg-black rounded p-4 max-h-48 overflow-y-auto">
                      <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                        {displayError.stack}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Additional Debug Info */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Debug Information:</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Browser:</span>
                      <span className="ml-2 text-gray-700 dark:text-gray-300 font-mono">
                        {navigator.userAgent.split(' ').slice(-2).join(' ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">URL:</span>
                      <span className="ml-2 text-gray-700 dark:text-gray-300 font-mono truncate">
                        {window.location.pathname}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
          >
            <Home className="w-5 h-5" />
            Go Home
          </button>

          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            Reset & Retry
          </button>

          <button
            onClick={handleRebuild}
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors"
          >
            <Terminal className="w-5 h-5" />
            Clear & Rebuild
          </button>
        </div>

        {/* CLI Commands */}
        <div className="mt-12 p-6 bg-gray-900 dark:bg-black rounded-lg text-left max-w-lg mx-auto">
          <p className="text-green-400 font-mono text-sm mb-3">
            # CLI Recovery Commands:
          </p>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-gray-500">$</span>
              <code className="text-gray-300 text-sm">npm run build:check</code>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-500">$</span>
              <code className="text-gray-300 text-sm">npm run dev:reset</code>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-500">$</span>
              <code className="text-gray-300 text-sm">rm -rf node_modules && npm install</code>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-500">$</span>
              <code className="text-gray-300 text-sm">docker-compose down && docker-compose up -d</code>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          Need help? Check our{' '}
          <a 
            href="https://github.com/your-repo/maifarm/issues" 
            className="text-blue-500 hover:text-blue-600 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Issues
          </a>
          {' '}or contact support.
        </p>
      </div>
    </div>
  );
};

export default ErrorPage;