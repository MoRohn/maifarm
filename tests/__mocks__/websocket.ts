// Mock WebSocket service for tests
export class WebSocketService {
  private listeners: Map<string, Set<Function>> = new Map();
  private connected: boolean = false;
  
  constructor() {
    this.listeners = new Map();
    this.connected = false;
  }
  
  connect = jest.fn((url?: string) => {
    this.connected = true;
    this.emit('connect', { url });
    return Promise.resolve();
  });
  
  disconnect = jest.fn(() => {
    this.connected = false;
    this.emit('disconnect', {});
    return Promise.resolve();
  });
  
  on = jest.fn((event: string, handler: Function) => {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(handler);
    return () => this.off(event, handler);
  });
  
  off = jest.fn((event: string, handler?: Function) => {
    if (handler) {
      this.listeners.get(event)?.delete(handler);
    } else {
      this.listeners.delete(event);
    }
  });
  
  emit = jest.fn((event: string, data?: any) => {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  });
  
  send = jest.fn((event: string, data?: any) => {
    return Promise.resolve({ success: true, data });
  });
  
  isConnected = jest.fn(() => this.connected);
  
  getConnectionStatus = jest.fn(() => ({
    connected: this.connected,
    reconnecting: false,
    error: null,
  }));
  
  // Test helper to simulate events
  simulateEvent(event: string, data?: any) {
    this.emit(event, data);
  }
  
  // Test helper to reset state
  reset() {
    this.listeners.clear();
    this.connected = false;
    jest.clearAllMocks();
  }
}

export const websocketService = new WebSocketService();

export default websocketService;

// Export types that might be used
export type AgentStatus = 'idle' | 'active' | 'error' | 'completed';
export type FarmStatus = 'pending' | 'active' | 'completed' | 'failed';
export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
}