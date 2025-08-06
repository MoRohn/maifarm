import { Request, Response, NextFunction } from 'express';
import { logger } from '../monitoring/logger';

export interface HttpError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

export class AppError extends Error implements HttpError {
  status: number;
  code: string;
  details?: any;

  constructor(message: string, status: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error types
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Too many requests', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`${service} service is temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE');
  }
}

// Error handler middleware
export const errorHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the error
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  logger.error('API Error', {
    errorId,
    message: err.message,
    status: err.status || 500,
    code: err.code || 'INTERNAL_ERROR',
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.id,
    stack: err.stack,
    details: err.details
  });

  // Prepare error response
  const status = err.status || 500;
  const response: any = {
    success: false,
    error: {
      id: errorId,
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred'
    }
  };

  // Include additional details in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
    response.error.details = err.details;
  }

  // Add retry-after header for rate limit errors
  if (status === 429 && err.details?.retryAfter) {
    res.setHeader('Retry-After', err.details.retryAfter);
  }

  res.status(status).json(response);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Not found handler
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
};

// Request validation middleware
export const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const details = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      next(new ValidationError('Validation failed', details));
    } else {
      next();
    }
  };
};