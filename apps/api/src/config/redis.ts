import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let connectionPromise: Promise<void> | null = null;

export async function initRedis(): Promise<void> {
  if (connectionPromise) return connectionPromise;
  
  connectionPromise = (async () => {
    try {
      redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.warn('Redis connection failed after 3 retries, disabling Redis features');
              return false;
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      redisClient.on('connect', () => {
        console.log('Redis client connected');
      });

      await redisClient.connect();
    } catch (error) {
      console.warn('Failed to connect to Redis:', error);
      redisClient = null;
    }
  })();
  
  return connectionPromise;
}

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    connectionPromise = null;
  }
}

// Initialize Redis on module load
if (process.env.NODE_ENV !== 'test') {
  initRedis().catch(err => {
    console.warn('Redis initialization failed:', err);
  });
}