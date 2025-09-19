/**
 * Health Check API Routes
 * Provides readiness, liveness, and detailed health endpoints
 */

import { Router, Request, Response } from 'express';
import { healthCheckService, HealthStatus } from '../services/healthCheckService';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/logger';

const router = Router();

/**
 * Liveness probe endpoint
 * Returns 200 if service is alive, 503 if not
 */
router.get('/live', async (req: Request, res: Response) => {
  try {
    const liveness = await healthCheckService.getLiveness();
    
    if (liveness.alive) {
      res.status(200).json(liveness);
    } else {
      res.status(503).json(liveness);
    }
  } catch (error) {
    logger.error(LogCategory.API, 'Liveness check failed:', error);
    res.status(503).json({
      alive: false,
      message: 'Liveness check failed'
    });
  }
});

/**
 * Readiness probe endpoint
 * Returns 200 if ready to accept requests, 503 if not
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const readiness = await healthCheckService.getReadiness();
    
    if (readiness.ready) {
      res.status(200).json(readiness);
    } else {
      res.status(503).json(readiness);
    }
  } catch (error) {
    logger.error(LogCategory.API, 'Readiness check failed:', error);
    res.status(503).json({
      ready: false,
      message: 'Readiness check failed',
      checks: []
    });
  }
});

/**
 * Comprehensive health check endpoint
 * Returns detailed health status of all components
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const health = await healthCheckService.getHealth();
    
    // Determine HTTP status based on health
    let httpStatus = 200;
    if (health.status === HealthStatus.UNHEALTHY) {
      httpStatus = 503;
    } else if (health.status === HealthStatus.DEGRADED) {
      httpStatus = 200; // Still return 200 for degraded to keep in rotation
    }
    
    res.status(httpStatus).json(health);
  } catch (error) {
    logger.error(LogCategory.API, 'Health check failed:', error);
    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      message: 'Health check failed',
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Startup diagnostics endpoint
 * Provides detailed diagnostics and recommendations
 */
router.get('/startup', async (req: Request, res: Response) => {
  try {
    const diagnostics = await healthCheckService.getStartupDiagnostics();
    res.json(diagnostics);
  } catch (error) {
    logger.error(LogCategory.API, 'Startup diagnostics failed:', error);
    res.status(500).json({
      error: 'Failed to get startup diagnostics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Simple ping endpoint for quick checks
 */
router.get('/ping', (req: Request, res: Response) => {
  res.json({
    pong: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * Metrics endpoint for Prometheus scraping
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const health = await healthCheckService.getHealth();
    
    // Format as Prometheus metrics
    const metrics: string[] = [
      '# HELP maifarm_up Whether the MaiFarm server is up (1 = up, 0 = down)',
      '# TYPE maifarm_up gauge',
      `maifarm_up ${health.status === HealthStatus.HEALTHY ? 1 : 0}`,
      '',
      '# HELP maifarm_uptime_seconds Server uptime in seconds',
      '# TYPE maifarm_uptime_seconds counter',
      `maifarm_uptime_seconds ${Math.floor(health.uptime / 1000)}`,
      '',
      '# HELP maifarm_memory_usage_bytes Memory usage in bytes',
      '# TYPE maifarm_memory_usage_bytes gauge',
      `maifarm_memory_usage_bytes ${health.metrics.memory.used}`,
      '',
      '# HELP maifarm_memory_percentage Memory usage percentage',
      '# TYPE maifarm_memory_percentage gauge',
      `maifarm_memory_percentage ${health.metrics.memory.percentage}`,
      '',
      '# HELP maifarm_websocket_connections Number of WebSocket connections',
      '# TYPE maifarm_websocket_connections gauge',
      `maifarm_websocket_connections ${health.metrics.connections.websocket}`,
      '',
      '# HELP maifarm_database_connections Number of database connections',
      '# TYPE maifarm_database_connections gauge',
      `maifarm_database_connections ${health.metrics.connections.database}`,
      '',
      '# HELP maifarm_cpu_load_average System load average',
      '# TYPE maifarm_cpu_load_average gauge',
      `maifarm_cpu_load_average{period="1m"} ${health.metrics.cpu.loadAverage[0]}`,
      `maifarm_cpu_load_average{period="5m"} ${health.metrics.cpu.loadAverage[1]}`,
      `maifarm_cpu_load_average{period="15m"} ${health.metrics.cpu.loadAverage[2]}`,
      ''
    ];
    
    // Add component health metrics
    for (const component of health.components) {
      const status = component.status === HealthStatus.HEALTHY ? 1 : 0;
      metrics.push(
        `# HELP maifarm_component_health Health status of ${component.name} (1 = healthy, 0 = unhealthy)`,
        `# TYPE maifarm_component_health gauge`,
        `maifarm_component_health{component="${component.name}"} ${status}`
      );
      
      if (component.latency !== undefined) {
        metrics.push(
          `# HELP maifarm_component_latency_ms Latency of ${component.name} in milliseconds`,
          `# TYPE maifarm_component_latency_ms gauge`,
          `maifarm_component_latency_ms{component="${component.name}"} ${component.latency}`
        );
      }
      metrics.push('');
    }
    
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics.join('\n'));
  } catch (error) {
    logger.error(LogCategory.API, 'Metrics generation failed:', error);
    res.status(500).send('# Error generating metrics\n');
  }
});

export default router;