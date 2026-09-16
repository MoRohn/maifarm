/**
 * Thermal Monitoring API Endpoints
 *
 * Provides REST API for thermal monitoring, alerts, and configuration.
 * Enables the dashboard to display thermal metrics, receive alerts,
 * and configure auto-adjustment thresholds.
 */

import { Router, Request, Response } from 'express';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import {
  thermalMonitoringService,
  ThermalPressureLevel,
  THERMAL_PRESSURE_LABELS,
  ThermalThresholds,
  ThermalAction
} from '../services/ThermalMonitoringService';

const router = Router();

/**
 * GET /api/thermal/metrics
 * Get current thermal metrics
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const currentMetrics = thermalMonitoringService.getCurrentMetrics();

    if (!currentMetrics) {
      return res.json({
        success: true,
        data: null,
        message: 'Thermal monitoring initializing...'
      });
    }

    res.json({
      success: true,
      data: {
        current: currentMetrics,
        canLaunchFarm: thermalMonitoringService.canLaunchFarm(),
        thresholds: thermalMonitoringService.getThresholds()
      }
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to get thermal metrics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve thermal metrics'
    });
  }
});

/**
 * GET /api/thermal/history
 * Get thermal metrics history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const history = thermalMonitoringService.getHistory(limit);

    res.json({
      success: true,
      data: history.map(entry => ({
        timestamp: entry.timestamp,
        ...entry.metrics
      })),
      count: history.length
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to get thermal history', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve thermal history'
    });
  }
});

/**
 * GET /api/thermal/alerts
 * Get active thermal alerts
 */
router.get('/alerts', async (_req: Request, res: Response) => {
  try {
    const activeAlerts = thermalMonitoringService.getActiveAlerts();

    res.json({
      success: true,
      data: activeAlerts
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to get thermal alerts', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve thermal alerts'
    });
  }
});

/**
 * POST /api/thermal/alerts/:alertId/acknowledge
 * Acknowledge a thermal alert
 */
router.post('/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const acknowledged = thermalMonitoringService.acknowledgeAlert(alertId);

    if (acknowledged) {
      // Update in database
      await db.query(`
        UPDATE thermal_alerts
        SET acknowledged = TRUE, acknowledged_at = NOW()
        WHERE id = $1
      `, [alertId]);

      logger.info(LogCategory.THERMAL, 'Alert acknowledged', { alertId });

      res.json({
        success: true,
        message: 'Alert acknowledged'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to acknowledge alert', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge alert'
    });
  }
});

/**
 * GET /api/thermal/thresholds
 * Get current thermal thresholds
 */
router.get('/thresholds', async (_req: Request, res: Response) => {
  try {
    const thresholds = thermalMonitoringService.getThresholds();

    res.json({
      success: true,
      data: thresholds,
      pressureLevels: THERMAL_PRESSURE_LABELS
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to get thresholds', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve thresholds'
    });
  }
});

/**
 * PUT /api/thermal/thresholds
 * Update thermal thresholds
 */
router.put('/thresholds', async (req: Request, res: Response) => {
  try {
    const newThresholds: Partial<ThermalThresholds> = req.body;

    // Validate thresholds
    if (newThresholds.cpuWarning !== undefined &&
        (newThresholds.cpuWarning < 40 || newThresholds.cpuWarning > 100)) {
      return res.status(400).json({
        success: false,
        error: 'CPU warning threshold must be between 40 and 100'
      });
    }

    if (newThresholds.cpuCritical !== undefined &&
        (newThresholds.cpuCritical < 50 || newThresholds.cpuCritical > 110)) {
      return res.status(400).json({
        success: false,
        error: 'CPU critical threshold must be between 50 and 110'
      });
    }

    await thermalMonitoringService.setThresholds(newThresholds);

    logger.info(LogCategory.THERMAL, 'Thresholds updated via API', {
      newThresholds
    });

    res.json({
      success: true,
      data: thermalMonitoringService.getThresholds(),
      message: 'Thresholds updated successfully'
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to update thresholds', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update thresholds'
    });
  }
});

/**
 * GET /api/thermal/stats
 * Get thermal statistics summary
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const timeWindow = req.query.window as string || '24h';

    let interval: string;
    switch (timeWindow) {
      case '1h':
        interval = '1 hour';
        break;
      case '6h':
        interval = '6 hours';
        break;
      case '7d':
        interval = '7 days';
        break;
      case '30d':
        interval = '30 days';
        break;
      default:
        interval = '24 hours';
    }

    // Get statistics from database
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total_samples,
        AVG(cpu_temperature) as avg_cpu_temp,
        MAX(cpu_temperature) as max_cpu_temp,
        MIN(cpu_temperature) as min_cpu_temp,
        AVG(gpu_temperature) as avg_gpu_temp,
        MAX(gpu_temperature) as max_gpu_temp,
        AVG(pressure_level) as avg_pressure,
        MAX(pressure_level) as max_pressure,
        COUNT(*) FILTER (WHERE is_throttling = TRUE) as throttle_events,
        COUNT(*) FILTER (WHERE alert_severity IS NOT NULL) as alert_count,
        COUNT(*) FILTER (WHERE alert_severity = 'critical') as critical_alerts,
        COUNT(*) FILTER (WHERE alert_severity = 'emergency') as emergency_alerts
      FROM thermal_metrics
      WHERE timestamp > NOW() - $1::interval
    `, [interval]);

    // Get throttle duration estimate
    const throttleDurationResult = await db.query(`
      SELECT
        SUM(CASE WHEN is_throttling THEN 5 ELSE 0 END) as throttle_seconds
      FROM thermal_metrics
      WHERE timestamp > NOW() - $1::interval
    `, [interval]);

    // Get farm actions
    const farmActionsResult = await db.query(`
      SELECT
        action_type,
        COUNT(*) as count
      FROM thermal_farm_actions
      WHERE timestamp > NOW() - $1::interval
      GROUP BY action_type
    `, [interval]);

    const stats = statsResult.rows[0] || {};
    const throttleSeconds = throttleDurationResult.rows[0]?.throttle_seconds || 0;

    res.json({
      success: true,
      data: {
        timeWindow,
        samples: parseInt(stats.total_samples) || 0,
        temperature: {
          cpu: {
            average: parseFloat(stats.avg_cpu_temp) || null,
            max: parseFloat(stats.max_cpu_temp) || null,
            min: parseFloat(stats.min_cpu_temp) || null
          },
          gpu: {
            average: parseFloat(stats.avg_gpu_temp) || null,
            max: parseFloat(stats.max_gpu_temp) || null
          }
        },
        pressure: {
          average: parseFloat(stats.avg_pressure) || 0,
          max: parseInt(stats.max_pressure) || 0,
          maxLabel: THERMAL_PRESSURE_LABELS[parseInt(stats.max_pressure) as ThermalPressureLevel] || 'nominal'
        },
        throttling: {
          events: parseInt(stats.throttle_events) || 0,
          estimatedDurationSeconds: throttleSeconds,
          estimatedDurationMinutes: Math.round(throttleSeconds / 60)
        },
        alerts: {
          total: parseInt(stats.alert_count) || 0,
          critical: parseInt(stats.critical_alerts) || 0,
          emergency: parseInt(stats.emergency_alerts) || 0
        },
        farmActions: farmActionsResult.rows.reduce((acc, row) => {
          acc[row.action_type] = parseInt(row.count);
          return acc;
        }, {} as Record<string, number>)
      }
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to get thermal stats', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve thermal statistics'
    });
  }
});

/**
 * GET /api/thermal/hourly
 * Get hourly aggregated thermal data for charts
 */
router.get('/hourly', async (req: Request, res: Response) => {
  try {
    const hours = Math.min(parseInt(req.query.hours as string) || 24, 168); // Max 7 days

    const result = await db.query(`
      SELECT
        date_trunc('hour', timestamp) as hour,
        AVG(cpu_temperature) as avg_cpu_temp,
        MAX(cpu_temperature) as max_cpu_temp,
        AVG(gpu_temperature) as avg_gpu_temp,
        AVG(pressure_level) as avg_pressure,
        MAX(pressure_level) as max_pressure,
        AVG(fan_speed_percent) as avg_fan_speed,
        COUNT(*) FILTER (WHERE is_throttling = TRUE) as throttle_count,
        COUNT(*) as sample_count
      FROM thermal_metrics
      WHERE timestamp > NOW() - ($1 || ' hours')::interval
      GROUP BY date_trunc('hour', timestamp)
      ORDER BY hour ASC
    `, [hours]);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        hour: row.hour,
        temperature: {
          cpuAvg: parseFloat(row.avg_cpu_temp) || null,
          cpuMax: parseFloat(row.max_cpu_temp) || null,
          gpuAvg: parseFloat(row.avg_gpu_temp) || null
        },
        pressure: {
          avg: parseFloat(row.avg_pressure) || 0,
          max: parseInt(row.max_pressure) || 0
        },
        fanSpeedAvg: parseFloat(row.avg_fan_speed) || null,
        throttleCount: parseInt(row.throttle_count) || 0,
        samples: parseInt(row.sample_count) || 0
      }))
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to get hourly thermal data', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve hourly thermal data'
    });
  }
});

/**
 * GET /api/thermal/farm-actions
 * Get thermal-related farm actions history
 */
router.get('/farm-actions', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const farmId = req.query.farmId as string;

    let query = `
      SELECT
        tfa.*,
        f.name as farm_name
      FROM thermal_farm_actions tfa
      LEFT JOIN farms f ON f.id = tfa.farm_id
    `;
    const params: any[] = [];

    if (farmId) {
      query += ' WHERE tfa.farm_id = $1';
      params.push(farmId);
    }

    query += ` ORDER BY tfa.timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to get farm actions', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve farm actions'
    });
  }
});

/**
 * GET /api/thermal/can-launch
 * Check if thermal conditions allow launching a new farm
 */
router.get('/can-launch', async (_req: Request, res: Response) => {
  try {
    const result = thermalMonitoringService.canLaunchFarm();
    const currentMetrics = thermalMonitoringService.getCurrentMetrics();

    res.json({
      success: true,
      data: {
        ...result,
        currentPressure: currentMetrics?.pressureLabel || 'unknown',
        cpuTemperature: currentMetrics?.cpuTemperature,
        isThrottling: currentMetrics?.isThrottling || false
      }
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to check launch conditions', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to check thermal conditions'
    });
  }
});

/**
 * GET /api/thermal/recommended-agents
 * Get recommended agent count based on thermal state
 */
router.get('/recommended-agents', async (req: Request, res: Response) => {
  try {
    const requestedCount = parseInt(req.query.count as string) || 3;
    const recommendedCount = thermalMonitoringService.getRecommendedAgentCount(requestedCount);
    const currentMetrics = thermalMonitoringService.getCurrentMetrics();

    res.json({
      success: true,
      data: {
        requestedCount,
        recommendedCount,
        reduction: requestedCount > recommendedCount,
        reason: requestedCount > recommendedCount
          ? `Reduced from ${requestedCount} to ${recommendedCount} due to ${currentMetrics?.pressureLabel || 'thermal'} pressure`
          : null,
        currentPressure: currentMetrics?.pressureLabel || 'nominal'
      }
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to get recommended agents', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to calculate recommended agent count'
    });
  }
});

/**
 * POST /api/thermal/test-alert
 * Test thermal alert system (development only)
 */
router.post('/test-alert', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test alerts not available in production'
    });
  }

  try {
    const { severity = 'warning', message = 'Test thermal alert' } = req.body;

    // Emit test alert
    thermalMonitoringService.emit('thermal:alert', {
      id: `test-${Date.now()}`,
      timestamp: new Date(),
      severity,
      pressureLevel: ThermalPressureLevel.MODERATE,
      message,
      action: null,
      acknowledged: false
    });

    logger.info(LogCategory.THERMAL, 'Test alert triggered', { severity, message });

    res.json({
      success: true,
      message: 'Test alert sent'
    });
  } catch (error) {
    logger.error(LogCategory.THERMAL, 'Failed to send test alert', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to send test alert'
    });
  }
});

export default router;
