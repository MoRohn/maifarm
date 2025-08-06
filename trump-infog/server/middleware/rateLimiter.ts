import rateLimit from 'express-rate-limit'
import { Request, Response } from 'express'

/**
 * Create rate limiter with custom configuration
 */
export const createRateLimiter = (
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  max: number = 100, // limit each IP to 100 requests per windowMs
  message: string = 'Too many requests from this IP, please try again later.'
) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: {
        message,
        retryAfter: windowMs / 1000
      }
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req: Request) => {
      // Use x-forwarded-for if behind a proxy
      return req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
    },
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: {
          message,
          retryAfter: windowMs / 1000
        }
      })
    }
  })
}

/**
 * General API rate limiter
 */
export const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100 // 100 requests per 15 minutes
)

/**
 * Strict rate limiter for resource-intensive operations
 */
export const strictLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  10 // 10 requests per 15 minutes
)

/**
 * Data collection rate limiter
 */
export const collectionLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  20 // 20 collection requests per hour
)

/**
 * Authentication rate limiter
 */
export const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5 // 5 auth attempts per 15 minutes
)

/**
 * Dynamic rate limiter based on API key tiers
 */
export const tieredRateLimiter = (req: Request, res: Response, next: Function) => {
  const apiKey = req.headers['x-api-key'] as string
  
  // Define tier limits
  const tiers = {
    premium: { windowMs: 15 * 60 * 1000, max: 1000 },
    standard: { windowMs: 15 * 60 * 1000, max: 100 },
    free: { windowMs: 15 * 60 * 1000, max: 20 }
  }
  
  // Determine tier based on API key (simplified logic)
  let tier: keyof typeof tiers = 'free'
  
  if (apiKey) {
    // In a real implementation, you would check the API key against a database
    if (apiKey.startsWith('premium_')) {
      tier = 'premium'
    } else if (apiKey.startsWith('standard_')) {
      tier = 'standard'
    }
  }
  
  const limiter = createRateLimiter(
    tiers[tier].windowMs,
    tiers[tier].max,
    `Rate limit exceeded for ${tier} tier. Please upgrade for higher limits.`
  )
  
  limiter(req, res, next)
}