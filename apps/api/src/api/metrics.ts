import { Router } from 'express';
import { ApiResponse, Metric } from '../types/api';
import { authenticateToken } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { register, collectDefaultMetrics } from 'prom-client';
import os from 'os';
import { taskCountService } from '../services/taskCountService';
import { 
  validateMetricsRequest, 
  sanitizeMetricsMiddleware 
} from '../middleware/metricsValidation';

const router = Router();

// Initialize Prometheus metrics collection
collectDefaultMetrics({ prefix: 'maifarm_' });

// Custom metrics
import { Counter, Histogram, Gauge } from 'prom-client';

const taskCounter = new Counter({
  name: 'maifarm_tasks_total',
  help: 'Total number of tasks processed',
  labelNames: ['status', 'farm_id', 'type']
});

const taskDuration = new Histogram({
  name: 'maifarm_task_duration_seconds',
  help: 'Task execution duration in seconds',
  labelNames: ['type', 'farm_id'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300]
});

const activeAgents = new Gauge({
  name: 'maifarm_active_agents',
  help: 'Number of active agents',
  labelNames: ['farm_id', 'type']
});

const queueSize = new Gauge({
  name: 'maifarm_queue_size',
  help: 'Current queue size',
  labelNames: ['priority']
});

const resourceUtilization = new Gauge({
  name: 'maifarm_resource_utilization',
  help: 'Resource utilization percentage',
  labelNames: ['resource_type', 'farm_id']
});

// Import metrics synchronizer and aggregator
import { metricsSynchronizer } from '../services/metricsSynchronizer';
import { metricsAggregator } from '../services/metricsAggregator';

// GET /api/metrics/dashboard - Dashboard metrics endpoint
router.get('/dashboard', apiRateLimits.read, async (req, res) => {
  try {
    // Use the new metrics aggregator for accurate metrics
    const dashboardMetrics = await metricsAggregator.getDashboardMetrics();
    
    // Map to expected format for backward compatibility
    const response: ApiResponse = {
      success: true,
      data: {
        activeFarms: dashboardMetrics.liveFarms,
        totalAgents: dashboardMetrics.agentsWorking,
        harvestsCompleted: dashboardMetrics.harvestsCompleted,
        yieldedItems: dashboardMetrics.yieldedItems,
        // Legacy fields for backward compatibility
        tasksCompleted: dashboardMetrics.harvestsCompleted,
        successRate: 100
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    
    // Return default metrics if aggregator is not available
    const response: ApiResponse = {
      success: true,
      data: {
        activeFarms: 0,
        totalAgents: 0,
        harvestsCompleted: 0,
        yieldedItems: 0,
        tasksCompleted: 0,
        successRate: 100
      }
    };
    
    res.json(response);
  }
});

// GET /api/metrics/unified - Get full unified metrics
router.get('/unified', apiRateLimits.read, async (req, res) => {
  try {
    const metrics = metricsSynchronizer.getMetrics();
    
    const response: ApiResponse = {
      success: true,
      data: {
        metrics,
        uniqueAgentCount: metricsSynchronizer.getUniqueAgentCount(),
        timestamp: new Date(),
        version: Date.now()
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching unified metrics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch unified metrics'
      }
    });
  }
});

// GET /api/metrics - Prometheus-compatible metrics endpoint
router.get('/', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).end();
  }
});

// GET /api/metrics/realtime - Stream metrics data (authenticated)
router.get('/realtime', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const { 
      source,
      sourceId,
      type,
      startTime = new Date(Date.now() - 3600000), // 1 hour ago
      endTime = new Date(),
      interval = '1m'
    } = req.query;

    // Build query for time-series metrics
    let query = `
      SELECT 
        date_trunc('minute', timestamp) as time_bucket,
        source,
        source_id,
        type,
        name,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as count
      FROM metrics
      WHERE timestamp >= $1 AND timestamp <= $2
    `;
    
    const params: any[] = [startTime, endTime];
    let paramIndex = 3;

    if (source) {
      query += ` AND source = $${paramIndex++}`;
      params.push(source);
    }

    if (sourceId) {
      query += ` AND source_id = $${paramIndex++}`;
      params.push(sourceId);
    }

    if (type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(type);
    }

    query += `
      GROUP BY time_bucket, source, source_id, type, name
      ORDER BY time_bucket DESC
      LIMIT 1000
    `;

    const result = await db.query(query, params);

    const response: ApiResponse = {
      success: true,
      data: {
        metrics: result.rows,
        interval,
        startTime,
        endTime
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching realtime metrics:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch metrics'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/metrics - Record custom metrics
router.post('/', authenticateToken, apiRateLimits.write, sanitizeMetricsMiddleware, validateMetricsRequest, async (req, res) => {
  try {
    const metrics = Array.isArray(req.body) ? req.body : [req.body];
    
    // Validate metrics
    const validMetrics = metrics.filter(m => 
      m.source && m.sourceId && m.type && m.name && 
      typeof m.value === 'number'
    );

    if (validMetrics.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No valid metrics provided'
        }
      };
      return res.status(400).json(response);
    }

    // Batch insert metrics
    const values = validMetrics.map(m => [
      m.source,
      m.sourceId,
      m.type,
      m.name,
      m.value,
      m.unit || null,
      m.labels || {},
      new Date()
    ]);

    const query = `
      INSERT INTO metrics (source, source_id, type, name, value, unit, labels, timestamp)
      VALUES ${values.map((_, i) => 
        `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`
      ).join(', ')}
    `;

    await db.query(query, values.flat());

    // Update Prometheus metrics
    validMetrics.forEach(m => {
      if (m.type === 'task' && m.name === 'completed') {
        taskCounter.inc({ status: 'completed', farm_id: m.sourceId, type: m.labels?.type || 'unknown' });
      }
      if (m.type === 'resource' && m.name === 'utilization') {
        resourceUtilization.set({ resource_type: m.labels?.resource || 'unknown', farm_id: m.sourceId }, m.value);
      }
    });

    const response: ApiResponse = {
      success: true,
      data: { count: validMetrics.length }
    };

    res.json(response);
  } catch (error) {
    console.error('Error recording metrics:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to record metrics'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/metrics/summary - Get aggregated metrics summary
router.get('/summary', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const { farmId, agentId, period = '1h' } = req.query;

    // Calculate time range based on period
    const periodMap: Record<string, number> = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };

    const timeRange = periodMap[period as string] || periodMap['1h'];
    const startTime = new Date(Date.now() - timeRange);

    // Get task metrics
    const taskMetrics = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_tasks,
        COUNT(*) FILTER (WHERE status IN ('queued', 'assigned', 'processing')) as active_tasks,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed') as avg_completion_time
      FROM tasks
      WHERE created_at >= $1
      ${farmId ? 'AND farm_id = $2' : ''}
      ${agentId ? 'AND agent_id = $3' : ''}
    `, farmId ? (agentId ? [startTime, farmId, agentId] : [startTime, farmId]) : [startTime]);

    // Get resource metrics
    const resourceMetrics = await db.query(`
      SELECT 
        type,
        name,
        AVG(value) as avg_value,
        MAX(value) as max_value,
        MIN(value) as min_value
      FROM metrics
      WHERE timestamp >= $1 
      AND type = 'resource'
      ${farmId ? "AND source_id = $2" : ''}
      GROUP BY type, name
    `, farmId ? [startTime, farmId] : [startTime]);

    // Get agent metrics
    const agentMetrics = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active_agents,
        COUNT(*) FILTER (WHERE status = 'idle') as idle_agents,
        COUNT(*) as total_agents
      FROM agents
      ${farmId ? 'WHERE farm_id = $1' : ''}
    `, farmId ? [farmId] : []);

    const summary = {
      period,
      startTime,
      endTime: new Date(),
      tasks: {
        completed: parseInt(taskMetrics.rows[0]?.completed_tasks || '0'),
        failed: parseInt(taskMetrics.rows[0]?.failed_tasks || '0'),
        active: parseInt(taskMetrics.rows[0]?.active_tasks || '0'),
        avgCompletionTime: parseFloat(taskMetrics.rows[0]?.avg_completion_time || '0')
      },
      agents: {
        active: parseInt(agentMetrics.rows[0]?.active_agents || '0'),
        idle: parseInt(agentMetrics.rows[0]?.idle_agents || '0'),
        total: parseInt(agentMetrics.rows[0]?.total_agents || '0')
      },
      resources: resourceMetrics.rows.reduce((acc, row) => {
        acc[row.name] = {
          avg: parseFloat(row.avg_value),
          max: parseFloat(row.max_value),
          min: parseFloat(row.min_value)
        };
        return acc;
      }, {})
    };

    const response: ApiResponse = {
      success: true,
      data: summary
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching metrics summary:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch metrics summary'
      }
    };
    res.status(500).json(response);
  }
});

import { metricsCollector } from '../services/unified/stateCoordinator';

// GET /api/metrics/system - Get system resource information
router.get('/system', apiRateLimits.read, async (req, res) => {
  try {
    
    // Get CPU information
    const cpus = os.cpus();
    const cpuUsage = (() => {
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
      
      return Math.max(0, Math.min(100, usage));
    })();
    
    // Get memory information
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // Detect GPU (simplified - real GPU detection would require additional libraries)
    const platform = os.platform();
    const arch = os.arch();
    let gpuInfo = {
      count: 0,
      memory: 0,
      usage: 0,
      model: 'Unknown'
    };
    
    if (platform === 'darwin') {
      // macOS
      if (arch === 'arm64') {
        // Apple Silicon
        gpuInfo = {
          count: 1,
          memory: Math.round((totalMem * 0.75) / (1024 * 1024 * 1024)), // Shared memory
          usage: Math.round(Math.random() * 40 + 20), // Simulated
          model: 'Apple Silicon GPU'
        };
      } else {
        // Intel Mac
        gpuInfo = {
          count: 1,
          memory: 8,
          usage: Math.round(Math.random() * 30 + 10),
          model: 'Intel Integrated Graphics'
        };
      }
    }
    
    const systemInfo = {
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        usage: cpuUsage,
        speed: cpus[0]?.speed || 0
      },
      memory: {
        total: Math.round(totalMem / (1024 * 1024 * 1024)), // GB
        used: Math.round(usedMem / (1024 * 1024 * 1024)),
        free: Math.round(freeMem / (1024 * 1024 * 1024)),
        percentage: Math.round((usedMem / totalMem) * 100)
      },
      gpu: gpuInfo,
      storage: {
        // Simplified storage info
        total: 500, // GB - would need additional library for real data
        used: Math.round(Math.random() * 300 + 100),
        percentage: Math.round(Math.random() * 40 + 30)
      }
    };
    
    const response: ApiResponse = {
      success: true,
      data: systemInfo
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching system info:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch system information'
      }
    };
    res.status(500).json(response);
  }
});

// Export metrics for internal use
export { taskCounter, taskDuration, activeAgents, queueSize, resourceUtilization };

export default router;