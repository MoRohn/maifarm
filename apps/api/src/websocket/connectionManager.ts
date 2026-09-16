/**
 * WebSocket Connection Manager for Production Stability
 * Handles reconnection, heartbeat, and connection pooling
 */

import { Socket, Server as SocketIOServer } from 'socket.io';
import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { circuitBreakerManager } from '../services/circuitBreaker';

export interface ConnectionInfo {
  socketId: string;
  userId?: string;
  farmId?: string;
  connectedAt: Date;
  lastActivity: Date;
  lastHeartbeat: Date;
  missedHeartbeats: number;
  reconnectCount: number;
  metadata: Record<string, any>;
}

export interface ConnectionPoolConfig {
  maxConnections?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
}

/**
 * Production-grade WebSocket Connection Manager
 */
export class WebSocketConnectionManager extends EventEmitter {
  private connections: Map<string, ConnectionInfo> = new Map();
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private farmConnections: Map<string, Set<string>> = new Map(); // farmId -> socketIds
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();

  private readonly config: Required<ConnectionPoolConfig>;
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Metrics
  private totalConnections = 0;
  private totalDisconnections = 0;
  private totalReconnections = 0;
  private totalHeartbeatFailures = 0;

  constructor(
    private io: SocketIOServer,
    config: ConnectionPoolConfig = {}
  ) {
    super();

    this.config = {
      maxConnections: 1000,
      heartbeatInterval: 30000,      // 30 seconds
      heartbeatTimeout: 60000,       // 60 seconds
      reconnectAttempts: 5,
      reconnectDelay: 1000,           // 1 second
      maxReconnectDelay: 30000,       // 30 seconds
      ...config
    };

    this.setupEventHandlers();
    this.startMonitoring();
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new connection
   */
  private handleConnection(socket: Socket): void {
    const socketId = socket.id;

    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      logger.warn(LogCategory.WEBSOCKET,
        `Connection limit reached (${this.config.maxConnections}), rejecting ${socketId}`);
      socket.disconnect(true);
      return;
    }

    // Create connection info
    const connectionInfo: ConnectionInfo = {
      socketId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      lastHeartbeat: new Date(),
      missedHeartbeats: 0,
      reconnectCount: 0,
      metadata: {}
    };

    // Store connection
    this.connections.set(socketId, connectionInfo);
    this.totalConnections++;

    // Setup heartbeat
    this.setupHeartbeat(socket);

    // Setup event handlers
    this.setupSocketHandlers(socket);

    // Emit connection event
    this.emit('client-connected', {
      socketId,
      totalConnections: this.connections.size
    });

    logger.info(LogCategory.WEBSOCKET,
      `Client connected: ${socketId} (Total: ${this.connections.size})`);
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(socket: Socket): void {
    // Handle authentication
    socket.on('authenticate', (data) => {
      const connectionInfo = this.connections.get(socket.id);
      if (connectionInfo) {
        connectionInfo.userId = data.userId;
        connectionInfo.metadata.authenticated = true;
        connectionInfo.lastActivity = new Date();

        // Track user connection
        if (data.userId) {
          if (!this.userConnections.has(data.userId)) {
            this.userConnections.set(data.userId, new Set());
          }
          this.userConnections.get(data.userId)!.add(socket.id);
        }

        logger.debug(LogCategory.WEBSOCKET,
          `Socket ${socket.id} authenticated as user ${data.userId}`);
      }
    });

    // Handle farm association
    socket.on('join-farm', (data) => {
      const connectionInfo = this.connections.get(socket.id);
      if (connectionInfo) {
        connectionInfo.farmId = data.farmId;
        connectionInfo.lastActivity = new Date();

        // Track farm connection
        if (data.farmId) {
          if (!this.farmConnections.has(data.farmId)) {
            this.farmConnections.set(data.farmId, new Set());
          }
          this.farmConnections.get(data.farmId)!.add(socket.id);

          // Join Socket.IO room
          socket.join(`farm:${data.farmId}`);
        }

        logger.debug(LogCategory.WEBSOCKET,
          `Socket ${socket.id} joined farm ${data.farmId}`);
      }
    });

    // Handle heartbeat response
    socket.on('pong', () => {
      const connectionInfo = this.connections.get(socket.id);
      if (connectionInfo) {
        connectionInfo.lastHeartbeat = new Date();
        connectionInfo.missedHeartbeats = 0;
        connectionInfo.lastActivity = new Date();
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(LogCategory.WEBSOCKET,
        `Socket error for ${socket.id}:`, error);

      // Track error in connection info
      const connectionInfo = this.connections.get(socket.id);
      if (connectionInfo) {
        connectionInfo.metadata.lastError = {
          message: error.message,
          timestamp: new Date()
        };
      }
    });

    // Handle reconnection
    socket.on('reconnect', (attemptNumber) => {
      const connectionInfo = this.connections.get(socket.id);
      if (connectionInfo) {
        connectionInfo.reconnectCount++;
        connectionInfo.lastActivity = new Date();
        this.totalReconnections++;

        logger.info(LogCategory.WEBSOCKET,
          `Socket ${socket.id} reconnected after ${attemptNumber} attempts`);
      }
    });
  }

  /**
   * Setup heartbeat for connection
   */
  private setupHeartbeat(socket: Socket): void {
    const intervalId = setInterval(() => {
      const connectionInfo = this.connections.get(socket.id);

      if (!connectionInfo) {
        clearInterval(intervalId);
        this.heartbeatIntervals.delete(socket.id);
        return;
      }

      const timeSinceLastHeartbeat = Date.now() - connectionInfo.lastHeartbeat.getTime();

      if (timeSinceLastHeartbeat > this.config.heartbeatTimeout) {
        connectionInfo.missedHeartbeats++;
        this.totalHeartbeatFailures++;

        if (connectionInfo.missedHeartbeats >= 3) {
          logger.warn(LogCategory.WEBSOCKET,
            `Socket ${socket.id} heartbeat timeout, disconnecting`);
          socket.disconnect(true);
          return;
        }
      }

      // Send ping
      socket.emit('ping', {
        timestamp: Date.now(),
        serverTime: new Date()
      });

    }, this.config.heartbeatInterval);

    this.heartbeatIntervals.set(socket.id, intervalId);
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(socket: Socket, reason: string): void {
    const socketId = socket.id;
    const connectionInfo = this.connections.get(socketId);

    if (connectionInfo) {
      // Clean up user connections
      if (connectionInfo.userId) {
        const userSockets = this.userConnections.get(connectionInfo.userId);
        if (userSockets) {
          userSockets.delete(socketId);
          if (userSockets.size === 0) {
            this.userConnections.delete(connectionInfo.userId);
          }
        }
      }

      // Clean up farm connections
      if (connectionInfo.farmId) {
        const farmSockets = this.farmConnections.get(connectionInfo.farmId);
        if (farmSockets) {
          farmSockets.delete(socketId);
          if (farmSockets.size === 0) {
            this.farmConnections.delete(connectionInfo.farmId);
          }
        }
      }

      // Calculate session duration
      const sessionDuration = Date.now() - connectionInfo.connectedAt.getTime();

      // Emit disconnection event
      this.emit('client-disconnected', {
        socketId,
        userId: connectionInfo.userId,
        farmId: connectionInfo.farmId,
        reason,
        sessionDuration,
        totalConnections: this.connections.size - 1
      });

      logger.info(LogCategory.WEBSOCKET,
        `Client disconnected: ${socketId} (Reason: ${reason}, Duration: ${sessionDuration}ms)`);
    }

    // Clean up heartbeat
    const intervalId = this.heartbeatIntervals.get(socketId);
    if (intervalId) {
      clearInterval(intervalId);
      this.heartbeatIntervals.delete(socketId);
    }

    // Remove connection
    this.connections.delete(socketId);
    this.totalDisconnections++;
  }

  /**
   * Start connection monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const now = Date.now();
      const staleConnections: string[] = [];

      // Check for stale connections
      this.connections.forEach((info, socketId) => {
        const timeSinceActivity = now - info.lastActivity.getTime();

        // Consider connection stale after 5 minutes of inactivity
        if (timeSinceActivity > 300000) {
          staleConnections.push(socketId);
        }
      });

      // Disconnect stale connections
      staleConnections.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          logger.info(LogCategory.WEBSOCKET,
            `Disconnecting stale connection: ${socketId}`);
          socket.disconnect(true);
        }
      });

      // Emit metrics
      this.emit('metrics-update', this.getMetrics());

    }, 60000); // Check every minute
  }

  /**
   * Get connection metrics
   */
  getMetrics() {
    const activeConnections = this.connections.size;
    const authenticatedConnections = Array.from(this.connections.values())
      .filter(c => c.metadata.authenticated).length;

    const avgSessionDuration = this.calculateAverageSessionDuration();
    const reconnectionRate = this.totalConnections > 0
      ? (this.totalReconnections / this.totalConnections) * 100
      : 0;

    return {
      activeConnections,
      authenticatedConnections,
      totalConnections: this.totalConnections,
      totalDisconnections: this.totalDisconnections,
      totalReconnections: this.totalReconnections,
      totalHeartbeatFailures: this.totalHeartbeatFailures,
      avgSessionDuration,
      reconnectionRate: reconnectionRate.toFixed(2) + '%',
      userCount: this.userConnections.size,
      farmCount: this.farmConnections.size
    };
  }

  /**
   * Calculate average session duration
   */
  private calculateAverageSessionDuration(): number {
    const now = Date.now();
    const durations = Array.from(this.connections.values())
      .map(c => now - c.connectedAt.getTime());

    if (durations.length === 0) return 0;

    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }

  /**
   * Get connections by user ID
   */
  getConnectionsByUser(userId: string): ConnectionInfo[] {
    const socketIds = this.userConnections.get(userId);
    if (!socketIds) return [];

    return Array.from(socketIds)
      .map(id => this.connections.get(id))
      .filter(Boolean) as ConnectionInfo[];
  }

  /**
   * Get connections by farm ID
   */
  getConnectionsByFarm(farmId: string): ConnectionInfo[] {
    const socketIds = this.farmConnections.get(farmId);
    if (!socketIds) return [];

    return Array.from(socketIds)
      .map(id => this.connections.get(id))
      .filter(Boolean) as ConnectionInfo[];
  }

  /**
   * Broadcast to user connections
   */
  broadcastToUser(userId: string, event: string, data: any): void {
    const socketIds = this.userConnections.get(userId);
    if (!socketIds) return;

    socketIds.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
      }
    });
  }

  /**
   * Broadcast to farm connections
   */
  broadcastToFarm(farmId: string, event: string, data: any): void {
    this.io.to(`farm:${farmId}`).emit(event, data);
  }

  /**
   * Force disconnect a user
   */
  disconnectUser(userId: string, reason: string = 'admin'): void {
    const socketIds = this.userConnections.get(userId);
    if (!socketIds) return;

    socketIds.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('force-disconnect', { reason });
        socket.disconnect(true);
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Clear all heartbeat intervals
    this.heartbeatIntervals.forEach(interval => clearInterval(interval));
    this.heartbeatIntervals.clear();

    // Clear monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Clear all connections
    this.connections.clear();
    this.userConnections.clear();
    this.farmConnections.clear();

    // Remove all listeners
    this.removeAllListeners();

    logger.info(LogCategory.WEBSOCKET, 'WebSocket connection manager destroyed');
  }
}

// Export singleton instance
let connectionManager: WebSocketConnectionManager | null = null;

export function initializeConnectionManager(
  io: SocketIOServer,
  config?: ConnectionPoolConfig
): WebSocketConnectionManager {
  if (connectionManager) {
    connectionManager.destroy();
  }

  connectionManager = new WebSocketConnectionManager(io, config);
  return connectionManager;
}

export function getConnectionManager(): WebSocketConnectionManager | null {
  return connectionManager;
}