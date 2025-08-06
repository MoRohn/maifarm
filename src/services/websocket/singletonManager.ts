import { Socket } from 'socket.io-client';
import { WebSocketConnectionManager, ConnectionState } from './connectionManager';
import { useWebSocketStore } from '@/store/websocketStore';
import { wsDebugger } from '@/utils/connectionDebugger';
import { reliabilityEnhancer } from './reliabilityEnhancer';

class SingletonWebSocketManager {
  private static instance: SingletonWebSocketManager | null = null;
  private manager: WebSocketConnectionManager | null = null;
  private socket: Socket | null = null;
  private initialized = false;
  private url: string = '';
  private referenceCount = 0;
  private disconnectTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): SingletonWebSocketManager {
    if (!SingletonWebSocketManager.instance) {
      SingletonWebSocketManager.instance = new SingletonWebSocketManager();
    }
    return SingletonWebSocketManager.instance;
  }

  initialize(url: string): Socket {
    // Clear any pending disconnect timer
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    
    // Increment reference count
    this.referenceCount++;
    wsDebugger.log('reference', `Component initialized connection`, this.referenceCount);
    
    // If already initialized with the same URL, return existing socket
    if (this.initialized && this.url === url && this.socket) {
      // Check if socket is still connected or connecting
      if (this.socket.connected || this.socket.connecting) {
        wsDebugger.log('connect', `Reusing existing connection`, this.referenceCount);
        return this.socket;
      }
      // If disconnected, try to reconnect
      wsDebugger.log('reconnect', `Reconnecting existing socket`, this.referenceCount);
      this.socket.connect();
      return this.socket;
    }

    // If URL changed, disconnect and reinitialize
    if (this.url && this.url !== url) {
      console.log('[WebSocket] URL changed, reinitializing connection');
      this.forceDisconnect();
    }

    this.url = url;

    // Only create new manager if we don't have one
    if (!this.manager || !this.socket) {
      console.log('[WebSocket] Creating new WebSocket connection to:', url);
      
      this.manager = new WebSocketConnectionManager({
        url,
        maxRetries: 10,
        initialDelay: 1000,
        maxDelay: 30000,
        silent: true,
        onStateChange: (state) => {
          const store = useWebSocketStore.getState();
          store.setConnected(state === ConnectionState.CONNECTED);
          
          // Log connection state changes (except initial connecting)
          if (state !== ConnectionState.CONNECTING || !this.initialized) {
            console.log(`[WebSocket] Connection status: ${state}`);
          }
        }
      });

      this.socket = this.manager.connect();
      
      // Enhance socket with reliability features
      reliabilityEnhancer.enhanceSocket(this.socket);
      
      this.setupGlobalHandlers();
      this.initialized = true;
    }

    return this.socket!;
  }

  private setupGlobalHandlers() {
    if (!this.socket) return;

    // Handle messages and update store
    this.socket.on('message', (message) => {
      const store = useWebSocketStore.getState();
      store.addMessage(message);
    });

    // Handle farm updates
    this.socket.on('farm:updated', (farm) => {
      const store = useWebSocketStore.getState();
      store.updateFarm(farm);
    });

    this.socket.on('farm:created', (farm) => {
      const store = useWebSocketStore.getState();
      store.updateFarm(farm);
    });

    // Handle agent updates
    this.socket.on('agent:updated', (agent) => {
      const store = useWebSocketStore.getState();
      store.updateAgent(agent);
    });

    this.socket.on('agent:status', (data) => {
      const store = useWebSocketStore.getState();
      if (data.agentId && data.status) {
        store.updateAgent({ id: data.agentId, status: data.status });
      }
    });

    // Handle metrics updates
    this.socket.on('metrics:update', (metrics) => {
      const store = useWebSocketStore.getState();
      store.addMessage({
        type: 'metrics:update',
        event: 'metrics:update',
        ...metrics,
        timestamp: metrics.timestamp || new Date()
      });
    });

    // Handle API errors from agents
    this.socket.on('agent:api_error', (data) => {
      console.error('[WebSocket] Agent API Error:', data);
      const store = useWebSocketStore.getState();
      store.addMessage({
        type: 'error',
        event: 'agent:api_error',
        ...data,
        timestamp: data.timestamp || new Date()
      });
      
      // Show user notification for API errors
      if (window.showErrorNotification) {
        window.showErrorNotification(`Agent ${data.agentId}: ${data.error}`);
      }
    });

    // Handle warnings from agents
    this.socket.on('agent:warning', (data) => {
      console.warn('[WebSocket] Agent Warning:', data);
      const store = useWebSocketStore.getState();
      store.addMessage({
        type: 'warning',
        event: 'agent:warning',
        ...data,
        timestamp: data.timestamp || new Date()
      });
      
      // Show user notification for warnings
      if (window.showWarningNotification) {
        window.showWarningNotification(`Agent ${data.agentId}: ${data.warning}`);
      }
    });

    // Handle farm errors
    this.socket.on('farm:error', (data) => {
      console.error('[WebSocket] Farm Error:', data);
      const store = useWebSocketStore.getState();
      store.addMessage({
        type: 'error',
        event: 'farm:error',
        ...data,
        timestamp: data.timestamp || new Date()
      });
      
      // Special handling for API errors
      if (data.errorType === 'api_error' && window.showErrorNotification) {
        window.showErrorNotification(`API Error: ${data.error}`);
      }
    });

    // Handle farm cleanup events
    this.socket.on('farm:cleanup:started', (data) => {
      console.log('[WebSocket] Farm cleanup started:', data);
      const store = useWebSocketStore.getState();
      store.addMessage({
        type: 'info',
        event: 'farm:cleanup:started',
        ...data,
        timestamp: data.timestamp || new Date()
      });
    });

    this.socket.on('farm:cleanup:completed', (data) => {
      console.log('[WebSocket] Farm cleanup completed:', data);
      const store = useWebSocketStore.getState();
      
      // Remove all agents associated with this farm
      const agents = store.agents;
      const agentsToRemove: string[] = [];
      
      agents.forEach((agent, agentId) => {
        if (agent.farmId === data.farmId) {
          agentsToRemove.push(agentId);
        }
      });
      
      // Remove agents from store
      agentsToRemove.forEach(agentId => {
        agents.delete(agentId);
      });
      
      store.addMessage({
        type: 'info',
        event: 'farm:cleanup:completed',
        ...data,
        timestamp: data.timestamp || new Date()
      });
      
      // Trigger event for UI components
      store.triggerEvent('farm:cleanup:completed', data);
    });

    // Handle farm deletion
    this.socket.on('farm:deleted', (data) => {
      console.log('[WebSocket] Farm deleted:', data);
      const store = useWebSocketStore.getState();
      
      // Remove farm from store
      const farms = new Map(store.farms);
      farms.delete(data.farmId);
      
      // Remove all agents associated with this farm
      const agents = new Map(store.agents);
      const agentsToRemove: string[] = [];
      
      agents.forEach((agent, agentId) => {
        if (agent.farmId === data.farmId) {
          agentsToRemove.push(agentId);
        }
      });
      
      agentsToRemove.forEach(agentId => {
        agents.delete(agentId);
      });
      
      store.addMessage({
        type: 'info',
        event: 'farm:deleted',
        ...data,
        timestamp: data.timestamp || new Date()
      });
      
      // Trigger event for UI components
      store.triggerEvent('farm:deleted', data);
    });

    // Handle agent removal
    this.socket.on('agent:removed', (data) => {
      console.log('[WebSocket] Agent removed:', data);
      const store = useWebSocketStore.getState();
      const agents = new Map(store.agents);
      agents.delete(data.agentId);
      
      store.addMessage({
        type: 'info',
        event: 'agent:removed',
        ...data,
        timestamp: data.timestamp || new Date()
      });
    });

    // Handle multiple agents removal
    this.socket.on('agents:removed', (data) => {
      console.log('[WebSocket] Multiple agents removed:', data);
      const store = useWebSocketStore.getState();
      store.addMessage({
        type: 'info',
        event: 'agents:removed',
        ...data,
        timestamp: data.timestamp || new Date()
      });
    });
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.manager?.isConnected() || false;
  }

  release() {
    // Prevent negative reference count
    if (this.referenceCount <= 0) {
      wsDebugger.log('reference', `Release called but reference count is already 0`, this.referenceCount);
      return;
    }
    
    this.referenceCount = Math.max(0, this.referenceCount - 1);
    wsDebugger.log('reference', `Component released connection`, this.referenceCount);
    
    // Only disconnect if no components are using the connection
    if (this.referenceCount === 0) {
      // Add a delay before disconnecting to handle rapid component unmount/mount
      if (this.disconnectTimer) {
        clearTimeout(this.disconnectTimer);
      }
      
      // Increase delay to 10 seconds to handle page transitions better
      this.disconnectTimer = setTimeout(() => {
        if (this.referenceCount === 0) {
          wsDebugger.log('disconnect', `No active references, disconnecting`, 0);
          this.forceDisconnect();
        }
      }, 10000); // 10 second delay
    }
  }

  private forceDisconnect() {
    console.log('[WebSocket] Force disconnecting singleton connection');
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    
    // Clean up reliability enhancer
    reliabilityEnhancer.cleanup();
    
    this.manager?.disconnect();
    this.manager = null;
    this.socket = null;
    this.initialized = false;
    this.url = '';
    this.referenceCount = 0;
  }

  disconnect() {
    // Public disconnect method for backward compatibility
    this.release();
  }

  reconnect() {
    if (this.manager) {
      this.manager.resetConnection();
    } else if (this.url) {
      this.initialize(this.url);
    }
  }

  getConnectionStats() {
    return {
      connected: this.isConnected(),
      referenceCount: this.referenceCount,
      url: this.url,
      initialized: this.initialized,
      hasSocket: !!this.socket,
      socketId: this.socket?.id || null,
      stability: wsDebugger.analyzeConnectionStability()
    };
  }
}

export const wsManager = SingletonWebSocketManager.getInstance();

// Export debug utility for development
if (import.meta.env.DEV) {
  (window as any).wsManager = wsManager;
  (window as any).wsDebugger = wsDebugger;
}