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
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private lastConnectionAttempt = 0;
  private connectionDebounceDelay = 500; // Minimum delay between connection attempts
  private visibilityHandler: (() => void) | null = null;
  private wasBackgrounded = false;
  private backgroundTime = 0;
  private globalHandlersSetup = false; // CRITICAL FIX: Prevent duplicate event handler registration
  private isReconnecting = false; // CRITICAL FIX: Prevent Safari reconnection loops

  private constructor() {
    // Setup Safari background/foreground handling
    this.setupVisibilityHandling();
  }

  /**
   * Safari Background Tab Handling
   * Safari aggressively suspends WebSocket connections when tabs are backgrounded.
   * This handler ensures we reconnect when the tab becomes visible again.
   */
  private setupVisibilityHandling() {
    if (typeof document === 'undefined') return;

    this.visibilityHandler = () => {
      const isVisible = document.visibilityState === 'visible';

      if (!isVisible) {
        // Tab is being backgrounded - track this
        this.wasBackgrounded = true;
        this.backgroundTime = Date.now();
        console.log('[WebSocket] Tab backgrounded, marking for reconnection check');
      } else if (this.wasBackgrounded && this.socket) {
        // Tab is becoming visible after being backgrounded
        const timeInBackground = Date.now() - this.backgroundTime;
        this.wasBackgrounded = false;

        console.log(`[WebSocket] Tab visible after ${Math.round(timeInBackground / 1000)}s in background`);

        // Safari suspends connections after ~30s in background
        // Check connection health and reconnect if needed
        if (!this.socket.connected || timeInBackground > 30000) {
          // CRITICAL FIX: Prevent reconnection loop by checking isReconnecting flag
          if (this.isReconnecting) {
            console.log('[WebSocket] Already reconnecting, skipping duplicate attempt');
            return;
          }

          console.log('[WebSocket] Safari background suspension detected, reconnecting...');
          this.isReconnecting = true;

          // Force reconnection after Safari background
          if (this.socket) {
            // Disconnect cleanly first
            this.socket.disconnect();

            // Short delay then reconnect with loop prevention
            setTimeout(() => {
              if (this.socket && !this.socket.connected && !this.socket.connecting) {
                this.socket.connect();
              }
              // Reset isReconnecting flag after attempt
              setTimeout(() => {
                this.isReconnecting = false;
              }, 2000); // 2 second cooldown
            }, 100);
          }
        } else {
          // Connection still alive, send a ping to verify
          this.socket.emit('ping', { timestamp: Date.now(), resumeCheck: true });
        }
      }
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);

    // Also handle page freeze/resume events (Page Lifecycle API)
    // These are more aggressive than visibilitychange
    if ('onfreeze' in document) {
      document.addEventListener('freeze', () => {
        console.log('[WebSocket] Page frozen, marking for reconnection');
        this.wasBackgrounded = true;
        this.backgroundTime = Date.now();
      });

      document.addEventListener('resume', () => {
        console.log('[WebSocket] Page resumed from freeze');
        if (this.socket && !this.socket.connected) {
          this.socket.connect();
        }
      });
    }
  }

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
      // Debounce connection attempts to prevent rapid reconnections
      const now = Date.now();
      const timeSinceLastAttempt = now - this.lastConnectionAttempt;
      
      if (!this.socket.connected && !this.socket.connecting && timeSinceLastAttempt > this.connectionDebounceDelay) {
        this.lastConnectionAttempt = now;
        setTimeout(() => {
          if (this.socket && !this.socket.connected && !this.socket.connecting) {
            wsDebugger.log('reconnect', `Manually reconnecting socket after debounce`, this.referenceCount);
            this.socket.connect();
          }
        }, 200); // Slightly longer delay for stability
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
      
      // Set socket in terminal subscription manager
      import('@/utils/terminalSubscriptionManager').then(m => {
        m.terminalSubscriptionManager.setSocket(this.socket!);
      });
      
      this.setupGlobalHandlers();
      this.initialized = true;
    }

    return this.socket!;
  }

  private startHeartbeat() {
    // Clear any existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Set up heartbeat every 30 seconds (reduced frequency for stability)
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('ping', { timestamp: Date.now() });
      } else if (this.socket && !this.socket.connecting) {
        // If disconnected and not already reconnecting, try to reconnect
        // Only log if we haven't logged recently
        if (this.reconnectAttempts === 0) {
          console.log('[WebSocket] Heartbeat detected disconnection, attempting reconnect...');
        }
        this.attemptReconnect();
      }
    }, 30000); // Increased to 30 seconds for stability
  }
  
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
    
    console.log(`[WebSocket] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (this.socket && !this.socket.connected && !this.socket.connecting) {
        this.socket.connect();
      }
    }, delay);
  }

  private setupGlobalHandlers() {
    // CRITICAL FIX: Set flag FIRST to prevent race condition in rapid calls
    // This prevents duplicate handler registration if called multiple times
    if (this.globalHandlersSetup) {
      console.log('[WebSocket] Global handlers already setup, skipping duplicate registration');
      return;
    }
    // FIX: Set flag immediately BEFORE any other operations to prevent race conditions
    this.globalHandlersSetup = true;

    if (!this.socket) {
      // Reset flag since we didn't actually set up handlers
      this.globalHandlersSetup = false;
      return;
    }

    // Start heartbeat monitoring
    this.startHeartbeat();
    
    // Reset reconnect attempts on successful connection
    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      console.log('[WebSocket] Connected successfully');
      
      // Re-set socket in terminal subscription manager on reconnect
      import('@/utils/terminalSubscriptionManager').then(m => {
        m.terminalSubscriptionManager.setSocket(this.socket!);
      });
    });
    
    // Handle disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        this.attemptReconnect();
      }
    });
    
    // Handle connection errors
    this.socket.on('connect_error', (error) => {
      // Handle parse errors specifically
      if (error.message && error.message.includes('parse')) {
        console.warn('[WebSocket] Parse error detected, attempting recovery');
        // Don't increment reconnect attempts for parse errors
        // Instead, try to reconnect with a fresh connection
        setTimeout(() => {
          if (this.socket) {
            this.socket.disconnect();
            this.socket.connect();
          }
        }, 1000);
      } else {
        console.error('[WebSocket] Connection error:', error.message);
        this.attemptReconnect();
      }
    });

    // Handle recovery signals from server
    this.socket.on('connection:recover', (data) => {
      console.log('[WebSocket] Server requested recovery:', data);
      // Reconnect with fresh state
      this.socket?.disconnect();
      setTimeout(() => {
        this.socket?.connect();
      }, 500);
    });

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
            const farm = data.farm || data.payload?.farm;
            
            if (farmId && status) {
              // If farm data is provided, add the farm if it doesn't exist
              const existingFarm = farmStore.farms.find(f => f.id === farmId);
              if (farm && !existingFarm) {
                farmStore.addFarm({
                  id: farmId,
                  name: farm.name || 'Quick Task',
                  description: farm.description || '',
                  status: status,
                  type: farm.type || 'sequential',
                  config: farm.config || {},
                  metadata: farm.metadata || {},
                  metrics: farm.metrics || {},
                  tags: farm.tags || [],
                  agents: farm.agents || [],
                  createdAt: farm.createdAt || new Date(),
                  updatedAt: farm.updatedAt || new Date()
                });
              } else {
                // Otherwise just update the status
                farmStore.updateFarm(farmId, { status });
              }
            }
          } else if (eventName === 'farm:launched') {
            // Farm launched means it's running
            const farmStore = useFarmStore.getState();
            const farmId = data.farmId || data.payload?.farmId;
            if (farmId) {
              farmStore.updateFarm(farmId, { status: 'active' });
            }
          } else if (eventName === 'farm:completed') {
            // Farm completed successfully
            const farmStore = useFarmStore.getState();
            const farmId = data.farmId || data.payload?.farmId;
            if (farmId) {
              farmStore.updateFarm(farmId, { status: 'completed' });
            }
          } else if (eventName === 'farm:failed') {
            // Farm failed
            const farmStore = useFarmStore.getState();
            const farmId = data.farmId || data.payload?.farmId;
            if (farmId) {
              farmStore.updateFarm(farmId, { status: 'failed' });
            }
          } else if (eventName === 'farm:status:changed') {
            // Generic status change event
            const farmStore = useFarmStore.getState();
            const farmId = data.farmId || data.payload?.farmId;
            const status = data.currentStatus || data.status || data.payload?.status;
            if (farmId && status) {
              farmStore.updateFarm(farmId, { status });
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
    // CRITICAL FIX: Removed duplicates that were causing events to fire 2-3 times
    // Events with dedicated handlers below (agent:status, agent:created, agents:updated)
    // are excluded to prevent duplicate processing
    const eventsToForward = [
      'message',
      // Farm events
      'farm:updated',
      'farm:created',
      'farm:status',
      'farm:completed',
      'farm:failed',
      'farm:status:changed',
      'farm:streaming:degraded',
      'farm:launched',
      'farm:agents:launching',
      'farm:tmux:ready',
      'farm:error',
      'farm:cleanup:started',
      'farm:cleanup:completed',
      'farm:deleted',
      // Agent events (agent:status, agent:created, agents:updated, agent:api_error, agent:warning handled separately below)
      'agent:updated',
      'agent:output',
      'agent:terminal',
      'agent:removed',
      'agents:removed',
      // Task events
      'task:progress',
      // Harvest events
      'harvest:ready',
      'harvest:created',
      'harvest:started',
      'harvest:completed',
      'harvest:status',
      'harvest:update',
      'harvest:updated',
      'harvest:progress',
      'harvest:terminal:update',
      'harvest:terminal:command',
      'harvest:keepalive',
      'harvest:yield:updated',
      'harvest:item:updated',
      // Terminal events
      'terminal:output',
      'terminal:update',
      'terminal:streaming:ready',
      'terminal:join_session',
      'terminal:leave_session',
      'terminal:send_command',
      'terminal:attached',
      'terminal:detached',
      'terminal:session',
      'session:prepared',
      // GoWild and QuickTask events
      'goWild:status-changed',
      'quicktask:created',
      'quicktask:starting',
      'quicktask:agent:launched'
      // Note: metrics:update has a dedicated handler below, not in this array
    ];

    // FIX: Use Set to guarantee no duplicate handlers can be registered
    const registeredEvents = new Set<string>();
    eventsToForward.forEach(eventName => {
      if (!registeredEvents.has(eventName)) {
        registeredEvents.add(eventName);
        forwardEvent(eventName);
      }
    });

    // Additional special handling for certain events that need more processing
    // Note: These events are already forwarded above, but need extra handling
    
    // Add messages to store for specific events
    this.socket.on('metrics:update', (metrics) => {
      const store = useWebSocketStore.getState();
      // FIX: Also trigger event for subscribers
      store.triggerEvent('metrics:update', metrics);
      store.addMessage({
        type: 'metrics:update',
        event: 'metrics:update',
        ...metrics,
        timestamp: metrics.timestamp || new Date()
      });
    });
    
    // Show notifications for errors and warnings
    this.socket.on('agent:api_error', (data) => {
      const store = useWebSocketStore.getState();
      // FIX: Trigger event for subscribers
      store.triggerEvent('agent:api_error', data);
      console.error('[WebSocket] Agent API Error:', data);
      if (window.showErrorNotification) {
        window.showErrorNotification(`Agent ${data.agentId}: ${data.error}`);
      }
    });

    this.socket.on('agent:warning', (data) => {
      const store = useWebSocketStore.getState();
      // FIX: Trigger event for subscribers
      store.triggerEvent('agent:warning', data);
      console.warn('[WebSocket] Agent Warning:', data);
      if (window.showWarningNotification) {
        window.showWarningNotification(`Agent ${data.agentId}: ${data.warning}`);
      }
    });

    // WS8 FIX: Track joined rooms for auto-rejoin on reconnect
    this.socket.on('terminal:joined', (data: { sessionId?: string; farmId?: string; joinedRooms?: string[] }) => {
      // Track all rooms that were joined
      if (this.manager) {
        if (data.sessionId) {
          this.manager.trackRoomJoin(`session:${data.sessionId}`);
        }
        if (data.farmId) {
          this.manager.trackRoomJoin(`farm:${data.farmId}`);
        }
        // Track any rooms the server tells us about
        if (data.joinedRooms) {
          data.joinedRooms.forEach(room => this.manager?.trackRoomJoin(room));
        }
      }
    });

    this.socket.on('terminal:leave_session', () => {
      // Clear tracked rooms when leaving sessions
      if (this.manager) {
        this.manager.clearTrackedRooms();
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

      // FIX: Trigger event for subscribers
      webSocketStore.triggerEvent('agent:status', data);

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
      const webSocketStore = useWebSocketStore.getState();
      const farmStore = useFarmStore.getState();

      // FIX: Trigger event for subscribers
      webSocketStore.triggerEvent('agent:created', data);

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
      const webSocketStore = useWebSocketStore.getState();
      const farmStore = useFarmStore.getState();

      // FIX: Trigger event for subscribers
      webSocketStore.triggerEvent('agents:updated', agents);

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
      
      // Remove farm from WebSocket store
      const farms = new Map(store.farms);
      farms.delete(data.farmId);
      
      // Remove all agents associated with this farm from WebSocket store
      const agents = new Map(store.agents);
      agents.forEach((agent, agentId) => {
        if (agent.farmId === data.farmId) {
          agents.delete(agentId);
        }
      });
      
      // Update WebSocket store
      store.farms = farms;
      store.agents = agents;
      
      // CRITICAL FIX: Also remove farm from the Farm store used by sidebar navigation
      farmStore.removeFarm(data.farmId);
      
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

      // CRITICAL FIX: Reduced from 60s to 10s for better resource management
      // 10 seconds is sufficient for page transitions while preventing resource waste
      this.disconnectTimer = setTimeout(() => {
        // Double-check reference count before disconnecting
        if (this.referenceCount === 0) {
          wsDebugger.log('disconnect', `No active references after 10s, disconnecting`, 0);
          this.forceDisconnect();
        } else {
          wsDebugger.log('reference', `Disconnect cancelled, active references: ${this.referenceCount}`, this.referenceCount);
        }
      }, 10000); // 10 second delay (was 60s, reduced for resource efficiency)
    }
  }

  private forceDisconnect() {
    console.log('[WebSocket] Force disconnecting singleton connection');

    // Clear timers
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clean up visibility handler (Safari background handling)
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    // Clean up reliability enhancer
    reliabilityEnhancer.cleanup();

    this.manager?.disconnect();
    this.manager = null;
    this.socket = null;
    this.initialized = false;
    this.url = '';
    this.referenceCount = 0;
    this.reconnectAttempts = 0;
    this.wasBackgrounded = false;
    this.backgroundTime = 0;
    this.globalHandlersSetup = false; // Reset so handlers can be re-registered
    this.isReconnecting = false; // Reset reconnection flag
  }

  disconnect() {
    // Public disconnect method for backward compatibility
    this.release();
  }

  reconnect() {
    // Clear any pending disconnect timer
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    
    if (this.socket && this.socket.connected) {
      console.log('[WebSocket] Already connected, skipping reconnect');
      return;
    }
    
    console.log('[WebSocket] Attempting to reconnect...');
    
    // If we have a socket, try to connect it directly first
    if (this.socket && !this.socket.connecting) {
      this.socket.connect();
    }
    
    // Also use manager's reconnect for retry logic
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