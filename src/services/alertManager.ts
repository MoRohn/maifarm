import { EventEmitter } from 'events';
import {
  Alert,
  AlertRule,
  AlertStatus,
  AlertSeverity,
  AlertCondition,
  ComparisonOperator,
  AlertNotification,
  NotificationChannel,
  NotificationStatus,
  NotificationConfig,
  AlertHistory,
  AlertEvent,
  AlertEventType,
  AlertSilence,
  SilenceStatus,
  EscalationPolicy,
  AlertMetrics
} from '../types/alerts';
import { Metric, MetricThreshold, ThresholdCondition } from '../types/metrics';
import { metricsCollector } from './metricsCollector';

interface AlertState {
  alert: Alert;
  evaluations: number;
  lastEvaluation: number;
  notifications: AlertNotification[];
  silenced: boolean;
}

export class AlertManager extends EventEmitter {
  private static instance: AlertManager;
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, AlertState> = new Map();
  private silences: Map<string, AlertSilence> = new Map();
  private notificationConfigs: Map<NotificationChannel, NotificationConfig> = new Map();
  private escalationPolicies: Map<string, EscalationPolicy> = new Map();
  private evaluationInterval: NodeJS.Timeout | null = null;
  private alertHistory: Map<string, AlertHistory> = new Map();

  private constructor() {
    super();
  }

  static getInstance(): AlertManager {
    if (!AlertManager.instance) {
      AlertManager.instance = new AlertManager();
    }
    return AlertManager.instance;
  }

  // Start alert evaluation
  start(interval: number = 30000): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }

    this.evaluationInterval = setInterval(() => {
      this.evaluateRules();
    }, interval);

    this.emit('alerting:started');
  }

  // Stop alert evaluation
  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }

    this.emit('alerting:stopped');
  }

  // Add alert rule
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.emit('rule:added', rule);
  }

  // Remove alert rule
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    
    // Remove associated alerts
    this.activeAlerts.forEach((state, alertId) => {
      if (state.alert.name === ruleId) {
        this.resolveAlert(alertId);
      }
    });

    this.emit('rule:removed', ruleId);
  }

  // Update alert rule
  updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      Object.assign(rule, updates);
      this.emit('rule:updated', rule);
    }
  }

  // Add notification config
  addNotificationConfig(config: NotificationConfig): void {
    this.notificationConfigs.set(config.channel, config);
    this.emit('notification:configured', config);
  }

  // Add escalation policy
  addEscalationPolicy(policy: EscalationPolicy): void {
    this.escalationPolicies.set(policy.id, policy);
    this.emit('escalation:added', policy);
  }

  // Create silence
  createSilence(silence: AlertSilence): void {
    this.silences.set(silence.id, silence);
    this.emit('silence:created', silence);
  }

  // Evaluate all rules
  private async evaluateRules(): Promise<void> {
    const enabledRules = Array.from(this.rules.values()).filter(r => r.enabled);

    for (const rule of enabledRules) {
      try {
        await this.evaluateRule(rule);
      } catch (error) {
        this.emit('error', { rule, error });
      }
    }

    // Check for resolved alerts
    this.checkResolvedAlerts();
    
    // Update metrics
    this.updateAlertMetrics();
  }

  // Evaluate a single rule
  private async evaluateRule(rule: AlertRule): Promise<void> {
    const metrics = this.queryMetrics(rule.query);
    const shouldFire = this.checkCondition(metrics, rule.condition);

    const alertId = this.generateAlertId(rule);
    const existingState = this.activeAlerts.get(alertId);

    if (shouldFire) {
      if (!existingState) {
        // Create new alert
        const alert: Alert = {
          id: alertId,
          name: rule.name,
          description: this.interpolateDescription(rule.annotations.description || '', metrics),
          metric: rule.query,
          condition: rule.condition,
          severity: rule.severity,
          status: AlertStatus.PENDING,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          annotations: rule.annotations,
          labels: rule.labels
        };

        const state: AlertState = {
          alert,
          evaluations: 1,
          lastEvaluation: Date.now(),
          notifications: [],
          silenced: this.isAlertSilenced(alert)
        };

        this.activeAlerts.set(alertId, state);
        this.addToHistory(alertId, AlertEventType.CREATED, 'Alert created');
      } else {
        // Update existing alert
        existingState.evaluations++;
        existingState.lastEvaluation = Date.now();

        // Check if alert should transition to firing
        if (existingState.alert.status === AlertStatus.PENDING) {
          const duration = this.parseDuration(rule.for || '0s');
          if (Date.now() - existingState.alert.createdAt >= duration) {
            existingState.alert.status = AlertStatus.FIRING;
            existingState.alert.updatedAt = Date.now();
            
            if (!existingState.silenced) {
              this.sendNotifications(existingState);
            }
            
            this.addToHistory(alertId, AlertEventType.TRIGGERED, 'Alert firing');
            this.emit('alert:firing', existingState.alert);
          }
        }
      }
    } else if (existingState && existingState.alert.status !== AlertStatus.RESOLVED) {
      // Resolve alert
      this.resolveAlert(alertId);
    }
  }

  // Query metrics
  private queryMetrics(query: string): Metric[] {
    // Parse the query and get metrics from collector
    // This is a simplified implementation
    const metricName = query.split('{')[0];
    return metricsCollector.getRecentMetrics(metricName, 300000); // Last 5 minutes
  }

  // Check condition
  private checkCondition(metrics: Metric[], condition: AlertCondition): boolean {
    if (metrics.length === 0) return false;

    const value = this.aggregateMetrics(metrics, condition.aggregation);
    const threshold = Number(condition.value);

    switch (condition.operator) {
      case ComparisonOperator.GREATER_THAN:
        return value > threshold;
      case ComparisonOperator.LESS_THAN:
        return value < threshold;
      case ComparisonOperator.EQUALS:
        return value === threshold;
      case ComparisonOperator.NOT_EQUALS:
        return value !== threshold;
      case ComparisonOperator.GREATER_OR_EQUAL:
        return value >= threshold;
      case ComparisonOperator.LESS_OR_EQUAL:
        return value <= threshold;
      default:
        return false;
    }
  }

  // Aggregate metrics
  private aggregateMetrics(metrics: Metric[], aggregation?: string): number {
    if (metrics.length === 0) return 0;

    const values = metrics.map(m => m.value);
    
    switch (aggregation) {
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      default:
        return values[values.length - 1]; // Last value
    }
  }

  // Check if alert is silenced
  private isAlertSilenced(alert: Alert): boolean {
    return Array.from(this.silences.values()).some(silence => {
      if (silence.status !== SilenceStatus.ACTIVE) return false;
      if (Date.now() > silence.endsAt) return false;

      return silence.matchers.every(matcher => {
        const value = alert.labels[matcher.name] || alert.annotations[matcher.name];
        if (!value) return false;

        if (matcher.isRegex) {
          const regex = new RegExp(matcher.value);
          return regex.test(value);
        }
        
        return value === matcher.value;
      });
    });
  }

  // Send notifications
  private async sendNotifications(state: AlertState): Promise<void> {
    const configs = Array.from(this.notificationConfigs.values())
      .filter(c => c.enabled);

    for (const config of configs) {
      const notification: AlertNotification = {
        id: `${state.alert.id}-${Date.now()}`,
        alertId: state.alert.id,
        channel: config.channel,
        status: NotificationStatus.PENDING,
        sentAt: Date.now()
      };

      state.notifications.push(notification);

      try {
        await this.sendNotification(state.alert, config);
        notification.status = NotificationStatus.SENT;
        this.addToHistory(state.alert.id, AlertEventType.NOTIFIED, `Notification sent via ${config.channel}`);
      } catch (error) {
        notification.status = NotificationStatus.FAILED;
        notification.error = (error as Error).message;
        this.emit('notification:failed', { notification, error });
      }
    }
  }

  // Send individual notification
  private async sendNotification(alert: Alert, config: NotificationConfig): Promise<void> {
    switch (config.channel) {
      case NotificationChannel.WEBHOOK:
        const webhookConfig = config.config as any;
        await fetch(webhookConfig.url, {
          method: webhookConfig.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookConfig.headers || {})
          },
          body: JSON.stringify({
            alert,
            timestamp: Date.now()
          })
        });
        break;
      
      // Other notification channels would be implemented here
      default:
        this.emit('notification:sent', { alert, channel: config.channel });
    }
  }

  // Resolve alert
  private resolveAlert(alertId: string): void {
    const state = this.activeAlerts.get(alertId);
    if (state) {
      state.alert.status = AlertStatus.RESOLVED;
      state.alert.resolvedAt = Date.now();
      state.alert.updatedAt = Date.now();
      
      this.addToHistory(alertId, AlertEventType.RESOLVED, 'Alert resolved');
      this.emit('alert:resolved', state.alert);
      
      // Keep alert for history
      setTimeout(() => {
        this.activeAlerts.delete(alertId);
      }, 300000); // 5 minutes
    }
  }

  // Check for resolved alerts
  private checkResolvedAlerts(): void {
    const cutoff = Date.now() - 300000; // 5 minutes
    
    this.activeAlerts.forEach((state, alertId) => {
      if (state.alert.status === AlertStatus.RESOLVED && state.alert.resolvedAt! < cutoff) {
        this.activeAlerts.delete(alertId);
      }
    });
  }

  // Add to history
  private addToHistory(alertId: string, type: AlertEventType, message: string): void {
    if (!this.alertHistory.has(alertId)) {
      this.alertHistory.set(alertId, {
        alertId,
        events: []
      });
    }

    const history = this.alertHistory.get(alertId)!;
    history.events.push({
      timestamp: Date.now(),
      type,
      message
    });
  }

  // Update alert metrics
  private updateAlertMetrics(): void {
    const metrics: AlertMetrics = {
      totalAlerts: this.activeAlerts.size,
      activeAlerts: Array.from(this.activeAlerts.values())
        .filter(s => s.alert.status === AlertStatus.FIRING).length,
      alertsByStatus: this.groupByStatus(),
      alertsBySeverity: this.groupBySeverity(),
      mttr: this.calculateMTTR(),
      alertRate: this.calculateAlertRate(),
      falsePositiveRate: 0 // Would need manual feedback
    };

    this.emit('metrics:updated', metrics);
  }

  // Helper methods
  private generateAlertId(rule: AlertRule): string {
    const labels = Object.entries(rule.labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${rule.id}:{${labels}}`;
  }

  private interpolateDescription(template: string, metrics: Metric[]): string {
    // Simple template interpolation
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (key === 'value' && metrics.length > 0) {
        return metrics[metrics.length - 1].value.toFixed(2);
      }
      return match;
    });
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/(\d+)([smh])/);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 0;
    }
  }

  private groupByStatus(): Record<AlertStatus, number> {
    const groups: Record<AlertStatus, number> = {
      [AlertStatus.PENDING]: 0,
      [AlertStatus.FIRING]: 0,
      [AlertStatus.RESOLVED]: 0,
      [AlertStatus.SILENCED]: 0
    };

    this.activeAlerts.forEach(state => {
      groups[state.alert.status]++;
    });

    return groups;
  }

  private groupBySeverity(): Record<AlertSeverity, number> {
    const groups: Record<AlertSeverity, number> = {
      [AlertSeverity.INFO]: 0,
      [AlertSeverity.WARNING]: 0,
      [AlertSeverity.ERROR]: 0,
      [AlertSeverity.CRITICAL]: 0
    };

    this.activeAlerts.forEach(state => {
      groups[state.alert.severity]++;
    });

    return groups;
  }

  private calculateMTTR(): number {
    const resolved = Array.from(this.activeAlerts.values())
      .filter(s => s.alert.status === AlertStatus.RESOLVED && s.alert.resolvedAt);
    
    if (resolved.length === 0) return 0;

    const totalTime = resolved.reduce((sum, state) => {
      return sum + (state.alert.resolvedAt! - state.alert.createdAt);
    }, 0);

    return totalTime / resolved.length;
  }

  private calculateAlertRate(): number {
    const window = 3600000; // 1 hour
    const cutoff = Date.now() - window;
    
    const recent = Array.from(this.activeAlerts.values())
      .filter(s => s.alert.createdAt >= cutoff).length;
    
    return recent / (window / 60000); // Alerts per minute
  }

  // Public API
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .filter(s => s.alert.status === AlertStatus.FIRING)
      .map(s => s.alert);
  }

  getAlertHistory(alertId: string): AlertHistory | undefined {
    return this.alertHistory.get(alertId);
  }

  getAlertMetrics(): AlertMetrics {
    return {
      totalAlerts: this.activeAlerts.size,
      activeAlerts: this.getActiveAlerts().length,
      alertsByStatus: this.groupByStatus(),
      alertsBySeverity: this.groupBySeverity(),
      mttr: this.calculateMTTR(),
      alertRate: this.calculateAlertRate(),
      falsePositiveRate: 0
    };
  }

  acknowledgeAlert(alertId: string): void {
    const state = this.activeAlerts.get(alertId);
    if (state) {
      this.addToHistory(alertId, AlertEventType.ACKNOWLEDGED, 'Alert acknowledged');
      this.emit('alert:acknowledged', state.alert);
    }
  }

  silenceAlert(alertId: string, duration: number): void {
    const state = this.activeAlerts.get(alertId);
    if (state) {
      state.silenced = true;
      state.alert.status = AlertStatus.SILENCED;
      
      const silence: AlertSilence = {
        id: `silence-${alertId}-${Date.now()}`,
        matchers: [{ name: 'alert_id', value: alertId, isRegex: false }],
        startsAt: Date.now(),
        endsAt: Date.now() + duration,
        createdBy: 'system',
        comment: 'Manual silence',
        status: SilenceStatus.ACTIVE
      };
      
      this.silences.set(silence.id, silence);
      this.addToHistory(alertId, AlertEventType.SILENCED, `Alert silenced for ${duration}ms`);
      this.emit('alert:silenced', state.alert);
    }
  }
}

// Export singleton instance
export const alertManager = AlertManager.getInstance();