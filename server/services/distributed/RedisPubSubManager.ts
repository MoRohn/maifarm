/**
 * RedisPubSubManager - Distributed messaging system for horizontal scaling
 *
 * Enables multiple MaiFarm instances to communicate and coordinate
 * through Redis pub/sub channels.
 */

import { EventEmitter } from 'events';
import { RedisClientType } from 'redis';
import { logger, LogCategory } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { redisClientManager, getRedisPubClient, getRedisSubClient } from '../redisClientManager';

interface DistributedMessage {
  id: string;
  source: string; // Instance ID that sent the message
  channel: string;
  event: string;
  data: any;
  timestamp: Date;
  ttl?: number;
}

interface ChannelSubscription {
  channel: string;
  handler: (message: DistributedMessage) => void;
  filter?: (message: DistributedMessage) => boolean;
}

export class RedisPubSubManager extends EventEmitter {
  private static instance: RedisPubSubManager;
  private publisher: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private instanceId: string;
  private subscriptions: Map<string, Set<ChannelSubscription>> = new Map();
  private messageCache: Map<string, DistributedMessage> = new Map();
  private isConnected = false;

  // Channel names for different services
  public static readonly CHANNELS = {
    FARM_EVENTS: 'maifarm:farms',
    AGENT_EVENTS: 'maifarm:agents',
    TERMINAL_EVENTS: 'maifarm:terminals',
    HARVEST_EVENTS: 'maifarm:harvests',
    METRICS_EVENTS: 'maifarm:metrics',
    HEALTH_EVENTS: 'maifarm:health',
    CONTROL_PLANE: 'maifarm:control',
    DISCOVERY: 'maifarm:discovery'
  };

  private readonly MESSAGE_CACHE_TTL = 60000; // 1 minute
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  private constructor() {
    super();
    this.instanceId = process.env.INSTANCE_ID || uuidv4();
    this.initialize();
  }

  static getInstance(): RedisPubSubManager {
    if (!RedisPubSubManager.instance) {
      RedisPubSubManager.instance = new RedisPubSubManager();
    }
    return RedisPubSubManager.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Initialize Redis client manager if needed
      if (!redisClientManager.isConnected()) {
        await redisClientManager.initialize();
      }

      // Get dedicated pub/sub clients
      this.publisher = await getRedisPubClient();
      this.subscriber = await getRedisSubClient();

      this.isConnected = true;

      // Set up message handler
      this.setupMessageHandler();

      // Start heartbeat
      this.startHeartbeat();

      // Announce presence
      await this.announcePresence();

      logger.info(LogCategory.DISTRIBUTED, `RedisPubSubManager initialized with instance ID: ${this.instanceId}`);

    } catch (error) {
      logger.error(LogCategory.DISTRIBUTED, 'Failed to initialize RedisPubSubManager:', error);
      this.isConnected = false;
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(
    channel: string,
    handler: (message: DistributedMessage) => void,
    filter?: (message: DistributedMessage) => boolean
  ): Promise<void> {
    if (!this.isConnected || !this.subscriber) {
      throw new Error('Redis not connected');
    }

    // Store subscription
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());

      // Subscribe to Redis channel
      await this.subscriber.subscribe(channel, (rawMessage) => {
        this.handleMessage(channel, rawMessage);
      });
    }

    this.subscriptions.get(channel)!.add({ channel, handler, filter });

    logger.debug(LogCategory.DISTRIBUTED, `Subscribed to channel: ${channel}`);
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string, handler?: (message: DistributedMessage) => void): Promise<void> {
    if (!this.isConnected || !this.subscriber) return;

    const subs = this.subscriptions.get(channel);
    if (!subs) return;

    if (handler) {
      // Remove specific handler
      for (const sub of subs) {
        if (sub.handler === handler) {
          subs.delete(sub);
          break;
        }
      }
    } else {
      // Remove all handlers
      subs.clear();
    }

    // Unsubscribe from Redis if no handlers left
    if (subs.size === 0) {
      await this.subscriber.unsubscribe(channel);
      this.subscriptions.delete(channel);
      logger.debug(LogCategory.DISTRIBUTED, `Unsubscribed from channel: ${channel}`);
    }
  }

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, event: string, data: any, ttl?: number): Promise<void> {
    if (!this.isConnected || !this.publisher) {
      logger.warn(LogCategory.DISTRIBUTED, 'Cannot publish - Redis not connected');
      return;
    }

    const message: DistributedMessage = {
      id: uuidv4(),
      source: this.instanceId,
      channel,
      event,
      data,
      timestamp: new Date(),
      ttl
    };

    try {
      await this.publisher.publish(channel, JSON.stringify(message));

      // Cache message for deduplication
      this.cacheMessage(message);

      logger.debug(LogCategory.DISTRIBUTED, `Published to ${channel}: ${event}`);

    } catch (error) {
      logger.error(LogCategory.DISTRIBUTED, `Failed to publish to ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Broadcast to all instances (including self)
   */
  async broadcast(channel: string, event: string, data: any): Promise<void> {
    await this.publish(channel, event, data);

    // Also handle locally
    const message: DistributedMessage = {
      id: uuidv4(),
      source: this.instanceId,
      channel,
      event,
      data,
      timestamp: new Date()
    };

    this.handleLocalMessage(message);
  }

  /**
   * Request-response pattern for inter-service communication
   */
  async request(
    channel: string,
    event: string,
    data: any,
    timeout: number = 5000
  ): Promise<any> {
    const requestId = uuidv4();
    const responseChannel = `${channel}:response:${requestId}`;

    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        this.unsubscribe(responseChannel);
        reject(new Error(`Request timeout for ${event}`));
      }, timeout);

      // Subscribe to response channel
      await this.subscribe(responseChannel, (message) => {
        clearTimeout(timer);
        this.unsubscribe(responseChannel);
        resolve(message.data);
      });

      // Send request
      await this.publish(channel, event, {
        ...data,
        responseChannel,
        requestId
      });
    });
  }

  /**
   * Respond to a request
   */
  async respond(responseChannel: string, data: any): Promise<void> {
    await this.publish(responseChannel, 'response', data);
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(channel: string, rawMessage: string): void {
    try {
      const message: DistributedMessage = JSON.parse(rawMessage);

      // Skip if from self (already handled locally)
      if (message.source === this.instanceId) return;

      // Check for duplicate
      if (this.isDuplicate(message)) return;

      // Cache message
      this.cacheMessage(message);

      // Process message
      this.processMessage(channel, message);

    } catch (error) {
      logger.error(LogCategory.DISTRIBUTED, 'Failed to handle message:', error);
    }
  }

  /**
   * Process a message
   */
  private processMessage(channel: string, message: DistributedMessage): void {
    const subscriptions = this.subscriptions.get(channel);
    if (!subscriptions) return;

    for (const sub of subscriptions) {
      // Apply filter if exists
      if (sub.filter && !sub.filter(message)) continue;

      try {
        sub.handler(message);
      } catch (error) {
        logger.error(LogCategory.DISTRIBUTED,
          `Error in message handler for ${channel}:`, error);
      }
    }

    // Emit event
    this.emit('message', message);
  }

  /**
   * Handle local messages (for broadcast)
   */
  private handleLocalMessage(message: DistributedMessage): void {
    this.processMessage(message.channel, message);
  }

  /**
   * Check if message is duplicate
   */
  private isDuplicate(message: DistributedMessage): boolean {
    return this.messageCache.has(message.id);
  }

  /**
   * Cache message for deduplication
   */
  private cacheMessage(message: DistributedMessage): void {
    this.messageCache.set(message.id, message);

    // Schedule cleanup
    setTimeout(() => {
      this.messageCache.delete(message.id);
    }, message.ttl || this.MESSAGE_CACHE_TTL);
  }

  /**
   * Set up global message handler
   */
  private setupMessageHandler(): void {
    // Subscribe to discovery channel for instance coordination
    this.subscribe(RedisPubSubManager.CHANNELS.DISCOVERY, (message) => {
      if (message.event === 'instance:announce') {
        this.handleInstanceAnnouncement(message);
      } else if (message.event === 'instance:shutdown') {
        this.handleInstanceShutdown(message);
      }
    });

    // Subscribe to control plane for commands
    this.subscribe(RedisPubSubManager.CHANNELS.CONTROL_PLANE, (message) => {
      this.handleControlMessage(message);
    });
  }

  /**
   * Handle instance announcements
   */
  private handleInstanceAnnouncement(message: DistributedMessage): void {
    logger.info(LogCategory.DISTRIBUTED,
      `Instance ${message.source} announced presence`, message.data);

    this.emit('instance:discovered', {
      instanceId: message.source,
      ...message.data
    });
  }

  /**
   * Handle instance shutdown
   */
  private handleInstanceShutdown(message: DistributedMessage): void {
    logger.info(LogCategory.DISTRIBUTED,
      `Instance ${message.source} shutting down`);

    this.emit('instance:shutdown', {
      instanceId: message.source,
      ...message.data
    });
  }

  /**
   * Handle control messages
   */
  private handleControlMessage(message: DistributedMessage): void {
    switch (message.event) {
      case 'scale:up':
        this.emit('control:scaleUp', message.data);
        break;
      case 'scale:down':
        this.emit('control:scaleDown', message.data);
        break;
      case 'rebalance':
        this.emit('control:rebalance', message.data);
        break;
      case 'health:check':
        this.respondToHealthCheck(message);
        break;
    }
  }

  /**
   * Respond to health check
   */
  private async respondToHealthCheck(message: DistributedMessage): Promise<void> {
    const health = {
      instanceId: this.instanceId,
      timestamp: new Date(),
      status: 'healthy',
      metrics: {
        subscriptions: this.subscriptions.size,
        cachedMessages: this.messageCache.size
      }
    };

    if (message.data.responseChannel) {
      await this.respond(message.data.responseChannel, health);
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    setInterval(async () => {
      if (!this.isConnected) return;

      await this.publish(RedisPubSubManager.CHANNELS.HEALTH_EVENTS, 'heartbeat', {
        instanceId: this.instanceId,
        timestamp: new Date(),
        subscriptions: Array.from(this.subscriptions.keys())
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Announce presence on startup
   */
  private async announcePresence(): Promise<void> {
    await this.publish(RedisPubSubManager.CHANNELS.DISCOVERY, 'instance:announce', {
      instanceId: this.instanceId,
      startTime: new Date(),
      hostname: process.env.HOSTNAME || 'unknown',
      capabilities: {
        farms: true,
        agents: true,
        terminals: true,
        harvests: true
      }
    });
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(): void {
    this.isConnected = false;
    this.emit('disconnected');

    // Attempt reconnection
    setTimeout(() => {
      this.reconnect();
    }, 5000);
  }

  /**
   * Reconnect to Redis
   */
  private async reconnect(): Promise<void> {
    try {
      // Reconnect through the client manager
      await redisClientManager.reconnect();

      // Get fresh clients
      this.publisher = await getRedisPubClient();
      this.subscriber = await getRedisSubClient();

      // Re-subscribe to channels
      for (const channel of this.subscriptions.keys()) {
        await this.subscriber.subscribe(channel, (rawMessage) => {
          this.handleMessage(channel, rawMessage);
        });
      }

      this.isConnected = true;
      this.emit('reconnected');

      // Re-announce presence
      await this.announcePresence();

      logger.info(LogCategory.DISTRIBUTED, 'Reconnected to Redis');

    } catch (error) {
      logger.error(LogCategory.DISTRIBUTED, 'Failed to reconnect:', error);

      // Retry
      setTimeout(() => this.reconnect(), 10000);
    }
  }

  /**
   * Get instance information
   */
  getInstanceInfo(): {
    instanceId: string;
    isConnected: boolean;
    subscriptions: string[];
    cachedMessages: number;
  } {
    return {
      instanceId: this.instanceId,
      isConnected: this.isConnected,
      subscriptions: Array.from(this.subscriptions.keys()),
      cachedMessages: this.messageCache.size
    };
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    // Announce shutdown
    await this.publish(RedisPubSubManager.CHANNELS.DISCOVERY, 'instance:shutdown', {
      instanceId: this.instanceId,
      timestamp: new Date()
    });

    // Clear references (client manager will handle actual shutdown)
    this.publisher = null;
    this.subscriber = null;
    this.isConnected = false;

    logger.info(LogCategory.DISTRIBUTED, 'RedisPubSubManager shut down');
  }
}

// Export singleton instance
export const redisPubSubManager = RedisPubSubManager.getInstance();