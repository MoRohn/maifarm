import { Router, Request, Response } from 'express';
import { db } from '../database/connection';
import { redis } from '../database/connection';
import { ApiResponse } from '../types/api';
import { logger } from '../utils/logger';
import { terminalService } from '../services/unified/terminalService';

// Create TmuxHelper facade with direct tmux commands
const TmuxHelper = {
  listSessions: async (): Promise<string[]> => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync('TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null || echo ""');
      return stdout.trim().split('\n').filter(Boolean);
    } catch (error) {
      // If tmux returns error, it might mean no sessions which is fine
      return [];
    }
  },
  killSession: async (sessionName: string): Promise<void> => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${sessionName}`);
    } catch (error) {
      // Session might not exist, which is fine
    }
  },
  isTmuxInstalled: async (): Promise<boolean> => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('which tmux');
      return true;
    } catch {
      return false;
    }
  }
};
import os from 'os';

const router = Router();

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  error?: string;
  details?: any;
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  services: ServiceHealth[];
  environment: {
    nodeVersion: string;
    platform: string;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
}

/**
 * Comprehensive health check endpoint
 * Checks all critical services and dependencies
 */
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const services: ServiceHealth[] = [];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // 1. Check PostgreSQL
  try {
    const pgStart = Date.now();
    const result = await db.query('SELECT 1 as check, NOW() as time');
    const pgLatency = Date.now() - pgStart;
    
    services.push({
      name: 'postgresql',
      status: pgLatency < 100 ? 'healthy' : 'degraded',
      latency: pgLatency,
      details: {
        connectionStatus: db.getConnectionStatus()
      }
    });
    
    if (pgLatency > 100) overallStatus = 'degraded';
  } catch (error: any) {
    services.push({
      name: 'postgresql',
      status: 'unhealthy',
      error: error.message
    });
    overallStatus = 'unhealthy';
  }

  // 2. Check Redis
  try {
    if (redis.isOpen) {
      const redisStart = Date.now();
      await redis.ping();
      const redisLatency = Date.now() - redisStart;
      
      services.push({
        name: 'redis',
        status: redisLatency < 50 ? 'healthy' : 'degraded',
        latency: redisLatency
      });
      
      if (redisLatency > 50) overallStatus = Math.max(overallStatus, 'degraded') as any;
    } else {
      services.push({
        name: 'redis',
        status: 'degraded',
        error: 'Not connected'
      });
      if (overallStatus === 'healthy') overallStatus = 'degraded';
    }
  } catch (error: any) {
    services.push({
      name: 'redis',
      status: 'unhealthy',
      error: error.message
    });
    if (overallStatus === 'healthy') overallStatus = 'degraded';
  }

  // 3. Check WebSocket
  try {
    const wsServer = (global as any).wsServer;
    if (wsServer && wsServer.io) {
      const connectedClients = wsServer.io.sockets.sockets.size;
      services.push({
        name: 'websocket',
        status: 'healthy',
        details: {
          connectedClients,
          engine: wsServer.io.engine ? 'active' : 'inactive'
        }
      });
    } else {
      services.push({
        name: 'websocket',
        status: 'degraded',
        error: 'WebSocket server not initialized'
      });
      if (overallStatus === 'healthy') overallStatus = 'degraded';
    }
  } catch (error: any) {
    services.push({
      name: 'websocket',
      status: 'unhealthy',
      error: error.message
    });
  }

  // 4. Check Tmux
  try {
    const tmuxInstalled = await TmuxHelper.isTmuxInstalled();
    if (tmuxInstalled) {
      const sessions = await TmuxHelper.listSessions();

      // Also check terminalService for active sessions
      let activeTerminalSessions = 0;
      try {
        activeTerminalSessions = terminalService.getActiveSessions?.().length || 0;
      } catch {
        // Method might not exist
      }

      // Having no tmux sessions is a normal/healthy state, not unhealthy
      services.push({
        name: 'tmux',
        status: 'healthy',
        details: {
          installed: true,
          tmuxSessions: sessions.length,
          terminalSessions: activeTerminalSessions,
          message: sessions.length === 0 && activeTerminalSessions === 0 ? 'No active sessions (normal state)' : undefined
        }
      });
    } else {
      // Tmux not installed but we can still mark as degraded instead of unhealthy
      // since it's not critical for basic operations
      services.push({
        name: 'tmux',
        status: 'degraded',
        error: 'Tmux not installed',
        details: {
          message: 'Tmux is not installed but is optional for farm operations'
        }
      });
      if (overallStatus === 'healthy') overallStatus = 'degraded';
    }
  } catch (error: any) {
    // Log the actual error for debugging
    console.error('[HEALTH_CHECK] Tmux check error:', error);

    // If there's an error checking tmux but it's just "no sessions", that's healthy
    if (error.message?.includes('no server running') ||
        error.message?.includes('no sessions') ||
        error.message?.includes('error connecting to')) {
      services.push({
        name: 'tmux',
        status: 'healthy',
        details: {
          installed: true,
          activeSessions: 0,
          message: 'No active sessions (normal state)'
        }
      });
    } else {
      // For other errors, mark as degraded not unhealthy
      services.push({
        name: 'tmux',
        status: 'degraded',
        error: error.message || 'Failed to check tmux status',
        details: {
          message: 'Tmux check failed but is non-critical'
        }
      });
      if (overallStatus === 'healthy') overallStatus = 'degraded';
    }
  }

  // 5. Check File System (maibarn)
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const maibarnPath = path.join(process.cwd(), 'maibarn');
    
    const stats = await fs.stat(maibarnPath);
    services.push({
      name: 'filesystem',
      status: 'healthy',
      details: {
        maibarnExists: stats.isDirectory(),
        writable: true
      }
    });
  } catch (error: any) {
    services.push({
      name: 'filesystem',
      status: 'unhealthy',
      error: 'Cannot access maibarn directory'
    });
    overallStatus = 'unhealthy';
  }

  // 6. Check API Keys
  try {
    const apiKeysResult = await db.query(
      "SELECT COALESCE(provider, service) as provider, COUNT(*) as count FROM api_keys WHERE is_active = true GROUP BY COALESCE(provider, service)"
    );

    // Having no API keys is OK - it might be initial setup or using env vars
    const hasEnvKeys = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.CLAUDE_API_KEY;
    const apiKeyStatus = (apiKeysResult.rows.length > 0 || hasEnvKeys) ? 'healthy' : 'degraded';

    services.push({
      name: 'api_keys',
      status: apiKeyStatus,
      details: {
        providers: apiKeysResult.rows,
        usingEnvKeys: !!hasEnvKeys,
        message: apiKeyStatus === 'degraded' ? 'No API keys configured (add keys or set environment variables)' : undefined
      }
    });

    if (apiKeyStatus === 'degraded' && overallStatus === 'healthy') {
      overallStatus = 'degraded';
    }
  } catch (error: any) {
    // If the table doesn't exist, check for env vars instead
    if (error.message?.includes('does not exist')) {
      const hasEnvKeys = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.CLAUDE_API_KEY;
      services.push({
        name: 'api_keys',
        status: hasEnvKeys ? 'healthy' : 'degraded',
        details: {
          usingEnvKeys: true,
          message: hasEnvKeys ? 'Using environment variables' : 'No API keys configured'
        }
      });
      if (!hasEnvKeys && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    } else {
      services.push({
        name: 'api_keys',
        status: 'unhealthy',
        error: error.message
      });
    }
  }

  // 7. Check Memory Usage
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const memPercentage = (memUsage.heapUsed / totalMem) * 100;
  
  if (memPercentage > 80) {
    services.push({
      name: 'memory',
      status: 'degraded',
      details: {
        percentage: memPercentage.toFixed(2),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
      }
    });
    if (overallStatus === 'healthy') overallStatus = 'degraded';
  } else {
    services.push({
      name: 'memory',
      status: 'healthy',
      details: {
        percentage: memPercentage.toFixed(2),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
      }
    });
  }

  // Build response
  const response: HealthCheckResponse = {
    status: overallStatus,
    timestamp: new Date(),
    uptime: process.uptime(),
    services,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        used: memUsage.heapUsed,
        total: totalMem,
        percentage: memPercentage
      }
    }
  };

  // Set appropriate status code
  let statusCode = 200;
  if (overallStatus === 'unhealthy') statusCode = 503;
  else if (overallStatus === 'degraded') statusCode = 200; // Still operational

  // Log health check (only log in development mode to avoid duplication with startup check)
  const totalLatency = Date.now() - startTime;
  if (process.env.NODE_ENV === 'development' && req.headers['x-startup-check'] !== 'true') {
    logger.info('HEALTH_CHECK', `Health check completed in ${totalLatency}ms`, {
      status: overallStatus,
      services: services.map(s => ({ name: s.name, status: s.status }))
    });
  }

  const apiResponse: ApiResponse<HealthCheckResponse> = {
    success: overallStatus !== 'unhealthy',
    data: response
  };

  res.status(statusCode).json(apiResponse);
});

/**
 * Liveness probe - simple check if server is running
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'alive',
      timestamp: new Date()
    }
  });
});

/**
 * Readiness probe - check if server is ready to accept traffic
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Quick DB check
    await db.query('SELECT 1');
    
    res.status(200).json({
      success: true,
      data: {
        status: 'ready',
        timestamp: new Date()
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'NOT_READY',
        message: 'Service not ready'
      }
    });
  }
});

export default router;