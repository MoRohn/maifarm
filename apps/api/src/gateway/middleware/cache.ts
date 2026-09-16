import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../../config/redis.js';
import crypto from 'crypto';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyPrefix?: string;
  excludePaths?: string[];
}

const DEFAULT_TTL = 300; // 5 minutes
const CACHE_VERSION = 'v2';

export function cacheMiddleware(options: CacheOptions = {}) {
  const { 
    ttl = DEFAULT_TTL, 
    keyPrefix = 'api:cache:',
    excludePaths = ['/system/health', '/realtime']
  } = options;
  
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Skip caching for excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Skip caching if no-cache header is present
    if (req.headers['cache-control'] === 'no-cache') {
      return next();
    }
    
    try {
      const redis = getRedisClient();
      if (!redis) {
        return next();
      }
      
      // Generate cache key based on URL and query params
      const cacheKey = generateCacheKey(req, keyPrefix);
      
      // Try to get cached response
      const cachedData = await redis.get(cacheKey);
      
      if (cachedData) {
        // Parse cached response
        const parsed = JSON.parse(cachedData);
        
        // Set cache metadata
        res.locals.cache = {
          hit: true,
          ttl: await redis.ttl(cacheKey),
          key: cacheKey
        };
        
        // Send cached response
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-TTL', String(await redis.ttl(cacheKey)));
        return res.json(parsed);
      }
      
      // Cache miss - store original send method
      const originalJson = res.json.bind(res);
      
      // Override json method to cache response
      res.json = function(data: any): Response {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Store in cache asynchronously
          redis.setEx(cacheKey, ttl, JSON.stringify(data)).catch(err => {
            console.error('Cache write error:', err);
          });
          
          // Set cache metadata
          res.locals.cache = {
            hit: false,
            ttl: ttl,
            key: cacheKey
          };
          
          res.setHeader('X-Cache', 'MISS');
          res.setHeader('X-Cache-TTL', String(ttl));
        }
        
        return originalJson(data);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

function generateCacheKey(req: Request, prefix: string): string {
  const components = [
    CACHE_VERSION,
    req.path,
    JSON.stringify(req.query),
    req.get('Authorization') || 'anonymous'
  ];
  
  const hash = crypto
    .createHash('sha256')
    .update(components.join(':'))
    .digest('hex');
  
  return `${prefix}${hash}`;
}

// Cache invalidation helper
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const redis = getRedisClient();
    if (!redis) return;
    
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Invalidated ${keys.length} cache entries matching pattern: ${pattern}`);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}