import { Alert } from './alertManager';

export interface AlertThreshold {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number;
  duration?: number; // in seconds
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  thresholds: AlertThreshold[];
  aggregation?: 'avg' | 'min' | 'max' | 'sum' | 'count';
  groupBy?: string[];
  channels: string[];
  cooldownMinutes: number;
  metadata?: Record<string, any>;
}

export interface AlertChannel {
  id: string;
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'pagerduty' | 'sms' | 'websocket';
  config: Record<string, any>;
  enabled: boolean;
}

export class AlertConfigManager {
  private rules: Map<string, AlertRule> = new Map();
  private channels: Map<string, AlertChannel> = new Map();

  constructor() {
    this.loadDefaultConfiguration();
  }

  private loadDefaultConfiguration() {
    // Default alert channels
    this.addChannel({
      id: 'default-websocket',
      name: 'WebSocket Notifications',
      type: 'websocket',
      config: {},
      enabled: true
    });

    this.addChannel({
      id: 'ops-email',
      name: 'Operations Email',
      type: 'email',
      config: {
        to: ['ops@maifarm.ai'],
        cc: [],
        templateId: 'default'
      },
      enabled: true
    });

    this.addChannel({
      id: 'ops-slack',
      name: 'Operations Slack',
      type: 'slack',
      config: {
        channel: '#ops-alerts',
        mentionUsers: ['@oncall']
      },
      enabled: true
    });

    // Default alert rules
    this.addRule({
      id: 'cpu-high',
      name: 'High CPU Usage',
      description: 'CPU usage is above threshold',
      severity: 'warning',
      enabled: true,
      thresholds: [{
        metric: 'system.cpu.usage',
        operator: '>',
        value: 80,
        duration: 300 // 5 minutes
      }],
      channels: ['default-websocket', 'ops-slack'],
      cooldownMinutes: 10
    });

    this.addRule({
      id: 'memory-high',
      name: 'High Memory Usage',
      description: 'Memory usage is above threshold',
      severity: 'warning',
      enabled: true,
      thresholds: [{
        metric: 'system.memory.usage',
        operator: '>',
        value: 85,
        duration: 300
      }],
      channels: ['default-websocket', 'ops-slack'],
      cooldownMinutes: 10
    });

    this.addRule({
      id: 'farm-failure-rate',
      name: 'High Farm Failure Rate',
      description: 'Farm failure rate exceeds acceptable threshold',
      severity: 'critical',
      enabled: true,
      thresholds: [{
        metric: 'farm.failure.rate',
        operator: '>',
        value: 20,
        duration: 600 // 10 minutes
      }],
      channels: ['default-websocket', 'ops-email', 'ops-slack'],
      cooldownMinutes: 15
    });

    this.addRule({
      id: 'api-latency',
      name: 'High API Latency',
      description: 'API response time is degraded',
      severity: 'warning',
      enabled: true,
      thresholds: [{
        metric: 'api.latency.p95',
        operator: '>',
        value: 1000, // 1 second
        duration: 300
      }],
      aggregation: 'avg',
      channels: ['default-websocket', 'ops-slack'],
      cooldownMinutes: 5
    });

    this.addRule({
      id: 'agent-pool-exhausted',
      name: 'Agent Pool Exhausted',
      description: 'Available agent pool is running low',
      severity: 'critical',
      enabled: true,
      thresholds: [{
        metric: 'agent.pool.available',
        operator: '<',
        value: 5,
        duration: 60
      }],
      channels: ['default-websocket', 'ops-email', 'ops-slack'],
      cooldownMinutes: 5
    });

    this.addRule({
      id: 'disk-space-low',
      name: 'Low Disk Space',
      description: 'Disk space is running low',
      severity: 'warning',
      enabled: true,
      thresholds: [{
        metric: 'system.disk.usage',
        operator: '>',
        value: 90,
        duration: 300
      }],
      channels: ['ops-email', 'ops-slack'],
      cooldownMinutes: 30
    });

    this.addRule({
      id: 'websocket-connections',
      name: 'High WebSocket Connections',
      description: 'WebSocket connection count is unusually high',
      severity: 'info',
      enabled: true,
      thresholds: [{
        metric: 'websocket.connections.active',
        operator: '>',
        value: 1000,
        duration: 180
      }],
      channels: ['default-websocket'],
      cooldownMinutes: 15
    });

    this.addRule({
      id: 'task-queue-depth',
      name: 'Task Queue Backup',
      description: 'Task queue depth is growing',
      severity: 'warning',
      enabled: true,
      thresholds: [{
        metric: 'task.queue.depth',
        operator: '>',
        value: 500,
        duration: 300
      }],
      channels: ['default-websocket', 'ops-slack'],
      cooldownMinutes: 10
    });

    this.addRule({
      id: 'error-rate-spike',
      name: 'Error Rate Spike',
      description: 'Application error rate has spiked',
      severity: 'critical',
      enabled: true,
      thresholds: [{
        metric: 'error.rate.per_minute',
        operator: '>',
        value: 50,
        duration: 120
      }],
      channels: ['default-websocket', 'ops-email', 'ops-slack'],
      cooldownMinutes: 5
    });

    this.addRule({
      id: 'farm-efficiency-low',
      name: 'Low Farm Efficiency',
      description: 'Farm efficiency has dropped below acceptable levels',
      severity: 'warning',
      enabled: true,
      thresholds: [{
        metric: 'farm.efficiency.average',
        operator: '<',
        value: 70,
        duration: 900 // 15 minutes
      }],
      aggregation: 'avg',
      groupBy: ['farm_id'],
      channels: ['default-websocket', 'ops-slack'],
      cooldownMinutes: 20
    });
  }

  // Add or update an alert rule
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  // Remove an alert rule
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  // Get a specific rule
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  // Get all rules
  getAllRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  // Get enabled rules
  getEnabledRules(): AlertRule[] {
    return Array.from(this.rules.values()).filter(rule => rule.enabled);
  }

  // Update rule configuration
  updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.set(ruleId, { ...rule, ...updates });
    }
  }

  // Toggle rule enabled status
  toggleRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = !rule.enabled;
    }
  }

  // Add or update an alert channel
  addChannel(channel: AlertChannel): void {
    this.channels.set(channel.id, channel);
  }

  // Remove an alert channel
  removeChannel(channelId: string): void {
    this.channels.delete(channelId);
  }

  // Get a specific channel
  getChannel(channelId: string): AlertChannel | undefined {
    return this.channels.get(channelId);
  }

  // Get all channels
  getAllChannels(): AlertChannel[] {
    return Array.from(this.channels.values());
  }

  // Get enabled channels
  getEnabledChannels(): AlertChannel[] {
    return Array.from(this.channels.values()).filter(channel => channel.enabled);
  }

  // Update channel configuration
  updateChannel(channelId: string, updates: Partial<AlertChannel>): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      this.channels.set(channelId, { ...channel, ...updates });
    }
  }

  // Export configuration
  exportConfiguration(): {
    rules: AlertRule[];
    channels: AlertChannel[];
  } {
    return {
      rules: this.getAllRules(),
      channels: this.getAllChannels()
    };
  }

  // Import configuration
  importConfiguration(config: {
    rules?: AlertRule[];
    channels?: AlertChannel[];
  }): void {
    if (config.rules) {
      config.rules.forEach(rule => this.addRule(rule));
    }
    if (config.channels) {
      config.channels.forEach(channel => this.addChannel(channel));
    }
  }

  // Validate rule configuration
  validateRule(rule: AlertRule): string[] {
    const errors: string[] = [];

    if (!rule.id || rule.id.trim() === '') {
      errors.push('Rule ID is required');
    }

    if (!rule.name || rule.name.trim() === '') {
      errors.push('Rule name is required');
    }

    if (!rule.thresholds || rule.thresholds.length === 0) {
      errors.push('At least one threshold is required');
    }

    rule.thresholds.forEach((threshold, index) => {
      if (!threshold.metric) {
        errors.push(`Threshold ${index + 1}: metric is required`);
      }
      if (typeof threshold.value !== 'number') {
        errors.push(`Threshold ${index + 1}: value must be a number`);
      }
    });

    if (!rule.channels || rule.channels.length === 0) {
      errors.push('At least one notification channel is required');
    }

    rule.channels.forEach(channelId => {
      if (!this.channels.has(channelId)) {
        errors.push(`Channel '${channelId}' does not exist`);
      }
    });

    return errors;
  }
}

// Export singleton instance
export const alertConfigManager = new AlertConfigManager();