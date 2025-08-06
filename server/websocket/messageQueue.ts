/**
 * WebSocket Message Queue
 * Handles message queuing for offline clients and guaranteed delivery
 */

import { EventEmitter } from 'events';
import { Redis } from 'ioredis';

export interface QueuedMessage {
  id: string;
  clientId: string;
  event: string;
  data: any;
  timestamp: Date;
  attempts: number;
  maxAttempts: number;
  priority: 'high' | 'normal' | 'low';
  ttl?: number; // Time to live in seconds
  requiresAck?: boolean;
  metadata?: Record<string, any>;
}

export interface QueueStats {
  totalMessages: number;
  pendingMessages: number;
  deliveredMessages: number;
  failedMessages: number;
  averageDeliveryTime: number;
  queueSizeByPriority: {
    high: number;
    normal: number;
    low: number;
  };
}

export class WebSocketMessageQueue extends EventEmitter {
  private messageQueues: Map<string, QueuedMessage[]> = new Map();
  private pendingAcks: Map<string, QueuedMessage> = new Map();
  private deliveryStats: Map<string, number> = new Map();
  private redis: Redis | null = null;
  private processInterval: NodeJS.Timeout | null = null;
  
  // Configuration
  private readonly MAX_QUEUE_SIZE = 1000;
  private readonly MAX_MESSAGE_AGE = 3600000; // 1 hour
  private readonly DEFAULT_MAX_ATTEMPTS = 3;
  private readonly PROCESS_INTERVAL = 1000; // 1 second
  private readonly ACK_TIMEOUT = 30000; // 30 seconds

  constructor(redisClient?: Redis) {
    super();
    this.redis = redisClient || null;
    this.startProcessing();
  }

  /**
   * Queue a message for a client
   */
  public queueMessage(
    clientId: string,
    event: string,
    data: any,
    options: Partial<QueuedMessage> = {}
  ): string {
    const messageId = this.generateMessageId();
    
    const message: QueuedMessage = {
      id: messageId,
      clientId,
      event,
      data,
      timestamp: new Date(),
      attempts: 0,
      maxAttempts: options.maxAttempts || this.DEFAULT_MAX_ATTEMPTS,
      priority: options.priority || 'normal',
      ttl: options.ttl,
      requiresAck: options.requiresAck || false,
      metadata: options.metadata
    };

    // Get or create client queue
    if (!this.messageQueues.has(clientId)) {
      this.messageQueues.set(clientId, []);
    }

    const queue = this.messageQueues.get(clientId)!;
    
    // Check queue size limit
    if (queue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest low-priority messages
      const removed = this.pruneQueue(queue);
      if (removed > 0) {
        this.emit('queue:pruned', { clientId, removed });
      }
    }

    // Insert message based on priority
    this.insertByPriority(queue, message);
    
    // Persist to Redis if available
    if (this.redis) {
      this.persistMessage(message);
    }

    this.emit('message:queued', { messageId, clientId, event });
    
    return messageId;
  }

  /**
   * Get queued messages for a client
   */
  public getQueuedMessages(clientId: string, limit?: number): QueuedMessage[] {
    const queue = this.messageQueues.get(clientId) || [];
    const messages = limit ? queue.slice(0, limit) : [...queue];
    
    // Mark messages as being delivered
    messages.forEach(msg => {
      msg.attempts++;
      if (msg.requiresAck) {
        this.pendingAcks.set(msg.id, msg);
        this.scheduleAckTimeout(msg);
      }
    });

    return messages;
  }

  /**
   * Acknowledge message delivery
   */
  public acknowledgeMessage(messageId: string): boolean {
    const message = this.pendingAcks.get(messageId);
    if (!message) {
      return false;
    }

    this.pendingAcks.delete(messageId);
    
    // Remove from client queue
    const queue = this.messageQueues.get(message.clientId);
    if (queue) {
      const index = queue.findIndex(m => m.id === messageId);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }

    // Update delivery stats
    const deliveryTime = Date.now() - message.timestamp.getTime();
    this.updateDeliveryStats(message.clientId, deliveryTime);
    
    // Remove from Redis if persisted
    if (this.redis) {
      this.removePersistedMessage(messageId);
    }

    this.emit('message:acknowledged', { messageId, clientId: message.clientId });
    
    return true;
  }

  /**
   * Clear messages for a client
   */
  public clearClientQueue(clientId: string): number {
    const queue = this.messageQueues.get(clientId);
    const count = queue ? queue.length : 0;
    
    if (queue) {
      // Remove from pending acks
      queue.forEach(msg => {
        if (msg.requiresAck) {
          this.pendingAcks.delete(msg.id);
        }
      });
      
      this.messageQueues.delete(clientId);
      
      // Clear from Redis
      if (this.redis) {
        this.clearPersistedQueue(clientId);
      }
    }

    return count;
  }

  /**
   * Get queue statistics
   */
  public getStats(): QueueStats {
    let totalMessages = 0;
    let pendingMessages = 0;
    const queueSizeByPriority = { high: 0, normal: 0, low: 0 };
    
    this.messageQueues.forEach(queue => {
      totalMessages += queue.length;
      pendingMessages += queue.length;
      
      queue.forEach(msg => {
        queueSizeByPriority[msg.priority]++;
      });
    });

    const deliveredMessages = Array.from(this.deliveryStats.values()).length;
    const failedMessages = 0; // Would need to track this separately
    
    const deliveryTimes = Array.from(this.deliveryStats.values());
    const averageDeliveryTime = deliveryTimes.length > 0
      ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length
      : 0;

    return {
      totalMessages,
      pendingMessages,
      deliveredMessages,
      failedMessages,
      averageDeliveryTime,
      queueSizeByPriority
    };
  }

  /**
   * Process message queues
   */
  private startProcessing() {
    this.processInterval = setInterval(() => {
      this.processQueues();
      this.cleanupExpiredMessages();
    }, this.PROCESS_INTERVAL);
  }

  private processQueues() {
    this.messageQueues.forEach((queue, clientId) => {
      // Check for messages that need retry
      queue.forEach(msg => {
        if (this.shouldRetry(msg)) {
          this.emit('message:retry', { 
            messageId: msg.id, 
            clientId, 
            attempts: msg.attempts 
          });
        }
      });
    });
  }

  private cleanupExpiredMessages() {
    const now = Date.now();
    
    this.messageQueues.forEach((queue, clientId) => {
      const initialLength = queue.length;
      
      // Remove expired messages
      const activeMessages = queue.filter(msg => {
        const age = now - msg.timestamp.getTime();
        
        // Check TTL
        if (msg.ttl && age > msg.ttl * 1000) {
          this.emit('message:expired', { messageId: msg.id, clientId });
          return false;
        }
        
        // Check max age
        if (age > this.MAX_MESSAGE_AGE) {
          this.emit('message:expired', { messageId: msg.id, clientId });
          return false;
        }
        
        // Check max attempts
        if (msg.attempts >= msg.maxAttempts) {
          this.emit('message:failed', { messageId: msg.id, clientId, attempts: msg.attempts });
          return false;
        }
        
        return true;
      });
      
      if (activeMessages.length !== initialLength) {
        this.messageQueues.set(clientId, activeMessages);
      }
      
      // Remove empty queues
      if (activeMessages.length === 0) {
        this.messageQueues.delete(clientId);
      }
    });
  }

  private insertByPriority(queue: QueuedMessage[], message: QueuedMessage) {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    
    let insertIndex = queue.length;
    for (let i = 0; i < queue.length; i++) {
      if (priorityOrder[message.priority] < priorityOrder[queue[i].priority]) {
        insertIndex = i;
        break;
      }
    }
    
    queue.splice(insertIndex, 0, message);
  }

  private pruneQueue(queue: QueuedMessage[]): number {
    const initialLength = queue.length;
    
    // Remove oldest low-priority messages first
    queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return a.timestamp.getTime() - b.timestamp.getTime();
    });
    
    // Keep only the most recent high-priority messages
    const maxToKeep = Math.floor(this.MAX_QUEUE_SIZE * 0.8);
    queue.splice(maxToKeep);
    
    return initialLength - queue.length;
  }

  private shouldRetry(message: QueuedMessage): boolean {
    if (message.attempts >= message.maxAttempts) {
      return false;
    }
    
    // Exponential backoff for retries
    const backoffTime = Math.min(1000 * Math.pow(2, message.attempts), 30000);
    const timeSinceLastAttempt = Date.now() - message.timestamp.getTime();
    
    return timeSinceLastAttempt >= backoffTime;
  }

  private scheduleAckTimeout(message: QueuedMessage) {
    setTimeout(() => {
      if (this.pendingAcks.has(message.id)) {
        this.pendingAcks.delete(message.id);
        
        // Re-queue the message if not at max attempts
        if (message.attempts < message.maxAttempts) {
          const queue = this.messageQueues.get(message.clientId);
          if (queue && !queue.find(m => m.id === message.id)) {
            this.insertByPriority(queue, message);
          }
        } else {
          this.emit('message:failed', { 
            messageId: message.id, 
            clientId: message.clientId,
            reason: 'ack_timeout'
          });
        }
      }
    }, this.ACK_TIMEOUT);
  }

  private updateDeliveryStats(clientId: string, deliveryTime: number) {
    const current = this.deliveryStats.get(clientId) || 0;
    const newAverage = (current + deliveryTime) / 2;
    this.deliveryStats.set(clientId, newAverage);
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Redis persistence methods
  private async persistMessage(message: QueuedMessage) {
    if (!this.redis) return;
    
    try {
      const key = `wsqueue:${message.clientId}:${message.id}`;
      await this.redis.setex(
        key,
        message.ttl || 3600,
        JSON.stringify(message)
      );
    } catch (error) {
      console.error('[MessageQueue] Failed to persist message:', error);
    }
  }

  private async removePersistedMessage(messageId: string) {
    if (!this.redis) return;
    
    try {
      // Find and remove the message key
      const keys = await this.redis.keys(`wsqueue:*:${messageId}`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('[MessageQueue] Failed to remove persisted message:', error);
    }
  }

  private async clearPersistedQueue(clientId: string) {
    if (!this.redis) return;
    
    try {
      const keys = await this.redis.keys(`wsqueue:${clientId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('[MessageQueue] Failed to clear persisted queue:', error);
    }
  }

  /**
   * Load persisted messages from Redis
   */
  public async loadPersistedMessages() {
    if (!this.redis) return;
    
    try {
      const keys = await this.redis.keys('wsqueue:*');
      
      for (const key of keys) {
        const value = await this.redis.get(key);
        if (value) {
          const message = JSON.parse(value) as QueuedMessage;
          message.timestamp = new Date(message.timestamp);
          
          if (!this.messageQueues.has(message.clientId)) {
            this.messageQueues.set(message.clientId, []);
          }
          
          const queue = this.messageQueues.get(message.clientId)!;
          if (!queue.find(m => m.id === message.id)) {
            this.insertByPriority(queue, message);
          }
        }
      }
      
      console.log(`[MessageQueue] Loaded ${keys.length} persisted messages`);
    } catch (error) {
      console.error('[MessageQueue] Failed to load persisted messages:', error);
    }
  }

  /**
   * Stop processing and clean up
   */
  public stop() {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    
    this.removeAllListeners();
    console.log('[MessageQueue] Message queue stopped');
  }
}