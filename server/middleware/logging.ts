import { Request, Response, NextFunction } from 'express';
import { addLog } from '../routes/logs';

interface LogContext {
  correlationId: string;
  userId?: string;
  agentId?: string;
  farmId?: string;
  method: string;
  path: string;
  statusCode?: number;
  duration?: number;
  userAgent?: string;
  ip?: string;
}

// Structured logging middleware
export function structuredLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const correlationId = req.headers['x-correlation-id'] as string || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Extract context from request
  const context: LogContext = {
    correlationId,
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress
  };

  // Extract IDs from request if available
  if (req.params.agentId) context.agentId = req.params.agentId;
  if (req.params.farmId) context.farmId = req.params.farmId;
  if (req.query.agentId) context.agentId = req.query.agentId as string;
  if (req.query.farmId) context.farmId = req.query.farmId as string;

  // Log request
  addLog({
    timestamp: new Date(),
    level: 'info',
    source: 'http',
    message: `Incoming request: ${req.method} ${req.path}`,
    metadata: {
      ...context,
      query: req.query,
      headers: sanitizeHeaders(req.headers)
    },
    correlationId
  });

  // Capture response
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function(data: any) {
    context.statusCode = res.statusCode;
    context.duration = Date.now() - startTime;
    logResponse(context, data);
    return originalSend.call(res, data);
  };

  res.json = function(data: any) {
    context.statusCode = res.statusCode;
    context.duration = Date.now() - startTime;
    logResponse(context, data);
    return originalJson.call(res, data);
  };

  // Log errors
  res.on('error', (error) => {
    addLog({
      timestamp: new Date(),
      level: 'error',
      source: 'http',
      message: `Request error: ${error.message}`,
      metadata: {
        ...context,
        error: {
          message: error.message,
          stack: error.stack
        }
      },
      correlationId
    });
  });

  next();
}

// WebSocket logging middleware
export function websocketLoggingMiddleware(socket: any, next: NextFunction) {
  const clientId = socket.id;
  const correlationId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Log connection
  addLog({
    timestamp: new Date(),
    level: 'info',
    source: 'websocket',
    message: `WebSocket connection established`,
    metadata: {
      clientId,
      address: socket.handshake.address,
      headers: sanitizeHeaders(socket.handshake.headers)
    },
    correlationId
  });

  // Log all events
  const originalEmit = socket.emit;
  socket.emit = function(event: string, ...args: any[]) {
    addLog({
      timestamp: new Date(),
      level: 'debug',
      source: 'websocket',
      message: `WebSocket event sent: ${event}`,
      metadata: {
        clientId,
        event,
        dataSize: JSON.stringify(args).length
      },
      correlationId
    });
    return originalEmit.apply(socket, [event, ...args]);
  };

  // Log incoming events
  socket.onAny((event: string, ...args: any[]) => {
    addLog({
      timestamp: new Date(),
      level: 'debug',
      source: 'websocket',
      message: `WebSocket event received: ${event}`,
      metadata: {
        clientId,
        event,
        dataSize: JSON.stringify(args).length
      },
      correlationId
    });
  });

  // Log disconnection
  socket.on('disconnect', (reason: string) => {
    addLog({
      timestamp: new Date(),
      level: 'info',
      source: 'websocket',
      message: `WebSocket connection closed`,
      metadata: {
        clientId,
        reason
      },
      correlationId
    });
  });

  next();
}

// Audit logging for sensitive operations
export function auditLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const sensitiveRoutes = [
    '/api/alerts/rules',
    '/api/farms',
    '/api/agents',
    '/api/settings'
  ];

  const isSensitive = sensitiveRoutes.some(route => req.path.startsWith(route));
  
  if (isSensitive && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const auditEntry = {
      timestamp: new Date(),
      level: 'info' as const,
      source: 'audit',
      message: `Sensitive operation: ${req.method} ${req.path}`,
      metadata: {
        userId: req.headers['x-user-id'] || 'anonymous',
        method: req.method,
        path: req.path,
        body: sanitizeBody(req.body),
        ip: req.ip || req.connection.remoteAddress
      },
      correlationId: req.headers['x-correlation-id'] as string
    };

    addLog(auditEntry);
  }

  next();
}

// Helper functions
function sanitizeHeaders(headers: any): any {
  const sensitive = ['authorization', 'cookie', 'x-api-key'];
  const sanitized = { ...headers };
  
  sensitive.forEach(key => {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
}

function sanitizeBody(body: any): any {
  if (!body) return body;
  
  const sensitive = ['password', 'token', 'secret', 'apiKey'];
  const sanitized = { ...body };

  const sanitizeObject = (obj: any) => {
    for (const key in obj) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  sanitizeObject(sanitized);
  return sanitized;
}

function logResponse(context: LogContext, data: any) {
  const level = context.statusCode && context.statusCode >= 400 ? 'error' : 'info';
  
  addLog({
    timestamp: new Date(),
    level,
    source: 'http',
    message: `Response sent: ${context.statusCode} ${context.method} ${context.path}`,
    metadata: {
      ...context,
      responseSize: data ? JSON.stringify(data).length : 0
    },
    correlationId: context.correlationId,
    agentId: context.agentId,
    farmId: context.farmId
  });
}

// Performance logging for slow operations
export function performanceLoggingMiddleware(threshold: number = 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      if (duration > threshold) {
        addLog({
          timestamp: new Date(),
          level: 'warn',
          source: 'performance',
          message: `Slow request detected: ${req.method} ${req.path}`,
          metadata: {
            method: req.method,
            path: req.path,
            duration,
            threshold,
            statusCode: res.statusCode
          },
          correlationId: req.headers['x-correlation-id'] as string
        });
      }
    });

    next();
  };
}