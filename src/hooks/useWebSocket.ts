import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { WebSocketMessage } from '@/types';

interface UseWebSocketOptions {
  url: string;
  reconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

interface UseWebSocketReturn {
  connected: boolean;
  lastMessage: WebSocketMessage | null;
  sendMessage: (message: WebSocketMessage) => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useWebSocket({
  url,
  reconnect = true,
  reconnectAttempts = 5,
  reconnectDelay = 1000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    socketRef.current = io(url, {
      transports: ['websocket'],
      reconnection: reconnect,
      reconnectionAttempts: reconnectAttempts,
      reconnectionDelay: reconnectDelay,
    });

    socketRef.current.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
      reconnectAttemptsRef.current = 0;
    });

    socketRef.current.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    socketRef.current.on('message', (message: WebSocketMessage) => {
      setLastMessage(message);
    });

    socketRef.current.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Handle specific message types
    socketRef.current.on('agent_update', (data) => {
      setLastMessage({
        type: 'agent_update',
        payload: data,
        timestamp: new Date(),
      });
    });

    socketRef.current.on('farm_update', (data) => {
      setLastMessage({
        type: 'farm_update',
        payload: data,
        timestamp: new Date(),
      });
    });

    socketRef.current.on('notification', (data) => {
      setLastMessage({
        type: 'notification',
        payload: data,
        timestamp: new Date(),
      });
    });

    socketRef.current.on('metrics_update', (data) => {
      setLastMessage({
        type: 'metrics_update',
        payload: data,
        timestamp: new Date(),
      });
    });
  }, [url, reconnect, reconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message', message);
    } else {
      console.warn('Cannot send message: WebSocket is not connected');
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connected,
    lastMessage,
    sendMessage,
    disconnect,
    reconnect: connect,
  };
}