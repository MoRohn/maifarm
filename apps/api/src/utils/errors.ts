/**
 * Custom error classes and error handling utilities
 * Provides structured error handling for the application
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error class for request validation failures
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, true, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication error class
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, true, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error class
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, true, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, true, 'NOT_FOUND');
  }
}

/**
 * Conflict error class (e.g., duplicate resources)
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, true, 'CONFLICT');
  }
}

/**
 * Rate limit error class
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, true, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Database error class
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, false, 'DATABASE_ERROR', details);
  }
}

/**
 * External service error class
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: any) {
    super(`${service}: ${message}`, 503, true, 'EXTERNAL_SERVICE_ERROR', details);
  }
}

/**
 * Async error handler wrapper
 * Wraps async route handlers to catch errors
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Default error values
  let statusCode = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';
  let details = undefined;
  let isOperational = false;

  // Handle known application errors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code || code;
    details = err.details;
    isOperational = err.isOperational;
  } 
  // Handle validation errors from libraries
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
    code = 'VALIDATION_ERROR';
    isOperational = true;
  }
  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
    isOperational = true;
  }
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
    isOperational = true;
  }
  // Handle Postgres errors
  else if ((err as any).code === '23505') {
    statusCode = 409;
    message = 'Duplicate entry';
    code = 'DUPLICATE_ENTRY';
    isOperational = true;
  }

  // Log error
  const errorInfo = {
    statusCode,
    code,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    headers: req.headers,
    isOperational,
  };

  if (statusCode >= 500) {
    logger.error('Server error occurred', errorInfo);
  } else if (statusCode >= 400) {
    logger.warn('Client error occurred', errorInfo);
  }

  // Send error response
  const response: any = {
    success: false,
    error: {
      code,
      message,
      statusCode,
    },
  };

  // Include details in development mode
  if (process.env.NODE_ENV === 'development' && details) {
    response.error.details = details;
  }

  // Include stack trace in development mode for non-operational errors
  if (process.env.NODE_ENV === 'development' && !isOperational) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404,
    },
  });
}

/**
 * Unhandled rejection handler
 */
export function handleUnhandledRejection(reason: any, promise: Promise<any>): void {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise,
  });

  // In production, we might want to gracefully shutdown
  if (process.env.NODE_ENV === 'production') {
    // Give the server time to respond to pending requests
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  }
}

/**
 * Uncaught exception handler
 */
export function handleUncaughtException(error: Error): void {
  logger.error('Uncaught Exception', {
    message: error.message,
    stack: error.stack,
  });

  // Shutdown gracefully
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Register global error handlers
process.on('unhandledRejection', handleUnhandledRejection);
process.on('uncaughtException', handleUncaughtException);

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
};