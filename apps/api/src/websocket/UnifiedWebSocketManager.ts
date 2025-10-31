/**
 * UnifiedWebSocketManager - Optimized WebSocket management with room-based broadcasting
 *
 * Key improvements:
 * - Room-based broadcasting for efficient message delivery
 * - Message deduplication
 * - Connection pooling
 * - Memory-efficient event handling
 * - Automatic cleanup of disconnected clients
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { logger, LogCategory } from '../utils/logger';
import { memoryManager } from '../services/unified/MemoryManager';
import { LRUCache } from '../services/unified/CacheManager';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  roles?: string[];
  permissions?: string[];
  joinedRooms?: Set<string>;
}

interface BroadcastOptions {
  excludeSender?: boolean;
  volatile?: boolean; // Don't wait for acknowledgment
  compress?: boolean;
  timeout?: number;
}

interface MessageDeduplicationEntry {
  hash: string;
  timestamp: number;
  count: number;
}

export class UnifiedWebSocketManager extends EventEmitter {
  private static instance: UnifiedWebSocketManager;
  public io: SocketIOServer | null = null;

  // Connection management
  private clients: Map<string, AuthenticatedSocket> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private roomMembers: Map<string, Set<string>> = new Map(); // room -> socketIds

  // Message deduplication
  private messageCache: LRUCache<string, MessageDeduplicationEntry>;
  private readonly MESSAGE_CACHE_TTL = 5000; // 5 seconds
  private readonly DEDUP_WINDOW = 100; // 100ms window for duplicate detection

  // Statistics
  private stats = {
    messagessSent: 0,
    messagesDuplicated: 0,
    roomsCreated: 0,
    connectionsTotal: 0,
    connectionsActive: 0
  };

  private constructor() {
    super();
    this.messageCache = new LRUCache<string, MessageDeduplicationEntry>(1000, 10);
    this.initialize();
  }

  static getInstance(): UnifiedWebSocketManager {
    if (!UnifiedWebSocketManager.instance) {
      UnifiedWebSocketManager.instance = new UnifiedWebSocketManager();
    }
    return UnifiedWebSocketManager.instance;
  }

  private initialize(): void {
    // Register with memory manager
    memoryManager.registerService('UnifiedWebSocketManager', {
      getMemoryUsage: () => this.getMemoryUsage(),
      cleanup: () => this.cleanup(),
      priority: 3
    });

    // Set up periodic cleanup
    setInterval(() => this.cleanupStaleConnections(), 60000); // Every minute

    logger.info(LogCategory.WEBSOCKET, 'UnifiedWebSocketManager initialized');
  }

  /**
   * Initialize WebSocket server OR set existing Socket.io server
   */
  initializeServer(httpServerOrIo: HTTPServer | SocketIOServer): void {
    if (this.io) {
      logger.warn(LogCategory.WEBSOCKET, 'WebSocket server already initialized');
      return;
    }

    // Check if we're being passed an existing Socket.io server or HTTP server
    if ('sockets' in httpServerOrIo) {
      // It's already a Socket.io server, just use it
      this.io = httpServerOrIo as SocketIOServer;
      logger.info(LogCategory.WEBSOCKET, 'Using existing Socket.io server');
    } else {
      // It's an HTTP server, create new Socket.io server
      this.io = new SocketIOServer(httpServerOrIo as HTTPServer, {
        cors: {
          origin: true,
          methods: ['GET', 'POST'],
          credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
        perMessageDeflate: {
          threshold: 1024,
          zlibDeflateOptions: { level: 1 }
        },
        maxHttpBufferSize: 10 * 1024 * 1024,
        connectionStateRecovery: {
          maxDisconnectionDuration: 2 * 60 * 1000,
          skipMiddlewares: false
        }
      });
    }

    this.setupEventHandlers();
    logger.info(LogCategory.WEBSOCKET, 'WebSocket server initialized');
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);

      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });

      socket.on('join:room', (roomName: string) => {
        this.joinRoom(socket, roomName);
      });

      socket.on('leave:room', (roomName: string) => {
        this.leaveRoom(socket, roomName);
      });

      socket.on('error', (error) => {
        logger.error(LogCategory.WEBSOCKET, `Socket error for ${socket.id}:`, error);
      });
    });
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    // Store client
    this.clients.set(socket.id, socket);
    socket.joinedRooms = new Set();

    // Track user sockets
    if (socket.userId) {
      if (!this.userSockets.has(socket.userId)) {
        this.userSockets.set(socket.userId, new Set());
      }
      this.userSockets.get(socket.userId)!.add(socket.id);
    }

    // Update stats
    this.stats.connectionsTotal++;
    this.stats.connectionsActive++;

    logger.debug(LogCategory.WEBSOCKET, `Client connected: ${socket.id}`);
    this.emit('client:connected', { socketId: socket.id, userId: socket.userId });
  }

  private handleDisconnection(socket: AuthenticatedSocket): void {
    // Leave all rooms
    if (socket.joinedRooms) {
      for (const room of socket.joinedRooms) {
        this.leaveRoom(socket, room);
      }
    }

    // Remove from user sockets
    if (socket.userId) {
      const userSocketSet = this.userSockets.get(socket.userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        if (userSocketSet.size === 0) {
          this.userSockets.delete(socket.userId);
        }
      }
    }

    // Remove client
    this.clients.delete(socket.id);

    // Update stats
    this.stats.connectionsActive--;

    logger.debug(LogCategory.WEBSOCKET, `Client disconnected: ${socket.id}`);
    this.emit('client:disconnected', { socketId: socket.id, userId: socket.userId });
  }

  /**
   * Join a room
   */
  joinRoom(socket: AuthenticatedSocket, roomName: string): void {
    if (!socket.joinedRooms) {
      socket.joinedRooms = new Set();
    }

    // Check if already in room
    if (socket.joinedRooms.has(roomName)) {
      return;
    }

    // Join Socket.io room
    socket.join(roomName);
    socket.joinedRooms.add(roomName);

    // Track room members
    if (!this.roomMembers.has(roomName)) {
      this.roomMembers.set(roomName, new Set());
      this.stats.roomsCreated++;
    }
    this.roomMembers.get(roomName)!.add(socket.id);

    logger.debug(LogCategory.WEBSOCKET, `Socket ${socket.id} joined room ${roomName}`);
    this.emit('room:joined', { socketId: socket.id, roomName });
  }

  /**
   * Leave a room
   */
  leaveRoom(socket: AuthenticatedSocket, roomName: string): void {
    if (!socket.joinedRooms?.has(roomName)) {
      return;
    }

    // Leave Socket.io room
    socket.leave(roomName);
    socket.joinedRooms.delete(roomName);

    // Update room members
    const members = this.roomMembers.get(roomName);
    if (members) {
      members.delete(socket.id);
      if (members.size === 0) {
        this.roomMembers.delete(roomName);
      }
    }

    logger.debug(LogCategory.WEBSOCKET, `Socket ${socket.id} left room ${roomName}`);
    this.emit('room:left', { socketId: socket.id, roomName });
  }

  /**
   * Broadcast to a specific room
   */
  broadcastToRoom(
    roomName: string,
    event: string,
    data: any,
    options: BroadcastOptions = {}
  ): boolean {
    if (!this.io) {
      logger.warn(LogCategory.WEBSOCKET, 'WebSocket server not initialized');
      return false;
    }

    // Check for duplicate message
    if (this.isDuplicateMessage(event, data)) {
      this.stats.messagesDuplicated++;
      return false;
    }

    // Get room emitter
    let emitter = this.io.to(roomName);

    // Apply options
    if (options.volatile) {
      emitter = emitter.volatile;
    }

    if (options.compress) {
      emitter = emitter.compress(true);
    }

    if (options.timeout) {
      emitter = emitter.timeout(options.timeout);
    }

    // Emit message
    emitter.emit(event, data);

    this.stats.messagessSent++;
    logger.debug(LogCategory.WEBSOCKET, `Broadcast to room ${roomName}: ${event}`);

    return true;
  }

  /**
   * Broadcast to specific sockets
   */
  broadcastToSockets(
    socketIds: string[],
    event: string,
    data: any,
    options: BroadcastOptions = {}
  ): void {
    if (!this.io) return;

    for (const socketId of socketIds) {
      const socket = this.clients.get(socketId);
      if (socket) {
        if (options.volatile) {
          socket.volatile.emit(event, data);
        } else {
          socket.emit(event, data);
        }
      }
    }

    this.stats.messagessSent += socketIds.length;
  }

  /**
   * Emit to a specific socket
   */
  emitToSocket(socketId: string, event: string, data: any): boolean {
    const socket = this.clients.get(socketId);
    if (!socket) {
      logger.debug(LogCategory.WEBSOCKET, `Socket ${socketId} not found`);
      return false;
    }

    socket.emit(event, data);
    this.stats.messagessSent++;
    return true;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any, options: BroadcastOptions = {}): void {
    if (!this.io) return;

    // Check for duplicate
    if (this.isDuplicateMessage(event, data)) {
      this.stats.messagesDuplicated++;
      return;
    }

    let emitter = this.io;

    if (options.volatile) {
      emitter = emitter.volatile;
    }

    emitter.emit(event, data);
    this.stats.messagessSent++;
  }

  /**
   * Broadcast to all clients of a specific user
   */
  broadcastToUser(userId: string, event: string, data: any): void {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds) return;

    this.broadcastToSockets(Array.from(socketIds), event, data);
  }

  /**
   * Broadcast to a farm (room-based)
   */
  broadcastToFarm(farmId: string, event: string, data: any): void {
    this.broadcastToRoom(`farm:${farmId}`, event, data);
  }

  /**
   * Check for duplicate messages
   */
  private isDuplicateMessage(event: string, data: any): boolean {
    try {
      // Create hash of event and data
      const content = JSON.stringify({ event, data });
      const hash = createHash('md5').update(content).digest('hex');

      // Check cache
      const cached = this.messageCache.get(hash);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < this.DEDUP_WINDOW) {
        cached.count++;
        return true;
      }

      // Cache the message
      this.messageCache.set(hash, {
        hash,
        timestamp: now,
        count: 1
      }, this.MESSAGE_CACHE_TTL);

      return false;
    } catch {
      // If we can't serialize, don't deduplicate
      return false;
    }
  }

  /**
   * Clean up stale connections
   */
  private cleanupStaleConnections(): void {
    let cleaned = 0;

    for (const [socketId, socket] of this.clients.entries()) {
      if (!socket.connected) {
        this.handleDisconnection(socket);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(LogCategory.WEBSOCKET, `Cleaned up ${cleaned} stale connections`);
    }
  }

  /**
   * Get memory usage
   */
  private getMemoryUsage(): number {
    return this.clients.size * 1000 + // Rough estimate per connection
           this.messageCache.size * 100; // Cache size
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Clear message cache
    this.messageCache.clear();

    // Disconnect idle clients
    for (const [socketId, socket] of this.clients.entries()) {
      if (!socket.rooms || socket.rooms.size <= 1) {
        // Only in default room, probably idle
        socket.disconnect(true);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      roomCount: this.roomMembers.size,
      userCount: this.userSockets.size,
      cacheSize: this.messageCache.size
    };
  }

  /**
   * Get room members
   */
  getRoomMembers(roomName: string): string[] {
    const members = this.roomMembers.get(roomName);
    return members ? Array.from(members) : [];
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.WEBSOCKET, 'Shutting down WebSocket server...');

    if (this.io) {
      // Disconnect all clients
      this.io.emit('server:shutdown', { reason: 'Server shutting down' });

      // Close server
      await new Promise<void>((resolve) => {
        this.io!.close(() => {
          logger.info(LogCategory.WEBSOCKET, 'WebSocket server closed');
          resolve();
        });
      });
    }

    // Clear all data
    this.clients.clear();
    this.userSockets.clear();
    this.roomMembers.clear();
    this.messageCache.clear();
  }
}

// Export singleton instance
export const unifiedWebSocketManager = UnifiedWebSocketManager.getInstance();