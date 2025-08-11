import { Router } from 'express';
import { ApiResponse, Task, PaginationQuery, FilterQuery } from '../types/api';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db, redis } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { quickTaskService } from '../services/quickTaskService';

const router = Router();

// Apply authentication to all task routes
router.use(authenticateToken);

// GET /api/tasks - List all tasks with filtering and pagination
router.get('/', apiRateLimits.read, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sort = 'createdAt', 
      order = 'desc',
      status,
      farmId,
      agentId,
      priority
    } = req.query as PaginationQuery & FilterQuery & { priority?: string };

    const offset = (Number(page) - 1) * Number(limit);
    
    // Build query
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (farmId) {
      query += ` AND farm_id = $${paramIndex++}`;
      params.push(farmId);
    }

    if (agentId) {
      query += ` AND agent_id = $${paramIndex++}`;
      params.push(agentId);
    }

    if (priority) {
      query += ` AND priority = $${paramIndex++}`;
      params.push(priority);
    }

    // Add sorting and pagination
    query += ` ORDER BY ${sort} ${order} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM tasks WHERE 1=1';
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND status = $${countParamIndex++}`;
      countParams.push(status);
    }
    if (farmId) {
      countQuery += ` AND farm_id = $${countParamIndex++}`;
      countParams.push(farmId);
    }
    if (agentId) {
      countQuery += ` AND agent_id = $${countParamIndex++}`;
      countParams.push(agentId);
    }
    if (priority) {
      countQuery += ` AND priority = $${countParamIndex++}`;
      countParams.push(priority);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const response: ApiResponse<Task[]> = {
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        farmId: row.farm_id,
        agentId: row.agent_id,
        type: row.type,
        priority: row.priority,
        status: row.status,
        payload: row.payload,
        result: row.result,
        error: row.error,
        dependencies: row.dependencies || [],
        retries: row.retries,
        maxRetries: row.max_retries,
        timeout: row.timeout,
        metadata: row.metadata || {},
        createdAt: row.created_at,
        assignedAt: row.assigned_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        updatedAt: row.updated_at
      })),
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        timestamp: new Date()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch tasks'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/tasks/:id - Get specific task details
router.get('/:id', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found'
        }
      };
      return res.status(404).json(response);
    }

    const row = result.rows[0];
    const task: Task = {
      id: row.id,
      farmId: row.farm_id,
      agentId: row.agent_id,
      type: row.type,
      priority: row.priority,
      status: row.status,
      payload: row.payload,
      result: row.result,
      error: row.error,
      dependencies: row.dependencies || [],
      retries: row.retries,
      maxRetries: row.max_retries,
      timeout: row.timeout,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      assignedAt: row.assigned_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at
    };

    const response: ApiResponse<Task> = {
      success: true,
      data: task
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching task:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch task'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/tasks - Submit task to queue
router.post('/', requirePermission(['tasks:create']), apiRateLimits.write, async (req, res) => {
  try {
    const { 
      farmId, 
      type, 
      priority = 'medium', 
      payload = {}, 
      dependencies = [],
      maxRetries = 3,
      timeout = 300000, // 5 minutes default
      metadata = {}
    } = req.body;

    if (!farmId || !type) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Farm ID and task type are required'
        }
      };
      return res.status(400).json(response);
    }

    // Validate dependencies exist
    if (dependencies.length > 0) {
      const depResult = await db.query(
        'SELECT COUNT(*) FROM tasks WHERE id = ANY($1::text[])',
        [dependencies]
      );
      
      if (parseInt(depResult.rows[0].count) !== dependencies.length) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'One or more task dependencies not found'
          }
        };
        return res.status(400).json(response);
      }
    }

    const id = uuidv4();
    
    const result = await db.query(
      `INSERT INTO tasks (id, farm_id, type, priority, status, payload, dependencies, retries, max_retries, timeout, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, farmId, type, priority, 'queued', payload, dependencies, 0, maxRetries, timeout, metadata]
    );

    const row = result.rows[0];
    const task: Task = {
      id: row.id,
      farmId: row.farm_id,
      agentId: row.agent_id,
      type: row.type,
      priority: row.priority,
      status: row.status,
      payload: row.payload,
      result: row.result,
      error: row.error,
      dependencies: row.dependencies || [],
      retries: row.retries,
      maxRetries: row.max_retries,
      timeout: row.timeout,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      assignedAt: row.assigned_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at
    };

    // Add to Redis queue for processing (with fallback)
    try {
      if (redis.isReady) {
        await redis.zAdd(`task_queue:${priority}`, {
          score: Date.now(),
          value: JSON.stringify({ id, farmId, type })
        });
      }
    } catch (redisError) {
      console.warn('Failed to add task to Redis queue:', redisError.message);
      // Task is still in database, can be processed later
    }

    const response: ApiResponse<Task> = {
      success: true,
      data: task
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating task:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create task'
      }
    };
    res.status(500).json(response);
  }
});

// PUT /api/tasks/:id/cancel - Cancel a task
router.put('/:id/cancel', requirePermission(['tasks:cancel']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE tasks 
       SET status = 'cancelled', updated_at = $1 
       WHERE id = $2 AND status IN ('queued', 'assigned')
       RETURNING *`,
      [new Date(), id]
    );

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Task not found or cannot be cancelled'
        }
      };
      return res.status(400).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { id, status: 'cancelled' }
    };

    res.json(response);
  } catch (error) {
    console.error('Error cancelling task:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cancel task'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/tasks/:id/retry - Retry a failed task
router.post('/:id/retry', requirePermission(['tasks:retry']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE tasks 
       SET status = 'queued', retries = retries + 1, error = NULL, updated_at = $1 
       WHERE id = $2 AND status = 'failed' AND retries < max_retries
       RETURNING *`,
      [new Date(), id]
    );

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Task not found, not failed, or exceeded retry limit'
        }
      };
      return res.status(400).json(response);
    }

    const row = result.rows[0];
    
    // Re-add to Redis queue if available
    if (redis && redis.isReady) {
      await redis.zAdd(`task_queue:${row.priority}`, {
        score: Date.now(),
        value: JSON.stringify({ id: row.id, farmId: row.farm_id, type: row.type })
      });
    }

    const response: ApiResponse = {
      success: true,
      data: { id, status: 'queued', retries: row.retries }
    };

    res.json(response);
  } catch (error) {
    console.error('Error retrying task:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retry task'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/tasks/quick - Create a quick task
router.post('/quick', requirePermission(['tasks:create']), apiRateLimits.write, async (req, res) => {
  try {
    const { title, description, priority, timeout, metadata, mode, provider } = req.body;

    // Support both title/description and just description with mode
    const taskTitle = title || (description ? `Quick Task: ${description.substring(0, 50)}` : null);
    const taskDescription = description;

    if (!taskDescription) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Description is required'
        }
      };
      return res.status(400).json(response);
    }

    // Default to Claude if no provider specified, or fall back to environment variable
    const selectedProvider = provider || process.env.AI_PROVIDER || 'claude';

    const userId = (req as any).user?.userId || 'default-user';
    const result = await quickTaskService.createQuickTask({
      title: taskTitle,
      description: taskDescription,
      priority: priority || (mode === 'fast' ? 'high' : 'medium'),
      timeout,
      metadata: { 
        ...metadata, 
        mode,
        provider: selectedProvider
      }
    }, userId);

    const response: ApiResponse = {
      success: true,
      data: result
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating quick task:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create quick task'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/tasks/:id/logs - Get task execution logs
router.get('/:id/logs', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await quickTaskService.getTaskLogs(id);

    const response: ApiResponse = {
      success: true,
      data: logs
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching task logs:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch task logs'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/tasks/queue/stats - Get queue statistics
router.get('/queue/stats', apiRateLimits.read, async (req, res) => {
  try {
    // Get task counts by status
    const statusResult = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM tasks 
      GROUP BY status
    `);

    // Get task counts by priority
    const priorityResult = await db.query(`
      SELECT priority, COUNT(*) as count 
      FROM tasks 
      WHERE status IN ('queued', 'assigned', 'processing')
      GROUP BY priority
    `);

    // Get average completion time
    const avgTimeResult = await db.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
      FROM tasks 
      WHERE status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
    `);

    // Get queue sizes from Redis (if available)
    let criticalQueueSize = 0, highQueueSize = 0, mediumQueueSize = 0, lowQueueSize = 0;
    
    if (redis && redis.isReady) {
      criticalQueueSize = await redis.zCard('task_queue:critical');
      highQueueSize = await redis.zCard('task_queue:high');
      mediumQueueSize = await redis.zCard('task_queue:medium');
      lowQueueSize = await redis.zCard('task_queue:low');
    }

    const stats = {
      byStatus: statusResult.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {}),
      byPriority: priorityResult.rows.reduce((acc, row) => {
        acc[row.priority] = parseInt(row.count);
        return acc;
      }, {}),
      queueSizes: {
        critical: criticalQueueSize,
        high: highQueueSize,
        medium: mediumQueueSize,
        low: lowQueueSize
      },
      averageCompletionTime: parseFloat(avgTimeResult.rows[0]?.avg_seconds || '0'),
      timestamp: new Date()
    };

    const response: ApiResponse = {
      success: true,
      data: stats
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch queue statistics'
      }
    };
    res.status(500).json(response);
  }
});

export default router;