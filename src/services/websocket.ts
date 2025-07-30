import { io, Socket } from 'socket.io-client';
import { toast } from 'react-hot-toast';

export interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'active' | 'completed' | 'error';
  currentTask?: string;
  progress?: number;
  lastUpdate: Date;
  resources: {
    cpu: number;
    memory: number;
    network: number;
  };
}

export interface FarmStatus {
  id: string;
  name: string;
  status: 'preparing' | 'running' | 'paused' | 'completed' | 'failed';
  agents: AgentStatus[];
  startTime: Date;
  endTime?: Date;
  metrics: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    efficiency: number;
  };
}

export interface WebSocketMessage {
  type: 'agent_update' | 'farm_update' | 'log' | 'error' | 'notification';
  payload: any;
  timestamp: Date;
}

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, Set<(message: WebSocketMessage) => void>> = new Map();
  private connectionRetries = 0;
  private maxRetries = 5;

  constructor() {
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.emit = this.emit.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
  }

  connect(url: string = 'ws://localhost:8765') {
    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      this.socket = io(url, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxRetries,
      });

      this.setupEventHandlers();
      this.connectionRetries = 0;
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.handleReconnect();
    }
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      toast.success('Connected to MaiFarm server');
      this.connectionRetries = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      toast.error('Disconnected from server');
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        this.handleReconnect();
      }
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      toast.error('Connection error');
    });

    // Handle incoming messages
    this.socket.on('message', (data: WebSocketMessage) => {
      this.handleMessage(data);
    });

    // Handle specific event types
    this.socket.on('agent_update', (data: AgentStatus) => {
      this.handleMessage({
        type: 'agent_update',
        payload: data,
        timestamp: new Date(),
      });
    });

    this.socket.on('farm_update', (data: FarmStatus) => {
      this.handleMessage({
        type: 'farm_update',
        payload: data,
        timestamp: new Date(),
      });
    });
  }

  private handleMessage(message: WebSocketMessage) {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }

    // Global message handler
    const globalHandlers = this.messageHandlers.get('*');
    if (globalHandlers) {
      globalHandlers.forEach(handler => handler(message));
    }
  }

  private handleReconnect() {
    if (this.connectionRetries >= this.maxRetries) {
      toast.error('Failed to connect to server. Please refresh the page.');
      return;
    }

    this.connectionRetries++;
    const delay = Math.min(1000 * Math.pow(2, this.connectionRetries), 30000);

    this.reconnectTimeout = setTimeout(() => {
      console.log(`Attempting to reconnect (${this.connectionRetries}/${this.maxRetries})...`);
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event: string, data: any) {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot emit event:', event);
      return;
    }

    this.socket.emit(event, data);
  }

  on(event: string, handler: (message: WebSocketMessage) => void) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, new Set());
    }
    this.messageHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: (message: WebSocketMessage) => void) {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.messageHandlers.delete(event);
      }
    }
  }

  // Utility methods for common operations
  startFarm(farmConfig: any) {
    this.emit('start_farm', farmConfig);
  }

  pauseFarm(farmId: string) {
    this.emit('pause_farm', { farmId });
  }

  resumeFarm(farmId: string) {
    this.emit('resume_farm', { farmId });
  }

  stopFarm(farmId: string) {
    this.emit('stop_farm', { farmId });
  }

  restartAgent(farmId: string, agentId: string) {
    this.emit('restart_agent', { farmId, agentId });
  }

  getStatus() {
    return this.socket?.connected ? 'connected' : 'disconnected';
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();

// Export types
export type { WebSocketService };