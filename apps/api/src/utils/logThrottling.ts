import { logger } from './logger';

interface ThrottledMessage {
  message: string;
  count: number;
  lastLogged: number;
  category?: string;
}

/**
 * Log throttling utility to prevent log spam from repetitive messages
 */
export class LogThrottling {
  private static instance: LogThrottling;
  private throttledMessages = new Map<string, ThrottledMessage>();
  private readonly THROTTLE_INTERVAL = 30000; // 30 seconds
  private readonly MAX_TRACKED_MESSAGES = 1000;
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    // Periodic cleanup of old throttled messages
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  static getInstance(): LogThrottling {
    if (!LogThrottling.instance) {
      LogThrottling.instance = new LogThrottling();
    }
    return LogThrottling.instance;
  }

  /**
   * Throttled info logging
   */
  info(key: string, message: string, category?: string): void {
    this.throttle(key, 'info', message, category);
  }

  /**
   * Throttled warning logging
   */
  warn(key: string, message: string, category?: string): void {
    this.throttle(key, 'warn', message, category);
  }

  /**
   * Throttled error logging (less aggressive throttling)
   */
  error(key: string, message: string, category?: string): void {
    this.throttle(key, 'error', message, category, 10000); // 10s for errors
  }

  /**
   * Throttled debug logging
   */
  debug(key: string, message: string, category?: string): void {
    this.throttle(key, 'debug', message, category);
  }

  /**
   * Core throttling logic
   */
  private throttle(
    key: string, 
    level: 'info' | 'warn' | 'error' | 'debug', 
    message: string, 
    category?: string,
    throttleInterval?: number
  ): void {
    const now = Date.now();
    const interval = throttleInterval || this.THROTTLE_INTERVAL;
    const existing = this.throttledMessages.get(key);

    if (!existing) {
      // First occurrence - log immediately
      this.doLog(level, message, category);
      this.throttledMessages.set(key, {
        message,
        count: 1,
        lastLogged: now,
        category
      });
      return;
    }

    existing.count++;
    
    // Check if enough time has passed to log again
    if (now - existing.lastLogged >= interval) {
      const suppressedMessage = existing.count > 1 
        ? `${message} (${existing.count - 1} similar messages suppressed in ${Math.round(interval / 1000)}s)`
        : message;
        
      this.doLog(level, suppressedMessage, category);
      existing.lastLogged = now;
      existing.count = 1; // Reset count after logging
    }
  }

  /**
   * Actual logging call
   */
  private doLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, category?: string): void {
    if (category) {
      logger[level](category, message);
    } else {
      logger[level](message);
    }
  }

  /**
   * Clean up old throttled messages to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, data] of this.throttledMessages.entries()) {
      // Remove messages that haven't been seen in 5 minutes
      if (now - data.lastLogged > 300000) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.throttledMessages.delete(key);
    });

    // If we still have too many, remove oldest
    if (this.throttledMessages.size > this.MAX_TRACKED_MESSAGES) {
      const entries = Array.from(this.throttledMessages.entries())
        .sort(([,a], [,b]) => a.lastLogged - b.lastLogged);
      
      const toRemove = entries.slice(0, entries.length - this.MAX_TRACKED_MESSAGES);
      toRemove.forEach(([key]) => {
        this.throttledMessages.delete(key);
      });
    }

    if (keysToDelete.length > 0) {
      logger.debug(`[LogThrottling] Cleaned up ${keysToDelete.length} old throttled messages`);
    }
  }

  /**
   * Force log a throttled message immediately (bypass throttling)
   */
  forceLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, category?: string): void {
    this.doLog(level, message, category);
  }

  /**
   * Get stats about throttled messages
   */
  getStats(): { totalTracked: number; activeMessages: Array<{key: string; count: number; lastLogged: Date}> } {
    return {
      totalTracked: this.throttledMessages.size,
      activeMessages: Array.from(this.throttledMessages.entries()).map(([key, data]) => ({
        key,
        count: data.count,
        lastLogged: new Date(data.lastLogged)
      }))
    };
  }

  /**
   * Clear all throttled messages
   */
  clear(): void {
    this.throttledMessages.clear();
    logger.debug('[LogThrottling] Cleared all throttled messages');
  }

  /**
   * Destroy the instance and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.throttledMessages.clear();
  }
}

export const logThrottling = LogThrottling.getInstance();