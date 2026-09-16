import { Router } from 'express';
import { ApiResponse } from '../types/api';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { analyticsService } from '../gateway/services/AnalyticsService';
import { recordEndpointLatency } from '../monitoring/metricsCollector';
import { logger, LogCategory } from '../services/ProductionLogger';
import * as os from 'os';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const TIME_WINDOW_PRESETS: Record<string, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

const STORAGE_CACHE_TTL_MS = Number(process.env.ANALYTICS_STORAGE_CACHE_MS || 60000);
const COST_CACHE_TTL_MS = Number(process.env.ANALYTICS_COST_CACHE_MS || 60000);

let storageCache: { data: ResourceMetrics['storage']; expiresAt: number } | null = null;
let costCache: { key: string; data: ClaudeCodeCosts; expiresAt: number } | null = null;

function resolveTimeWindowMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.min(value, TIME_WINDOW_PRESETS['30d']);
  }

  if (typeof value === 'string') {
    if (TIME_WINDOW_PRESETS[value]) {
      return TIME_WINDOW_PRESETS[value];
    }

    const numeric = Number.parseInt(value, 10);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.min(numeric, TIME_WINDOW_PRESETS['30d']);
    }
  }

  return TIME_WINDOW_PRESETS['24h'];
}

function createCacheKey(windowStart: Date): string {
  return windowStart.toISOString();
}

const router = Router();

// Base analytics endpoint - redirects to metrics
router.get('/', apiRateLimits.read, (req, res) => {
  res.redirect('/api/analytics/metrics');
});

// Overview endpoint - alias for metrics
router.get('/overview', apiRateLimits.read, (req, res) => {
  res.redirect('/api/analytics/metrics');
});

// CPU/GPU monitoring
interface ResourceMetrics {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  storage: {
    total: number;
    used: number;
    available: number;
    percentage: number;
  };
  gpu?: {
    usage: number;
    memory: number;
    temperature?: number;
    name?: string;
    count: number;
  };
}

// Claude Code cost tracking
interface ClaudeCodeCosts {
  totalCost: number;
  costByAgent: { [agentId: string]: number };
  costByFarm: { [farmId: string]: number };
  costBreakdown: {
    api: number;
    compute: number;
    storage: number;
    network: number;
  };
  dailyCosts: Array<{
    date: string;
    cost: number;
    apiCalls: number;
  }>;
}

// Agent efficiency metrics
interface AgentEfficiencyMetrics {
  agentId: string;
  agentName: string;
  tasksCompleted: number;
  tasksTotal: number;
  successRate: number;
  averageResponseTime: number;
  errorRate: number;
  costPerTask: number;
  efficiency: number; // Calculated as (tasksCompleted/totalTime) * successRate
  lastActive: Date;
}

// Task completion metrics
interface TaskCompletionMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  averageCompletionTime: number;
  completionRate: number;
  trendsHourly: Array<{
    timestamp: Date;
    completed: number;
    failed: number;
    rate: number;
  }>;
}

// Helper function to get CPU metrics
function getCPUMetrics(): ResourceMetrics['cpu'] {
  const cpus = os.cpus();
  const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
  const totalTick = cpus.reduce((acc, cpu) => 
    acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq, 0
  );
  
  const usage = 100 - Math.floor(100 * totalIdle / totalTick);
  
  return {
    usage,
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
    temperature: undefined // Would need platform-specific tools
  };
}

// Helper function to get memory metrics
function getMemoryMetrics(): ResourceMetrics['memory'] {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    total: totalMem / (1024 ** 3), // Convert to GB
    used: usedMem / (1024 ** 3),
    free: freeMem / (1024 ** 3),
    percentage: Math.round((usedMem / totalMem) * 100)
  };
}

// Helper function to get storage metrics
async function getStorageMetrics(): Promise<ResourceMetrics['storage']> {
  if (storageCache && storageCache.expiresAt > Date.now()) {
    return storageCache.data;
  }

  const fallback: ResourceMetrics['storage'] = {
    total: 500,
    used: 250,
    available: 250,
    percentage: 50
  };

  if (process.env.NODE_ENV === 'test') {
    storageCache = {
      data: fallback,
      expiresAt: Date.now() + STORAGE_CACHE_TTL_MS
    };
    return fallback;
  }

  try {
    const { stdout } = await execAsync('df -k / | tail -1');
    const parts = stdout.trim().split(/\s+/);

    if (parts.length >= 5) {
      const totalKB = parseInt(parts[1], 10);
      const usedKB = parseInt(parts[2], 10);
      const availableKB = parseInt(parts[3], 10);
      const percentageStr = parts[4];
      const percentage = parseInt(percentageStr.replace('%', ''), 10);

      const data: ResourceMetrics['storage'] = {
        total: totalKB / (1024 ** 2),
        used: usedKB / (1024 ** 2),
        available: availableKB / (1024 ** 2),
        percentage: Math.min(100, Math.max(0, percentage))
      };

      storageCache = {
        data,
        expiresAt: Date.now() + STORAGE_CACHE_TTL_MS
      };

      return data;
    }
  } catch (error) {
    logger.warn(LogCategory.PERFORMANCE, 'Failed to collect storage metrics, using fallback', { error });
  }

  storageCache = {
    data: fallback,
    expiresAt: Date.now() + STORAGE_CACHE_TTL_MS
  };

  return fallback;
}

// Helper function to get Claude Code costs
async function getClaudeCodeCosts(windowStart: Date): Promise<ClaudeCodeCosts> {
  const cacheKey = createCacheKey(windowStart);
  if (costCache && costCache.key === cacheKey && costCache.expiresAt > Date.now()) {
    return costCache.data;
  }

  try {
    const apiCostPerCall = 0.002;
    const computeCostPerMinute = 0.001;

    const costsResult = await db.query(
      `SELECT 
        COUNT(*) AS total_calls,
        AVG(response_time) AS avg_response_time,
        farm_id,
        agent_id,
        DATE(created_at) AS date
      FROM tasks
      WHERE created_at >= $1
      GROUP BY farm_id, agent_id, DATE(created_at)`,
      [windowStart]
    ).catch(() => ({ rows: [] }));

    const costByAgent: Record<string, number> = {};
    const costByFarm: Record<string, number> = {};
    const dailyCosts: Array<{ date: string; cost: number; apiCalls: number }> = [];

    let totalApiCost = 0;
    let totalComputeCost = 0;

    costsResult.rows.forEach((row: any) => {
      const totalCalls = Number(row.total_calls || 0);
      const avgResponseMs = Number(row.avg_response_time || 0);
      const apiCost = totalCalls * apiCostPerCall;
      const computeCost = (avgResponseMs / 60000) * computeCostPerMinute;
      const totalCost = apiCost + computeCost;

      if (row.agent_id) {
        costByAgent[row.agent_id] = (costByAgent[row.agent_id] || 0) + totalCost;
      }

      if (row.farm_id) {
        costByFarm[row.farm_id] = (costByFarm[row.farm_id] || 0) + totalCost;
      }

      totalApiCost += apiCost;
      totalComputeCost += computeCost;

      dailyCosts.push({
        date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
        cost: totalCost,
        apiCalls: totalCalls
      });
    });

    const totalCost = totalApiCost + totalComputeCost;
    const result: ClaudeCodeCosts = {
      totalCost,
      costByAgent,
      costByFarm,
      costBreakdown: {
        api: totalApiCost,
        compute: totalComputeCost,
        storage: totalCost * 0.1,
        network: totalCost * 0.05
      },
      dailyCosts
    };

    if (COST_CACHE_TTL_MS > 0) {
      costCache = {
        key: cacheKey,
        data: result,
        expiresAt: Date.now() + COST_CACHE_TTL_MS
      };
    }

    return result;
  } catch (error) {
    logger.warn(LogCategory.PERFORMANCE, 'Error calculating Claude Code costs', { error });
    return {
      totalCost: 0,
      costByAgent: {},
      costByFarm: {},
      costBreakdown: { api: 0, compute: 0, storage: 0, network: 0 },
      dailyCosts: []
    };
  }
}

// GET /api/analytics/metrics - Get comprehensive analytics metrics
router.get('/metrics', apiRateLimits.read, async (req, res) => {
  const start = process.hrtime.bigint();
  const routeKey = '/api/analytics/metrics';
  const rawTimeRange = (req.query.timeRange ?? '24h') as string | number;
  const windowMs = resolveTimeWindowMs(rawTimeRange);
  const windowStart = new Date(Date.now() - windowMs);

  try {
    const resourceMetrics: ResourceMetrics = {
      cpu: getCPUMetrics(),
      memory: getMemoryMetrics(),
      storage: await getStorageMetrics()
    };

    const claudeCosts = await getClaudeCodeCosts(windowStart);

    const agentResult = await db.query(
      `SELECT 
        a.id AS agent_id,
        a.farm_id,
        a.name AS agent_name,
        a.type AS agent_type,
        COALESCE(COUNT(t.id), 0) AS tasks_total,
        COALESCE(COUNT(*) FILTER (WHERE t.status = 'completed'), 0) AS tasks_completed,
        COALESCE(COUNT(*) FILTER (WHERE t.status = 'failed'), 0) AS errors,
        COALESCE(AVG(
          CASE 
            WHEN t.status = 'completed' AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) * 1000
            ELSE NULL
          END
        ), 0) AS avg_response_time,
        MAX(t.updated_at) AS last_active
      FROM agents a
      LEFT JOIN tasks t
        ON t.agent_id = a.id
       AND t.created_at >= $1
      GROUP BY a.id, a.farm_id, a.name, a.type`,
      [windowStart]
    ).catch(() => ({ rows: [] }));

    const agentEfficiency: AgentEfficiencyMetrics[] = agentResult.rows.map((row: any) => {
      const tasksCompleted = Number(row.tasks_completed || 0);
      const tasksTotal = Number(row.tasks_total || 0);
      const avgResponseTime = Number(row.avg_response_time || 0);
      const errorRate = tasksTotal > 0 ? (Number(row.errors || 0) / tasksTotal) * 100 : 0;
      const costForAgent = claudeCosts.costByAgent[row.agent_id] || 0;
      const costPerTask = tasksCompleted > 0 ? costForAgent / tasksCompleted : 0;
      const efficiency = tasksTotal > 0 && avgResponseTime > 0
        ? (tasksCompleted / avgResponseTime) * (tasksCompleted / tasksTotal)
        : 0;

      return {
        agentId: row.agent_id,
        agentName: row.agent_name,
        tasksCompleted,
        tasksTotal,
        successRate: tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0,
        averageResponseTime: avgResponseTime,
        errorRate,
        costPerTask,
        efficiency,
        lastActive: row.last_active ? new Date(row.last_active) : new Date(windowStart)
      };
    });

    const taskResult = await db.query(
      `SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status IN ('pending', 'queued', 'assigned', 'processing')) AS pending,
        AVG(CASE WHEN status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
          ELSE response_time END) AS avg_completion_time
      FROM tasks
      WHERE created_at >= $1`,
      [windowStart]
    ).catch(() => ({ rows: [{}] }));

    const taskRow = taskResult.rows[0] || {};
    const totalTasks = parseInt(taskRow.total || 0, 10);
    const completedTasks = parseInt(taskRow.completed || 0, 10);
    const failedTasks = parseInt(taskRow.failed || 0, 10);
    const pendingTasks = parseInt(taskRow.pending || 0, 10);

    const taskCompletion: TaskCompletionMetrics = {
      totalTasks,
      completedTasks,
      failedTasks,
      pendingTasks,
      averageCompletionTime: parseFloat(taskRow.avg_completion_time || 0),
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
      trendsHourly: []
    };

    const harvestResult = await db.query(
      `SELECT 
        COUNT(*) AS total_harvests,
        AVG(yield_value) AS avg_yield,
        SUM(yield_value) AS total_yield,
        COUNT(*) FILTER (WHERE status IN ('completed', 'ready')) AS successful_harvests
      FROM harvests
      WHERE created_at >= $1`,
      [windowStart]
    ).catch(() => ({ rows: [{}] }));

    const harvestData = harvestResult.rows[0] || {};

    const response: ApiResponse = {
      success: true,
      data: {
        resourceMetrics,
        claudeCosts,
        agentEfficiency,
        taskCompletion,
        harvestAnalytics: {
          totalHarvests: parseInt(harvestData.total_harvests || 0, 10),
          averageYield: parseFloat(harvestData.avg_yield || 0),
          totalYield: parseFloat(harvestData.total_yield || 0),
          successRate: harvestData.total_harvests > 0
            ? (harvestData.successful_harvests / harvestData.total_harvests) * 100
            : 0
        },
        windowStart,
        windowMs,
        timestamp: new Date()
      }
    };

    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, res.statusCode || 200, durationSeconds);
    logger.debug(LogCategory.METRICS, 'Analytics metrics computed', {
      durationMs: Math.round(durationSeconds * 1000),
      windowMs
    });

    res.json(response);
  } catch (error) {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    recordEndpointLatency(routeKey, 500, durationSeconds);

    logger.error(LogCategory.METRICS, 'Error fetching analytics metrics', {
      error,
      durationMs: Math.round(durationSeconds * 1000)
    });

    const response: ApiResponse = {
      success: true,
      data: {
        resourceMetrics: {
          cpu: getCPUMetrics(),
          memory: getMemoryMetrics(),
          storage: await getStorageMetrics()
        },
        claudeCosts: {
          totalCost: 0,
          costByAgent: {},
          costByFarm: {},
          costBreakdown: { api: 0, compute: 0, storage: 0, network: 0 },
          dailyCosts: []
        },
        agentEfficiency: [],
        taskCompletion: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          pendingTasks: 0,
          averageCompletionTime: 0,
          completionRate: 0,
          trendsHourly: []
        },
        harvestAnalytics: {
          totalHarvests: 0,
          averageYield: 0,
          totalYield: 0,
          successRate: 0
        },
        windowStart,
        windowMs,
        timestamp: new Date()
      }
    };

    res.json(response);
  }
});

// GET /api/analytics/farm-yield - Get farm yield metrics
router.get('/farm-yield', apiRateLimits.read, async (req, res) => {
  try {
    const { start, end } = req.query;
    const timeRange = start && end 
      ? { start: new Date(start as string), end: new Date(end as string) }
      : undefined;
    
    const yieldMetrics = await analyticsService.getFarmYieldMetrics(timeRange);
    
    const response: ApiResponse = {
      success: true,
      data: yieldMetrics
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching farm yield metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch farm yield metrics' }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/costs - Get detailed Claude Code cost analytics
router.get('/costs', apiRateLimits.read, async (req, res) => {
  try {
    const rawTimeRange = (req.query.timeRange ?? '30d') as string | number;
    const windowMs = resolveTimeWindowMs(rawTimeRange);
    const windowStart = new Date(Date.now() - windowMs);

    const costs = await getClaudeCodeCosts(windowStart);

    const response: ApiResponse = {
      success: true,
      data: costs
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching cost analytics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch cost analytics' }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/agent-efficiency - Get agent efficiency metrics
router.get('/agent-efficiency', apiRateLimits.read, async (req, res) => {
  try {
    const { timeRange = '24h', sortBy = 'efficiency' } = req.query;

    // SECURITY FIX: Validate timeRange against whitelist to prevent SQL injection
    const allowedTimeRanges: Record<string, string> = {
      '15m': '15 minutes',
      '1h': '1 hour',
      '6h': '6 hours',
      '12h': '12 hours',
      '24h': '24 hours',
      '3d': '3 days',
      '7d': '7 days',
      '30d': '30 days'
    };
    const safeTimeRange = allowedTimeRanges[timeRange as string] || '24 hours';

    // SECURITY FIX: Whitelist sortBy columns to prevent SQL injection
    const allowedSortColumns: Record<string, string> = {
      'efficiency': '(completed::float / NULLIF(total, 0))',
      'completed': 'completed',
      'total': 'total',
      'avg_time': 'avg_time',
      'failures': 'failures',
      'name': 'a.name'
    };
    const safeSortBy = allowedSortColumns[sortBy as string] || '(completed::float / NULLIF(total, 0))';

    const result = await db.query(`
      SELECT
        a.id,
        a.name,
        a.type,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed,
        COUNT(t.id) as total,
        AVG(CASE WHEN t.status = 'completed' THEN t.response_time END) as avg_time,
        COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failures
      FROM agents a
      LEFT JOIN tasks t ON a.id = t.agent_id
      WHERE t.created_at >= NOW() - INTERVAL '${safeTimeRange}'
      GROUP BY a.id, a.name, a.type
      ORDER BY ${safeSortBy} DESC
    `).catch(() => ({ rows: [] }));
    
    const response: ApiResponse = {
      success: true,
      data: result.rows
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching agent efficiency:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch agent efficiency metrics' }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/cpu-gpu - Get real-time CPU/GPU metrics
router.get('/cpu-gpu', apiRateLimits.read, async (req, res) => {
  try {
    const metrics: ResourceMetrics = {
      cpu: getCPUMetrics(),
      memory: getMemoryMetrics(),
      storage: await getStorageMetrics(),
      gpu: {
        usage: 0,
        memory: 0,
        temperature: undefined,
        name: undefined,
        count: 0
      }
    };
    
    const response: ApiResponse = {
      success: true,
      data: metrics
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching CPU/GPU metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch CPU/GPU metrics' }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/claude-metrics - Get Claude Code metrics from coordination file
router.get('/claude-metrics', apiRateLimits.read, async (req, res) => {
  try {
    const claudeCoordPath = '/tmp/claude_coordination/active_agents.json';
    let claudeMetrics = null;
    
    // Try to read Claude Code coordination file
    if (fs.existsSync(claudeCoordPath)) {
      try {
        const data = fs.readFileSync(claudeCoordPath, 'utf-8');
        const agents = JSON.parse(data);
        
        // Calculate metrics from active agents
        claudeMetrics = {
          activeAgents: agents.length,
          totalTasks: agents.reduce((sum: number, agent: any) => sum + (agent.tasks_completed || 0), 0),
          completedTasks: agents.reduce((sum: number, agent: any) => sum + (agent.tasks_completed || 0), 0),
          failedTasks: agents.reduce((sum: number, agent: any) => sum + (agent.tasks_failed || 0), 0),
          cpu: getCPUMetrics().usage,
          memory: getMemoryMetrics().percentage,
          gpu: 0, // Would need GPU monitoring library
          apiCalls: agents.reduce((sum: number, agent: any) => sum + (agent.api_calls || 100), 0),
          costs: {
            compute: agents.length * 0.10, // Example: $0.10 per agent per hour
            storage: agents.length * 0.02,
            network: agents.length * 0.01,
            api: agents.reduce((sum: number, agent: any) => sum + (agent.api_calls || 100), 0) * 0.01
          }
        };
      } catch (error) {
        console.warn('Failed to parse Claude coordination file:', error);
      }
    }
    
    const response: ApiResponse = {
      success: true,
      data: claudeMetrics
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching Claude metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch Claude metrics' }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/claude-file-metrics - Alternative endpoint for file-based metrics
router.get('/claude-file-metrics', apiRateLimits.read, async (req, res) => {
  try {
    const metricsPath = '/tmp/claude_coordination/metrics.json';
    let metrics = null;
    
    if (fs.existsSync(metricsPath)) {
      try {
        const data = fs.readFileSync(metricsPath, 'utf-8');
        metrics = JSON.parse(data);
      } catch (error) {
        console.warn('Failed to parse metrics file:', error);
      }
    }
    
    const response: ApiResponse = {
      success: true,
      data: metrics
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching file metrics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch file metrics' }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/farm-creation - Analytics for Farm Creation mode
router.get('/farm-creation', apiRateLimits.read, async (req, res) => {
  try {
    const farmCreationMetrics = await analyticsService.getFarmCreationMetrics();
    
    const response: ApiResponse = {
      success: true,
      data: {
        totalCreated: farmCreationMetrics.totalFarms || 0,
        successRate: farmCreationMetrics.successRate || 0,
        averageCreationTime: farmCreationMetrics.avgCreationTime || 0,
        failureReasons: farmCreationMetrics.failureReasons || {},
        recentFarms: farmCreationMetrics.recentFarms || [],
        creationTrend: farmCreationMetrics.trend || []
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching farm creation analytics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch farm creation analytics' }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/go-wild - Analytics for Go Wild mode
router.get('/go-wild', apiRateLimits.read, async (req, res) => {
  try {
    const goWildMetrics = await analyticsService.getGoWildMetrics();
    
    const response: ApiResponse = {
      success: true,
      data: {
        sessionsStarted: goWildMetrics.sessions || 0,
        averageSessionDuration: goWildMetrics.avgDuration || 0,
        tasksGenerated: goWildMetrics.tasksGenerated || 0,
        creativityScore: goWildMetrics.creativityScore || 0,
        explorationDepth: goWildMetrics.explorationDepth || 0,
        discoveries: goWildMetrics.discoveries || [],
        boundaries: goWildMetrics.boundaries || {}
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching Go Wild analytics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch Go Wild analytics' }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/quick-task - Analytics for Quick Task mode
router.get('/quick-task', apiRateLimits.read, async (req, res) => {
  try {
    const quickTaskMetrics = await analyticsService.getQuickTaskMetrics();
    
    const response: ApiResponse = {
      success: true,
      data: {
        tasksCompleted: quickTaskMetrics.completed || 0,
        averageCompletionTime: quickTaskMetrics.avgTime || 0,
        taskTypes: quickTaskMetrics.taskTypes || {},
        successRate: quickTaskMetrics.successRate || 0,
        popularTasks: quickTaskMetrics.popularTasks || [],
        performanceScore: quickTaskMetrics.performanceScore || 0
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching Quick Task analytics:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch Quick Task analytics' }
    };
    
    res.status(500).json(response);
  }
});

// POST /api/analytics/track - Track analytics events
router.post('/track', apiRateLimits.write, async (req, res) => {
  try {
    const { type, category, data } = req.body;
    
    await analyticsService.trackEvent({
      type,
      category,
      data,
      timestamp: new Date(),
      userId: (req as any).user?.id || 'anonymous'
    });
    
    const response: ApiResponse = {
      success: true,
      data: { message: 'Event tracked successfully' }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error tracking analytics event:', error);
    
    const response: ApiResponse = {
      success: false,
      error: { code: 'TRACK_ERROR', message: 'Failed to track event' }
    };
    
    res.status(500).json(response);
  }
});

// GET /api/analytics/standardized-tasks - Get standardized task metrics
router.get('/standardized-tasks', apiRateLimits.read, async (req, res) => {
  try {
    const metrics = await analyticsService.getStandardizedTaskMetrics();

    const response: ApiResponse = {
      success: true,
      data: metrics
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting standardized task metrics:', error);

    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to get standardized task metrics' }
    };

    res.status(500).json(response);
  }
});

// GET /api/metrics/system - Get real-time system metrics (CPU, Memory, Storage, GPU)
// This endpoint is used by the Analytics page for system resource cards
router.get('/system', apiRateLimits.read, async (req, res) => {
  try {
    const metrics: ResourceMetrics = {
      cpu: getCPUMetrics(),
      memory: getMemoryMetrics(),
      storage: await getStorageMetrics(),
      gpu: {
        usage: 0, // Would require nvidia-smi or similar
        memory: 0,
        temperature: undefined,
        name: undefined,
        count: 0
      }
    };

    const response: ApiResponse = {
      success: true,
      data: metrics
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching system metrics:', error);

    const response: ApiResponse = {
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch system metrics' }
    };

    res.status(500).json(response);
  }
});

export { router as analyticsRouter, AgentEfficiencyMetrics, TaskCompletionMetrics, ClaudeCodeCosts, ResourceMetrics };
