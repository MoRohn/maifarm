import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { WebSocketEvent } from '../types/api';
import { db, redis } from '../database/connection';
import { taskCounter, activeAgents } from '../api/metrics';
import { validateWebSocketOrigin } from '../middleware/cors';
import AnalyticsWebSocketHandler from './analytics';
import HarvestWebSocketHandler from './harvestHandlers';
import { createTerminalWebSocketHandlers, TERMINAL_EVENTS } from './terminalHandlers';
import { coordinationService } from '../services/coordinationService';
import { costTrackingService } from '../services/costTrackingService';
import { reliabilityManager } from './reliabilityManager';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  roles?: string[];
  permissions?: string[];
}

export class WebSocketServer {
  public io: SocketIOServer;
  private connectedClients: Map<string, AuthenticatedSocket> = new Map();
  private farmSubscriptions: Map<string, Set<string>> = new Map();
  private agentSubscriptions: Map<string, Set<string>> = new Map();
  private analyticsHandler: AnalyticsWebSocketHandler;
  private harvestHandler: HarvestWebSocketHandler;
  private terminalHandlers: ReturnType<typeof createTerminalWebSocketHandlers>;
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          // Allow connections without origin (service workers, same-origin requests)
          if (!origin) {
            callback(null, true);
            return;
          }
          
          // In development, be more permissive
          if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
            // Allow any localhost origin in development
            if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('0.0.0.0')) {
              callback(null, true);
              return;
            }
          }
          
          // Otherwise use the standard validation
          if (validateWebSocketOrigin(origin)) {
            callback(null, true);
          } else {
            console.warn('WebSocket connection rejected from origin:', origin);
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"]
      },
      // Enhanced reliability settings for desktop/laptop clients
      pingTimeout: 90000,  // 90s for desktop clients with stable connections
      pingInterval: 30000,  // 30s ping interval for desktop
      connectTimeout: 60000, // 60s connection timeout for desktop
      transports: ['websocket', 'polling'], // Support fallback to polling
      allowEIO3: true,
      perMessageDeflate: true, // Enable compression for desktop
      httpCompression: true,
      maxHttpBufferSize: 1e8, // 100MB buffer for desktop clients
      // Enhanced connection state recovery
      connectionStateRecovery: {
        maxDisconnectionDuration: 5 * 60 * 1000, // 5 minutes
        skipMiddlewares: false
      },
      // Add adapter options for scaling
      adapter: undefined, // Will use in-memory adapter for now
      // Request buffering
      allowRequest: (req, callback) => {
        // Add rate limiting or other checks here if needed
        callback(null, true);
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startMetricsReporting();
    this.setupCoordinationListeners();
    this.setupCostTrackingListeners();
    this.setupCleanupListeners().catch(err => console.error('Failed to setup cleanup listeners:', err));
    
    // Initialize analytics handler
    this.analyticsHandler = new AnalyticsWebSocketHandler(this.io);
    
    // Initialize harvest handler
    this.harvestHandler = new HarvestWebSocketHandler(this.io);
    
    // Initialize terminal handlers
    this.terminalHandlers = createTerminalWebSocketHandlers(this.io);
    
    
    
  }

  private setupMiddleware() {
    // In local mode, we don't require authentication
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      // Accept any connection in local mode
      socket.userId = socket.handshake.auth.userId || 'local-user';
      socket.roles = ['admin', 'user'];
      // Add comprehensive permissions for development mode
      socket.permissions = [
        'admin:all',
        'farms:read',
        'farms:write',
        'agents:read',
        'agents:write',
        'agents:control',
        'tasks:create',
        'tasks:read',
        'tasks:write',
        'metrics:read',
        'costs:read',
        'health:read',
        'terminals:read',
        'terminals:write'
      ];
      
      next();
    });
  }

  private setupHeartbeat(socket: AuthenticatedSocket) {
    // Initialize heartbeat data
    socket.data.lastPong = Date.now();
    socket.data.missedPings = 0;
    
    // Send initial ping with timestamp
    socket.emit('ping', { timestamp: Date.now() });
    
    // Set up heartbeat interval with enhanced monitoring
    const interval = setInterval(() => {
      const now = Date.now();
      const lastPong = socket.data.lastPong || now;
      const timeSinceLastPong = now - lastPong;
      
      // Track missed pings with more tolerance
      if (timeSinceLastPong > 30000) { // 30 seconds (more tolerant)
        socket.data.missedPings = (socket.data.missedPings || 0) + 1;
        
        // Warn after 3 missed pings (more tolerant)
        if (socket.data.missedPings === 3) {
          console.warn(`[WebSocket] Client ${socket.id} is unresponsive (${timeSinceLastPong}ms since last pong)`);
          socket.emit('connection:warning', { reason: 'unresponsive', missedPings: socket.data.missedPings });
        }
      } else {
        // Reset missed pings if we're getting responses
        socket.data.missedPings = 0;
      }
      
      // Disconnect after 90 seconds of no response (much more tolerant)
      if (timeSinceLastPong > 90000) {
        console.log(`[WebSocket] Client ${socket.id} timed out (${timeSinceLastPong}ms since last pong)`);
        socket.disconnect(true);
        return;
      }
      
      // Send ping with timestamp
      socket.emit('ping', { timestamp: now });
    }, 25000); // Send ping every 25 seconds (less frequent for stability)
    
    // Store interval for cleanup
    this.heartbeatIntervals.set(socket.id, interval);
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`Client connected: ${socket.id} (User: ${socket.userId})`);
      
      // Initialize reliability tracking
      reliabilityManager.initializeHealth(socket.id);
      
      // Setup heartbeat mechanism
      this.setupHeartbeat(socket);
      this.connectedClients.set(socket.id, socket);
      
      // Initialize terminal connection
      this.terminalHandlers.handleTerminalConnect(socket);
      

      // Send initial connection success
      socket.emit('connected', {
        socketId: socket.id,
        userId: socket.userId,
        timestamp: new Date(),
        features: {
          acknowledgments: true,
          queueing: true,
          healthCheck: true,
          compression: true
        }
      });
      
      // Resend any queued messages for this client
      reliabilityManager.resendQueuedMessages(socket);

      // Handle subscriptions
      socket.on('farm:subscribe', async (farmId: string) => {
        if (!this.hasPermission(socket, 'farms:read')) {
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }

        socket.join(`farm:${farmId}`);
        
        if (!this.farmSubscriptions.has(farmId)) {
          this.farmSubscriptions.set(farmId, new Set());
        }
        this.farmSubscriptions.get(farmId)!.add(socket.id);

        // Send current farm state
        const farm = await this.getFarmState(farmId);
        if (farm) {
          socket.emit('farm:state', farm);
        }
      });

      socket.on('farm:unsubscribe', (farmId: string) => {
        socket.leave(`farm:${farmId}`);
        this.farmSubscriptions.get(farmId)?.delete(socket.id);
      });

      socket.on('agent:subscribe', async (agentId: string) => {
        if (!this.hasPermission(socket, 'agents:read')) {
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }

        socket.join(`agent:${agentId}`);
        
        if (!this.agentSubscriptions.has(agentId)) {
          this.agentSubscriptions.set(agentId, new Set());
        }
        this.agentSubscriptions.get(agentId)!.add(socket.id);

        // Send current agent state
        const agent = await this.getAgentState(agentId);
        if (agent) {
          socket.emit('agent:state', agent);
        }
      });

      socket.on('agent:unsubscribe', (agentId: string) => {
        socket.leave(`agent:${agentId}`);
        this.agentSubscriptions.get(agentId)?.delete(socket.id);
      });

      // Multi-Claude WebSocket handlers
      socket.on('multiclaude:subscribe', async () => {
        socket.join('multiclaude:updates');
        socket.emit('multiclaude:connected', { timestamp: new Date() });
        
        // Send current coordination state if available
        try {
          const coordData = await coordinationService.getCoordinationData();
          socket.emit('multiclaude:coordination:update', coordData);
        } catch (error) {
          console.error('Failed to get coordination data:', error);
        }
      });

      socket.on('multiclaude:unsubscribe', () => {
        socket.leave('multiclaude:updates');
        socket.emit('multiclaude:disconnected', { timestamp: new Date() });
      });

      socket.on('multiclaude:agent:command', async (data: { agentId: string, command: string }) => {
        // Broadcast command to all multi-claude subscribers
        this.io.to('multiclaude:updates').emit('multiclaude:agent:update', {
          type: 'agent:command',
          agentId: data.agentId,
          data: { command: data.command, status: 'executing' }
        });
        
        // Also emit to coordination service
        coordinationService.emit('agent:command', data);
      });

      socket.on('multiclaude:agent:prompt', async (data: { agentId: string, prompt: string }) => {
        // Broadcast prompt to all multi-claude subscribers  
        this.io.to('multiclaude:updates').emit('multiclaude:agent:update', {
          type: 'agent:prompt',
          agentId: data.agentId,
          data: { prompt: data.prompt, status: 'processing' }
        });
        
        // Also emit to coordination service
        coordinationService.emit('agent:prompt', data);
      });

      // Handle task operations
      socket.on('task:create', async (taskData, callback) => {
        if (!this.hasPermission(socket, 'tasks:create')) {
          callback({ error: 'Insufficient permissions' });
          return;
        }

        try {
          const task = await this.createTask(taskData, socket.userId!);
          callback({ success: true, data: task });
          
          // Notify farm subscribers
          this.io.to(`farm:${task.farmId}`).emit('task:created', task);
        } catch (error) {
          callback({ error: 'Failed to create task' });
        }
      });

      // Handle agent commands
      socket.on('agent:command', async (data, callback) => {
        if (!this.hasPermission(socket, 'agents:control')) {
          callback({ error: 'Insufficient permissions' });
          return;
        }

        try {
          const { agentId, command, params } = data;
          await this.sendAgentCommand(agentId, command, params);
          callback({ success: true });
        } catch (error) {
          callback({ error: 'Failed to send command' });
        }
      });

      // Handle metrics subscription
      socket.on('metrics:subscribe', (filters) => {
        if (!this.hasPermission(socket, 'metrics:read')) {
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }

        socket.join('metrics:realtime');
        socket.data.metricsFilters = filters;
      });

      socket.on('metrics:unsubscribe', () => {
        socket.leave('metrics:realtime');
        delete socket.data.metricsFilters;
      });

      // Handle cost tracking subscription
      socket.on('cost:subscribe', () => {
        if (!this.hasPermission(socket, 'costs:read')) {
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }

        socket.join('costs:realtime');
        
        // Send current cost metrics immediately
        costTrackingService.getRealTimeMetrics().then(metrics => {
          socket.emit('cost:metrics', metrics);
        }).catch(error => {
          console.error('Failed to get cost metrics:', error);
        });
      });

      socket.on('cost:unsubscribe', () => {
        socket.leave('costs:realtime');
      });

      // Handle health monitoring subscription
      socket.on('health:subscribe', async () => {
        if (!this.hasPermission(socket, 'health:read')) {
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }

        socket.join('health:realtime');
        
        // Send current health summary immediately
        const healthSummary = coordinationService.getHealthSummary();
        socket.emit('health:summary', {
          event: 'health:summary',
          data: healthSummary,
          timestamp: new Date(),
          source: 'health-monitor'
        });

        try {
          // Send current agent health statuses
          const allAgentHealth = await coordinationService.getAllAgentHealth();
          allAgentHealth.forEach(agentHealth => {
            socket.emit('health:status', {
              event: 'health:status',
              data: {
                agentId: agentHealth.agentId,
                status: agentHealth.status,
                contextPercentage: agentHealth.contextPercentage,
                cycleTime: agentHealth.cycleTime,
                lastHeartbeat: agentHealth.lastHeartbeat,
                errorCount: agentHealth.errorCount,
                timestamp: new Date().toISOString()
              },
              timestamp: new Date(),
              source: 'health-monitor'
            });
          });
        } catch (error) {
          console.error('[SocketServer] Error getting agent health:', error);
        }
      });

      socket.on('health:unsubscribe', () => {
        socket.leave('health:realtime');
      });

      // Terminal WebSocket handlers
      socket.on(TERMINAL_EVENTS.JOIN_SESSION, (data: { sessionId: string; farmId?: string }) => {
        if (!this.hasPermission(socket, 'terminals:read')) {
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }
        this.terminalHandlers.handleTerminalJoinSession(socket, data);
      });

      socket.on(TERMINAL_EVENTS.LEAVE_SESSION, (data: { sessionId: string }) => {
        this.terminalHandlers.handleTerminalLeaveSession(socket, data);
      });

      socket.on(TERMINAL_EVENTS.SEND_COMMAND, async (data: { sessionId: string; agentId: number; command: string }) => {
        if (!this.hasPermission(socket, 'terminals:write')) {
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }

        try {
          const response = await fetch(`http://localhost:${process.env.PORT || 4567}/api/terminal/agents/${data.sessionId}-${data.agentId}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: data.command })
          });

          if (response.ok) {
            socket.emit('terminal:command_sent', {
              sessionId: data.sessionId,
              agentId: data.agentId,
              command: data.command,
              success: true,
              timestamp: new Date()
            });
          } else {
            socket.emit('terminal:command_error', {
              sessionId: data.sessionId,
              agentId: data.agentId,
              command: data.command,
              error: 'Failed to send command',
              timestamp: new Date()
            });
          }
        } catch (error) {
          socket.emit('terminal:command_error', {
            sessionId: data.sessionId,
            agentId: data.agentId,
            command: data.command,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
          });
        }
      });

      // Handle agent health query
      socket.on('health:get-agent', (agentId: string, callback) => {
        if (!this.hasPermission(socket, 'health:read')) {
          callback({ error: 'Insufficient permissions' });
          return;
        }

        try {
          const agentHealth = coordinationService.getAgentHealth(agentId);
          callback({ success: true, data: agentHealth });
        } catch (error) {
          callback({ error: 'Failed to get agent health' });
        }
      });

      // Handle heartbeat response with latency tracking
      socket.on('pong', (data?: { timestamp?: number }) => {
        const now = Date.now();
        socket.data.lastPong = now;
        socket.data.missedPings = 0; // Reset missed pings counter
        
        // Calculate latency if timestamp provided
        if (data?.timestamp) {
          const latency = now - data.timestamp;
          socket.data.latency = latency;
          
          // Update reliability manager
          reliabilityManager.updateConnectionHealth(socket.id, {
            lastPong: new Date(now),
            latency,
            connected: true
          });
          
          // Emit latency info periodically
          if (Math.random() < 0.1) { // 10% of pongs
            socket.emit('connection:latency', { latency });
          }
        }
      });
      
      // Handle message acknowledgments
      socket.on('message:ack', (messageId: string) => {
        const acknowledged = reliabilityManager.acknowledgeMessage(messageId);
        if (!acknowledged) {
          console.warn(`[WebSocket] Received ack for unknown message: ${messageId}`);
        }
      });
      
      // Handle batch acknowledgments
      socket.on('messages:ack', (messageIds: string[]) => {
        messageIds.forEach(messageId => {
          reliabilityManager.acknowledgeMessage(messageId);
        });
      });
      
      // Development test handlers for error simulation
      if (process.env.NODE_ENV === 'development') {
        socket.on('test:simulate_error', (data: any) => {
          console.log('[Test] Simulating error:', data.type);
          // Broadcast the simulated error to all clients
          this.io.emit(data.type, data.payload);
        });
      }
      
      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`Client disconnected: ${socket.id} (reason: ${reason})`);
        this.connectedClients.delete(socket.id);
        
        // Update reliability health
        reliabilityManager.updateConnectionHealth(socket.id, {
          connected: false,
          reconnectCount: (socket.data.reconnectCount || 0) + 1
        });
        
        // Clean up reliability tracking after a delay (in case of quick reconnect)
        setTimeout(() => {
          if (!this.connectedClients.has(socket.id)) {
            reliabilityManager.cleanupConnection(socket.id);
          }
        }, 30000); // 30 seconds
        
        // Clean up terminal subscriptions
        this.terminalHandlers.handleTerminalDisconnect(socket);
        
        // Clean up heartbeat interval
        const interval = this.heartbeatIntervals.get(socket.id);
        if (interval) {
          clearInterval(interval);
          this.heartbeatIntervals.delete(socket.id);
        }
        
        // Clean up subscriptions
        this.farmSubscriptions.forEach((sockets, farmId) => {
          sockets.delete(socket.id);
        });
        this.agentSubscriptions.forEach((sockets, agentId) => {
          sockets.delete(socket.id);
        });
      });
    });
  }

  private hasPermission(socket: AuthenticatedSocket, permission: string): boolean {
    // Check if user has admin:all permission (bypass all checks)
    if (socket.permissions?.includes('admin:all')) {
      return true;
    }
    // Check for specific permission
    return socket.permissions?.includes(permission) || false;
  }

  private async getFarmState(farmId: string) {
    const result = await db.query(
      'SELECT * FROM farms WHERE id = $1',
      [farmId]
    );
    return result.rows[0];
  }

  private async getAgentState(agentId: string) {
    const result = await db.query(
      'SELECT * FROM agents WHERE id = $1',
      [agentId]
    );
    return result.rows[0];
  }

  private async createTask(taskData: any, userId: string) {
    // Implementation would create task in database
    // This is a placeholder
    return {
      id: 'task_' + Date.now(),
      ...taskData,
      createdBy: userId,
      createdAt: new Date()
    };
  }

  private async sendAgentCommand(agentId: string, command: string, params: any) {
    // Publish command to Redis for agent to pick up
    await redis.publish(`agent:${agentId}:commands`, JSON.stringify({
      command,
      params,
      timestamp: new Date()
    }));
  }

  // Public methods for server-side events
  public broadcastFarmUpdate(farmId: string, update: any) {
    const event: WebSocketEvent = {
      event: 'farm:updated',
      data: update,
      timestamp: new Date(),
      source: 'server'
    };
    this.io.to(`farm:${farmId}`).emit('farm:updated', event);
  }

  public broadcastAgentUpdate(agentId: string, update: any) {
    const event: WebSocketEvent = {
      event: 'agent:updated',
      data: update,
      timestamp: new Date(),
      source: 'server'
    };
    this.io.to(`agent:${agentId}`).emit('agent:updated', event);
  }

  public broadcastTaskUpdate(taskId: string, farmId: string, update: any) {
    const event: WebSocketEvent = {
      event: 'task:updated',
      data: { taskId, ...update },
      timestamp: new Date(),
      source: 'server'
    };
    this.io.to(`farm:${farmId}`).emit('task:updated', event);
  }

  public broadcastMetrics(metrics: any) {
    const event: WebSocketEvent = {
      event: 'metrics:update',
      data: metrics,
      timestamp: new Date(),
      source: 'server'
    };
    this.io.to('metrics:realtime').emit('metrics:update', event);
  }

  // Broadcast harvest ready event
  public broadcastHarvestReady(harvest: any) {
    const event: WebSocketEvent = {
      event: 'harvest:ready',
      data: harvest,
      timestamp: new Date(),
      source: 'coordination'
    };
    this.io.emit('harvest:ready', event);
  }

  // Broadcast multi-claude agent updates
  public broadcastMultiClaudeUpdate(agentId: string, update: any) {
    const event = {
      type: 'agent:status',
      agentId,
      data: update,
      timestamp: new Date()
    };
    this.io.to('multiclaude:updates').emit('multiclaude:agent:update', event);
  }

  // Broadcast multi-claude coordination update
  public broadcastMultiClaudeCoordination(data: any) {
    this.io.to('multiclaude:updates').emit('multiclaude:coordination:update', data);
  }



  private setupCoordinationListeners() {
    // Listen for agent updates from coordination service
    coordinationService.on('agents:updated', (agents) => {
      const event: WebSocketEvent = {
        event: 'agents:updated',
        data: agents,
        timestamp: new Date(),
        source: 'coordination'
      };
      // Emit both events for backward compatibility
      this.io.emit('agents:updated', agents);
      this.io.emit('coordination:agents', event);
      
      // Also broadcast to multi-claude subscribers
      this.broadcastMultiClaudeCoordination({ activeAgents: agents });
    });

    // Listen for health status updates
    coordinationService.on('health:status', (healthData) => {
      const event: WebSocketEvent = {
        event: 'health:status',
        data: healthData,
        timestamp: new Date(),
        source: 'health-monitor'
      };
      this.io.emit('health:status', event);
      
      // Emit to specific agent subscribers
      const subscriberIds = this.agentSubscriptions.get(healthData.agentId);
      if (subscriberIds) {
        subscriberIds.forEach(socketId => {
          const socket = this.connectedClients.get(socketId);
          if (socket) {
            socket.emit('agent:health:status', event);
          }
        });
      }
    });

    // Listen for health warnings
    coordinationService.on('health:warning', (warningData) => {
      const event: WebSocketEvent = {
        event: 'health:warning',
        data: warningData,
        timestamp: new Date(),
        source: 'health-monitor'
      };
      this.io.emit('health:warning', event);
      
      // Also emit high-priority warning to all clients
      this.io.emit('alert:health', {
        type: 'warning',
        priority: 'high',
        ...warningData
      });
    });

    // Listen for health summaries
    coordinationService.on('health:summary', (summaryData) => {
      const event: WebSocketEvent = {
        event: 'health:summary',
        data: summaryData,
        timestamp: new Date(),
        source: 'health-monitor'
      };
      this.io.emit('health:summary', event);
    });

    // Listen for individual agent status changes
    coordinationService.on('agent:status', (data) => {
      const event: WebSocketEvent = {
        event: 'agent:status',
        data,
        timestamp: new Date(),
        source: 'coordination'
      };
      this.io.emit('agent:status', event);
      
      // Also broadcast to agent-specific room
      if (data.agentId) {
        this.broadcastAgentUpdate(data.agentId, data);
      }
    });

    // Listen for work claims updates
    coordinationService.on('claims:updated', (claims) => {
      const event: WebSocketEvent = {
        event: 'coordination:claims',
        data: claims,
        timestamp: new Date(),
        source: 'coordination'
      };
      this.io.emit('coordination:claims', event);
    });

    // Listen for harvest ready events
    coordinationService.on('harvest:ready', (harvest) => {
      this.broadcastHarvestReady(harvest);
    });

    // Listen for health monitoring events
    coordinationService.on('health:status', (data) => {
      const event: WebSocketEvent = {
        event: 'health:status',
        data,
        timestamp: new Date(),
        source: 'health-monitor'
      };
      
      // Broadcast to all health subscribers
      this.io.to('health:realtime').emit('health:status', event);
      
      // Also broadcast to multiclaude subscribers
      this.io.to('multiclaude:updates').emit('health:status', event);
      
      // Also broadcast to agent-specific room
      if (data.agentId) {
        this.broadcastAgentUpdate(data.agentId, data);
      }
    });

    // Listen for health warnings
    coordinationService.on('health:warning', (data) => {
      const event: WebSocketEvent = {
        event: 'health:warning',
        data,
        timestamp: new Date(),
        source: 'health-monitor'
      };
      
      // Broadcast to all health subscribers
      this.io.to('health:realtime').emit('health:warning', event);
      
      // Also broadcast to multiclaude subscribers
      this.io.to('multiclaude:updates').emit('health:warning', event);
      
      // Also broadcast to agent-specific room for urgent warnings
      if (data.agentId && data.type === 'context') {
        this.broadcastAgentUpdate(data.agentId, { 
          ...data, 
          urgency: 'high',
          recommendedAction: 'Consider context clearing or workload reduction'
        });
      }
    });

    // Listen for periodic health summaries
    coordinationService.on('health:summary', (data) => {
      const event: WebSocketEvent = {
        event: 'health:summary',
        data,
        timestamp: new Date(),
        source: 'health-monitor'
      };
      
      // Broadcast to health subscribers and multiclaude subscribers
      this.io.to('health:realtime').emit('health:summary', event);
      this.io.to('multiclaude:updates').emit('health:summary', event);
    });

    // Listen for work coordination events
    coordinationService.on('work:coordination:claimed', (data) => {
      const event: WebSocketEvent = {
        event: 'work:claimed',
        data,
        timestamp: new Date(),
        source: 'work-coordination'
      };
      this.io.to('multiclaude:updates').emit('work:claimed', event);
    });

    coordinationService.on('work:coordination:completed', (data) => {
      const event: WebSocketEvent = {
        event: 'work:completed',
        data,
        timestamp: new Date(),
        source: 'work-coordination'
      };
      this.io.to('multiclaude:updates').emit('work:completed', event);
    });

    coordinationService.on('work:coordination:queued', (data) => {
      const event: WebSocketEvent = {
        event: 'work:queued',
        data,
        timestamp: new Date(),
        source: 'work-coordination'
      };
      this.io.to('multiclaude:updates').emit('work:queued', event);
    });
  }

  // Setup cost tracking service listeners
  private setupCostTrackingListeners() {
    // Listen for cost updates
    costTrackingService.on('cost:update', (data) => {
      const event: WebSocketEvent = {
        event: 'cost:update',
        data,
        timestamp: new Date(),
        source: 'cost-tracking'
      };
      this.io.to('costs:realtime').emit('cost:update', event);
    });

    // Listen for metrics updates
    costTrackingService.on('metrics:update', (metrics) => {
      const event: WebSocketEvent = {
        event: 'cost:metrics',
        data: metrics,
        timestamp: new Date(),
        source: 'cost-tracking'
      };
      this.io.to('costs:realtime').emit('cost:metrics', event);
    });
  }

  private startMetricsReporting() {
    // Report metrics every 5 seconds
    setInterval(async () => {
      // Default metrics if database is unavailable
      let metrics = {
        recent: [],
        queues: {},
        activeAgents: [],
        connectedClients: this.connectedClients.size,
        timestamp: new Date(),
        dashboard: {
          activeFarms: 0,
          totalAgents: 0,
          tasksCompleted: 0,
          successRate: 100
        }
      };

      try {
        // Get current metrics from database
        const metricsResult = await db.query(`
          SELECT 
            source,
            source_id,
            type,
            name,
            value,
            labels
          FROM metrics
          WHERE timestamp >= NOW() - INTERVAL '10 seconds'
          ORDER BY timestamp DESC
          LIMIT 100
        `);

        // Get queue sizes
        const queueResult = await db.query(`
          SELECT priority, COUNT(*) as count
          FROM tasks
          WHERE status IN ('queued', 'assigned')
          GROUP BY priority
        `);

        // Get active agents count
        const agentResult = await db.query(`
          SELECT farm_id, type, COUNT(*) as count
          FROM agents
          WHERE status = 'active'
          GROUP BY farm_id, type
        `);

        // Update Prometheus metrics
        agentResult.rows.forEach(row => {
          activeAgents.set(
            { farm_id: row.farm_id, type: row.type },
            parseInt(row.count)
          );
        });

        // Get dashboard metrics
        const dashboardMetrics = await db.query(`
          SELECT 
            (SELECT COUNT(*) FROM farms WHERE status = 'active') as active_farms,
            (SELECT COUNT(*) FROM agents) as total_agents,
            (SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '24 hours') as tasks_completed,
            (SELECT 
              CASE 
                WHEN COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) = 0 THEN 100
                ELSE ROUND(
                  (COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
                   COUNT(*) FILTER (WHERE status IN ('completed', 'failed'))::numeric) * 100
                )
              END
             FROM tasks WHERE created_at >= NOW() - INTERVAL '24 hours'
            ) as success_rate
        `);

        const dashboard = dashboardMetrics.rows[0] || {
          active_farms: 0,
          total_agents: 0,
          tasks_completed: 0,
          success_rate: 100
        };

        metrics = {
          recent: metricsResult.rows,
          queues: queueResult.rows.reduce((acc, row) => {
            acc[row.priority] = parseInt(row.count);
            return acc;
          }, {}),
          activeAgents: agentResult.rows,
          connectedClients: this.connectedClients.size,
          timestamp: new Date(),
          dashboard: {
            activeFarms: parseInt(dashboard.active_farms),
            totalAgents: parseInt(dashboard.total_agents),
            tasksCompleted: parseInt(dashboard.tasks_completed),
            successRate: parseInt(dashboard.success_rate)
          }
        };
      } catch (error) {
        // Database not available - use default metrics
        if (error.code !== 'ECONNREFUSED') {
          console.error('Error fetching metrics:', error);
        }
      }

      this.broadcastMetrics(metrics);
    }, 5000);
  }

  // Setup cleanup service listeners
  private async setupCleanupListeners() {
    const { agentCleanupService } = await import('../services/agentCleanupService.js');
    
    // Listen for farm cleanup events
    agentCleanupService.on('cleanup:farm:started', (data: any) => {
      const event: WebSocketEvent = {
        event: 'farm:cleanup:started',
        data,
        timestamp: new Date(),
        source: 'cleanup-service'
      };
      this.io.emit('farm:cleanup:started', event);
    });

    agentCleanupService.on('cleanup:farm:completed', (data: any) => {
      const event: WebSocketEvent = {
        event: 'farm:cleanup:completed',
        data,
        timestamp: new Date(),
        source: 'cleanup-service'
      };
      this.io.emit('farm:cleanup:completed', event);
      
      // Also emit farm deleted event
      this.io.emit('farm:deleted', {
        event: 'farm:deleted',
        data: { farmId: data.farmId },
        timestamp: new Date(),
        source: 'cleanup-service'
      });
    });

    agentCleanupService.on('cleanup:farm:error', (data: any) => {
      const event: WebSocketEvent = {
        event: 'farm:cleanup:error',
        data,
        timestamp: new Date(),
        source: 'cleanup-service'
      };
      this.io.emit('farm:cleanup:error', event);
    });

    // Listen for agent cleanup events
    agentCleanupService.on('cleanup:agent:removed', (data: any) => {
      const event: WebSocketEvent = {
        event: 'agent:removed',
        data,
        timestamp: new Date(),
        source: 'cleanup-service'
      };
      this.io.emit('agent:removed', event);
      
      // Also emit to agent-specific room
      this.io.to(`agent:${data.agentId}`).emit('agent:removed', event);
    });

    agentCleanupService.on('cleanup:disconnected', (data: any) => {
      const event: WebSocketEvent = {
        event: 'agents:cleanup:disconnected',
        data,
        timestamp: new Date(),
        source: 'cleanup-service'
      };
      this.io.emit('agents:cleanup:disconnected', event);
    });
  }

  public getConnectionStats() {
    return {
      totalConnections: this.connectedClients.size,
      farmSubscriptions: Array.from(this.farmSubscriptions.entries()).map(([farmId, sockets]) => ({
        farmId,
        subscribers: sockets.size
      })),
      agentSubscriptions: Array.from(this.agentSubscriptions.entries()).map(([agentId, sockets]) => ({
        agentId,
        subscribers: sockets.size
      }))
    };
  }

  public broadcast(event: string, data: any) {
    this.io.emit(event, data);
  }

  public broadcastToFarm(farmId: string, event: string, data: any) {
    this.io.to(`farm:${farmId}`).emit(event, data);
  }

  public broadcastToAgent(agentId: string, event: string, data: any) {
    this.io.to(`agent:${agentId}`).emit(event, data);
  }

  public sendToUser(userId: string, event: string, data: any) {
    // Find all sockets for this user
    for (const [socketId, socket] of this.connectedClients) {
      if (socket.userId === userId) {
        socket.emit(event, data);
      }
    }
  }
}

export default WebSocketServer;