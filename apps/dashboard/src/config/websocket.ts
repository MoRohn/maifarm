/**
 * Centralized WebSocket configuration
 * This ensures all components use the same WebSocket URL and settings
 */

// Normalize the WebSocket URL for Socket.io
// Safari-safe: Always returns a valid absolute URL to prevent
// "The string did not match the expected pattern" error
export function getWebSocketUrl(): string {
  try {
    // Socket.io needs the HTTP/HTTPS URL, not WS/WSS
    // It will handle the WebSocket upgrade itself

    // If we have an explicit API URL from environment, use it
    if (import.meta.env.VITE_API_URL) {
      const apiUrl = import.meta.env.VITE_API_URL;
      // Ensure it's a valid absolute URL
      if (apiUrl.startsWith('http://') || apiUrl.startsWith('https://')) {
        return apiUrl;
      }
      // Convert relative to absolute
      return new URL(apiUrl, window.location.origin).toString();
    }

    // If we have a WebSocket URL from environment, convert it to HTTP/HTTPS for Socket.io
    if (import.meta.env.VITE_WS_URL) {
      const wsUrl = import.meta.env.VITE_WS_URL;
      if (wsUrl.startsWith('wss://')) {
        return wsUrl.replace('wss://', 'https://');
      } else if (wsUrl.startsWith('ws://')) {
        return wsUrl.replace('ws://', 'http://');
      }
      // Ensure absolute URL
      if (!wsUrl.startsWith('http://') && !wsUrl.startsWith('https://')) {
        return new URL(wsUrl, window.location.origin).toString();
      }
      return wsUrl;
    }

    // Fallback: use current origin (Safari-safe: always absolute)
    // Check if window.location.origin is available (SSR safety)
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }

    // Ultimate fallback for SSR/testing
    return 'http://localhost:4567';
  } catch (error) {
    console.warn('[WebSocket] Failed to get WebSocket URL, using fallback:', error);
    // Safe fallback
    return typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:4567';
  }
}

// Default WebSocket configuration - lazy initialization to avoid Safari issues
// Safari can throw "The string did not match the expected pattern" if URL is accessed too early
let _cachedWebSocketUrl: string | null = null;

export function getCachedWebSocketUrl(): string {
  if (!_cachedWebSocketUrl) {
    _cachedWebSocketUrl = getWebSocketUrl();
  }
  return _cachedWebSocketUrl;
}

// Default WebSocket configuration
// NOTE: url is a getter to ensure it's not evaluated at module load time
export const DEFAULT_WS_CONFIG = {
  get url() {
    return getCachedWebSocketUrl();
  },
  reconnect: true,
  reconnectAttempts: 5,
  reconnectDelay: 5000, // 5 seconds
};

// Export the normalized URL for direct use (lazy)
// Use getCachedWebSocketUrl() or getWebSocketUrl() instead for Safari safety
export const WEBSOCKET_URL = {
  get value() {
    return getCachedWebSocketUrl();
  },
  toString() {
    return getCachedWebSocketUrl();
  }
};