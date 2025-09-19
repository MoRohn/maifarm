/**
 * Advanced Rate Limiting Middleware
 * Implements token bucket algorithm with cost-based limiting
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { AuthRequest } from './auth';

interface RateLimitConfig {
  windowMs: number;          // Time window in milliseconds
  maxRequests: number;       // Max requests per window
  costMultiplier?: number;   // Cost multiplier for expensive operations
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  message?: string;
  headers?: boolean;
  burst?: number;           // Allow burst requests
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  burstCapacity: number;
}

class RateLimiter {
  private config: RateLimitConfig;
  private buckets: Map<string, TokenBucket> = new Map();

  constructor(config: RateLimitConfig) {
    this.config = {
      headers: true,
      burst: config.maxRequests * 1.5,
      ...config
    };

    // Cleanup old buckets periodically
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get or create token bucket for a key
   */
  private async getBucket(key: string): Promise<TokenBucket> {
    // Try to get from Redis first
    const redisKey = `ratelimit:${key}`;

    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn(LogCategory.MIDDLEWARE, 'Redis rate limit fetch failed', error);
    }

    // Create new bucket if not found
    const bucket: TokenBucket = {
      tokens: this.config.maxRequests,
      lastRefill: Date.now(),
      burstCapacity: this.config.burst || this.config.maxRequests
    };

    // Store in Redis with TTL
    try {
      // Use modern Redis API: set with EX option instead of deprecated setex
      await redis.set(
        redisKey,
        JSON.stringify(bucket),
        'EX',
        Math.ceil(this.config.windowMs / 1000)
      );
    } catch (error) {
      logger.warn(LogCategory.MIDDLEWARE, 'Redis rate limit store failed', error);
    }

    return bucket;
  }

  /**
   * Update bucket in storage
   */
  private async updateBucket(key: string, bucket: TokenBucket): Promise<void> {
    const redisKey = `ratelimit:${key}`;

    try {
      await redis.setex(
        redisKey,
        Math.ceil(this.config.windowMs / 1000),
        JSON.stringify(bucket)
      );
    } catch (error) {
      // Fall back to in-memory storage
      this.buckets.set(key, bucket);
    }
  }

  /**
   * Calculate tokens to refill based on time passed
   */
  private calculateRefill(bucket: TokenBucket): number {
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    return Math.floor(timePassed * refillRate);
  }

  /**
   * Middleware function
   */
  middleware() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      // Generate key for this request
      const key = this.config.keyGenerator
        ? this.config.keyGenerator(req)
        : this.getDefaultKey(req);

      // Get token bucket
      const bucket = await this.getBucket(key);

      // Refill tokens based on time passed
      const refillTokens = this.calculateRefill(bucket);
      bucket.tokens = Math.min(
        bucket.burstCapacity,
        bucket.tokens + refillTokens
      );
      bucket.lastRefill = Date.now();

      // Calculate cost of this request
      const cost = this.calculateCost(req);

      // Check if enough tokens available
      if (bucket.tokens < cost) {
        await this.updateBucket(key, bucket);

        // Set rate limit headers
        if (this.config.headers) {
          res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
          res.setHeader('X-RateLimit-Remaining', Math.max(0, bucket.tokens));
          res.setHeader('X-RateLimit-Reset', new Date(bucket.lastRefill + this.config.windowMs).toISOString());
          res.setHeader('Retry-After', Math.ceil(this.config.windowMs / 1000));
        }

        logger.warn(LogCategory.MIDDLEWARE, `Rate limit exceeded for ${key}`);

        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: this.config.message || 'Too many requests, please try again later',
            retryAfter: Math.ceil(this.config.windowMs / 1000)
          }
        });
      }

      // Consume tokens
      bucket.tokens -= cost;
      await this.updateBucket(key, bucket);

      // Set rate limit headers
      if (this.config.headers) {
        res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, bucket.tokens));
        res.setHeader('X-RateLimit-Reset', new Date(bucket.lastRefill + this.config.windowMs).toISOString());
      }

      next();
    };
  }

  /**
   * Generate default key for rate limiting
   */
  private getDefaultKey(req: AuthRequest): string {
    // Use user ID if authenticated
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }

    // Use IP address for anonymous requests
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Calculate cost of request based on operation
   */
  private calculateCost(req: Request): number {
    let cost = 1;

    // Increase cost for expensive operations
    if (req.method === 'POST' || req.method === 'PUT') {
      cost *= 2;
    }

    if (req.path.includes('/farms') && req.method === 'POST') {
      cost *= 5; // Farm creation is expensive
    }

    if (req.path.includes('/quick-task')) {
      cost *= 3; // Quick tasks consume resources
    }

    if (req.path.includes('/go-wild')) {
      cost *= 10; // GoWild mode is very expensive
    }

    // Apply custom multiplier
    if (this.config.costMultiplier) {
      cost *= this.config.costMultiplier;
    }

    return cost;
  }

  /**
   * Cleanup old buckets from memory
   */
  private cleanup(): void {
    const now = Date.now();
    const expiry = this.config.windowMs;

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > expiry) {
        this.buckets.delete(key);
      }
    }
  }
}

// Export pre-configured rate limiters

// Standard rate limit for API endpoints
export const standardRateLimit = new RateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 100,          // 100 requests per minute
  message: 'Too many requests from this IP, please try again later'
});

// Strict rate limit for authentication endpoints
export const authRateLimit = new RateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 5,            // 5 attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true
});

// Rate limit for expensive operations
export const expensiveRateLimit = new RateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 10,          // 10 requests per minute
  message: 'This operation is rate limited, please wait before trying again'
});

// Rate limit for farm creation
export const farmCreationRateLimit = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,          // 10 farms per hour
  message: 'Farm creation limit reached, please try again later'
});

// Rate limit for quick tasks
export const quickTaskRateLimit = new RateLimiter({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  maxRequests: 20,          // 20 tasks per 5 minutes
  burst: 30,                // Allow burst of 30
  message: 'Quick task limit reached, please wait before submitting more tasks'
});

// Dynamic rate limiter based on user tier
export class TieredRateLimiter {
  private tiers: Map<string, RateLimiter> = new Map();

  constructor() {
    // Free tier
    this.tiers.set('free', new RateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 50
    }));

    // Pro tier
    this.tiers.set('pro', new RateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 200,
      burst: 300
    }));

    // Enterprise tier
    this.tiers.set('enterprise', new RateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 1000,
      burst: 1500
    }));
  }

  middleware() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      // Determine user tier
      const tier = this.getUserTier(req);
      const limiter = this.tiers.get(tier) || this.tiers.get('free')!;

      // Apply the appropriate rate limit
      return limiter.middleware()(req, res, next);
    };
  }

  private getUserTier(req: AuthRequest): string {
    // This would be fetched from database based on user subscription
    // For now, return default tier
    if (!req.user) return 'free';

    // Example: Check user role or subscription
    if (req.user.roles?.includes('enterprise')) return 'enterprise';
    if (req.user.roles?.includes('pro')) return 'pro';

    return 'free';
  }
}

export const tieredRateLimit = new TieredRateLimiter();

// Circuit breaker for external API calls
export class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private lastFailTime: Map<string, number> = new Map();
  private state: Map<string, 'closed' | 'open' | 'half-open'> = new Map();

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private resetTime: number = 30000
  ) {}

  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    fallback?: () => T
  ): Promise<T> {
    const state = this.state.get(key) || 'closed';

    if (state === 'open') {
      const lastFail = this.lastFailTime.get(key) || 0;
      if (Date.now() - lastFail > this.resetTime) {
        this.state.set(key, 'half-open');
      } else {
        logger.warn(LogCategory.SYSTEM, `Circuit breaker open for ${key}`);
        if (fallback) return fallback();
        throw new Error('Service temporarily unavailable');
      }
    }

    try {
      const result = await fn();

      if (state === 'half-open') {
        this.state.set(key, 'closed');
        this.failures.delete(key);
      }

      return result;
    } catch (error) {
      const failures = (this.failures.get(key) || 0) + 1;
      this.failures.set(key, failures);
      this.lastFailTime.set(key, Date.now());

      if (failures >= this.threshold) {
        this.state.set(key, 'open');
        logger.error(LogCategory.SYSTEM, `Circuit breaker opened for ${key} after ${failures} failures`);
      }

      throw error;
    }
  }

  reset(key: string): void {
    this.state.delete(key);
    this.failures.delete(key);
    this.lastFailTime.delete(key);
  }

  getState(key: string): string {
    return this.state.get(key) || 'closed';
  }
}

export const apiCircuitBreaker = new CircuitBreaker();