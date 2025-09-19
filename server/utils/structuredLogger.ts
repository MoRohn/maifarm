/**
 * Structured Logger with correlation tracking
 * Provides cleaner, more debuggable logging throughout the system
 */

import { logger as baseLogger } from './logger';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

// Async context storage for correlation tracking
const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

export interface LogContext {
  correlationId?: string;
  farmId?: string;
  agentId?: string;
  sessionName?: string;
  userId?: string;
  requestId?: string;
  operationId?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  createdAt?: string;
  threadId?: number;
  traceId?: string;
  spanId?: string;
  [key: string]: any;
}

/**
 * LRU Cache for correlation contexts to prevent memory leaks
 */
class CorrelationCache {
  private cache = new Map<string, LogContext & { timestamp: number }>();
  private maxSize: number;
  private ttl: number;
  
  constructor(maxSize = 2000, ttl = 300000) { // 5 minutes TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  
  set(key: string, context: LogContext): void {
    // Remove expired entries
    this.cleanup();
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, { ...context, timestamp: Date.now() });
  }
  
  get(key: string): LogContext | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    const { timestamp, ...context } = entry;
    return context;
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.cache.delete(key));
  }
  
  size(): number {
    return this.cache.size;
  }
  
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Structured logger that automatically includes context
 */
export class StructuredLogger {
  private static correlationStore = new CorrelationCache();
  
  /**
   * Create a new correlation context with automatic async tracking
   */
  static createCorrelation(context?: Partial<LogContext>): string {
    const correlationId = context?.correlationId || uuidv4().slice(0, 8);
    const fullContext = { 
      correlationId, 
      ...context,
      createdAt: new Date().toISOString(),
      threadId: process.pid
    };
    
    this.correlationStore.set(correlationId, fullContext);
    return correlationId;
  }
  
  /**
   * Create and run code within a correlation context
   */
  static runWithCorrelation<T>(context: LogContext, fn: () => T): T {
    return asyncLocalStorage.run(context, fn);
  }
  
  /**
   * Create and run async code within a correlation context
   */
  static async runWithCorrelationAsync<T>(context: LogContext, fn: () => Promise<T>): Promise<T> {
    return asyncLocalStorage.run(context, fn);
  }
  
  /**
   * Get current correlation context from async storage or parameter
   */
  static getCurrentContext(explicitContext?: LogContext): LogContext | undefined {
    // Explicit context takes precedence
    if (explicitContext) return explicitContext;
    
    // Try async storage
    const asyncContext = asyncLocalStorage.getStore();
    if (asyncContext) return asyncContext;
    
    return undefined;
  }
  
  /**
   * Get correlation context
   */
  static getContext(correlationId: string): LogContext | undefined {
    return this.correlationStore.get(correlationId);
  }
  
  /**
   * Clean old correlations (prevent memory leak)
   */
  static cleanupOldCorrelations(): void {
    this.correlationStore.cleanup();
  }
  
  /**
   * Get cache statistics for monitoring
   */
  static getCacheStats() {
    return {
      size: this.correlationStore.size(),
      maxSize: 2000,
      utilization: this.correlationStore.size() / 2000
    };
  }
  
  /**
   * Format message with context including async context detection
   */
  private static formatMessage(message: string, explicitContext?: LogContext): string {
    const context = this.getCurrentContext(explicitContext);
    if (!context) return message;
    
    const contextParts: string[] = [];
    if (context.correlationId) contextParts.push(`[${context.correlationId}]`);
    if (context.farmId) contextParts.push(`[Farm:${context.farmId.slice(0, 8)}]`);
    if (context.agentId) contextParts.push(`[Agent:${context.agentId}]`);
    if (context.sessionName) contextParts.push(`[Session:${context.sessionName}]`);
    if (context.userId) contextParts.push(`[User:${context.userId.slice(0, 8)}]`);
    
    return contextParts.length > 0 
      ? `${contextParts.join(' ')} ${message}`
      : message;
  }
  
  /**
   * Log methods with automatic context inclusion and correlation tracking
   */
  static error(category: string, message: string, context?: LogContext, ...args: any[]): void {
    const formatted = this.formatMessage(message, context);
    const finalContext = this.getCurrentContext(context);
    
    // Include performance timing if available
    const timing = finalContext?.startTime ? 
      `[${Date.now() - new Date(finalContext.startTime).getTime()}ms]` : '';
    
    baseLogger.error(`[${category}]${timing} ${formatted}`, ...args);
  }
  
  static warn(category: string, message: string, context?: LogContext, ...args: any[]): void {
    const formatted = this.formatMessage(message, context);
    const finalContext = this.getCurrentContext(context);
    
    const timing = finalContext?.startTime ? 
      `[${Date.now() - new Date(finalContext.startTime).getTime()}ms]` : '';
    
    baseLogger.warn(`[${category}]${timing} ${formatted}`, ...args);
  }
  
  static info(category: string, message: string, context?: LogContext, ...args: any[]): void {
    const formatted = this.formatMessage(message, context);
    const finalContext = this.getCurrentContext(context);
    
    const timing = finalContext?.startTime ? 
      `[${Date.now() - new Date(finalContext.startTime).getTime()}ms]` : '';
    
    baseLogger.info(`[${category}]${timing} ${formatted}`, ...args);
  }
  
  static debug(category: string, message: string, context?: LogContext, ...args: any[]): void {
    const formatted = this.formatMessage(message, context);
    const finalContext = this.getCurrentContext(context);
    
    const timing = finalContext?.startTime ? 
      `[${Date.now() - new Date(finalContext.startTime).getTime()}ms]` : '';
    
    baseLogger.debug(`[${category}]${timing} ${formatted}`, ...args);
  }
  
  static trace(category: string, message: string, context?: LogContext, ...args: any[]): void {
    const formatted = this.formatMessage(message, context);
    const finalContext = this.getCurrentContext(context);
    
    const timing = finalContext?.startTime ? 
      `[${Date.now() - new Date(finalContext.startTime).getTime()}ms]` : '';
    
    baseLogger.trace(`[${category}]${timing} ${formatted}`, ...args);
  }
  
  /**
   * Create a child logger with inherited context
   */
  static child(additionalContext: Partial<LogContext>) {
    const currentContext = this.getCurrentContext() || {};
    const mergedContext = { ...currentContext, ...additionalContext };
    
    return {
      error: (category: string, message: string, ...args: any[]) => 
        this.error(category, message, mergedContext, ...args),
      warn: (category: string, message: string, ...args: any[]) => 
        this.warn(category, message, mergedContext, ...args),
      info: (category: string, message: string, ...args: any[]) => 
        this.info(category, message, mergedContext, ...args),
      debug: (category: string, message: string, ...args: any[]) => 
        this.debug(category, message, mergedContext, ...args),
      trace: (category: string, message: string, ...args: any[]) => 
        this.trace(category, message, mergedContext, ...args),
    };
  }
}

// Logging categories for consistency
export const LogCategory = {
  TERMINAL: 'Terminal',
  HEALTH: 'Health',
  HARVEST: 'Harvest',
  ORCHESTRATOR: 'Orchestrator',
  WEBSOCKET: 'WebSocket',
  AUTH: 'Auth',
  DATABASE: 'Database',
  HTTP: 'HTTP',
  METRICS: 'Metrics',
  FARM: 'Farm',
  AGENT: 'Agent',
  TASK: 'Task',
  ERROR: 'Error',
  SYSTEM: 'System',
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  MEMORY: 'Memory',
  CACHE: 'Cache',
  XENOSYNC: 'XenoSync'
} as const;

// Clean up periodically
setInterval(() => {
  StructuredLogger.cleanupOldCorrelations();
}, 60000); // Every minute

// Export convenience instance
export const structuredLogger = StructuredLogger;