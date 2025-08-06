import { Router } from 'express';
import { checkDatabaseHealth } from '../database/connection';

const router = Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    // Set a timeout for the health check
    const healthCheckPromise = checkDatabaseHealth();
    const timeoutPromise = new Promise<{ postgres: boolean; redis: boolean }>((resolve) => {
      setTimeout(() => resolve({ postgres: false, redis: false }), 2000); // 2 second timeout
    });
    
    const dbHealth = await Promise.race([healthCheckPromise, timeoutPromise]);
    const wsServer = (global as any).wsServer;
    const wsStats = wsServer?.getConnectionStats() || { totalConnections: 0 };
    
    const health = {
      status: dbHealth.postgres && dbHealth.redis ? 'healthy' : 'degraded',
      timestamp: new Date(),
      services: {
        api: 'healthy',
        postgres: dbHealth.postgres ? 'healthy' : 'unhealthy',
        redis: dbHealth.redis ? 'healthy' : 'unhealthy',
        websocket: wsStats.totalConnections >= 0 ? 'healthy' : 'unhealthy'
      },
      version: process.env.APP_VERSION || '2.0.0',
      uptime: process.uptime(),
      connections: wsStats.totalConnections
    };
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Failed to check health',
      timestamp: new Date()
    });
  }
});

// Liveness probe (simple check if server is running)
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

// Readiness probe (check if server is ready to accept traffic)
router.get('/ready', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    if (dbHealth.postgres || process.env.BYPASS_AUTH === 'true') {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready', reason: 'database unavailable' });
    }
  } catch (error) {
    res.status(503).json({ status: 'not ready', reason: 'health check failed' });
  }
});

export default router;