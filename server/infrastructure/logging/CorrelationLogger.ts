import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';
import fs from 'fs';

export interface LogContext {
  correlationId: string;
  userId?: string;
  farmId?: string;
  agentId?: string;
  sessionId?: string;
  requestId?: string;
  source?: string;
  parentSpanId?: string;
  spanId?: string;
  traceId?: string;
}

export interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
  context: LogContext;
  metadata?: any;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  performance?: {
    duration?: number;
    memory?: NodeJS.MemoryUsage;
    cpu?: NodeJS.CpuUsage;
  };
}

/**
 * Async Local Storage for correlation context
 */
const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

/**
 * Custom Winston format for structured logging
 */
const structuredFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const context = asyncLocalStorage.getStore() || {};
  const entry: LogEntry = {
    timestamp,
    level,
    message,
    context: {
      correlationId: context.correlationId || meta.correlationId || 'unknown',
      ...context,
      ...meta.context
    },
    metadata: meta.metadata,
    error: meta.error,
    performance: meta.performance
  };
  return JSON.stringify(entry);
});

/**
 * Enhanced Logger with correlation tracking
 */
export class CorrelationLogger {
  private static instance: CorrelationLogger;
  private logger: winston.Logger;
  private performanceTracking: Map<string, number> = new Map();
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;
  private logDirectory: string;

  private constructor() {
    this.logDirectory = path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
    
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        structuredFormat
      ),
      transports: [
        // Console transport with color
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        // File transport for all logs
        new winston.transports.File({
          filename: path.join(this.logDirectory, 'application.log'),
          maxsize: 10485760, // 10MB
          maxFiles: 5
        }),
        // Error log file
        new winston.transports.File({
          filename: path.join(this.logDirectory, 'error.log'),
          level: 'error',
          maxsize: 10485760,
          maxFiles: 5
        }),
        // Performance log file
        new winston.transports.File({
          filename: path.join(this.logDirectory, 'performance.log'),
          level: 'info',
          maxsize: 10485760,
          maxFiles: 3
        })
      ]
    });

    // Start buffer flusher
    this.startBufferFlusher();
  }

  static getInstance(): CorrelationLogger {
    if (!CorrelationLogger.instance) {
      CorrelationLogger.instance = new CorrelationLogger();
    }
    return CorrelationLogger.instance;
  }

  /**
   * Run function with correlation context
   */
  async runWithCorrelation<T>(
    context: Partial<LogContext>,
    fn: () => Promise<T>
  ): Promise<T> {
    const fullContext: LogContext = {
      correlationId: context.correlationId || uuidv4(),
      spanId: uuidv4(),
      ...context
    };

    return asyncLocalStorage.run(fullContext, fn);
  }

  /**
   * Get current correlation context
   */
  getContext(): LogContext | undefined {
    return asyncLocalStorage.getStore();
  }

  /**
   * Set correlation context property
   */
  setContextProperty(key: keyof LogContext, value: string): void {
    const context = asyncLocalStorage.getStore();
    if (context) {
      context[key] = value;
    }
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): ChildLogger {
    return new ChildLogger(this, additionalContext);
  }

  /**
   * Log methods with correlation
   */
  debug(message: string, metadata?: any): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: any): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: any): void {
    this.log('warn', message, metadata);
  }

  error(message: string, error?: Error | any, metadata?: any): void {
    const errorInfo = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    } : error;

    this.log('error', message, {
      ...metadata,
      error: errorInfo
    });
  }

  /**
   * Performance logging
   */
  startTimer(operationId: string): void {
    this.performanceTracking.set(operationId, Date.now());
  }

  endTimer(operationId: string, message: string, metadata?: any): void {
    const startTime = this.performanceTracking.get(operationId);
    if (!startTime) {
      this.warn(`Timer ${operationId} was not started`);
      return;
    }

    const duration = Date.now() - startTime;
    this.performanceTracking.delete(operationId);

    this.log('info', message, {
      ...metadata,
      performance: {
        duration,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    });
  }

  /**
   * Trace logging for distributed systems
   */
  trace(message: string, traceInfo: {
    service: string;
    operation: string;
    duration?: number;
    status: 'success' | 'failure';
    metadata?: any;
  }): void {
    const context = this.getContext();
    
    this.log('info', message, {
      trace: {
        traceId: context?.traceId || uuidv4(),
        spanId: context?.spanId || uuidv4(),
        parentSpanId: context?.parentSpanId,
        ...traceInfo
      }
    });
  }

  /**
   * Audit logging for compliance
   */
  audit(action: string, details: {
    userId: string;
    resourceType: string;
    resourceId: string;
    changes?: any;
    result: 'success' | 'failure';
    reason?: string;
  }): void {
    this.log('info', `AUDIT: ${action}`, {
      audit: {
        timestamp: new Date(),
        action,
        ...details
      }
    });
  }

  /**
   * Security logging
   */
  security(event: string, details: {
    userId?: string;
    ip?: string;
    userAgent?: string;
    threat?: string;
    action: string;
  }): void {
    this.log('warn', `SECURITY: ${event}`, {
      security: {
        timestamp: new Date(),
        event,
        ...details
      }
    });
  }

  /**
   * Core logging method
   */
  private log(level: string, message: string, metadata?: any): void {
    const context = this.getContext();
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: context || { correlationId: 'unknown' },
      metadata
    };

    // Add to buffer
    this.addToBuffer(entry);

    // Log using Winston
    this.logger.log(level, message, {
      correlationId: context?.correlationId,
      context,
      metadata
    });
  }

  /**
   * Add entry to buffer
   */
  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
  }

  /**
   * Search logs in buffer
   */
  searchLogs(criteria: {
    correlationId?: string;
    userId?: string;
    level?: string;
    startTime?: Date;
    endTime?: Date;
    message?: RegExp;
  }): LogEntry[] {
    return this.logBuffer.filter(entry => {
      if (criteria.correlationId && entry.context.correlationId !== criteria.correlationId) {
        return false;
      }
      if (criteria.userId && entry.context.userId !== criteria.userId) {
        return false;
      }
      if (criteria.level && entry.level !== criteria.level) {
        return false;
      }
      if (criteria.startTime && entry.timestamp < criteria.startTime) {
        return false;
      }
      if (criteria.endTime && entry.timestamp > criteria.endTime) {
        return false;
      }
      if (criteria.message && !criteria.message.test(entry.message)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get logs for correlation ID
   */
  getCorrelationLogs(correlationId: string): LogEntry[] {
    return this.searchLogs({ correlationId });
  }

  /**
   * Export logs to file
   */
  async exportLogs(
    filename: string,
    criteria?: Parameters<typeof this.searchLogs>[0]
  ): Promise<void> {
    const logs = criteria ? this.searchLogs(criteria) : this.logBuffer;
    const filePath = path.join(this.logDirectory, filename);
    
    await fs.promises.writeFile(
      filePath,
      logs.map(log => JSON.stringify(log)).join('\n')
    );
  }

  /**
   * Clear log buffer
   */
  clearBuffer(): void {
    this.logBuffer = [];
  }

  /**
   * Get log statistics
   */
  getStats(): {
    bufferSize: number;
    levels: Record<string, number>;
    recentErrors: LogEntry[];
    averageResponseTime?: number;
  } {
    const levels: Record<string, number> = {};
    const recentErrors: LogEntry[] = [];
    const responseTimes: number[] = [];

    this.logBuffer.forEach(entry => {
      levels[entry.level] = (levels[entry.level] || 0) + 1;
      
      if (entry.level === 'error') {
        recentErrors.push(entry);
      }
      
      if (entry.performance?.duration) {
        responseTimes.push(entry.performance.duration);
      }
    });

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : undefined;

    return {
      bufferSize: this.logBuffer.length,
      levels,
      recentErrors: recentErrors.slice(-10),
      averageResponseTime
    };
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  /**
   * Start buffer flusher
   */
  private startBufferFlusher(): void {
    setInterval(() => {
      // Trim buffer if too large
      if (this.logBuffer.length > this.maxBufferSize) {
        this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
      }
    }, 60000); // Every minute
  }
}

/**
 * Child logger with additional context
 */
class ChildLogger {
  constructor(
    private parent: CorrelationLogger,
    private additionalContext: Partial<LogContext>
  ) {}

  debug(message: string, metadata?: any): void {
    this.parent.runWithCorrelation(this.additionalContext, async () => {
      this.parent.debug(message, metadata);
    });
  }

  info(message: string, metadata?: any): void {
    this.parent.runWithCorrelation(this.additionalContext, async () => {
      this.parent.info(message, metadata);
    });
  }

  warn(message: string, metadata?: any): void {
    this.parent.runWithCorrelation(this.additionalContext, async () => {
      this.parent.warn(message, metadata);
    });
  }

  error(message: string, error?: Error | any, metadata?: any): void {
    this.parent.runWithCorrelation(this.additionalContext, async () => {
      this.parent.error(message, error, metadata);
    });
  }
}

// Export singleton instance
export const correlationLogger = CorrelationLogger.getInstance();

// Export convenience functions
export function withCorrelation<T>(
  context: Partial<LogContext>,
  fn: () => Promise<T>
): Promise<T> {
  return correlationLogger.runWithCorrelation(context, fn);
}

export function getCorrelationId(): string {
  return correlationLogger.getContext()?.correlationId || uuidv4();
}