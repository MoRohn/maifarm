import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { WebSocketMessage } from '@/types';
import { wsManager } from '@/services/websocket/singletonManager';
import { useWebSocketStore } from '@/store/websocketStore';

interface UseWebSocketOptions {
  url: string;
  reconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface UseWebSocketReturn {
  connected: boolean;
  isConnected: boolean; // Alias for connected
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: WebSocketMessage) => void;
  disconnect: () => void;
  reconnect: () => void;
  subscribe: (event: string, handler: (data: any) => void) => () => void;
  unsubscribe: (event: string, handler: (data: any) => void) => void;
  socket: Socket | null;
}

export function useWebSocket({
  url,
  reconnect = true,
  reconnectAttempts = 10,
  reconnectDelay = 1000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const hasReleasedRef = useRef(false);
  const { connected, lastMessage } = useWebSocketStore();

  const connect = useCallback(() => {
    // Use singleton manager
    const socket = wsManager.initialize(url);
    socketRef.current = socket;
    hasReleasedRef.current = false;

    // Event handlers are set up in the singleton manager
    // Individual components can still add their own specific handlers
  }, [url, reconnect, reconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    // Only release if we haven't already
    if (!hasReleasedRef.current) {
      wsManager.release();
      hasReleasedRef.current = true;
    }
    socketRef.current = null;
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message', message);
    } else {
      console.warn('Cannot send message: WebSocket is not connected');
    }
  }, []);

  const subscribe = useCallback((event: string, handler: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }
    // Return cleanup function
    return () => {
      if (socketRef.current) {
        socketRef.current.off(event, handler);
      }
    };
  }, []);

  const unsubscribe = useCallback((event: string, handler: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      // Release reference on unmount (only if not already released)
      if (!hasReleasedRef.current) {
        wsManager.release();
        hasReleasedRef.current = true;
      }
      socketRef.current = null;
    };
  }, [url, connect]);

  return {
    connected,
    isConnected: connected, // Alias for connected
    lastMessage,
    sendMessage,
    disconnect,
    reconnect: () => {
      wsManager.reconnect();
    },
    subscribe,
    unsubscribe,
    socket: socketRef.current,
  };
}