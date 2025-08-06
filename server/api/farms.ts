import { Router } from 'express';
import { ApiResponse, Farm, PaginationQuery, FilterQuery } from '../types/api';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { claudeCodeManager } from '../services/claudeCodeManager';
import { farmManager } from '../services/farmManager';
import { websocketManager } from '../websocket/websocketManager';
import { multiClaudeService } from '../services/multiClaudeService';
import { aiOrchestrator } from '../services/aiOrchestrator';
import { harvestService } from '../services/harvestService';

const router = Router();

// Apply authentication to all farm routes
router.use(authenticateToken);

// GET /api/farms - List all farms with filtering and pagination
router.get('/', apiRateLimits.read, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sort = 'createdAt', 
      order = 'desc',
      status,
      tags
    } = req.query as PaginationQuery & FilterQuery & { tags?: string };

    const offset = (Number(page) - 1) * Number(limit);
    
    // Build query
    let query = 'SELECT * FROM farms WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (tags) {
      const tagArray = tags.split(',');
      query += ` AND tags && $${paramIndex++}`;
      params.push(tagArray);
    }

    // Add sorting and pagination
    query += ` ORDER BY ${sort} ${order} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    // Get total count
    const countResult = await db.query('SELECT COUNT(*) FROM farms WHERE 1=1');
    const total = parseInt(countResult.rows[0].count);

    const response: ApiResponse<Farm[]> = {
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        agents: row.agents || [],
        config: row.config,
        metrics: row.metrics,
        tags: row.tags || [],
        createdBy: row.created_by,
        createdAt: row.created_at,
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
    console.error('Error fetching farms:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch farms'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id - Get specific farm details with agents
router.get('/:id', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get farm details
    const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const farmRow = farmResult.rows[0];
    
    // Get agents in this farm
    const agentsResult = await db.query('SELECT id, name, type, status FROM agents WHERE farm_id = $1', [id]);
    const agentIds = agentsResult.rows.map(a => a.id);

    const farm: Farm = {
      id: farmRow.id,
      name: farmRow.name,
      description: farmRow.description,
      status: farmRow.status,
      agents: agentIds,
      config: farmRow.config,
      metrics: farmRow.metrics,
      tags: farmRow.tags || [],
      createdBy: farmRow.created_by,
      createdAt: farmRow.created_at,
      updatedAt: farmRow.updated_at
    };

    const response: ApiResponse<{ farm: Farm; agents: any[] }> = {
      success: true,
      data: {
        farm,
        agents: agentsResult.rows
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms - Create new farm
router.post('/', requirePermission(['farms:create']), apiRateLimits.write, async (req, res) => {
  const client = await db.connect();
  
  try {
    const { name, description, config, tags = [], type = 'sequential', provider = 'claude' } = req.body;
    const userId = (req as any).user?.userId || 'dev-user';

    // Comprehensive validation
    const validationErrors: string[] = [];
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      validationErrors.push('Farm name is required and must be a non-empty string');
    }
    
    if (name && name.length > 100) {
      validationErrors.push('Farm name must be less than 100 characters');
    }
    
    if (description && typeof description !== 'string') {
      validationErrors.push('Description must be a string');
    }
    
    if (description && description.length > 500) {
      validationErrors.push('Description must be less than 500 characters');
    }
    
    const validTypes = ['sequential', 'collaborative', 'autonomous'];
    if (type && !validTypes.includes(type)) {
      validationErrors.push(`Type must be one of: ${validTypes.join(', ')}`);
    }
    
    const validProviders = ['claude', 'qwen'];
    if (provider && !validProviders.includes(provider)) {
      validationErrors.push(`Provider must be one of: ${validProviders.join(', ')}`);
    }
    
    if (config) {
      if (config.maxAgents && (typeof config.maxAgents !== 'number' || config.maxAgents < 1 || config.maxAgents > 20)) {
        validationErrors.push('maxAgents must be a number between 1 and 20');
      }
      
      if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 60 || config.timeout > 86400)) {
        validationErrors.push('timeout must be between 60 and 86400 seconds (1 minute to 24 hours)');
      }
      
      if (config.yaml && typeof config.yaml !== 'string') {
        validationErrors.push('YAML configuration must be a string');
      }
      
      // Validate YAML structure if provided
      if (config.yaml) {
        const yamlStr = config.yaml.toString();
        if (!yamlStr.includes('name:')) {
          validationErrors.push('YAML must contain a "name" field');
        }
        if (!yamlStr.includes('agents:')) {
          validationErrors.push('YAML must contain an "agents" field');
        }
      }
    }
    
    if (!Array.isArray(tags)) {
      validationErrors.push('Tags must be an array');
    }
    
    if (validationErrors.length > 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validationErrors.join('; ')
        }
      };
      return res.status(400).json(response);
    }
    
    // Start database transaction
    await client.query('BEGIN');

    // Use farmManager to create the farm
    const farm = await farmManager.createFarm({
      name: name.trim(),
      description: description?.trim() || '',
      type: type as 'sequential' | 'collaborative' | 'autonomous',
      provider: provider as 'claude' | 'qwen',
      config: {
        maxAgents: config?.maxAgents || 5,
        autoScale: config?.autoScale || false,
        timeout: config?.timeout || 3600,
        yaml: config?.yaml || ''
      },
      userId,
      createdBy: userId
    });

    // Store in database with transaction
    const id = farm.id;
    const defaultConfig = {
      maxAgents: config?.maxAgents || 5,
      resourceLimits: {
        totalCpu: 8,
        totalMemory: 16384
      },
      orchestrationStrategy: 'round-robin',
      autoScale: config?.autoScale || false,
      prompt: config?.prompt || description || `Complete tasks for ${name}`,
      timeout: config?.timeout || 3600,
      retryPolicy: config?.retryPolicy || {
        enabled: true,
        maxRetries: 3,
        backoffMultiplier: 2
      },
      goWildMode: config?.goWildMode || {
        enabled: false,
        creativityLevel: 3,
        boundaries: []
      },
      provider: provider as 'claude' | 'qwen',  // Store the AI provider
      ...config
    };

    const defaultMetrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      queuedTasks: 0,
      avgCompletionTime: 0,
      totalAgents: 0,
      activeAgents: 0,
      efficiency: 0,
      resourceUtilization: {
        cpu: 0,
        memory: 0
      },
      resourceUsage: {
        cpu: 0,
        memory: 0,
        network: 0
      },
      collaborationScore: 0
    };

    await client.query(
      `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET 
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         config = EXCLUDED.config,
         updated_at = CURRENT_TIMESTAMP`,
      [id, name.trim(), description?.trim() || '', 'active', defaultConfig, defaultMetrics, tags, userId]
    );
    
    // Commit transaction
    await client.query('COMMIT');

    // Emit WebSocket event for real-time updates
    websocketManager.broadcast('farm:created', {
      farm: {
        id: farm.id,
        name: farm.name,
        description: farm.description,
        status: 'active', // Ensure we broadcast the active status
        agents: farm.agents,
        config: defaultConfig,
        metrics: farm.metrics,
        tags: tags || [],
        createdBy: userId,
        createdAt: farm.createdAt,
        updatedAt: farm.updatedAt
      }
    });

    const response: ApiResponse<Farm> = {
      success: true,
      data: {
        id: farm.id,
        name: farm.name,
        description: farm.description,
        status: 'active', // Return active status to client
        agents: farm.agents.map(a => a.id),
        config: defaultConfig,
        metrics: farm.metrics,
        tags: tags || [],
        createdBy: userId,
        createdAt: farm.createdAt,
        updatedAt: farm.updatedAt
      }
    };

    res.status(201).json(response);
  } catch (error: any) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Error creating farm:', error);
    
    // More detailed error responses
    let errorCode = 'INTERNAL_ERROR';
    let errorMessage = 'Failed to create farm';
    let statusCode = 500;
    
    if (error.code === '23505') { // Unique constraint violation
      errorCode = 'DUPLICATE_ERROR';
      errorMessage = 'A farm with this name already exists';
      statusCode = 409;
    } else if (error.code === '23503') { // Foreign key violation
      errorCode = 'REFERENCE_ERROR';
      errorMessage = 'Invalid reference in farm configuration';
      statusCode = 400;
    } else if (error.message?.includes('farmManager')) {
      errorCode = 'FARM_MANAGER_ERROR';
      errorMessage = error.message;
      statusCode = 500;
    } else if (error.message) {
      errorMessage = `Failed to create farm: ${error.message}`;
    }
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    };
    res.status(statusCode).json(response);
  } finally {
    client.release();
  }
});

// PUT /api/farms/:id - Update farm configuration
router.put('/:id', requirePermission(['farms:update']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user?.userId || 'dev-user';

    // Update in farmManager
    const updatedFarm = await farmManager.updateFarm(id, userId, updates);
    
    if (!updatedFarm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    // Build dynamic update query for database
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (['name', 'description', 'status', 'config', 'tags'].includes(key)) {
        updateFields.push(`${key} = $${paramIndex++}`);
        params.push(value);
      }
    });

    if (updateFields.length > 0) {
      updateFields.push(`updated_at = $${paramIndex++}`);
      params.push(new Date());
      params.push(id);

      const query = `UPDATE farms SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`;
      await db.query(query, params);
    }

    // Get updated farm from database
    const result = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    const row = result.rows[0];

    // Emit WebSocket event
    websocketManager.broadcast('farm:updated', {
      farm: {
        id: row.id,
        name: row.name,
        description: row.description,
        status: updatedFarm.status,
        agents: updatedFarm.agents.map(a => a.id),
        config: row.config,
        metrics: updatedFarm.metrics,
        tags: row.tags || [],
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });

    const farm: Farm = {
      id: row.id,
      name: row.name,
      description: row.description,
      status: updatedFarm.status,
      agents: updatedFarm.agents.map(a => a.id),
      config: row.config,
      metrics: updatedFarm.metrics,
      tags: row.tags || [],
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const response: ApiResponse<Farm> = {
      success: true,
      data: farm
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update farm'
      }
    };
    res.status(500).json(response);
  }
});

// DELETE /api/farms/:id - Remove farm and all its agents
router.delete('/:id', requirePermission(['farms:delete']), apiRateLimits.write, async (req, res) => {
  const client = await db.connect();
  
  try {
    const { id } = req.params;

    // First, check if farm has a multi-claude process and stop it
    const farmResult = await client.query('SELECT config, name FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length > 0) {
      const processId = farmResult.rows[0].config?.processId;
      if (processId) {
        try {
          // Stop the multi-claude process
          await multiClaudeService.stopFarm(processId);
          console.log(`Stopped multi-claude process ${processId} for farm ${id}`);
        } catch (stopError) {
          console.error('Error stopping multi-claude process:', stopError);
          // Continue with deletion even if stopping fails
        }
      }
    }

    // Use farmManager to ensure proper cleanup
    const userId = (req as any).user?.userId || 'dev-user';
    const deleted = await farmManager.deleteFarm(id, userId);
    
    if (!deleted) {
      // If farmManager deletion failed, try direct database deletion
      await client.query('BEGIN');

      // Force cleanup using the cleanup service
      // TODO: Re-enable when agentCleanupService is available
      // const { agentCleanupService } = await import('../services/agentCleanupService');
      // await agentCleanupService.forceCleanupFarm(id);
      
      // For now, clean up tmux sessions manually
      try {
        const { spawn } = await import('child_process');
        // Kill tmux session for this farm if it exists
        const killSession = spawn('tmux', ['kill-session', '-t', `farm_${id}`]);
        await new Promise(resolve => killSession.on('exit', resolve));
        console.log(`Cleaned up tmux session for farm ${id}`);
      } catch (tmuxError) {
        console.error('Error cleaning up tmux session:', tmuxError);
        // Continue with deletion even if tmux cleanup fails
      }

      // Delete all agents in the farm first
      await client.query('DELETE FROM agents WHERE farm_id = $1', [id]);

      // Delete the farm
      const result = await client.query('DELETE FROM farms WHERE id = $1 RETURNING *', [id]);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Farm not found'
          }
        };
        return res.status(404).json(response);
      }

      await client.query('COMMIT');

      // Emit WebSocket event for real-time updates
      websocketManager.broadcast('farm:deleted', {
        farmId: id,
        farmName: result.rows[0].name
      });

      const response: ApiResponse = {
        success: true,
        data: { 
          id: result.rows[0].id,
          message: 'Farm and all associated agents have been deleted'
        }
      };

      res.json(response);
    } else {
      // farmManager.deleteFarm succeeded
      const response: ApiResponse = {
        success: true,
        data: { 
          id: id,
          message: 'Farm and all associated agents have been deleted'
        }
      };

      res.json(response);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete farm'
      }
    };
    res.status(500).json(response);
  } finally {
    client.release();
  }
});

// POST /api/farms/:id/claude-code - Create Claude Code agent farm
router.post('/:id/claude-code', requirePermission(['farms:control']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { prompt, steps, collaborative } = req.body;

    // Get farm details
    const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const farm = farmResult.rows[0];
    
    // Create Claude Code farm
    const claudeFarm = await claudeCodeManager.createFarm({
      name: farm.name,
      description: farm.description,
      agents: farm.config.maxAgents || 3,
      prompt: prompt || farm.config.yaml || 'Help with development tasks',
      steps,
      collaborative: collaborative || false,
      projectPath: process.cwd()
    });

    // Update farm status
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2, config = $3 WHERE id = $4',
      ['running', new Date(), { ...farm.config, claudeFarmId: claudeFarm.id }, id]
    );

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        claudeFarmId: claudeFarm.id,
        sessionName: claudeFarm.sessionName,
        status: claudeFarm.status
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error creating Claude Code farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create Claude Code farm'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/claude-code/status - Get Claude Code farm status
router.get('/:id/claude-code/status', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;

    // Get farm config
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const claudeFarmId = farmResult.rows[0].config?.claudeFarmId;
    if (!claudeFarmId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No Claude Code farm associated'
        }
      };
      return res.status(404).json(response);
    }

    const status = await claudeCodeManager.getFarmStatus(claudeFarmId);
    const coordination = await claudeCodeManager.getCoordinationStatus();

    const response: ApiResponse = {
      success: true,
      data: {
        ...status,
        coordination
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting Claude Code farm status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get Claude Code farm status'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/start - Start farm operations
router.post('/:id/start', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || 'dev-user';

    // Start farm using farmManager
    const farm = await farmManager.startFarm(id, userId);
    
    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm not found or not in a startable state'
        }
      };
      return res.status(400).json(response);
    }

    // Update database
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['running', new Date(), id]
    );

    // Emit WebSocket event
    websocketManager.broadcast('farm:started', {
      farm: {
        id: farm.id,
        name: farm.name,
        status: 'running',
        agents: farm.agents.map(a => ({ id: a.id, status: a.status }))
      }
    });

    const response: ApiResponse = {
      success: true,
      data: { id, status: 'running' }
    };

    res.json(response);
  } catch (error) {
    console.error('Error starting farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to start farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/pause - Pause farm operations
router.post('/:id/pause', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3 AND status = $4 RETURNING *',
      ['paused', new Date(), id, 'running']
    );

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm not found or not running'
        }
      };
      return res.status(400).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { id, status: 'paused' }
    };

    res.json(response);
  } catch (error) {
    console.error('Error pausing farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to pause farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/from-seed - Create farm from seed template
router.post('/from-seed', requirePermission(['farms:create']), apiRateLimits.write, async (req, res) => {
  try {
    const { seedId, name, description, config } = req.body;
    const userId = (req as any).user?.userId;

    if (!seedId || !name) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'seedId and name are required'
        }
      };
      return res.status(400).json(response);
    }

    // Get seed details
    const seedResult = await db.query(
      'SELECT * FROM seeds WHERE id = $1 AND (user_id = $2 OR is_public = true)',
      [seedId, userId]
    );

    if (seedResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Seed not found or unauthorized'
        }
      };
      return res.status(404).json(response);
    }

    const seed = seedResult.rows[0];
    const id = uuidv4();
    
    // Merge seed config with user-provided config
    const farmConfig = {
      maxAgents: config?.maxAgents || seed.config?.maxAgents || 5,
      resourceLimits: config?.resourceLimits || seed.config?.resourceLimits || {
        totalCpu: 8,
        totalMemory: 16384
      },
      orchestrationStrategy: config?.orchestrationStrategy || seed.config?.orchestrationStrategy || 'round-robin',
      yaml: seed.yaml,
      seedId: seedId,
      ...config
    };

    const defaultMetrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      queuedTasks: 0,
      efficiency: 0,
      resourceUtilization: {
        cpu: 0,
        memory: 0
      }
    };

    // Create farm from seed
    const farmResult = await db.query(
      `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_by, seed_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        name,
        description || `Farm created from seed: ${seed.name}`,
        'preparing',
        farmConfig,
        defaultMetrics,
        [...(seed.tags || []), 'from-seed'],
        userId,
        seedId
      ]
    );

    // Update seed usage statistics
    await db.query(
      `UPDATE seeds 
       SET usage_count = usage_count + 1, 
           last_used = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [seedId]
    );

    const row = farmResult.rows[0];
    const farm: Farm = {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      agents: [],
      config: row.config,
      metrics: row.metrics,
      tags: row.tags || [],
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const response: ApiResponse = {
      success: true,
      data: {
        farm,
        seed: {
          id: seed.id,
          name: seed.name,
          category: seed.category
        }
      }
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating farm from seed:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create farm from seed'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/harvest - Create harvest from completed farm
router.post('/:id/harvest', requirePermission(['farms:harvest']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || 'dev-user';
    
    // Get farm details
    const farm = await farmManager.getFarm(id, userId);
    
    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found or unauthorized'
        }
      };
      return res.status(404).json(response);
    }
    
    // Check if farm is completed or can be harvested
    if (farm.status !== 'completed' && farm.status !== 'running') {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm must be completed or running to create harvest'
        }
      };
      return res.status(400).json(response);
    }
    
    // Import harvest service
    const { harvestService } = await import('../services/harvestService');
    
    // Create harvest
    const harvest = await harvestService.startHarvest(farm.id, farm.name, userId);
    
    // If farm has outputs, add them to harvest
    if (farm.outputs || farm.results) {
      const outputs = farm.outputs || farm.results || [];
      for (const output of outputs) {
        harvest.results.push({
          id: uuidv4(),
          agentId: output.agentId || 'farm-agent',
          agentName: output.agentName || 'Farm Agent',
          agentType: 'worker',
          taskType: output.type || 'processing',
          content: JSON.stringify(output),
          metadata: output,
          timestamp: new Date(),
          processingTime: output.duration || 0,
          success: true
        });
      }
    }
    
    // Complete harvest if farm is already completed
    if (farm.status === 'completed') {
      await harvestService.completeHarvest(harvest.id);
      
      // Store in barn
      const { barnService } = await import('../services/barnService');
      await barnService.storeHarvest(harvest);
    }
    
    // Emit WebSocket event
    websocketManager.broadcast('harvest:created', {
      harvestId: harvest.id,
      farmId: farm.id,
      farmName: farm.name,
      status: harvest.status
    });
    
    const response: ApiResponse = {
      success: true,
      data: {
        harvest,
        message: harvest.status === 'ready' ? 
          'Harvest created and stored in barn' : 
          'Harvest collection started'
      }
    };
    
    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating harvest:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create harvest'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/complete - Mark farm as completed and create harvest
router.post('/:id/complete', requirePermission(['farms:control']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { outputs, summary } = req.body;
    const userId = (req as any).user?.userId || 'dev-user';
    
    // Update farm status
    const farm = await farmManager.updateFarmStatus(id, 'completed');
    
    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }
    
    // Update database
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['completed', new Date(), id]
    );
    
    // Create harvest automatically
    const { harvestService } = await import('../services/harvestService');
    const harvest = await harvestService.startHarvest(farm.id, farm.name, userId);
    
    // Add outputs to harvest if provided
    if (outputs) {
      for (const output of outputs) {
        harvest.results.push({
          id: uuidv4(),
          agentId: output.agentId || 'farm-agent',
          agentName: output.agentName || 'Farm Agent',
          agentType: 'worker',
          taskType: output.type || 'processing',
          content: JSON.stringify(output),
          metadata: output,
          timestamp: new Date(),
          processingTime: output.duration || 0,
          success: true
        });
      }
    }
    
    // Add summary if provided
    if (summary) {
      harvest.summary = { ...harvest.summary, ...summary };
    }
    
    // Complete the harvest
    await harvestService.completeHarvest(harvest.id);
    
    // Store in barn
    const { barnService } = await import('../services/barnService');
    const barnItem = await barnService.storeHarvest(harvest);
    
    // Emit WebSocket events
    websocketManager.broadcast('farm:completed', {
      farmId: farm.id,
      farmName: farm.name,
      status: 'completed',
      completedAt: new Date()
    });
    
    websocketManager.broadcast('harvest:completed', {
      harvestId: harvest.id,
      farmId: farm.id,
      summary: harvest.summary,
      quality: harvest.quality
    });
    
    const response: ApiResponse = {
      success: true,
      data: {
        farm: {
          id: farm.id,
          name: farm.name,
          status: 'completed'
        },
        harvest: {
          id: harvest.id,
          status: harvest.status
        },
        barnItem: {
          id: barnItem.id
        }
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error completing farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to complete farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/launch - Launch farm using multi_claude.py
router.post('/:id/launch', requirePermission(['farms:control']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { numberOfAgents = 3, collaborative = false, bundleSteps } = req.body;

    // Get farm details
    const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const farm = farmResult.rows[0];

    // Launch farm using multiClaudeService
    // Use prompt from request body, config, description, or default
    const farmPrompt = req.body.prompt || 
                      farm.config?.prompt || 
                      farm.description || 
                      farm.config?.yaml || 
                      `Help me with tasks for ${farm.name}`;
    
    // Get provider from farm config or request body
    const provider = req.body.provider || farm.config?.provider || process.env.AI_PROVIDER || 'claude';
    
    // First create the harvest, then pass its ID to the launch
    let harvestId: string | undefined;
    try {
      const harvest = await harvestService.startHarvest(id, farm.name, req.userId || 'system');
      harvestId = harvest.id;
      console.log(`[Farm Launch] Created harvest ${harvestId} for farm ${id}`);
    } catch (harvestError) {
      console.error('Failed to create harvest for farm:', harvestError);
    }
    
    const processId = await multiClaudeService.launchFarm({
      farmId: id,
      name: farm.name,
      description: farm.description,
      numberOfAgents,
      prompt: farmPrompt,
      yamlContent: farm.config.yaml,
      steps: farm.config.steps || req.body.steps,
      collaborative,
      bundleSteps,
      provider: provider as 'claude' | 'qwen',
      harvestId  // Pass harvest ID to the service
    } as any);

    // Update farm with process ID
    await db.query(
      'UPDATE farms SET status = $1, config = $2, updated_at = $3 WHERE id = $4',
      ['launching', { ...farm.config, processId }, new Date(), id]
    );
    
    // Update farmManager status
    await farmManager.updateFarmStatus(id, 'launching');
    
    // Update farm metadata with harvest ID if it was created
    if (harvestId) {
      await db.query(
        'UPDATE farms SET config = $1 WHERE id = $2',
        [{ ...farm.config, processId, harvestId }, id]
      );
      
      // Broadcast harvest started event
      websocketManager.broadcast('harvest:started', {
        harvestId,
        farmId: id,
        farmName: farm.name,
        timestamp: new Date()
      });
    }
    
    // Broadcast farm launched event
    websocketManager.broadcast('farm:launched', {
      farmId: id,
      farmName: farm.name,
      processId,
      harvestId,
      status: 'launching',
      numberOfAgents,
      sessionName: `farm_${id.substring(0, 8)}`,
      timestamp: new Date()
    });

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        processId,
        harvestId,
        status: 'launching',
        numberOfAgents
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error launching farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to launch farm'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/stop - Stop farm operations
router.post('/:id/stop', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;

    // Get farm with process ID
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const processId = farmResult.rows[0].config?.processId;
    if (!processId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm is not running'
        }
      };
      return res.status(400).json(response);
    }

    // Stop the farm
    await multiClaudeService.stopFarm(processId);

    // Update database
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['stopped', new Date(), id]
    );

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        status: 'stopped'
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error stopping farm:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to stop farm'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/terminal/:agentId - Get agent terminal output
router.get('/:id/terminal/:agentId', apiRateLimits.read, async (req, res) => {
  try {
    const { id, agentId } = req.params;

    // Get farm with process ID
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const processId = farmResult.rows[0].config?.processId;
    if (!processId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm is not running'
        }
      };
      return res.status(400).json(response);
    }

    // Get terminal output using farmId
    const terminalResult = await multiClaudeService.getAgentTerminal(id, parseInt(agentId));
    
    // Return the result directly if it failed
    if (!terminalResult.success) {
      return res.status(400).json(terminalResult);
    }

    const response: ApiResponse = terminalResult;

    res.json(response);
  } catch (error) {
    console.error('Error getting terminal:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get terminal output'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/farms/:id/terminal/:agentId/command - Send command to agent
router.post('/:id/terminal/:agentId/command', requirePermission(['farms:control']), apiRateLimits.write, async (req, res) => {
  try {
    const { id, agentId } = req.params;
    const { command } = req.body;

    if (!command) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Command is required'
        }
      };
      return res.status(400).json(response);
    }

    // Get farm with process ID
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const processId = farmResult.rows[0].config?.processId;
    if (!processId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Farm is not running'
        }
      };
      return res.status(400).json(response);
    }

    // Send command to agent
    await multiClaudeService.sendCommandToAgent(processId, parseInt(agentId), command);

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        agentId: parseInt(agentId),
        command,
        timestamp: new Date()
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error sending command:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to send command'
      }
    };
    res.status(500).json(response);
  }
});

// PUT /api/farms/:id/provider - Switch AI provider for a farm
router.put('/:id/provider', requirePermission(['farms:update']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { provider } = req.body;
    
    if (!provider || !['claude', 'qwen'].includes(provider)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Provider must be either "claude" or "qwen"'
        }
      };
      return res.status(400).json(response);
    }

    // Use AI orchestrator to switch provider
    await aiOrchestrator.switchFarmProvider(id, provider as 'claude' | 'qwen');
    
    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        provider,
        message: `Farm provider switched to ${provider}`
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error switching farm provider:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to switch provider'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/multi-claude/status - Get multi_claude process status
router.get('/:id/multi-claude/status', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;

    // Get farm with process ID
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      };
      return res.status(404).json(response);
    }

    const processId = farmResult.rows[0].config?.processId;
    
    // In development mode without a real process, return mock data
    if (!processId && (process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true')) {
      const response: ApiResponse = {
        success: true,
        data: {
          farmId: id,
          processId: null,
          status: 'idle',
          tmuxSession: null,
          agents: [],
          startTime: null,
          isRunning: false
        }
      };
      return res.json(response);
    }
    
    if (!processId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No multi_claude process associated'
        }
      };
      return res.status(404).json(response);
    }

    // Get process status
    const status = multiClaudeService.getFarmStatus(processId);

    const response: ApiResponse = {
      success: true,
      data: status ? {
        farmId: id,
        processId: status.id,
        status: status.status,
        tmuxSession: status.tmuxSession,
        agents: Array.from(status.agents.values()),
        startTime: status.startTime
      } : null
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting multi_claude status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get multi_claude status'
      }
    };
    res.status(500).json(response);
  }
});

export default router;