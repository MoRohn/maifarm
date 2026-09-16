/**
 * Confidenz API Routes
 *
 * Provides confidence scoring endpoints for farm monitoring
 *
 * @author Blerbz
 * @license MIT
 */

import { Router, Request, Response } from 'express';
import { confidenzService } from '../services/ConfidenzService';
import { logger, LogCategory } from '../utils/logger';

const router = Router();

/**
 * GET /api/confidenz/:farmId
 * Get confidence metrics for a farm
 */
router.get('/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    // Get both local metrics and coordination-based data
    const metrics = confidenzService.getFarmMetrics(farmId);
    const agents = confidenzService.getAgentConfidence(farmId);
    const coordinationSummary = confidenzService.getCoordinationSummary(farmId);

    if (!metrics && !coordinationSummary) {
      return res.json({
        farmId,
        status: 'no_data',
        message: 'No confidence data available for this farm',
        agents: [],
      });
    }

    return res.json({
      farmId,
      status: 'ok',
      metrics,
      agents,
      // Include coordination data if available (from Python orchestrator)
      coordination: coordinationSummary ? {
        averageScore: coordinationSummary.averageScore,
        minScore: coordinationSummary.minScore,
        maxScore: coordinationSummary.maxScore,
        trend: coordinationSummary.trend,
        overallLevel: coordinationSummary.overallLevel,
        updatedAt: coordinationSummary.updatedAt,
        agentCount: Object.keys(coordinationSummary.agents).length,
      } : null,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Confidenz] Error getting metrics: ${error}`);
    return res.status(500).json({ error: 'Failed to get confidence metrics' });
  }
});

/**
 * POST /api/confidenz/:farmId/start
 * Start monitoring confidence for a farm
 */
router.post('/:farmId/start', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    await confidenzService.startMonitoring(farmId);

    return res.json({
      status: 'started',
      farmId,
      message: 'Confidence monitoring started',
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Confidenz] Error starting monitoring: ${error}`);
    return res.status(500).json({ error: 'Failed to start confidence monitoring' });
  }
});

/**
 * POST /api/confidenz/:farmId/stop
 * Stop monitoring confidence for a farm
 */
router.post('/:farmId/stop', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    confidenzService.stopMonitoring(farmId);

    return res.json({
      status: 'stopped',
      farmId,
      message: 'Confidence monitoring stopped',
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Confidenz] Error stopping monitoring: ${error}`);
    return res.status(500).json({ error: 'Failed to stop confidence monitoring' });
  }
});

/**
 * GET /api/confidenz/:farmId/history
 * Get confidence history for a farm
 */
router.get('/:farmId/history', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const history = confidenzService.getHistory(farmId, limit);

    return res.json({
      farmId,
      count: history.length,
      history,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Confidenz] Error getting history: ${error}`);
    return res.status(500).json({ error: 'Failed to get confidence history' });
  }
});

/**
 * POST /api/confidenz/:farmId/record
 * Record a confidence score (for internal use or testing)
 */
router.post('/:farmId/record', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { agentId, agentName, score, sessionId } = req.body;

    if (typeof score !== 'number' || score < 0 || score > 99) {
      return res.status(400).json({ error: 'Score must be a number between 0 and 99' });
    }

    const confidence = confidenzService.recordConfidence(
      farmId,
      agentId || 'unknown',
      agentName || 'Unknown Agent',
      score,
      sessionId
    );

    return res.json({
      status: 'recorded',
      confidence,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Confidenz] Error recording score: ${error}`);
    return res.status(500).json({ error: 'Failed to record confidence score' });
  }
});

/**
 * POST /api/confidenz/calculate
 * Calculate confidence score from text (utility endpoint)
 */
router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    const score = confidenzService.calculateConfidence(text);
    const level =
      score >= 75 ? 'high' : score >= 40 ? 'medium' : 'low';

    return res.json({
      score,
      level,
      wordCount: text.split(/\s+/).length,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Confidenz] Error calculating score: ${error}`);
    return res.status(500).json({ error: 'Failed to calculate confidence' });
  }
});

/**
 * DELETE /api/confidenz/:farmId
 * Clear confidence data for a farm
 */
router.delete('/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    confidenzService.clearFarm(farmId);

    return res.json({
      status: 'cleared',
      farmId,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Confidenz] Error clearing data: ${error}`);
    return res.status(500).json({ error: 'Failed to clear confidence data' });
  }
});

export default router;
