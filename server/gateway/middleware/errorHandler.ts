import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

export class ApiError extends Error implements AppError {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Common API errors
export const ApiErrors = {
  BadRequest: (message: string, details?: any) => 
    new ApiError(400, 'BAD_REQUEST', message, details),
  
  Unauthorized: (message = 'Unauthorized') => 
    new ApiError(401, 'UNAUTHORIZED', message),
  
  Forbidden: (message = 'Forbidden') => 
    new ApiError(403, 'FORBIDDEN', message),
  
  NotFound: (resource: string) => 
    new ApiError(404, 'NOT_FOUND', `${resource} not found`),
  
  Conflict: (message: string, details?: any) => 
    new ApiError(409, 'CONFLICT', message, details),
  
  UnprocessableEntity: (message: string, details?: any) => 
    new ApiError(422, 'UNPROCESSABLE_ENTITY', message, details),
  
  TooManyRequests: (message = 'Too many requests') => 
    new ApiError(429, 'TOO_MANY_REQUESTS', message),
  
  InternalError: (message = 'Internal server error', details?: any) => 
    new ApiError(500, 'INTERNAL_ERROR', message, details),
  
  ServiceUnavailable: (message = 'Service temporarily unavailable') => 
    new ApiError(503, 'SERVICE_UNAVAILABLE', message)
};

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error details
  console.error('API Error:', {
    url: req.url,
    method: req.method,
    status: err.status || 500,
    code: err.code,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  
  // Determine status code
  const status = err.status || 500;
  
  // Build error response
  const errorResponse = {
    success: false,
    errors: [{
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? err.details : undefined
    }],
    meta: {
      timestamp: new Date().toISOString(),
      version: 'v2',
      requestId: req.headers['x-request-id'] as string
    }
  };
  
  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    errorResponse.errors[0].details = {
      ...errorResponse.errors[0].details,
      stack: err.stack.split('\n')
    };
  }
  
  res.status(status).json(errorResponse);
}

// Async error wrapper for route handlers
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}