/**
 * Enhanced WebSocket Manager with Reconnection Logic
 * Provides robust WebSocket connection management with automatic reconnection,
 * event batching, and improved error handling
 */

import { EventEmitter } from 'events';
import { Server as SocketIOServer } from 'socket.io';
import { structuredLogger as logger, LogCategory } from '../utils/structuredLogger';
import WebSocketServer from './socketServer';

interface ReconnectionConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterRange: number; // 0-1, adds randomness to prevent thundering herd
}

interface QueuedMessage {
  event: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

interface ConnectionMetrics {
  connectTime?: Date;
  disconnectTime?: Date;
  reconnectAttempts: number;
  messagesSent: number;
  messagesQueued: number;
  lastError?: Error;
  uptime: number;
}

export class EnhancedWebSocketManager extends EventEmitter {
  private static instance: EnhancedWebSocketManager;
  private server: WebSocketServer | null = null;
  private io: SocketIOServer | null = null;
  
  // Reconnection state
  private isConnected: boolean = false;
  private isReconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  // Message queue for offline buffering
  private messageQueue: QueuedMessage[] = [];
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly MESSAGE_TTL = 60000; // 1 minute
  
  // Event batching
  private eventBatch: Map<string, any[]> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_INTERVAL = 50; // milliseconds
  private readonly MAX_BATCH_SIZE = 100;
  
  // Connection metrics
  private metrics: ConnectionMetrics = {
    reconnectAttempts: 0,
    messagesSent: 0,
    messagesQueued: 0,
    uptime: 0
  };
  
  // Configuration
  private reconnectionConfig: ReconnectionConfig = {
    maxAttempts: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
    jitterRange: 0.3
  };
  
  private constructor() {
    super();
    this.setupMetricsTracking();
  }
  
  static getInstance(): EnhancedWebSocketManager {
    if (!EnhancedWebSocketManager.instance) {
      EnhancedWebSocketManager.instance = new EnhancedWebSocketManager();
    }
    return EnhancedWebSocketManager.instance;
  }
  
  /**
   * Set the WebSocket server instance
   */
  setServer(server: WebSocketServer): void {
    if (this.server) {
      this.cleanup();
    }
    
    this.server = server;
    this.io = server.io || null;
    
    if (this.io) {
      this.setupConnectionHandlers();
      this.isConnected = true;
      this.metrics.connectTime = new Date();
      this.processQueuedMessages();
      
      logger.info(LogCategory.WEBSOCKET, 'Enhanced WebSocket manager connected');
      this.emit('connected');
    }
  }
  
  /**
   * Setup connection event handlers
   */
  private setupConnectionHandlers(): void {
    if (!this.io) return;
    
    // Monitor connection health
    this.io.on('connection', (socket) => {
      socket.on('error', (error) => {
        logger.error(LogCategory.WEBSOCKET, 'Socket error:', error);
        this.metrics.lastError = error;
      });
      
      socket.on('disconnect', (reason) => {
        logger.info(LogCategory.WEBSOCKET, `Socket disconnected: ${reason}`);
      });
      
      // Heartbeat for connection monitoring
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });
    
    // Monitor server-level events
    this.io.engine.on('connection_error', (error) => {
      logger.error(LogCategory.WEBSOCKET, 'Connection error:', error);
      this.handleDisconnection();
    });
  }
  
  /**
   * Handle disconnection and trigger reconnection
   */
  private handleDisconnection(): void {
    if (!this.isConnected || this.isReconnecting) {
      return;
    }
    
    this.isConnected = false;
    this.metrics.disconnectTime = new Date();
    logger.warn(LogCategory.WEBSOCKET, 'WebSocket disconnected, initiating reconnection');
    this.emit('disconnected');
    
    this.startReconnection();
  }
  
  /**
   * Start reconnection process with exponential backoff
   */
  private async startReconnection(): Promise<void> {
    if (this.isReconnecting) {
      return;
    }
    
    this.isReconnecting = true;
    
    while (
      this.reconnectAttempts < this.reconnectionConfig.maxAttempts && 
      !this.isConnected
    ) {
      this.reconnectAttempts++;
      this.metrics.reconnectAttempts++;
      
      const delay = this.calculateReconnectDelay();
      logger.info(LogCategory.WEBSOCKET, 
        `Reconnection attempt ${this.reconnectAttempts}/${this.reconnectionConfig.maxAttempts} in ${delay}ms`
      );
      
      await this.delay(delay);
      
      if (this.isConnected) {
        break;
      }
      
      try {
        await this.attemptReconnection();
        
        if (this.isConnected) {
          logger.info(LogCategory.WEBSOCKET, 'Reconnection successful');
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.emit('reconnected');
          break;
        }
      } catch (error) {
        logger.error(LogCategory.WEBSOCKET, 'Reconnection attempt failed:', error);
        this.metrics.lastError = error as Error;
      }
    }
    
    if (!this.isConnected) {
      logger.error(LogCategory.WEBSOCKET, 'Max reconnection attempts reached');
      this.emit('reconnection_failed');
    }
    
    this.isReconnecting = false;
  }
  
  /**
   * Attempt to reconnect to the WebSocket server
   */
  private async attemptReconnection(): Promise<void> {
    if (!this.server) {
      throw new Error('No server instance available for reconnection');
    }
    
    // Try to reconnect through the server
    if (this.server.io) {
      this.io = this.server.io;
      this.isConnected = true;
      this.metrics.connectTime = new Date();
      this.processQueuedMessages();
    } else {
      throw new Error('Server IO instance not available');
    }
  }
  
  /**
   * Calculate reconnection delay with exponential backoff and jitter
   */
  private calculateReconnectDelay(): number {
    const { initialDelay, maxDelay, backoffMultiplier, jitterRange } = this.reconnectionConfig;
    
    // Exponential backoff
    let delay = initialDelay * Math.pow(backoffMultiplier, this.reconnectAttempts - 1);
    
    // Cap at max delay
    delay = Math.min(delay, maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = delay * jitterRange * (Math.random() - 0.5) * 2;
    delay += jitter;
    
    return Math.max(delay, 0);
  }
  
  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: string, data: any): void {
    if (this.isConnected && this.server) {
      this.server.broadcast(event, data);
      this.metrics.messagesSent++;
    } else {
      this.queueMessage(event, data);
    }
  }
  
  /**
   * Broadcast with batching for high-frequency events
   */
  broadcastBatched(event: string, data: any): void {
    if (!this.eventBatch.has(event)) {
      this.eventBatch.set(event, []);
    }
    
    const batch = this.eventBatch.get(event)!;
    batch.push(data);
    
    // Flush if batch is full
    if (batch.length >= this.MAX_BATCH_SIZE) {
      this.flushBatch(event);
      return;
    }
    
    // Schedule batch flush
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushAllBatches();
      }, this.BATCH_INTERVAL);
    }
  }
  
  /**
   * Flush a specific event batch
   */
  private flushBatch(event: string): void {
    const batch = this.eventBatch.get(event);
    if (!batch || batch.length === 0) {
      return;
    }
    
    this.broadcast(`${event}:batch`, batch);
    this.eventBatch.delete(event);
  }
  
  /**
   * Flush all event batches
   */
  private flushAllBatches(): void {
    for (const [event, batch] of this.eventBatch) {
      if (batch.length > 0) {
        this.broadcast(`${event}:batch`, batch);
      }
    }
    
    this.eventBatch.clear();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }
  
  /**
   * Queue a message for later delivery
   */
  private queueMessage(event: string, data: any): void {
    // Prevent queue overflow
    if (this.messageQueue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest messages
      this.messageQueue.splice(0, this.messageQueue.length - this.MAX_QUEUE_SIZE + 1);
    }
    
    this.messageQueue.push({
      event,
      data,
      timestamp: Date.now(),
      retryCount: 0
    });
    
    this.metrics.messagesQueued++;
    
    logger.debug(LogCategory.WEBSOCKET, 
      `Message queued for offline delivery: ${event} (queue size: ${this.messageQueue.length})`
    );
  }
  
  /**
   * Process queued messages after reconnection
   */
  private processQueuedMessages(): void {
    if (this.messageQueue.length === 0) {
      return;
    }
    
    logger.info(LogCategory.WEBSOCKET, `Processing ${this.messageQueue.length} queued messages`);
    
    const now = Date.now();
    const validMessages = this.messageQueue.filter(
      msg => (now - msg.timestamp) < this.MESSAGE_TTL
    );
    
    for (const msg of validMessages) {
      this.broadcast(msg.event, msg.data);
    }
    
    this.messageQueue = [];
  }
  
  /**
   * Send to a specific room
   */
  broadcastToRoom(room: string, event: string, data: any): void {
    if (this.isConnected && this.io) {
      this.io.to(room).emit(event, data);
      this.metrics.messagesSent++;
    } else {
      this.queueMessage(event, { ...data, _room: room });
    }
  }
  
  /**
   * Send to a specific farm
   */
  broadcastToFarm(farmId: string, event: string, data: any): void {
    this.broadcastToRoom(`farm-${farmId}`, event, { ...data, farmId });
  }
  
  /**
   * Send to a specific user
   */
  sendToUser(userId: string, event: string, data: any): void {
    this.broadcastToRoom(`user-${userId}`, event, data);
  }
  
  /**
   * Get connection metrics
   */
  getMetrics(): ConnectionMetrics {
    if (this.metrics.connectTime) {
      this.metrics.uptime = Date.now() - this.metrics.connectTime.getTime();
    }
    return { ...this.metrics };
  }
  
  /**
   * Check connection status
   */
  isConnectionHealthy(): boolean {
    return this.isConnected && !this.isReconnecting;
  }
  
  /**
   * Force reconnection
   */
  async forceReconnect(): Promise<void> {
    logger.info(LogCategory.WEBSOCKET, 'Forcing reconnection');
    this.handleDisconnection();
  }
  
  /**
   * Update reconnection configuration
   */
  setReconnectionConfig(config: Partial<ReconnectionConfig>): void {
    this.reconnectionConfig = { ...this.reconnectionConfig, ...config };
  }
  
  /**
   * Setup metrics tracking
   */
  private setupMetricsTracking(): void {
    setInterval(() => {
      if (this.metrics.connectTime) {
        this.metrics.uptime = Date.now() - this.metrics.connectTime.getTime();
      }
      
      // Emit metrics for monitoring
      this.emit('metrics', this.getMetrics());
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.flushAllBatches();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.WEBSOCKET, 'Shutting down enhanced WebSocket manager');
    
    this.cleanup();
    this.isConnected = false;
    this.server = null;
    this.io = null;
    
    this.emit('shutdown');
  }
}

// Export singleton instance
export const enhancedWebSocketManager = EnhancedWebSocketManager.getInstance();