/**
 * Monitoring API endpoints
 * Provides access to system metrics, health status, and performance data
 */

import { Router } from 'express';
import { ApiResponse } from '../types/api';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { standardRateLimit } from '../middleware/rateLimiter';
import { monitoringDashboard } from '../services/monitoringDashboard';
import { ResourceManager } from '../utils/ResourceManager';
import { apiCircuitBreaker } from '../middleware/rateLimiter';
import { logger, LogCategory } from '../utils/logger';
import { db, redis } from '../database/connection';

const router = Router();

// Apply authentication to all monitoring routes
router.use(authenticateToken);

/**
 * GET /api/monitor/dashboard
 * Get complete dashboard metrics
 */
router.get('/dashboard',
  requirePermission(['system:monitor']),
  standardRateLimit.middleware(),
  async (req, res) => {
    try {
      const metrics = await (monitoringDashboard as any).collectMetrics();
      const health = await (monitoringDashboard as any).getHealthStatus();

      const response: ApiResponse = {
        success: true,
        data: {
          metrics,
          health,
          timestamp: new Date()
        }
      };

      res.json(response);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get dashboard metrics', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'MONITORING_ERROR',
          message: 'Failed to retrieve dashboard metrics'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/monitor/metrics
 * Get system and application metrics
 */
router.get('/metrics',
  requirePermission(['system:monitor']),
  standardRateLimit.middleware(),
  async (req, res) => {
    try {
      const { type = 'all' } = req.query;

      let metrics: any = {};

      if (type === 'all' || type === 'system') {
        metrics.system = (monitoringDashboard as any).getSystemMetrics();
      }

      if (type === 'all' || type === 'application') {
        metrics.application = await (monitoringDashboard as any).getApplicationMetrics();
      }

      if (type === 'all' || type === 'resources') {
        metrics.resources = ResourceManager.getInstance().getStatistics();
      }

      const response: ApiResponse = {
        success: true,
        data: metrics
      };

      res.json(response);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get metrics', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'METRICS_ERROR',
          message: 'Failed to retrieve metrics'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/monitor/health
 * Get health status of all services
 */
router.get('/health',
  standardRateLimit.middleware(),
  async (req, res) => {
    try {
      const health = await (monitoringDashboard as any).performHealthChecks();

      const response: ApiResponse = {
        success: true,
        data: health
      };

      const statusCode = health.status === 'healthy' ? 200 :
                        health.status === 'degraded' ? 206 : 503;

      res.status(statusCode).json(response);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to perform health check', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Failed to perform health check'
        }
      };
      res.status(503).json(response);
    }
  }
);

/**
 * GET /api/monitor/alerts
 * Get active alerts
 */
router.get('/alerts',
  requirePermission(['system:monitor']),
  standardRateLimit.middleware(),
  async (req, res) => {
    try {
      const { acknowledged = 'false' } = req.query;
      const includeAcknowledged = acknowledged === 'true';

      const alerts = (monitoringDashboard as any).alerts.filter(
        (alert: any) => includeAcknowledged || !alert.acknowledged
      );

      const response: ApiResponse = {
        success: true,
        data: alerts
      };

      res.json(response);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get alerts', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'ALERTS_ERROR',
          message: 'Failed to retrieve alerts'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * POST /api/monitor/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:id/acknowledge',
  requirePermission(['system:monitor']),
  standardRateLimit.middleware(),
  async (req, res) => {
    try {
      const { id } = req.params;
      monitoringDashboard.acknowledgeAlert(id);

      const response: ApiResponse = {
        success: true,
        data: { acknowledged: true }
      };

      res.json(response);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to acknowledge alert', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'ALERT_ACK_ERROR',
          message: 'Failed to acknowledge alert'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/monitor/circuit-breakers
 * Get circuit breaker status
 */
router.get('/circuit-breakers',
  requirePermission(['system:monitor']),
  standardRateLimit.middleware(),
  async (req, res) => {
    try {
      const services = ['openai', 'anthropic', 'ollama', 'llama'];
      const status: Record<string, any> = {};

      for (const service of services) {
        status[service] = {
          state: apiCircuitBreaker.getState(service),
          failures: (apiCircuitBreaker as any).failures.get(service) || 0,
          lastFailTime: (apiCircuitBreaker as any).lastFailTime.get(service)
        };
      }

      const response: ApiResponse = {
        success: true,
        data: status
      };

      res.json(response);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get circuit breaker status', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'CIRCUIT_BREAKER_ERROR',
          message: 'Failed to retrieve circuit breaker status'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * POST /api/monitor/circuit-breakers/:service/reset
 * Reset a circuit breaker
 */
router.post('/circuit-breakers/:service/reset',
  requirePermission(['system:admin']),
  standardRateLimit.middleware(),
  async (req, res) => {
    try {
      const { service } = req.params;
      apiCircuitBreaker.reset(service);

      const response: ApiResponse = {
        success: true,
        data: { reset: true }
      };

      res.json(response);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to reset circuit breaker', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'CIRCUIT_BREAKER_RESET_ERROR',
          message: 'Failed to reset circuit breaker'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/monitor/database-pool
 * Get database connection pool statistics
 */
router.get('/database-pool',
  requirePermission(['system:monitor']),
  standardRateLimit.middleware(),
  async (req, res) => {
    try {
      const poolStats = db.getPoolStats();
      const slowQueries = db.getSlowQueries(1000); // Queries over 1 second

      const response: ApiResponse = {
        success: true,
        data: {
          pool: poolStats,
          slowQueries
        }
      };

      res.json(response);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get pool statistics', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'POOL_STATS_ERROR',
          message: 'Failed to retrieve pool statistics'
        }
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/monitor/rate-limits
 * Get rate limit status
 */
router.get('/rate-limits',
  requirePermission(['system:monitor']),
  standardRateLimit.middleware(),
  async (req, res) => {
    try {
      const rateLimitKeys = await redis.keys('ratelimit:*');
      const limits: Record<string, any> = {};

      for (const key of rateLimitKeys) {
        const data = await redis.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          const identifier = key.replace('ratelimit:', '');
          limits[identifier] = {
            tokens: parsed.tokens,
            lastRefill: new Date(parsed.lastRefill),
            burstCapacity: parsed.burstCapacity,
            remaining: parsed.burstCapacity - parsed.tokens
          };
        }
      }

      const response: ApiResponse = {
        success: true,
        data: limits
      };

      res.json(response);
    } catch (error) {
      logger.error(LogCategory.API, 'Failed to get rate limit status', error);
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'RATE_LIMIT_ERROR',
          message: 'Failed to retrieve rate limit status'
        }
      };
      res.status(500).json(response);
    }
  }
);

export default router;