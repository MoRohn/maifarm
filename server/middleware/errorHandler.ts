import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/api';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: any;
}

/**
 * Create a standardized error
 */
export class ApiError extends Error implements AppError {
  statusCode: number;
  code: string;
  isOperational: boolean;
  details?: any;

  constructor(
    statusCode: number,
    message: string,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Not found error handler
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new ApiError(
    404,
    `Resource not found: ${req.originalUrl}`,
    'NOT_FOUND'
  );
  next(error);
};

/**
 * Global error handler middleware
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Default to 500 server error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_ERROR';
  
  // Log the error
  const errorInfo = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    statusCode,
    code,
    message,
    stack: err.stack,
    body: req.body,
    query: req.query,
    params: req.params,
    headers: req.headers,
    timestamp: new Date().toISOString()
  };
  
  // Log based on severity
  if (statusCode >= 500) {
    logger.error('SERVER_ERROR', 'Internal server error occurred', errorInfo);
  } else if (statusCode >= 400) {
    logger.warn('CLIENT_ERROR', 'Client error occurred', errorInfo);
  }
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid input data';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Unauthorized access';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (err.message?.includes('ECONNREFUSED')) {
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'Database connection failed';
  } else if (err.message?.includes('duplicate key')) {
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'Resource already exists';
  }
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(isDevelopment && err.details && { details: err.details }),
      ...(isDevelopment && err.stack && { stack: err.stack })
    }
  };
  
  res.status(statusCode).json(response);
};

/**
 * Database error handler
 */
export const handleDatabaseError = (error: any): AppError => {
  // PostgreSQL error codes
  const pgErrorMap: Record<string, { statusCode: number; code: string; message: string }> = {
    '23505': { statusCode: 409, code: 'DUPLICATE_ENTRY', message: 'Resource already exists' },
    '23503': { statusCode: 400, code: 'FOREIGN_KEY_VIOLATION', message: 'Referenced resource does not exist' },
    '23502': { statusCode: 400, code: 'NOT_NULL_VIOLATION', message: 'Required field is missing' },
    '22P02': { statusCode: 400, code: 'INVALID_INPUT', message: 'Invalid input syntax' },
    '42703': { statusCode: 500, code: 'COLUMN_NOT_FOUND', message: 'Database schema error' },
    '42P01': { statusCode: 500, code: 'TABLE_NOT_FOUND', message: 'Database table not found' },
    'ECONNREFUSED': { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database connection failed' },
  };
  
  const errorInfo = pgErrorMap[error.code] || pgErrorMap[error.errno];
  
  if (errorInfo) {
    return new ApiError(
      errorInfo.statusCode,
      errorInfo.message,
      errorInfo.code,
      true,
      { originalError: error.message }
    );
  }
  
  // Default database error
  return new ApiError(
    500,
    'Database operation failed',
    'DATABASE_ERROR',
    false,
    { originalError: error.message }
  );
};

/**
 * Validation error handler
 */
export const handleValidationError = (errors: any[]): AppError => {
  const formattedErrors = errors.map(err => ({
    field: err.param || err.path,
    message: err.msg || err.message,
    value: err.value
  }));
  
  return new ApiError(
    400,
    'Validation failed',
    'VALIDATION_ERROR',
    true,
    { errors: formattedErrors }
  );
};

/**
 * Rate limit error handler
 */
export const rateLimitHandler = (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  };
  res.status(429).json(response);
};

/**
 * Timeout error handler
 */
export const timeoutHandler = (req: Request, res: Response, next: NextFunction) => {
  res.setTimeout(60000, () => {
    const error = new ApiError(
      408,
      'Request timeout',
      'REQUEST_TIMEOUT'
    );
    next(error);
  });
  next();
};

/**
 * Graceful shutdown handler
 */
export const gracefulShutdown = (server: any) => {
  process.on('SIGTERM', () => {
    logger.info('SHUTDOWN', 'SIGTERM signal received: closing HTTP server');
    server.close(() => {
      logger.info('SHUTDOWN', 'HTTP server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    logger.info('SHUTDOWN', 'SIGINT signal received: closing HTTP server');
    server.close(() => {
      logger.info('SHUTDOWN', 'HTTP server closed');
      process.exit(0);
    });
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('UNCAUGHT_EXCEPTION', 'Uncaught exception occurred', { error: error.message, stack: error.stack });
    process.exit(1);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED_REJECTION', 'Unhandled promise rejection', { reason, promise });
    process.exit(1);
  });
};