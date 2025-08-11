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
  ttl: number;
  requiresAck: boolean;
  acknowledged: boolean;
}

interface QueueStats {
  totalMessages: number;
  pendingMessages: number;
  acknowledgedMessages: number;
  expiredMessages: number;
  clientQueues: number;
}

export class WebSocketMessageQueue extends EventEmitter {
  private redis: Redis | null;
  private inMemoryQueue: Map<string, QueuedMessage[]> = new Map();
  private messageIndex: Map<string, QueuedMessage> = new Map();
  private pruneInterval: NodeJS.Timeout | null = null;
  private persistInterval: NodeJS.Timeout | null = null;

  constructor(redis: Redis | null = null) {
    super();
    this.redis = redis;
    this.startPruning();
    
    if (redis) {
      this.startPersistence();
    }
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
    const messageId = options.id || this.generateMessageId();
    
    const message: QueuedMessage = {
      id: messageId,
      clientId,
      event,
      data,
      timestamp: new Date(),
      attempts: options.attempts || 0,
      maxAttempts: options.maxAttempts || 3,
      priority: options.priority || 'normal',
      ttl: options.ttl || 3600000, // 1 hour default
      requiresAck: options.requiresAck || false,
      acknowledged: false,
      ...options
    };

    // Get or create client queue
    if (!this.inMemoryQueue.has(clientId)) {
      this.inMemoryQueue.set(clientId, []);
    }

    const queue = this.inMemoryQueue.get(clientId)!;
    
    // Add message based on priority
    if (message.priority === 'high') {
      queue.unshift(message);
    } else if (message.priority === 'low') {
      queue.push(message);
    } else {
      // Normal priority - add after high priority messages
      const highPriorityCount = queue.filter(m => m.priority === 'high').length;
      queue.splice(highPriorityCount, 0, message);
    }

    // Index message for quick lookup
    this.messageIndex.set(messageId, message);

    // Persist to Redis if available
    if (this.redis) {
      this.persistMessage(message).catch(err => {
        console.error('[MessageQueue] Failed to persist message:', err);
      });
    }

    this.emit('message:queued', {
      messageId,
      clientId,
      event,
      priority: message.priority
    });

    return messageId;
  }

  /**
   * Get queued messages for a client
   */
  public getQueuedMessages(clientId: string, limit = 100): QueuedMessage[] {
    const queue = this.inMemoryQueue.get(clientId) || [];
    return queue
      .filter(m => !m.acknowledged && !this.isExpired(m))
      .slice(0, limit);
  }

  /**
   * Acknowledge a message
   */
  public acknowledgeMessage(messageId: string): boolean {
    const message = this.messageIndex.get(messageId);
    if (message) {
      message.acknowledged = true;
      
      // Update in Redis if available
      if (this.redis) {
        this.updateMessageInRedis(message).catch(err => {
          console.error('[MessageQueue] Failed to update message in Redis:', err);
        });
      }
      
      return true;
    }
    return false;
  }

  /**
   * Clear all messages for a client
   */
  public clearClientQueue(clientId: string): number {
    const queue = this.inMemoryQueue.get(clientId);
    if (!queue) return 0;

    const count = queue.length;
    
    // Remove from index
    queue.forEach(m => this.messageIndex.delete(m.id));
    
    // Clear queue
    this.inMemoryQueue.delete(clientId);

    // Clear from Redis if available
    if (this.redis) {
      this.clearClientQueueInRedis(clientId).catch(err => {
        console.error('[MessageQueue] Failed to clear client queue in Redis:', err);
      });
    }

    return count;
  }

  /**
   * Get queue statistics
   */
  public getStats(): QueueStats {
    let totalMessages = 0;
    let pendingMessages = 0;
    let acknowledgedMessages = 0;
    let expiredMessages = 0;

    for (const queue of this.inMemoryQueue.values()) {
      totalMessages += queue.length;
      
      for (const message of queue) {
        if (message.acknowledged) {
          acknowledgedMessages++;
        } else if (this.isExpired(message)) {
          expiredMessages++;
        } else {
          pendingMessages++;
        }
      }
    }

    return {
      totalMessages,
      pendingMessages,
      acknowledgedMessages,
      expiredMessages,
      clientQueues: this.inMemoryQueue.size
    };
  }

  /**
   * Load persisted messages from Redis
   */
  public async loadPersistedMessages(): Promise<void> {
    if (!this.redis) return;

    try {
      const keys = await this.redis.keys('websocket:queue:*');
      
      for (const key of keys) {
        const clientId = key.replace('websocket:queue:', '');
        const messages = await this.redis.lrange(key, 0, -1);
        
        const parsedMessages = messages
          .map(m => {
            try {
              return JSON.parse(m) as QueuedMessage;
            } catch {
              return null;
            }
          })
          .filter(m => m !== null && !this.isExpired(m as QueuedMessage)) as QueuedMessage[];

        if (parsedMessages.length > 0) {
          this.inMemoryQueue.set(clientId, parsedMessages);
          parsedMessages.forEach(m => this.messageIndex.set(m.id, m));
        }
      }

      console.log(`[MessageQueue] Loaded ${this.messageIndex.size} persisted messages`);
    } catch (error) {
      console.error('[MessageQueue] Failed to load persisted messages:', error);
    }
  }

  /**
   * Check if a message is expired
   */
  private isExpired(message: QueuedMessage): boolean {
    const now = new Date().getTime();
    const messageTime = new Date(message.timestamp).getTime();
    return (now - messageTime) > message.ttl;
  }

  /**
   * Start periodic pruning of expired messages
   */
  private startPruning() {
    this.pruneInterval = setInterval(() => {
      for (const [clientId, queue] of this.inMemoryQueue) {
        const before = queue.length;
        const pruned = queue.filter(m => {
          if (this.isExpired(m)) {
            this.messageIndex.delete(m.id);
            this.emit('message:expired', {
              messageId: m.id,
              clientId,
              event: m.event
            });
            return false;
          }
          return true;
        });

        if (pruned.length < before) {
          this.inMemoryQueue.set(clientId, pruned);
          this.emit('queue:pruned', {
            clientId,
            removed: before - pruned.length
          });
        }

        // Remove empty queues
        if (pruned.length === 0) {
          this.inMemoryQueue.delete(clientId);
        }
      }
    }, 60000); // Prune every minute
  }

  /**
   * Start periodic persistence to Redis
   */
  private startPersistence() {
    if (!this.redis) return;

    this.persistInterval = setInterval(async () => {
      try {
        for (const [clientId, queue] of this.inMemoryQueue) {
          const key = `websocket:queue:${clientId}`;
          
          // Filter out acknowledged and expired messages
          const validMessages = queue.filter(m => !m.acknowledged && !this.isExpired(m));
          
          if (validMessages.length > 0) {
            // Store as JSON array
            await this.redis.del(key);
            const pipeline = this.redis.pipeline();
            
            for (const message of validMessages) {
              pipeline.rpush(key, JSON.stringify(message));
            }
            
            pipeline.expire(key, 3600); // Expire after 1 hour
            await pipeline.exec();
          } else {
            // Remove empty queue
            await this.redis.del(key);
          }
        }
      } catch (error) {
        console.error('[MessageQueue] Failed to persist queues:', error);
      }
    }, 30000); // Persist every 30 seconds
  }

  /**
   * Persist a single message to Redis
   */
  private async persistMessage(message: QueuedMessage): Promise<void> {
    if (!this.redis) return;

    const key = `websocket:queue:${message.clientId}`;
    await this.redis.rpush(key, JSON.stringify(message));
    await this.redis.expire(key, 3600);
  }

  /**
   * Update message in Redis
   */
  private async updateMessageInRedis(message: QueuedMessage): Promise<void> {
    if (!this.redis) return;

    const key = `websocket:queue:${message.clientId}`;
    const messages = await this.redis.lrange(key, 0, -1);
    
    const updated = messages.map(m => {
      const parsed = JSON.parse(m);
      if (parsed.id === message.id) {
        return JSON.stringify(message);
      }
      return m;
    });

    await this.redis.del(key);
    if (updated.length > 0) {
      await this.redis.rpush(key, ...updated);
      await this.redis.expire(key, 3600);
    }
  }

  /**
   * Clear client queue in Redis
   */
  private async clearClientQueueInRedis(clientId: string): Promise<void> {
    if (!this.redis) return;
    
    const key = `websocket:queue:${clientId}`;
    await this.redis.del(key);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Stop the message queue
   */
  public stop() {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }

    if (this.persistInterval) {
      clearInterval(this.persistInterval);
      this.persistInterval = null;
    }

    this.inMemoryQueue.clear();
    this.messageIndex.clear();
    this.removeAllListeners();
  }
}