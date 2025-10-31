/**
 * Centralized WebSocket configuration
 * This ensures all components use the same WebSocket URL and settings
 */

// Get the base URL from environment or default
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4567';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4567';

// Normalize the WebSocket URL for Socket.io
export function getWebSocketUrl(): string {
  // Socket.io needs the HTTP/HTTPS URL, not WS/WSS
  // It will handle the WebSocket upgrade itself
  
  // If we have an explicit API URL, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // If we have a WebSocket URL, convert it to HTTP/HTTPS for Socket.io
  if (import.meta.env.VITE_WS_URL) {
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (wsUrl.startsWith('wss://')) {
      return wsUrl.replace('wss://', 'https://');
    } else if (wsUrl.startsWith('ws://')) {
      return wsUrl.replace('ws://', 'http://');
    }
    return wsUrl;
  }
  
  // Default fallback
  return 'http://localhost:4567';
}

// Default WebSocket configuration
export const DEFAULT_WS_CONFIG = {
  url: getWebSocketUrl(),
  reconnect: true,
  reconnectAttempts: 5,
  reconnectDelay: 5000, // 5 seconds
};

// Export the normalized URL for direct use
export const WEBSOCKET_URL = getWebSocketUrl();