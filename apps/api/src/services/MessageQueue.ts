/**
 * Distributed Message Queue Service
 * Enables reliable message passing between microservices
 * Part of Phase 3: Scalability Enhancement
 */

import { EventEmitter } from 'events';
import { redisPub, redisSub } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface QueueMessage {
  id: string;
  queue: string;
  type: string;
  payload: any;
  metadata: {
    timestamp: Date;
    sender: string;
    retries: number;
    maxRetries: number;
    ttl?: number;
  };
}

export interface QueueConfig {
  name: string;
  maxRetries?: number;
  retryDelay?: number;
  deadLetterQueue?: string;
  ttl?: number;
}

export class MessageQueue extends EventEmitter {
  private static instance: MessageQueue;
  private queues: Map<string, QueueConfig> = new Map();
  private subscribers: Map<string, Set<(message: QueueMessage) => void>> = new Map();
  private deadLetterQueues: Map<string, QueueMessage[]> = new Map();
  private processingMessages: Map<string, QueueMessage> = new Map();
  private serviceName: string;

  private constructor() {
    super();
    this.serviceName = `maifarm-${process.env.NODE_APP_INSTANCE || '0'}`;
    this.initializeQueue();
  }

  public static getInstance(): MessageQueue {
    if (!MessageQueue.instance) {
      MessageQueue.instance = new MessageQueue();
    }
    return MessageQueue.instance;
  }

  private async initializeQueue(): Promise<void> {
    // Subscribe to Redis channels for distributed messaging
    redisSub.on('message', (channel: string, message: string) => {
      this.handleIncomingMessage(channel, message);
    });

    // Setup default queues
    this.createQueue({ name: 'farm-tasks', maxRetries: 3, retryDelay: 5000 });
    this.createQueue({ name: 'agent-commands', maxRetries: 5, retryDelay: 3000 });
    this.createQueue({ name: 'harvest-collection', maxRetries: 2, retryDelay: 10000 });
    this.createQueue({ name: 'metrics-aggregation', maxRetries: 1, ttl: 60000 });
    this.createQueue({ name: 'health-checks', maxRetries: 0, ttl: 30000 });

    logger.info(LogCategory.SERVICES, 'MessageQueue initialized');
  }

  /**
   * Create a new message queue
   */
  public createQueue(config: QueueConfig): void {
    this.queues.set(config.name, {
      ...config,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 5000,
      ttl: config.ttl || 3600000 // 1 hour default TTL
    });

    // Subscribe to Redis channel for this queue
    redisSub.subscribe(`mq:${config.name}`);

    if (config.deadLetterQueue) {
      this.deadLetterQueues.set(config.deadLetterQueue, []);
    }

    logger.debug(LogCategory.SERVICES, `Queue created: ${config.name}`);
  }

  /**
   * Publish a message to a queue
   */
  public async publish(queueName: string, type: string, payload: any): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} does not exist`);
    }

    const message: QueueMessage = {
      id: uuidv4(),
      queue: queueName,
      type,
      payload,
      metadata: {
        timestamp: new Date(),
        sender: this.serviceName,
        retries: 0,
        maxRetries: queue.maxRetries || 3,
        ttl: queue.ttl
      }
    };

    // Publish to Redis for distributed processing
    await redisPub.publish(`mq:${queueName}`, JSON.stringify(message));

    // Store in Redis for persistence (with TTL if configured)
    const key = `mq:message:${message.id}`;
    await redisPub.set(key, JSON.stringify(message));
    if (queue.ttl) {
      await redisPub.expire(key, Math.floor(queue.ttl / 1000));
    }

    this.emit('message:published', message);
    return message.id;
  }

  /**
   * Subscribe to a queue
   */
  public subscribe(queueName: string, handler: (message: QueueMessage) => Promise<void>): void {
    if (!this.subscribers.has(queueName)) {
      this.subscribers.set(queueName, new Set());
    }

    const wrappedHandler = async (message: QueueMessage) => {
      const processingKey = `${message.queue}:${message.id}`;
      this.processingMessages.set(processingKey, message);

      try {
        await handler(message);
        await this.acknowledgeMessage(message);
      } catch (error) {
        logger.error(LogCategory.SERVICES, `Error processing message ${message.id}:`, error);
        await this.handleFailedMessage(message, error);
      } finally {
        this.processingMessages.delete(processingKey);
      }
    };

    this.subscribers.get(queueName)!.add(wrappedHandler);
    logger.debug(LogCategory.SERVICES, `Subscribed to queue: ${queueName}`);
  }

  /**
   * Handle incoming messages from Redis
   */
  private handleIncomingMessage(channel: string, messageStr: string): void {
    try {
      const queueName = channel.replace('mq:', '');
      const message: QueueMessage = JSON.parse(messageStr);

      // Skip messages from self in single-instance mode
      if (message.metadata.sender === this.serviceName && !process.env.MULTI_INSTANCE) {
        return;
      }

      const handlers = this.subscribers.get(queueName);
      if (handlers && handlers.size > 0) {
        handlers.forEach(handler => handler(message));
      }

      this.emit('message:received', message);
    } catch (error) {
      logger.error(LogCategory.SERVICES, 'Failed to process incoming message:', error);
    }
  }

  /**
   * Acknowledge successful message processing
   */
  private async acknowledgeMessage(message: QueueMessage): Promise<void> {
    const key = `mq:message:${message.id}`;
    await redisPub.del(key);

    this.emit('message:acknowledged', message);
    logger.debug(LogCategory.SERVICES, `Message ${message.id} acknowledged`);
  }

  /**
   * Handle failed message with retry logic
   */
  private async handleFailedMessage(message: QueueMessage, error: any): Promise<void> {
    message.metadata.retries++;

    const queue = this.queues.get(message.queue);
    if (!queue) return;

    if (message.metadata.retries < message.metadata.maxRetries) {
      // Schedule retry
      setTimeout(() => {
        this.publish(message.queue, message.type, message.payload);
      }, queue.retryDelay);

      logger.warn(LogCategory.SERVICES,
        `Message ${message.id} failed, retry ${message.metadata.retries}/${message.metadata.maxRetries}`
      );
    } else {
      // Move to dead letter queue
      if (queue.deadLetterQueue) {
        const dlq = this.deadLetterQueues.get(queue.deadLetterQueue);
        if (dlq) {
          dlq.push(message);
        }
      }

      this.emit('message:failed', { message, error });
      logger.error(LogCategory.SERVICES, `Message ${message.id} failed after max retries`);
    }
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(queueName?: string): Promise<any> {
    if (queueName) {
      const queue = this.queues.get(queueName);
      if (!queue) {
        throw new Error(`Queue ${queueName} does not exist`);
      }

      const pattern = `mq:message:*`;
      const keys = await redisPub.keys(pattern);
      const messages = await Promise.all(
        keys.map(async (key) => {
          const data = await redisPub.get(key);
          return data ? JSON.parse(data) : null;
        })
      );

      const queueMessages = messages.filter(m => m && m.queue === queueName);

      return {
        name: queueName,
        config: queue,
        pending: queueMessages.length,
        processing: Array.from(this.processingMessages.values())
          .filter(m => m.queue === queueName).length,
        subscribers: this.subscribers.get(queueName)?.size || 0,
        deadLetter: this.deadLetterQueues.get(queue.deadLetterQueue || '')?.length || 0
      };
    }

    // Return stats for all queues
    const stats: any[] = [];
    for (const [name] of this.queues) {
      stats.push(await this.getQueueStats(name));
    }
    return stats;
  }

  /**
   * Process dead letter queue
   */
  public getDeadLetterMessages(queueName: string): QueueMessage[] {
    return this.deadLetterQueues.get(queueName) || [];
  }

  /**
   * Reprocess dead letter messages
   */
  public async reprocessDeadLetter(queueName: string): Promise<number> {
    const messages = this.deadLetterQueues.get(queueName) || [];
    const count = messages.length;

    for (const message of messages) {
      message.metadata.retries = 0; // Reset retry count
      await this.publish(message.queue, message.type, message.payload);
    }

    // Clear dead letter queue
    this.deadLetterQueues.set(queueName, []);

    logger.info(LogCategory.SERVICES, `Reprocessed ${count} messages from dead letter queue ${queueName}`);
    return count;
  }

  /**
   * Cleanup expired messages
   */
  public async cleanupExpiredMessages(): Promise<number> {
    const pattern = `mq:message:*`;
    const keys = await redisPub.keys(pattern);
    let cleaned = 0;

    for (const key of keys) {
      const ttl = await redisPub.ttl(key);
      if (ttl === -2) { // Key doesn't exist
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Export singleton instance
export const messageQueue = MessageQueue.getInstance();