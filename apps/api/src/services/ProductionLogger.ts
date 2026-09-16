/**
 * Production-Grade Logging Service
 *
 * Professional logging system following industry best practices:
 * - Structured logging with consistent formatting
 * - Log levels with proper filtering
 * - Performance-optimized (minimal overhead)
 * - Log rotation and retention
 * - Sensitive data masking
 * - Production-ready output formatting
 */

import { existsSync, mkdirSync, createWriteStream, WriteStream } from 'fs';
import { join } from 'path';
import { format } from 'util';

export enum LogLevel {
  FATAL = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5
}

export enum LogCategory {
  // Core system
  SYSTEM = 'SYSTEM',
  SERVER = 'SERVER',
  CONFIG = 'CONFIG',

  // Application layers
  API = 'API',
  DATABASE = 'DATABASE',
  CACHE = 'CACHE',

  // Business logic
  FARM = 'FARM',
  AGENT = 'AGENT',
  HARVEST = 'HARVEST',
  ORCHESTRATOR = 'ORCHESTRATOR',

  // Communication
  WEBSOCKET = 'WEBSOCKET',
  HTTP = 'HTTP',

  // Infrastructure
  TERMINAL = 'TERMINAL',
  SERVICES = 'SERVICES',
  HEALTH = 'HEALTH',
  METRICS = 'METRICS',
  PERFORMANCE = 'PERFORMANCE',

  // Security & Operations
  AUTH = 'AUTH',
  SECURITY = 'SECURITY',
  CLEANUP = 'CLEANUP',
  COORD = 'COORD'
}

interface LogEntry {
  timestamp: string;
  level: string;
  category: string;
  message: string;
  data?: any;
  correlationId?: string;
  userId?: string;
  sessionId?: string;
}

interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logDirectory?: string;
  format: 'compact' | 'json' | 'structured';
  colorize: boolean;
  maskSensitiveData: boolean;
  maxFileSize: number; // in bytes
  maxFiles: number;
  correlationId?: string;
}

class ProductionLogger {
  private static instance: ProductionLogger;
  private config: LoggerConfig;
  private currentLogFile?: WriteStream;
  private currentFileSize: number = 0;
  private fileRotationDate?: string;
  private messageCache = new Map<string, number>();
  private lastFlush: number = Date.now();

  private readonly CACHE_WINDOW = 1000; // 1 second
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds
  private readonly SENSITIVE_PATTERNS = [
    /password[=:]\s*['"]?([^'"\s]+)/gi,
    /api[_-]?key[=:]\s*['"]?([^'"\s]+)/gi,
    /token[=:]\s*['"]?([^'"\s]+)/gi,
    /secret[=:]\s*['"]?([^'"\s]+)/gi,
    /authorization:\s*bearer\s+([^\s]+)/gi
  ];

  private constructor(config?: Partial<LoggerConfig>) {
    const env = process.env.NODE_ENV || 'development';
    const defaultConfig: LoggerConfig = {
      level: env === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
      enableConsole: true,
      enableFile: env === 'production',
      logDirectory: process.env.LOG_DIR || join(process.cwd(), 'logs'),
      format: env === 'production' ? 'json' : 'compact',
      colorize: env !== 'production' && process.stdout.isTTY,
      maskSensitiveData: env === 'production',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10
    };

    this.config = { ...defaultConfig, ...config };

    if (this.config.enableFile) {
      this.initializeFileLogging();
    }

    // Periodic flush to file
    setInterval(() => this.flush(), this.FLUSH_INTERVAL);
  }

  static getInstance(config?: Partial<LoggerConfig>): ProductionLogger {
    if (!ProductionLogger.instance) {
      ProductionLogger.instance = new ProductionLogger(config);
    }
    return ProductionLogger.instance;
  }

  /**
   * Set correlation ID for request tracking
   */
  setCorrelationId(correlationId: string): void {
    this.config.correlationId = correlationId;
  }

  /**
   * Clear correlation ID after request completes
   */
  clearCorrelationId(): void {
    this.config.correlationId = undefined;
  }

  /**
   * Log at FATAL level - system unusable
   */
  fatal(category: LogCategory | string, message: string, data?: any): void {
    this.log(LogLevel.FATAL, category, message, data);
  }

  /**
   * Log at ERROR level - error conditions
   */
  error(category: LogCategory | string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, category, message, data);
  }

  /**
   * Log at WARN level - warning conditions
   */
  warn(category: LogCategory | string, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  /**
   * Log at INFO level - informational messages
   */
  info(category: LogCategory | string, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  /**
   * Log at DEBUG level - debug-level messages
   */
  debug(category: LogCategory | string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  /**
   * Log at TRACE level - very detailed debug information
   */
  trace(category: LogCategory | string, message: string, data?: any): void {
    this.log(LogLevel.TRACE, category, message, data);
  }

  /**
   * Log HTTP request (special formatting)
   */
  httpRequest(method: string, path: string, statusCode: number, duration: number, userId?: string): void {
    if (this.config.level < LogLevel.INFO) return;

    const level = statusCode >= 500 ? LogLevel.ERROR :
                 statusCode >= 400 ? LogLevel.WARN :
                 LogLevel.INFO;

    this.log(level, LogCategory.HTTP,
      `${method} ${path}`,
      { statusCode, duration, userId }
    );
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, category: LogCategory | string, message: string, data?: any): void {
    // Filter by log level
    if (level > this.config.level) return;

    // Deduplicate rapid similar messages
    const cacheKey = `${level}:${category}:${message}`;
    const now = Date.now();

    if (now - this.lastFlush < this.CACHE_WINDOW) {
      const count = this.messageCache.get(cacheKey) || 0;
      if (count > 5) return; // Suppress after 5 identical messages in 1 second
      this.messageCache.set(cacheKey, count + 1);
    }

    // Create log entry
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      category: category.toString(),
      message: this.maskSensitiveData(message),
      correlationId: this.config.correlationId
    };

    // Add data if provided
    if (data !== undefined && data !== null) {
      entry.data = this.sanitizeData(data);
    }

    // Output to console
    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }

    // Write to file
    if (this.config.enableFile && this.currentLogFile) {
      this.writeToFile(entry);
    }
  }

  /**
   * Write log entry to console with formatting
   */
  private writeToConsole(entry: LogEntry): void {
    if (this.config.format === 'json') {
      console.log(JSON.stringify(entry));
      return;
    }

    const levelIcon = this.getLevelIcon(entry.level);
    const categoryColor = this.config.colorize ? this.getCategoryColor(entry.category) : '';
    const reset = this.config.colorize ? '\x1b[0m' : '';

    if (this.config.format === 'compact') {
      const dataStr = entry.data ? ` ${format('%O', entry.data)}` : '';
      console.log(
        `${levelIcon} \x1b[90m[${entry.category}]\x1b[0m ${entry.message}${dataStr}`
      );
    } else {
      // Structured format
      const corrId = entry.correlationId ? ` [${entry.correlationId.substring(0, 8)}]` : '';
      const dataStr = entry.data ? `\n  ${format('%O', entry.data)}` : '';
      console.log(
        `${entry.timestamp} ${levelIcon} ${categoryColor}${entry.category}${reset}${corrId}: ${entry.message}${dataStr}`
      );
    }
  }

  /**
   * Write log entry to file
   */
  private writeToFile(entry: LogEntry): void {
    if (!this.currentLogFile) return;

    // Check if we need to rotate the file
    const currentDate = new Date().toISOString().split('T')[0];
    if (this.fileRotationDate !== currentDate || this.currentFileSize >= this.config.maxFileSize) {
      this.rotateLogFile();
    }

    const line = JSON.stringify(entry) + '\n';
    const bytesWritten = Buffer.byteLength(line);

    this.currentLogFile.write(line);
    this.currentFileSize += bytesWritten;
  }

  /**
   * Initialize file logging
   */
  private initializeFileLogging(): void {
    if (!this.config.logDirectory) return;

    // Ensure log directory exists
    if (!existsSync(this.config.logDirectory)) {
      mkdirSync(this.config.logDirectory, { recursive: true });
    }

    this.rotateLogFile();
  }

  /**
   * Rotate log file (daily or when size exceeds limit)
   */
  private rotateLogFile(): void {
    if (this.currentLogFile) {
      this.currentLogFile.end();
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
    const filename = `maifarm-${dateStr}-${timeStr}.log`;
    const filepath = join(this.config.logDirectory!, filename);

    this.currentLogFile = createWriteStream(filepath, { flags: 'a' });
    this.currentFileSize = 0;
    this.fileRotationDate = dateStr;

    // TODO: Implement log file cleanup (remove old files beyond maxFiles)
  }

  /**
   * Flush message cache
   */
  private flush(): void {
    this.messageCache.clear();
    this.lastFlush = Date.now();
  }

  /**
   * Mask sensitive data in message
   */
  private maskSensitiveData(message: string): string {
    if (!this.config.maskSensitiveData) return message;

    let masked = message;
    for (const pattern of this.SENSITIVE_PATTERNS) {
      masked = masked.replace(pattern, (match, captured) => {
        return match.replace(captured, '***REDACTED***');
      });
    }
    return masked;
  }

  /**
   * Sanitize data object (remove sensitive fields, limit depth)
   */
  private sanitizeData(data: any, depth = 0): any {
    if (depth > 3) return '[Max Depth Reached]';
    if (data === null || data === undefined) return data;

    // Handle primitives
    if (typeof data !== 'object') return data;

    // Handle errors
    if (data instanceof Error) {
      return {
        name: data.name,
        message: this.maskSensitiveData(data.message),
        stack: process.env.NODE_ENV === 'production' ? undefined : data.stack
      };
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.slice(0, 10).map(item => this.sanitizeData(item, depth + 1));
    }

    // Handle objects
    const sanitized: any = {};
    const sensitiveKeys = ['password', 'apiKey', 'api_key', 'token', 'secret', 'authorization'];

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      if (this.config.maskSensitiveData && sensitiveKeys.some(k => lowerKey.includes(k))) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = this.sanitizeData(value, depth + 1);
      }
    }

    return sanitized;
  }

  /**
   * Get icon for log level
   */
  private getLevelIcon(level: string): string {
    switch (level) {
      case 'FATAL': return '💀';
      case 'ERROR': return '❌';
      case 'WARN': return '⚠️';
      case 'INFO': return 'ℹ️';
      case 'DEBUG': return '🔍';
      case 'TRACE': return '📝';
      default: return '•';
    }
  }

  /**
   * Get ANSI color code for category
   */
  private getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      SYSTEM: '\x1b[95m',     // Bright Magenta
      SERVER: '\x1b[96m',     // Bright Cyan
      API: '\x1b[32m',        // Green
      DATABASE: '\x1b[35m',   // Magenta
      WEBSOCKET: '\x1b[34m',  // Blue
      FARM: '\x1b[92m',       // Bright Green
      AGENT: '\x1b[93m',      // Bright Yellow
      HARVEST: '\x1b[36m',    // Cyan
      TERMINAL: '\x1b[94m',   // Bright Blue
      ERROR: '\x1b[91m',      // Bright Red
      AUTH: '\x1b[33m',       // Yellow
      SECURITY: '\x1b[31m'    // Red
    };

    return colors[category] || '\x1b[37m'; // Default: White
  }

  /**
   * Graceful shutdown - flush and close log files
   */
  shutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (this.currentLogFile) {
        this.currentLogFile.end(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Export singleton instance
export const logger = ProductionLogger.getInstance();

// Export class for testing
export { ProductionLogger };
