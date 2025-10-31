import { Request, Response, NextFunction } from 'express';
import { addLog } from '../routes/logs';
import { alertManager } from '../monitoring/alertManager';

interface ErrorWithCode extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

// Global error handler middleware
export function errorHandlerMiddleware(err: ErrorWithCode, req: Request, res: Response, next: NextFunction) {
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const correlationId = req.headers['x-correlation-id'] as string || errorId;

  // Determine error details
  const statusCode = err.statusCode || 500;
  const errorType = getErrorType(err);
  const errorContext = extractErrorContext(req);

  // Log the error
  addLog({
    timestamp: new Date(),
    level: statusCode >= 500 ? 'error' : 'warn',
    source: 'error-handler',
    message: err.message,
    metadata: {
      errorId,
      errorType,
      code: err.code,
      statusCode,
      stack: err.stack,
      details: err.details,
      context: errorContext
    },
    correlationId
  });

  // Track error metrics
  trackErrorMetrics(err, req);

  // Create alert for critical errors
  if (statusCode >= 500) {
    createErrorAlert(err, req, errorId);
  }

  // Send error response
  const response = {
    error: {
      id: errorId,
      message: getPublicErrorMessage(err),
      code: err.code || 'INTERNAL_ERROR',
      timestamp: new Date()
    }
  };

  // Include additional details in development
  if (process.env.NODE_ENV === 'development') {
    Object.assign(response.error, {
      stack: err.stack,
      details: err.details
    });
  }

  res.status(statusCode).json(response);
}

// Async error wrapper
export function asyncErrorWrapper(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Not found handler
export function notFoundHandler(req: Request, res: Response) {
  const error: ErrorWithCode = new Error(`Route not found: ${req.method} ${req.path}`);
  error.statusCode = 404;
  error.code = 'ROUTE_NOT_FOUND';
  
  throw error;
}

// Validation error handler
export function validationErrorHandler(errors: any[]): ErrorWithCode {
  const error: ErrorWithCode = new Error('Validation failed');
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  error.details = errors;
  
  return error;
}

// Helper functions
function getErrorType(err: ErrorWithCode): string {
  if (err.name) return err.name;
  if (err.code) return err.code;
  if (err.statusCode) {
    if (err.statusCode >= 500) return 'ServerError';
    if (err.statusCode >= 400) return 'ClientError';
  }
  return 'UnknownError';
}

function extractErrorContext(req: Request): any {
  return {
    method: req.method,
    path: req.path,
    query: req.query,
    params: req.params,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
      'x-forwarded-for': req.headers['x-forwarded-for']
    },
    ip: req.ip || req.connection.remoteAddress,
    userId: req.headers['x-user-id'],
    agentId: req.params.agentId || req.query.agentId,
    farmId: req.params.farmId || req.query.farmId
  };
}

function getPublicErrorMessage(err: ErrorWithCode): string {
  // Don't expose internal error messages in production
  if (process.env.NODE_ENV === 'production' && (!err.statusCode || err.statusCode >= 500)) {
    return 'An internal error occurred. Please try again later.';
  }
  
  return err.message;
}

function trackErrorMetrics(err: ErrorWithCode, req: Request) {
  // Import metrics from monitoring routes
  import('../routes/monitoring').then(({ monitoringMetrics }) => {
    const labels = {
      method: req.method,
      route: req.route?.path || req.path || 'unknown',
      status: (err.statusCode || 500).toString()
    };

    // Track error occurrence
    monitoringMetrics.httpRequestDuration
      .labels(labels.method, labels.route, labels.status)
      .observe(0); // Duration is 0 for errors thrown before response
  });
}

async function createErrorAlert(err: ErrorWithCode, req: Request, errorId: string) {
  try {
    await alertManager.createAlert({
      severity: 'critical',
      title: `Server Error: ${err.message}`,
      description: `A server error occurred processing ${req.method} ${req.path}`,
      source: 'error-handler',
      metadata: {
        errorId,
        errorType: getErrorType(err),
        statusCode: err.statusCode || 500,
        path: req.path,
        method: req.method
      }
    });
  } catch (alertError) {
    // Don't let alert creation failure affect error handling
    console.error('Failed to create error alert:', alertError);
  }
}

// Uncaught exception handler
export function setupGlobalErrorHandlers() {
  process.on('uncaughtException', (err: Error) => {
    console.error('Uncaught Exception:', err);
    
    addLog({
      timestamp: new Date(),
      level: 'error',
      source: 'process',
      message: `Uncaught exception: ${err.message}`,
      metadata: {
        stack: err.stack,
        type: 'uncaughtException'
      }
    });

    // Give time for logs to be written before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    addLog({
      timestamp: new Date(),
      level: 'error',
      source: 'process',
      message: `Unhandled promise rejection: ${reason}`,
      metadata: {
        reason,
        type: 'unhandledRejection'
      }
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, starting graceful shutdown...');
    
    addLog({
      timestamp: new Date(),
      level: 'info',
      source: 'process',
      message: 'Graceful shutdown initiated',
      metadata: {
        signal: 'SIGTERM'
      }
    });

    // Implement graceful shutdown logic here
    process.exit(0);
  });
}

// Circuit breaker middleware for external service calls
export function circuitBreakerMiddleware(serviceName: string, options = {}) {
  const defaults = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 60000 // 1 minute
  };

  const config = { ...defaults, ...options };
  const states = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half-open' };
  
  let state = states.CLOSED;
  let failures = 0;
  let lastFailureTime: number | null = null;
  let successCount = 0;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if circuit is open
    if (state === states.OPEN) {
      const now = Date.now();
      if (lastFailureTime && now - lastFailureTime > config.resetTimeout) {
        state = states.HALF_OPEN;
        failures = 0;
      } else {
        const error: ErrorWithCode = new Error(`Circuit breaker is open for ${serviceName}`);
        error.statusCode = 503;
        error.code = 'SERVICE_UNAVAILABLE';
        return next(error);
      }
    }

    try {
      // Proceed with the request
      const originalSend = res.send;
      const originalJson = res.json;

      const checkResponse = () => {
        if (res.statusCode >= 500) {
          handleFailure();
        } else {
          handleSuccess();
        }
      };

      res.send = function(data: any) {
        checkResponse();
        return originalSend.call(res, data);
      };

      res.json = function(data: any) {
        checkResponse();
        return originalJson.call(res, data);
      };

      next();
    } catch (error) {
      handleFailure();
      next(error);
    }
  };

  function handleFailure() {
    failures++;
    lastFailureTime = Date.now();

    if (failures >= config.failureThreshold) {
      state = states.OPEN;
      
      addLog({
        timestamp: new Date(),
        level: 'error',
        source: 'circuit-breaker',
        message: `Circuit breaker opened for ${serviceName}`,
        metadata: {
          serviceName,
          failures,
          threshold: config.failureThreshold
        }
      });
    }
  }

  function handleSuccess() {
    if (state === states.HALF_OPEN) {
      successCount++;
      if (successCount >= 3) { // Require 3 successful requests to close
        state = states.CLOSED;
        failures = 0;
        successCount = 0;
        
        addLog({
          timestamp: new Date(),
          level: 'info',
          source: 'circuit-breaker',
          message: `Circuit breaker closed for ${serviceName}`,
          metadata: { serviceName }
        });
      }
    }
  }
}