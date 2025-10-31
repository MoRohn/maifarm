import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ElasticsearchTransport } from 'winston-elasticsearch';

export interface LogContext {
  userId?: string;
  farmId?: string;
  agentId?: string;
  taskId?: string;
  requestId?: string;
  sessionId?: string;
  [key: string]: any;
}

export interface StructuredLog {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  environment: string;
  version: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  performance?: {
    duration?: number;
    startTime?: string;
    endTime?: string;
  };
  metadata?: Record<string, any>;
}

export class LoggingService {
  private logger: winston.Logger;
  private service: string;
  private environment: string;
  private version: string;

  constructor(config?: {
    service?: string;
    environment?: string;
    version?: string;
    elasticsearchNode?: string;
    enableConsole?: boolean;
    enableFile?: boolean;
    enableElasticsearch?: boolean;
  }) {
    this.service = config?.service || 'maifarm';
    this.environment = config?.environment || process.env.NODE_ENV || 'development';
    this.version = config?.version || process.env.APP_VERSION || '1.0.0';

    const transports: winston.transport[] = [];

    // Console transport
    if (config?.enableConsole !== false) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}] ${message}${metaStr}`;
          })
        )
      }));
    }

    // File transport with rotation
    if (config?.enableFile !== false) {
      const fileTransport = new DailyRotateFile({
        filename: 'logs/maifarm-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '100m',
        maxFiles: '30d',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      });

      transports.push(fileTransport);

      // Error log file
      const errorFileTransport = new DailyRotateFile({
        filename: 'logs/maifarm-error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '100m',
        maxFiles: '30d',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      });

      transports.push(errorFileTransport);
    }

    // Elasticsearch transport
    if (config?.enableElasticsearch && config.elasticsearchNode) {
      const esTransport = new ElasticsearchTransport({
        level: 'info',
        clientOpts: {
          node: config.elasticsearchNode,
          auth: {
            username: process.env.ELASTICSEARCH_USERNAME || '',
            password: process.env.ELASTICSEARCH_PASSWORD || ''
          }
        },
        index: `maifarm-logs-${this.environment}`,
        dataStream: true,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      });

      transports.push(esTransport);
    }

    // Create logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      defaultMeta: {
        service: this.service,
        environment: this.environment,
        version: this.version
      },
      transports
    });
  }

  // Core logging methods
  debug(message: string, context?: LogContext, metadata?: any): void {
    this.log('debug', message, context, metadata);
  }

  info(message: string, context?: LogContext, metadata?: any): void {
    this.log('info', message, context, metadata);
  }

  warn(message: string, context?: LogContext, metadata?: any): void {
    this.log('warn', message, context, metadata);
  }

  error(message: string, error?: Error | any, context?: LogContext, metadata?: any): void {
    const logData: any = {
      level: 'error',
      message,
      context,
      metadata
    };

    if (error) {
      logData.error = {
        name: error.name || 'Error',
        message: error.message || String(error),
        stack: error.stack
      };
    }

    this.logger.error(logData);
  }

  // Structured logging
  private log(level: string, message: string, context?: LogContext, metadata?: any): void {
    const logData: any = {
      message,
      context,
      metadata
    };

    this.logger.log(level, logData);
  }

  // Specialized logging methods
  logApiRequest(req: any, res: any, responseTime: number): void {
    const logData = {
      message: `${req.method} ${req.path}`,
      context: {
        requestId: req.id,
        userId: req.user?.id,
        sessionId: req.session?.id
      },
      metadata: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        query: req.query,
        params: req.params
      }
    };

    if (res.statusCode >= 400) {
      this.warn('API request failed', logData.context, logData.metadata);
    } else {
      this.info('API request completed', logData.context, logData.metadata);
    }
  }

  logFarmOperation(operation: string, farmId: string, result: 'success' | 'failure', details?: any): void {
    const message = `Farm operation: ${operation}`;
    const context = { farmId };
    const metadata = {
      operation,
      result,
      details
    };

    if (result === 'failure') {
      this.error(message, details?.error, context, metadata);
    } else {
      this.info(message, context, metadata);
    }
  }

  logAgentActivity(activity: string, agentId: string, farmId: string, details?: any): void {
    this.info(`Agent activity: ${activity}`, {
      agentId,
      farmId
    }, {
      activity,
      details
    });
  }

  logTaskExecution(taskId: string, agentId: string, status: string, duration?: number, error?: Error): void {
    const context = { taskId, agentId };
    const metadata = {
      status,
      duration
    };

    if (error) {
      this.error('Task execution failed', error, context, metadata);
    } else {
      this.info('Task execution completed', context, metadata);
    }
  }

  logWebSocketEvent(event: string, clientId: string, data?: any): void {
    this.debug(`WebSocket event: ${event}`, {
      sessionId: clientId
    }, {
      event,
      data
    });
  }

  logSecurityEvent(event: string, userId?: string, details?: any): void {
    this.warn(`Security event: ${event}`, {
      userId
    }, {
      event,
      details,
      timestamp: new Date().toISOString()
    });
  }

  logPerformanceMetric(metric: string, value: number, unit: string, context?: LogContext): void {
    this.info(`Performance metric: ${metric}`, context, {
      metric,
      value,
      unit
    });
  }

  // Audit logging
  logAuditEvent(action: string, userId: string, resourceType: string, resourceId: string, changes?: any): void {
    this.info('Audit event', {
      userId
    }, {
      action,
      resourceType,
      resourceId,
      changes,
      timestamp: new Date().toISOString()
    });
  }

  // Create child logger with additional context
  createChildLogger(defaultContext: LogContext): LoggingService {
    const childConfig = {
      service: this.service,
      environment: this.environment,
      version: this.version
    };

    const childLogger = new LoggingService(childConfig);
    
    // Override logging methods to include default context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: string, message: string, context?: LogContext, metadata?: any) => {
      originalLog(level, message, { ...defaultContext, ...context }, metadata);
    };

    return childLogger;
  }

  // Express middleware
  expressMiddleware() {
    return (req: any, res: any, next: any) => {
      const start = Date.now();
      
      // Generate request ID if not present
      req.id = req.id || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Log request start
      this.debug('Incoming request', {
        requestId: req.id
      }, {
        method: req.method,
        path: req.path,
        query: req.query
      });

      // Capture response
      const originalSend = res.send;
      res.send = function(data: any) {
        res.send = originalSend;
        const responseTime = Date.now() - start;
        
        // Log request completion
        this.logApiRequest(req, res, responseTime);
        
        return res.send(data);
      }.bind(this);

      next();
    };
  }

  // Error middleware
  errorMiddleware() {
    return (err: Error, req: any, res: any, next: any) => {
      this.error('Unhandled error in request', err, {
        requestId: req.id,
        userId: req.user?.id
      }, {
        method: req.method,
        path: req.path,
        query: req.query,
        body: req.body
      });

      res.status(500).json({
        error: 'Internal server error',
        requestId: req.id
      });
    };
  }

  // Query logs (useful for debugging)
  async queryLogs(filters: {
    level?: string;
    startTime?: Date;
    endTime?: Date;
    context?: Partial<LogContext>;
    limit?: number;
  }): Promise<StructuredLog[]> {
    // This would typically query Elasticsearch or read from files
    // For now, returning empty array as placeholder
    return [];
  }

  // Export logs (for compliance/auditing)
  async exportLogs(startDate: Date, endDate: Date, format: 'json' | 'csv'): Promise<string> {
    const logs = await this.queryLogs({
      startTime: startDate,
      endTime: endDate
    });

    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['timestamp', 'level', 'message', 'service', 'userId', 'farmId', 'agentId'];
      const rows = logs.map(log => [
        log.timestamp,
        log.level,
        log.message,
        log.service,
        log.context?.userId || '',
        log.context?.farmId || '',
        log.context?.agentId || ''
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(logs, null, 2);
  }
}

// Export singleton instance
export const logger = new LoggingService({
  enableConsole: true,
  enableFile: true,
  enableElasticsearch: !!process.env.ELASTICSEARCH_NODE,
  elasticsearchNode: process.env.ELASTICSEARCH_NODE
});