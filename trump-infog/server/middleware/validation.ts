import { Request, Response, NextFunction } from 'express'
import { validationResult, ValidationChain } from 'express-validator'

/**
 * Validation middleware that checks for validation errors
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req)
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: errors.array()
      }
    })
  }
  
  next()
}

/**
 * Sanitize string input
 */
export const sanitizeString = (value: string): string => {
  if (typeof value !== 'string') return ''
  
  return value
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 5000) // Limit length
}

/**
 * Sanitize array input
 */
export const sanitizeArray = (value: any): string[] => {
  if (!Array.isArray(value)) return []
  
  return value
    .filter(item => typeof item === 'string')
    .map(item => sanitizeString(item))
    .slice(0, 100) // Limit array size
}

/**
 * Validate UUID format
 */
export const isValidUUID = (value: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

/**
 * Validate date format
 */
export const isValidDate = (value: string): boolean => {
  const date = new Date(value)
  return !isNaN(date.getTime())
}

/**
 * Custom validation middleware for pagination
 */
export const validatePagination = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const limit = parseInt(req.query.limit as string) || 50
  const offset = parseInt(req.query.offset as string) || 0
  
  if (limit < 1 || limit > 100) {
    return res.status(400).json({
      error: {
        message: 'Invalid limit. Must be between 1 and 100'
      }
    })
  }
  
  if (offset < 0) {
    return res.status(400).json({
      error: {
        message: 'Invalid offset. Must be non-negative'
      }
    })
  }
  
  // Attach sanitized values to request
  req.query.limit = limit.toString()
  req.query.offset = offset.toString()
  
  next()
}

/**
 * Validate content type
 */
export const requireJSON = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    if (!req.is('application/json')) {
      return res.status(415).json({
        error: {
          message: 'Content-Type must be application/json'
        }
      })
    }
  }
  next()
}

/**
 * Validate request body size
 */
export const validateBodySize = (maxSize: number = 1048576) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0')
    
    if (contentLength > maxSize) {
      return res.status(413).json({
        error: {
          message: `Request body too large. Maximum size is ${maxSize} bytes`
        }
      })
    }
    
    next()
  }
}