import { EventEmitter } from 'events';
import { db } from '../database/connection';

// Define WebSocketManager interface for when it's available
interface IWebSocketManager {
  broadcast: (event: string, data: any) => void;
  getServer: () => any;
}

// Will be set when WebSocket server is initialized
let WebSocketManager: IWebSocketManager | null = null;

export function setWebSocketManager(manager: IWebSocketManager) {
  WebSocketManager = manager;
}

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  farmId?: string;
  agentId?: string;
  action?: string;
  metadata?: Record<string, any>;
}

export interface TrackedError {
  id: string;
  timestamp: Date;
  type: 'websocket' | 'api' | 'database' | 'agent' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  stack?: string;
  context: ErrorContext;
  resolved: boolean;
  resolutionTime?: Date;
  resolutionNote?: string;
}

export interface ErrorMetrics {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  errorRate: number; // errors per minute
  criticalErrors: number;
  unresolvedErrors: number;
  avgResolutionTime: number; // in milliseconds
}

interface ErrorThreshold {
  type: string;
  maxRate: number; // max errors per minute
  maxCount: number; // max total errors
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class ErrorTracker extends EventEmitter {
  private errors: Map<string, TrackedError> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private thresholds: ErrorThreshold[] = [
    { type: 'websocket', maxRate: 10, maxCount: 50, severity: 'high' },
    { type: 'api', maxRate: 20, maxCount: 100, severity: 'medium' },
    { type: 'database', maxRate: 5, maxCount: 20, severity: 'critical' },
    { type: 'agent', maxRate: 15, maxCount: 75, severity: 'high' },
    { type: 'system', maxRate: 5, maxCount: 25, severity: 'critical' }
  ];

  constructor() {
    super();
    this.startMetricsCollection();
    this.setupCleanup();
  }

  trackError(
    type: TrackedError['type'],
    error: Error | string,
    context: ErrorContext = {},
    severity?: TrackedError['severity']
  ): string {
    const errorId = this.generateErrorId();
    const trackedError: TrackedError = {
      id: errorId,
      timestamp: new Date(),
      type,
      severity: severity || this.determineSeverity(type, error),
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      context,
      resolved: false
    };

    this.errors.set(errorId, trackedError);
    this.incrementErrorCount(type);
    
    // Log to console with appropriate level
    this.logError(trackedError);
    
    // Persist to database
    this.persistError(trackedError);
    
    // Check thresholds
    this.checkThresholds(type);
    
    // Emit error event
    this.emit('error:tracked', trackedError);
    
    // Broadcast to WebSocket clients if critical
    if (trackedError.severity === 'critical' && WebSocketManager) {
      WebSocketManager.broadcast('error:critical', {
        error: trackedError,
        timestamp: new Date()
      });
    }
    
    return errorId;
  }

  resolveError(errorId: string, resolutionNote?: string): boolean {
    const error = this.errors.get(errorId);
    if (!error || error.resolved) {
      return false;
    }

    error.resolved = true;
    error.resolutionTime = new Date();
    error.resolutionNote = resolutionNote;
    
    this.updatePersistedError(error);
    this.emit('error:resolved', error);
    
    return true;
  }

  getErrorMetrics(timeWindow: number = 60000): ErrorMetrics {
    const now = Date.now();
    const windowStart = now - timeWindow;
    
    const recentErrors = Array.from(this.errors.values()).filter(
      error => error.timestamp.getTime() > windowStart
    );
    
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let criticalErrors = 0;
    let unresolvedErrors = 0;
    let totalResolutionTime = 0;
    let resolvedCount = 0;
    
    recentErrors.forEach(error => {
      byType[error.type] = (byType[error.type] || 0) + 1;
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      
      if (error.severity === 'critical') criticalErrors++;
      if (!error.resolved) unresolvedErrors++;
      
      if (error.resolved && error.resolutionTime) {
        const resolutionTime = error.resolutionTime.getTime() - error.timestamp.getTime();
        totalResolutionTime += resolutionTime;
        resolvedCount++;
      }
    });
    
    return {
      total: recentErrors.length,
      byType,
      bySeverity,
      errorRate: (recentErrors.length / timeWindow) * 60000, // per minute
      criticalErrors,
      unresolvedErrors,
      avgResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0
    };
  }

  alertOnThreshold(type: string, currentRate: number, threshold: ErrorThreshold): void {
    const alert = {
      type: 'error_threshold_exceeded',
      errorType: type,
      currentRate,
      maxRate: threshold.maxRate,
      severity: threshold.severity,
      timestamp: new Date(),
      message: `Error rate for ${type} exceeded threshold: ${currentRate.toFixed(2)}/min (max: ${threshold.maxRate}/min)`
    };

    // Log alert
    console.error('[ERROR THRESHOLD]', alert.message);
    
    // Emit alert event
    this.emit('alert:threshold', alert);
    
    // Broadcast to monitoring systems
    if (WebSocketManager) {
      WebSocketManager.broadcast('alert:error_threshold', alert);
    }
    
    // Trigger automated response if configured
    this.triggerAutomatedResponse(type, threshold.severity);
  }

  getRecentErrors(limit: number = 100, type?: string): TrackedError[] {
    let errors = Array.from(this.errors.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
    if (type) {
      errors = errors.filter(error => error.type === type);
    }
    
    return errors.slice(0, limit);
  }

  getErrorById(errorId: string): TrackedError | undefined {
    return this.errors.get(errorId);
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private determineSeverity(type: string, error: Error | string): TrackedError['severity'] {
    const message = typeof error === 'string' ? error : error.message;
    
    // Critical patterns
    if (
      message.includes('database connection lost') ||
      message.includes('out of memory') ||
      message.includes('ENOSPC') ||
      type === 'database' && message.includes('connection')
    ) {
      return 'critical';
    }
    
    // High severity patterns
    if (
      message.includes('authentication failed') ||
      message.includes('websocket disconnect') ||
      type === 'agent' && message.includes('crashed')
    ) {
      return 'high';
    }
    
    // Medium severity patterns
    if (
      message.includes('timeout') ||
      message.includes('rate limit') ||
      type === 'api'
    ) {
      return 'medium';
    }
    
    return 'low';
  }

  private incrementErrorCount(type: string): void {
    const current = this.errorCounts.get(type) || 0;
    this.errorCounts.set(type, current + 1);
  }

  private checkThresholds(type: string): void {
    const threshold = this.thresholds.find(t => t.type === type);
    if (!threshold) return;
    
    const metrics = this.getErrorMetrics(60000); // 1 minute window
    const typeRate = (metrics.byType[type] || 0) / 1; // per minute
    
    if (typeRate > threshold.maxRate) {
      this.alertOnThreshold(type, typeRate, threshold);
    }
    
    const totalCount = this.errorCounts.get(type) || 0;
    if (totalCount > threshold.maxCount) {
      this.alertOnThreshold(type, totalCount, threshold);
    }
  }

  private logError(error: TrackedError): void {
    const logMessage = `[${error.type.toUpperCase()}] ${error.message}`;
    const logContext = {
      errorId: error.id,
      severity: error.severity,
      context: error.context,
      stack: error.stack
    };
    
    switch (error.severity) {
      case 'critical':
        console.error(logMessage, logContext);
        break;
      case 'high':
        console.error(logMessage, logContext);
        break;
      case 'medium':
        console.warn(logMessage, logContext);
        break;
      case 'low':
        console.log(logMessage, logContext);
        break;
    }
  }

  private async persistError(error: TrackedError): Promise<void> {
    try {
      await db('error_logs').insert({
        error_id: error.id,
        type: error.type,
        severity: error.severity,
        message: error.message,
        stack: error.stack,
        context: JSON.stringify(error.context),
        resolved: error.resolved,
        created_at: error.timestamp
      });
    } catch (dbError) {
      console.error('Failed to persist error to database:', dbError);
    }
  }

  private async updatePersistedError(error: TrackedError): Promise<void> {
    try {
      await db('error_logs')
        .where('error_id', error.id)
        .update({
          resolved: error.resolved,
          resolution_time: error.resolutionTime,
          resolution_note: error.resolutionNote,
          updated_at: new Date()
        });
    } catch (dbError) {
      console.error('Failed to update persisted error:', dbError);
    }
  }

  private triggerAutomatedResponse(type: string, severity: string): void {
    // Implement automated responses based on error type and severity
    if (severity === 'critical') {
      switch (type) {
        case 'database':
          // Attempt database reconnection
          this.emit('action:reconnect_database');
          break;
        case 'websocket':
          // Restart WebSocket server
          this.emit('action:restart_websocket');
          break;
        case 'system':
          // Alert system administrators
          this.emit('action:alert_admins');
          break;
      }
    }
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      const metrics = this.getErrorMetrics();
      this.emit('metrics:update', {
        type: 'error_metrics',
        data: metrics,
        timestamp: new Date()
      });
    }, 30000); // Every 30 seconds
  }

  private setupCleanup(): void {
    // Clean up old resolved errors every hour
    setInterval(() => {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const errorIds = Array.from(this.errors.keys());
      
      errorIds.forEach(id => {
        const error = this.errors.get(id);
        if (error && error.resolved && error.timestamp.getTime() < oneDayAgo) {
          this.errors.delete(id);
        }
      });
    }, 60 * 60 * 1000); // Every hour
  }
}

export const errorTracker = new ErrorTracker();