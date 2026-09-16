/**
 * Unified WebSocket Connection Hub
 * Singleton pattern for all WebSocket communication
 * Replaces: websocketManager, RealtimeConnectionManager, UnifiedConnectionHub, etc.
 */

import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { redis, redisPub, redisSub } from '../../database/connection';
import { logger } from '../../utils/logger';
import { stateCoordinator, EntityType, StateEvent } from './stateCoordinator';
import {
  MaiFarmError,
  ErrorCode,
  ErrorSeverity
} from '../../types/errors';

export interface WebSocketClient {
  id: string;
  socket: Socket;
  userId?: string;
  farmId?: string;
  rooms: Set<string>;
  connectedAt: Date;
  lastHeartbeat: Date;
  metadata: Record<string, any>;
}

export interface WebSocketMessage {
  id: string;
  event: string;
  data: any;
  timestamp: Date;
  source?: string;
  target?: string; // Specific client or room
}

export interface ConnectionOptions {
  httpServer: HttpServer;
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
  pingInterval?: number;
  pingTimeout?: number;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

interface QueuedMessage {
  message: WebSocketMessage;
  retries: number;
  maxRetries: number;
}

interface RoomMetrics {
  clientCount: number;
  messageRate: number;
  lastActivity: Date;
}

export class UnifiedWebSocketHub extends EventEmitter {
  private static instance: UnifiedWebSocketHub;
  private io: SocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private messageQueue: Map<string, QueuedMessage[]> = new Map();
  private messageHistory: WebSocketMessage[] = [];
  private roomMetrics: Map<string, RoomMetrics> = new Map();

  private readonly MAX_HISTORY = 1000;
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly HEARTBEAT_TIMEOUT = 60000; // 60 seconds
  private readonly RECONNECT_DELAY = 1000; // 1 second base delay
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  private heartbeatInterval: NodeJS.Timer | null = null;
  private metricsInterval: NodeJS.Timer | null = null;
  private isInitialized = false;

  private constructor() {
    super();
    this.setMaxListeners(200); // Support many event listeners
  }

  public static getInstance(): UnifiedWebSocketHub {
    if (!UnifiedWebSocketHub.instance) {
      UnifiedWebSocketHub.instance = new UnifiedWebSocketHub();
    }
    return UnifiedWebSocketHub.instance;
  }

  /**
   * Initialize WebSocket server
   */
  public async initialize(options: ConnectionOptions): Promise<void> {
    if (this.isInitialized) {
      logger.warn('WebSocketHub already initialized');
      return;
    }

    try {
      // Don't create our own Socket.io server - this causes duplicate handleUpgrade
      // The WebSocketServer in index.ts already handles all WebSocket connections

      // Setup state coordinator integration
      this.setupStateIntegration();

      // Start monitoring
      this.startHeartbeatMonitoring();
      this.startMetricsCollection();

      // Setup Redis pub/sub for multi-instance support
      await this.setupRedisPubSub();

      this.isInitialized = true;
      logger.info('UnifiedWebSocketHub initialized successfully');

    } catch (error) {
      throw new MaiFarmError(
        ErrorCode.WS_CONNECTION_FAILED,
        `Failed to initialize WebSocket hub: ${error.message}`,
        ErrorSeverity.CRITICAL
      );
    }
  }

  /**
   * Set the Socket.io server instance from WebSocketServer
   */
  public setSocketServer(io: SocketServer): void {
    this.io = io;
    if (this.io) {
      this.setupConnectionHandlers();
    }
  }

  /**
   * Setup connection handlers
   */
  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.handleNewConnection(socket);
    });

    this.io.on('error', (error: Error) => {
      logger.error('WebSocket server error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Handle new client connection
   */
  private handleNewConnection(socket: Socket): void {
    const clientId = uuidv4();
    const client: WebSocketClient = {
      id: clientId,
      socket,
      rooms: new Set(['global']),
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      metadata: {
        userAgent: socket.handshake.headers['user-agent'],
        ip: socket.handshake.address
      }
    };

    // Store client
    this.clients.set(clientId, client);

    // Join global room
    socket.join('global');
    this.addClientToRoom(clientId, 'global');

    // Setup client event handlers
    this.setupClientHandlers(client);

    // Send welcome message
    socket.emit('connected', {
      clientId,
      timestamp: new Date(),
      version: '2.0.0'
    });

    // Notify state coordinator
    stateCoordinator.upsertEntity(
      clientId,
      EntityType.SESSION,
      'connected',
      { socketId: socket.id },
      'websocket'
    );

    // Log connection
    logger.info(`WebSocket client connected: ${clientId}`, {
      rooms: Array.from(client.rooms),
      ip: client.metadata.ip
    });

    // Emit connection event
    this.emit('client:connected', client);
  }

  /**
   * Setup handlers for a specific client
   */
  private setupClientHandlers(client: WebSocketClient): void {
    const { socket } = client;

    // Authentication
    socket.on('authenticate', async (data: any) => {
      try {
        const { userId, token } = data;
        // Validate token (implement your auth logic)
        client.userId = userId;
        client.metadata.authenticated = true;

        // Join user-specific room
        const userRoom = `user:${userId}`;
        socket.join(userRoom);
        this.addClientToRoom(client.id, userRoom);

        socket.emit('authenticated', { userId, success: true });
        logger.info(`Client ${client.id} authenticated as user ${userId}`);

      } catch (error) {
        socket.emit('authentication:failed', { error: error.message });
      }
    });

    // Join farm room
    socket.on('farm:join', (farmId: string) => {
      const farmRoom = `farm:${farmId}`;
      socket.join(farmRoom);
      this.addClientToRoom(client.id, farmRoom);
      client.farmId = farmId;

      socket.emit('farm:joined', { farmId, room: farmRoom });
      logger.info(`Client ${client.id} joined farm ${farmId}`);
    });

    // Leave farm room
    socket.on('farm:leave', (farmId: string) => {
      const farmRoom = `farm:${farmId}`;
      socket.leave(farmRoom);
      this.removeClientFromRoom(client.id, farmRoom);

      if (client.farmId === farmId) {
        client.farmId = undefined;
      }

      socket.emit('farm:left', { farmId });
    });

    // Terminal events
    socket.on('terminal:subscribe', (sessionName: string) => {
      const terminalRoom = `terminal:${sessionName}`;
      socket.join(terminalRoom);
      this.addClientToRoom(client.id, terminalRoom);

      socket.emit('terminal:subscribed', { sessionName });
    });

    // Generic message handling
    socket.on('message', (data: any) => {
      this.handleClientMessage(client, data);
    });

    // Heartbeat
    socket.on('heartbeat', () => {
      client.lastHeartbeat = new Date();
      socket.emit('heartbeat:ack', { timestamp: new Date() });
    });

    // Disconnection
    socket.on('disconnect', (reason: string) => {
      this.handleClientDisconnection(client, reason);
    });

    // Error handling
    socket.on('error', (error: Error) => {
      logger.error(`WebSocket client ${client.id} error:`, error);
      this.emit('client:error', { client, error });
    });

    // Custom event forwarding
    socket.onAny((event: string, ...args: any[]) => {
      // Forward all events to internal handlers
      this.emit(`client:${event}`, client, ...args);
    });
  }

  /**
   * Handle client message
   */
  private handleClientMessage(client: WebSocketClient, data: any): void {
    const message: WebSocketMessage = {
      id: uuidv4(),
      event: data.event || 'message',
      data: data.payload || data,
      timestamp: new Date(),
      source: client.id
    };

    // Add to history
    this.addToHistory(message);

    // Process based on event type
    if (data.target) {
      // Targeted message
      this.sendToTarget(data.target, message);
    } else if (data.room) {
      // Room broadcast
      this.broadcastToRoom(data.room, message);
    } else {
      // Global broadcast
      this.broadcast(message.event, message.data);
    }
  }

  /**
   * Handle client disconnection
   */
  private handleClientDisconnection(client: WebSocketClient, reason: string): void {
    // Remove from all rooms
    for (const room of client.rooms) {
      this.removeClientFromRoom(client.id, room);
    }

    // Remove client
    this.clients.delete(client.id);

    // Update state coordinator
    stateCoordinator.updateEntityStatus(client.id, 'disconnected', 'websocket');

    // Log disconnection
    logger.info(`WebSocket client disconnected: ${client.id}`, { reason });

    // Emit disconnection event
    this.emit('client:disconnected', { client, reason });

    // Queue messages for reconnection
    if (client.userId) {
      this.setupMessageQueue(client.userId);
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  public broadcast(event: string, data: any): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized, queueing message');
      this.queueMessage({
        id: uuidv4(),
        event,
        data,
        timestamp: new Date()
      });
      return;
    }

    const message: WebSocketMessage = {
      id: uuidv4(),
      event,
      data,
      timestamp: new Date(),
      source: 'server'
    };

    // Emit to all clients
    this.io.emit(event, data);

    // Add to history
    this.addToHistory(message);

    // Update metrics
    this.updateRoomMetrics('global', 'message');

    logger.debug(`Broadcast event: ${event}`, {
      clientCount: this.clients.size
    });
  }

  /**
   * Broadcast to specific room
   */
  public broadcastToRoom(room: string, event: string, data: any): void {
    if (!this.io) {
      this.queueMessage({
        id: uuidv4(),
        event,
        data,
        timestamp: new Date(),
        target: room
      });
      return;
    }

    const message: WebSocketMessage = {
      id: uuidv4(),
      event,
      data,
      timestamp: new Date(),
      source: 'server',
      target: room
    };

    // Emit to room
    this.io.to(room).emit(event, data);

    // Add to history
    this.addToHistory(message);

    // Update metrics
    this.updateRoomMetrics(room, 'message');

    logger.debug(`Broadcast to room ${room}: ${event}`);
  }

  /**
   * Send message to specific client
   */
  public sendToClient(clientId: string, event: string, data: any): void {
    const client = this.clients.get(clientId);

    if (!client) {
      logger.warn(`Client ${clientId} not found, queueing message`);
      this.queueMessageForClient(clientId, {
        id: uuidv4(),
        event,
        data,
        timestamp: new Date()
      });
      return;
    }

    client.socket.emit(event, data);

    logger.debug(`Sent to client ${clientId}: ${event}`);
  }

  /**
   * Send to specific target (room or client)
   */
  private sendToTarget(target: string, message: WebSocketMessage): void {
    if (target.startsWith('room:')) {
      const room = target.replace('room:', '');
      this.broadcastToRoom(room, message.event, message.data);
    } else if (target.startsWith('client:')) {
      const clientId = target.replace('client:', '');
      this.sendToClient(clientId, message.event, message.data);
    } else {
      // Assume it's a room name
      this.broadcastToRoom(target, message.event, message.data);
    }
  }

  /**
   * Add client to room tracking
   */
  private addClientToRoom(clientId: string, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);

    const client = this.clients.get(clientId);
    if (client) {
      client.rooms.add(room);
    }

    this.updateRoomMetrics(room, 'join');
  }

  /**
   * Remove client from room tracking
   */
  private removeClientFromRoom(clientId: string, room: string): void {
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(clientId);
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }

    const client = this.clients.get(clientId);
    if (client) {
      client.rooms.delete(room);
    }

    this.updateRoomMetrics(room, 'leave');
  }

  /**
   * Setup message queue for disconnected client
   */
  private setupMessageQueue(userId: string): void {
    if (!this.messageQueue.has(userId)) {
      this.messageQueue.set(userId, []);
    }
  }

  /**
   * Queue message for later delivery
   */
  private queueMessage(message: WebSocketMessage): void {
    this.queueMessageForClient('global', message);
  }

  /**
   * Queue message for specific client
   */
  private queueMessageForClient(target: string, message: WebSocketMessage): void {
    if (!this.messageQueue.has(target)) {
      this.messageQueue.set(target, []);
    }

    const queue = this.messageQueue.get(target)!;

    if (queue.length >= this.MAX_QUEUE_SIZE) {
      queue.shift(); // Remove oldest message
    }

    queue.push({
      message,
      retries: 0,
      maxRetries: 3
    });
  }

  /**
   * Process queued messages for reconnected client
   */
  private async processQueuedMessages(client: WebSocketClient): Promise<void> {
    const queues = [
      this.messageQueue.get(client.id),
      client.userId ? this.messageQueue.get(client.userId) : null,
      this.messageQueue.get('global')
    ].filter(Boolean);

    for (const queue of queues) {
      if (!queue) continue;

      for (const item of queue) {
        client.socket.emit(item.message.event, item.message.data);
      }
    }

    // Clear processed queues
    this.messageQueue.delete(client.id);
    if (client.userId) {
      this.messageQueue.delete(client.userId);
    }
  }

  /**
   * Add message to history
   */
  private addToHistory(message: WebSocketMessage): void {
    this.messageHistory.push(message);

    // Limit history size
    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory.shift();
    }
  }

  /**
   * Update room metrics
   */
  private updateRoomMetrics(room: string, action: 'join' | 'leave' | 'message'): void {
    if (!this.roomMetrics.has(room)) {
      this.roomMetrics.set(room, {
        clientCount: 0,
        messageRate: 0,
        lastActivity: new Date()
      });
    }

    const metrics = this.roomMetrics.get(room)!;
    const roomClients = this.rooms.get(room);

    metrics.clientCount = roomClients ? roomClients.size : 0;
    metrics.lastActivity = new Date();

    if (action === 'message') {
      metrics.messageRate++;
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceHeartbeat = now - client.lastHeartbeat.getTime();

        if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
          logger.warn(`Client ${clientId} heartbeat timeout, disconnecting`);
          client.socket.disconnect();
          this.clients.delete(clientId);
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getMetrics();

      // Broadcast metrics
      this.broadcast('metrics:update', metrics);

      // Reset message rates
      for (const roomMetric of this.roomMetrics.values()) {
        roomMetric.messageRate = 0;
      }

      logger.debug('WebSocket metrics collected', metrics);

    }, 60000); // Every minute
  }

  /**
   * Setup Redis pub/sub for multi-instance support
   */
  private async setupRedisPubSub(): Promise<void> {
    // Subscribe to Redis channels for inter-instance communication
    await redisSub.subscribe('websocket:broadcast', (message: string) => {
      try {
        const data = JSON.parse(message);
        this.broadcast(data.event, data.payload);
      } catch (error) {
        logger.error('Failed to process Redis broadcast:', error);
      }
    });

    logger.info('Redis pub/sub setup for multi-instance support');
  }

  /**
   * Setup state coordinator integration
   */
  private setupStateIntegration(): void {
    // Subscribe to state changes
    stateCoordinator.subscribe(
      [StateEvent.CREATED, StateEvent.UPDATED, StateEvent.STATUS_CHANGED],
      (change) => {
        // Broadcast state changes to relevant rooms
        const event = `state:${change.entityType}:${change.event}`;

        // Broadcast to entity-specific room
        this.broadcastToRoom(`${change.entityType}:${change.entityId}`, event, change);

        // Broadcast to type room
        this.broadcastToRoom(`${change.entityType}:all`, event, change);
      }
    );
  }

  /**
   * Get current metrics
   */
  public getMetrics(): {
    connectedClients: number;
    totalRooms: number;
    messageQueueSize: number;
    messageHistorySize: number;
    roomMetrics: Record<string, RoomMetrics>;
    uptime: number;
  } {
    return {
      connectedClients: this.clients.size,
      totalRooms: this.rooms.size,
      messageQueueSize: Array.from(this.messageQueue.values()).reduce(
        (sum, queue) => sum + queue.length, 0
      ),
      messageHistorySize: this.messageHistory.length,
      roomMetrics: Object.fromEntries(this.roomMetrics),
      uptime: process.uptime()
    };
  }

  /**
   * Get connected clients
   */
  public getConnectedClients(): WebSocketClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get clients in room
   */
  public getClientsInRoom(room: string): WebSocketClient[] {
    const clientIds = this.rooms.get(room);
    if (!clientIds) return [];

    return Array.from(clientIds)
      .map(id => this.clients.get(id))
      .filter(Boolean) as WebSocketClient[];
  }

  /**
   * Disconnect all clients (for shutdown)
   */
  public disconnectAll(reason: string = 'Server shutdown'): void {
    for (const client of this.clients.values()) {
      client.socket.emit('server:shutdown', { reason });
      client.socket.disconnect();
    }
    this.clients.clear();
    this.rooms.clear();
  }

  /**
   * Shutdown the WebSocket hub
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down UnifiedWebSocketHub');

    // Stop intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Disconnect all clients
    this.disconnectAll();

    // Close Socket.io server
    if (this.io) {
      await new Promise<void>((resolve) => {
        this.io!.close(() => {
          logger.info('Socket.io server closed');
          resolve();
        });
      });
    }

    // Unsubscribe from Redis
    await redis.unsubscribe('websocket:broadcast');

    this.isInitialized = false;
    logger.info('UnifiedWebSocketHub shutdown complete');
  }

  /**
   * Check if hub is initialized
   */
  public isReady(): boolean {
    return this.isInitialized && this.io !== null;
  }
}

// Export singleton instance
export const websocketHub = UnifiedWebSocketHub.getInstance();
