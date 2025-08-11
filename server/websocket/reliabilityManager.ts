/**
 * WebSocket Reliability Manager
 * Centralizes reliability features including health monitoring, message queuing, and fallback mechanisms
 */

import { Socket } from 'socket.io';
import { SocketIOServer } from 'socket.io';
import { WebSocketHealthMonitor, ClientHealth } from './healthMonitor';
import { WebSocketMessageQueue, QueuedMessage } from './messageQueue';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';

export interface ReliabilityConfig {
  enableHealthMonitoring?: boolean;
  enableMessageQueue?: boolean;
  enableCompression?: boolean;
  enableMetrics?: boolean;
  maxQueueSize?: number;
  messageTTL?: number;
  requireAcknowledgments?: boolean;
  fallbackToPolling?: boolean;
}

export interface MessageOptions {
  requireAck?: boolean;
  priority?: 'high' | 'normal' | 'low';
  ttl?: number;
  retryOnFail?: boolean;
  maxRetries?: number;
}

export class WebSocketReliabilityManager extends EventEmitter {
  private io: SocketIOServer | null = null;
  private healthMonitor: WebSocketHealthMonitor | null = null;
  private messageQueue: WebSocketMessageQueue | null = null;
  private config: Required<ReliabilityConfig>;
  private redis: Redis | null = null;
  private clientConnectionMap: Map<string, string> = new Map(); // socketId -> userId mapping
  private acknowledgmentCallbacks: Map<string, (success: boolean) => void> = new Map();
  private metricsInterval: NodeJS.Timeout | null = null;
  
  // Conflict detection and coordination state tracking
  private coordinationState: Map<string, any> = new Map();
  private broadcastQueue: Array<{event: string, data: any, timestamp: number}> = [];
  private lastCoordinationUpdate = 0;
  private conflictDetectionEnabled = true;
  private coordinationHealthInterval: NodeJS.Timeout | null = null;

  constructor(config: ReliabilityConfig = {}) {
    super();
    
    this.config = {
      enableHealthMonitoring: true,
      enableMessageQueue: true,
      enableCompression: true,
      enableMetrics: true,
      maxQueueSize: 1000,
      messageTTL: 3600, // 1 hour
      requireAcknowledgments: false,
      fallbackToPolling: true,
      ...config
    };
  }

  /**
   * Initialize the reliability manager with Socket.IO server
   */
  public initialize(io: SocketIOServer, redis?: Redis) {
    this.io = io;
    this.redis = redis || null;

    // Initialize health monitor
    if (this.config.enableHealthMonitoring) {
      this.healthMonitor = new WebSocketHealthMonitor(io);
      this.setupHealthMonitorListeners();
    }

    // Initialize message queue
    if (this.config.enableMessageQueue) {
      this.messageQueue = new WebSocketMessageQueue(this.redis);
      this.setupMessageQueueListeners();
      
      // Load persisted messages if Redis is available
      if (this.redis) {
        this.messageQueue.loadPersistedMessages().catch(err => {
          console.error('[ReliabilityManager] Failed to load persisted messages:', err);
        });
      }
    }

    // Start metrics reporting
    if (this.config.enableMetrics) {
      this.startMetricsReporting();
    }

    // Start coordination health monitoring
    this.startCoordinationHealthMonitoring();

    console.log('[ReliabilityManager] Initialized with config:', this.config);
  }

  /**
   * Send a reliable message with optional acknowledgment
   */
  public sendReliableMessage(
    socket: Socket | string,
    event: string,
    data: any,
    options: MessageOptions = {}
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socketId = typeof socket === 'string' ? socket : socket.id;
      const messageId = this.generateMessageId();
      
      // Prepare message with metadata
      const message = {
        id: messageId,
        event,
        data,
        timestamp: new Date(),
        requiresAck: options.requireAck || this.config.requireAcknowledgments
      };

      // Get actual socket
      const actualSocket = typeof socket === 'string' 
        ? this.io?.sockets.sockets.get(socket)
        : socket;

      if (actualSocket?.connected) {
        // Socket is connected, send immediately
        actualSocket.emit(event, message);
        
        // Track message for acknowledgment if required
        if (message.requiresAck) {
          const timeout = setTimeout(() => {
            this.acknowledgmentCallbacks.delete(messageId);
            
            // Message not acknowledged, queue it
            if (this.messageQueue && options.retryOnFail !== false) {
              const clientId = this.getClientId(socketId);
              this.messageQueue.queueMessage(clientId, event, data, {
                ...options,
                id: messageId,
                attempts: 1
              });
            }
            
            resolve(false);
          }, 30000); // 30 second timeout

          this.acknowledgmentCallbacks.set(messageId, (success) => {
            clearTimeout(timeout);
            resolve(success);
          });
        } else {
          resolve(true);
        }
        
        // Track message sent
        if (this.healthMonitor) {
          this.healthMonitor.trackMessage(socketId, 'sent');
        }
      } else {
        // Socket not connected, queue message
        if (this.messageQueue) {
          const clientId = this.getClientId(socketId);
          this.messageQueue.queueMessage(clientId, event, data, {
            ...options,
            id: messageId
          });
          resolve(true); // Queued successfully
        } else {
          resolve(false); // No queue available
        }
      }
    });
  }

  /**
   * Broadcast a reliable message to multiple clients
   */
  public async broadcastReliable(
    room: string | string[],
    event: string,
    data: any,
    options: MessageOptions = {}
  ): Promise<number> {
    if (!this.io) return 0;

    const rooms = Array.isArray(room) ? room : [room];
    let successCount = 0;

    for (const r of rooms) {
      const sockets = await this.io.in(r).fetchSockets();
      
      for (const socket of sockets) {
        const success = await this.sendReliableMessage(
          socket.id,
          event,
          data,
          options
        );
        if (success) successCount++;
      }
    }

    return successCount;
  }

  /**
   * Initialize health tracking for a new connection
   */
  public initializeHealth(socketId: string, userId?: string) {
    if (userId) {
      this.clientConnectionMap.set(socketId, userId);
    }
    
    if (this.healthMonitor && this.io) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        this.healthMonitor.trackConnection(socket, userId);
      }
    }
  }

  /**
   * Update connection health metrics
   */
  public updateConnectionHealth(socketId: string, health: Partial<ClientHealth>) {
    const existingHealth = this.healthMonitor?.getClientHealth(socketId);
    if (!existingHealth) return;

    // Merge health updates
    const updatedHealth = { ...existingHealth, ...health };
    
    // If reconnecting, track it
    if (health.reconnectCount && health.reconnectCount > existingHealth.reconnectCount) {
      this.healthMonitor?.trackReconnection(socketId);
    }
  }

  /**
   * Clean up connection data
   */
  public cleanupConnection(socketId: string) {
    const clientId = this.getClientId(socketId);
    
    // Clear queued messages if configured
    if (this.messageQueue && !this.config.requireAcknowledgments) {
      this.messageQueue.clearClientQueue(clientId);
    }
    
    // Remove from connection map
    this.clientConnectionMap.delete(socketId);
    
    // Track disconnection
    if (this.healthMonitor) {
      this.healthMonitor.trackDisconnection(socketId);
    }
  }

  /**
   * Resend queued messages for a reconnected client
   */
  public resendQueuedMessages(socket: Socket) {
    if (!this.messageQueue) return;

    const clientId = this.getClientId(socket.id);
    const messages = this.messageQueue.getQueuedMessages(clientId, 100); // Get up to 100 messages
    
    if (messages.length > 0) {
      console.log(`[ReliabilityManager] Resending ${messages.length} queued messages to ${socket.id}`);
      
      // Send messages with slight delay between each
      messages.forEach((msg, index) => {
        setTimeout(() => {
          socket.emit(msg.event, {
            id: msg.id,
            data: msg.data,
            timestamp: msg.timestamp,
            requiresAck: msg.requiresAck,
            queued: true
          });
        }, index * 50); // 50ms between messages
      });
    }
  }

  /**
   * Acknowledge a message
   */
  public acknowledgeMessage(messageId: string): boolean {
    // Check if we have a callback waiting
    const callback = this.acknowledgmentCallbacks.get(messageId);
    if (callback) {
      callback(true);
      this.acknowledgmentCallbacks.delete(messageId);
      return true;
    }
    
    // Also acknowledge in queue
    if (this.messageQueue) {
      return this.messageQueue.acknowledgeMessage(messageId);
    }
    
    return false;
  }

  /**
   * Get reliability metrics
   */
  public getMetrics() {
    const healthSummary = this.healthMonitor?.getHealthSummary();
    const queueStats = this.messageQueue?.getStats();
    
    return {
      health: healthSummary,
      queue: queueStats,
      connections: {
        total: this.clientConnectionMap.size,
        active: healthSummary?.activeClients || 0,
        healthy: healthSummary?.healthyClients || 0
      },
      performance: {
        averageLatency: healthSummary?.metrics.averageLatency || 0,
        connectionUptime: healthSummary?.metrics.connectionUptime || 100,
        errorRate: healthSummary?.errorRate || 0
      }
    };
  }

  /**
   * Setup health monitor listeners
   */
  private setupHealthMonitorListeners() {
    if (!this.healthMonitor) return;

    this.healthMonitor.on('client:timeout', (data) => {
      console.warn(`[ReliabilityManager] Client timeout: ${data.socketId}`);
      this.emit('client:timeout', data);
    });

    this.healthMonitor.on('health:warning', (data) => {
      console.warn('[ReliabilityManager] Health warning:', data);
      this.emit('health:warning', data);
      
      // Broadcast warning to monitoring systems
      if (this.io) {
        this.io.to('monitoring').emit('system:health:warning', data);
      }
    });

    this.healthMonitor.on('health:critical', (data) => {
      console.error('[ReliabilityManager] Health critical:', data);
      this.emit('health:critical', data);
      
      // Broadcast critical alert
      if (this.io) {
        this.io.to('monitoring').emit('system:health:critical', data);
      }
    });

    this.healthMonitor.on('metrics:update', (metrics) => {
      this.emit('metrics:health', metrics);
    });
  }

  /**
   * Setup message queue listeners
   */
  private setupMessageQueueListeners() {
    if (!this.messageQueue) return;

    this.messageQueue.on('message:queued', (data) => {
      this.emit('message:queued', data);
    });

    this.messageQueue.on('message:expired', (data) => {
      console.warn(`[ReliabilityManager] Message expired: ${data.messageId}`);
      this.emit('message:expired', data);
    });

    this.messageQueue.on('message:failed', (data) => {
      console.error(`[ReliabilityManager] Message delivery failed: ${data.messageId}`);
      this.emit('message:failed', data);
      
      // Notify the client if possible
      const socket = this.findSocketByClientId(data.clientId);
      if (socket) {
        socket.emit('message:delivery:failed', {
          messageId: data.messageId,
          reason: data.reason || 'max_attempts_reached'
        });
      }
    });

    this.messageQueue.on('queue:pruned', (data) => {
      console.warn(`[ReliabilityManager] Queue pruned for ${data.clientId}: ${data.removed} messages removed`);
      this.emit('queue:pruned', data);
    });
  }

  /**
   * Start metrics reporting
   */
  private startMetricsReporting() {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getMetrics();
      this.emit('metrics:update', metrics);
      
      // Broadcast metrics to monitoring room
      if (this.io) {
        this.io.to('monitoring').emit('reliability:metrics', metrics);
      }
    }, 10000); // Report every 10 seconds
  }

  /**
   * Helper to get client ID (user ID or socket ID)
   */
  private getClientId(socketId: string): string {
    return this.clientConnectionMap.get(socketId) || socketId;
  }

  /**
   * Helper to find socket by client ID
   */
  private findSocketByClientId(clientId: string): Socket | undefined {
    if (!this.io) return undefined;

    // First check if clientId is a socket ID
    const directSocket = this.io.sockets.sockets.get(clientId);
    if (directSocket) return directSocket;

    // Otherwise, look for socket by user ID
    for (const [socketId, userId] of this.clientConnectionMap) {
      if (userId === clientId) {
        return this.io.sockets.sockets.get(socketId);
      }
    }

    return undefined;
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Enhanced broadcast with conflict detection
   */
  public async broadcastWithConflictDetection(
    room: string | string[],
    event: string,
    data: any,
    options: MessageOptions = {}
  ): Promise<{successCount: number, conflictsDetected: boolean}> {
    // Check for coordination conflicts before broadcasting
    const conflictDetected = this.detectCoordinationConflict(event, data);
    
    if (conflictDetected && this.conflictDetectionEnabled) {
      console.warn(`[ReliabilityManager] Coordination conflict detected for event ${event}, queuing...`);
      
      // Queue the broadcast instead of sending immediately
      this.queueBroadcast(event, data);
      
      return { successCount: 0, conflictsDetected: true };
    }

    // Update coordination state before broadcast
    this.updateCoordinationState(event, data);
    
    // Proceed with normal broadcast
    const successCount = await this.broadcastReliable(room, event, data, options);
    
    return { successCount, conflictsDetected: false };
  }

  /**
   * Detect coordination conflicts based on event patterns
   */
  private detectCoordinationConflict(event: string, data: any): boolean {
    if (!this.conflictDetectionEnabled) return false;

    const now = Date.now();
    const conflictWindow = 1000; // 1 second window for conflict detection

    // Check for rapid farm state updates (potential race condition)
    if (event === 'farm:updated' || event === 'agents:updated') {
      const lastUpdate = this.coordinationState.get(`${event}:timestamp`);
      if (lastUpdate && (now - lastUpdate) < conflictWindow) {
        return true; // Rapid updates detected
      }
    }

    // Check for conflicting agent status updates
    if (event === 'agent:status' && data?.agentId) {
      const agentKey = `agent:${data.agentId}`;
      const lastStatus = this.coordinationState.get(`${agentKey}:status`);
      const lastTimestamp = this.coordinationState.get(`${agentKey}:timestamp`);
      
      if (lastTimestamp && (now - lastTimestamp) < conflictWindow) {
        // Check if status is conflicting (e.g., both 'working' and 'idle')
        if (lastStatus && lastStatus !== data.status) {
          console.warn(`[ReliabilityManager] Agent ${data.agentId} status conflict: ${lastStatus} vs ${data.status}`);
          return true;
        }
      }
    }

    // Check for coordination file update conflicts
    if (event === 'coordination:agents' || event === 'coordination:claims') {
      const lastCoordUpdate = this.coordinationState.get('coordination:timestamp');
      if (lastCoordUpdate && (now - lastCoordUpdate) < conflictWindow * 2) { // Longer window for coordination
        return true;
      }
    }

    // Check for tmux session conflicts
    if (event.includes('session') && data?.sessionName) {
      const sessionKey = `session:${data.sessionName}`;
      const lastSessionUpdate = this.coordinationState.get(`${sessionKey}:timestamp`);
      
      if (lastSessionUpdate && (now - lastSessionUpdate) < conflictWindow * 3) { // Even longer for sessions
        return true;
      }
    }

    return false;
  }

  /**
   * Update coordination state tracking
   */
  private updateCoordinationState(event: string, data: any): void {
    const now = Date.now();
    this.lastCoordinationUpdate = now;

    // Track event timestamps
    this.coordinationState.set(`${event}:timestamp`, now);

    // Track specific data points for conflict detection
    if (event === 'agent:status' && data?.agentId) {
      this.coordinationState.set(`agent:${data.agentId}:status`, data.status);
      this.coordinationState.set(`agent:${data.agentId}:timestamp`, now);
    }

    if (event === 'farm:updated' && data?.farmId) {
      this.coordinationState.set(`farm:${data.farmId}:status`, data.status);
      this.coordinationState.set(`farm:${data.farmId}:timestamp`, now);
    }

    if (event.includes('session') && data?.sessionName) {
      this.coordinationState.set(`session:${data.sessionName}:timestamp`, now);
    }

    if (event.includes('coordination')) {
      this.coordinationState.set('coordination:timestamp', now);
    }

    // Clean up old entries (older than 5 minutes)
    const cleanupThreshold = now - 300000;
    for (const [key, timestamp] of this.coordinationState.entries()) {
      if (key.endsWith(':timestamp') && timestamp < cleanupThreshold) {
        const baseKey = key.replace(':timestamp', '');
        this.coordinationState.delete(key);
        this.coordinationState.delete(`${baseKey}:status`);
      }
    }
  }

  /**
   * Queue broadcast for later when conflicts are resolved
   */
  private queueBroadcast(event: string, data: any): void {
    this.broadcastQueue.push({
      event,
      data,
      timestamp: Date.now()
    });

    // Limit queue size
    if (this.broadcastQueue.length > 100) {
      this.broadcastQueue.shift(); // Remove oldest
    }

    // Emit conflict event
    this.emit('coordination:conflict', {
      event,
      data,
      queueSize: this.broadcastQueue.length,
      timestamp: new Date()
    });
  }

  /**
   * Process queued broadcasts when conflicts are resolved
   */
  private async processQueuedBroadcasts(): Promise<void> {
    const now = Date.now();
    const processedBroadcasts: any[] = [];

    // Process broadcasts older than 2 seconds (conflicts should be resolved)
    for (let i = this.broadcastQueue.length - 1; i >= 0; i--) {
      const broadcast = this.broadcastQueue[i];
      
      if (now - broadcast.timestamp > 2000) {
        // Check if conflict is resolved
        if (!this.detectCoordinationConflict(broadcast.event, broadcast.data)) {
          try {
            // Process the queued broadcast
            await this.broadcastReliable('', broadcast.event, broadcast.data);
            processedBroadcasts.push(broadcast);
            this.broadcastQueue.splice(i, 1);
            
            console.log(`[ReliabilityManager] Processed queued broadcast: ${broadcast.event}`);
          } catch (error) {
            console.error(`[ReliabilityManager] Failed to process queued broadcast:`, error);
          }
        }
      }
    }

    if (processedBroadcasts.length > 0) {
      this.emit('coordination:queue:processed', {
        count: processedBroadcasts.length,
        remaining: this.broadcastQueue.length,
        timestamp: new Date()
      });
    }
  }

  /**
   * Start coordination health monitoring
   */
  private startCoordinationHealthMonitoring(): void {
    this.coordinationHealthInterval = setInterval(async () => {
      try {
        // Process queued broadcasts
        await this.processQueuedBroadcasts();

        // Check for stale coordination state
        const now = Date.now();
        const staleThreshold = 60000; // 1 minute

        if (this.lastCoordinationUpdate > 0 && 
            (now - this.lastCoordinationUpdate) > staleThreshold) {
          
          this.emit('coordination:stale', {
            lastUpdate: this.lastCoordinationUpdate,
            timeSince: now - this.lastCoordinationUpdate,
            timestamp: new Date()
          });
        }

        // Emit queue status if there are pending broadcasts
        if (this.broadcastQueue.length > 0) {
          this.emit('coordination:queue:status', {
            queueSize: this.broadcastQueue.length,
            oldestBroadcast: this.broadcastQueue[0]?.timestamp,
            timestamp: new Date()
          });
        }

      } catch (error) {
        console.error('[ReliabilityManager] Coordination health monitoring error:', error);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Get coordination state for debugging
   */
  public getCoordinationState(): {
    stateSize: number;
    queueSize: number;
    lastUpdate: number;
    conflictDetectionEnabled: boolean;
    recentEvents: string[];
  } {
    const recentEvents: string[] = [];
    const now = Date.now();
    
    for (const [key, timestamp] of this.coordinationState.entries()) {
      if (key.endsWith(':timestamp') && (now - timestamp) < 30000) { // Last 30 seconds
        recentEvents.push(key.replace(':timestamp', ''));
      }
    }

    return {
      stateSize: this.coordinationState.size,
      queueSize: this.broadcastQueue.length,
      lastUpdate: this.lastCoordinationUpdate,
      conflictDetectionEnabled: this.conflictDetectionEnabled,
      recentEvents
    };
  }

  /**
   * Enable/disable conflict detection
   */
  public setConflictDetection(enabled: boolean): void {
    this.conflictDetectionEnabled = enabled;
    console.log(`[ReliabilityManager] Conflict detection ${enabled ? 'enabled' : 'disabled'}`);
    
    if (!enabled) {
      // Process all queued broadcasts immediately
      this.processQueuedBroadcasts();
    }
  }

  /**
   * Force process all queued broadcasts (emergency)
   */
  public async flushBroadcastQueue(): Promise<number> {
    const processed = this.broadcastQueue.length;
    
    for (const broadcast of this.broadcastQueue) {
      try {
        await this.broadcastReliable('', broadcast.event, broadcast.data);
      } catch (error) {
        console.error(`[ReliabilityManager] Failed to flush broadcast:`, error);
      }
    }
    
    this.broadcastQueue.length = 0;
    console.log(`[ReliabilityManager] Flushed ${processed} queued broadcasts`);
    
    return processed;
  }

  /**
   * Enhanced metrics including coordination health
   */
  public getEnhancedMetrics() {
    const baseMetrics = this.getMetrics();
    const coordinationState = this.getCoordinationState();
    
    return {
      ...baseMetrics,
      coordination: {
        stateSize: coordinationState.stateSize,
        queueSize: coordinationState.queueSize,
        lastUpdate: coordinationState.lastUpdate,
        conflictDetectionEnabled: coordinationState.conflictDetectionEnabled,
        recentEvents: coordinationState.recentEvents,
        conflictsDetectedLastHour: 0, // Would need to track this
        averageQueueTime: 0 // Would need to track this
      }
    };
  }

  /**
   * Stop the reliability manager
   */
  public stop() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (this.coordinationHealthInterval) {
      clearInterval(this.coordinationHealthInterval);
      this.coordinationHealthInterval = null;
    }

    if (this.healthMonitor) {
      this.healthMonitor.stop();
      this.healthMonitor = null;
    }

    if (this.messageQueue) {
      this.messageQueue.stop();
      this.messageQueue = null;
    }

    // Flush any remaining broadcasts
    if (this.broadcastQueue.length > 0) {
      console.warn(`[ReliabilityManager] Stopping with ${this.broadcastQueue.length} queued broadcasts`);
    }

    this.acknowledgmentCallbacks.clear();
    this.clientConnectionMap.clear();
    this.coordinationState.clear();
    this.broadcastQueue.length = 0;
    this.removeAllListeners();
    
    console.log('[ReliabilityManager] Stopped');
  }
}

// Export singleton instance
export const reliabilityManager = new WebSocketReliabilityManager();