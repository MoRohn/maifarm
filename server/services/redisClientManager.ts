/**
 * Redis Client Manager - Proper separation of regular and pub/sub clients
 *
 * CRITICAL: Redis requires separate clients for:
 * 1. Regular operations (get, set, zrange, etc.)
 * 2. Pub/Sub operations (subscribe, publish)
 *
 * Mixing these operations on the same client causes "ERR Can't execute" errors
 */

import { createClient, RedisClientType } from 'redis';
import { logger, LogCategory } from '../utils/logger';

export interface RedisClients {
  regular: RedisClientType | null;
  publisher: RedisClientType | null;
  subscriber: RedisClientType | null;
}

class RedisClientManager {
  private static instance: RedisClientManager;
  private clients: RedisClients = {
    regular: null,
    publisher: null,
    subscriber: null
  };
  private isInitialized = false;
  private connectionConfig: any;

  private constructor() {
    this.connectionConfig = {
      url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
      password: process.env.REDIS_PASSWORD || undefined,
      database: parseInt(process.env.REDIS_DB || '0'),
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            logger.error(LogCategory.REDIS, 'Max reconnection attempts reached');
            return false;
          }
          const delay = Math.min(retries * 100, 3000);
          logger.info(LogCategory.REDIS, `Reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        }
      }
    };
  }

  static getInstance(): RedisClientManager {
    if (!RedisClientManager.instance) {
      RedisClientManager.instance = new RedisClientManager();
    }
    return RedisClientManager.instance;
  }

  /**
   * Initialize all Redis clients
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn(LogCategory.REDIS, 'Redis clients already initialized');
      return;
    }

    try {
      // Create regular client for standard operations
      this.clients.regular = createClient(this.connectionConfig);
      this.setupClientHandlers(this.clients.regular, 'regular');

      // Create publisher client for pub/sub publishing
      this.clients.publisher = createClient(this.connectionConfig);
      this.setupClientHandlers(this.clients.publisher, 'publisher');

      // Create subscriber client for pub/sub subscriptions
      this.clients.subscriber = createClient(this.connectionConfig);
      this.setupClientHandlers(this.clients.subscriber, 'subscriber');

      // Connect all clients
      await Promise.all([
        this.clients.regular.connect(),
        this.clients.publisher.connect(),
        this.clients.subscriber.connect()
      ]);

      // Test connections
      await this.clients.regular.ping();

      this.isInitialized = true;
      logger.info(LogCategory.REDIS, '✅ All Redis clients initialized successfully');

    } catch (error) {
      logger.error(LogCategory.REDIS, 'Failed to initialize Redis clients:', error);
      throw error;
    }
  }

  /**
   * Setup event handlers for a Redis client
   */
  private setupClientHandlers(client: RedisClientType, name: string): void {
    client.on('connect', () => {
      logger.info(LogCategory.REDIS, `[${name}] Connecting to Redis...`);
    });

    client.on('ready', () => {
      logger.info(LogCategory.REDIS, `[${name}] ✅ Connected and ready`);
    });

    client.on('error', (err) => {
      logger.error(LogCategory.REDIS, `[${name}] Connection error:`, err);
    });

    client.on('end', () => {
      logger.warn(LogCategory.REDIS, `[${name}] Connection ended`);
    });

    client.on('reconnecting', () => {
      logger.info(LogCategory.REDIS, `[${name}] Reconnecting...`);
    });
  }

  /**
   * Get regular client for standard Redis operations
   * Use this for: get, set, hset, zrange, etc.
   */
  getRegularClient(): RedisClientType {
    if (!this.clients.regular || !this.clients.regular.isOpen) {
      throw new Error('Regular Redis client not initialized or disconnected');
    }
    return this.clients.regular;
  }

  /**
   * Get publisher client for publishing messages
   * Use this for: publish operations only
   */
  getPublisherClient(): RedisClientType {
    if (!this.clients.publisher || !this.clients.publisher.isOpen) {
      throw new Error('Publisher Redis client not initialized or disconnected');
    }
    return this.clients.publisher;
  }

  /**
   * Get subscriber client for subscribing to channels
   * Use this for: subscribe, psubscribe operations only
   */
  getSubscriberClient(): RedisClientType {
    if (!this.clients.subscriber || !this.clients.subscriber.isOpen) {
      throw new Error('Subscriber Redis client not initialized or disconnected');
    }
    return this.clients.subscriber;
  }

  /**
   * Check if all clients are connected
   */
  isConnected(): boolean {
    return !!(
      this.clients.regular?.isOpen &&
      this.clients.publisher?.isOpen &&
      this.clients.subscriber?.isOpen
    );
  }

  /**
   * Get connection status for all clients
   */
  getStatus(): Record<string, boolean> {
    return {
      regular: this.clients.regular?.isOpen || false,
      publisher: this.clients.publisher?.isOpen || false,
      subscriber: this.clients.subscriber?.isOpen || false
    };
  }

  /**
   * Gracefully shutdown all Redis clients
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.REDIS, 'Shutting down Redis clients...');

    const shutdownPromises = [];

    if (this.clients.regular?.isOpen) {
      shutdownPromises.push(this.clients.regular.quit());
    }

    if (this.clients.publisher?.isOpen) {
      shutdownPromises.push(this.clients.publisher.quit());
    }

    if (this.clients.subscriber?.isOpen) {
      shutdownPromises.push(this.clients.subscriber.quit());
    }

    await Promise.all(shutdownPromises);

    this.clients = {
      regular: null,
      publisher: null,
      subscriber: null
    };

    this.isInitialized = false;
    logger.info(LogCategory.REDIS, 'Redis clients shut down successfully');
  }

  /**
   * Reconnect all clients
   */
  async reconnect(): Promise<void> {
    await this.shutdown();
    await this.initialize();
  }
}

// Export singleton instance
export const redisClientManager = RedisClientManager.getInstance();

// Export convenience functions
export async function getRedisClient(): Promise<RedisClientType> {
  const manager = RedisClientManager.getInstance();
  if (!manager.isConnected()) {
    await manager.initialize();
  }
  return manager.getRegularClient();
}

export async function getRedisPubClient(): Promise<RedisClientType> {
  const manager = RedisClientManager.getInstance();
  if (!manager.isConnected()) {
    await manager.initialize();
  }
  return manager.getPublisherClient();
}

export async function getRedisSubClient(): Promise<RedisClientType> {
  const manager = RedisClientManager.getInstance();
  if (!manager.isConnected()) {
    await manager.initialize();
  }
  return manager.getSubscriberClient();
}