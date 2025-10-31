import { Router } from 'express';
import { alertManager } from '../monitoring/alertManager';

const router = Router();

interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  source: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, any>;
}

interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: {
    metric: string;
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    threshold: number;
    duration?: string; // e.g., "5m", "1h"
  };
  severity: 'critical' | 'warning' | 'info';
  actions: {
    webhook?: string;
    email?: string[];
    slack?: string;
  };
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Get active alerts
router.get('/api/alerts', async (req, res) => {
  try {
    const { severity, source, acknowledged, limit = 100, offset = 0 } = req.query;
    
    const alerts = await alertManager.getActiveAlerts({
      severity: severity as Alert['severity'],
      source: source as string,
      acknowledged: acknowledged === 'true',
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({
      alerts,
      total: alerts.length,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve alerts' });
  }
});

// Get alert history
router.get('/api/alerts/history', async (req, res) => {
  try {
    const { start, end, severity, source, limit = 100, offset = 0 } = req.query;
    
    const startDate = start ? new Date(start as string) : new Date(Date.now() - 86400000); // 24h ago
    const endDate = end ? new Date(end as string) : new Date();

    const history = await alertManager.getAlertHistory({
      startDate,
      endDate,
      severity: severity as Alert['severity'],
      source: source as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({
      alerts: history,
      timeRange: { start: startDate, end: endDate },
      total: history.length,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve alert history' });
  }
});

// Get specific alert
router.get('/api/alerts/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await alertManager.getAlert(alertId);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve alert' });
  }
});

// Acknowledge alert
router.post('/api/alerts/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { acknowledgedBy, notes } = req.body;

    const alert = await alertManager.acknowledgeAlert(alertId, {
      acknowledgedBy: acknowledgedBy || 'system',
      acknowledgedAt: new Date(),
      notes
    });

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({
      success: true,
      alert,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Resolve alert
router.post('/api/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { resolvedBy, resolution } = req.body;

    const alert = await alertManager.resolveAlert(alertId, {
      resolvedBy: resolvedBy || 'system',
      resolvedAt: new Date(),
      resolution
    });

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({
      success: true,
      alert,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// Get alert rules
router.get('/api/alerts/rules', async (req, res) => {
  try {
    const rules = await alertManager.getAlertRules();
    
    res.json({
      rules,
      total: rules.length,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve alert rules' });
  }
});

// Create alert rule
router.post('/api/alerts/rules', async (req, res) => {
  try {
    const rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'> = req.body;
    
    // Validate rule
    if (!rule.name || !rule.condition || !rule.severity) {
      return res.status(400).json({ error: 'Invalid alert rule' });
    }

    const createdRule = await alertManager.createAlertRule(rule);

    res.status(201).json({
      success: true,
      rule: createdRule,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
});

// Update alert rule
router.put('/api/alerts/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    const updates = req.body;

    const updatedRule = await alertManager.updateAlertRule(ruleId, updates);

    if (!updatedRule) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    res.json({
      success: true,
      rule: updatedRule,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
});

// Delete alert rule
router.delete('/api/alerts/rules/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    
    const deleted = await alertManager.deleteAlertRule(ruleId);

    if (!deleted) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    res.json({
      success: true,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
});

// Test alert rule
router.post('/api/alerts/rules/:ruleId/test', async (req, res) => {
  try {
    const { ruleId } = req.params;
    
    const testResult = await alertManager.testAlertRule(ruleId);

    res.json({
      success: true,
      result: testResult,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to test alert rule' });
  }
});

// Get alert statistics
router.get('/api/alerts/stats', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    const stats = await alertManager.getAlertStatistics(period as string);

    res.json({
      period,
      statistics: stats,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve alert statistics' });
  }
});

export default router;