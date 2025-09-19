/**
 * Alert Manager Service
 * Manages alerts, notifications, and alert state
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/logger';
import { monitoringConfig, getAlertChannel } from '../config/monitoring';
import { healthCheckService } from './healthCheckService';
import { memoryManager } from '../utils/memoryManager';
import { CircuitBreakerFactory } from '../utils/circuitBreaker';

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

export enum AlertState {
  PENDING = 'pending',
  FIRING = 'firing',
  RESOLVED = 'resolved'
}

export interface Alert {
  id: string;
  name: string;
  severity: AlertSeverity;
  state: AlertState;
  message: string;
  details?: Record<string, any>;
  startTime: Date;
  endTime?: Date;
  count: number;
  lastNotified?: Date;
}

export interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '=' | '>=' | '<=' | '!=';
  threshold: number;
  duration?: number; // ms
}

export class AlertManager extends EventEmitter {
  private static instance: AlertManager;
  private alerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private evaluationInterval?: NodeJS.Timeout;
  private readonly MAX_HISTORY = 1000;
  private readonly COOLDOWN_PERIOD = 300000; // 5 minutes
  
  private constructor() {
    super();
    this.initializeDefaultAlerts();
  }
  
  static getInstance(): AlertManager {
    if (!AlertManager.instance) {
      AlertManager.instance = new AlertManager();
    }
    return AlertManager.instance;
  }
  
  /**
   * Start alert evaluation
   */
  startEvaluation(intervalMs: number = 30000): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }
    
    this.evaluationInterval = setInterval(() => {
      this.evaluateAlerts();
    }, intervalMs);
    
    // Initial evaluation
    this.evaluateAlerts();
    
    logger.info(LogCategory.MONITORING, `Alert evaluation started (interval: ${intervalMs}ms)`);
  }
  
  /**
   * Stop alert evaluation
   */
  stopEvaluation(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = undefined;
      logger.info(LogCategory.MONITORING, 'Alert evaluation stopped');
    }
  }
  
  /**
   * Initialize default alerts from config
   */
  private initializeDefaultAlerts(): void {
    // Memory usage alert
    this.registerAlert('high_memory', {
      name: 'High Memory Usage',
      severity: AlertSeverity.WARNING,
      condition: async () => {
        const stats = memoryManager.getMemoryStats();
        return stats.percentage > 70;
      },
      message: 'Memory usage is above 70%'
    });
    
    // Critical memory alert
    this.registerAlert('critical_memory', {
      name: 'Critical Memory Usage',
      severity: AlertSeverity.CRITICAL,
      condition: async () => {
        const stats = memoryManager.getMemoryStats();
        return stats.percentage > 85;
      },
      message: 'Memory usage is critically high (>85%)'
    });
    
    // Database health alert
    this.registerAlert('database_unhealthy', {
      name: 'Database Unhealthy',
      severity: AlertSeverity.CRITICAL,
      condition: async () => {
        const health = await healthCheckService.getHealth();
        const dbComponent = health.components.find(c => c.name === 'Database');
        return dbComponent?.status === 'unhealthy';
      },
      message: 'Database connection is unhealthy'
    });
    
    // Circuit breaker alerts
    this.registerAlert('circuit_breaker_open', {
      name: 'Circuit Breaker Open',
      severity: AlertSeverity.WARNING,
      condition: async () => {
        const breakers = CircuitBreakerFactory.getAllBreakers();
        for (const [name, breaker] of breakers) {
          if (breaker.isOpen()) {
            return true;
          }
        }
        return false;
      },
      message: 'One or more circuit breakers are open'
    });
    
    // WebSocket disconnection alert
    this.registerAlert('websocket_disconnections', {
      name: 'High WebSocket Disconnections',
      severity: AlertSeverity.WARNING,
      condition: async () => {
        // This would need to track disconnection rate
        return false; // Placeholder
      },
      message: 'High rate of WebSocket disconnections detected'
    });
  }
  
  /**
   * Register a custom alert
   */
  registerAlert(
    id: string,
    config: {
      name: string;
      severity: AlertSeverity;
      condition: () => Promise<boolean> | boolean;
      message: string;
      details?: Record<string, any>;
    }
  ): void {
    // Store alert configuration for evaluation
    this.on(`evaluate:${id}`, async () => {
      try {
        const shouldFire = await config.condition();
        
        if (shouldFire) {
          this.fireAlert(id, config.name, config.severity, config.message, config.details);
        } else {
          this.resolveAlert(id);
        }
      } catch (error) {
        logger.error(LogCategory.MONITORING, `Error evaluating alert ${id}:`, error);
      }
    });
    
    logger.debug(LogCategory.MONITORING, `Registered alert: ${id}`);
  }
  
  /**
   * Fire an alert
   */
  fireAlert(
    id: string,
    name: string,
    severity: AlertSeverity,
    message: string,
    details?: Record<string, any>
  ): void {
    let alert = this.alerts.get(id);
    
    if (!alert) {
      // New alert
      alert = {
        id,
        name,
        severity,
        state: AlertState.FIRING,
        message,
        details,
        startTime: new Date(),
        count: 1
      };
      
      this.alerts.set(id, alert);
      this.addToHistory(alert);
      
      logger.warn(LogCategory.MONITORING, `Alert fired: ${name} - ${message}`, details);
      this.emit('alert:fired', alert);
      
      // Send notifications
      this.sendNotifications(alert);
    } else if (alert.state === AlertState.RESOLVED) {
      // Alert re-fired
      alert.state = AlertState.FIRING;
      alert.startTime = new Date();
      alert.endTime = undefined;
      alert.count++;
      
      logger.warn(LogCategory.MONITORING, `Alert re-fired: ${name} - ${message}`, details);
      this.emit('alert:refired', alert);
      
      // Check cooldown before sending notifications
      if (this.shouldNotify(alert)) {
        this.sendNotifications(alert);
      }
    } else {
      // Alert still firing, increment count
      alert.count++;
    }
  }
  
  /**
   * Resolve an alert
   */
  resolveAlert(id: string): void {
    const alert = this.alerts.get(id);
    
    if (alert && alert.state === AlertState.FIRING) {
      alert.state = AlertState.RESOLVED;
      alert.endTime = new Date();
      
      logger.info(LogCategory.MONITORING, `Alert resolved: ${alert.name}`);
      this.emit('alert:resolved', alert);
      
      // Send resolution notification
      this.sendResolutionNotification(alert);
    }
  }
  
  /**
   * Evaluate all registered alerts
   */
  private async evaluateAlerts(): Promise<void> {
    const eventNames = this.eventNames();
    
    for (const eventName of eventNames) {
      if (typeof eventName === 'string' && eventName.startsWith('evaluate:')) {
        this.emit(eventName);
      }
    }
  }
  
  /**
   * Check if we should notify for this alert
   */
  private shouldNotify(alert: Alert): boolean {
    if (!alert.lastNotified) {
      return true;
    }
    
    const timeSinceLastNotification = Date.now() - alert.lastNotified.getTime();
    return timeSinceLastNotification >= this.COOLDOWN_PERIOD;
  }
  
  /**
   * Send notifications for an alert
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    alert.lastNotified = new Date();
    
    // Log notification
    if (alert.severity === AlertSeverity.CRITICAL) {
      logger.error(LogCategory.MONITORING, `CRITICAL ALERT: ${alert.name} - ${alert.message}`, alert.details);
    } else if (alert.severity === AlertSeverity.WARNING) {
      logger.warn(LogCategory.MONITORING, `WARNING ALERT: ${alert.name} - ${alert.message}`, alert.details);
    } else {
      logger.info(LogCategory.MONITORING, `INFO ALERT: ${alert.name} - ${alert.message}`, alert.details);
    }
    
    // Send to configured channels
    const channels = monitoringConfig.alerting.channels;
    
    // Webhook notification
    if (channels.webhook?.enabled && channels.webhook.url) {
      this.sendWebhookNotification(alert, channels.webhook.url);
    }
    
    // Slack notification
    if (channels.slack?.enabled && channels.slack.webhookUrl) {
      this.sendSlackNotification(alert, channels.slack.webhookUrl);
    }
    
    // Email notification (only for critical alerts)
    if (alert.severity === AlertSeverity.CRITICAL && channels.email?.enabled) {
      this.sendEmailNotification(alert);
    }
  }
  
  /**
   * Send resolution notification
   */
  private async sendResolutionNotification(alert: Alert): Promise<void> {
    const duration = alert.endTime ? 
      Math.round((alert.endTime.getTime() - alert.startTime.getTime()) / 1000) : 0;
    
    logger.info(LogCategory.MONITORING, 
      `Alert ${alert.name} resolved after ${duration}s (fired ${alert.count} times)`
    );
    
    // Send to configured channels
    const channels = monitoringConfig.alerting.channels;
    
    if (channels.webhook?.enabled && channels.webhook.url) {
      this.sendWebhookNotification({
        ...alert,
        message: `RESOLVED: ${alert.message} (duration: ${duration}s)`
      }, channels.webhook.url);
    }
  }
  
  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(alert: Alert, url: string): Promise<void> {
    try {
      const payload = {
        alert: {
          id: alert.id,
          name: alert.name,
          severity: alert.severity,
          state: alert.state,
          message: alert.message,
          details: alert.details,
          startTime: alert.startTime,
          endTime: alert.endTime,
          count: alert.count
        },
        timestamp: new Date().toISOString(),
        source: 'MaiFarm Alert Manager'
      };
      
      // Use fetch to send webhook
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        logger.error(LogCategory.MONITORING, `Webhook notification failed: ${response.status}`);
      }
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to send webhook notification:', error);
    }
  }
  
  /**
   * Send Slack notification
   */
  private async sendSlackNotification(alert: Alert, webhookUrl: string): Promise<void> {
    try {
      const emoji = alert.severity === AlertSeverity.CRITICAL ? '🚨' :
                    alert.severity === AlertSeverity.WARNING ? '⚠️' : 'ℹ️';
      
      const color = alert.severity === AlertSeverity.CRITICAL ? 'danger' :
                    alert.severity === AlertSeverity.WARNING ? 'warning' : 'good';
      
      const payload = {
        text: `${emoji} *${alert.name}*`,
        attachments: [
          {
            color,
            fields: [
              {
                title: 'Message',
                value: alert.message,
                short: false
              },
              {
                title: 'Severity',
                value: alert.severity.toUpperCase(),
                short: true
              },
              {
                title: 'Time',
                value: alert.startTime.toISOString(),
                short: true
              }
            ],
            footer: 'MaiFarm Alert Manager'
          }
        ]
      };
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        logger.error(LogCategory.MONITORING, `Slack notification failed: ${response.status}`);
      }
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to send Slack notification:', error);
    }
  }
  
  /**
   * Send email notification (stub - would need email service)
   */
  private async sendEmailNotification(alert: Alert): Promise<void> {
    logger.info(LogCategory.MONITORING, `Email notification would be sent for: ${alert.name}`);
    // Implementation would require nodemailer or similar
  }
  
  /**
   * Add alert to history
   */
  private addToHistory(alert: Alert): void {
    this.alertHistory.push({ ...alert });
    
    // Trim history if too large
    if (this.alertHistory.length > this.MAX_HISTORY) {
      this.alertHistory = this.alertHistory.slice(-this.MAX_HISTORY);
    }
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .filter(alert => alert.state === AlertState.FIRING);
  }
  
  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }
  
  /**
   * Get alert statistics
   */
  getAlertStats(): {
    active: number;
    resolved: number;
    critical: number;
    warning: number;
    info: number;
    totalFired: number;
  } {
    const active = this.getActiveAlerts();
    const resolved = Array.from(this.alerts.values())
      .filter(alert => alert.state === AlertState.RESOLVED);
    
    return {
      active: active.length,
      resolved: resolved.length,
      critical: active.filter(a => a.severity === AlertSeverity.CRITICAL).length,
      warning: active.filter(a => a.severity === AlertSeverity.WARNING).length,
      info: active.filter(a => a.severity === AlertSeverity.INFO).length,
      totalFired: this.alertHistory.length
    };
  }
  
  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.alerts.clear();
    logger.info(LogCategory.MONITORING, 'All alerts cleared');
  }
  
  /**
   * Destroy the alert manager
   */
  destroy(): void {
    this.stopEvaluation();
    this.clearAlerts();
    this.removeAllListeners();
    logger.info(LogCategory.MONITORING, 'Alert manager destroyed');
  }
}

export const alertManager = AlertManager.getInstance();