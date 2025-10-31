/**
 * Enhanced Rate Limiting Middleware
 * Provides advanced rate limiting with multiple strategies
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { productionConfig } from '../config/production';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  statusCode?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  handler?: (req: Request, res: Response) => void;
  onLimitReached?: (req: Request, res: Response) => void;
  store?: RateLimitStore;
}

export interface RateLimitStore {
  increment(key: string): Promise<RateLimitInfo>;
  decrement(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

export interface RateLimitInfo {
  count: number;
  resetTime: Date;
  remaining: number;
}

/**
 * Redis-based rate limit store
 */
class RedisStore implements RateLimitStore {
  constructor(
    private windowMs: number,
    private maxRequests: number
  ) {}

  async increment(key: string): Promise<RateLimitInfo> {
    const multi = redis.multi();
    const now = Date.now();
    const resetTime = now + this.windowMs;
    const redisKey = `rate-limit:${key}`;

    // Use Redis INCR and EXPIRE in a transaction
    multi.incr(redisKey);
    multi.expire(redisKey, Math.ceil(this.windowMs / 1000));

    const results = await multi.exec();
    const count = results?.[0]?.[1] as number || 1;

    return {
      count,
      resetTime: new Date(resetTime),
      remaining: Math.max(0, this.maxRequests - count)
    };
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `rate-limit:${key}`;
    await redis.decr(redisKey);
  }

  async reset(key: string): Promise<void> {
    const redisKey = `rate-limit:${key}`;
    await redis.del(redisKey);
  }
}

/**
 * In-memory rate limit store (fallback)
 */
class MemoryStore implements RateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private windowMs: number,
    private maxRequests: number
  ) {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async increment(key: string): Promise<RateLimitInfo> {
    const now = Date.now();
    const resetTime = now + this.windowMs;

    let entry = this.store.get(key);

    if (!entry || entry.resetTime < now) {
      entry = { count: 1, resetTime };
    } else {
      entry.count++;
    }

    this.store.set(key, entry);

    return {
      count: entry.count,
      resetTime: new Date(entry.resetTime),
      remaining: Math.max(0, this.maxRequests - entry.count)
    };
  }

  async decrement(key: string): Promise<void> {
    const entry = this.store.get(key);
    if (entry && entry.count > 0) {
      entry.count--;
      this.store.set(key, entry);
    }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

/**
 * Default key generator
 */
function defaultKeyGenerator(req: Request): string {
  // Use IP address by default, with support for proxies
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Create rate limiting middleware
 */
export function createRateLimiter(options: Partial<RateLimitOptions> = {}): (req: Request, res: Response, next: NextFunction) => void {
  const config: RateLimitOptions = {
    windowMs: options.windowMs || productionConfig.security.rateLimitWindow,
    maxRequests: options.maxRequests || productionConfig.security.rateLimitMax,
    message: options.message || 'Too many requests, please try again later.',
    statusCode: options.statusCode || 429,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    keyGenerator: options.keyGenerator || defaultKeyGenerator,
    skip: options.skip,
    handler: options.handler,
    onLimitReached: options.onLimitReached,
    store: options.store
  };

  // Initialize store if not provided
  if (!config.store) {
    config.store = redis
      ? new RedisStore(config.windowMs, config.maxRequests)
      : new MemoryStore(config.windowMs, config.maxRequests);
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if configured
    if (config.skip && await config.skip(req)) {
      return next();
    }

    // Skip if rate limiting is disabled
    if (!productionConfig.security.enableRateLimit) {
      return next();
    }

    const key = config.keyGenerator!(req);

    try {
      const info = await config.store!.increment(key);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', info.remaining);
      res.setHeader('X-RateLimit-Reset', info.resetTime.toISOString());

      // Check if limit exceeded
      if (info.count > config.maxRequests) {
        res.setHeader('Retry-After', Math.ceil(config.windowMs / 1000));

        logger.warn(LogCategory.SECURITY, `Rate limit exceeded for ${key}`, {
          ip: req.ip,
          path: req.path,
          count: info.count,
          limit: config.maxRequests
        });

        // Call custom handler if provided
        if (config.handler) {
          return config.handler(req, res);
        }

        // Call onLimitReached callback if provided
        if (config.onLimitReached) {
          config.onLimitReached(req, res);
        }

        return res.status(config.statusCode).json({
          error: config.message,
          retryAfter: Math.ceil(config.windowMs / 1000)
        });
      }

      // Handle response based on status
      const originalSend = res.send;
      res.send = function(data) {
        res.send = originalSend;

        // Decrement count for successful requests if configured
        if (config.skipSuccessfulRequests && res.statusCode < 400) {
          config.store!.decrement(key);
        }

        // Decrement count for failed requests if configured
        if (config.skipFailedRequests && res.statusCode >= 400) {
          config.store!.decrement(key);
        }

        return res.send(data);
      };

      next();
    } catch (error) {
      logger.error(LogCategory.MIDDLEWARE, 'Rate limiting error:', error);
      // Continue without rate limiting on error
      next();
    }
  };
}

/**
 * Create different rate limiters for different endpoints
 */
export const rateLimiters = {
  // General API rate limiting
  general: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100
  }),

  // Strict rate limiting for auth endpoints
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later.'
  }),

  // Lenient rate limiting for read operations
  read: createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 100,
    skipSuccessfulRequests: true
  }),

  // Strict rate limiting for write operations
  write: createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 20
  }),

  // Rate limiting for farm creation
  farmCreation: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Farm creation limit reached, please try again later.'
  }),

  // Rate limiting for AI operations
  ai: createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 30,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?.id || req.ip || 'unknown';
    }
  }),

  // WebSocket connection rate limiting
  websocket: createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 10,
    message: 'Too many WebSocket connections, please try again later.'
  })
};

/**
 * Dynamic rate limiting based on user tier or role
 */
export function createDynamicRateLimiter(): (req: Request, res: Response, next: NextFunction) => void {
  return createRateLimiter({
    keyGenerator: (req) => {
      return req.user?.id || req.ip || 'unknown';
    },
    maxRequests: 100,
    windowMs: 15 * 60 * 1000,
    skip: async (req) => {
      // Skip rate limiting for admin users
      if (req.user?.role === 'admin') {
        return true;
      }

      // Skip for internal requests
      if (req.headers['x-internal-request'] === 'true') {
        return true;
      }

      return false;
    },
    handler: (req, res) => {
      // Custom handling for different user types
      const userTier = req.user?.tier || 'free';
      const limits = {
        free: 100,
        basic: 500,
        pro: 2000,
        enterprise: 10000
      };

      res.status(429).json({
        error: 'Rate limit exceeded',
        currentTier: userTier,
        limit: limits[userTier as keyof typeof limits],
        upgrade: userTier !== 'enterprise' ? 'Upgrade your plan for higher limits' : undefined
      });
    }
  });
}

/**
 * IP-based blocking for suspicious activity
 */
export class IPBlocker {
  private static blockedIPs: Set<string> = new Set();
  private static suspiciousActivity: Map<string, number> = new Map();

  static block(ip: string, duration = 3600000): void {
    this.blockedIPs.add(ip);
    logger.warn(LogCategory.SECURITY, `IP blocked: ${ip}`);

    // Auto-unblock after duration
    setTimeout(() => {
      this.unblock(ip);
    }, duration);
  }

  static unblock(ip: string): void {
    this.blockedIPs.delete(ip);
    this.suspiciousActivity.delete(ip);
    logger.info(LogCategory.SECURITY, `IP unblocked: ${ip}`);
  }

  static isBlocked(ip: string): boolean {
    return this.blockedIPs.has(ip);
  }

  static recordSuspiciousActivity(ip: string): void {
    const count = (this.suspiciousActivity.get(ip) || 0) + 1;
    this.suspiciousActivity.set(ip, count);

    // Auto-block after threshold
    if (count >= 10) {
      this.block(ip);
    }
  }

  static middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';

      if (this.isBlocked(ip)) {
        logger.warn(LogCategory.SECURITY, `Blocked IP attempted access: ${ip}`);
        return res.status(403).json({ error: 'Access denied' });
      }

      next();
    };
  }
}

// Export main rate limiter
export const rateLimiter = rateLimiters.general;