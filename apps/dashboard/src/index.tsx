// @ts-nocheck
// TypeScript errors temporarily disabled for testing
import './polyfills' // Import polyfills first
import { installRequestTracing } from './telemetry/installRequestTracing'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import App from './App'
import './index.css'
import './styles/theme.css'
import { logError, ErrorCategory, ErrorSeverity } from './utils/errorLogger'
import { themeService } from './services/themeService'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// Track app start time for performance metrics
(window as any).__APP_START_TIME__ = Date.now();
// Track if app is fully loaded to prevent premature error redirects
(window as any).__APP_LOADED__ = false;

// Track page reloads for development debugging only
// Uses try-catch for iOS Safari private browsing compatibility
if (import.meta.env.DEV) {
  try {
    const storedCount = sessionStorage.getItem('reloadCount');
    const reloadCount = storedCount ? parseInt(storedCount, 10) + 1 : 1;
    sessionStorage.setItem('reloadCount', reloadCount.toString());
    if (reloadCount > 5) {
      logError(
        new Error('Possible refresh loop'),
        {
          category: ErrorCategory.FRONTEND,
          severity: ErrorSeverity.WARNING,
          operation: 'Excessive page reloads detected',
          metadata: { reloadCount, timestamp: new Date().toISOString() }
        }
      );
    }
  } catch (e) {
    // Silently ignore - sessionStorage not available (e.g., iOS private browsing)
    console.debug('[Index] sessionStorage not available for reload tracking');
  }
}

// Enable request tracing for fetch before any network calls fire
// TEMPORARILY DISABLED: Investigating Safari "string did not match expected pattern" error
// installRequestTracing();
try {
  installRequestTracing();
} catch (e) {
  console.warn('[Index] Request tracing failed to install:', e);
}

// Global error handler for uncaught errors
window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global error caught:', { message, source, lineno, colno, error });
  
  // Don't redirect for WebSocket errors or Router errors - handle them gracefully
  const errorMsg = (message || '').toString().toLowerCase();
  const errorStack = (error?.stack || '').toLowerCase();
  if (errorMsg.includes('websocket') || errorMsg.includes('socket.io') || 
      errorMsg.includes('transport') || errorStack.includes('websocket') ||
      errorStack.includes('socket.io') || errorMsg.includes('usenavigate') ||
      errorMsg.includes('router') || errorStack.includes('router')) {
    console.log('WebSocket/Socket.io/Router error detected, not redirecting to error page');
    return true;
  }
  
  // TEMPORARILY DISABLED: For other critical errors, redirect to error page (but not during initial load)
  // This was causing infinite redirect loops
  if (false && error && error.stack && !window.location.pathname.includes('/error') && (window as any).__APP_LOADED__) {
    sessionStorage.setItem('lastError', JSON.stringify({
      message: error.message || message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
    window.location.href = '/error';
  }

  return true; // Prevent default error handling
};

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  
  // Don't redirect for WebSocket, connection, or Router errors
  const reason = (event.reason?.toString() || '').toLowerCase();
  const reasonMsg = (event.reason?.message || '').toLowerCase();
  if (reason.includes('websocket') || reason.includes('socket.io') || 
      reason.includes('transport') || reason.includes('failed to fetch') || 
      reason.includes('networkerror') || reason.includes('connection') ||
      reasonMsg.includes('websocket') || reasonMsg.includes('socket.io') ||
      reason.includes('usenavigate') || reason.includes('router') ||
      reasonMsg.includes('usenavigate') || reasonMsg.includes('router')) {
    console.log('Network/Router-related error detected, not redirecting to error page');
    event.preventDefault();
    return;
  }
  
  // TEMPORARILY DISABLED: For other critical errors, redirect to error page (but not during initial load)
  // This was causing infinite redirect loops
  if (false && !window.location.pathname.includes('/error') && (window as any).__APP_LOADED__) {
    sessionStorage.setItem('lastError', JSON.stringify({
      message: event.reason?.message || event.reason || 'Unhandled Promise Rejection',
      stack: event.reason?.stack || '',
      timestamp: new Date().toISOString()
    }));
    window.location.href = '/error';
  }

  event.preventDefault();
});

// Prevent theme flashing by initializing before React renders
const initializeTheme = () => {
  const THEME_STORAGE_KEY = 'maifarm-theme';
  const LEGACY_THEME_STORAGE_KEY = 'theme-storage';

  const parseStoredTheme = (value: string | null) => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      const state = parsed?.state ?? parsed;
      if (!state || typeof state !== 'object') return null;
      return { state, rawValue: value };
    } catch {
      return null;
    }
  };

  try {
    // Read the persisted zustand store first, fall back to legacy key for existing users
    let storedTheme = parseStoredTheme(localStorage.getItem(THEME_STORAGE_KEY));
    const legacyTheme = parseStoredTheme(localStorage.getItem(LEGACY_THEME_STORAGE_KEY));

    if (!storedTheme && legacyTheme) {
      storedTheme = legacyTheme;
      // Migrate legacy value so future reads stay in sync with zustand persist key
      localStorage.setItem(THEME_STORAGE_KEY, legacyTheme.rawValue);
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    }

    const resolvedTheme = storedTheme?.state?.theme || 'dark';

    document.documentElement.classList.remove('light', 'dark');
    if (resolvedTheme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.classList.add(systemTheme);
    } else {
      document.documentElement.classList.add(resolvedTheme);
    }

    // Apply saved color scheme if available SYNCHRONOUSLY
    const savedScheme = themeService.loadSavedScheme();
    if (savedScheme) {
      const isDark = document.documentElement.classList.contains('dark');
      themeService.applyColorScheme(savedScheme, isDark ? 'dark' : 'light');
    }

    // Delay enabling transitions to prevent color flash on initial load
    // This ensures the color scheme is fully applied before transitions are enabled
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.add('transitions-enabled');
        document.body.classList.add('transitions-enabled');
      });
    });
  } catch (error) {
    console.warn('Theme initialization error:', error);
    // Fallback to dark theme
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');

    // Delay enabling transitions even on error to prevent flash
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.add('transitions-enabled');
        document.body.classList.add('transitions-enabled');
      });
    });
  }
};

// Initialize theme before React renders
initializeTheme();

// iOS/Safari dynamic viewport height fix
// The 100vh value doesn't account for mobile browser UI (address bar, etc.)
// This sets a CSS variable that accurately reflects the visible viewport height
// ENHANCED: Now uses visualViewport API for accurate iOS keyboard detection
const initializeDynamicViewport = () => {
  const setViewportHeight = () => {
    // ENHANCEMENT: Use visualViewport for accurate iOS Safari keyboard detection
    // visualViewport.height changes when soft keyboard appears/disappears
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;

    // Calculate the actual viewport height in pixels
    const vh = viewportHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    // Also set the full height for convenience
    document.documentElement.style.setProperty('--full-vh', `${viewportHeight}px`);

    // Set viewport width for responsive layouts
    document.documentElement.style.setProperty('--full-vw', `${viewportWidth}px`);

    // Detect if keyboard is likely open (iOS)
    // PERFORMANCE FIX: Improved threshold detection for iPad split-screen and landscape modes
    // - 65% threshold catches phone keyboards in all orientations
    // - 250px threshold catches iPad keyboards (which can be smaller relative to screen)
    const isKeyboardOpen = window.visualViewport && (
      window.visualViewport.height < window.innerHeight * 0.65 ||
      (window.innerHeight > 600 && window.visualViewport.height < window.innerHeight - 250)
    );
    document.documentElement.classList.toggle('keyboard-open', !!isKeyboardOpen);
  };

  // Set initial value
  setViewportHeight();

  // ENHANCEMENT: Use visualViewport resize event for iOS keyboard detection
  // This is more reliable than window.resize for soft keyboard changes
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setViewportHeight);
    window.visualViewport.addEventListener('scroll', setViewportHeight);
  }

  // Update on resize (debounced for performance)
  let resizeTimeout: ReturnType<typeof setTimeout>;
  const debouncedResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(setViewportHeight, 50); // Reduced from 100ms for faster updates
  };

  window.addEventListener('resize', debouncedResize);

  // Also update on orientation change (with longer debounce for animation)
  window.addEventListener('orientationchange', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(setViewportHeight, 300);
  });

  // Handle iOS Safari address bar hide/show by tracking scroll
  let lastScrollY = window.scrollY;
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('scroll', () => {
    // Only trigger update if scroll direction changed (address bar visibility toggle)
    // REDUCED threshold from 50px to 25px for more sensitive detection
    if (Math.abs(window.scrollY - lastScrollY) > 25) {
      lastScrollY = window.scrollY;
      // FIX: Clear previous timeout to prevent stacking
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      // Delay to let iOS finish animation
      scrollTimeout = setTimeout(setViewportHeight, 100); // Reduced from 150ms
    }
  }, { passive: true });
};

// Initialize dynamic viewport height before React renders
initializeDynamicViewport();

// Register service worker with enhanced error handling
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registered:', registration);
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              console.log('New service worker available, reload to update');
              // You could show a notification to the user here
            }
          });
        }
      });
      
      // Check for updates periodically
      setInterval(() => {
        registration.update().catch(error => {
          logError(error, {
            category: ErrorCategory.SYSTEM,
            severity: ErrorSeverity.LOW,
            operation: 'service-worker-update-check'
          });
        });
      }, 60 * 60 * 1000); // Check every hour
      
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      logError(error as Error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        operation: 'service-worker-registration',
        metadata: {
          userAgent: navigator.userAgent,
          online: navigator.onLine
        }
      });
    }
  });
}

// Handle PWA install prompt
let deferredPrompt: any;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // You can show a custom install button here
});

// Add a small delay to ensure DOM is ready and prevent flash
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

console.log('[INDEX.TSX] About to render React app. Root element:', rootElement);

ReactDOM.createRoot(rootElement).render(
  // StrictMode disabled to prevent double-render reload loops in development
  // MotionConfig at the root level ensures framer-motion context is available
  // for all components, fixing Safari-specific useContext null errors
  <MotionConfig reducedMotion="user">
    <ErrorBoundary
      fallbackTitle="Application Error"
      fallbackMessage="MaiFarm encountered an unexpected error. Please refresh the page to continue."
      onError={(error, errorInfo) => {
        logError(error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.HIGH,
          operation: 'app-error-boundary',
          metadata: {
            componentStack: errorInfo.componentStack
          }
        });
      }}
    >
      <App />
    </ErrorBoundary>
  </MotionConfig>
);

// Show root element after React has mounted
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    rootElement.classList.add('ready');
    // Mark app as loaded to enable error redirects
    (window as any).__APP_LOADED__ = true;
  });
});
