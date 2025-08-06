export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  metadata?: {
    userId?: string;
    sessionId?: string;
    farmId?: string;
    agentId?: string;
    [key: string]: any;
  };
}

interface LoggerConfig {
  minLevel: LogLevel;
  maxEntries: number;
  persistToStorage: boolean;
  sendToServer: boolean;
  enableConsole: boolean;
}

class Logger {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];
  private logListeners: Set<(log: LogEntry) => void> = new Set();
  private logBuffer: LogEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    critical: 4
  };

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      minLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      maxEntries: 5000,
      persistToStorage: true,
      sendToServer: true,
      enableConsole: process.env.NODE_ENV !== 'production',
      ...config
    };

    this.loadPersistedLogs();
    this.startFlushInterval();
  }

  private loadPersistedLogs() {
    if (!this.config.persistToStorage) return;

    try {
      const stored = localStorage.getItem('maifarm_logs');
      if (stored) {
        const logs = JSON.parse(stored);
        this.logs = logs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }));
      }
    } catch (error) {
      console.error('Failed to load persisted logs:', error);
    }
  }

  private persistLogs() {
    if (!this.config.persistToStorage) return;

    try {
      const logsToStore = this.logs.slice(-1000).map(log => ({
        ...log,
        timestamp: log.timestamp.toISOString()
      }));
      localStorage.setItem('maifarm_logs', JSON.stringify(logsToStore));
    } catch (error) {
      console.error('Failed to persist logs:', error);
    }
  }

  private startFlushInterval() {
    this.flushInterval = setInterval(() => {
      this.flushBuffer();
    }, 5000);
  }

  private async flushBuffer() {
    if (this.logBuffer.length === 0 || !this.config.sendToServer) return;

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      await fetch('/api/monitoring/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: logsToSend })
      });
    } catch (error) {
      // Re-add logs to buffer if send failed
      this.logBuffer.unshift(...logsToSend);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.config.minLevel];
  }

  private createLogEntry(
    level: LogLevel,
    category: string,
    message: string,
    data?: any,
    metadata?: LogEntry['metadata']
  ): LogEntry {
    return {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      category,
      message,
      data,
      metadata: {
        ...metadata,
        sessionId: this.getSessionId(),
        userAgent: navigator.userAgent
      }
    };
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('maifarm_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('maifarm_session_id', sessionId);
    }
    return sessionId;
  }

  private log(
    level: LogLevel,
    category: string,
    message: string,
    data?: any,
    metadata?: LogEntry['metadata']
  ) {
    if (!this.shouldLog(level)) return;

    const logEntry = this.createLogEntry(level, category, message, data, metadata);

    // Add to logs array
    this.logs.push(logEntry);
    if (this.logs.length > this.config.maxEntries) {
      this.logs = this.logs.slice(-this.config.maxEntries);
    }

    // Console output
    if (this.config.enableConsole) {
      const style = this.getConsoleStyle(level);
      console.log(
        `%c[${level.toUpperCase()}]%c [${category}] ${message}`,
        style,
        'color: inherit',
        data || ''
      );
    }

    // Notify listeners
    this.logListeners.forEach(listener => listener(logEntry));

    // Add to buffer for server send
    if (this.config.sendToServer && level !== 'debug') {
      this.logBuffer.push(logEntry);
    }

    // Persist important logs immediately
    if (level === 'error' || level === 'critical') {
      this.persistLogs();
    }
  }

  private getConsoleStyle(level: LogLevel): string {
    const styles: Record<LogLevel, string> = {
      debug: 'color: #888',
      info: 'color: #2196F3',
      warn: 'color: #FF9800',
      error: 'color: #F44336',
      critical: 'color: #F44336; font-weight: bold'
    };
    return styles[level];
  }

  // Public logging methods
  debug(category: string, message: string, data?: any, metadata?: LogEntry['metadata']) {
    this.log('debug', category, message, data, metadata);
  }

  info(category: string, message: string, data?: any, metadata?: LogEntry['metadata']) {
    this.log('info', category, message, data, metadata);
  }

  warn(category: string, message: string, data?: any, metadata?: LogEntry['metadata']) {
    this.log('warn', category, message, data, metadata);
  }

  error(category: string, message: string, data?: any, metadata?: LogEntry['metadata']) {
    this.log('error', category, message, data, metadata);
  }

  critical(category: string, message: string, data?: any, metadata?: LogEntry['metadata']) {
    this.log('critical', category, message, data, metadata);
  }

  // Specialized logging methods
  logWebSocketEvent(event: string, data?: any) {
    this.debug('WebSocket', event, data);
  }

  logAPICall(method: string, endpoint: string, status: number, duration: number, error?: any) {
    const level = error || status >= 400 ? 'error' : 'info';
    this.log(level, 'API', `${method} ${endpoint}`, {
      status,
      duration,
      error
    });
  }

  logUserAction(action: string, details?: any) {
    this.info('UserAction', action, details);
  }

  logPerformance(metric: string, value: number, metadata?: any) {
    this.debug('Performance', metric, { value, ...metadata });
  }

  // Query methods
  getLogs(filter?: {
    level?: LogLevel;
    category?: string;
    since?: Date;
    search?: string;
  }): LogEntry[] {
    return this.logs.filter(log => {
      if (filter?.level && this.levels[log.level] < this.levels[filter.level]) return false;
      if (filter?.category && !log.category.includes(filter.category)) return false;
      if (filter?.since && log.timestamp < filter.since) return false;
      if (filter?.search && !log.message.toLowerCase().includes(filter.search.toLowerCase())) return false;
      return true;
    });
  }

  getLogStats(): {
    total: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<string, number>;
  } {
    const stats = {
      total: this.logs.length,
      byLevel: { debug: 0, info: 0, warn: 0, error: 0, critical: 0 },
      byCategory: {} as Record<string, number>
    };

    this.logs.forEach(log => {
      stats.byLevel[log.level]++;
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
    });

    return stats;
  }

  clearLogs() {
    this.logs = [];
    this.logBuffer = [];
    this.persistLogs();
  }

  subscribe(listener: (log: LogEntry) => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  // Export logs for debugging
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Cleanup
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushBuffer();
    this.persistLogs();
  }
}

// Create singleton instance
export const logger = new Logger();

// Export types
export type { Logger, LogEntry };