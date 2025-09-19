import { Router } from 'express';
import { ApiResponse, Agent, PaginationQuery, FilterQuery } from '../types/api';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { agentHandshakeService } from '../services/agentHandshakeService';
import { taskQueueManager } from '../services/taskQueueManager';
import { orchestratorService } from '../services/unified/orchestratorService';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication to all agent routes
router.use(authenticateToken);

// GET /api/agents - List all agents with filtering and pagination
router.get('/', apiRateLimits.read, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sort = 'created_at', 
      order = 'desc',
      status,
      farmId,
      type
    } = req.query as PaginationQuery & FilterQuery;

    const offset = (Number(page) - 1) * Number(limit);
    
    // Build query
    let query = 'SELECT * FROM agents WHERE 1=1';
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

    if (type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(type);
    }

    // Add sorting and pagination
    // Validate sort column to prevent SQL injection
    const validSortColumns = ['created_at', 'updated_at', 'name', 'status', 'type'];
    const sortColumn = validSortColumns.includes(sort as string) ? sort : 'created_at';
    query += ` ORDER BY ${sortColumn} ${order} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    // Get total count
    const countResult = await db.query('SELECT COUNT(*) FROM agents WHERE 1=1');
    const total = countResult.rows && countResult.rows[0] ? parseInt(countResult.rows[0].count || '0') : 0;

    const response: ApiResponse<Agent[]> = {
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        farmId: row.farm_id,
        name: row.name,
        type: row.type,
        status: row.status,
        capabilities: row.capabilities,
        resources: row.resources,
        metrics: row.metrics,
        config: row.config,
        lastHeartbeat: row.last_heartbeat,
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
    console.error('Error fetching agents:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch agents'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/agents/:id - Get specific agent details
router.get('/:id', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('SELECT * FROM agents WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Agent not found'
        }
      };
      return res.status(404).json(response);
    }

    const row = result.rows[0];
    const agent: Agent = {
      id: row.id,
      farmId: row.farm_id,
      name: row.name,
      type: row.type,
      status: row.status,
      capabilities: row.capabilities,
      resources: row.resources,
      metrics: row.metrics,
      config: row.config,
      lastHeartbeat: row.last_heartbeat,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const response: ApiResponse<Agent> = {
      success: true,
      data: agent
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching agent:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch agent'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/agents - Create new agent
router.post('/', requirePermission(['agents:create']), apiRateLimits.write, async (req, res) => {
  try {
    const { farmId, name, type = 'secondary', capabilities = [], resources, config = {} } = req.body;

    if (!farmId || !name) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Farm ID and name are required'
        }
      };
      return res.status(400).json(response);
    }

    // Validate that the farm exists
    const farmCheck = await db.query('SELECT id, status FROM farms WHERE id = $1', [farmId]);
    if (farmCheck.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Farm does not exist. Agents cannot be created without a valid farm.'
        }
      };
      return res.status(400).json(response);
    }

    // Check if farm is in a valid state to accept new agents
    const farmStatus = farmCheck.rows[0].status;
    if (farmStatus === 'completed' || farmStatus === 'failed' || farmStatus === 'stopping') {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: `Cannot add agents to a farm with status: ${farmStatus}`
        }
      };
      return res.status(400).json(response);
    }

    const id = uuidv4();
    const defaultResources = {
      cpu: 1,
      memory: 1024,
      ...resources
    };

    const defaultMetrics = {
      tasksCompleted: 0,
      tasksFailed: 0,
      averageExecutionTime: 0,
      uptime: 0,
      efficiency: 0
    };

    const result = await db.query(
      `INSERT INTO agents (id, farm_id, name, type, status, capabilities, resources, metrics, config, last_heartbeat)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, farmId, name, type, 'idle', capabilities, defaultResources, defaultMetrics, config, new Date()]
    );

    const row = result.rows[0];
    const agent: Agent = {
      id: row.id,
      farmId: row.farm_id,
      name: row.name,
      type: row.type,
      status: row.status,
      capabilities: row.capabilities,
      resources: row.resources,
      metrics: row.metrics,
      config: row.config,
      lastHeartbeat: row.last_heartbeat,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const response: ApiResponse<Agent> = {
      success: true,
      data: agent
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating agent:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create agent'
      }
    };
    res.status(500).json(response);
  }
});

// PUT /api/agents/:id - Update agent configuration
router.put('/:id', requirePermission(['agents:update']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (['name', 'type', 'status', 'capabilities', 'resources', 'config'].includes(key)) {
        const columnName = key === 'farmId' ? 'farm_id' : key;
        updateFields.push(`${columnName} = $${paramIndex++}`);
        params.push(value);
      }
    });

    if (updateFields.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No valid fields to update'
        }
      };
      return res.status(400).json(response);
    }

    updateFields.push(`updated_at = $${paramIndex++}`);
    params.push(new Date());
    params.push(id);

    const query = `UPDATE agents SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Agent not found'
        }
      };
      return res.status(404).json(response);
    }

    const row = result.rows[0];
    const agent: Agent = {
      id: row.id,
      farmId: row.farm_id,
      name: row.name,
      type: row.type,
      status: row.status,
      capabilities: row.capabilities,
      resources: row.resources,
      metrics: row.metrics,
      config: row.config,
      lastHeartbeat: row.last_heartbeat,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const response: ApiResponse<Agent> = {
      success: true,
      data: agent
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating agent:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update agent'
      }
    };
    res.status(500).json(response);
  }
});

// DELETE /api/agents/:id - Remove agent
router.delete('/:id', requirePermission(['agents:delete']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query('DELETE FROM agents WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Agent not found'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { id: result.rows[0].id }
    };

    res.json(response);
  } catch (error) {
    console.error('Error deleting agent:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete agent'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/agents/:id/heartbeat - Update agent heartbeat
router.post('/:id/heartbeat', apiRateLimits.standard, async (req, res) => {
  try {
    const { id } = req.params;
    const { metrics, status } = req.body;

    const result = await db.query(
      `UPDATE agents 
       SET last_heartbeat = $1, status = COALESCE($2, status), metrics = COALESCE($3, metrics), updated_at = $1
       WHERE id = $4
       RETURNING id, status, last_heartbeat`,
      [new Date(), status, metrics, id]
    );

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Agent not found'
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
    console.error('Error updating heartbeat:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update heartbeat'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/agents/connected - Get all connected agents (new agent wrapper system)
router.get('/connected', apiRateLimits.read, async (req, res) => {
  try {
    const agents = agentHandshakeService.getConnectedAgents();
    
    res.json({
      success: true,
      data: agents,
      count: agents.length
    });
  } catch (error) {
    logger.error('Error fetching connected agents:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch connected agents',
        code: 'AGENT_FETCH_ERROR'
      }
    });
  }
});

// GET /api/agents/handshake/:agentId - Get specific agent from handshake service
router.get('/handshake/:agentId', apiRateLimits.read, async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Handle undefined or invalid agent IDs
    if (!agentId || agentId === 'undefined' || agentId === 'null') {
      logger.warn(`Invalid agent ID provided to handshake endpoint: ${agentId}`);
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid agent ID provided',
          code: 'INVALID_AGENT_ID',
          details: `Received agent ID: ${agentId}`
        }
      });
    }
    
    const agent = agentHandshakeService.getAgent(agentId);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Agent not found in handshake service',
          code: 'AGENT_NOT_FOUND',
          agentId: agentId
        }
      });
    }
    
    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    logger.error('Error fetching agent from handshake:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch agent',
        code: 'AGENT_FETCH_ERROR'
      }
    });
  }
});

// POST /api/agents/:agentId/prompt - Send prompt to specific agent
router.post('/:agentId/prompt', requirePermission(['agents:write']), apiRateLimits.write, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { prompt, context } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Prompt is required',
          code: 'PROMPT_REQUIRED'
        }
      });
    }
    
    // Extract farm ID from agent ID (format: farmId_agent_index)
    const parts = agentId.split('_agent_');
    if (parts.length !== 2) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid agent ID format',
          code: 'INVALID_AGENT_ID'
        }
      });
    }
    
    const farmId = parts[0];
    const agentIndex = parseInt(parts[1]);
    
    const taskId = await orchestratorService.sendPromptToAgent(
      farmId,
      agentIndex,
      prompt,
      context
    );
    
    res.json({
      success: true,
      data: {
        taskId,
        agentId,
        status: 'submitted'
      }
    });
  } catch (error) {
    logger.error('Error sending prompt to agent:', error);
    res.status(500).json({
      success: false,
      error: {
        message: (error as Error).message || 'Failed to send prompt to agent',
        code: 'PROMPT_SEND_ERROR'
      }
    });
  }
});

// GET /api/agents/queue/stats - Get task queue statistics
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

export default router;