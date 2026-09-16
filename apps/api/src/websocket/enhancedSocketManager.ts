/**
 * Enhanced Socket Manager
 * Unified WebSocket connection management with proper state synchronization
 */

import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import UnifiedRedisStateManager from '../services/unified/stateCoordinator';
import { redis } from '../database/connection';
import { EventEmitter } from 'events';

interface SocketMetrics {
  connectTime: number;
  lastPing: number;
  latency: number;
  messageCount: number;
  errorCount: number;
  reconnectCount: number;
}

interface QueuedMessage {
  event: string;
  data: any;
  timestamp: number;
  retries: number;
}

export class EnhancedSocketManager extends EventEmitter {
  private io: SocketServer;
  private stateManager: UnifiedRedisStateManager;
  private connections: Map<string, Socket> = new Map();
  private metrics: Map<string, SocketMetrics> = new Map();
  private messageQueues: Map<string, QueuedMessage[]> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  private readonly HEARTBEAT_INTERVAL = 15000; // 15 seconds
  private readonly HEARTBEAT_TIMEOUT = 45000; // 45 seconds
  private readonly MESSAGE_RETRY_LIMIT = 3;
  private readonly MESSAGE_QUEUE_SIZE = 100;
  private readonly METRICS_INTERVAL = 5000; // 5 seconds

  constructor(server: HttpServer) {
    super();
    
    this.io = new SocketServer(server, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true
      },
      pingInterval: this.HEARTBEAT_INTERVAL,
      pingTimeout: this.HEARTBEAT_TIMEOUT,
      transports: ['websocket', 'polling'],
      allowEIO3: true
    });

    this.stateManager = new UnifiedRedisStateManager(redis);
    this.initialize();
  }

  private initialize() {
    // Setup connection handlers
    this.io.on('connection', (socket) => this.handleConnection(socket));
    
    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();
    
    // Start metrics collection
    this.startMetricsCollection();
    
    // Listen to Redis events
    this.stateManager.on('farms', (event) => this.broadcastFarmEvent(event));
    this.stateManager.on('agents', (event) => this.broadcastAgentEvent(event));
    this.stateManager.on('connections', (event) => this.handleConnectionEvent(event));
    
    console.log('[EnhancedSocketManager] Initialized');
  }

  /**
   * Connection handling
   */
  private async handleConnection(socket: Socket) {
    const clientId = socket.handshake.auth?.clientId || socket.id;
    console.log(`[EnhancedSocketManager] Client connected: ${clientId} (socket: ${socket.id})`);

    // Store connection
    this.connections.set(clientId, socket);
    
    // Initialize metrics
    this.metrics.set(clientId, {
      connectTime: Date.now(),
      lastPing: Date.now(),
      latency: 0,
      messageCount: 0,
      errorCount: 0,
      reconnectCount: 0
    });

    // Check for reconnection
    const existingConnection = await this.stateManager.handleReconnection(clientId, socket.id);
    
    if (existingConnection) {
      // Restore session
      await this.restoreSession(socket, clientId);
      
      // Process queued messages
      await this.processQueuedMessages(clientId);
      
      // Update metrics
      const metrics = this.metrics.get(clientId);
      if (metrics) {
        metrics.reconnectCount = existingConnection.metrics.reconnectCount;
      }
    } else {
      // New connection
      await this.stateManager.createConnection(clientId, socket.id);
    }

    // Setup socket event handlers
    this.setupSocketHandlers(socket, clientId);
    
    // Send initial state
    await this.sendInitialState(socket);
    
    // Emit connection event
    this.emit('client:connected', { clientId, socketId: socket.id });
  }

  private setupSocketHandlers(socket: Socket, clientId: string) {
    // Heartbeat/ping handling
    socket.on('ping', async (callback) => {
      const start = Date.now();
      
      if (typeof callback === 'function') {
        callback({ timestamp: start });
      }
      
      const latency = Date.now() - start;
      const metrics = this.metrics.get(clientId);
      if (metrics) {
        metrics.lastPing = Date.now();
        metrics.latency = latency;
      }
      
      // Update connection quality in Redis
      await this.stateManager.updateConnectionQuality(clientId, latency);
    });

    // Farm events
    socket.on('farm:create', async (data, callback) => {
      try {
        await this.handleFarmCreate(socket, data);
        if (callback) callback({ success: true });
      } catch (error) {
        console.error('[EnhancedSocketManager] Farm create error:', error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    socket.on('farm:stop', async (farmId, callback) => {
      try {
        await this.handleFarmStop(socket, farmId);
        if (callback) callback({ success: true });
      } catch (error) {
        console.error('[EnhancedSocketManager] Farm stop error:', error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    socket.on('farm:status', async (farmId, callback) => {
      try {
        const status = await this.getFarmStatus(farmId);
        if (callback) callback({ success: true, data: status });
      } catch (error) {
        console.error('[EnhancedSocketManager] Farm status error:', error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Metrics requests
    socket.on('metrics:request', async (callback) => {
      try {
        const health = await this.stateManager.getSystemHealth();
        if (callback) callback({ success: true, data: health });
      } catch (error) {
        console.error('[EnhancedSocketManager] Metrics error:', error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Error handling
    socket.on('error', (error) => {
      console.error(`[EnhancedSocketManager] Socket error for ${clientId}:`, error);
      const metrics = this.metrics.get(clientId);
      if (metrics) {
        metrics.errorCount++;
      }
    });

    // Disconnection handling
    socket.on('disconnect', async (reason) => {
      console.log(`[EnhancedSocketManager] Client disconnected: ${clientId} (reason: ${reason})`);
      
      // Don't immediately remove - might reconnect
      await this.handleDisconnection(clientId, reason);
    });
  }

  private async handleDisconnection(clientId: string, reason: string) {
    // Update Redis state
    await this.stateManager.handleDisconnection(clientId);
    
    // Keep connection reference for potential reconnection
    setTimeout(() => {
      // Check if still disconnected after grace period
      const socket = this.connections.get(clientId);
      if (!socket || !socket.connected) {
        this.connections.delete(clientId);
        this.metrics.delete(clientId);
        
        // Clear message queue if too old
        const queue = this.messageQueues.get(clientId);
        if (queue && queue.length > 0) {
          const oldestMessage = queue[0];
          if (Date.now() - oldestMessage.timestamp > 600000) { // 10 minutes
            this.messageQueues.delete(clientId);
          }
        }
      }
    }, 30000); // 30 second grace period
    
    this.emit('client:disconnected', { clientId, reason });
  }

  /**
   * Session restoration
   */
  private async restoreSession(socket: Socket, clientId: string) {
    console.log(`[EnhancedSocketManager] Restoring session for ${clientId}`);
    
    // Get active farms for this client
    const activeFarms = await this.stateManager.getActiveFarms();
    
    // Send restored state
    socket.emit('session:restored', {
      clientId,
      farms: activeFarms,
      timestamp: Date.now()
    });
  }

  /**
   * Message queueing and delivery
   */
  private queueMessage(clientId: string, event: string, data: any) {
    let queue = this.messageQueues.get(clientId);
    if (!queue) {
      queue = [];
      this.messageQueues.set(clientId, queue);
    }
    
    // Limit queue size
    if (queue.length >= this.MESSAGE_QUEUE_SIZE) {
      queue.shift(); // Remove oldest message
    }
    
    queue.push({
      event,
      data,
      timestamp: Date.now(),
      retries: 0
    });
  }

  private async processQueuedMessages(clientId: string) {
    const queue = this.messageQueues.get(clientId);
    if (!queue || queue.length === 0) return;
    
    const socket = this.connections.get(clientId);
    if (!socket || !socket.connected) return;
    
    console.log(`[EnhancedSocketManager] Processing ${queue.length} queued messages for ${clientId}`);
    
    const delivered: QueuedMessage[] = [];
    
    for (const message of queue) {
      try {
        // Send with acknowledgment
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
          
          socket.emit(message.event, message.data, (ack: any) => {
            clearTimeout(timeout);
            resolve(ack);
          });
        });
        
        delivered.push(message);
      } catch (error) {
        console.error(`[EnhancedSocketManager] Failed to deliver queued message:`, error);
        message.retries++;
        
        if (message.retries >= this.MESSAGE_RETRY_LIMIT) {
          delivered.push(message); // Give up on this message
        }
      }
    }
    
    // Remove delivered messages
    const remaining = queue.filter(m => !delivered.includes(m));
    if (remaining.length > 0) {
      this.messageQueues.set(clientId, remaining);
    } else {
      this.messageQueues.delete(clientId);
    }
  }

  /**
   * Broadcasting
   */
  private broadcastToClient(clientId: string, event: string, data: any) {
    const socket = this.connections.get(clientId);
    
    if (socket && socket.connected) {
      socket.emit(event, data);
      
      // Update metrics
      const metrics = this.metrics.get(clientId);
      if (metrics) {
        metrics.messageCount++;
      }
    } else {
      // Queue message for later delivery
      this.queueMessage(clientId, event, data);
    }
  }

  private broadcast(event: string, data: any) {
    // Send to all connected clients
    this.io.emit(event, data);
    
    // Update metrics for all connections
    this.connections.forEach((socket, clientId) => {
      if (socket.connected) {
        const metrics = this.metrics.get(clientId);
        if (metrics) {
          metrics.messageCount++;
        }
      }
    });
  }

  private broadcastFarmEvent(event: any) {
    this.broadcast('farm:update', event);
  }

  private broadcastAgentEvent(event: any) {
    this.broadcast('agent:update', event);
  }

  private handleConnectionEvent(event: any) {
    switch (event.type) {
      case 'connection:quality:degraded':
        // Notify client of degraded connection
        this.broadcastToClient(event.clientId, 'connection:quality', {
          quality: event.quality,
          latency: event.latency,
          packetLoss: event.packetLoss
        });
        break;
    }
  }

  /**
   * Farm operations
   */
  private async handleFarmCreate(socket: Socket, data: any) {
    // Implementation would integrate with farm manager
    const farmState = await this.stateManager.createFarm({
      name: data.name,
      status: 'initializing' as any,
      agents: [],
      config: data
    });
    
    socket.emit('farm:created', farmState);
    this.broadcast('farm:new', farmState);
  }

  private async handleFarmStop(socket: Socket, farmId: string) {
    // Implementation would integrate with farm manager
    await this.stateManager.updateFarmStatus(farmId, 'stopping' as any);
    
    socket.emit('farm:stopped', { farmId });
    this.broadcast('farm:update', { farmId, status: 'stopping' });
  }

  private async getFarmStatus(farmId: string) {
    const farm = await this.stateManager.getFarmState(farmId);
    const agents = await this.stateManager.getFarmAgents(farmId);
    
    return {
      farm,
      agents,
      timestamp: Date.now()
    };
  }

  /**
   * Initial state
   */
  private async sendInitialState(socket: Socket) {
    const activeFarms = await this.stateManager.getActiveFarms();
    const health = await this.stateManager.getSystemHealth();
    
    socket.emit('state:initial', {
      farms: activeFarms,
      health,
      timestamp: Date.now()
    });
  }

  /**
   * Monitoring
   */
  private startHeartbeatMonitoring() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      this.connections.forEach((socket, clientId) => {
        const metrics = this.metrics.get(clientId);
        if (!metrics) return;
        
        const timeSinceLastPing = now - metrics.lastPing;
        
        if (timeSinceLastPing > this.HEARTBEAT_TIMEOUT) {
          console.warn(`[EnhancedSocketManager] Client ${clientId} heartbeat timeout`);
          
          // Force disconnect
          socket.disconnect(true);
          this.handleDisconnection(clientId, 'heartbeat_timeout');
        } else if (timeSinceLastPing > this.HEARTBEAT_INTERVAL * 2) {
          // Connection might be degraded
          this.stateManager.updateConnectionQuality(clientId, timeSinceLastPing, 0);
        }
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  private startMetricsCollection() {
    this.metricsInterval = setInterval(async () => {
      const connectionStats = {
        total: this.connections.size,
        connected: 0,
        disconnected: 0,
        avgLatency: 0,
        totalMessages: 0,
        totalErrors: 0
      };
      
      let totalLatency = 0;
      let latencyCount = 0;
      
      this.connections.forEach((socket, clientId) => {
        if (socket.connected) {
          connectionStats.connected++;
        } else {
          connectionStats.disconnected++;
        }
        
        const metrics = this.metrics.get(clientId);
        if (metrics) {
          connectionStats.totalMessages += metrics.messageCount;
          connectionStats.totalErrors += metrics.errorCount;
          
          if (metrics.latency > 0) {
            totalLatency += metrics.latency;
            latencyCount++;
          }
        }
      });
      
      if (latencyCount > 0) {
        connectionStats.avgLatency = totalLatency / latencyCount;
      }
      
      // Emit metrics
      this.emit('metrics:connections', connectionStats);
      
      // Broadcast to monitoring clients
      this.broadcast('metrics:update', {
        connections: connectionStats,
        timestamp: Date.now()
      });
    }, this.METRICS_INTERVAL);
  }

  /**
   * Public API
   */
  
  getConnectionCount(): number {
    return this.connections.size;
  }

  getActiveConnections(): string[] {
    return Array.from(this.connections.keys()).filter(clientId => {
      const socket = this.connections.get(clientId);
      return socket && socket.connected;
    });
  }

  getConnectionMetrics(clientId: string): SocketMetrics | undefined {
    return this.metrics.get(clientId);
  }

  async getSystemHealth() {
    return this.stateManager.getSystemHealth();
  }

  /**
   * Cleanup
   */
  
  async destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    // Disconnect all clients
    this.connections.forEach(socket => {
      socket.disconnect(true);
    });
    
    this.connections.clear();
    this.metrics.clear();
    this.messageQueues.clear();
    
    await this.stateManager.destroy();
    
    this.io.close();
    
    this.removeAllListeners();
    console.log('[EnhancedSocketManager] Destroyed');
  }
}

export default EnhancedSocketManager;