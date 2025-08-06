import { EventEmitter } from 'events';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { costTrackingService } from './costTrackingService.js';
import { telemetryService } from './telemetryService.js';

export interface CostAlert {
  id: string;
  type: 'budget_exceeded' | 'daily_limit' | 'monthly_limit' | 'spike_detected' | 'provider_comparison';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
  farmId?: string;
  agentId?: string;
  userId?: string;
  acknowledged: boolean;
  actions?: AlertAction[];
}

export interface AlertAction {
  id: string;
  label: string;
  type: 'switch_provider' | 'reduce_usage' | 'increase_budget' | 'pause_operations';
  metadata?: any;
}

export interface BudgetRule {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly' | 'session';
  limit: number;
  threshold: number; // Percentage (0-100) at which to trigger alert
  enabled: boolean;
  scope: 'global' | 'farm' | 'agent' | 'user';
  scopeId?: string;
  notifications: {
    email: boolean;
    slack: boolean;
    webhook: boolean;
    inApp: boolean;
  };
  actions: {
    autoSwitchProvider: boolean;
    pauseOperations: boolean;
    reduceUsage: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CostSpike {
  detected: boolean;
  threshold: number;
  current: number;
  previous: number;
  increase: number;
  timeWindow: string;
}

/**
 * Cost alerting and budgeting service
 * Implements proactive cost monitoring and automated responses
 */
export class AlertingService extends EventEmitter {
  private budgetRules: Map<string, BudgetRule> = new Map();
  private activeAlerts: Map<string, CostAlert> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private spikeDetectionWindow = 5 * 60 * 1000; // 5 minutes
  private lastCostCheck: { [scope: string]: number } = {};

  constructor() {
    super();
    this.initializeService();
  }

  /**
   * Initialize the alerting service
   */
  private async initializeService(): Promise<void> {
    try {
      await this.loadBudgetRules();
      await this.createAlertsTable();
      this.startMonitoring();
      
      // Listen to cost tracking events
      costTrackingService.on('cost:update', this.handleCostUpdate.bind(this));
      
      logger.info('Cost alerting service initialized');
    } catch (error) {
      logger.error('Failed to initialize alerting service:', error);
    }
  }

  /**
   * Create a new budget rule
   */
  async createBudgetRule(rule: Omit<BudgetRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<BudgetRule> {
    const budgetRule: BudgetRule = {
      ...rule,
      id: `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.budgetRules.set(budgetRule.id, budgetRule);
    
    try {
      await this.persistBudgetRule(budgetRule);
      logger.info('Budget rule created:', { id: budgetRule.id, name: budgetRule.name });
      
      this.emit('budget:rule:created', budgetRule);
      return budgetRule;
    } catch (error) {
      this.budgetRules.delete(budgetRule.id);
      logger.error('Failed to persist budget rule:', error);
      throw error;
    }
  }

  /**
   * Update an existing budget rule
   */
  async updateBudgetRule(id: string, updates: Partial<BudgetRule>): Promise<BudgetRule> {
    const rule = this.budgetRules.get(id);
    if (!rule) {
      throw new Error(`Budget rule ${id} not found`);
    }

    const updatedRule = {
      ...rule,
      ...updates,
      updatedAt: new Date()
    };

    this.budgetRules.set(id, updatedRule);
    
    try {
      await this.persistBudgetRule(updatedRule);
      logger.info('Budget rule updated:', { id, updates: Object.keys(updates) });
      
      this.emit('budget:rule:updated', updatedRule);
      return updatedRule;
    } catch (error) {
      this.budgetRules.set(id, rule); // Rollback
      logger.error('Failed to update budget rule:', error);
      throw error;
    }
  }

  /**
   * Delete a budget rule
   */
  async deleteBudgetRule(id: string): Promise<void> {
    const rule = this.budgetRules.get(id);
    if (!rule) {
      throw new Error(`Budget rule ${id} not found`);
    }

    this.budgetRules.delete(id);
    
    try {
      await db.query('DELETE FROM budget_rules WHERE id = $1', [id]);
      logger.info('Budget rule deleted:', { id });
      
      this.emit('budget:rule:deleted', rule);
    } catch (error) {
      this.budgetRules.set(id, rule); // Rollback
      logger.error('Failed to delete budget rule:', error);
      throw error;
    }
  }

  /**
   * Get all budget rules
   */
  getBudgetRules(scope?: string, scopeId?: string): BudgetRule[] {
    const rules = Array.from(this.budgetRules.values());
    
    if (scope && scopeId) {
      return rules.filter(rule => rule.scope === scope && rule.scopeId === scopeId);
    }
    
    if (scope) {
      return rules.filter(rule => rule.scope === scope);
    }
    
    return rules;
  }

  /**
   * Check cost thresholds against budget rules
   */
  async checkCostThresholds(): Promise<CostAlert[]> {
    const alerts: CostAlert[] = [];
    const metrics = await costTrackingService.getRealTimeMetrics();

    for (const [ruleId, rule] of this.budgetRules.entries()) {
      if (!rule.enabled) continue;

      try {
        const currentCost = await this.getCurrentCostForRule(rule);
        const thresholdAmount = (rule.threshold / 100) * rule.limit;
        
        // Check if threshold is exceeded
        if (currentCost >= thresholdAmount) {
          const alertId = `${ruleId}_${Date.now()}`;
          
          // Check if we already have an active alert for this rule
          const existingAlert = Array.from(this.activeAlerts.values())
            .find(alert => alert.message.includes(rule.name) && !alert.acknowledged);
          
          if (!existingAlert) {
            const alert: CostAlert = {
              id: alertId,
              type: this.getAlertType(rule.type),
              severity: this.getSeverity(currentCost, rule.limit, rule.threshold),
              title: `Budget Alert: ${rule.name}`,
              message: `${rule.type} budget "${rule.name}" has reached ${rule.threshold}% of the limit. Current: $${currentCost.toFixed(2)}, Limit: $${rule.limit.toFixed(2)}`,
              currentValue: currentCost,
              threshold: thresholdAmount,
              timestamp: new Date(),
              farmId: rule.scope === 'farm' ? rule.scopeId : undefined,
              agentId: rule.scope === 'agent' ? rule.scopeId : undefined,
              userId: rule.scope === 'user' ? rule.scopeId : undefined,
              acknowledged: false,
              actions: this.generateAlertActions(rule, currentCost)
            };

            alerts.push(alert);
            this.activeAlerts.set(alertId, alert);
            
            // Send notifications
            await this.sendNotifications(alert, rule);
            
            // Execute automatic actions
            await this.executeAutomaticActions(rule, alert);
          }
        }
      } catch (error) {
        logger.error(`Failed to check threshold for rule ${ruleId}:`, error);
      }
    }

    // Check for cost spikes
    const spikeAlert = await this.detectCostSpikes();
    if (spikeAlert) {
      alerts.push(spikeAlert);
    }

    return alerts;
  }

  /**
   * Detect cost spikes
   */
  private async detectCostSpikes(): Promise<CostAlert | null> {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.spikeDetectionWindow);
      
      const currentCost = await costTrackingService.getCostsSince(windowStart);
      const previousWindowStart = new Date(windowStart.getTime() - this.spikeDetectionWindow);
      const previousCost = await costTrackingService.getCostsSince(previousWindowStart);
      
      const spikeThreshold = 200; // 200% increase
      const increase = previousCost > 0 ? ((currentCost - previousCost) / previousCost) * 100 : 0;
      
      if (increase >= spikeThreshold) {
        const alertId = `spike_${Date.now()}`;
        const alert: CostAlert = {
          id: alertId,
          type: 'spike_detected',
          severity: 'high',
          title: 'Cost Spike Detected',
          message: `Unusual cost spike detected: ${increase.toFixed(1)}% increase in the last ${this.spikeDetectionWindow / 60000} minutes`,
          currentValue: currentCost,
          threshold: previousCost * (spikeThreshold / 100),
          timestamp: new Date(),
          acknowledged: false,
          actions: [
            {
              id: 'investigate_spike',
              label: 'Investigate Spike',
              type: 'reduce_usage'
            },
            {
              id: 'pause_operations',
              label: 'Pause Operations',
              type: 'pause_operations'
            }
          ]
        };

        this.activeAlerts.set(alertId, alert);
        this.emit('alert:spike', alert);
        
        return alert;
      }
    } catch (error) {
      logger.error('Failed to detect cost spikes:', error);
    }
    
    return null;
  }

  /**
   * Handle cost update events
   */
  private handleCostUpdate(event: any): void {
    // Track Claude Code specific metrics
    if (event.usage.agentId) {
      telemetryService.trackToolUsage(
        'cost_tracking',
        Date.now() - event.usage.timestamp.getTime(),
        true,
        event.sessionId
      );
    }
    
    // Emit cost tracking telemetry event
    this.emit('cost:telemetry', {
      type: 'cost_update',
      data: event,
      timestamp: new Date()
    });
  }

  /**
   * Get current cost for a budget rule
   */
  private async getCurrentCostForRule(rule: BudgetRule): Promise<number> {
    const now = new Date();
    let startTime: Date;
    
    switch (rule.type) {
      case 'daily':
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        startTime = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        startTime.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        startTime = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'session':
        startTime = new Date(now.getTime() - 60 * 60 * 1000); // Last hour
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return await costTrackingService.getCostsSince(startTime);
  }

  /**
   * Get alert type based on rule type
   */
  private getAlertType(ruleType: string): CostAlert['type'] {
    switch (ruleType) {
      case 'daily':
        return 'daily_limit';
      case 'monthly':
        return 'monthly_limit';
      default:
        return 'budget_exceeded';
    }
  }

  /**
   * Get alert severity
   */
  private getSeverity(current: number, limit: number, threshold: number): CostAlert['severity'] {
    const percentage = (current / limit) * 100;
    
    if (percentage >= 100) return 'critical';
    if (percentage >= 90) return 'high';
    if (percentage >= threshold) return 'medium';
    return 'low';
  }

  /**
   * Generate alert actions
   */
  private generateAlertActions(rule: BudgetRule, currentCost: number): AlertAction[] {
    const actions: AlertAction[] = [];
    
    if (rule.actions.autoSwitchProvider) {
      actions.push({
        id: 'switch_provider',
        label: 'Switch to Cheaper Provider',
        type: 'switch_provider'
      });
    }
    
    if (rule.actions.reduceUsage) {
      actions.push({
        id: 'reduce_usage',
        label: 'Reduce Usage',
        type: 'reduce_usage'
      });
    }
    
    if (rule.actions.pauseOperations) {
      actions.push({
        id: 'pause_operations',
        label: 'Pause Operations',
        type: 'pause_operations'
      });
    }
    
    actions.push({
      id: 'increase_budget',
      label: 'Increase Budget',
      type: 'increase_budget',
      metadata: { suggestedIncrease: currentCost - rule.limit }
    });
    
    return actions;
  }

  /**
   * Send notifications for alerts
   */
  private async sendNotifications(alert: CostAlert, rule: BudgetRule): Promise<void> {
    try {
      // In-app notification (always sent)
      this.emit('alert:created', alert);
      
      // Additional notification methods would be implemented here
      // For now, we'll just log the notification
      logger.warn('Cost alert triggered', {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        currentValue: alert.currentValue,
        threshold: alert.threshold,
        rule: rule.name
      });
      
      // TODO: Implement email, Slack, webhook notifications
      
    } catch (error) {
      logger.error('Failed to send alert notifications:', error);
    }
  }

  /**
   * Execute automatic actions
   */
  private async executeAutomaticActions(rule: BudgetRule, alert: CostAlert): Promise<void> {
    try {
      if (rule.actions.autoSwitchProvider) {
        // TODO: Implement automatic provider switching
        logger.info('Auto provider switch would be triggered here', { alertId: alert.id });
      }
      
      if (rule.actions.pauseOperations) {
        // TODO: Implement operation pausing
        logger.info('Operation pause would be triggered here', { alertId: alert.id });
      }
      
      if (rule.actions.reduceUsage) {
        // TODO: Implement usage reduction
        logger.info('Usage reduction would be triggered here', { alertId: alert.id });
      }
    } catch (error) {
      logger.error('Failed to execute automatic actions:', error);
    }
  }

  /**
   * Load budget rules from database
   */
  private async loadBudgetRules(): Promise<void> {
    try {
      const result = await db.query('SELECT * FROM budget_rules WHERE enabled = true');
      
      for (const row of result.rows) {
        const rule: BudgetRule = {
          id: row.id,
          name: row.name,
          type: row.type,
          limit: parseFloat(row.limit),
          threshold: parseFloat(row.threshold),
          enabled: row.enabled,
          scope: row.scope,
          scopeId: row.scope_id,
          notifications: JSON.parse(row.notifications),
          actions: JSON.parse(row.actions),
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at)
        };
        
        this.budgetRules.set(rule.id, rule);
      }
      
      logger.info(`Loaded ${this.budgetRules.size} budget rules`);
    } catch (error) {
      logger.error('Failed to load budget rules:', error);
    }
  }

  /**
   * Persist budget rule to database
   */
  private async persistBudgetRule(rule: BudgetRule): Promise<void> {
    await db.query(`
      INSERT INTO budget_rules (
        id, name, type, limit, threshold, enabled, scope, scope_id,
        notifications, actions, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        name = $2, type = $3, limit = $4, threshold = $5, enabled = $6,
        scope = $7, scope_id = $8, notifications = $9, actions = $10, updated_at = $12
    `, [
      rule.id, rule.name, rule.type, rule.limit, rule.threshold, rule.enabled,
      rule.scope, rule.scopeId, JSON.stringify(rule.notifications),
      JSON.stringify(rule.actions), rule.createdAt, rule.updatedAt
    ]);
  }

  /**
   * Create alerts table if it doesn't exist
   */
  private async createAlertsTable(): Promise<void> {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS budget_rules (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          limit DECIMAL(10, 2) NOT NULL,
          threshold DECIMAL(5, 2) NOT NULL,
          enabled BOOLEAN DEFAULT true,
          scope VARCHAR(50) NOT NULL,
          scope_id VARCHAR(255),
          notifications JSONB NOT NULL,
          actions JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_budget_rules_scope ON budget_rules(scope, scope_id);
        CREATE INDEX IF NOT EXISTS idx_budget_rules_enabled ON budget_rules(enabled);
      `);
    } catch (error) {
      logger.error('Failed to create alerts table:', error);
    }
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    // Check thresholds every 30 seconds
    this.checkInterval = setInterval(async () => {
      try {
        const alerts = await this.checkCostThresholds();
        if (alerts.length > 0) {
          this.emit('alerts:checked', alerts);
        }
      } catch (error) {
        logger.error('Failed to check cost thresholds:', error);
      }
    }, 30000);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): CostAlert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alert:acknowledged', alert);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.budgetRules.clear();
    this.activeAlerts.clear();
    this.removeAllListeners();
  }
}

// Export singleton instance
export const alertingService = new AlertingService();