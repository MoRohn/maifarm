/**
 * API endpoints for Barn Yield Items
 * Provides access to individual yield items extracted from harvests
 */

import { Router, Request, Response } from 'express';
import { barnService } from '../services/unified/barnService';
import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';

const router = Router();

/**
 * GET /api/barn/yield
 * Get all yield items from barn with optional filtering
 */
router.get('/yield', async (req: Request, res: Response) => {
  try {
    const {
      farmId,
      harvestId,
      type,
      minQuality,
      tags,
      search,
      category,
      limit = '50',
      offset = '0'
    } = req.query;

    let yieldItems = await barnService.findAll({
      tags: ['yield'],
      userId: req.user?.id
    });

    // Apply filters
    if (farmId) {
      yieldItems = yieldItems.filter(item => item.metadata.farmId === farmId);
    }

    if (harvestId) {
      yieldItems = yieldItems.filter(item => item.metadata.harvestId === harvestId);
    }

    if (type) {
      yieldItems = yieldItems.filter(item => item.metadata.yieldType === type);
    }

    if (minQuality) {
      const minScore = parseFloat(minQuality as string);
      yieldItems = yieldItems.filter(item =>
        (item.metadata.qualityScore || 0) >= minScore
      );
    }

    if (tags) {
      const tagArray = (tags as string).split(',');
      yieldItems = yieldItems.filter(item =>
        tagArray.some(tag => item.metadata.tags?.includes(tag))
      );
    }

    if (search) {
      const searchLower = (search as string).toLowerCase();
      yieldItems = yieldItems.filter(item =>
        item.name.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower)
      );
    }

    if (category) {
      const catalog = await barnService.getCatalog();
      const categoryEntries = catalog.filter(e => e.category === category);
      const categoryItemIds = new Set(categoryEntries.map(e => e.barnItemId));

      yieldItems = yieldItems.filter(item => categoryItemIds.has(item.id));
    }

    // Apply pagination
    const limitNum = parseInt(limit as string);
    const offsetNum = parseInt(offset as string);
    const total = yieldItems.length;
    const paginatedItems = yieldItems.slice(offsetNum, offsetNum + limitNum);

    res.json({
      success: true,
      data: paginatedItems,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total
      }
    });
  } catch (error) {
    logger.error(LogCategory.BARN, 'Failed to get yield items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve yield items'
    });
  }
});

/**
 * GET /api/barn/yield/:yieldId
 * Get specific yield item by ID
 */
router.get('/yield/:yieldId', async (req: Request, res: Response) => {
  try {
    const { yieldId } = req.params;

    const yieldItem = await barnService.findById(yieldId);

    if (!yieldItem) {
      return res.status(404).json({
        success: false,
        error: 'Yield item not found'
      });
    }

    // Check if it's actually a yield item
    if (!yieldItem.metadata.yieldItemId) {
      return res.status(400).json({
        success: false,
        error: 'Item is not a yield item'
      });
    }

    res.json({
      success: true,
      data: yieldItem
    });
  } catch (error) {
    logger.error(LogCategory.BARN, 'Failed to get yield item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve yield item'
    });
  }
});

/**
 * GET /api/barn/yield/harvest/:harvestId
 * Get all yield items for a specific harvest
 */
router.get('/yield/harvest/:harvestId', async (req: Request, res: Response) => {
  try {
    const { harvestId } = req.params;

    // Get from harvest_yield table
    const result = await db.query(
      `SELECT * FROM harvest_yield WHERE harvest_id = $1 ORDER BY created_at DESC`,
      [harvestId]
    );

    // Also get corresponding barn items
    const barnItems = await barnService.findAll({
      userId: req.user?.id
    });

    const harvestYieldItems = barnItems.filter(
      item => item.metadata.harvestId === harvestId && item.metadata.yieldItemId
    );

    res.json({
      success: true,
      data: {
        yieldRecords: result.rows,
        barnItems: harvestYieldItems,
        summary: {
          totalYields: result.rows.length,
          totalBarnItems: harvestYieldItems.length,
          averageQuality: result.rows.length > 0
            ? result.rows.reduce((sum, r) => sum + parseFloat(r.quality_score || '0.5'), 0) / result.rows.length
            : 0,
          typeDistribution: result.rows.reduce((acc, row) => {
            acc[row.item_type] = (acc[row.item_type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        }
      }
    });
  } catch (error) {
    logger.error(LogCategory.BARN, 'Failed to get harvest yields:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve harvest yields'
    });
  }
});

/**
 * GET /api/barn/yield/farm/:farmId
 * Get all yield items for a specific farm (across all harvests)
 */
router.get('/yield/farm/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    const yieldItems = await barnService.findAll({
      tags: ['yield'],
      userId: req.user?.id
    });

    const farmYieldItems = yieldItems.filter(
      item => item.metadata.farmId === farmId
    );

    // Group by harvest
    const byHarvest = farmYieldItems.reduce((acc, item) => {
      const harvestId = item.metadata.harvestId;
      if (!acc[harvestId]) {
        acc[harvestId] = [];
      }
      acc[harvestId].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    res.json({
      success: true,
      data: {
        yieldItems: farmYieldItems,
        summary: {
          totalYields: farmYieldItems.length,
          harvestCount: Object.keys(byHarvest).length,
          averageQuality: farmYieldItems.reduce(
            (sum, item) => sum + (item.metadata.qualityScore || 0.5),
            0
          ) / (farmYieldItems.length || 1),
          typeDistribution: farmYieldItems.reduce((acc, item) => {
            const type = item.metadata.yieldType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          byHarvest
        }
      }
    });
  } catch (error) {
    logger.error(LogCategory.BARN, 'Failed to get farm yields:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve farm yields'
    });
  }
});

/**
 * GET /api/barn/yield/stats
 * Get yield statistics across all farms
 */
router.get('/yield/stats', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) as total_yields,
        COUNT(DISTINCT harvest_id) as total_harvests,
        COUNT(DISTINCT farm_id) as total_farms,
        AVG(quality_score) as avg_quality,
        jsonb_object_agg(item_type, type_count) as by_type
      FROM (
        SELECT
          item_type,
          COUNT(*) as type_count,
          quality_score,
          harvest_id,
          farm_id
        FROM harvest_yield
        GROUP BY item_type, quality_score, harvest_id, farm_id
      ) subquery
    `);

    // FIX: Handle case where query returns no rows
    const row = result.rows[0];
    if (!row) {
      return res.json({
        success: true,
        data: {
          totalYields: 0,
          totalHarvests: 0,
          totalFarms: 0,
          averageQuality: 0,
          distributionByType: {}
        }
      });
    }

    res.json({
      success: true,
      data: {
        totalYields: parseInt(row.total_yields || '0'),
        totalHarvests: parseInt(row.total_harvests || '0'),
        totalFarms: parseInt(row.total_farms || '0'),
        averageQuality: parseFloat(row.avg_quality || '0'),
        distributionByType: row.by_type || {}
      }
    });
  } catch (error) {
    logger.error(LogCategory.BARN, 'Failed to get yield stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve yield statistics'
    });
  }
});

/**
 * DELETE /api/barn/yield/:yieldId
 * Delete a yield item from barn
 */
router.delete('/yield/:yieldId', async (req: Request, res: Response) => {
  try {
    const { yieldId } = req.params;

    const yieldItem = await barnService.findById(yieldId);

    if (!yieldItem) {
      return res.status(404).json({
        success: false,
        error: 'Yield item not found'
      });
    }

    // Verify ownership
    if (yieldItem.userId !== req.user?.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to delete this yield item'
      });
    }

    await barnService.deleteItem(yieldId);

    res.json({
      success: true,
      message: 'Yield item deleted successfully'
    });
  } catch (error) {
    logger.error(LogCategory.BARN, 'Failed to delete yield item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete yield item'
    });
  }
});

export default router;
