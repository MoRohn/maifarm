import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

export interface RequestCache {
  response: any;
  timestamp: number;
  expiry: number;
}

/**
 * Request deduplication middleware for high-frequency endpoints
 * Prevents redundant processing of identical requests within a short time window
 */
export class RequestDeduplicator {
  private redis: Redis | null = null;
  private memoryCache = new Map<string, RequestCache>();
  private defaultTTL = 5000; // 5 seconds default TTL
  
  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      const { getRedisClient } = await import('../config/redis');
      this.redis = getRedisClient();
      
      if (this.redis) {
        logger.debug('[RequestDeduplicator] Redis cache enabled');
      } else {
        logger.debug('[RequestDeduplicator] Using in-memory cache fallback');
      }
    } catch (error) {
      logger.warn('[RequestDeduplicator] Redis initialization failed, using in-memory fallback:', error);
    }
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(req: Request, keyPrefix: string): string {
    const queryString = new URLSearchParams(req.query as any).toString();
    const pathKey = `${req.method}:${req.path}`;
    const fullKey = queryString ? `${pathKey}?${queryString}` : pathKey;
    return `${keyPrefix}:${Buffer.from(fullKey).toString('base64')}`;
  }

  /**
   * Get cached response
   */
  private async getCachedResponse(cacheKey: string): Promise<RequestCache | null> {
    try {
      if (this.redis) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() < parsed.expiry) {
            return parsed;
          } else {
            // Clean up expired entry
            await this.redis.del(cacheKey);
          }
        }
      } else {
        // Use in-memory fallback
        const cached = this.memoryCache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
          return cached;
        } else if (cached) {
          // Clean up expired entry
          this.memoryCache.delete(cacheKey);
        }
      }
    } catch (error) {
      logger.debug('[RequestDeduplicator] Failed to get cached response:', error);
    }
    
    return null;
  }

  /**
   * Store response in cache
   */
  private async setCachedResponse(cacheKey: string, response: any, ttlMs: number): Promise<void> {
    const cacheEntry: RequestCache = {
      response,
      timestamp: Date.now(),
      expiry: Date.now() + ttlMs
    };

    try {
      if (this.redis) {
        await this.redis.setEx(cacheKey, Math.ceil(ttlMs / 1000), JSON.stringify(cacheEntry));
      } else {
        this.memoryCache.set(cacheKey, cacheEntry);
        
        // Clean up old entries from memory cache
        if (this.memoryCache.size > 1000) {
          const now = Date.now();
          for (const [key, entry] of this.memoryCache.entries()) {
            if (now >= entry.expiry) {
              this.memoryCache.delete(key);
            }
          }
        }
      }
    } catch (error) {
      logger.debug('[RequestDeduplicator] Failed to cache response:', error);
    }
  }

  /**
   * Create deduplication middleware for specific endpoint
   */
  createMiddleware(keyPrefix: string, options: { ttl?: number; skipCache?: (req: Request) => boolean } = {}) {
    const ttl = options.ttl || this.defaultTTL;
    
    return async (req: Request, res: Response, next: NextFunction) => {
      // Skip cache if specified by options
      if (options.skipCache && options.skipCache(req)) {
        return next();
      }

      const cacheKey = this.generateCacheKey(req, keyPrefix);
      
      // Check for cached response
      const cached = await this.getCachedResponse(cacheKey);
      if (cached) {
        // Add cache headers
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Age', (Date.now() - cached.timestamp).toString());
        
        // Return cached response
        return res.json(cached.response);
      }

      // Intercept res.json to cache the response
      const originalJson = res.json.bind(res);
      let responseCached = false;

      res.json = function(obj: any) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300 && !responseCached) {
          responseCached = true;
          requestDeduplicator.setCachedResponse(cacheKey, obj, ttl).catch(err => {
            logger.debug('[RequestDeduplicator] Failed to cache response:', err);
          });
        }
        
        // Add cache headers
        this.setHeader('X-Cache', 'MISS');
        
        return originalJson(obj);
      };

      next();
    };
  }

  /**
   * Create early return middleware for known non-existent resources
   */
  createEarlyReturnMiddleware(keyPrefix: string, options: { ttl?: number } = {}) {
    const ttl = options.ttl || 60000; // 1 minute for negative cache
    
    return async (req: Request, res: Response, next: NextFunction) => {
      const cacheKey = `${keyPrefix}:not-found:${this.generateCacheKey(req, '')}`;
      
      // Check for cached "not found" response
      const cached = await this.getCachedResponse(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT-NOT-FOUND');
        return res.status(404).json({
          success: false,
          error: 'Resource not found',
          cached: true
        });
      }

      // Intercept 404 responses to cache them
      const originalStatus = res.status.bind(res);
      const originalJson = res.json.bind(res);
      
      res.status = function(code: number) {
        if (code === 404) {
          // Cache the 404 response
          requestDeduplicator.setCachedResponse(cacheKey, { 
            success: false, 
            error: 'Resource not found',
            cached: true 
          }, ttl).catch(err => {
            logger.debug('[RequestDeduplicator] Failed to cache 404 response:', err);
          });
        }
        return originalStatus(code);
      };

      next();
    };
  }

  /**
   * Clean up expired cache entries manually
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;

    // Clean up memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now >= entry.expiry) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[RequestDeduplicator] Cleaned up ${cleaned} expired cache entries`);
    }
  }
}

// Singleton instance
export const requestDeduplicator = new RequestDeduplicator();

// Schedule periodic cleanup
setInterval(() => {
  requestDeduplicator.cleanup().catch(err => {
    logger.debug('[RequestDeduplicator] Cleanup failed:', err);
  });
}, 60000); // Clean up every minute