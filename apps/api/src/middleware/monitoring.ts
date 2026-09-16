import { Request, Response, NextFunction } from 'express';
import { db } from '../database/connection';
import { Histogram, Counter, Gauge } from 'prom-client';

// Prometheus metrics
const httpRequestDuration = new Histogram({
  name: 'maifarm_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10]
});

const httpRequestTotal = new Counter({
  name: 'maifarm_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const activeRequests = new Gauge({
  name: 'maifarm_active_requests',
  help: 'Number of active HTTP requests'
});

const slowRequestThreshold = new Gauge({
  name: 'maifarm_slow_requests_total',
  help: 'Total number of slow requests',
  labelNames: ['route']
});

export interface MonitoringRequest extends Request {
  startTime?: number;
  monitoringId?: string;
}

export const monitoringMiddleware = {
  /**
   * Track request metrics
   */
  request: (req: MonitoringRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    req.startTime = startTime;
    req.monitoringId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;

    // Increment active requests
    activeRequests.inc();

    // Track response
    const originalSend = res.send;
    res.send = function(data: any) {
      const duration = (Date.now() - startTime) / 1000;
      const route = req.route?.path || req.path || 'unknown';
      const method = req.method;
      const statusCode = res.statusCode.toString();

      // Update Prometheus metrics
      httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
      httpRequestTotal.inc({ method, route, status_code: statusCode });
      activeRequests.dec();

      // Log to database for detailed analysis
      if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
        db.query(
          `INSERT INTO api_metrics (endpoint, method, status_code, response_time, request_size, response_size, user_agent, ip_address, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            route,
            method,
            res.statusCode,
            duration * 1000, // Convert to milliseconds
            req.get('content-length') || 0,
            Buffer.byteLength(data),
            req.get('user-agent'),
            req.ip,
            new Date()
          ]
        ).catch(err => console.error('Failed to log request metrics:', err));
      }

      return originalSend.call(this, data);
    };

    next();
  },

  /**
   * Track performance for slow requests
   */
  performance: (thresholdMs = 1000) => {
    return (req: MonitoringRequest, res: Response, next: NextFunction) => {
      const checkPerformance = () => {
        if (req.startTime) {
          const duration = Date.now() - req.startTime;
          if (duration > thresholdMs) {
            const route = req.route?.path || req.path || 'unknown';
            slowRequestThreshold.inc({ route });
            
            // Only log if significantly slow
            if (duration > thresholdMs * 2) {
              console.warn(`Slow request detected: ${req.method} ${route} took ${duration}ms`);
            }
            
            // Log slow request for analysis (only if table exists)
            if (process.env.ENABLE_SLOW_REQUEST_LOGGING === 'true') {
              db.query(
                `INSERT INTO slow_requests (request_id, endpoint, method, duration, threshold, query_params, body_size, timestamp)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  req.monitoringId,
                  route,
                  req.method,
                  duration,
                  thresholdMs,
                  JSON.stringify(req.query),
                  req.get('content-length') || 0,
                  new Date()
                ]
              ).catch(err => {
                // Silently ignore if table doesn't exist
                if (!err.message?.includes('relation "slow_requests" does not exist')) {
                  console.error('Failed to log slow request:', err);
                }
              });
            }
          }
        }
      };

      // Check when response is sent
      const originalSend = res.send;
      res.send = function(data: any) {
        checkPerformance();
        return originalSend.call(this, data);
      };

      next();
    };
  },

  /**
   * Track resource usage
   */
  resource: (req: Request, res: Response, next: NextFunction) => {
    const interval = setInterval(() => {
      const usage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Log if memory usage is high
      const heapUsedMB = usage.heapUsed / 1024 / 1024;
      if (heapUsedMB > 500) {
        console.warn(`High memory usage detected: ${heapUsedMB.toFixed(2)}MB`);
        
        db.query(
          `INSERT INTO resource_alerts (type, metric, value, threshold, details, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            'memory',
            'heap_used',
            heapUsedMB,
            500,
            JSON.stringify({ ...usage, cpu: cpuUsage }),
            new Date()
          ]
        ).catch(err => console.error('Failed to log resource alert:', err));
      }
    }, 60000); // Check every minute

    // Clean up interval on response
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      clearInterval(interval);
      return originalEnd.apply(this, args);
    };

    next();
  },

  /**
   * Track error rates
   */
  errorTracking: (err: any, req: Request, res: Response, next: NextFunction) => {
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    
    // Log error to database
    db.query(
      `INSERT INTO application_errors (request_id, endpoint, method, error_type, error_message, stack_trace, user_agent, ip_address, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        (req as MonitoringRequest).monitoringId || 'unknown',
        route,
        method,
        err.name || 'Error',
        err.message,
        err.stack,
        req.get('user-agent'),
        req.ip,
        new Date()
      ]
    ).catch(dbErr => console.error('Failed to log error:', dbErr));

    // Pass to next error handler
    next(err);
  }
};

// Export metrics for external monitoring
export { httpRequestDuration, httpRequestTotal, activeRequests, slowRequestThreshold };