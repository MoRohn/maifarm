import nodemailer from 'nodemailer';
import { IncomingWebhook } from '@slack/webhook';
import * as cron from 'node-cron';
import { Server as SocketIOServer } from 'socket.io';

interface Alert {
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
  condition: () => Promise<boolean>;
  message: (data?: any) => string;
  channels: AlertChannel[];
  cooldownMinutes: number;
  lastTriggered?: Date;
}

interface AlertChannel {
  type: 'email' | 'slack' | 'websocket' | 'sms' | 'pagerduty';
  config: any;
}

interface AlertNotification {
  alertId: string;
  alertName: string;
  severity: string;
  message: string;
  timestamp: Date;
  data?: any;
}

export class AlertManager {
  private alerts: Map<string, Alert> = new Map();
  private emailTransporter: nodemailer.Transporter | null = null;
  private slackWebhook: IncomingWebhook | null = null;
  private io: SocketIOServer | null = null;
  private alertHistory: AlertNotification[] = [];
  private evaluationJob: cron.ScheduledTask | null = null;

  constructor() {
    this.setupDefaultAlerts();
  }

  // Initialize notification channels
  public async initialize(config: {
    email?: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    slack?: {
      webhookUrl: string;
    };
    io?: SocketIOServer;
  }) {
    // Email configuration
    if (config.email) {
      this.emailTransporter = nodemailer.createTransporter(config.email);
      await this.emailTransporter.verify();
      console.log('Email alerts configured successfully');
    }

    // Slack configuration
    if (config.slack?.webhookUrl) {
      this.slackWebhook = new IncomingWebhook(config.slack.webhookUrl);
      console.log('Slack alerts configured successfully');
    }

    // WebSocket configuration
    if (config.io) {
      this.io = config.io;
      console.log('WebSocket alerts configured successfully');
    }

    // Start alert evaluation
    this.startAlertEvaluation();
  }

  // Setup default alerts
  private setupDefaultAlerts() {
    // High CPU usage alert
    this.addAlert({
      id: 'high_cpu',
      name: 'High CPU Usage',
      severity: 'warning',
      condition: async () => {
        const cpuUsage = await this.getCPUUsage();
        return cpuUsage > 80;
      },
      message: (data) => `CPU usage is at ${data?.cpuUsage || 'unknown'}%`,
      channels: [
        { type: 'websocket', config: {} },
        { type: 'slack', config: {} }
      ],
      cooldownMinutes: 5
    });

    // High memory usage alert
    this.addAlert({
      id: 'high_memory',
      name: 'High Memory Usage',
      severity: 'warning',
      condition: async () => {
        const memoryUsage = await this.getMemoryUsage();
        return memoryUsage > 85;
      },
      message: (data) => `Memory usage is at ${data?.memoryUsage || 'unknown'}%`,
      channels: [
        { type: 'websocket', config: {} },
        { type: 'slack', config: {} }
      ],
      cooldownMinutes: 5
    });

    // Farm failure rate alert
    this.addAlert({
      id: 'high_farm_failure',
      name: 'High Farm Failure Rate',
      severity: 'critical',
      condition: async () => {
        const failureRate = await this.getFarmFailureRate();
        return failureRate > 20;
      },
      message: (data) => `Farm failure rate is at ${data?.failureRate || 'unknown'}%`,
      channels: [
        { type: 'email', config: { to: 'ops@maifarm.ai' } },
        { type: 'slack', config: {} },
        { type: 'websocket', config: {} }
      ],
      cooldownMinutes: 15
    });

    // API response time alert
    this.addAlert({
      id: 'slow_api_response',
      name: 'Slow API Response Time',
      severity: 'warning',
      condition: async () => {
        const avgResponseTime = await this.getAverageApiResponseTime();
        return avgResponseTime > 1000; // 1 second
      },
      message: (data) => `Average API response time is ${data?.responseTime || 'unknown'}ms`,
      channels: [
        { type: 'websocket', config: {} },
        { type: 'slack', config: {} }
      ],
      cooldownMinutes: 10
    });

    // No active farms alert
    this.addAlert({
      id: 'no_active_farms',
      name: 'No Active Farms',
      severity: 'info',
      condition: async () => {
        const activeFarms = await this.getActiveFarmsCount();
        return activeFarms === 0;
      },
      message: () => 'No farms are currently active',
      channels: [
        { type: 'websocket', config: {} }
      ],
      cooldownMinutes: 30
    });
  }

  // Add custom alert
  public addAlert(alert: Alert) {
    this.alerts.set(alert.id, alert);
  }

  // Remove alert
  public removeAlert(alertId: string) {
    this.alerts.delete(alertId);
  }

  // Start periodic alert evaluation
  private startAlertEvaluation() {
    // Evaluate alerts every minute
    this.evaluationJob = cron.schedule('* * * * *', async () => {
      await this.evaluateAlerts();
    });
  }

  // Stop alert evaluation
  public stop() {
    if (this.evaluationJob) {
      this.evaluationJob.stop();
    }
  }

  // Evaluate all alerts
  private async evaluateAlerts() {
    for (const [alertId, alert] of this.alerts) {
      try {
        // Check cooldown
        if (alert.lastTriggered) {
          const cooldownMs = alert.cooldownMinutes * 60 * 1000;
          if (Date.now() - alert.lastTriggered.getTime() < cooldownMs) {
            continue;
          }
        }

        // Evaluate condition
        const shouldTrigger = await alert.condition();
        
        if (shouldTrigger) {
          await this.triggerAlert(alert);
        }
      } catch (error) {
        console.error(`Error evaluating alert ${alertId}:`, error);
      }
    }
  }

  // Trigger alert notifications
  private async triggerAlert(alert: Alert) {
    const notification: AlertNotification = {
      alertId: alert.id,
      alertName: alert.name,
      severity: alert.severity,
      message: alert.message(),
      timestamp: new Date()
    };

    // Update last triggered time
    alert.lastTriggered = new Date();

    // Add to history
    this.alertHistory.push(notification);
    if (this.alertHistory.length > 1000) {
      this.alertHistory.shift();
    }

    // Send notifications through configured channels
    for (const channel of alert.channels) {
      try {
        await this.sendNotification(notification, channel);
      } catch (error) {
        console.error(`Error sending ${channel.type} notification:`, error);
      }
    }
  }

  // Send notification through specific channel
  private async sendNotification(notification: AlertNotification, channel: AlertChannel) {
    switch (channel.type) {
      case 'email':
        await this.sendEmailNotification(notification, channel.config);
        break;
      case 'slack':
        await this.sendSlackNotification(notification);
        break;
      case 'websocket':
        await this.sendWebSocketNotification(notification);
        break;
      case 'sms':
        // SMS implementation would go here
        console.log('SMS notifications not yet implemented');
        break;
      case 'pagerduty':
        // PagerDuty implementation would go here
        console.log('PagerDuty notifications not yet implemented');
        break;
    }
  }

  // Email notification
  private async sendEmailNotification(notification: AlertNotification, config: any) {
    if (!this.emailTransporter) return;

    const mailOptions = {
      from: process.env.ALERT_EMAIL_FROM || 'alerts@maifarm.ai',
      to: config.to || process.env.ALERT_EMAIL_TO || 'ops@maifarm.ai',
      subject: `[${notification.severity.toUpperCase()}] ${notification.alertName}`,
      html: `
        <h2>MaiFarm Alert</h2>
        <p><strong>Alert:</strong> ${notification.alertName}</p>
        <p><strong>Severity:</strong> ${notification.severity}</p>
        <p><strong>Message:</strong> ${notification.message}</p>
        <p><strong>Time:</strong> ${notification.timestamp.toISOString()}</p>
        <hr>
        <p><small>This is an automated alert from MaiFarm monitoring system.</small></p>
      `
    };

    await this.emailTransporter.sendMail(mailOptions);
  }

  // Slack notification
  private async sendSlackNotification(notification: AlertNotification) {
    if (!this.slackWebhook) return;

    const color = notification.severity === 'critical' ? 'danger' : 
                  notification.severity === 'warning' ? 'warning' : 'good';

    await this.slackWebhook.send({
      attachments: [{
        color,
        title: notification.alertName,
        text: notification.message,
        fields: [
          {
            title: 'Severity',
            value: notification.severity,
            short: true
          },
          {
            title: 'Time',
            value: notification.timestamp.toLocaleString(),
            short: true
          }
        ],
        footer: 'MaiFarm Alert System',
        ts: Math.floor(notification.timestamp.getTime() / 1000).toString()
      }]
    });
  }

  // WebSocket notification
  private async sendWebSocketNotification(notification: AlertNotification) {
    if (!this.io) return;

    this.io.emit('alert:triggered', {
      id: notification.alertId,
      name: notification.alertName,
      severity: notification.severity,
      message: notification.message,
      timestamp: notification.timestamp
    });
  }

  // Get alert history
  public getAlertHistory(limit: number = 100): AlertNotification[] {
    return this.alertHistory.slice(-limit);
  }

  // Get active alerts
  public getActiveAlerts(): Array<{id: string; name: string; severity: string}> {
    return Array.from(this.alerts.values()).map(alert => ({
      id: alert.id,
      name: alert.name,
      severity: alert.severity
    }));
  }

  // Metric collection helpers (these would connect to actual metrics)
  private async getCPUUsage(): Promise<number> {
    // Implement actual CPU usage check
    return Math.random() * 100; // Placeholder
  }

  private async getMemoryUsage(): Promise<number> {
    // Implement actual memory usage check
    return Math.random() * 100; // Placeholder
  }

  private async getFarmFailureRate(): Promise<number> {
    // Implement actual farm failure rate calculation
    return Math.random() * 30; // Placeholder
  }

  private async getAverageApiResponseTime(): Promise<number> {
    // Implement actual API response time calculation
    return Math.random() * 2000; // Placeholder
  }

  private async getActiveFarmsCount(): Promise<number> {
    // Implement actual active farms count
    return Math.floor(Math.random() * 10); // Placeholder
  }
}

// Export singleton instance
export const alertManager = new AlertManager();