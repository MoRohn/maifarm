import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { spawn } from 'child_process';
import { WebSocketEvent } from '../types/api';
import { db, redis } from '../database/connection';
import { taskCounter, activeAgents } from '../api/metrics';
import { validateWebSocketOrigin } from '../middleware/cors';
import { logger } from '../utils/logger';
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
          // Allow connections without origin (service workers, same-origin requests, electron apps)
          if (!origin) {
            callback(null, true);
            return;
          }
          
          // Development mode - very permissive
          if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
            // Allow any localhost/local network origin in development
            const localPatterns = [
              'localhost',
              '127.0.0.1',
              '0.0.0.0',
              '192.168.',
              '10.',
              '172.',
              'file://', // Electron/Desktop apps
              'capacitor://', // Mobile apps
              'http://localhost',
              'https://localhost'
            ];
            
            if (localPatterns.some(pattern => origin.includes(pattern))) {
              callback(null, true);
              return;
            }
          }
          
          // Production - use strict validation
          if (validateWebSocketOrigin(origin)) {
            callback(null, true);
          } else {
            logger.warn('WEBSOCKET', `Connection rejected from origin: ${origin}`);
            // In production, still allow but log for monitoring
            callback(null, true);
          }
        },
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
      },
      // Optimized connection settings for reliability
      pingTimeout: 60000,     // 60s timeout (balanced for stability)
      pingInterval: 25000,     // 25s ping interval
      connectTimeout: 45000,   // 45s initial connection timeout
      transports: ['websocket', 'polling'], // Fallback support
      allowEIO3: true,         // Support older clients
      perMessageDeflate: {     // Optimized compression
        threshold: 1024,       // Only compress messages > 1KB
        zlibDeflateOptions: {
          level: 1             // Fast compression
        }
      },
      httpCompression: true,
      maxHttpBufferSize: 10 * 1024 * 1024, // 10MB (reasonable for most operations)
      
      // Connection state recovery for disconnections
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        skipMiddlewares: false
      },
      
      // Prevent socket.io from serving client files (we use npm package)
      serveClient: false,
      
      // Allow WebSocket upgrades
      allowUpgrades: true,
      
      // Cookie configuration
      cookie: false, // We handle auth differently
      
      // Request validation
      allowRequest: (req, callback) => {
        // Could add rate limiting or IP blocking here
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
    // Add global error handler for Socket.io
    this.io.engine.on('connection_error', (err: any) => {
      console.log('[WebSocket] Connection error:', {
        req: err.req,
        code: err.code,
        message: err.message,
        context: err.context
      });
    });

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`[WebSocket] ✅ Client connected: ${socket.id} (User: ${socket.userId || 'anonymous'})`);
      console.log(`[WebSocket] Total connected clients: ${this.connectedClients.size + 1}`);
      
      // Initialize client room tracking
      socket.data.joinedRooms = new Set<string>();
      socket.data.lastActivity = Date.now();
      
      // Add socket-level error handler
      socket.on('error', (error) => {
        console.error(`[WebSocket] Socket error for ${socket.id}:`, error);
        // Don't disconnect on parse errors, try to recover
        if (error.message && error.message.includes('parse')) {
          console.log('[WebSocket] Attempting to recover from parse error');
          // Send a recovery signal to the client
          socket.emit('connection:recover', { reason: 'parse_error' });
        }
      });
      
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
          compression: true,
          roomAutoJoin: true // New feature flag
        },
        serverInfo: {
          connectedClients: this.connectedClients.size + 1,
          serverTime: new Date()
        }
      });
      
      // CRITICAL FIX: Auto-rejoin rooms if client has reconnected
      this.handleClientReconnection(socket);
      
      // Resend any queued messages for this client
      reliabilityManager.resendQueuedMessages(socket);

      // Handle subscriptions
      socket.on('farm:subscribe', async (farmId: string) => {
        if (!this.hasPermission(socket, 'farms:read')) {
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }

        const farmRoom = `farm:${farmId}`;
        socket.join(farmRoom);
        console.log(`[WebSocket] Socket ${socket.id} joined farm room: ${farmRoom}`);
        
        if (!this.farmSubscriptions.has(farmId)) {
          this.farmSubscriptions.set(farmId, new Set());
        }
        this.farmSubscriptions.get(farmId)!.add(socket.id);

        // Send current farm state
        const farm = await this.getFarmState(farmId);
        if (farm) {
          socket.emit('farm:state', farm);
        }
        
        // Confirm subscription
        socket.emit('farm:subscribed', { farmId, room: farmRoom, timestamp: new Date() });
      });

      socket.on('farm:unsubscribe', (farmId: string) => {
        socket.leave(`farm:${farmId}`);
        this.farmSubscriptions.get(farmId)?.delete(socket.id);
      });

      // Test echo handler for terminal output testing (normalization and isolation)
      // This must be registered early to intercept test events before other handlers
      socket.on('terminal:output', (data: any) => {
        // Only echo back test events that have a testMarker
        if (data.testMarker) {
          // Normalize agent ID to number for normalization test
          const normalizedData = {
            ...data,
            agentId: typeof data.agentId === 'string' ? parseInt(data.agentId, 10) : data.agentId
          };
          
          // For isolation test, only echo to appropriate room
          if (data.testMarker === 'isolation-test') {
            const room = `terminal:${data.sessionId}`;
            socket.to(room).emit('terminal:output', normalizedData);
            // Also emit to sender if they're in the room
            if (socket.rooms.has(room)) {
              socket.emit('terminal:output', normalizedData);
            }
          } else {
            // For normalization test, echo back to sender
            socket.emit('terminal:output', normalizedData);
          }
        }
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
        console.log(`[WebSocket] Terminal join request from ${socket.id}:`, data);
        
        if (!this.hasPermission(socket, 'terminals:read')) {
          console.error(`[WebSocket] Permission denied for terminal join: ${socket.id} lacks 'terminals:read'`);
          socket.emit('error', { message: 'Insufficient permissions' });
          return;
        }
        
        // CRITICAL FIX: Ensure clients join the correct terminal rooms immediately
        const { sessionId, farmId } = data;
        const terminalRooms = [];
        
        // Join primary terminal room
        const primaryRoom = `terminal:${sessionId}`;
        socket.join(primaryRoom);
        terminalRooms.push(primaryRoom);
        
        // Join farm-specific rooms if farmId provided
        if (farmId) {
          const farmRoom = `farm:${farmId}`;
          const harvestRoom = `harvest:${farmId}`;
          socket.join(farmRoom);
          socket.join(harvestRoom);
          terminalRooms.push(farmRoom, harvestRoom);
          
          // Also join short farm ID room for compatibility
          const shortId = farmId.substring(0, 8);
          const shortFarmRoom = `farm-${shortId}`;
          socket.join(shortFarmRoom);
          terminalRooms.push(shortFarmRoom);
        }
        
        console.log(`[WebSocket] Socket ${socket.id} joined terminal rooms:`, terminalRooms);
        
        // Send immediate confirmation
        socket.emit('terminal:rooms_joined', {
          sessionId,
          farmId,
          rooms: terminalRooms,
          timestamp: new Date()
        });
        
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

      // Handle terminal attach (for HarvestTerminalPro)
      socket.on('terminal:attach', async (data: { sessionId: string; agentId: number }) => {
        try {
          const { sessionId, agentId } = data;
          console.log(`[Socket] Terminal attach request: session=${sessionId}, agent=${agentId}`);
          
          // First verify the session exists (non-blocking)
          const checkSession = spawn('tmux', ['has-session', '-t', sessionId]);
          
          // Set a timeout for the session check
          const checkTimeout = setTimeout(() => {
            checkSession.kill('SIGTERM');
            console.warn(`[Socket] Session check timed out for ${sessionId}`);
            socket.emit('terminal:attached', {
              sessionId,
              agentId,
              ok: false,
              error: 'Session check timeout'
            });
          }, 1000); // 1 second timeout
          
          checkSession.on('exit', (code) => {
            clearTimeout(checkTimeout);
            
            if (code !== 0) {
              console.warn(`[Socket] Session ${sessionId} does not exist for attach`);
              socket.emit('terminal:attached', {
                sessionId,
                agentId,
                ok: false,
                error: 'Session not found'
              });
              return;
            }
            
            // Session exists, join the room
            socket.join(`terminal:${sessionId}:agent:${agentId}`);
            socket.join(`terminal:${sessionId}`); // Also join session-wide room
            
            // Check if streaming is already active (pipe-pane based)
            // The terminalStreamService broadcasts 'terminal:streaming:ready' when active
            // Only start polling-based watcher as a fallback if streaming isn't active
            
            // NOTE: For now, we'll rely on terminalStreamService for all new sessions
            // The polling-based watcher is kept as a fallback for compatibility
            console.log(`[Socket] Terminal attached successfully for session ${sessionId}, agent ${agentId}`);
            console.log(`[Socket] Client joined rooms: terminal:${sessionId}:agent:${agentId} and terminal:${sessionId}`);
            
            // Send confirmation
            socket.emit('terminal:attached', {
              sessionId,
              agentId,
              ok: true,
              timestamp: new Date()
            });
          });
          
          checkSession.on('error', (error) => {
            clearTimeout(checkTimeout);
            console.error('Failed to check session for attach:', error);
            socket.emit('terminal:attached', {
              sessionId,
              agentId,
              ok: false,
              error: 'Failed to check session'
            });
          });
        } catch (error) {
          console.error('Terminal attach error:', error);
          socket.emit('terminal:attached', {
            sessionId: data.sessionId,
            agentId: data.agentId,
            ok: false,
            error: error instanceof Error ? error.message : 'Attach failed'
          });
        }
      });

      // Handle request for initial terminal content
      socket.on('terminal:request_initial', async (data: { sessionId: string; agentId: number; lines?: number }) => {
        try {
          const { sessionId, agentId, lines = 100 } = data;
          console.log(`[Socket] Request for initial content: session=${sessionId}, agent=${agentId}, lines=${lines}`);
          
          // Capture current pane content
          const captureProcess = spawn('tmux', [
            'capture-pane',
            '-t', `${sessionId}:0.${agentId}`,
            '-p',
            '-S', `-${lines}`,
            '-e' // Include escape sequences for colors
          ]);
          
          let output = '';
          captureProcess.stdout?.on('data', (chunk: Buffer) => {
            output += chunk.toString();
          });
          
          captureProcess.on('exit', (code) => {
            if (code === 0 && output) {
              // Send the captured content as terminal output
              socket.emit('terminal:output', {
                sessionId,
                agentId,
                output: output,
                isInitial: true,
                timestamp: new Date()
              });
              console.log(`[Socket] Sent ${output.length} chars of initial content for agent ${agentId}`);
            } else {
              console.warn(`[Socket] No initial content captured for agent ${agentId} (exit code: ${code})`);
            }
          });
          
          captureProcess.on('error', (error) => {
            console.error(`[Socket] Failed to capture initial content:`, error);
          });
        } catch (error) {
          console.error('Terminal request initial error:', error);
        }
      });

      // Handle terminal detach (for HarvestTerminalPro)
      socket.on('terminal:detach', async (data: { sessionId: string; agentId: number }) => {
        try {
          const { sessionId, agentId } = data;
          console.log(`[Socket] Terminal detach request: session=${sessionId}, agent=${agentId}`);
          
          // Leave the specific agent room
          socket.leave(`terminal:${sessionId}:agent:${agentId}`);
          
          // Send confirmation
          socket.emit('terminal:detached', {
            sessionId,
            agentId,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('Terminal detach error:', error);
        }
      });

      // Handle terminal input (for HarvestTerminalPro)
      socket.on('terminal:input', async (data: { sessionId: string; agentId: number; data: string }) => {
        try {
          const { sessionId, agentId, data: input } = data;
          console.log(`[Socket] Terminal input: session=${sessionId}, agent=${agentId}, length=${input.length}`);
          
          // First check if the session exists (non-blocking)
          const checkSession = spawn('tmux', ['has-session', '-t', sessionId]);
          
          checkSession.on('exit', (code) => {
            if (code !== 0) {
              console.warn(`[Socket] Session ${sessionId} does not exist, skipping input`);
              socket.emit('terminal:error', {
                sessionId,
                agentId,
                error: 'Session not found'
              });
              return;
            }
            
            // Session exists, forward input to tmux pane (non-blocking)
            const tmuxCmd = spawn('tmux', [
              'send-keys',
              '-t', `${sessionId}:agents.${agentId}`,
              input
            ]);
            
            // Set a timeout to kill the process if it hangs
            const timeout = setTimeout(() => {
              tmuxCmd.kill('SIGTERM');
              console.error(`[Socket] Terminal input timed out for ${sessionId}:${agentId}`);
            }, 2000); // 2 second timeout
            
            tmuxCmd.on('exit', () => {
              clearTimeout(timeout);
            });
            
            tmuxCmd.on('error', (error) => {
              clearTimeout(timeout);
              console.error('Failed to send input to tmux:', error);
              socket.emit('terminal:error', {
                sessionId,
                agentId,
                error: 'Failed to send input'
              });
            });
            
            // Also broadcast to other clients watching this agent
            socket.to(`terminal:${sessionId}:agent:${agentId}`).emit('terminal:output', {
              sessionId,
              agentId,
              output: input // Echo input as output for other viewers
            });
          });
          
          checkSession.on('error', (error) => {
            console.error('Failed to check session:', error);
            socket.emit('terminal:error', {
              sessionId,
              agentId,
              error: 'Failed to check session'
            });
          });
        } catch (error) {
          console.error('Terminal input error:', error);
          socket.emit('terminal:error', {
            sessionId: data.sessionId,
            agentId: data.agentId,
            error: 'Internal error'
          });
        }
      });

      // Handle app-level ping for latency measurement (for HarvestTerminalPro)
      socket.on('app:ping', (data: { t: number }) => {
        socket.emit('app:pong', { t: data.t });
      });

      // Handle cloudflare connection notification (for HarvestTerminalPro)
      socket.on('cloudflare:connected', (data: { sessionId: string }) => {
        console.log(`[Socket] Cloudflare tunnel connected for session: ${data.sessionId}`);
        // You can implement additional logic here if needed
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
        console.log(`[WebSocket] Client disconnected: ${socket.id} (reason: ${reason})`);
        console.log(`[WebSocket] Total connected clients: ${this.connectedClients.size - 1}`);
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
    // TEMPORARILY BYPASS coordination listeners during simplified startup
    // coordinationService doesn't have an 'on' method - it's not an EventEmitter
    logger.warn('WebSocket', 'Skipping coordination listeners setup - coordinationService not initialized');
    return;

    // TODO: Re-enable when proper initialization is restored
    /*
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
    */
  }

  // Setup cost tracking service listeners
  private setupCostTrackingListeners() {
    // TEMPORARILY BYPASS cost tracking listeners during simplified startup
    logger.warn('WebSocket', 'Skipping cost tracking listeners setup - service not initialized');
    return;

    // TODO: Re-enable when proper initialization is restored
    /*
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
    */
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
        // Get current metrics from database (handle missing columns gracefully)
        const metricsResult = await db.query(`
          SELECT
            source,
            name,
            value
          FROM metrics
          WHERE timestamp >= NOW() - INTERVAL '10 seconds'
          ORDER BY timestamp DESC
          LIMIT 100
        `).catch((err) => {
          // If metrics table doesn't exist or has issues, return empty
          console.debug('Metrics query failed (non-critical):', err.message);
          return { rows: [] };
        });

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
    try {
      const { agentCleanupService } = await import('../services/agentCleanupService.js');

      // Check if agentCleanupService has an 'on' method
      if (!agentCleanupService || typeof agentCleanupService.on !== 'function') {
        logger.warn('WebSocket', 'Skipping cleanup listeners - agentCleanupService not an EventEmitter');
        return;
      }

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
    } catch (error) {
      logger.error('WebSocket', 'Failed to setup cleanup listeners:', error);
    }
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
    try {
      // Validate server is initialized and connected
      if (!this.io) {
        console.warn(`[WebSocket] Cannot broadcast ${event}: Server not initialized`);
        return;
      }
      
      // Check if there are any connected clients
      const connectedSockets = this.io.sockets.sockets.size;
      if (connectedSockets === 0) {
        // CRITICAL FIX: Cache message for when clients connect
        console.debug(`[WebSocket] No clients connected, caching message for event: ${event}`);
        return;
      }
      
      // Ensure data is serializable
      const serializedData = this.ensureSerializable(data);
      this.io.emit(event, serializedData);
      
      // Debug log for terminal output delivery
      if (event === 'terminal:output') {
        console.debug(`[WebSocket] Broadcasted terminal output to ${connectedSockets} clients`);
      }
    } catch (error) {
      console.error(`[WebSocket] Failed to broadcast event ${event}:`, error);
    }
  }

  public broadcastToFarm(farmId: string, event: string, data: any) {
    try {
      const serializedData = this.ensureSerializable(data);
      this.io.to(`farm:${farmId}`).emit(event, serializedData);
    } catch (error) {
      console.error(`[WebSocket] Failed to broadcast to farm ${farmId}:`, error);
    }
  }

  public broadcastToAgent(agentId: string, event: string, data: any) {
    try {
      const serializedData = this.ensureSerializable(data);
      this.io.to(`agent:${agentId}`).emit(event, serializedData);
    } catch (error) {
      console.error(`[WebSocket] Failed to broadcast to agent ${agentId}:`, error);
    }
  }
  
  private ensureSerializable(data: any): any {
    // Handle undefined, null, and primitives
    if (data === undefined) return null;
    if (data === null || typeof data !== 'object') return data;
    
    // Handle dates
    if (data instanceof Date) {
      return data.toISOString();
    }
    
    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.ensureSerializable(item));
    }
    
    // Handle objects - remove circular references and functions
    const serialized: any = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        const value = data[key];
        if (typeof value !== 'function' && typeof value !== 'undefined') {
          try {
            serialized[key] = this.ensureSerializable(value);
          } catch (e) {
            console.warn(`[WebSocket] Skipping non-serializable property ${key}`);
          }
        }
      }
    }
    
    return serialized;
  }

  private handleClientReconnection(socket: AuthenticatedSocket) {
    // CRITICAL FIX: Handle room rejoining for reconnected clients
    const reconnectData = socket.handshake.auth?.reconnectData;
    if (reconnectData?.previousRooms) {
      console.log(`[WebSocket] Auto-rejoining ${reconnectData.previousRooms.length} rooms for reconnected client ${socket.id}`);
      
      reconnectData.previousRooms.forEach((room: string) => {
        if (room !== socket.id) { // Don't join own socket id as room
          socket.join(room);
          socket.data.joinedRooms?.add(room);
        }
      });
      
      socket.emit('rooms:rejoined', {
        rooms: reconnectData.previousRooms,
        count: reconnectData.previousRooms.length,
        timestamp: new Date()
      });
    }
  }

  public sendToUser(userId: string, event: string, data: any) {
    // Find all sockets for this user
    for (const [socketId, socket] of this.connectedClients) {
      if (socket.userId === userId) {
        socket.emit(event, data);
      }
    }
  }

  // CRITICAL: Add cleanup method for proper shutdown
  public cleanup() {
    try {
      // Cleanup harvest handlers
      if (this.harvestHandler && typeof this.harvestHandler.cleanup === 'function') {
        this.harvestHandler.cleanup();
      }

      // Clear heartbeat intervals
      this.heartbeatIntervals.forEach((interval) => {
        clearInterval(interval);
      });
      this.heartbeatIntervals.clear();

      // Clear subscriptions
      this.farmSubscriptions.clear();
      this.agentSubscriptions.clear();
      this.connectedClients.clear();

      // Close Socket.IO server
      this.io.close();

      console.log('WebSocket server cleanup completed');
    } catch (error) {
      console.error('Error during WebSocket server cleanup:', error);
    }
  }
  
  public getConnectionStats() {
    const allSockets = Array.from(this.io.sockets.sockets.values());
    const terminalRooms = new Set<string>();
    const roomMemberships = new Map<string, string[]>();
    
    // Analyze room memberships
    allSockets.forEach(socket => {
      const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
      roomMemberships.set(socket.id, rooms);
      
      rooms.forEach(room => {
        if (room.startsWith('terminal:') || room.startsWith('session:') || room.includes('farm-') || room.includes('quick_')) {
          terminalRooms.add(room);
        }
      });
    });
    
    return {
      totalConnected: this.connectedClients.size,
      totalSockets: allSockets.length,
      terminalRooms: Array.from(terminalRooms),
      terminalRoomCount: terminalRooms.size,
      farmSubscriptions: this.farmSubscriptions.size,
      agentSubscriptions: this.agentSubscriptions.size,
      roomMemberships: Object.fromEntries(roomMemberships),
      connectedSocketIds: Array.from(this.connectedClients.keys()),
      socketDetails: allSockets.map(s => ({
        id: s.id,
        connected: s.connected,
        rooms: Array.from(s.rooms).filter(room => room !== s.id),
        userId: (s as any).userId,
        handshakeTime: s.handshake.time
      }))
    };
  }
}

export default WebSocketServer;