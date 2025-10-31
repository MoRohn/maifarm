import { Request, Response, NextFunction } from 'express';
import { monitoringMetrics } from '../routes/monitoring';

// Extend Express Request type to include metrics
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
      metrics?: {
        route?: string;
        method?: string;
        statusCode?: number;
      };
    }
  }
}

// Middleware to track HTTP request metrics
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  req.startTime = Date.now();
  
  // Store original end function
  const originalEnd = res.end;
  const originalJson = res.json;
  const originalSend = res.send;

  // Override end function to capture metrics
  res.end = function(...args: any[]) {
    recordMetrics(req, res);
    return originalEnd.apply(res, args);
  };

  // Override json function to capture metrics
  res.json = function(body: any) {
    recordMetrics(req, res);
    return originalJson.call(res, body);
  };

  // Override send function to capture metrics
  res.send = function(body: any) {
    recordMetrics(req, res);
    return originalSend.call(res, body);
  };

  next();
}

// Function to record metrics
function recordMetrics(req: Request, res: Response) {
  if (!req.startTime) return;

  const duration = (Date.now() - req.startTime) / 1000; // Convert to seconds
  const route = req.route?.path || req.path || 'unknown';
  const method = req.method;
  const status = res.statusCode.toString();

  // Record HTTP request duration
  monitoringMetrics.httpRequestDuration
    .labels(method, route, status)
    .observe(duration);

  // Log slow requests
  if (duration > 1) { // Log requests taking more than 1 second
    console.warn(`Slow request: ${method} ${route} took ${duration.toFixed(3)}s`);
  }
}

// Middleware to track active connections
export function connectionTrackingMiddleware(req: Request, res: Response, next: NextFunction) {
  // Increment active connections
  const activeConnections = monitoringMetrics.activeAgentsGauge;
  
  res.on('finish', () => {
    // Decrement when response is finished
  });

  res.on('close', () => {
    // Handle connection close
  });

  next();
}

// Middleware to track resource utilization
export function resourceTrackingMiddleware(req: Request, res: Response, next: NextFunction) {
  const memoryUsage = process.memoryUsage();
  const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

  // Update resource utilization metrics
  monitoringMetrics.resourceUtilizationGauge
    .labels('memory', 'server')
    .set(heapUsedPercentage);

  // Track CPU usage (simplified - in production use more sophisticated tracking)
  const cpuUsage = process.cpuUsage();
  const cpuPercentage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to percentage

  monitoringMetrics.resourceUtilizationGauge
    .labels('cpu', 'server')
    .set(cpuPercentage);

  next();
}

// Error tracking middleware
export function errorTrackingMiddleware(err: Error, req: Request, res: Response, next: NextFunction) {
  // Log error
  console.error('Request error:', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
    headers: req.headers
  });

  // Track error metrics
  monitoringMetrics.httpRequestDuration
    .labels(req.method, req.path, '500')
    .observe((Date.now() - (req.startTime || Date.now())) / 1000);

  // Send error response
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
    timestamp: new Date()
  });
}

// Request logging middleware
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    query: req.query,
    body: req.body,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    }
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
}

// Rate limiting middleware for metrics endpoints
export function metricsRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  // Simple in-memory rate limiting for metrics endpoints
  // In production, use Redis or similar for distributed rate limiting
  const clientIp = req.ip || req.connection.remoteAddress;
  const rateLimitKey = `metrics_${clientIp}`;
  
  // Allow metrics scraping but limit to reasonable intervals
  // This is a simplified implementation
  next();
}

// Middleware to inject monitoring context
export function monitoringContextMiddleware(req: Request, res: Response, next: NextFunction) {
  // Add correlation ID for request tracking
  const correlationId = req.headers['x-correlation-id'] || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  req.headers['x-correlation-id'] = correlationId as string;
  res.setHeader('X-Correlation-ID', correlationId);

  // Add timing headers
  res.setHeader('X-Response-Time', '0ms');
  
  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1000000; // Convert to ms
    res.setHeader('X-Response-Time', `${responseTime.toFixed(2)}ms`);
  });

  next();
}