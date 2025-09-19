/**
 * Enhanced Logging Configuration
 * Provides centralized control over log levels and formatting
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface LogConfig {
  level: LogLevel;
  format: 'compact' | 'detailed' | 'json';
  categories: {
    auth: boolean;
    metrics: boolean;
    http: boolean;
    database: boolean;
    websocket: boolean;
    orchestrator: boolean;
  };
  suppressPatterns: string[];
  groupSimilar: boolean;
  maxRepeat: number;
}

// Default configuration for development
const defaultConfig: LogConfig = {
  level: process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
  format: process.env.LOG_FORMAT as any || 'compact',
  categories: {
    auth: process.env.LOG_AUTH !== 'false',
    metrics: process.env.LOG_METRICS !== 'false',
    http: process.env.LOG_HTTP !== 'false',
    database: process.env.LOG_DATABASE !== 'false',
    websocket: process.env.LOG_WEBSOCKET !== 'false',
    orchestrator: process.env.LOG_ORCHESTRATOR !== 'false'
  },
  suppressPatterns: [
    'Bypassing authentication', // Reduce auth bypass spam
    'Metrics calculated in', // Suppress routine metrics
    'Broadcasted metrics update' // Reduce broadcast noise
  ],
  groupSimilar: true,
  maxRepeat: 3 // Show max 3 similar messages before grouping
};

// Message deduplication tracker
const messageTracker = new Map<string, { count: number; lastShown: Date }>();
const DEDUP_WINDOW = 5000; // 5 seconds

export class EnhancedLogger {
  private config: LogConfig;
  private authBypassShown = false;

  constructor(config: Partial<LogConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Log with enhanced formatting and deduplication
   */
  log(level: LogLevel, category: string, message: string, ...args: any[]) {
    // Check if level is enabled
    if (level > this.config.level) return;

    // Check if category is enabled
    const categoryKey = category.toLowerCase() as keyof typeof this.config.categories;
    if (categoryKey in this.config.categories && !this.config.categories[categoryKey]) {
      return;
    }

    // Check suppression patterns
    if (this.config.suppressPatterns.some(pattern => message.includes(pattern))) {
      // Special handling for auth bypass - show once per session
      if (message.includes('Bypassing authentication') && !this.authBypassShown) {
        this.authBypassShown = true;
        console.log('🔓 Auth bypass enabled (development mode)');
      }
      return;
    }

    // Deduplicate similar messages
    if (this.config.groupSimilar) {
      const key = `${category}:${message}`;
      const tracker = messageTracker.get(key);
      const now = new Date();

      if (tracker && (now.getTime() - tracker.lastShown.getTime()) < DEDUP_WINDOW) {
        tracker.count++;
        if (tracker.count <= this.config.maxRepeat) {
          // Allow first few occurrences
        } else if (tracker.count === this.config.maxRepeat + 1) {
          // Show grouping message
          console.log(`  ↳ (${tracker.count - this.config.maxRepeat} similar messages suppressed)`);
          return;
        } else {
          // Suppress subsequent messages
          return;
        }
      } else {
        messageTracker.set(key, { count: 1, lastShown: now });
      }
    }

    // Format and output based on config
    this.output(level, category, message, args);
  }

  private output(level: LogLevel, category: string, message: string, args: any[]) {
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];
    
    switch (this.config.format) {
      case 'compact':
        this.outputCompact(levelStr, category, message, args);
        break;
      case 'detailed':
        this.outputDetailed(timestamp, levelStr, category, message, args);
        break;
      case 'json':
        this.outputJSON(timestamp, levelStr, category, message, args);
        break;
    }
  }

  private outputCompact(level: string, category: string, message: string, args: any[]) {
    const icon = this.getIcon(level);
    const categoryColor = this.getCategoryColor(category);
    
    if (args.length > 0) {
      console.log(`${icon} ${categoryColor}[${category}]\\x1b[0m ${message}`, ...args);
    } else {
      console.log(`${icon} ${categoryColor}[${category}]\\x1b[0m ${message}`);
    }
  }

  private outputDetailed(timestamp: string, level: string, category: string, message: string, args: any[]) {
    console.log(`[${timestamp}] [${level}] [${category}] ${message}`, ...args);
  }

  private outputJSON(timestamp: string, level: string, category: string, message: string, args: any[]) {
    console.log(JSON.stringify({
      timestamp,
      level,
      category,
      message,
      data: args.length > 0 ? args : undefined
    }));
  }

  private getIcon(level: string): string {
    switch (level) {
      case 'ERROR': return '❌';
      case 'WARN': return '⚠️';
      case 'INFO': return 'ℹ️';
      case 'DEBUG': return '🔍';
      case 'TRACE': return '📝';
      default: return '•';
    }
  }

  private getCategoryColor(category: string): string {
    switch (category.toLowerCase()) {
      case 'auth': return '\\x1b[33m'; // Yellow
      case 'metrics': return '\\x1b[36m'; // Cyan
      case 'http': return '\\x1b[32m'; // Green
      case 'database': return '\\x1b[35m'; // Magenta
      case 'websocket': return '\\x1b[34m'; // Blue
      case 'orchestrator': return '\\x1b[95m'; // Light Magenta
      case 'terminal': return '\\x1b[92m'; // Light Green
      case 'health': return '\\x1b[93m'; // Light Yellow
      case 'harvest': return '\\x1b[96m'; // Light Cyan
      case 'error': return '\\x1b[91m'; // Light Red
      default: return '\\x1b[37m'; // White
    }
  }

  // Convenience methods
  error(category: string, message: string, ...args: any[]) {
    this.log(LogLevel.ERROR, category, message, ...args);
  }

  warn(category: string, message: string, ...args: any[]) {
    this.log(LogLevel.WARN, category, message, ...args);
  }

  info(category: string, message: string, ...args: any[]) {
    this.log(LogLevel.INFO, category, message, ...args);
  }

  debug(category: string, message: string, ...args: any[]) {
    this.log(LogLevel.DEBUG, category, message, ...args);
  }

  trace(category: string, message: string, ...args: any[]) {
    this.log(LogLevel.TRACE, category, message, ...args);
  }

  // HTTP request logging with smart formatting
  httpRequest(method: string, path: string, status: number, duration?: number) {
    if (!this.config.categories.http) return;

    const statusIcon = status < 400 ? '✅' : status < 500 ? '⚠️' : '❌';
    const durationStr = duration ? ` (${duration}ms)` : '';
    
    console.log(`${statusIcon} ${method} ${path} → ${status}${durationStr}`);
  }

  // WebSocket event logging
  wsEvent(event: string, clientId?: string) {
    if (!this.config.categories.websocket) return;
    
    const icon = event.includes('connect') ? '🔌' : event.includes('disconnect') ? '🔚' : '📡';
    const clientStr = clientId ? ` [${clientId.substring(0, 8)}...]` : '';
    
    console.log(`${icon} WS: ${event}${clientStr}`);
  }
}

// Export singleton instance
export const logger = new EnhancedLogger();

// Export configuration for runtime updates
export function updateLogConfig(updates: Partial<LogConfig>) {
  Object.assign(defaultConfig, updates);
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, tracker] of messageTracker.entries()) {
    if (now - tracker.lastShown.getTime() > DEDUP_WINDOW * 2) {
      messageTracker.delete(key);
    }
  }
}, 30000); // Clean every 30 seconds