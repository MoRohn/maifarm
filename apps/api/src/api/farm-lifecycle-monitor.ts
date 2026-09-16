/**
 * Farm Lifecycle Monitoring API
 *
 * Provides real-time monitoring of farm lifecycle transitions, alerts for stuck farms,
 * and historical transition analysis for production observability.
 */

import { Router, Request, Response } from 'express';
import { farmLifecycleStateMachine } from '../services/FarmLifecycleStateMachine';
import { automatedFarmRecovery } from '../services/AutomatedFarmRecovery';
import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { FarmStatus } from '../types/farm';

const router = Router();

/**
 * GET /api/farm-lifecycle/stats
 * Returns overall farm lifecycle statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = farmLifecycleStateMachine.getStatistics();

    // Enrich with database stats
    const dbStatsResult = await db.query(`
      SELECT
        status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))) as avg_duration_seconds
      FROM farms
      GROUP BY status
    `);

    const dbStats = dbStatsResult.rows.reduce((acc, row) => {
      acc[row.status] = {
        count: parseInt(row.count),
        avgDuration: parseFloat(row.avg_duration_seconds) || 0
      };
      return acc;
    }, {} as Record<string, { count: number; avgDuration: number }>);

    res.json({
      stateMachine: stats,
      database: dbStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to get lifecycle stats:', error);
    res.status(500).json({ error: 'Failed to get lifecycle statistics' });
  }
});

/**
 * GET /api/farm-lifecycle/stuck
 * Returns farms stuck in non-terminal states beyond expected duration
 */
router.get('/stuck', async (req: Request, res: Response) => {
  try {
    const thresholdMinutes = parseInt(req.query.threshold as string) || 30;

    const result = await db.query(`
      SELECT
        id,
        name,
        status,
        created_at,
        updated_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as age_minutes,
        EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as idle_minutes
      FROM farms
      WHERE status IN ('launching', 'active', 'running', 'completing')
        AND EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 > $1
      ORDER BY updated_at ASC
    `, [thresholdMinutes]);

    const stuckFarms = result.rows.map(row => ({
      farmId: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      lastUpdated: row.updated_at,
      ageMinutes: parseFloat(row.age_minutes),
      idleMinutes: parseFloat(row.idle_minutes),
      // Get state machine transition history
      transitions: farmLifecycleStateMachine.getTransitionHistory(row.id)
    }));

    res.json({
      threshold: thresholdMinutes,
      count: stuckFarms.length,
      farms: stuckFarms,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to get stuck farms:', error);
    res.status(500).json({ error: 'Failed to get stuck farms' });
  }
});

/**
 * GET /api/farm-lifecycle/transitions/:farmId
 * Returns complete transition history for a specific farm
 */
router.get('/transitions/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    // Get state machine history
    const transitions = farmLifecycleStateMachine.getTransitionHistory(farmId);
    const currentState = farmLifecycleStateMachine.getCurrentState(farmId);
    const lastTransition = farmLifecycleStateMachine.getLastTransition(farmId);
    const validNextStates = farmLifecycleStateMachine.getValidNextStates(farmId);

    // Get farm metadata from database
    const farmResult = await db.query(
      'SELECT id, name, status, created_at, updated_at, completed_at FROM farms WHERE id = $1',
      [farmId]
    );

    if (farmResult.rows.length === 0) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    const farm = farmResult.rows[0];

    res.json({
      farmId,
      name: farm.name,
      currentState,
      dbStatus: farm.status,
      validNextStates,
      lastTransition,
      transitionHistory: transitions,
      metadata: {
        createdAt: farm.created_at,
        updatedAt: farm.updated_at,
        completedAt: farm.completed_at
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to get transition history:', error);
    res.status(500).json({ error: 'Failed to get transition history' });
  }
});

/**
 * GET /api/farm-lifecycle/health
 * Returns overall health metrics for farm lifecycle management
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const stats = farmLifecycleStateMachine.getStatistics();

    // Calculate health metrics
    const totalFarms = stats.totalFarms;
    const activeFarms = stats.byState[FarmStatus.ACTIVE] +
                        stats.byState[FarmStatus.RUNNING] +
                        stats.byState[FarmStatus.LAUNCHING];
    const completedFarms = stats.byState[FarmStatus.COMPLETED];
    const failedFarms = stats.byState[FarmStatus.FAILED];
    const orphanedFarms = stats.byState[FarmStatus.ORPHANED];

    // Query for farms stuck beyond threshold
    const stuckThreshold = 30; // minutes
    const stuckResult = await db.query(`
      SELECT COUNT(*) as stuck_count
      FROM farms
      WHERE status IN ('launching', 'active', 'running', 'completing')
        AND EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 > $1
    `, [stuckThreshold]);

    const stuckCount = parseInt(stuckResult.rows[0]?.stuck_count || '0');

    // Calculate completion rate (last 24 hours)
    const completionRateResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM farms
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    const rateData = completionRateResult.rows[0];
    const completionRate = rateData.total > 0
      ? (parseInt(rateData.completed) / parseInt(rateData.total)) * 100
      : 0;

    // Determine overall health status
    let healthStatus: 'healthy' | 'degraded' | 'critical';
    if (completionRate >= 90 && stuckCount === 0 && orphanedFarms === 0) {
      healthStatus = 'healthy';
    } else if (completionRate >= 70 && stuckCount < 5) {
      healthStatus = 'degraded';
    } else {
      healthStatus = 'critical';
    }

    res.json({
      status: healthStatus,
      metrics: {
        totalFarms,
        activeFarms,
        completedFarms,
        failedFarms,
        orphanedFarms,
        stuckFarms: stuckCount,
        completionRate: parseFloat(completionRate.toFixed(2))
      },
      byState: stats.byState,
      totalTransitions: stats.totalTransitions,
      recommendations: generateRecommendations(healthStatus, stuckCount, orphanedFarms, completionRate),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to get health metrics:', error);
    res.status(500).json({ error: 'Failed to get health metrics' });
  }
});

/**
 * GET /api/farm-lifecycle/alerts
 * Returns active alerts for farm lifecycle issues
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const alerts = [];

    // Alert 1: Farms stuck in launching for >10 minutes
    const launchingResult = await db.query(`
      SELECT id, name, created_at
      FROM farms
      WHERE status = 'launching'
        AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 > 10
      ORDER BY created_at ASC
    `);

    for (const row of launchingResult.rows) {
      alerts.push({
        severity: 'warning',
        type: 'stuck_launching',
        farmId: row.id,
        farmName: row.name,
        message: `Farm stuck in LAUNCHING state for ${Math.floor((Date.now() - new Date(row.created_at).getTime()) / 60000)} minutes`,
        createdAt: row.created_at,
        action: 'Check orchestrator logs and tmux session health'
      });
    }

    // Alert 2: Farms running for >2 hours
    const longRunningResult = await db.query(`
      SELECT id, name, created_at
      FROM farms
      WHERE status = 'running'
        AND EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 > 120
      ORDER BY created_at ASC
    `);

    for (const row of longRunningResult.rows) {
      alerts.push({
        severity: 'info',
        type: 'long_running',
        farmId: row.id,
        farmName: row.name,
        message: `Farm has been running for ${Math.floor((Date.now() - new Date(row.created_at).getTime()) / 60000)} minutes`,
        createdAt: row.created_at,
        action: 'Verify farm timeout is configured correctly'
      });
    }

    // Alert 3: Orphaned farms
    const orphanedResult = await db.query(`
      SELECT id, name, created_at
      FROM farms
      WHERE status = 'orphaned'
      ORDER BY created_at ASC
    `);

    for (const row of orphanedResult.rows) {
      alerts.push({
        severity: 'critical',
        type: 'orphaned',
        farmId: row.id,
        farmName: row.name,
        message: 'Farm is orphaned (tmux session lost)',
        createdAt: row.created_at,
        action: 'Manually terminate or force-complete the farm'
      });
    }

    // Alert 4: High failure rate (last hour)
    const failureRateResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM farms
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);

    const failureData = failureRateResult.rows[0];
    const failureRate = failureData.total > 0
      ? (parseInt(failureData.failed) / parseInt(failureData.total)) * 100
      : 0;

    if (failureRate > 30 && parseInt(failureData.total) > 5) {
      alerts.push({
        severity: 'critical',
        type: 'high_failure_rate',
        message: `High failure rate: ${failureRate.toFixed(1)}% of farms failed in the last hour`,
        action: 'Check system resources, API keys, and orchestrator health',
        metadata: {
          failedCount: parseInt(failureData.failed),
          totalCount: parseInt(failureData.total),
          failureRate: parseFloat(failureRate.toFixed(2))
        }
      });
    }

    res.json({
      count: alerts.length,
      alerts: alerts.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to get alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

/**
 * POST /api/farm-lifecycle/force-transition/:farmId
 * Force a state transition (admin only, use with caution)
 */
router.post('/force-transition/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { targetState, reason } = req.body;

    if (!targetState) {
      return res.status(400).json({ error: 'targetState is required' });
    }

    // Validate target state
    const validStates = Object.values(FarmStatus);
    if (!validStates.includes(targetState)) {
      return res.status(400).json({ error: 'Invalid target state' });
    }

    const currentState = farmLifecycleStateMachine.getCurrentState(farmId);

    logger.warn(LogCategory.FARM,
      `Force transition requested for farm ${farmId}: ${currentState} → ${targetState} (reason: ${reason || 'manual'})`);

    // Attempt transition
    const success = await farmLifecycleStateMachine.transition({
      farmId,
      currentState: currentState || FarmStatus.IDLE,
      targetState,
      reason: reason || 'force_transition',
      triggeredBy: 'admin_api',
      metadata: {
        forced: true,
        timestamp: new Date().toISOString()
      }
    });

    if (success) {
      // Update database
      await db.query(
        'UPDATE farms SET status = $1, updated_at = NOW() WHERE id = $2',
        [targetState, farmId]
      );

      res.json({
        success: true,
        farmId,
        previousState: currentState,
        newState: targetState,
        message: 'Transition forced successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Transition rejected by state machine',
        currentState,
        targetState,
        validNextStates: farmLifecycleStateMachine.getValidNextStates(farmId)
      });
    }
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to force transition:', error);
    res.status(500).json({ error: 'Failed to force transition' });
  }
});

/**
 * Generate health recommendations based on metrics
 */
function generateRecommendations(
  healthStatus: string,
  stuckCount: number,
  orphanedCount: number,
  completionRate: number
): string[] {
  const recommendations: string[] = [];

  if (healthStatus === 'critical') {
    recommendations.push('⚠️ System health is critical - immediate attention required');
  }

  if (completionRate < 70) {
    recommendations.push('📉 Low completion rate detected - review recent failures');
    recommendations.push('Check orchestrator logs for common error patterns');
  }

  if (stuckCount > 0) {
    recommendations.push(`🚨 ${stuckCount} farm(s) stuck - investigate via /api/farm-lifecycle/stuck`);
    recommendations.push('Consider implementing automatic timeout cleanup');
  }

  if (orphanedCount > 0) {
    recommendations.push(`🔴 ${orphanedCount} orphaned farm(s) - manual cleanup required`);
    recommendations.push('Run farm recovery service to handle orphaned sessions');
  }

  if (healthStatus === 'healthy') {
    recommendations.push('✅ System operating normally');
    recommendations.push('Monitor completion rate trends for early issue detection');
  }

  if (healthStatus === 'degraded') {
    recommendations.push('⚠️ System performance degraded - proactive monitoring recommended');
  }

  return recommendations;
}

/**
 * GET /api/farm-lifecycle/recovery/stats
 * Returns automated recovery statistics
 */
router.get('/recovery/stats', async (req: Request, res: Response) => {
  try {
    const stats = automatedFarmRecovery.getStats();

    res.json({
      ...stats,
      isMonitoring: (automatedFarmRecovery as any).isMonitoring,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to get recovery stats:', error);
    res.status(500).json({ error: 'Failed to get recovery statistics' });
  }
});

/**
 * GET /api/farm-lifecycle/recovery/actions
 * Returns recent recovery actions
 */
router.get('/recovery/actions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const actions = automatedFarmRecovery.getRecentActions(limit);

    res.json({
      count: actions.length,
      actions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to get recovery actions:', error);
    res.status(500).json({ error: 'Failed to get recovery actions' });
  }
});

/**
 * POST /api/farm-lifecycle/recovery/trigger/:farmId
 * Manually trigger recovery for a specific farm
 */
router.post('/recovery/trigger/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { action } = req.body;

    if (!action || !['force-complete', 'force-fail', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be: force-complete, force-fail, or restart' });
    }

    logger.info(LogCategory.FARM, `Manual recovery triggered for farm ${farmId}: ${action}`);

    const success = await automatedFarmRecovery.triggerManualRecovery(farmId, action);

    res.json({
      success,
      farmId,
      action,
      message: success ? 'Recovery triggered successfully' : 'Recovery failed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to trigger recovery:', error);
    res.status(500).json({ error: 'Failed to trigger recovery' });
  }
});

/**
 * POST /api/farm-lifecycle/recovery/start
 * Start automated recovery monitoring
 */
router.post('/recovery/start', async (req: Request, res: Response) => {
  try {
    automatedFarmRecovery.startMonitoring();

    res.json({
      success: true,
      message: 'Automated recovery monitoring started',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to start recovery monitoring:', error);
    res.status(500).json({ error: 'Failed to start recovery monitoring' });
  }
});

/**
 * POST /api/farm-lifecycle/recovery/stop
 * Stop automated recovery monitoring
 */
router.post('/recovery/stop', async (req: Request, res: Response) => {
  try {
    automatedFarmRecovery.stopMonitoring();

    res.json({
      success: true,
      message: 'Automated recovery monitoring stopped',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Failed to stop recovery monitoring:', error);
    res.status(500).json({ error: 'Failed to stop recovery monitoring' });
  }
});

export default router;
