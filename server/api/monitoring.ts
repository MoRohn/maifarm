import { Router } from 'express';
import { ApiResponse } from '../types/api';
import { authenticateToken } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db, redis } from '../database/connection';
import { orchestrator } from '../orchestrator';
import os from 'os';

const router = Router();

// GET /api/monitoring/system - Get system resource usage
router.get('/system', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    const loadAverage = os.loadavg();
    const uptime = process.uptime();
    
    const systemInfo = {
      cpu: {
        usage: cpuUsage,
        cores: os.cpus().length,
        loadAverage: {
          '1m': loadAverage[0],
          '5m': loadAverage[1],
          '15m': loadAverage[2]
        }
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        process: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external
        }
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        version: os.version(),
        uptime: os.uptime()
      },
      process: {
        pid: process.pid,
        version: process.version,
        uptime: uptime
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

// GET /api/monitoring/database - Get database connection stats
router.get('/database', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    // PostgreSQL stats
    const pgStats = await db.query(`
      SELECT 
        numbackends as active_connections,
        xact_commit as transactions_committed,
        xact_rollback as transactions_rolled_back,
        blks_read as blocks_read,
        blks_hit as blocks_hit,
        tup_returned as tuples_returned,
        tup_fetched as tuples_fetched,
        tup_inserted as tuples_inserted,
        tup_updated as tuples_updated,
        tup_deleted as tuples_deleted
      FROM pg_stat_database 
      WHERE datname = current_database()
    `);

    // Table sizes
    const tableSizes = await db.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);

    // Redis info
    const redisInfo = await redis.info();
    const redisStats = {
      connected: redis.isOpen,
      memory: redisInfo.includes('used_memory:') ? 
        parseInt(redisInfo.match(/used_memory:(\d+)/)?.[1] || '0') : 0,
      connectedClients: redisInfo.includes('connected_clients:') ?
        parseInt(redisInfo.match(/connected_clients:(\d+)/)?.[1] || '0') : 0,
      totalCommands: redisInfo.includes('total_commands_processed:') ?
        parseInt(redisInfo.match(/total_commands_processed:(\d+)/)?.[1] || '0') : 0
    };

    const response: ApiResponse = {
      success: true,
      data: {
        postgres: {
          stats: pgStats.rows[0],
          tableSizes: tableSizes.rows
        },
        redis: redisStats
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching database stats:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch database statistics'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/monitoring/orchestrator - Get orchestrator status
router.get('/orchestrator', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const status = await orchestrator.getStatus();
    
    // Get recent task statistics
    const taskStats = await db.query(`
      SELECT 
        status,
        priority,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration
      FROM tasks
      WHERE created_at >= NOW() - INTERVAL '1 hour'
      GROUP BY status, priority
    `);

    // Get agent utilization
    const agentStats = await db.query(`
      SELECT 
        a.id,
        a.name,
        a.status,
        a.type,
        COUNT(t.id) as active_tasks,
        a.metrics->>'efficiency' as efficiency
      FROM agents a
      LEFT JOIN tasks t ON t.agent_id = a.id AND t.status = 'processing'
      GROUP BY a.id, a.name, a.status, a.type, a.metrics
    `);

    const response: ApiResponse = {
      success: true,
      data: {
        orchestrator: status,
        tasks: {
          recent: taskStats.rows,
          processing: status.activeExecutions
        },
        agents: {
          utilization: agentStats.rows,
          total: agentStats.rows.length,
          active: agentStats.rows.filter((a: any) => a.status === 'active').length
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching orchestrator status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch orchestrator status'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/monitoring/alerts - Get active alerts
router.get('/alerts', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const { severity, resolved = false } = req.query;

    let query = 'SELECT * FROM alerts WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (!resolved) {
      query += ` AND resolved_at IS NULL`;
    }

    if (severity) {
      query += ` AND severity = $${paramIndex++}`;
      params.push(severity);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const alerts = await db.query(query, params);

    const response: ApiResponse = {
      success: true,
      data: alerts.rows
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch alerts'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/monitoring/alerts/:id/acknowledge - Acknowledge an alert
router.post('/alerts/:id/acknowledge', authenticateToken, apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const result = await db.query(
      `UPDATE alerts 
       SET acknowledged_at = $1, acknowledged_by = $2
       WHERE id = $3 AND acknowledged_at IS NULL
       RETURNING *`,
      [new Date(), userId, id]
    );

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Alert not found or already acknowledged'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: result.rows[0]
    };

    res.json(response);
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to acknowledge alert'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/monitoring/logs - Get application logs
router.get('/logs', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const { 
      level, 
      source, 
      startTime = new Date(Date.now() - 3600000), 
      endTime = new Date(),
      limit = 100 
    } = req.query;

    let query = `
      SELECT * FROM application_logs 
      WHERE timestamp >= $1 AND timestamp <= $2
    `;
    const params: any[] = [startTime, endTime];
    let paramIndex = 3;

    if (level) {
      query += ` AND level = $${paramIndex++}`;
      params.push(level);
    }

    if (source) {
      query += ` AND source = $${paramIndex++}`;
      params.push(source);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const logs = await db.query(query, params);

    const response: ApiResponse = {
      success: true,
      data: logs.rows,
      meta: {
        total: logs.rows.length,
        timestamp: new Date()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching logs:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch logs'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/monitoring/performance - Get performance metrics
router.get('/performance', authenticateToken, apiRateLimits.read, async (req, res) => {
  try {
    const { period = '1h' } = req.query;

    // Calculate time range
    const periodMap: Record<string, string> = {
      '5m': '5 minutes',
      '15m': '15 minutes',
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days'
    };

    const interval = periodMap[period as string] || '1 hour';

    // API response times
    const apiMetrics = await db.query(`
      SELECT 
        endpoint,
        method,
        AVG(response_time) as avg_response_time,
        MIN(response_time) as min_response_time,
        MAX(response_time) as max_response_time,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time) as median,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) as p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time) as p99,
        COUNT(*) as request_count
      FROM api_metrics
      WHERE timestamp >= NOW() - INTERVAL '${interval}'
      GROUP BY endpoint, method
      ORDER BY request_count DESC
      LIMIT 20
    `);

    // Task processing times
    const taskMetrics = await db.query(`
      SELECT 
        type,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration,
        MIN(EXTRACT(EPOCH FROM (completed_at - started_at))) as min_duration,
        MAX(EXTRACT(EPOCH FROM (completed_at - started_at))) as max_duration,
        COUNT(*) as count
      FROM tasks
      WHERE completed_at IS NOT NULL 
        AND started_at IS NOT NULL
        AND completed_at >= NOW() - INTERVAL '${interval}'
      GROUP BY type
    `);

    const response: ApiResponse = {
      success: true,
      data: {
        api: apiMetrics.rows,
        tasks: taskMetrics.rows,
        period
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch performance metrics'
      }
    };
    res.status(500).json(response);
  }
});

export default router;