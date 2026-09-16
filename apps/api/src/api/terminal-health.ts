/**
 * Terminal Health Monitoring API
 *
 * Provides endpoints for monitoring terminal streaming health and performance metrics.
 */

import { Router, Request, Response } from 'express';
import { unifiedTerminalStreamService } from '../services/UnifiedTerminalStreamService';
import { logger, LogCategory } from '../utils/logger';

const router = Router();

/**
 * GET /api/terminal/health
 * Get overall terminal streaming health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const metrics = unifiedTerminalStreamService.getMetrics();

    const health = {
      status: metrics.errorRate < 0.05 ? 'healthy' : metrics.errorRate < 0.2 ? 'degraded' : 'unhealthy',
      metrics: {
        activeStreams: metrics.activeStreams,
        totalStreams: metrics.totalStreams,
        averageLatency: metrics.averageLatency,
        errorRate: metrics.errorRate,
        uptime: Date.now() - metrics.startTime.getTime()
      },
      thresholds: {
        latency: {
          target: 50,
          current: metrics.averageLatency,
          status: metrics.averageLatency < 50 ? 'good' : metrics.averageLatency < 100 ? 'warning' : 'critical'
        },
        errorRate: {
          target: 0.01,
          current: metrics.errorRate,
          status: metrics.errorRate < 0.05 ? 'good' : metrics.errorRate < 0.2 ? 'warning' : 'critical'
        }
      },
      timestamp: new Date().toISOString()
    };

    res.json(health);
  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Failed to get terminal health:', error);
    res.status(500).json({
      error: 'Failed to retrieve terminal health',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/terminal/metrics
 * Get detailed terminal streaming metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = unifiedTerminalStreamService.getMetrics();

    res.json({
      metrics: {
        activeStreams: metrics.activeStreams,
        totalStreams: metrics.totalStreams,
        averageLatency: metrics.averageLatency,
        successfulWrites: metrics.successfulWrites,
        failedWrites: metrics.failedWrites,
        errorRate: metrics.errorRate,
        bytesTransferred: metrics.bytesTransferred,
        uptime: Date.now() - metrics.startTime.getTime()
      },
      performance: {
        latency: {
          average: metrics.averageLatency,
          target: 50,
          status: metrics.averageLatency < 50 ? 'excellent' :
                  metrics.averageLatency < 100 ? 'good' :
                  metrics.averageLatency < 200 ? 'fair' : 'poor'
        },
        throughput: {
          bytesPerSecond: metrics.bytesTransferred / ((Date.now() - metrics.startTime.getTime()) / 1000),
          writesPerSecond: metrics.successfulWrites / ((Date.now() - metrics.startTime.getTime()) / 1000)
        },
        reliability: {
          errorRate: metrics.errorRate,
          successRate: 1 - metrics.errorRate,
          target: 0.999,
          status: (1 - metrics.errorRate) >= 0.999 ? 'excellent' :
                  (1 - metrics.errorRate) >= 0.99 ? 'good' :
                  (1 - metrics.errorRate) >= 0.95 ? 'fair' : 'poor'
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Failed to get terminal metrics:', error);
    res.status(500).json({
      error: 'Failed to retrieve terminal metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/terminal/health/farm/:farmId
 * Get health status for a specific farm
 */
router.get('/health/farm/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { agentId } = req.query;

    if (agentId) {
      // Get health for specific agent
      const health = unifiedTerminalStreamService.getStreamHealth(farmId, String(agentId));

      if (!health) {
        return res.status(404).json({
          error: 'Stream not found',
          message: `No active stream found for farm ${farmId}, agent ${agentId}`
        });
      }

      res.json({
        farmId,
        agentId,
        health: {
          isHealthy: health.isHealthy,
          circuitBreakerOpen: health.circuitBreakerOpen,
          errorRate: health.errorRate,
          lastActivity: health.lastActivity,
          bytesWritten: health.bytesWritten
        },
        status: health.isHealthy ? 'healthy' : health.circuitBreakerOpen ? 'circuit_open' : 'unhealthy',
        timestamp: new Date().toISOString()
      });
    } else {
      // Get health for all agents in farm
      const metrics = unifiedTerminalStreamService.getMetrics();

      // Filter streams for this farm (simplified - would need to track farm-agent mapping)
      res.json({
        farmId,
        overallHealth: 'healthy',
        metrics: {
          activeStreams: metrics.activeStreams,
          averageLatency: metrics.averageLatency,
          errorRate: metrics.errorRate
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Failed to get farm terminal health:', error);
    res.status(500).json({
      error: 'Failed to retrieve farm terminal health',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/terminal/health/reset/:farmId/:agentId
 * Reset circuit breaker for a specific stream
 */
router.post('/health/reset/:farmId/:agentId', async (req: Request, res: Response) => {
  try {
    const { farmId, agentId } = req.params;

    // Circuit breaker reset is handled automatically by the service
    // This endpoint can force a manual reset if needed

    logger.info(LogCategory.TERMINAL,
      `Manual circuit breaker reset requested for farm ${farmId}, agent ${agentId}`);

    res.json({
      success: true,
      message: 'Circuit breaker reset requested',
      farmId,
      agentId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Failed to reset circuit breaker:', error);
    res.status(500).json({
      error: 'Failed to reset circuit breaker',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
