import { Router } from 'express';
import { harvestService } from '../services/harvestService';
import { harvestAggregationService } from '../services/harvestAggregationService';
import { harvestComparisonService } from '../services/harvestComparisonService';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { coordinationService } from '../services/coordinationService';

const router = Router();

// Collect harvest from a running farm
router.post('/collect/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;
    const { includeMetrics = true, includeArtifacts = true, includeLogs = false } = req.body;

    logger.info(`Starting harvest collection for farm ${farmId}`);

    // Get active agents for this farm
    const agents = coordinationService.getActiveAgents();
    const farmAgents = agents.filter(agent => agent.farmId === farmId);

    if (farmAgents.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active agents found for this farm'
      });
    }

    // Collect completed work from agents
    const completedWork = await coordinationService.collectCompletedWork();
    const farmWork = completedWork.filter(work => work.farmId === farmId);

    // Aggregate harvest data
    const aggregatedData = await harvestAggregationService.aggregate({
      farmId,
      agents: farmAgents,
      completedWork: farmWork,
      includeMetrics,
      includeArtifacts,
      includeLogs
    });

    // Create harvest with aggregated data
    const harvest = await harvestService.createHarvest({
      farmId,
      farmName: req.body.farmName || `Farm ${farmId}`,
      userId: req.body.userId || 'system',
      description: `Harvest collected from ${farmAgents.length} agents`,
      tags: ['collected', 'multi-agent']
    });

    // Add aggregated results to harvest
    for (const result of aggregatedData.results) {
      harvest.results.push({
        id: result.id,
        agentId: result.agentId,
        agentName: result.agentName,
        agentType: result.agentType || 'worker',
        taskType: result.taskType || 'processing',
        content: JSON.stringify(result.content),
        metadata: result.metadata || {},
        timestamp: new Date(result.timestamp),
        processingTime: result.processingTime || 0,
        success: result.success !== false,
        error: result.error
      });
    }

    // Add insights from aggregation
    for (const insight of aggregatedData.insights) {
      harvest.insights.push({
        id: insight.id,
        type: insight.type || 'discovery',
        title: insight.title,
        description: insight.description,
        importance: insight.importance || 'medium',
        source: insight.source || {},
        relatedResults: insight.relatedResults || [],
        timestamp: new Date(insight.timestamp || Date.now())
      });
    }

    // Add artifacts if included
    if (includeArtifacts && aggregatedData.artifacts) {
      for (const artifact of aggregatedData.artifacts) {
        harvest.artifacts.push({
          id: artifact.id,
          type: artifact.type || 'file',
          name: artifact.name,
          description: artifact.description || '',
          mimeType: artifact.mimeType || 'application/octet-stream',
          size: artifact.size || 0,
          location: artifact.location,
          checksum: artifact.checksum || '',
          createdBy: artifact.createdBy || { agentId: 'system', agentName: 'System' },
          createdAt: new Date(artifact.createdAt || Date.now()),
          metadata: artifact.metadata || {}
        });
      }
    }

    // Calculate quality metrics
    harvest.quality = await harvestAggregationService.calculateQuality(harvest);

    // Update summary
    harvest.summary = {
      description: aggregatedData.summary?.description || harvest.summary.description,
      totalTasks: aggregatedData.summary?.totalTasks || harvest.results.length,
      completedTasks: aggregatedData.summary?.completedTasks || harvest.results.filter(r => r.success).length,
      failedTasks: aggregatedData.summary?.failedTasks || harvest.results.filter(r => !r.success).length,
      duration: aggregatedData.summary?.duration || Math.floor((Date.now() - harvest.createdAt.getTime()) / 1000),
      efficiency: 0,
      agents: farmAgents
    };

    harvest.summary.efficiency = harvest.summary.totalTasks > 0 
      ? (harvest.summary.completedTasks / harvest.summary.totalTasks) * 100 
      : 0;

    // Mark harvest as ready
    harvest.status = 'ready';
    harvest.completedAt = new Date();

    // Save updated harvest
    await harvestService.updateHarvest(harvest);

    // Broadcast harvest ready event
    websocketManager.broadcast('harvest:collected', {
      harvestId: harvest.id,
      farmId,
      summary: harvest.summary,
      quality: harvest.quality
    });

    logger.info(`Harvest collection completed for farm ${farmId}: ${harvest.id}`);

    res.status(201).json({
      success: true,
      data: harvest
    });
  } catch (error) {
    logger.error('Failed to collect harvest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to collect harvest'
    });
  }
});

// Compare multiple harvests
router.post('/compare', async (req, res) => {
  try {
    const { harvestIds, metrics = ['quality', 'efficiency', 'completeness'] } = req.body;

    if (!harvestIds || harvestIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least two harvest IDs are required for comparison'
      });
    }

    const comparison = await harvestComparisonService.compare(harvestIds, metrics);

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    logger.error('Failed to compare harvests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare harvests'
    });
  }
});

// Get harvest analytics
router.get('/:id/analytics', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, groupBy = 'hour' } = req.query;

    const analytics = await harvestAggregationService.getAnalytics(id, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      groupBy: groupBy as 'hour' | 'day' | 'week'
    });

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Failed to get harvest analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get harvest analytics'
    });
  }
});

// Get harvest history for a farm
router.get('/farm/:farmId/history', async (req, res) => {
  try {
    const { farmId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    const history = await harvestService.findAll({
      farmId,
      status: ['ready', 'archived']
    });

    // Sort by date and paginate
    const sorted = history.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const paginated = sorted.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      data: {
        harvests: paginated,
        total: history.length,
        limit: Number(limit),
        offset: Number(offset)
      }
    });
  } catch (error) {
    logger.error('Failed to get harvest history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get harvest history'
    });
  }
});

// Archive a harvest
router.put('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    
    const harvest = await harvestService.findById(id);
    if (!harvest) {
      return res.status(404).json({
        success: false,
        error: 'Harvest not found'
      });
    }

    harvest.status = 'archived';
    await harvestService.updateHarvest(harvest);

    res.json({
      success: true,
      message: 'Harvest archived successfully'
    });
  } catch (error) {
    logger.error('Failed to archive harvest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to archive harvest'
    });
  }
});

// Clone harvest as template
router.post('/:id/clone', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const original = await harvestService.findById(id);
    if (!original) {
      return res.status(404).json({
        success: false,
        error: 'Harvest not found'
      });
    }

    // Create new harvest based on original
    const cloned = await harvestService.createHarvest({
      farmId: original.farmId,
      farmName: name || `${original.farmName} (Clone)`,
      userId: req.body.userId || 'system',
      description: description || `Cloned from harvest ${id}`,
      tags: [...original.tags, 'cloned']
    });

    // Copy configuration but not results
    cloned.summary = { ...original.summary, completedTasks: 0, failedTasks: 0 };
    cloned.quality = { completeness: 0, accuracy: 0, relevance: 0, overallScore: 0 };

    await harvestService.updateHarvest(cloned);

    res.status(201).json({
      success: true,
      data: cloned
    });
  } catch (error) {
    logger.error('Failed to clone harvest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clone harvest'
    });
  }
});

export default router;