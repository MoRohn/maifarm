import { Socket } from 'socket.io-client';
import { EventEmitter } from 'events';

export enum MessagePriority {
  CRITICAL = 3,  // System alerts, errors
  HIGH = 2,      // Agent state changes, important updates
  MEDIUM = 1,    // Terminal output, regular updates
  LOW = 0        // Metrics, periodic updates
}

interface QueuedMessage {
  event: string;
  data: any;
  priority: MessagePriority;
  timestamp: number;
  retries?: number;
  id: string;
}

interface Subscription {
  id: string;
  event: string;
  callback: Function;
  filter?: (data: any) => boolean;
}

interface BatchConfig {
  maxBatchSize: number;
  batchInterval: number;
  compressionThreshold: number;
}

export class EnhancedWebSocketService extends EventEmitter {
  private socket: Socket | null = null;
  private messageQueue: Map<string, QueuedMessage[]> = new Map();
  private subscriptions: Map<string, Set<Subscription>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private isReconnecting = false;
  private batchTimer: NodeJS.Timeout | null = null;
  private messageBuffer: QueuedMessage[] = [];
  private compressionEnabled = true;
  private messageStats = new Map<string, number>();
  private lastMessageTime = new Map<string, number>();
  
  private batchConfig: BatchConfig = {
    maxBatchSize: 50,
    batchInterval: 100, // ms
    compressionThreshold: 1024 // bytes
  };

  constructor(socket?: Socket) {
    super();
    if (socket) {
      this.attachSocket(socket);
    }
  }

  attachSocket(socket: Socket) {
    this.socket = socket;
    this.setupSocketHandlers();
    this.setupReconnection();
  }

  private setupSocketHandlers() {
    if (!this.socket) return;

    // Handle disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('[EnhancedWebSocket] Disconnected:', reason);
      this.handleDisconnection(reason);
    });

    // Handle reconnection
    this.socket.on('connect', () => {
      console.log('[EnhancedWebSocket] Connected');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.flushMessageQueue();
      this.emit('connected');
    });

    // Handle errors
    this.socket.on('error', (error) => {
      console.error('[EnhancedWebSocket] Error:', error);
      this.emit('error', error);
    });

    // Setup message interception for stats
    const originalEmit = this.socket.emit.bind(this.socket);
    this.socket.emit = (event: string, ...args: any[]) => {
      this.trackMessageStats(event);
      return originalEmit(event, ...args);
    };
  }

  private setupReconnection() {
    if (!this.socket) return;

    this.socket.io.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[EnhancedWebSocket] Reconnection attempt ${attemptNumber}`);
      this.reconnectAttempts = attemptNumber;
    });

    this.socket.io.on('reconnect_failed', () => {
      console.error('[EnhancedWebSocket] Reconnection failed after maximum attempts');
      this.emit('reconnect_failed');
      // Attempt manual reconnection with exponential backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnection();
      } else {
        console.error('[EnhancedWebSocket] Maximum reconnection attempts reached');
        this.emit('max_reconnect_attempts_reached');
      }
    });

    this.socket.io.on('reconnect', (attemptNumber) => {
      console.log(`[EnhancedWebSocket] Reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = 0;
      this.flushMessageQueue();
    });
  }

  private handleDisconnection(reason: string) {
    if (reason === 'io server disconnect') {
      // Server initiated disconnect, attempt reconnection
      this.attemptReconnection();
    }
    this.emit('disconnected', reason);
  }

  private attemptReconnection() {
    if (this.isReconnecting || !this.socket) return;
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[EnhancedWebSocket] Maximum reconnection attempts reached, stopping reconnection');
      this.emit('max_reconnect_attempts_reached');
      return;
    }
    
    this.isReconnecting = true;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`[EnhancedWebSocket] Attempting reconnection ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        this.reconnectAttempts++;
        this.socket.connect();
        
        // Set a timeout for this connection attempt
        const connectTimeout = setTimeout(() => {
          if (!this.socket?.connected) {
            console.warn('[EnhancedWebSocket] Connection attempt timed out');
            this.isReconnecting = false;
            this.attemptReconnection(); // Try again
          }
        }, 10000); // 10 second timeout for connection attempt
        
        // Clear timeout if connection succeeds
        this.socket.once('connect', () => {
          clearTimeout(connectTimeout);
          this.isReconnecting = false;
        });
      } else {
        this.isReconnecting = false;
      }
    }, delay);
  }

  // Pub/Sub pattern implementation
  subscribe(event: string, callback: Function, filter?: (data: any) => boolean): string {
    const subscriptionId = this.generateId();
    const subscription: Subscription = {
      id: subscriptionId,
      event,
      callback,
      filter
    };

    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
      
      // Setup socket listener for this event
      if (this.socket) {
        this.socket.on(event, (data) => this.handleEvent(event, data));
      }
    }

    this.subscriptions.get(event)!.add(subscription);
    return subscriptionId;
  }

  unsubscribe(subscriptionId: string) {
    for (const [event, subs] of this.subscriptions.entries()) {
      for (const sub of subs) {
        if (sub.id === subscriptionId) {
          subs.delete(sub);
          
          // Remove socket listener if no more subscriptions
          if (subs.size === 0 && this.socket) {
            this.socket.off(event);
            this.subscriptions.delete(event);
          }
          return true;
        }
      }
    }
    return false;
  }

  private handleEvent(event: string, data: any) {
    const subscriptions = this.subscriptions.get(event);
    if (!subscriptions) return;

    for (const sub of subscriptions) {
      if (!sub.filter || sub.filter(data)) {
        try {
          sub.callback(data);
        } catch (error) {
          console.error(`[EnhancedWebSocket] Error in subscription callback for ${event}:`, error);
        }
      }
    }

    // Track event for analytics
    this.emit('event_received', { event, data, timestamp: Date.now() });
  }

  // Message batching
  batchMessages(messages: Array<{ event: string; data: any; priority?: MessagePriority }>) {
    messages.forEach(msg => {
      const queuedMessage: QueuedMessage = {
        id: this.generateId(),
        event: msg.event,
        data: msg.data,
        priority: msg.priority || MessagePriority.MEDIUM,
        timestamp: Date.now()
      };
      
      this.messageBuffer.push(queuedMessage);
    });

    this.scheduleBatchSend();
  }

  private scheduleBatchSend() {
    if (this.batchTimer) return;

    this.batchTimer = setTimeout(() => {
      this.sendBatch();
      this.batchTimer = null;
    }, this.batchConfig.batchInterval);
  }

  private sendBatch() {
    if (this.messageBuffer.length === 0) return;

    // Sort by priority
    this.messageBuffer.sort((a, b) => b.priority - a.priority);

    // Take up to maxBatchSize messages
    const batch = this.messageBuffer.splice(0, this.batchConfig.maxBatchSize);

    if (this.socket?.connected) {
      // Compress if needed
      const payload = this.compressionEnabled ? this.compressPayload(batch) : batch;
      
      this.socket.emit('batch_messages', {
        messages: payload,
        compressed: this.compressionEnabled && this.shouldCompress(batch),
        timestamp: Date.now()
      });

      // Track stats
      batch.forEach(msg => this.trackMessageStats(msg.event));
    } else {
      // Add to queue if disconnected
      batch.forEach(msg => this.queueMessage(msg));
    }

    // Continue sending if more messages
    if (this.messageBuffer.length > 0) {
      this.scheduleBatchSend();
    }
  }

  // Message prioritization and queuing
  queueMessage(message: QueuedMessage) {
    const priority = message.priority;
    
    if (!this.messageQueue.has(priority.toString())) {
      this.messageQueue.set(priority.toString(), []);
    }
    
    this.messageQueue.get(priority.toString())!.push(message);
    
    // Keep queue size limited
    this.trimQueue(priority.toString());
  }

  private trimQueue(priority: string) {
    const queue = this.messageQueue.get(priority);
    if (!queue) return;

    const maxQueueSize = 100;
    if (queue.length > maxQueueSize) {
      // Keep newest messages
      this.messageQueue.set(priority, queue.slice(-maxQueueSize));
    }
  }

  private flushMessageQueue() {
    if (!this.socket?.connected) return;

    // Process queues by priority
    const priorities = [
      MessagePriority.CRITICAL,
      MessagePriority.HIGH,
      MessagePriority.MEDIUM,
      MessagePriority.LOW
    ];

    for (const priority of priorities) {
      const queue = this.messageQueue.get(priority.toString());
      if (queue && queue.length > 0) {
        queue.forEach(msg => {
          this.socket!.emit(msg.event, msg.data);
        });
        this.messageQueue.delete(priority.toString());
      }
    }
  }

  // Compression for large payloads
  private compressPayload(data: any): any {
    const jsonStr = JSON.stringify(data);
    
    if (jsonStr.length < this.batchConfig.compressionThreshold) {
      return data;
    }

    // Simple compression using base64 encoding (in production, use proper compression)
    // For demo purposes, we'll just return the data as-is
    // In production, you'd use a library like pako for actual compression
    return data;
  }

  private shouldCompress(data: any): boolean {
    const size = JSON.stringify(data).length;
    return size >= this.batchConfig.compressionThreshold;
  }

  // Analytics and monitoring
  private trackMessageStats(event: string) {
    const count = this.messageStats.get(event) || 0;
    this.messageStats.set(event, count + 1);
    this.lastMessageTime.set(event, Date.now());

    // Emit stats periodically
    this.emit('stats_update', {
      event,
      count: count + 1,
      lastTime: Date.now()
    });
  }

  getMessageStats(): Map<string, { count: number; lastTime: number }> {
    const stats = new Map();
    
    for (const [event, count] of this.messageStats.entries()) {
      stats.set(event, {
        count,
        lastTime: this.lastMessageTime.get(event) || 0
      });
    }
    
    return stats;
  }

  // Rate limiting
  private rateLimitMap = new Map<string, number[]>();
  
  isRateLimited(event: string, maxPerMinute: number = 60): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    if (!this.rateLimitMap.has(event)) {
      this.rateLimitMap.set(event, []);
    }
    
    const timestamps = this.rateLimitMap.get(event)!;
    
    // Remove old timestamps
    const validTimestamps = timestamps.filter(t => t > windowStart);
    this.rateLimitMap.set(event, validTimestamps);
    
    if (validTimestamps.length >= maxPerMinute) {
      return true;
    }
    
    validTimestamps.push(now);
    return false;
  }

  // Send with priority
  sendWithPriority(event: string, data: any, priority: MessagePriority = MessagePriority.MEDIUM) {
    if (this.isRateLimited(event)) {
      console.warn(`[EnhancedWebSocket] Rate limited: ${event}`);
      return false;
    }

    const message: QueuedMessage = {
      id: this.generateId(),
      event,
      data,
      priority,
      timestamp: Date.now()
    };

    if (this.socket?.connected) {
      this.socket.emit(event, data);
      this.trackMessageStats(event);
      return true;
    } else {
      this.queueMessage(message);
      return false;
    }
  }

  // Utility
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Configuration
  setBatchConfig(config: Partial<BatchConfig>) {
    this.batchConfig = { ...this.batchConfig, ...config };
  }

  enableCompression(enabled: boolean) {
    this.compressionEnabled = enabled;
  }

  // Cleanup
  destroy() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    
    this.subscriptions.clear();
    this.messageQueue.clear();
    this.messageBuffer = [];
    this.removeAllListeners();
  }

  // Status
  getStatus() {
    return {
      connected: this.socket?.connected || false,
      reconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: Array.from(this.messageQueue.values()).flat().length,
      bufferedMessages: this.messageBuffer.length,
      subscriptions: this.subscriptions.size,
      stats: Object.fromEntries(this.messageStats)
    };
  }
}