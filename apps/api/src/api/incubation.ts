/**
 * Incubation API Endpoints
 *
 * Provides REST API for:
 * - Starting incubation (auto or manual)
 * - Control operations (pause/resume/stop)
 * - Viewing incubation sessions and history
 * - Creating incubation farms (v2.0 → v3.0)
 * - Lineage and ancestry tracking
 */

import { Router, Request, Response } from 'express';
import { logger, LogCategory } from '../utils/logger';
import { incubationService } from '../services/IncubationService';
import { requirePermission } from '../middleware/auth';
import type {
  StartIncubationInput,
  CreateIncubationFarmInput
} from '../types/incubation';

const router = Router();

/**
 * Get farm's active incubation session
 * GET /api/farms/:farmId/incubation
 */
router.get('/farms/:farmId/incubation', requirePermission(['farms:read']), async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    const session = await incubationService.getFarmIncubationSession(farmId);

    if (!session) {
      return res.json({
        session: null,
        status: 'no_active_session'
      });
    }

    const progress = ((session.currentStage - 1) / session.totalStages) * 100;

    res.json({
      session,
      status: session.status,
      progress,
      currentStageName: session.stageNames[session.currentStage - 1]
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error getting farm incubation session:', error);
    res.status(500).json({ error: 'Failed to get incubation session' });
  }
});

/**
 * Start incubation manually
 * POST /api/incubations/start
 *
 * Body: { farmId, harvestId, userContext?, userId? }
 */
router.post('/start', requirePermission(['farms:control']), async (req: Request, res: Response) => {
  try {
    const input: StartIncubationInput = req.body;

    if (!input.farmId || !input.harvestId) {
      return res.status(400).json({ error: 'farmId and harvestId are required' });
    }

    const sessionId = await incubationService.startIncubation(input);

    res.json({
      sessionId,
      message: 'Incubation started successfully'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error starting incubation:', error);
    res.status(500).json({
      error: 'Failed to start incubation',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get incubation session by ID
 * GET /api/incubations/:sessionId
 */
router.get('/:sessionId', requirePermission(['farms:read']), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await incubationService.getIncubationSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Incubation session not found' });
    }

    res.json({ session });
  } catch (error) {
    logger.error(LogCategory.API, 'Error getting incubation session:', error);
    res.status(500).json({ error: 'Failed to get incubation session' });
  }
});

/**
 * Pause incubation
 * POST /api/incubations/:sessionId/pause
 */
router.post('/:sessionId/pause', requirePermission(['farms:control']), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    await incubationService.pauseIncubation(sessionId);

    res.json({
      success: true,
      message: 'Incubation paused successfully'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error pausing incubation:', error);
    res.status(500).json({
      error: 'Failed to pause incubation',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Resume incubation
 * POST /api/incubations/:sessionId/resume
 */
router.post('/:sessionId/resume', requirePermission(['farms:control']), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    await incubationService.resumeIncubation(sessionId);

    res.json({
      success: true,
      message: 'Incubation resumed successfully'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error resuming incubation:', error);
    res.status(500).json({
      error: 'Failed to resume incubation',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Stop incubation
 * POST /api/incubations/:sessionId/stop
 *
 * Body: { reason?: string }
 */
router.post('/:sessionId/stop', requirePermission(['farms:control']), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;

    await incubationService.stopIncubation(sessionId, reason);

    res.json({
      success: true,
      message: 'Incubation stopped successfully'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error stopping incubation:', error);
    res.status(500).json({
      error: 'Failed to stop incubation',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Create incubation farm (v2.0 → v3.0)
 * POST /api/farms/:farmId/incubate
 *
 * Body: { userContext?, customPrompt?, userId? }
 *
 * This is the core "re-farming" endpoint that:
 * 1. Creates a new farm linked to the parent
 * 2. Extracts harvest content from the parent
 * 3. Starts the 5-stage incubation process
 * 4. Returns the new farm and session IDs
 */
router.post('/farms/:farmId/incubate', requirePermission(['farms:control']), async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { userContext, customPrompt, userId } = req.body;

    logger.info(LogCategory.API, `Creating incubation farm from parent ${farmId}`);

    const result = await incubationService.createIncubationFarm({
      parentFarmId: farmId,
      userContext,
      customPrompt,
      userId
    });

    res.json({
      success: true,
      newFarmId: result.farmId,
      sessionId: result.sessionId,
      version: result.version,
      message: `Created incubation farm v${result.version}.0 from parent ${farmId}`
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error creating incubation farm:', error);

    // Handle specific error cases
    if (error instanceof Error && error.message.includes('No completed harvest')) {
      return res.status(400).json({
        error: 'Cannot incubate',
        message: error.message,
        code: 'NO_HARVEST'
      });
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Farm not found',
        message: error.message,
        code: 'FARM_NOT_FOUND'
      });
    }

    res.status(500).json({
      error: 'Failed to create incubation farm',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get incubation lineage for a farm
 * GET /api/farms/:farmId/lineage
 */
router.get('/farms/:farmId/lineage', requirePermission(['farms:read']), async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    const lineage = await incubationService.getIncubationLineage(farmId);
    const ancestors = await incubationService.getIncubationAncestors(farmId);

    res.json({
      lineage,
      ancestors,
      currentVersion: lineage?.version || 1,
      totalGenerations: ancestors.length + 1
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error getting incubation lineage:', error);
    res.status(500).json({ error: 'Failed to get incubation lineage' });
  }
});

/**
 * Get all incubation sessions for a farm (history)
 * GET /api/farms/:farmId/incubations
 *
 * Query params:
 * - limit: number (default 50)
 * - offset: number (default 0)
 * - status: 'pending' | 'incubating' | 'paused' | 'stopped' | 'completed' | 'failed'
 */
router.get('/farms/:farmId/incubations', requirePermission(['farms:read']), async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;

    const result = await incubationService.getAllIncubationSessions(farmId, {
      limit,
      offset,
      status: status as any
    });

    res.json({
      sessions: result.sessions,
      total: result.total,
      stats: result.stats,
      pagination: {
        limit,
        offset,
        hasMore: offset + result.sessions.length < result.total
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error getting incubation history:', error);
    res.status(500).json({ error: 'Failed to get incubation history' });
  }
});

/**
 * Health check for incubation system
 * GET /api/incubations/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    res.json({
      status: 'healthy',
      service: 'incubation',
      version: '1.0.0',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: String(error) });
  }
});

export default router;
