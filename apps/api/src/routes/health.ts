import { Router } from 'express';
import os from 'os';
import fs from 'fs/promises';
import { metricsCollector } from '../monitoring/metricsCollector';
import { farmHealthMonitor } from '../services/farmHealthMonitor';
import { logger, LogCategory } from '../utils/logger';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      responseTime?: number;
    };
  };
  system?: {
    cpu: {
      usage: number;
      cores: number;
    };
    memory: {
      total: number;
      free: number;
      used: number;
      percentage: number;
    };
    disk?: {
      total: number;
      free: number;
      used: number;
      percentage: number;
    };
  };
}

// Comprehensive health check
router.get('/api/health', async (req, res) => {
  const startTime = Date.now();
  const result: HealthCheckResult = {
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
    checks: {}
  };

  try {
    // Check WebSocket server
    const wsCheck = await checkWebSocketServer();
    result.checks.websocket = wsCheck;

    // Check coordination directory access
    const coordCheck = await checkCoordinationDirectory();
    result.checks.coordination = coordCheck;

    // Check memory usage
    const memoryCheck = checkMemoryUsage();
    result.checks.memory = memoryCheck;

    // Check CPU usage
    const cpuCheck = await checkCPUUsage();
    result.checks.cpu = cpuCheck;

    // Check disk space
    const diskCheck = await checkDiskSpace();
    result.checks.disk = diskCheck;

    // Check active agents
    const agentCheck = await checkActiveAgents();
    result.checks.agents = agentCheck;

    // Include system metrics
    result.system = {
      cpu: {
        usage: await getCPUUsage(),
        cores: os.cpus().length
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        percentage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
      }
    };

    // Determine overall health status
    const failedChecks = Object.values(result.checks).filter(check => check.status === 'fail');
    const warnChecks = Object.values(result.checks).filter(check => check.status === 'warn');

    if (failedChecks.length > 0) {
      result.status = 'unhealthy';
      res.status(503);
    } else if (warnChecks.length > 0) {
      result.status = 'degraded';
    }

    const responseTime = Date.now() - startTime;
    res.header('X-Response-Time', `${responseTime}ms`);
    res.json(result);
  } catch (error) {
    result.status = 'unhealthy';
    result.checks.system = {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(503).json(result);
  }
});

// Readiness probe for Kubernetes
router.get('/api/health/ready', async (req, res) => {
  try {
    // Check if the server is ready to accept traffic
    const wsReady = await isWebSocketReady();
    const coordReady = await isCoordinationReady();
    
    if (wsReady && coordReady) {
      res.json({ status: 'ready', timestamp: new Date() });
    } else {
      res.status(503).json({ 
        status: 'not ready', 
        timestamp: new Date(),
        websocket: wsReady,
        coordination: coordReady
      });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'not ready', 
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Liveness probe for Kubernetes
router.get('/api/health/live', (req, res) => {
  // Simple check that the process is alive
  res.json({ 
    status: 'alive', 
    timestamp: new Date(),
    pid: process.pid,
    uptime: process.uptime()
  });
});

// Farm-specific health check
router.get('/api/farms/:farmId/health', async (req, res) => {
  try {
    const { farmId } = req.params;
    const health = farmHealthMonitor.getHealth(farmId);

    if (!health) {
      return res.status(404).json({
        success: false,
        error: 'Farm not being monitored'
      });
    }

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error fetching farm health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farm health'
    });
  }
});

// All farms health status
router.get('/api/farms/health', async (req, res) => {
  try {
    const allHealth = farmHealthMonitor.getAllHealth();
    const healthArray = Array.from(allHealth.values());

    res.json({
      success: true,
      data: healthArray,
      count: healthArray.length
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error fetching all farm health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farm health'
    });
  }
});

// Trigger manual recovery for a farm
// SECURITY FIX: Added authenticateToken middleware to prevent unauthenticated access
router.post('/api/farms/:farmId/health/recover', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { farmId } = req.params;
    const health = farmHealthMonitor.getHealth(farmId);

    if (!health) {
      return res.status(404).json({
        success: false,
        error: 'Farm not being monitored'
      });
    }

    // Emit recovery event
    farmHealthMonitor.emit('manual-recovery', { farmId });

    res.json({
      success: true,
      message: 'Recovery initiated',
      farmId
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error initiating recovery:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate recovery'
    });
  }
});

// Terminal streaming health check
router.get('/api/terminal-health', async (req, res) => {
  try {
    const terminalFileWatcher = require('../services/terminalFileWatcherService').terminalFileWatcherService;
    const activeFarms = terminalFileWatcher.getWatchedFarms?.() || [];

    res.json({
      success: true,
      data: {
        activeFarms: activeFarms.length,
        farms: activeFarms
      }
    });
  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Terminal health check failed:', error);
    res.status(503).json({
      success: false,
      error: 'Terminal service unavailable'
    });
  }
});

// Helper: Promise with timeout to prevent hanging health checks
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
  ]);
}

// Detailed health status
router.get('/api/health/detailed', async (req, res) => {
  try {
    const metrics = metricsCollector.getCurrentMetrics();
    // Await all metric promises with timeout to prevent hanging
    const HEALTH_CHECK_TIMEOUT = 5000; // 5 second timeout per check
    const [farms, agents, clients, resources] = await Promise.all([
      withTimeout(metrics.farms, HEALTH_CHECK_TIMEOUT, { values: [] }),
      withTimeout(metrics.agents, HEALTH_CHECK_TIMEOUT, { values: [] }),
      withTimeout(metrics.clients, HEALTH_CHECK_TIMEOUT, { values: [] }),
      withTimeout(metrics.resources, HEALTH_CHECK_TIMEOUT, { values: [] })
    ]);

    const systemInfo = {
      node: {
        version: process.version,
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      os: {
        platform: os.platform(),
        release: os.release(),
        hostname: os.hostname(),
        loadavg: os.loadavg(),
        cpus: os.cpus().map(cpu => ({
          model: cpu.model,
          speed: cpu.speed,
          times: cpu.times
        }))
      },
      application: {
        farms,
        agents,
        clients,
        resources
      }
    };

    res.json({
      status: 'healthy',
      timestamp: new Date(),
      system: systemInfo
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper functions
async function checkWebSocketServer() {
  try {
    // Check if WebSocket server is responding
    // This would be implemented based on your WebSocket server setup
    return { status: 'pass' as const, responseTime: 5 };
  } catch (error) {
    return { 
      status: 'fail' as const, 
      message: 'WebSocket server not responding'
    };
  }
}

async function checkCoordinationDirectory() {
  try {
    await fs.access('/tmp/claude_coordination');
    return { status: 'pass' as const };
  } catch (error) {
    return { 
      status: 'fail' as const, 
      message: 'Coordination directory not accessible'
    };
  }
}

function checkMemoryUsage() {
  const usage = (os.totalmem() - os.freemem()) / os.totalmem();
  if (usage > 0.9) {
    return { status: 'fail' as const, message: `Memory usage critical: ${(usage * 100).toFixed(1)}%` };
  } else if (usage > 0.7) {
    return { status: 'warn' as const, message: `Memory usage high: ${(usage * 100).toFixed(1)}%` };
  }
  return { status: 'pass' as const };
}

async function checkCPUUsage() {
  const usage = await getCPUUsage();
  if (usage > 90) {
    return { status: 'fail' as const, message: `CPU usage critical: ${usage.toFixed(1)}%` };
  } else if (usage > 70) {
    return { status: 'warn' as const, message: `CPU usage high: ${usage.toFixed(1)}%` };
  }
  return { status: 'pass' as const };
}

async function checkDiskSpace() {
  try {
    // Check disk space for the maibarn directory
    const { execSync } = await import('child_process');
    const dfOutput = execSync('df -k /tmp 2>/dev/null || df -k / 2>/dev/null', { encoding: 'utf-8' });
    const lines = dfOutput.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      if (parts.length >= 5) {
        const usedPercent = parseInt(parts[4].replace('%', ''));
        if (usedPercent > 95) {
          return { status: 'fail' as const, message: `Disk usage critical: ${usedPercent}%` };
        } else if (usedPercent > 85) {
          return { status: 'warn' as const, message: `Disk usage high: ${usedPercent}%` };
        }
      }
    }
    return { status: 'pass' as const };
  } catch (error) {
    // If disk check fails, warn but don't fail
    return { status: 'warn' as const, message: 'Unable to check disk space' };
  }
}

async function checkActiveAgents() {
  try {
    const metrics = metricsCollector.getCurrentMetrics();
    const [agents, farms] = await Promise.all([metrics.agents, metrics.farms]);

    // Count active agents and farms from the metric values
    const activeAgentCount = agents.values?.filter((v: any) => v.labels?.status === 'active').reduce((sum: number, v: any) => sum + v.value, 0) || 0;
    const activeFarmCount = farms.values?.filter((v: any) => v.labels?.status === 'active').reduce((sum: number, v: any) => sum + v.value, 0) || 0;

    if (activeAgentCount === 0 && activeFarmCount > 0) {
      return { status: 'warn' as const, message: 'No active agents but farms are running' };
    }
    return { status: 'pass' as const };
  } catch (error) {
    return { status: 'warn' as const, message: 'Unable to check active agents' };
  }
}

async function getCPUUsage(): Promise<number> {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - ~~(100 * idle / total);
  
  return usage;
}

async function isWebSocketReady(): Promise<boolean> {
  // Check if WebSocket server is ready to accept connections
  return true; // Placeholder
}

async function isCoordinationReady(): Promise<boolean> {
  try {
    await fs.access('/tmp/claude_coordination');
    return true;
  } catch {
    return false;
  }
}

export default router;