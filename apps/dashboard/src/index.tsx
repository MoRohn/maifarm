// @ts-nocheck
// TypeScript errors temporarily disabled for testing
import './polyfills' // Import polyfills first
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/theme.css'
import { logError, ErrorCategory, ErrorSeverity } from './utils/errorLogger'
import { themeService } from './services/themeService'

// Track app start time for performance metrics
(window as any).__APP_START_TIME__ = Date.now();
// Track if app is fully loaded to prevent premature error redirects
(window as any).__APP_LOADED__ = false;

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
  
  // For other critical errors, redirect to error page (but not during initial load)
  if (error && error.stack && !window.location.pathname.includes('/error') && (window as any).__APP_LOADED__) {
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
  
  // For other critical errors, redirect to error page (but not during initial load)
  if (!window.location.pathname.includes('/error') && (window as any).__APP_LOADED__) {
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
  try {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme-storage');
    if (savedTheme) {
      const parsed = JSON.parse(savedTheme);
      const theme = parsed?.state?.theme || 'dark';
      
      // Apply theme class immediately
      document.documentElement.classList.remove('light', 'dark');
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        document.documentElement.classList.add(systemTheme);
      } else {
        document.documentElement.classList.add(theme);
      }
    } else {
      // Default to dark theme
      document.documentElement.classList.add('dark');
    }
    
    // Apply saved color scheme if available
    const savedScheme = themeService.loadSavedScheme();
    if (savedScheme) {
      const isDark = document.documentElement.classList.contains('dark');
      themeService.applyColorScheme(savedScheme, isDark ? 'dark' : 'light');
    }
  } catch (error) {
    console.warn('Theme initialization error:', error);
    // Fallback to dark theme
    document.documentElement.classList.add('dark');
  }
};

// Initialize theme before React renders
initializeTheme();

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

// Hide root element initially to prevent flash
rootElement.style.opacity = '0';
rootElement.style.transition = 'opacity 0.3s ease-in-out';

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Show root element after React has mounted
setTimeout(() => {
  rootElement.style.opacity = '1';
  // Mark app as loaded to enable error redirects
  (window as any).__APP_LOADED__ = true;
}, 50);