import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/api';

interface RateLimitStore {
  requests: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitStore>();

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export const rateLimit = (options: RateLimitOptions = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.ip || 'unknown',
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    let store = rateLimitStore.get(key);
    
    if (!store || now > store.resetTime) {
      store = {
        requests: 0,
        resetTime: now + windowMs
      };
      rateLimitStore.set(key, store);
    }
    
    store.requests++;
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - store.requests).toString());
    res.setHeader('X-RateLimit-Reset', new Date(store.resetTime).toISOString());
    
    if (store.requests > max) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          details: {
            retryAfter: Math.ceil((store.resetTime - now) / 1000)
          }
        }
      };
      
      res.setHeader('Retry-After', Math.ceil((store.resetTime - now) / 1000).toString());
      return res.status(429).json(response);
    }
    
    // Handle response to update counter based on success/failure
    const originalSend = res.send;
    res.send = function(data: any) {
      if (res.statusCode >= 400 && skipFailedRequests) {
        store!.requests--;
      } else if (res.statusCode < 400 && skipSuccessfulRequests) {
        store!.requests--;
      }
      return originalSend.call(this, data);
    };
    
    next();
  };
};

// API-specific rate limits
export const apiRateLimits = {
  // Strict limit for authentication endpoints
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many authentication attempts, please try again later'
  }),
  
  // Standard limit for general API endpoints
  standard: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
  }),
  
  // Relaxed limit for read-only endpoints
  read: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    skipSuccessfulRequests: true
  }),
  
  // Strict limit for write operations
  write: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50
  }),
  
  // Very strict limit for resource-intensive operations
  intensive: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'This operation is resource-intensive. Please wait before trying again.'
  }),
  
  // Relaxed limit for quick tasks
  quickTask: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Allow more quick tasks since they're lightweight
    message: 'Too many quick tasks, please try again later'
  })
};

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, store] of rateLimitStore.entries()) {
    if (now > store.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute