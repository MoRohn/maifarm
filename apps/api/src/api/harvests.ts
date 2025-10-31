import { Router } from 'express';
import { ApiResponse, PaginationQuery } from '../types/api';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { Harvest, HarvestArtifact } from '../../src/types/barn';
import fs from 'fs/promises';
import path from 'path';
import { WebSocketManager } from '../websocket/websocketManager';
import { harvestService } from '../services/unified/harvestService';

const router = Router();

// Apply authentication to all harvest routes
router.use(authenticateToken);

// GET /api/harvests - List all harvests
router.get('/', apiRateLimits.read, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      type,
      category,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query as PaginationQuery & { type?: string; category?: string };

    const offset = (Number(page) - 1) * Number(limit);
    const userId = (req as any).user?.userId || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    // Try database first, then fall back to harvestService
    try {
      // Build query
      let query = 'SELECT * FROM harvests WHERE created_by = $1';
      const params: any[] = [userId];
      let paramIndex = 2;

      if (type) {
        query += ` AND type = $${paramIndex++}`;
        params.push(type);
      }

      if (category) {
        query += ` AND category = $${paramIndex++}`;
        params.push(category);
      }

      // Map camelCase to snake_case for database columns
      const columnMap: Record<string, string> = {
        'createdAt': 'created_at',
        'updatedAt': 'updated_at',
        'lastUsedAt': 'last_used_at',
        'useCount': 'use_count',
        'farmId': 'farm_id',
        'farmName': 'farm_name'
      };
      const dbColumn = columnMap[sortBy] || sortBy;

      // Add sorting and pagination
      query += ` ORDER BY ${dbColumn} ${order} LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      
      // Get total count
      const countResult = await db.query(
        'SELECT COUNT(*) FROM harvests WHERE created_by = $1',
        [userId]
      );
      const total = parseInt(countResult.rows[0].count);

      const harvests = result.rows.map(row => ({
        id: row.id,
        farmId: row.farm_id,
        farmName: row.farm_name,
        name: row.name,
        description: row.description,
        type: row.type,
        category: row.category,
        tags: row.tags || [],
        artifacts: row.artifacts || [],
        config: row.config || {},
        metadata: row.metadata || {},
        parentHarvestId: row.parent_harvest_id,
        version: row.version,
        status: row.status,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.last_used_at,
        useCount: row.use_count || 0
      }));

      const response: ApiResponse<Harvest[]> = {
        success: true,
        data: harvests,
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          timestamp: new Date()
        }
      };

      res.json(response);
    } catch (dbError) {
      // Database not available - fall back to harvestService
      console.log('[HarvestAPI] Database unavailable, using harvestService fallback');
      
      const inMemoryHarvests = harvestService.getAllHarvests(userId);
      let filteredHarvests = inMemoryHarvests;

      // Apply filters
      if (type) {
        filteredHarvests = filteredHarvests.filter(h => h.type === type);
      }
      if (category) {
        filteredHarvests = filteredHarvests.filter(h => h.category === category);
      }

      // Apply sorting
      filteredHarvests.sort((a, b) => {
        const aVal = a[sortBy] || 0;
        const bVal = b[sortBy] || 0;
        return order === 'desc' ? bVal - aVal : aVal - bVal;
      });

      // Apply pagination
      const total = filteredHarvests.length;
      const paginatedHarvests = filteredHarvests.slice(offset, offset + limit);

      const response: ApiResponse<Harvest[]> = {
        success: true,
        data: paginatedHarvests,
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          timestamp: new Date()
        }
      };

      res.json(response);
    }
  } catch (error) {
    console.error('Error fetching harvests:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch harvests'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/harvests/:id - Get specific harvest
router.get('/:id', apiRateLimits.read, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || 'a913e59f-3971-5f06-be81-afa2ef2fa862';
    
    console.log(`[HarvestAPI] Looking for harvest ${id} for user ${userId}`);
    
    // Validate ID format (should be UUID)
    if (!id || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Invalid harvest ID format'
        }
      };
      return res.status(400).json(response);
    }
    
    // Try database first, then fall back to harvestService
    try {
      // First try with user filter, then without (for dev/test environments)
      let result = await db.query(
        'SELECT * FROM harvests WHERE id = $1 AND created_by = $2',
        [id, userId]
      );
      
      // In development/test mode, also check without user filter
      if (result.rows.length === 0 && process.env.NODE_ENV !== 'production') {
        console.log(`[HarvestAPI] No harvest found for user ${userId}, checking without user filter (dev mode)`);
        result = await db.query(
          'SELECT * FROM harvests WHERE id = $1',
          [id]
        );
      }
      
      console.log(`[HarvestAPI] Database query returned ${result.rows.length} rows for harvest ${id}`);
      
      if (result.rows.length === 0) {
        console.log(`[HarvestAPI] Harvest ${id} not found in database, trying harvestService`);
        throw new Error('Not found in database');
      }

      const row = result.rows[0];
      console.log(`[HarvestAPI] Found harvest in DB: ${row.id} (${row.farm_name})`);
      
      // Convert database row to Harvest type format
      const harvest: Harvest = {
        id: row.id,
        farmId: row.farm_id,
        farmName: row.farm_name || row.name,
        status: row.status || 'completed',
        createdAt: new Date(row.created_at),
        completedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        summary: row.config?.summary || {
          description: row.description || '',
          totalFiles: 0,
          filesGenerated: 0,
          filesFailed: 0,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          duration: 0,
          efficiency: 0,
          fileCategories: {
            text: 0,
            code: 0,
            image: 0,
            data: 0,
            config: 0,
            other: 0
          }
        },
        results: row.metadata?.results || [],
        insights: row.metadata?.insights || [],
        yield: Array.isArray(row.yield) ? row.yield : [],
        quality: row.config?.quality || {
          completeness: 100,
          accuracy: 100,
          relevance: 100,
          overallScore: 100
        },
        tags: row.tags || [],
        exportFormats: ['json', 'markdown', 'pdf']
      };

      const response: ApiResponse<Harvest> = {
        success: true,
        data: harvest
      };

      res.json(response);
    } catch (dbError) {
      // Database not available or not found - fall back to harvestService
      console.log(`[HarvestAPI] Database lookup failed for ${id}, trying harvestService fallback`);
      
      const harvest = await harvestService.getHarvest(id, userId);
      
      if (!harvest) {
        console.log(`[HarvestAPI] Harvest ${id} not found in harvestService either`);
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Harvest not found'
          }
        };
        return res.status(404).json(response);
      }

      console.log(`[HarvestAPI] Found harvest in harvestService: ${harvest.id} (${harvest.farmName})`);
      const response: ApiResponse<Harvest> = {
        success: true,
        data: harvest
      };

      res.json(response);
    }
  } catch (error) {
    console.error('Error fetching harvest:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch harvest'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/harvests - Create new harvest
router.post('/', requirePermission(['harvests:create']), apiRateLimits.write, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const {
      farmId,
      farmName,
      name,
      description,
      type,
      category,
      tags = [],
      artifacts = [],
      config = {},
      metadata = {}
    } = req.body;

    if (!name || !type) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name and type are required'
        }
      };
      return res.status(400).json(response);
    }

    const id = uuidv4();
    const version = '1.0.0';

    const result = await db.query(
      `INSERT INTO harvests (
        id, farm_id, farm_name, name, description, type, category,
        tags, artifacts, config, metadata, version, status, created_by, use_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        id, farmId, farmName, name, description, type, category,
        tags, artifacts, config, metadata, version, 'saved', userId, 0
      ]
    );

    const row = result.rows[0];
    const harvest: Harvest = {
      id: row.id,
      farmId: row.farm_id,
      farmName: row.farm_name,
      name: row.name,
      description: row.description,
      type: row.type,
      category: row.category,
      tags: row.tags || [],
      artifacts: row.artifacts || [],
      config: row.config || {},
      metadata: row.metadata || {},
      parentHarvestId: row.parent_harvest_id,
      version: row.version,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
      useCount: row.use_count || 0
    };

    // Broadcast harvest creation
    WebSocketManager.broadcast('harvest:created', harvest);

    const response: ApiResponse<Harvest> = {
      success: true,
      data: harvest
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

// PUT /api/harvests/:id - Update harvest
router.put('/:id', requirePermission(['harvests:update']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const updates = req.body;

    // Build dynamic update query
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (['name', 'description', 'tags', 'config', 'metadata', 'status'].includes(key)) {
        updateFields.push(`${key} = $${paramIndex++}`);
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
    params.push(userId);

    const query = `
      UPDATE harvests 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramIndex} AND created_by = $${paramIndex + 1}
      RETURNING *
    `;
    
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Harvest not found'
        }
      };
      return res.status(404).json(response);
    }

    const row = result.rows[0];
    const harvest: Harvest = {
      id: row.id,
      farmId: row.farm_id,
      farmName: row.farm_name,
      name: row.name,
      description: row.description,
      type: row.type,
      category: row.category,
      tags: row.tags || [],
      artifacts: row.artifacts || [],
      config: row.config || {},
      metadata: row.metadata || {},
      parentHarvestId: row.parent_harvest_id,
      version: row.version,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
      useCount: row.use_count || 0
    };

    const response: ApiResponse<Harvest> = {
      success: true,
      data: harvest
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating harvest:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update harvest'
      }
    };
    res.status(500).json(response);
  }
});

// DELETE /api/harvests/:id - Delete harvest
router.delete('/:id', requirePermission(['harvests:delete']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const result = await db.query(
      'DELETE FROM harvests WHERE id = $1 AND created_by = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Harvest not found'
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
    console.error('Error deleting harvest:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete harvest'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/harvests/:id/archive - Archive harvest
router.post('/:id/archive', requirePermission(['harvests:update']), apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const result = await db.query(
      `UPDATE harvests 
       SET status = 'archived', updated_at = NOW() 
       WHERE id = $1 AND created_by = $2 
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Harvest not found'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { id: result.rows[0].id, status: 'archived' }
    };

    res.json(response);
  } catch (error) {
    console.error('Error archiving harvest:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to archive harvest'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/harvests/:id/use - Record harvest usage
router.post('/:id/use', apiRateLimits.write, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const result = await db.query(
      `UPDATE harvests 
       SET use_count = use_count + 1, last_used_at = NOW() 
       WHERE id = $1 AND created_by = $2 
       RETURNING id, use_count`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Harvest not found'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { 
        id: result.rows[0].id, 
        useCount: result.rows[0].use_count 
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error recording harvest use:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to record harvest use'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/barn/stats - Get barn statistics
router.get('/barn/stats', apiRateLimits.read, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;

    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total_harvests,
        COUNT(*) FILTER (WHERE type = 'app') as app_count,
        COUNT(*) FILTER (WHERE type = 'tool') as tool_count,
        COUNT(*) FILTER (WHERE type = 'script') as script_count,
        COUNT(*) FILTER (WHERE type = 'workflow') as workflow_count,
        SUM(COALESCE((metadata->>'totalSize')::int, 0)) as total_storage
      FROM harvests 
      WHERE created_by = $1 AND status != 'archived'
    `, [userId]);

    const mostUsedResult = await db.query(`
      SELECT id, name, use_count 
      FROM harvests 
      WHERE created_by = $1 AND status != 'archived'
      ORDER BY use_count DESC 
      LIMIT 5
    `, [userId]);

    const recentResult = await db.query(`
      SELECT * FROM harvests 
      WHERE created_by = $1 AND status != 'archived'
      ORDER BY created_at DESC 
      LIMIT 10
    `, [userId]);

    const stats = statsResult.rows[0];
    const response: ApiResponse = {
      success: true,
      data: {
        totalHarvests: parseInt(stats.total_harvests),
        harvestsByType: {
          app: parseInt(stats.app_count),
          tool: parseInt(stats.tool_count),
          script: parseInt(stats.script_count),
          workflow: parseInt(stats.workflow_count)
        },
        totalStorage: parseInt(stats.total_storage) || 0,
        mostUsedHarvests: mostUsedResult.rows.map(row => ({
          id: row.id,
          name: row.name,
          useCount: row.use_count
        })),
        recentHarvests: recentResult.rows
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching barn stats:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch barn statistics'
      }
    };
    res.status(500).json(response);
  }
});

export default router;