/**
 * Performance Metrics API
 *
 * Exposes production monitoring endpoints for:
 * - Event outbox delivery stats
 * - OpenTelemetry traces and spans
 * - Performance metrics (p50/p95/p99)
 * - Multi-agent terminal coordination stats
 * - System health and resource usage
 */

import { Router, Request, Response } from 'express';
import { eventOutboxService } from '../services/EventOutboxService';
import { openTelemetryTracing } from '../services/OpenTelemetryTracing';
import { multiAgentTerminalCoordinator } from '../services/MultiAgentTerminalCoordinator';
import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { verifyToken, requirePermission, Permission } from '../middleware/enhancedRBAC';

const router = Router();

/**
 * GET /api/metrics/delivery
 * Get event outbox delivery statistics
 */
router.get('/delivery', verifyToken, requirePermission(Permission.SYSTEM_MONITOR), async (req: Request, res: Response) => {
  try {
    const stats = eventOutboxService.getStats();
    const dlqEntries = await eventOutboxService.getDLQEntries(20);

    // Get backlog by priority
    const backlogResult = await db.query(`
      SELECT priority, COUNT(*) as count
      FROM event_outbox
      WHERE status = 'pending'
      GROUP BY priority
      ORDER BY priority
    `);

    // Get delivery rate (last hour)
    const rateResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE delivered) as delivered,
        COUNT(*) FILTER (WHERE NOT delivered) as failed,
        AVG(latency_ms) as avg_latency
      FROM event_delivery_log
      WHERE sent_at > NOW() - INTERVAL '1 hour'
    `);

    res.json({
      stats,
      backlogByPriority: backlogResult.rows,
      hourlyRate: rateResult.rows[0],
      deadLetterQueue: {
        count: dlqEntries.length,
        recent: dlqEntries.slice(0, 10)
      }
    });
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to get delivery metrics:', error);
    res.status(500).json({ error: 'Failed to fetch delivery metrics' });
  }
});

/**
 * GET /api/metrics/performance
 * Get performance metrics with percentiles
 */
router.get('/performance', verifyToken, requirePermission(Permission.SYSTEM_MONITOR), async (req: Request, res: Response) => {
  try {
    const { metric, window = '1h' } = req.query;

    if (!metric) {
      res.status(400).json({ error: 'Metric name required' });
      return;
    }

    const stats = await openTelemetryTracing.getPerformanceStats(
      metric as string,
      window as '1h' | '6h' | '24h'
    );

    // Get recent samples
    const samplesResult = await db.query(`
      SELECT value, timestamp, tags
      FROM performance_metrics
      WHERE metric_name = $1
        AND timestamp > NOW() - INTERVAL '${window === '1h' ? '1 hour' : window === '6h' ? '6 hours' : '24 hours'}'
      ORDER BY timestamp DESC
      LIMIT 100
    `, [metric]);

    res.json({
      metric: metric as string,
      window,
      stats,
      recentSamples: samplesResult.rows
    });
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to get performance metrics:', error);
    res.status(500).json({ error: 'Failed to fetch performance metrics' });
  }
});

/**
 * GET /api/metrics/traces/:traceId
 * Get a complete trace with all spans
 */
router.get('/traces/:traceId', verifyToken, requirePermission(Permission.SYSTEM_MONITOR), async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;
    const spans = await openTelemetryTracing.getTrace(traceId);

    if (spans.length === 0) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    // Build trace tree
    const rootSpans = spans.filter(s => !s.parent_span_id);
    const spanMap = new Map(spans.map(s => [s.span_id, s]));

    const buildTree = (span: any): any => {
      const children = spans.filter(s => s.parent_span_id === span.span_id);
      return {
        ...span,
        children: children.map(buildTree)
      };
    };

    const trace = {
      traceId,
      rootSpans: rootSpans.map(buildTree),
      totalSpans: spans.length,
      totalDuration: Math.max(...spans.map(s => s.duration_ms || 0)),
      errorCount: spans.filter(s => s.status_code === 'error').length
    };

    res.json(trace);
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to get trace:', error);
    res.status(500).json({ error: 'Failed to fetch trace' });
  }
});

/**
 * GET /api/metrics/errors
 * Get recent error spans
 */
router.get('/errors', verifyToken, requirePermission(Permission.SYSTEM_MONITOR), async (req: Request, res: Response) => {
  try {
    const { limit = 50, since } = req.query;

    const errors = await openTelemetryTracing.getErrorSpans(parseInt(limit as string));

    // Group by error type
    const errorsByType = errors.reduce((acc: any, error: any) => {
      const errorType = error.attributes?.['exception.type'] || 'Unknown';
      if (!acc[errorType]) {
        acc[errorType] = { count: 0, errors: [] };
      }
      acc[errorType].count++;
      acc[errorType].errors.push(error);
      return acc;
    }, {});

    res.json({
      total: errors.length,
      byType: errorsByType,
      recent: errors.slice(0, 10)
    });
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to get error spans:', error);
    res.status(500).json({ error: 'Failed to fetch error spans' });
  }
});

/**
 * GET /api/metrics/terminals
 * Get multi-agent terminal coordination stats
 */
router.get('/terminals', verifyToken, requirePermission(Permission.SYSTEM_MONITOR), async (req: Request, res: Response) => {
  try {
    const stats = multiAgentTerminalCoordinator.getStats();

    // Get per-farm breakdown
    const farmsResult = await db.query(`
      SELECT f.id, f.name, COUNT(a.id) as agent_count
      FROM farms f
      LEFT JOIN agents a ON f.id = a.farm_id
      WHERE f.status IN ('active', 'running', 'launching')
      GROUP BY f.id, f.name
    `);

    const farmStats = [];
    for (const farm of farmsResult.rows) {
      const agentStates = multiAgentTerminalCoordinator.getFarmAgentStates(farm.id);
      farmStats.push({
        farmId: farm.id,
        farmName: farm.name,
        agentCount: farm.agent_count,
        activeStreams: agentStates.filter(a => a.isStreaming).length,
        failedStreams: agentStates.filter(a => a.errorCount > 0).length,
        agents: agentStates
      });
    }

    res.json({
      overall: stats,
      farms: farmStats
    });
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to get terminal stats:', error);
    res.status(500).json({ error: 'Failed to fetch terminal stats' });
  }
});

/**
 * GET /api/metrics/terminals/:farmId
 * Get terminal stats for a specific farm
 */
router.get('/terminals/:farmId', verifyToken, async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const agentStates = multiAgentTerminalCoordinator.getFarmAgentStates(farmId);

    if (agentStates.length === 0) {
      res.status(404).json({ error: 'Farm not found or no agents' });
      return;
    }

    res.json({
      farmId,
      agentCount: agentStates.length,
      activeStreams: agentStates.filter(a => a.isStreaming).length,
      inactiveStreams: agentStates.filter(a => !a.isStreaming).length,
      failedStreams: agentStates.filter(a => a.errorCount > 0).length,
      agents: agentStates
    });
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to get farm terminal stats:', error);
    res.status(500).json({ error: 'Failed to fetch farm terminal stats' });
  }
});

/**
 * GET /api/metrics/system
 * Get system health and resource usage
 */
router.get('/system', verifyToken, requirePermission(Permission.SYSTEM_MONITOR), async (req: Request, res: Response) => {
  try {
    // Memory usage
    const memoryUsage = process.memoryUsage();

    // Active connections
    const connectionsResult = await db.query('SELECT COUNT(*) as count FROM pg_stat_activity');

    // Database size
    const dbSizeResult = await db.query(`
      SELECT pg_database_size(current_database()) as size
    `);

    // Active farms and agents
    const farmsResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_farms,
        COUNT(*) FILTER (WHERE status = 'launching') as launching_farms,
        COUNT(*) as total_farms
      FROM farms
      WHERE status IN ('active', 'launching', 'running')
    `);

    const agentsResult = await db.query(`
      SELECT COUNT(*) as count FROM agents WHERE status = 'active'
    `);

    // Uptime
    const uptime = process.uptime();

    res.json({
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
      },
      database: {
        connections: connectionsResult.rows[0].count,
        size: Math.round(dbSizeResult.rows[0].size / 1024 / 1024) // MB
      },
      farms: farmsResult.rows[0],
      agents: {
        active: agentsResult.rows[0].count
      },
      uptime: {
        seconds: Math.floor(uptime),
        formatted: formatUptime(uptime)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to get system metrics:', error);
    res.status(500).json({ error: 'Failed to fetch system metrics' });
  }
});

/**
 * GET /api/metrics/dashboard
 * Get comprehensive dashboard data
 */
router.get('/dashboard', verifyToken, requirePermission(Permission.SYSTEM_MONITOR), async (req: Request, res: Response) => {
  try {
    // Parallel fetch all metrics
    const [
      deliveryStats,
      terminalStats,
      systemStats,
      recentErrors
    ] = await Promise.all([
      (async () => {
        const stats = eventOutboxService.getStats();
        const dlqCount = (await eventOutboxService.getDLQEntries(1)).length;
        return { ...stats, dlqCount };
      })(),
      multiAgentTerminalCoordinator.getStats(),
      (async () => {
        const memoryUsage = process.memoryUsage();
        return {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        };
      })(),
      openTelemetryTracing.getErrorSpans(10)
    ]);

    res.json({
      delivery: deliveryStats,
      terminals: terminalStats,
      system: systemStats,
      errors: {
        count: recentErrors.length,
        recent: recentErrors
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to get dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

/**
 * POST /api/metrics/outbox/retry/:dlqId
 * Retry a failed event from dead letter queue
 */
router.post('/outbox/retry/:dlqId', verifyToken, requirePermission(Permission.SYSTEM_ADMIN), async (req: Request, res: Response) => {
  try {
    const { dlqId } = req.params;
    const outboxId = await eventOutboxService.retryFromDLQ(dlqId);

    res.json({
      success: true,
      dlqId,
      outboxId,
      message: 'Event moved back to outbox for retry'
    });
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to retry DLQ event:', error);
    res.status(500).json({ error: 'Failed to retry event' });
  }
});

/**
 * POST /api/metrics/cleanup
 * Cleanup old telemetry data
 */
router.post('/cleanup', verifyToken, requirePermission(Permission.SYSTEM_ADMIN), async (req: Request, res: Response) => {
  try {
    const { retentionDays = 7 } = req.body;

    const [eventsDeleted, telemetryDeleted] = await Promise.all([
      eventOutboxService.cleanupOldEvents(retentionDays),
      openTelemetryTracing.cleanup(retentionDays)
    ]);

    res.json({
      success: true,
      eventsDeleted,
      telemetryDeleted: {
        spans: telemetryDeleted.spans,
        metrics: telemetryDeleted.metrics
      },
      retentionDays
    });
  } catch (error) {
    logger.error(LogCategory.MONITORING, 'Failed to cleanup telemetry:', error);
    res.status(500).json({ error: 'Failed to cleanup telemetry data' });
  }
});

/**
 * Helper: Format uptime
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

export default router;
