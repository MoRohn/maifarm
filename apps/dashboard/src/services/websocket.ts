import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useWebSocketStore } from '@/store/websocketStore';

// Extend window interface for backend warning flag
declare global {
  interface Window {
    __backendWarningShown?: boolean;
    __firstConnectionShown?: boolean;
  }
}
import { logWebSocketError, ErrorCategory, ErrorSeverity } from '@/utils/errorLogger';
import { mockDataProvider } from './mockDataProvider';
import { createWebSocketRetryManager, WebSocketRetryManager } from '@/utils/websocketRetry';

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
  status: 'preparing' | 'active' | 'paused' | 'completed' | 'failed';
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
  type: 'agent_update' | 'farm_update' | 'log' | 'error' | 'notification' | 'metrics:update' | string;
  event?: string;
  payload?: any;
  data?: any;
  timestamp: Date;
}

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Map<string, Set<(message: WebSocketMessage) => void>> = new Map();
  private connectionRetries = 0;
  private maxRetries = 10;
  private useMockData = false;
  private retryManager: WebSocketRetryManager;
  // FIX: Store service worker listener reference for cleanup
  private serviceWorkerMessageHandler: ((event: MessageEvent) => void) | null = null;

  constructor() {
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.emit = this.emit.bind(this);
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);

    // Initialize retry manager
    this.retryManager = createWebSocketRetryManager({
      maxRetries: this.maxRetries,
      onRetry: (attempt, delay) => {
        // Only show retry messages if backend was previously connected
        if (!window.__backendWarningShown) {
          console.log(`WebSocket retry attempt ${attempt} in ${delay}ms`);
          toast.loading(`Reconnecting... (Attempt ${attempt}/${this.maxRetries})`);
        }
      },
      onMaxRetriesReached: () => {
        this.enableMockDataMode();
      }
    });

    // Listen for service worker messages to pause/resume farms
    // FIX: Store handler reference for proper cleanup
    if ('serviceWorker' in navigator) {
      this.serviceWorkerMessageHandler = (event: MessageEvent) => {
        if (event.data && event.data.type === 'FARM_PAUSE') {
          this.pauseFarm(event.data.farmId);
        } else if (event.data && event.data.type === 'FARM_RESUME') {
          this.resumeFarm(event.data.farmId);
        }
      };
      navigator.serviceWorker.addEventListener('message', this.serviceWorkerMessageHandler);
    }
  }

  connect(url: string = import.meta.env.VITE_API_URL || '/api') {
    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return;
    }
    
    // Prevent multiple connection attempts
    if (this.socket && !this.socket.connected && (this.socket.io as any)._reconnecting) {
      console.log('WebSocket already attempting to reconnect');
      return;
    }

    try {
      // Always connect directly to the backend server on port 4567
      // The Vite proxy doesn't work well with WebSocket connections
      let wsUrl: string;
      
      // In development, always use the backend server directly
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Use the backend server directly on port 4567
        wsUrl = 'http://localhost:4567';
        console.log('Connecting directly to backend WebSocket server');
      } else {
        // Use explicit URL for production or other environments
        wsUrl = url.startsWith('ws://') || url.startsWith('wss://') 
          ? url.replace('ws://', 'http://').replace('wss://', 'https://')
          : url;
      }
      
      console.log('Connecting to WebSocket server at:', wsUrl);
        
      // Get access token from localStorage for authentication
      const accessToken = typeof window !== 'undefined'
        ? localStorage.getItem('accessToken')
        : null;

      this.socket = io(wsUrl, {
        transports: ['websocket'], // Use websocket only to avoid polling auth issues
        reconnection: true, // Enable auto-reconnection
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxRetries,
        path: '/socket.io/',
        timeout: 45000, // Match server's connectTimeout (45s)
        autoConnect: true,
        withCredentials: true, // Match server CORS configuration
        auth: {
          userId: 'local-user', // For local development
          token: accessToken // JWT token for authentication
        },
        upgrade: false, // No upgrade needed with websocket-only transport
        rememberUpgrade: false, // No upgrade to remember
        // Match server's ping/pong settings for stability
        pingTimeout: 60000, // 60s to match server
        pingInterval: 25000 // 25s to match server
      });

      this.setupEventHandlers();
      this.connectionRetries = 0;
    } catch (error) {
      // Only log if backend warning not already shown
      if (!window.__backendWarningShown) {
        console.error('Failed to connect to WebSocket:', error);
        // Don't throw or propagate the error - handle gracefully
        this.enableMockDataMode();
      }
    }
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    // CRITICAL: Remove all existing event listeners before adding new ones
    // This prevents memory leaks from listener accumulation on reconnection
    this.socket.removeAllListeners();

    // CRITICAL FIX: Also remove onAny handlers - removeAllListeners() doesn't clear them
    // Without this, onAny handlers accumulate on each reconnect, causing 1-10MB/hour leak
    this.socket.offAny();

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      
      // Dismiss any connection warning toasts
      toast.dismiss('connection-warning');
      
      // Show success toast if we were previously disconnected or retrying
      if (this.connectionRetries > 0 || window.__backendWarningShown) {
        toast.success('Connected to server');
      }
      
      // Reset connection state
      this.connectionRetries = 0;
      this.retryManager.reset();
      window.__backendWarningShown = false;
      
      // Update the store to reflect connection status
      useWebSocketStore.getState().setConnected(true);
      
      // Emit connected event for ConnectionStatus component
      this.emitInternal('connected', {});
      
      // Disable mock data mode if it was enabled
      if (this.useMockData) {
        this.disableMockDataMode();
      }
    });

    // Handle heartbeat ping from server with timestamp
    this.socket.on('ping', (data?: { timestamp?: number }) => {
      // Respond with pong including timestamp for latency measurement
      this.socket?.emit('pong', { timestamp: data?.timestamp || Date.now() });
    });

    this.socket.on('disconnect', (reason) => {
      // Update the store to reflect disconnection
      useWebSocketStore.getState().setConnected(false);
      
      // Only log if backend was previously connected
      if (!window.__backendWarningShown) {
        console.log('WebSocket disconnected:', reason);
        
        // Don't show error for intentional disconnects
        if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
          toast.error('Disconnected from server');
          logWebSocketError(`WebSocket disconnected: ${reason}`, {
            operation: 'disconnect',
            metadata: { 
              reason,
              intentional: reason === 'io client disconnect' || reason === 'transport close'
            }
          });
        }
      }
      
      if (reason !== 'io client disconnect') {
        // Server disconnected, try to reconnect
        this.handleReconnect();
      }
    });

    this.socket.on('connect_error', (error: any) => {
      this.connectionRetries++;
      
      // More detailed error logging
      console.error(`WebSocket connection error (attempt ${this.connectionRetries}/${this.maxRetries}):`, {
        message: error.message,
        type: error.type,
        transport: this.socket?.io?.engine?.transport?.name || 'unknown',
        wsUrl: (this.socket?.io as any)?.uri || 'unknown'
      });
      
      // Check if this is a transport error
      if (error.type === 'TransportError' || error.message?.includes('xhr poll error')) {
        console.log('Transport error detected - server may be unreachable at', (this.socket?.io as any)?.uri);
        // Log the specific error for debugging
        logWebSocketError(`Transport error: ${error.message}`, {
          operation: 'connect_error',
          metadata: {
            type: error.type,
            attempt: this.connectionRetries,
            maxRetries: this.maxRetries
          }
        });
      }
      
      // Show a warning toast after the first few attempts
      if (this.connectionRetries === 2) {
        toast.loading('Having trouble connecting to the server. Retrying...', {
          id: 'connection-warning'
        });
      }
      
      // Only enable mock mode after max retries are exhausted
      if (!window.__backendWarningShown && this.connectionRetries >= this.maxRetries) {
        toast.dismiss('connection-warning');
        toast.error('Unable to connect to server. Running in offline mode.', {
          duration: 5000
        });
        console.log(`Switching to mock data mode after ${this.maxRetries} failed attempts`);
        this.enableMockDataMode();
        window.__backendWarningShown = true;
      }
    });

    this.socket.on('error', (error) => {
      // Only log if not already warned about backend
      if (!window.__backendWarningShown) {
        console.warn('WebSocket error - switching to offline mode');
        window.__backendWarningShown = true;
      }
      // Don't propagate errors - just enable mock mode
      this.enableMockDataMode();
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

    // Handle farm pause/resume events
    this.socket.on('farm:paused', (data: any) => {
      this.handleMessage({
        type: 'farm:paused',
        payload: data,
        timestamp: new Date(),
      });
      
      // Update service worker with farm status
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'FARM_STATUS_UPDATE',
          farmId: data.farmId,
          status: 'paused',
          autoPauseOnClose: data.isAutoPause,
        });
      }
    });

    this.socket.on('farm:resumed', (data: any) => {
      this.handleMessage({
        type: 'farm:resumed',
        payload: data,
        timestamp: new Date(),
      });
      
      // Update service worker with farm status
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'FARM_STATUS_UPDATE',
          farmId: data.farmId,
          status: 'active',
          autoPauseOnClose: data.isAutoResume,
        });
      }
    });

    // NOTE: Ping handler is already registered at line ~197 with timestamp support
    // Do NOT register a duplicate ping handler here

    // Handle specific events needed by GrowingPage and other components
    this.socket.on('farm:status', (data: any) => {
      this.handleMessage({
        type: 'farm:status',
        payload: data,
        timestamp: new Date(),
      });
      // Also trigger event in websocketStore
      useWebSocketStore.getState().triggerEvent('farm:status', data);
    });

    this.socket.on('agent:output', (data: any) => {
      this.handleMessage({
        type: 'agent:output',
        payload: data,
        timestamp: new Date(),
      });
      useWebSocketStore.getState().triggerEvent('agent:output', data);
    });

    this.socket.on('task:progress', (data: any) => {
      this.handleMessage({
        type: 'task:progress',
        payload: data,
        timestamp: new Date(),
      });
      useWebSocketStore.getState().triggerEvent('task:progress', data);
    });

    this.socket.on('harvest:ready', (data: any) => {
      this.handleMessage({
        type: 'harvest:ready',
        payload: data,
        timestamp: new Date(),
      });
      useWebSocketStore.getState().triggerEvent('harvest:ready', data);
    });

    // Handle terminal output events
    this.socket.on('terminal:output', (data: any) => {
      this.handleMessage({
        type: 'terminal:output',
        payload: data,
        timestamp: new Date(),
      });
      // Trigger event in websocketStore for components that subscribe to it
      useWebSocketStore.getState().triggerEvent('terminal:output', data);
    });

    // Handle agent activity updates (real-time heartbeat)
    this.socket.on('agent:activity:update', (data: any) => {
      this.handleMessage({
        type: 'agent:activity:update',
        payload: data,
        timestamp: new Date(),
      });
      useWebSocketStore.getState().triggerEvent('agent:activity:update', data);
    });

    // Generic event handler for any other events
    this.socket.onAny((event: string, data: any) => {
      // Skip events we've already handled specifically
      const handledEvents = ['connect', 'disconnect', 'error', 'connect_error', 'ping', 'message',
                           'agent_update', 'farm_update', 'farm:paused', 'farm:resumed',
                           'farm:status', 'agent:output', 'task:progress', 'harvest:ready',
                           'terminal:output', 'agent:activity:update'];
      
      if (!handledEvents.includes(event)) {
        this.handleMessage({
          type: event,
          payload: data,
          timestamp: new Date(),
        });
        // Trigger event in websocketStore for components that subscribe to it
        useWebSocketStore.getState().triggerEvent(event, data);
      }
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

  private emitInternal(event: string, data: any) {
    // Emit internal events to registered handlers
    const message: WebSocketMessage = {
      type: event,
      payload: data,
      timestamp: new Date()
    };
    this.handleMessage(message);
  }

  private async handleReconnect() {
    // Emit reconnecting event
    this.emitInternal('reconnecting', {});
    
    // Don't use the retry manager here since socket.io has its own reconnection logic
    // Just let socket.io handle the reconnection attempts
    console.log('Allowing Socket.IO to handle reconnection...');
    
    // If socket.io's reconnection fails after all attempts, it will trigger connect_error
    // and we'll switch to mock data mode there
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // FIX: Clean up mock data interval
    this.stopMockDataGeneration();

    // FIX: Clean up service worker listener to prevent memory leak
    if (this.serviceWorkerMessageHandler && 'serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', this.serviceWorkerMessageHandler);
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
    if (this.useMockData) return 'mock';
    return this.socket?.connected ? 'connected' : 'disconnected';
  }

  isUsingMockData() {
    return this.useMockData;
  }

  isConnecting() {
    return !this.socket?.connected && this.connectionRetries > 0 && this.connectionRetries < this.maxRetries;
  }

  getConnectionAttempts() {
    return this.connectionRetries;
  }

  getMaxRetries() {
    return this.maxRetries;
  }

  // Broadcast method - sends a message to all connected clients
  broadcast(eventOrMessage: string | WebSocketMessage, data?: any) {
    if (typeof eventOrMessage === 'string') {
      // If called with event name and data
      const message: WebSocketMessage = {
        type: eventOrMessage as any,
        payload: data,
        timestamp: new Date()
      };
      this.emit('broadcast', message);
    } else {
      // If called with WebSocketMessage object
      this.emit('broadcast', eventOrMessage);
    }
  }

  // Send method - alias for emit for compatibility
  send(event: string, data: any) {
    this.emit(event, data);
  }

  // Mock data generation for offline mode
  private mockDataInterval: ReturnType<typeof setInterval> | null = null;

  private enableMockDataMode() {
    this.useMockData = true;
    console.warn('Server unavailable. Running in offline mode with mock data.');
    
    // Start mock data provider
    mockDataProvider.start((message) => {
      this.handleMessage(message);
    });
    
    // Notify UI about mock mode
    this.handleMessage({
      type: 'connection:status',
      payload: {
        status: 'mock',
        message: 'Running in offline mode with simulated data'
      },
      timestamp: new Date()
    });
  }

  private disableMockDataMode() {
    this.useMockData = false;
    mockDataProvider.stop();
    // FIX: Also stop internal mock data generation interval
    this.stopMockDataGeneration();

    // Notify UI about live mode
    this.handleMessage({
      type: 'connection:status',
      payload: {
        status: 'connected',
        message: 'Connected to live server'
      },
      timestamp: new Date()
    });
  }

  private generateMockMetrics() {
    const mockMetrics: WebSocketMessage = {
      type: 'metrics:update',
      event: 'metrics:update',
      data: {
        dashboard: {
          activeFarms: Math.floor(Math.random() * 5) + 1,
          totalAgents: Math.floor(Math.random() * 20) + 5,
          tasksCompleted: Math.floor(Math.random() * 100) + 50,
          successRate: Math.floor(Math.random() * 20) + 80
        }
      },
      timestamp: new Date()
    };
    this.handleMessage(mockMetrics);
  }

  private generateMockFarmUpdates() {
    if (Math.random() > 0.7) {
      const statuses = ['preparing', 'active', 'paused', 'completed'];
      const mockFarmUpdate: WebSocketMessage = {
        type: 'farm_update',
        payload: {
          id: `farm_${Math.floor(Math.random() * 1000)}`,
          name: `Mock Farm ${Math.floor(Math.random() * 10)}`,
          status: statuses[Math.floor(Math.random() * statuses.length)],
          agents: [],
          startTime: new Date(Date.now() - Math.random() * 3600000),
          metrics: {
            totalTasks: Math.floor(Math.random() * 50) + 10,
            completedTasks: Math.floor(Math.random() * 40),
            failedTasks: Math.floor(Math.random() * 5),
            efficiency: Math.floor(Math.random() * 30) + 70
          }
        },
        timestamp: new Date()
      };
      this.handleMessage(mockFarmUpdate);
    }
  }

  private generateMockAgentUpdates() {
    if (Math.random() > 0.5) {
      const statuses = ['idle', 'active', 'completed', 'error'];
      const mockAgentUpdate: WebSocketMessage = {
        type: 'agent_update',
        payload: {
          id: `agent_${Math.floor(Math.random() * 1000)}`,
          name: `Mock Agent ${Math.floor(Math.random() * 20)}`,
          status: statuses[Math.floor(Math.random() * statuses.length)],
          currentTask: Math.random() > 0.5 ? `Task ${Math.floor(Math.random() * 100)}` : undefined,
          progress: Math.floor(Math.random() * 100),
          lastUpdate: new Date(),
          resources: {
            cpu: Math.floor(Math.random() * 100),
            memory: Math.floor(Math.random() * 100),
            network: Math.floor(Math.random() * 100)
          }
        },
        timestamp: new Date()
      };
      this.handleMessage(mockAgentUpdate);
    }
  }

  private stopMockDataGeneration() {
    if (this.mockDataInterval) {
      clearInterval(this.mockDataInterval as unknown as number);
      this.mockDataInterval = null;
    }
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();

// Export class and types
export { WebSocketService };
export type { WebSocketService as WebSocketServiceType };