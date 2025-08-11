import { Router } from 'express';
import { ApiResponse, Farm, PaginationQuery, FilterQuery } from '../types/api';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import { claudeCodeManager } from '../services/claudeCodeManager';
import { farmManager } from '../services/farmManager';
import { websocketManager } from '../websocket/websocketManager';
import { orchestratorService, launchFarmWithBarnIntegration } from '../services/OrchestratorService';
import { aiOrchestrator } from '../services/aiOrchestrator';
import { harvestService } from '../services/harvestService';
import { agentCleanupService } from '../services/agentCleanupService';
import { barnCatalogService } from '../services/barnCatalogService';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'farm-context');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 10 // Max 10 files
  }
});

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
    
    // Fetch agents for all farms
    const farmIds = result.rows.map(row => row.id);
    let agentsByFarm: { [key: string]: any[] } = {};
    
    if (farmIds.length > 0) {
      const agentsResult = await db.query(
        'SELECT farm_id, id, name, type, status, capabilities, resources, metrics, config, last_heartbeat, created_at, updated_at FROM agents WHERE farm_id = ANY($1)',
        [farmIds]
      );
      
      // Group agents by farm_id
      agentsResult.rows.forEach(agent => {
        if (!agentsByFarm[agent.farm_id]) {
          agentsByFarm[agent.farm_id] = [];
        }
        const resources = agent.resources || {};
        const metrics = agent.metrics || {};
        agentsByFarm[agent.farm_id].push({
          id: agent.id,
          name: agent.name || `Agent ${agent.id.slice(0, 8)}`,
          type: agent.type || 'custom',
          status: agent.status || 'idle',
          progress: 0, // Not stored in DB yet
          currentTask: undefined, // Not stored in DB yet
          memory: resources.memory || 0,
          cpu: resources.cpu || 0,
          lastActive: agent.last_heartbeat || agent.created_at,
          capabilities: agent.capabilities || [],
          performance: {
            cpuUsage: resources.cpu || 0,
            memoryUsage: resources.memory || 0,
            responseTime: metrics.avgResponseTime || 0,
            throughput: metrics.throughput || 0
          }
        });
      });
    }

    const response: ApiResponse<Farm[]> = {
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        agents: agentsByFarm[row.id] || [],
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
    const agentsResult = await db.query('SELECT id, name, type, status, capabilities, resources, metrics, config, last_heartbeat, created_at, updated_at FROM agents WHERE farm_id = $1', [id]);
    const agents = agentsResult.rows.map(agent => {
      const resources = agent.resources || {};
      const metrics = agent.metrics || {};
      return {
        id: agent.id,
        name: agent.name || `Agent ${agent.id.slice(0, 8)}`,
        type: agent.type || 'custom',
        status: agent.status || 'idle',
        progress: 0, // Not stored in DB yet
        currentTask: undefined, // Not stored in DB yet
        memory: resources.memory || 0,
        cpu: resources.cpu || 0,
        lastActive: agent.last_heartbeat || agent.created_at,
        capabilities: agent.capabilities || [],
        performance: {
          cpuUsage: resources.cpu || 0,
          memoryUsage: resources.memory || 0,
          responseTime: metrics.avgResponseTime || 0,
          throughput: metrics.throughput || 0
        }
      };
    });

    const farm: Farm = {
      id: farmRow.id,
      name: farmRow.name,
      description: farmRow.description,
      status: farmRow.status,
      agents: agents,
      config: farmRow.config,
      metrics: farmRow.metrics,
      tags: farmRow.tags || [],
      createdBy: farmRow.created_by,
      createdAt: farmRow.created_at,
      updatedAt: farmRow.updated_at
    };

    const response: ApiResponse<Farm> = {
      success: true,
      data: farm
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
router.post('/', 
  upload.array('files'), // Add multer middleware to handle files if present
  requirePermission(['farms:create']), 
  apiRateLimits.write, 
  async (req, res) => {
  const client = await db.connect();
  
  try {
    console.log('[DEBUG] Farm creation request received');
    console.log('[DEBUG] Request body:', req.body);
    console.log('[DEBUG] Request files:', req.files ? `${(req.files as any[]).length} files` : 'none');
    console.log('[DEBUG] Content-Type:', req.headers['content-type']);
    
    // Handle both JSON and multipart/form-data
    let farmData: any;
    let contextFiles: any[] = [];
    
    // Check if this is a multipart request with files
    if (req.files && Array.isArray(req.files)) {
      // Parse farm data from the multipart request
      if (!req.body.farmData) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Farm data is required when uploading files'
          }
        });
      }
      
      try {
        farmData = JSON.parse(req.body.farmData);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON in farmData field'
          }
        });
      }
      
      const files = req.files as Express.Multer.File[];
      
      // Process uploaded files
      contextFiles = files.map(file => ({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));
      
      console.log(`[Farms] Processing ${contextFiles.length} uploaded files`);
    } else {
      // Regular JSON request
      farmData = req.body;
    }
    
    const { name, description, config, tags = [], type = 'sequential', provider = 'claude' } = farmData;
    const userId = (req as any).user?.userId || 'dev-user';
    
    // contextFiles is already declared above, no need to redeclare

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
      if (config.maxAgents && (typeof config.maxAgents !== 'number' || config.maxAgents < 1 || config.maxAgents > 32)) {
        validationErrors.push('maxAgents must be a number between 1 and 32');
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
        maxAgents: config?.maxAgents || 8,
        autoScale: config?.autoScale || false,
        timeout: config?.timeout || 600, // 10 minutes default
        yaml: config?.yaml || ''
      },
      userId,
      createdBy: userId
    });

    // Store in database with transaction
    const id = farm.id;
    const defaultConfig = {
      maxAgents: config?.maxAgents || 8,
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
      attachedFiles: contextFiles,  // Add uploaded files to config
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
      [id, name.trim(), description?.trim() || '', 'launching', defaultConfig, defaultMetrics, tags, userId]
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

    // First, check if farm has a multi-claude process and stop it gracefully
    const farmResult = await client.query('SELECT config, name, status FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length > 0) {
      const { config, status } = farmResult.rows[0];
      
      // Only attempt graceful shutdown if farm is running
      if (status === 'running' || status === 'launching') {
        try {
          console.log(`[Farm DELETE] Attempting graceful shutdown before deletion for farm ${id}`);
          const userId = (req as any).user?.userId || 'dev-user';
          await farmManager.gracefulShutdownFarm(id, userId, 'user_request');
          console.log(`[Farm DELETE] Graceful shutdown completed for farm ${id}`);
        } catch (gracefulError) {
          console.warn(`[Farm DELETE] Graceful shutdown failed for farm ${id}, using regular stop:`, gracefulError);
          
          // Fallback to regular multi-claude stop
          const processId = config?.processId;
          if (processId) {
            try {
              await orchestratorService.stopFarm(processId);
              console.log(`[Farm DELETE] Stopped multi-claude process ${processId} for farm ${id}`);
            } catch (stopError) {
              console.error('Error stopping multi-claude process:', stopError);
              // Continue with deletion even if stopping fails
            }
          }
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
      try {
        await agentCleanupService.cleanupFarm(id, 'user_deleted');
        console.log(`Cleaned up agents and sessions for farm ${id}`);
      } catch (cleanupError) {
        console.error('Error cleaning up farm agents:', cleanupError);
        // Continue with deletion even if cleanup fails
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

    const farmData = farmResult.rows[0];
    
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

    // Update status to launching
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['launching', new Date(), id]
    );

    // Launch actual agents via orchestratorService
    try {
      // Prepare launch options
      const agentCount = farmData.agents?.length || 1;
      const prompt = farmData.config?.prompt || farmData.description || `Complete tasks for ${farmData.name}`;
      
      const launchOptions = {
        farmId: id,
        numberOfAgents: agentCount,
        prompt: prompt,
        description: farmData.description,
        collaborative: farmData.config?.collaborative || false,
        timeout: farmData.config?.timeout, // Pass timeout if configured
        provider: farmData.config?.provider || 'claude'
      };

      // Add attachment paths if they exist in the farm config
      if (farmData.config?.attachmentPaths && Array.isArray(farmData.config.attachmentPaths)) {
        launchOptions.contextFiles = farmData.config.attachmentPaths;
        console.log(`[Farm Start] Including ${farmData.config.attachmentPaths.length} attachments`);
      }
      
      console.log(`[Farm Start] Launching ${agentCount} agents for farm ${id}`);
      const processId = await orchestratorService.launchFarm(launchOptions);
      
      // Store processId in farm config
      const updatedConfig = { ...farmData.config, processId };
      await db.query(
        'UPDATE farms SET config = $1, status = $2, updated_at = $3 WHERE id = $4',
        [updatedConfig, 'running', new Date(), id]
      );

      console.log(`[Farm Start] Farm ${id} started with process ${processId}`);

      // Create a harvest for this farm
      const harvest = await harvestService.startHarvest(id, farmData.name, userId);
      console.log(`[Farm Start] Created harvest ${harvest.id} for farm ${id}`);

    } catch (launchError) {
      console.error(`[Farm Start] Failed to launch agents for farm ${id}:`, launchError);
      // Update status back to stopped on failure
      await db.query(
        'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
        ['stopped', new Date(), id]
      );
      throw launchError;
    }

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

// POST /api/farms/:id/launch - Launch farm using orchestrator.py
router.post('/:id/launch', requirePermission(['farms:control']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      numberOfAgents = 3, 
      collaborative = false, 
      bundleSteps,
      includeBarnCatalog = false,
      barnReferences = [],
      autoBarnDiscovery = false
    } = req.body;

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

    // Launch farm using orchestratorService
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
    
    const launchParams = {
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
      contextFiles: farm.config?.attachmentPaths || [],  // Include attachment paths
      harvestId,  // Pass harvest ID to the service
      includeBarnCatalog,
      barnReferences,
      autoBarnDiscovery
    };
    
    const processId = await orchestratorService.launchFarm(launchParams);

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

    // Check for tmux session after a short delay and update status
    setTimeout(async () => {
      const sessionName = `farm_${id.substring(0, 8)}`;
      const checkSession = spawn('tmux', ['has-session', '-t', sessionName]);
      
      checkSession.on('exit', async (code) => {
        if (code === 0) {
          // Session exists, update status to running
          await farmManager.updateFarmStatus(id, 'running');
          
          // Broadcast status update
          websocketManager.broadcast('farm:status', {
            farmId: id,
            status: 'running',
            timestamp: new Date()
          });
          
          console.log(`[Farm API] Farm ${id} tmux session detected, status updated to running`);
        }
      });
    }, 3000); // Wait 3 seconds for tmux session to be created

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

// POST /api/farms/:id/launch-with-barn - Launch farm with enhanced barn integration
router.post('/:id/launch-with-barn', requirePermission(['farms:control']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      numberOfAgents = 3, 
      collaborative = false, 
      bundleSteps,
      autoBarnDiscovery = true,
      barnSearchQuery,
      includeBarnCatalog = true,
      barnReferences = [],
      maxBarnItems = 5
    } = req.body;

    // Get farm details
    const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found'
        }
      });
    }

    const farm = farmResult.rows[0];
    const farmPrompt = req.body.prompt || 
                      farm.config?.prompt || 
                      farm.description || 
                      farm.config?.yaml || 
                      `Help me with tasks for ${farm.name}`;
    
    const provider = req.body.provider || farm.config?.provider || process.env.AI_PROVIDER || 'claude';
    
    // Create harvest
    let harvestId: string | undefined;
    try {
      const harvest = await harvestService.startHarvest(id, farm.name, req.userId || 'system');
      harvestId = harvest.id;
    } catch (harvestError) {
      console.error('Failed to create harvest for farm:', harvestError);
    }
    
    // Use enhanced launch with barn integration
    const launchParams = {
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
      contextFiles: farm.config?.attachmentPaths || [],  // Include attachment paths
      harvestId,
      autoBarnDiscovery,
      barnSearchQuery,
      includeBarnCatalog,
      barnReferences
    };
    
    const processId = await launchFarmWithBarnIntegration(launchParams);

    // Update farm with process ID
    await db.query(
      'UPDATE farms SET status = $1, config = $2, updated_at = $3 WHERE id = $4',
      ['launching', { ...farm.config, processId, harvestId, barnIntegrated: true }, new Date(), id]
    );
    
    await farmManager.updateFarmStatus(id, 'launching');
    
    // Broadcast events
    if (harvestId) {
      websocketManager.broadcast('harvest:started', {
        harvestId,
        farmId: id,
        farmName: farm.name,
        barnIntegrated: true,
        timestamp: new Date()
      });
    }
    
    websocketManager.broadcast('farm:launched', {
      farmId: id,
      farmName: farm.name,
      processId,
      harvestId,
      status: 'launching',
      numberOfAgents,
      barnIntegrated: true,
      sessionName: `farm-${id.substring(0, 8)}`,
      timestamp: new Date()
    });

    res.json({
      success: true,
      data: {
        farmId: id,
        processId,
        harvestId,
        status: 'launching',
        barnIntegration: {
          enabled: true,
          autoBarnDiscovery,
          includeBarnCatalog,
          referencesCount: barnReferences.length
        }
      },
      meta: {
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Error launching farm with barn integration:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to launch farm with barn integration'
      }
    });
  }
});

// POST /api/farms/:id/stop - Stop farm operations
router.post('/:id/stop', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || 'dev-user';

    // Check if graceful shutdown was requested (default to true)
    const { graceful = true } = req.body;
    
    let farm;
    if (graceful) {
      // Use graceful shutdown by default to collect yields
      console.log(`[Farm API] Using graceful shutdown for farm ${id}`);
      farm = await farmManager.gracefulShutdownFarm(id, userId, 'user_request');
    } else {
      // Use regular stop if explicitly requested
      console.log(`[Farm API] Using regular stop for farm ${id}`);
      farm = await farmManager.stopFarm(id, userId);
    }
    
    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found or not in a stoppable state'
        }
      };
      return res.status(404).json(response);
    }

    // Update database
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['stopped', new Date(), id]
    );

    // Check if farm has a processId and stop via orchestratorService
    const farmResult = await db.query('SELECT config FROM farms WHERE id = $1', [id]);
    if (farmResult.rows.length > 0 && farmResult.rows[0].config?.processId) {
      try {
        await orchestratorService.stopFarm(farmResult.rows[0].config.processId);
      } catch (error) {
        console.log(`[Farm Stop] Could not stop process ${farmResult.rows[0].config.processId}:`, error);
        // Continue even if process stop fails - farm is already marked as stopped
      }
    }

    // Also try to stop tmux session directly
    const tmuxSession = `farm_${id.substring(0, 8)}`;
    try {
      const { spawn } = await import('child_process');
      spawn('tmux', ['kill-session', '-t', tmuxSession]);
    } catch (error) {
      console.log(`[Farm Stop] Could not kill tmux session ${tmuxSession}:`, error);
    }

    // Emit WebSocket event
    websocketManager.broadcast('farm:stopped', {
      farm: {
        id: farm.id,
        name: farm.name,
        status: 'stopped'
      }
    });

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

// POST /api/farms/:id/graceful-shutdown - Gracefully shutdown farm with yield collection
router.post('/:id/graceful-shutdown', requirePermission(['farms:control']), apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'user_request' } = req.body;
    const userId = (req as any).user?.userId || 'dev-user';

    // Validate reason
    if (!['user_request', 'timeout', 'completion'].includes(reason)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid shutdown reason. Must be one of: user_request, timeout, completion'
        }
      };
      return res.status(400).json(response);
    }

    console.log(`[Farm API] Initiating graceful shutdown for farm ${id} (reason: ${reason})`);

    // Use graceful shutdown instead of regular stop
    const farm = await farmManager.gracefulShutdownFarm(id, userId, reason as 'timeout' | 'user_request' | 'completion');
    
    if (!farm) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found or not in a stoppable state'
        }
      };
      return res.status(404).json(response);
    }

    // Emit WebSocket event for graceful shutdown
    websocketManager.broadcast('farm:graceful_shutdown_initiated', {
      farm: {
        id: farm.id,
        name: farm.name,
        status: farm.status
      },
      reason,
      message: 'Collecting yields and preparing for harvest...'
    });

    const response: ApiResponse = {
      success: true,
      data: {
        farmId: id,
        status: farm.status,
        reason,
        message: 'Graceful shutdown initiated. Yields will be collected before termination.'
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error during graceful farm shutdown:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to initiate graceful shutdown'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/task-metrics - Get standardized task metrics for farm
router.get('/:id/task-metrics', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get standardized task metrics using tmux pane counting
    const metrics = await orchestratorService.getStandardizedTaskMetrics(id);
    
    if (!metrics) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Farm not found or not running'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        ...metrics,
        standard: {
          definition: '1 Agent = 1 tmux pane = 1 concurrent task execution context',
          architecture: 'Farm -> N Agents (tmux panes) -> M Tasks (sequential per agent)',
          calculation: 'Agent count determined by "tmux list-panes" command'
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting task metrics:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get task metrics'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/:id/health - Get farm health status
router.get('/:id/health', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify farm exists
    const farmResult = await db.query('SELECT id FROM farms WHERE id = $1', [id]);
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

    // Get health status from orchestratorService
    const healthStatus = await orchestratorService.getFarmHealth(id);
    
    if (!healthStatus) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NO_HEALTH_DATA',
          message: 'No health monitoring data available for this farm'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        sessionName: healthStatus.sessionName,
        exists: healthStatus.exists,
        status: healthStatus.status,
        paneCount: healthStatus.paneCount,
        responsivePanes: healthStatus.responsivePanes,
        zombiePanes: healthStatus.zombiePanes,
        uptime: healthStatus.uptime,
        lastHealthCheck: healthStatus.lastHealthCheck,
        issues: healthStatus.issues
      }
    };
    res.json(response);

  } catch (error) {
    console.error('Error getting farm health:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get farm health status'
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
    const terminalResult = await orchestratorService.getAgentTerminal(id, parseInt(agentId));
    
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
    await orchestratorService.sendCommandToAgent(processId, parseInt(agentId), command);

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

// GET /api/farms/:id/multi-claude/status - Get orchestrator process status
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
          message: 'No orchestrator process associated'
        }
      };
      return res.status(404).json(response);
    }

    // Get process status
    const status = orchestratorService.getFarmStatus(processId);

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
    console.error('Error getting orchestrator status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get orchestrator status'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/farms/system/health - Get overall system health
router.get('/system/health', apiRateLimits.read, async (req, res) => {
  try {
    // Import tmuxHealthManager - need to import here to avoid circular dependency
    const { tmuxHealthManager } = await import('../services/tmuxHealthManager');
    
    // Get comprehensive health summary
    const healthSummary = tmuxHealthManager.getHealthSummary();
    
    // Get list of all monitored sessions with detailed health
    const monitoredSessions = tmuxHealthManager.getMonitoredSessions();
    const sessionDetails = [];
    
    for (const sessionName of monitoredSessions) {
      const sessionHealth = tmuxHealthManager.getSessionHealth(sessionName);
      const agentHealth = tmuxHealthManager.getAgentHealth(sessionName);
      
      if (sessionHealth) {
        sessionDetails.push({
          sessionName,
          health: sessionHealth,
          agents: agentHealth ? Array.from(agentHealth.entries()).map(([id, health]) => ({
            agentId: id,
            paneId: health.paneId,
            status: health.status,
            isResponsive: health.isResponsive,
            lastResponseTime: health.lastResponseTime,
            consecutiveFailures: health.consecutiveFailures,
            lastHeartbeat: health.lastHeartbeat
          })) : []
        });
      }
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        summary: healthSummary,
        sessions: sessionDetails,
        timestamp: new Date()
      }
    };
    
    res.json(response);

  } catch (error) {
    console.error('Error getting system health:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get system health status'
      }
    };
    res.status(500).json(response);
  }
});

export default router;