import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../../config/redis.js';

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum number of requests per window
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests, please try again later.',
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const redis = getRedisClient();
    
    // If Redis is not available, skip rate limiting
    if (!redis) {
      console.warn('Redis not available, skipping rate limiting');
      return next();
    }
    
    const key = `ratelimit:${keyGenerator(req)}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    try {
      // Clean old entries and count current window requests
      await redis.zremrangebyscore(key, '-inf', windowStart);
      const count = await redis.zcard(key);
      
      // Check if limit exceeded
      if (count >= max) {
        // Get the oldest entry to calculate reset time
        const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const resetTime = oldestEntry.length > 1 
          ? parseInt(oldestEntry[1]) + windowMs 
          : now + windowMs;
        
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)));
        res.setHeader('Retry-After', String(Math.ceil((resetTime - now) / 1000)));
        
        return res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message,
            retryAfter: Math.ceil((resetTime - now) / 1000)
          }
        });
      }
      
      // Add current request to the window
      const requestId = `${now}:${Math.random()}`;
      await redis.zadd(key, now, requestId);
      await redis.expire(key, Math.ceil(windowMs / 1000));
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(max - count - 1));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));
      
      // Handle response to potentially skip counting
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalEnd = res.end;
        res.end = function(...args: any[]) {
          const shouldSkip = 
            (skipSuccessfulRequests && res.statusCode < 400) ||
            (skipFailedRequests && res.statusCode >= 400);
          
          if (shouldSkip) {
            // Remove this request from the count
            redis.zrem(key, requestId).catch(err => {
              console.error('Failed to remove request from rate limit:', err);
            });
          }
          
          return originalEnd.apply(res, args);
        };
      }
      
      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // On error, allow the request through
      next();
    }
  };
}

function defaultKeyGenerator(req: Request): string {
  // Use IP address as default key
  const ip = req.ip || 
             req.headers['x-forwarded-for'] || 
             req.socket.remoteAddress || 
             'unknown';
  
  // Include authenticated user ID if available
  const userId = (req as any).user?.id || 'anonymous';
  
  return `${ip}:${userId}`;
}

// Create specialized rate limiters for different endpoints
export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10 // 10 requests per minute
});

export const standardRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100 // 100 requests per minute
});

export const relaxedRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 500 // 500 requests per minute
});