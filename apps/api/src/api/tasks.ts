import { Router } from 'express';
import { ApiResponse, Task, PaginationQuery, FilterQuery } from '../types/api';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { quickTaskRateLimit } from '../middleware/rateLimiter';
import { db, redis } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { quickTaskService } from '../services/unified/quickTaskService';
import { taskQueueManager } from '../services/taskQueueManager';
import { orchestratorService } from '../services/unified/orchestratorService';
import { taskComplexityAnalyzer } from '../services/taskComplexityAnalyzer';
import { logger } from '../utils/logger';
import multer from 'multer';
import path from 'path';
import { fileManager } from '../services/fileManagerService';
import { MaiFarmError, ErrorCode } from '../types/errors';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5 // Maximum 5 files for quick tasks
  },
  fileFilter: (req, file, cb) => {
    // Accept common file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain', 'text/markdown', 'text/html', 'text/css',
      'application/json', 'application/pdf',
      'application/javascript', 'application/typescript',
      'text/javascript', 'text/x-python', 'text/x-java',
      'text/x-c', 'text/x-cpp', 'text/yaml'
    ];
    
    const allowedExtensions = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
      '.yaml', '.yml', '.json', '.md', '.txt', '.pdf'
    ];
    
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype || ext}`));
    }
  }
});

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
router.post('/quick', upload.array('files', 5), requirePermission(['tasks:create']), quickTaskRateLimit.middleware(), async (req, res) => {
  try {
    const { title, description, priority, timeout, metadata, mode, provider } = req.body;
    const uploadedFiles = req.files as Express.Multer.File[];

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

    const trimmedDescription = taskDescription.trim();
    if (trimmedDescription.length < 5) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Description must be at least 5 characters'
        }
      };
      return res.status(400).json(response);
    }

    // Default to Claude if no provider specified, or fall back to environment variable
    const selectedProvider = provider || process.env.AI_PROVIDER || 'claude';
    const userId = (req as any).user?.userId || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    // Process uploaded files if any
    let fileContext = '';
    const fileMetadata: any[] = [];
    
    if (uploadedFiles && uploadedFiles.length > 0) {
      console.log(`[QuickTask API] Processing ${uploadedFiles.length} uploaded files`);
      
      for (const file of uploadedFiles) {
        fileMetadata.push({
          name: file.originalname,
          size: file.size,
          type: file.mimetype
        });
        
        // For text-based files, extract content
        if (file.mimetype?.startsWith('text/') || 
            file.originalname.match(/\.(txt|md|js|ts|jsx|tsx|py|java|cpp|c|h|yaml|yml|json)$/i)) {
          try {
            const content = file.buffer.toString('utf-8');
            fileContext += `\n\nFile: ${file.originalname}\n${content.substring(0, 2000)}`; // Limit content to 2000 chars per file
          } catch (err) {
            console.warn(`[QuickTask API] Could not read file content for ${file.originalname}:`, err);
          }
        }
      }
      
      console.log('[QuickTask API] File metadata:', fileMetadata);
    }
    
    // Enhance description with file context
    const enhancedDescription = fileContext 
      ? `${trimmedDescription}\n\nContext from uploaded files:${fileContext}`
      : trimmedDescription;
    
    // Use the quickTaskService to properly create and launch the quick task
    console.log('[QuickTask API] Creating quick task with file context');
    
    // Add timeout protection to prevent hanging forever
    const QUICK_TASK_LAUNCH_TIMEOUT = 30000; // 30 seconds max for launch
    
    const quickTaskPromise = quickTaskService.createQuickTask({
      title: taskTitle,
      description: enhancedDescription,
      priority: priority || 'medium',
      timeout: timeout,
      metadata: {
        ...metadata,
        mode: mode,
        provider: selectedProvider,
        uploadedFiles: fileMetadata
      }
    }, userId);
    
    // Create timeout promise
    let launchTimeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      launchTimeoutHandle = setTimeout(() => {
        reject(new Error('Quick Task launch timed out after 30 seconds'));
      }, QUICK_TASK_LAUNCH_TIMEOUT);
    });
    
    // Race between quick task creation and timeout
    let result;
    try {
      result = await Promise.race([quickTaskPromise, timeoutPromise]);
      if (launchTimeoutHandle) {
        clearTimeout(launchTimeoutHandle);
      }
    } catch (launchError: any) {
      if (launchTimeoutHandle) {
        clearTimeout(launchTimeoutHandle);
      }

      if (launchError instanceof Error && launchError.message.includes('timed out')) {
        console.error('[QuickTask API] Launch timed out:', launchError);

        const response: ApiResponse = {
          success: false,
          error: {
            code: 'LAUNCH_TIMEOUT',
            message: 'Quick Task launch timed out. Please try again.',
            details: launchError.message
          }
        };
        return res.status(504).json(response); // 504 Gateway Timeout
      }

      throw launchError;
    }
    
    console.log('[QuickTask API] Quick task created successfully:', result);
    console.log('[QuickTask API] Result farmId:', result.farmId);
    console.log('[QuickTask API] Result harvestId:', result.harvestId);

    // Ensure farmId is present
    if (!result.farmId) {
      console.error('[QuickTask API] WARNING: No farmId in result!', result);
    }

    const response: ApiResponse = {
      success: true,
      data: result,
      farmId: result.farmId,  // Add farmId at top level for backwards compatibility
      harvestId: result.harvestId  // Add harvestId at top level for easy access
    };

    console.log('[QuickTask API] Sending response with farmId:', response.farmId);
    res.status(201).json(response);
  } catch (error: any) {
    console.error('[QuickTask API] CRITICAL ERROR:', error);
    console.error('[QuickTask API] Error message:', error?.message);
    console.error('[QuickTask API] Error stack:', error?.stack);
    console.error('[QuickTask API] Error name:', error?.name);
    console.error('[QuickTask API] Full error object:', JSON.stringify(error, null, 2));

    if (error instanceof MaiFarmError && error.code === ErrorCode.QUICK_TASK_FAILED) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.context
        }
      };
      return res.status(400).json(response);
    }

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error?.message || 'Unknown error occurred',
        details: error?.stack
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/tasks/:id/logs - Get task execution logs
router.get('/:id/logs', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;
    // Return empty logs for now since quickTaskService is removed
    const logs: string[] = [];

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

// POST /api/tasks/submit - Submit task through new queue system
router.post('/submit', requirePermission(['tasks:create']), apiRateLimits.write, async (req, res) => {
  try {
    const { farmId, prompt, context, priority } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Prompt is required',
          code: 'PROMPT_REQUIRED'
        }
      });
    }
    
    // If farmId is provided, submit to all agents in the farm
    if (farmId) {
      const taskIds = await orchestratorService.sendPromptToFarm(farmId, prompt, context);
      
      res.json({
        success: true,
        data: {
          taskIds,
          farmId,
          count: taskIds.length
        }
      });
    } else {
      // Submit single task to queue for any available agent
      const taskId = await taskQueueManager.submitTask({
        prompt,
        context,
        priority: priority || 0,
        farmId: context?.farmId,
        userId: (req as any).user?.id
      });
      
      res.json({
        success: true,
        data: {
          taskIds: [taskId],
          count: 1
        }
      });
    }
  } catch (error) {
    logger.error('Error submitting task:', error);
    res.status(500).json({
      success: false,
      error: {
        message: (error as Error).message || 'Failed to submit task',
        code: 'TASK_SUBMISSION_ERROR'
      }
    });
  }
});

// GET /api/tasks/:taskId/status - Get task status from queue manager
router.get('/:taskId/status', apiRateLimits.read, async (req, res) => {
  try {
    const { taskId } = req.params;
    const status = taskQueueManager.getTaskStatus(taskId);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Task not found',
          code: 'TASK_NOT_FOUND'
        }
      });
    }
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Error fetching task status:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch task status',
        code: 'STATUS_FETCH_ERROR'
      }
    });
  }
});

// GET /api/tasks/:taskId/result - Get task result from queue manager
router.get('/:taskId/result', apiRateLimits.read, async (req, res) => {
  try {
    const { taskId } = req.params;
    const result = taskQueueManager.getTaskResult(taskId);
    
    if (!result) {
      // Check if task exists but not completed
      const status = taskQueueManager.getTaskStatus(taskId);
      if (status) {
        return res.status(202).json({
          success: false,
          error: {
            message: 'Task not completed yet',
            code: 'TASK_IN_PROGRESS',
            status: status.status
          }
        });
      }
      
      return res.status(404).json({
        success: false,
        error: {
          message: 'Task not found',
          code: 'TASK_NOT_FOUND'
        }
      });
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error fetching task result:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch task result',
        code: 'RESULT_FETCH_ERROR'
      }
    });
  }
});

// GET /api/tasks/queue/stats - Get queue statistics
router.get('/queue/stats', apiRateLimits.read, async (req, res) => {
  try {
    const stats = taskQueueManager.getQueueStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching queue stats:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch queue statistics',
        code: 'QUEUE_STATS_ERROR'
      }
    });
  }
});

// POST /api/tasks/analyze-complexity - Analyze task complexity for auto-configuration
router.post('/analyze-complexity', async (req, res) => {
  try {
    const { prompt, description } = req.body;
    
    if (!prompt && !description) {
      return res.status(400).json({ 
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either prompt or description is required'
        }
      });
    }
    
    // Analyze the task complexity
    const analysis = taskComplexityAnalyzer.analyzeTask(
      prompt || '', 
      description || ''
    );
    
    // Get human-readable explanation
    const explanation = taskComplexityAnalyzer.getRecommendationExplanation(analysis);
    
    // Return the analysis with recommendations
    const response = {
      category: analysis.category,
      score: analysis.score,
      recommendedAgents: analysis.recommendedAgents,
      recommendedTimeout: analysis.recommendedTimeout,
      explanation,
      factors: analysis.factors
    };
    
    logger.info('[TaskAPI] Complexity analysis completed', {
      category: analysis.category,
      agents: analysis.recommendedAgents,
      timeout: analysis.recommendedTimeout
    });
    
    res.json(response);
  } catch (error) {
    logger.error('[TaskAPI] Error analyzing task complexity:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to analyze task complexity'
      }
    });
  }
});

export default router;
