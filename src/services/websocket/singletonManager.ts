import { Socket } from 'socket.io-client';
import { WebSocketConnectionManager, ConnectionState } from './connectionManager';
import { useWebSocketStore } from '@/store/websocketStore';
import { useFarmStore } from '@/store/farmStore';
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
    // Clear any pending disconnect timer immediately
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    
    // Increment reference count
    this.referenceCount++;
    wsDebugger.log('reference', `Component initialized connection`, this.referenceCount);
    
    // If already initialized with the same URL, return existing socket
    if (this.initialized && this.url === url && this.socket) {
      // Always return existing socket if available, even if temporarily disconnected
      // The socket will auto-reconnect on its own
      wsDebugger.log('connect', `Reusing existing connection (connected: ${this.socket.connected})`, this.referenceCount);
      
      // Only manually reconnect if truly disconnected and not already trying
      if (!this.socket.connected && !this.socket.connecting) {
        wsDebugger.log('reconnect', `Manually reconnecting socket`, this.referenceCount);
        this.socket.connect();
      }
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

    // Create a generic event forwarder
    const forwardEvent = (eventName: string) => {
      this.socket!.on(eventName, (data) => {
        const store = useWebSocketStore.getState();
        // Trigger event for components that are subscribed
        store.triggerEvent(eventName, data);
        
        // Also handle specific updates based on event type
        if (eventName.startsWith('farm:')) {
          if (eventName === 'farm:updated' || eventName === 'farm:created') {
            store.updateFarm(data);
          } else if (eventName === 'farm:status') {
            // Update farm status in the farm store
            const farmStore = useFarmStore.getState();
            const farmId = data.farmId || data.payload?.farmId;
            const status = data.status || data.payload?.status;
            if (farmId && status) {
              farmStore.updateFarm(farmId, { status });
            }
          } else if (eventName === 'farm:launched') {
            // Farm launched means it's running
            const farmStore = useFarmStore.getState();
            const farmId = data.farmId || data.payload?.farmId;
            if (farmId) {
              farmStore.updateFarm(farmId, { status: 'running' });
            }
          }
        } else if (eventName.startsWith('agent:')) {
          if (eventName === 'agent:updated') {
            store.updateAgent(data);
          } else if (eventName === 'agent:status' && data.agentId && data.status) {
            store.updateAgent({ id: data.agentId, status: data.status });
          }
        }
      });
    };

    // Forward all relevant events
    const eventsToForward = [
      'message',
      'farm:updated',
      'farm:created', 
      'farm:status',
      'farm:launched',
      'farm:agents:launching',
      'farm:tmux:ready',
      'agent:created',
      'agent:updated',
      'agent:status',
      'agents:updated',
      'agent:output',
      'task:progress',
      'harvest:ready',
      'harvest:created',
      'goWild:status-changed',
      'quicktask:created',
      'quicktask:starting',
      'quicktask:agent:launched',
      'terminal:session',
      'terminal:output',
      'metrics:update',
      'agent:api_error',
      'agent:warning',
      'farm:error',
      'farm:cleanup:started',
      'farm:cleanup:completed',
      'farm:deleted',
      'agent:removed',
      'agents:removed'
    ];

    eventsToForward.forEach(eventName => forwardEvent(eventName));

    // Additional special handling for certain events that need more processing
    // Note: These events are already forwarded above, but need extra handling
    
    // Add messages to store for specific events
    this.socket.on('metrics:update', (metrics) => {
      const store = useWebSocketStore.getState();
      store.addMessage({
        type: 'metrics:update',
        event: 'metrics:update',
        ...metrics,
        timestamp: metrics.timestamp || new Date()
      });
    });
    
    // Show notifications for errors and warnings
    this.socket.on('agent:api_error', (data) => {
      console.error('[WebSocket] Agent API Error:', data);
      if (window.showErrorNotification) {
        window.showErrorNotification(`Agent ${data.agentId}: ${data.error}`);
      }
    });

    this.socket.on('agent:warning', (data) => {
      console.warn('[WebSocket] Agent Warning:', data);
      if (window.showWarningNotification) {
        window.showWarningNotification(`Agent ${data.agentId}: ${data.warning}`);
      }
    });

    this.socket.on('farm:error', (data) => {
      console.error('[WebSocket] Farm Error:', data);
      if (data.errorType === 'api_error' && window.showErrorNotification) {
        window.showErrorNotification(`API Error: ${data.error}`);
      }
    });

    // Handle agent status updates
    this.socket.on('agent:status', (data) => {
      console.log('[WebSocket] Agent status update:', data);
      const webSocketStore = useWebSocketStore.getState();
      const farmStore = useFarmStore.getState();
      
      // Update agent in WebSocket store
      webSocketStore.updateAgent({
        id: data.agentId,
        farmId: data.farmId,
        status: data.status,
        sessionName: data.sessionName,
        timestamp: data.timestamp
      });
      
      // Update farm's agent list in farmStore
      if (data.farmId) {
        const farm = farmStore.farms.find(f => f.id === data.farmId);
        if (farm) {
          const updatedAgents = farm.agents ? [...farm.agents] : [];
          const agentIndex = updatedAgents.findIndex(a => a.id === data.agentId);
          
          if (agentIndex >= 0) {
            // Update existing agent
            updatedAgents[agentIndex] = {
              ...updatedAgents[agentIndex],
              status: data.status,
              sessionName: data.sessionName
            };
          } else if (data.status !== 'stopped' && data.status !== 'error') {
            // Add new agent if it's not being removed
            updatedAgents.push({
              id: data.agentId,
              name: data.sessionName || `Agent ${data.agentId}`,
              status: data.status,
              farmId: data.farmId,
              type: 'claude',
              capabilities: [],
              createdAt: new Date(data.timestamp || Date.now()),
              updatedAt: new Date()
            });
          }
          
          // Update farm with new agent list
          farmStore.updateFarm(data.farmId, { agents: updatedAgents });
          
          // Update total agent count in stats
          const totalAgents = farmStore.farms.reduce((sum, f) => sum + (f.agents?.length || 0), 0);
          farmStore.updateStats({ totalAgents });
        }
      }
    });
    
    // Handle agent created events
    this.socket.on('agent:created', (data) => {
      console.log('[WebSocket] Agent created:', data);
      const farmStore = useFarmStore.getState();
      
      if (data.farmId) {
        const farm = farmStore.farms.find(f => f.id === data.farmId);
        if (farm) {
          const updatedAgents = farm.agents ? [...farm.agents] : [];
          
          // Add new agent if not already present
          if (!updatedAgents.find(a => a.id === data.agentId)) {
            updatedAgents.push({
              id: data.agentId,
              name: data.name || `Agent ${data.agentId}`,
              status: data.status || 'initializing',
              farmId: data.farmId,
              type: data.type || 'claude',
              capabilities: data.capabilities || [],
              createdAt: new Date(),
              updatedAt: new Date()
            });
            
            // Update farm with new agent list
            farmStore.updateFarm(data.farmId, { agents: updatedAgents });
            
            // Update total agent count in stats
            const totalAgents = farmStore.farms.reduce((sum, f) => sum + (f.agents?.length || 0), 0);
            farmStore.updateStats({ totalAgents });
          }
        }
      }
    });

    // Handle agents updated event (batch update)
    this.socket.on('agents:updated', (agents) => {
      console.log('[WebSocket] Agents batch update:', agents);
      const farmStore = useFarmStore.getState();
      
      // Group agents by farm
      const agentsByFarm = new Map<string, any[]>();
      
      if (Array.isArray(agents)) {
        agents.forEach(agent => {
          if (agent.farm_id) {
            if (!agentsByFarm.has(agent.farm_id)) {
              agentsByFarm.set(agent.farm_id, []);
            }
            agentsByFarm.get(agent.farm_id)?.push({
              id: agent.agent_id,
              name: agent.session_name || `Agent ${agent.agent_id}`,
              status: agent.status,
              farmId: agent.farm_id,
              type: 'claude',
              capabilities: [],
              createdAt: new Date(agent.started || Date.now()),
              updatedAt: new Date()
            });
          }
        });
      }
      
      // Update each farm with its agents
      agentsByFarm.forEach((farmAgents, farmId) => {
        farmStore.updateFarm(farmId, { agents: farmAgents });
      });
      
      // Update total agent count in stats
      const totalAgents = farmStore.farms.reduce((sum, f) => sum + (f.agents?.length || 0), 0);
      farmStore.updateStats({ totalAgents });
    });

    // Clean up agents when farms are deleted or cleaned up
    this.socket.on('farm:cleanup:completed', (data) => {
      console.log('[WebSocket] Farm cleanup completed:', data);
      const store = useWebSocketStore.getState();
      const farmStore = useFarmStore.getState();
      
      // Remove all agents associated with this farm
      const agents = new Map(store.agents);
      agents.forEach((agent, agentId) => {
        if (agent.farmId === data.farmId) {
          agents.delete(agentId);
        }
      });
      // Update store with cleaned agents
      store.agents = agents;
      
      // Clear agents from farm in farmStore
      farmStore.updateFarm(data.farmId, { agents: [] });
      
      // Update total agent count
      const totalAgents = farmStore.farms.reduce((sum, f) => sum + (f.agents?.length || 0), 0);
      farmStore.updateStats({ totalAgents });
    });

    this.socket.on('farm:deleted', (data) => {
      console.log('[WebSocket] Farm deleted:', data);
      const store = useWebSocketStore.getState();
      const farmStore = useFarmStore.getState();
      
      // Remove farm from store
      const farms = new Map(store.farms);
      farms.delete(data.farmId);
      
      // Remove all agents associated with this farm
      const agents = new Map(store.agents);
      agents.forEach((agent, agentId) => {
        if (agent.farmId === data.farmId) {
          agents.delete(agentId);
        }
      });
      
      // Update store
      store.farms = farms;
      store.agents = agents;
      
      // Update total agent count after farm deletion
      const totalAgents = farmStore.farms.reduce((sum, f) => sum + (f.agents?.length || 0), 0);
      farmStore.updateStats({ totalAgents });
    });

    this.socket.on('agent:removed', (data) => {
      console.log('[WebSocket] Agent removed:', data);
      const store = useWebSocketStore.getState();
      const farmStore = useFarmStore.getState();
      
      const agents = new Map(store.agents);
      agents.delete(data.agentId);
      store.agents = agents;
      
      // Remove agent from farm's agent list
      if (data.farmId) {
        const farm = farmStore.farms.find(f => f.id === data.farmId);
        if (farm && farm.agents) {
          const updatedAgents = farm.agents.filter(a => a.id !== data.agentId);
          farmStore.updateFarm(data.farmId, { agents: updatedAgents });
          
          // Update total agent count
          const totalAgents = farmStore.farms.reduce((sum, f) => sum + (f.agents?.length || 0), 0);
          farmStore.updateStats({ totalAgents });
        }
      }
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
      
      // Increase delay to 60 seconds to handle page transitions and rapid mount/unmount cycles
      // This prevents disconnection during normal navigation and component updates
      this.disconnectTimer = setTimeout(() => {
        // Double-check reference count before disconnecting
        if (this.referenceCount === 0) {
          wsDebugger.log('disconnect', `No active references after 60s, disconnecting`, 0);
          this.forceDisconnect();
        } else {
          wsDebugger.log('reference', `Disconnect cancelled, active references: ${this.referenceCount}`, this.referenceCount);
        }
      }, 60000); // 60 second delay to prevent disconnects during navigation
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