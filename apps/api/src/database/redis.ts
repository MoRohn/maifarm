import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  socket: {
    connectTimeout: 5000,
    lazyConnect: true,
    reconnectStrategy: (retries: number) => {
      if (retries > 3) return false;
      return Math.min(retries * 100, 3000);
    }
  }
};

let redis: RedisClientType | null = null;
let redisConnected = false;

export const initializeRedis = async (): Promise<RedisClientType | null> => {
  try {
    redis = createClient(REDIS_CONFIG);

    redis.on('connect', () => {
      logger.info('[Redis] Connecting to Redis server...');
    });

    redis.on('ready', () => {
      logger.info('[Redis] ✅ Redis connection established');
      redisConnected = true;
    });

    redis.on('error', (err) => {
      logger.warn('[Redis] ⚠️  Redis connection error:', err.message);
      redisConnected = false;
    });

    redis.on('end', () => {
      logger.warn('[Redis] Connection ended');
      redisConnected = false;
    });

    redis.on('reconnecting', () => {
      logger.info('[Redis] Reconnecting...');
    });

    await redis.connect();
    await redis.ping();
    
    logger.info('[Redis] ✅ Redis initialized successfully');
    return redis;
  } catch (error) {
    logger.warn('[Redis] ⚠️  Redis initialization failed:', error instanceof Error ? error.message : String(error));
    redis = null;
    redisConnected = false;
    return null;
  }
};

export const getRedisClient = (): RedisClientType | null => {
  return redis && redisConnected ? redis : null;
};

export const isRedisConnected = (): boolean => {
  return redisConnected && redis !== null;
};

export const closeRedis = async (): Promise<void> => {
  if (redis && redisConnected) {
    try {
      await redis.quit();
      logger.info('[Redis] Connection closed gracefully');
    } catch (error) {
      logger.warn('[Redis] Error closing connection:', error instanceof Error ? error.message : String(error));
    }
  }
  redis = null;
  redisConnected = false;
};

// For backward compatibility
export { redis, redisConnected };

// Auto-initialize Redis
initializeRedis().catch((error) => {
  logger.warn('[Redis] Auto-initialization failed:', error instanceof Error ? error.message : String(error));
});