/**
 * Yield Detection API Endpoints
 *
 * Provides API access to yield detection functionality including
 * registration, retrieval, and statistics.
 */
import { Router } from 'express';
import { yieldDetectionService } from '../services/YieldDetectionService';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';

const router = Router();

/**
 * Register farm for yield detection
 * POST /api/yield/register
 */
router.post('/register', async (req, res) => {
  const { farmId, userPrompt, agentNames } = req.body;

  if (!farmId || !userPrompt) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: farmId and userPrompt'
    });
  }

  try {
    yieldDetectionService.registerFarm(
      farmId,
      userPrompt,
      agentNames || []
    );

    logger.info(LogCategory.API, `Registered farm ${farmId} for yield detection`);

    res.json({
      success: true,
      message: 'Farm registered for yield detection'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to register farm for yield detection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register farm'
    });
  }
});

/**
 * Get yield items for a farm (in-memory)
 * GET /api/yield/:farmId
 */
router.get('/:farmId', async (req, res) => {
  const { farmId } = req.params;

  try {
    // Get in-memory items
    const items = yieldDetectionService.getYieldItems(farmId);

    res.json({
      success: true,
      data: {
        items,
        totalCount: items.length
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get yield items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get yield items'
    });
  }
});

/**
 * Get yield items from database
 * GET /api/yield/:farmId/persisted
 */
router.get('/:farmId/persisted', async (req, res) => {
  const { farmId } = req.params;

  try {
    const result = await db.query(`
      SELECT
        id, harvest_id, farm_id, agent_id, agent_name,
        type, title, description, path, preview,
        metadata, correlation_data,
        created_at, updated_at
      FROM harvest_yield
      WHERE farm_id = $1
      ORDER BY created_at DESC
    `, [farmId]);

    res.json({
      success: true,
      data: {
        items: result.rows,
        totalCount: result.rowCount || 0
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get persisted yield items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get yield items from database'
    });
  }
});

/**
 * Get yield statistics for a farm
 * GET /api/yield/:farmId/stats
 */
router.get('/:farmId/stats', async (req, res) => {
  const { farmId } = req.params;

  try {
    // Get in-memory statistics
    const stats = yieldDetectionService.getYieldStatistics(farmId);

    // Also get database statistics
    const dbStatsResult = await db.query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(DISTINCT agent_id) as contributing_agents,
        COUNT(CASE WHEN type = 'code' THEN 1 END) as code_files,
        COUNT(CASE WHEN type = 'document' THEN 1 END) as documents,
        COUNT(CASE WHEN type = 'test-result' THEN 1 END) as test_results,
        AVG((metadata->>'relevanceScore')::numeric) as avg_relevance,
        MAX((metadata->>'relevanceScore')::numeric) as max_relevance,
        SUM((metadata->>'size')::bigint) as total_size_bytes,
        MAX(created_at) as last_item_created
      FROM harvest_yield
      WHERE farm_id = $1
    `, [farmId]);

    const dbStats = dbStatsResult.rows[0];

    res.json({
      success: true,
      data: {
        inMemory: stats,
        persisted: {
          totalItems: parseInt(dbStats.total_items) || 0,
          contributingAgents: parseInt(dbStats.contributing_agents) || 0,
          codeFiles: parseInt(dbStats.code_files) || 0,
          documents: parseInt(dbStats.documents) || 0,
          testResults: parseInt(dbStats.test_results) || 0,
          avgRelevance: parseFloat(dbStats.avg_relevance) || 0,
          maxRelevance: parseFloat(dbStats.max_relevance) || 0,
          totalSizeBytes: parseInt(dbStats.total_size_bytes) || 0,
          lastItemCreated: dbStats.last_item_created
        }
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get yield statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get yield statistics'
    });
  }
});

/**
 * Get high-quality yield items
 * GET /api/yield/:farmId/high-quality
 */
router.get('/:farmId/high-quality', async (req, res) => {
  const { farmId } = req.params;

  try {
    const result = await db.query(`
      SELECT
        hy.*,
        f.name as farm_name,
        h.name as harvest_name
      FROM harvest_yield hy
      LEFT JOIN farms f ON hy.farm_id = f.id
      LEFT JOIN harvests h ON hy.harvest_id = h.id
      WHERE hy.farm_id = $1
        AND (hy.metadata->>'quality')::text IN ('high', 'excellent')
        AND (hy.metadata->>'relevanceScore')::numeric > 0.7
      ORDER BY (hy.metadata->>'relevanceScore')::numeric DESC
    `, [farmId]);

    res.json({
      success: true,
      data: {
        items: result.rows,
        totalCount: result.rowCount || 0
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get high-quality yield items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get high-quality yield items'
    });
  }
});

/**
 * Link yield items to harvest
 * POST /api/yield/:farmId/link-harvest
 */
router.post('/:farmId/link-harvest', async (req, res) => {
  const { farmId } = req.params;
  const { harvestId } = req.body;

  if (!harvestId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: harvestId'
    });
  }

  try {
    await yieldDetectionService.linkYieldItemsToHarvest(farmId, harvestId);

    logger.info(LogCategory.API,
      `Linked yield items for farm ${farmId} to harvest ${harvestId}`);

    res.json({
      success: true,
      message: 'Yield items linked to harvest'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to link yield items to harvest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link yield items to harvest'
    });
  }
});

/**
 * Search yield items
 * POST /api/yield/search
 */
router.post('/search', async (req, res) => {
  const { query, type, minRelevance, quality, tags, limit = 50 } = req.body;

  try {
    let sqlQuery = `
      SELECT * FROM harvest_yield
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    // Add search conditions
    if (query) {
      paramCount++;
      sqlQuery += ` AND (
        title ILIKE $${paramCount} OR
        description ILIKE $${paramCount} OR
        path ILIKE $${paramCount}
      )`;
      params.push(`%${query}%`);
    }

    if (type) {
      paramCount++;
      sqlQuery += ` AND type = $${paramCount}`;
      params.push(type);
    }

    if (minRelevance !== undefined) {
      paramCount++;
      sqlQuery += ` AND (metadata->>'relevanceScore')::numeric >= $${paramCount}`;
      params.push(minRelevance);
    }

    if (quality) {
      paramCount++;
      sqlQuery += ` AND metadata->>'quality' = $${paramCount}`;
      params.push(quality);
    }

    if (tags && tags.length > 0) {
      paramCount++;
      sqlQuery += ` AND metadata->'tags' ?| $${paramCount}`;
      params.push(tags);
    }

    // Add ordering and limit
    sqlQuery += ` ORDER BY created_at DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await db.query(sqlQuery, params);

    res.json({
      success: true,
      data: {
        items: result.rows,
        totalCount: result.rowCount || 0
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to search yield items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search yield items'
    });
  }
});

/**
 * Cleanup yield data for a farm
 * DELETE /api/yield/:farmId
 */
router.delete('/:farmId', async (req, res) => {
  const { farmId } = req.params;

  try {
    // Clean up in-memory data
    yieldDetectionService.cleanupFarm(farmId);

    // Clean up database data
    await db.query('DELETE FROM harvest_yield WHERE farm_id = $1', [farmId]);

    logger.info(LogCategory.API, `Cleaned up yield data for farm ${farmId}`);

    res.json({
      success: true,
      message: 'Yield data cleaned up successfully'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to cleanup yield data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup yield data'
    });
  }
});

export default router;