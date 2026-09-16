import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { WebSocketEvent } from '../types/api';
import { db, redis } from '../database/connection';
import { validateWebSocketOrigin } from '../middleware/cors';
import { logger } from '../utils/logger';
import { z } from 'zod';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  roles?: string[];
  permissions?: string[];
  lastPong?: number;
  missedPings?: number;
}

interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  connectionsPerIp: Map<string, number>;
  totalMessages: number;
  messagesPerSecond: number;
  lastReset: Date;
}

// Message schemas for validation
const messageSchemas = {
  'farm:create': z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    config: z.object({}).optional()
  }),
  'farm:update': z.object({
    farmId: z.string().uuid(),
    updates: z.object({})
  }),
  'agent:command': z.object({
    agentId: z.string(),
    command: z.string().max(1000)
  }),
  'terminal:input': z.object({
    sessionId: z.string(),
    input: z.string().max(10000)
  })
};

/**
 * Enhanced WebSocket Server with proper memory management and connection limiting
 * Fixes memory leaks, adds rate limiting, and implements proper cleanup
 */
export class EnhancedWebSocketServer {
  public io: SocketIOServer;
  private connectedClients: Map<string, AuthenticatedSocket> = new Map();
  private farmSubscriptions: Map<string, Set<string>> = new Map();
  private agentSubscriptions: Map<string, Set<string>> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private messageQueues: Map<string, any[]> = new Map();
  private connectionStats: ConnectionStats;
  
  // Configuration
  private readonly MAX_CONNECTIONS = 1000;
  private readonly MAX_CONNECTIONS_PER_IP = 10;
  private readonly MAX_MESSAGE_QUEUE_SIZE = 100;
  private readonly MAX_MESSAGE_SIZE = 1024 * 100; // 100KB
  private readonly HEARTBEAT_INTERVAL = 30000; // 30s
  private readonly HEARTBEAT_TIMEOUT = 90000; // 90s
  private readonly MESSAGE_RATE_LIMIT = 100; // per minute
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute

  constructor(httpServer: HTTPServer) {
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      connectionsPerIp: new Map(),
      totalMessages: 0,
      messagesPerSecond: 0,
      lastReset: new Date()
    };

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || validateWebSocketOrigin(origin)) {
            callback(null, true);
          } else {
            logger.warn(`WebSocket connection rejected from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
          }
        },
        methods: ["GET", "POST"],
        credentials: true
      },
      // Optimized settings
      pingTimeout: this.HEARTBEAT_TIMEOUT,
      pingInterval: this.HEARTBEAT_INTERVAL,
      connectTimeout: 60000,
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      perMessageDeflate: {
        threshold: 1024, // Only compress messages > 1KB
        compress: false // Disable compression on server->client for performance
      },
      httpCompression: true,
      maxHttpBufferSize: this.MAX_MESSAGE_SIZE,
      // Connection state recovery
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        skipMiddlewares: false
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startCleanupInterval();
    this.startMetricsCollection();
  }

  private setupMiddleware() {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        // Check connection limits
        const clientIp = this.getClientIp(socket);
        
        if (this.connectedClients.size >= this.MAX_CONNECTIONS) {
          logger.warn(`Connection rejected: Max connections (${this.MAX_CONNECTIONS}) reached`);
          return next(new Error('Server at capacity'));
        }

        const ipConnections = this.connectionStats.connectionsPerIp.get(clientIp) || 0;
        if (ipConnections >= this.MAX_CONNECTIONS_PER_IP) {
          logger.warn(`Connection rejected: Max connections per IP (${this.MAX_CONNECTIONS_PER_IP}) reached for ${clientIp}`);
          return next(new Error('Too many connections from this IP'));
        }

        // REMOVED: Auth bypass mode - all WebSocket connections must authenticate properly
        // Require JWT validation
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Validate JWT token
        try {
          const jwt = require('jsonwebtoken');
          const JWT_SECRET = process.env.JWT_SECRET || 'maifarm-secret-key-change-in-production';
          const decoded = jwt.verify(token, JWT_SECRET) as any;

          // Set user info from decoded token
          socket.userId = decoded.userId || decoded.sub;
          socket.roles = decoded.roles || ['user'];
          socket.permissions = decoded.permissions || [];
        } catch (jwtError) {
          logger.error('JWT validation failed for WebSocket:', jwtError);
          return next(new Error('Invalid authentication token'));
        }

        next();
      } catch (error) {
        logger.error('WebSocket middleware error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      const clientId = socket.id;
      const clientIp = this.getClientIp(socket);
      
      // Track connection
      this.connectedClients.set(clientId, socket);
      this.connectionStats.totalConnections++;
      this.connectionStats.activeConnections++;
      this.connectionStats.connectionsPerIp.set(
        clientIp, 
        (this.connectionStats.connectionsPerIp.get(clientIp) || 0) + 1
      );

      logger.info(`Client connected: ${clientId} from ${clientIp}`);

      // Setup heartbeat
      this.setupHeartbeat(socket);

      // Setup rate limiting
      this.setupRateLimiting(socket);

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.handleDisconnect(socket, reason);
      });

      // Handle pong responses
      socket.on('pong', () => {
        socket.lastPong = Date.now();
        socket.missedPings = 0;
      });

      // Setup message handlers with validation
      this.setupMessageHandlers(socket);

      // Send initial state
      socket.emit('connected', {
        clientId,
        timestamp: new Date(),
        serverTime: Date.now()
      });
    });
  }

  private setupHeartbeat(socket: AuthenticatedSocket) {
    // Initialize heartbeat data
    socket.lastPong = Date.now();
    socket.missedPings = 0;

    // Send initial ping
    socket.emit('ping', { timestamp: Date.now() });

    // Setup interval
    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastPong = now - (socket.lastPong || now);

      if (timeSinceLastPong > this.HEARTBEAT_TIMEOUT) {
        socket.missedPings = (socket.missedPings || 0) + 1;
        
        if (socket.missedPings >= 3) {
          logger.warn(`Disconnecting unresponsive client ${socket.id}`);
          clearInterval(interval);
          this.heartbeatIntervals.delete(socket.id);
          socket.disconnect(true);
          return;
        }
      }

      socket.emit('ping', { timestamp: now });
    }, this.HEARTBEAT_INTERVAL);

    this.heartbeatIntervals.set(socket.id, interval);
  }

  private setupRateLimiting(socket: AuthenticatedSocket) {
    const messageTimestamps: number[] = [];
    const originalEmit = socket.emit.bind(socket);

    // Override emit to track message rate
    socket.emit = function(...args: any[]) {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      
      // Clean old timestamps
      while (messageTimestamps.length > 0 && messageTimestamps[0] < oneMinuteAgo) {
        messageTimestamps.shift();
      }

      // Check rate limit
      if (messageTimestamps.length >= this.MESSAGE_RATE_LIMIT) {
        logger.warn(`Rate limit exceeded for client ${socket.id}`);
        socket.emit('error', { code: 'RATE_LIMIT', message: 'Too many messages' });
        return false;
      }

      messageTimestamps.push(now);
      return originalEmit(...args);
    }.bind(this);
  }

  private setupMessageHandlers(socket: AuthenticatedSocket) {
    // Generic message handler with validation
    const handleMessage = (event: string, handler: (data: any) => void) => {
      socket.on(event, async (data: any) => {
        try {
          // Validate message if schema exists
          const schema = messageSchemas[event as keyof typeof messageSchemas];
          if (schema) {
            const result = schema.safeParse(data);
            if (!result.success) {
              socket.emit('error', {
                code: 'VALIDATION_ERROR',
                message: 'Invalid message format',
                errors: result.error.errors
              });
              return;
            }
            data = result.data;
          }

          // Check message size
          const messageSize = JSON.stringify(data).length;
          if (messageSize > this.MAX_MESSAGE_SIZE) {
            socket.emit('error', {
              code: 'MESSAGE_TOO_LARGE',
              message: `Message size ${messageSize} exceeds limit ${this.MAX_MESSAGE_SIZE}`
            });
            return;
          }

          // Track message
          this.connectionStats.totalMessages++;

          // Handle message
          await handler(data);
        } catch (error) {
          logger.error(`Error handling ${event}:`, error);
          socket.emit('error', {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process message'
          });
        }
      });
    };

    // Farm subscriptions
    handleMessage('farm:subscribe', (data) => {
      const { farmId } = data;
      if (!this.farmSubscriptions.has(farmId)) {
        this.farmSubscriptions.set(farmId, new Set());
      }
      this.farmSubscriptions.get(farmId)!.add(socket.id);
      socket.join(`farm:${farmId}`);
      logger.debug(`Client ${socket.id} subscribed to farm ${farmId}`);
    });

    handleMessage('farm:unsubscribe', (data) => {
      const { farmId } = data;
      if (this.farmSubscriptions.has(farmId)) {
        this.farmSubscriptions.get(farmId)!.delete(socket.id);
        if (this.farmSubscriptions.get(farmId)!.size === 0) {
          this.farmSubscriptions.delete(farmId);
        }
      }
      socket.leave(`farm:${farmId}`);
      logger.debug(`Client ${socket.id} unsubscribed from farm ${farmId}`);
    });

    // Agent subscriptions
    handleMessage('agent:subscribe', (data) => {
      const { agentId } = data;
      if (!this.agentSubscriptions.has(agentId)) {
        this.agentSubscriptions.set(agentId, new Set());
      }
      this.agentSubscriptions.get(agentId)!.add(socket.id);
      socket.join(`agent:${agentId}`);
      logger.debug(`Client ${socket.id} subscribed to agent ${agentId}`);
    });

    handleMessage('agent:unsubscribe', (data) => {
      const { agentId } = data;
      if (this.agentSubscriptions.has(agentId)) {
        this.agentSubscriptions.get(agentId)!.delete(socket.id);
        if (this.agentSubscriptions.get(agentId)!.size === 0) {
          this.agentSubscriptions.delete(agentId);
        }
      }
      socket.leave(`agent:${agentId}`);
      logger.debug(`Client ${socket.id} unsubscribed from agent ${agentId}`);
    });
  }

  private handleDisconnect(socket: AuthenticatedSocket, reason: string) {
    const clientId = socket.id;
    const clientIp = this.getClientIp(socket);

    logger.info(`Client disconnected: ${clientId} (${reason})`);

    // Clean up heartbeat
    const heartbeatInterval = this.heartbeatIntervals.get(clientId);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      this.heartbeatIntervals.delete(clientId);
    }

    // Clean up subscriptions
    this.farmSubscriptions.forEach((clients, farmId) => {
      clients.delete(clientId);
      if (clients.size === 0) {
        this.farmSubscriptions.delete(farmId);
      }
    });

    this.agentSubscriptions.forEach((clients, agentId) => {
      clients.delete(clientId);
      if (clients.size === 0) {
        this.agentSubscriptions.delete(agentId);
      }
    });

    // Clean up message queue
    this.messageQueues.delete(clientId);

    // Update stats
    this.connectionStats.activeConnections--;
    const ipConnections = this.connectionStats.connectionsPerIp.get(clientIp) || 0;
    if (ipConnections > 1) {
      this.connectionStats.connectionsPerIp.set(clientIp, ipConnections - 1);
    } else {
      this.connectionStats.connectionsPerIp.delete(clientIp);
    }

    // Remove from connected clients
    this.connectedClients.delete(clientId);
  }

  private startCleanupInterval() {
    setInterval(() => {
      // Clean up orphaned subscriptions
      const activeClientIds = new Set(this.connectedClients.keys());
      
      this.farmSubscriptions.forEach((clients, farmId) => {
        const validClients = new Set([...clients].filter(id => activeClientIds.has(id)));
        if (validClients.size !== clients.size) {
          this.farmSubscriptions.set(farmId, validClients);
        }
        if (validClients.size === 0) {
          this.farmSubscriptions.delete(farmId);
        }
      });

      this.agentSubscriptions.forEach((clients, agentId) => {
        const validClients = new Set([...clients].filter(id => activeClientIds.has(id)));
        if (validClients.size !== clients.size) {
          this.agentSubscriptions.set(agentId, validClients);
        }
        if (validClients.size === 0) {
          this.agentSubscriptions.delete(agentId);
        }
      });

      // Clean up message queues
      this.messageQueues.forEach((queue, clientId) => {
        if (!activeClientIds.has(clientId)) {
          this.messageQueues.delete(clientId);
        } else if (queue.length > this.MAX_MESSAGE_QUEUE_SIZE) {
          // Trim queue to max size
          this.messageQueues.set(clientId, queue.slice(-this.MAX_MESSAGE_QUEUE_SIZE));
        }
      });

      logger.debug(`Cleanup: ${this.connectedClients.size} clients, ${this.farmSubscriptions.size} farm subs, ${this.agentSubscriptions.size} agent subs`);
    }, this.CLEANUP_INTERVAL);
  }

  private startMetricsCollection() {
    setInterval(() => {
      const now = Date.now();
      const timeSinceReset = (now - this.connectionStats.lastReset.getTime()) / 1000;
      this.connectionStats.messagesPerSecond = this.connectionStats.totalMessages / timeSinceReset;
      
      // Log metrics
      logger.info('WebSocket metrics:', {
        activeConnections: this.connectionStats.activeConnections,
        totalConnections: this.connectionStats.totalConnections,
        messagesPerSecond: this.connectionStats.messagesPerSecond.toFixed(2),
        farmSubscriptions: this.farmSubscriptions.size,
        agentSubscriptions: this.agentSubscriptions.size
      });

      // Reset counters
      this.connectionStats.totalMessages = 0;
      this.connectionStats.lastReset = new Date();
    }, 60000); // Every minute
  }

  private getClientIp(socket: Socket): string {
    return socket.handshake.headers['x-forwarded-for'] as string || 
           socket.handshake.address || 
           'unknown';
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: string, data: any): void {
    // Add to message queues for disconnected clients
    this.messageQueues.forEach((queue) => {
      if (queue.length < this.MAX_MESSAGE_QUEUE_SIZE) {
        queue.push({ event, data, timestamp: Date.now() });
      }
    });

    // Broadcast to connected clients
    this.io.emit(event, data);
  }

  /**
   * Send event to specific farm subscribers
   */
  broadcastToFarm(farmId: string, event: string, data: any): void {
    this.io.to(`farm:${farmId}`).emit(event, data);
  }

  /**
   * Send event to specific agent subscribers
   */
  broadcastToAgent(agentId: string, event: string, data: any): void {
    this.io.to(`agent:${agentId}`).emit(event, data);
  }

  /**
   * Get server statistics
   */
  getStats(): ConnectionStats & { subscriptions: { farms: number; agents: number } } {
    return {
      ...this.connectionStats,
      subscriptions: {
        farms: this.farmSubscriptions.size,
        agents: this.agentSubscriptions.size
      }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down WebSocket server...');
    
    // Clear all intervals
    this.heartbeatIntervals.forEach(interval => clearInterval(interval));
    this.heartbeatIntervals.clear();

    // Disconnect all clients
    this.io.disconnectSockets(true);
    
    // Clear all data structures
    this.connectedClients.clear();
    this.farmSubscriptions.clear();
    this.agentSubscriptions.clear();
    this.messageQueues.clear();

    // Close the server
    await new Promise<void>((resolve) => {
      this.io.close(() => {
        logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}

// Export singleton instance factory
let instance: EnhancedWebSocketServer | null = null;

export function createEnhancedWebSocketServer(httpServer: HTTPServer): EnhancedWebSocketServer {
  if (!instance) {
    instance = new EnhancedWebSocketServer(httpServer);
  }
  return instance;
}

export function getWebSocketServer(): EnhancedWebSocketServer | null {
  return instance;
}