/**
 * Plugins API Routes
 *
 * API endpoints for managing blerbz-plugins:
 * - inference-confidenz
 * - inference-continuez
 * - inference-planz
 *
 * @author Blerbz
 * @license MIT
 */

import { Router, Request, Response } from 'express';
import { pluginCoordinatorService } from '../services/PluginCoordinatorService';
import { getPluginConfig, FarmMode } from '../config/farmModeOptimizations';
import { logger, LogCategory } from '../utils/logger';

const router = Router();

// ============================================================================
// Plugin State Endpoints
// ============================================================================

/**
 * GET /api/plugins/:farmId
 * Get plugin state for a farm
 */
router.get('/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const state = pluginCoordinatorService.getPluginState(farmId);

    if (!state) {
      return res.json({
        farmId,
        status: 'not_initialized',
        message: 'No plugin state found for this farm',
      });
    }

    return res.json({
      farmId,
      status: 'ok',
      state: {
        mode: state.mode,
        isActive: state.isActive,
        startedAt: state.startedAt,
        confidenz: state.confidenz,
        continuez: state.continuez,
        planz: state.planz,
      },
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error getting state: ${error}`);
    return res.status(500).json({ error: 'Failed to get plugin state' });
  }
});

/**
 * POST /api/plugins/:farmId/initialize
 * Initialize plugins for a farm
 */
router.post('/:farmId/initialize', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { mode = 'HARVEST' } = req.body;

    // Validate mode
    const validModes = Object.values(FarmMode);
    if (!validModes.includes(mode as FarmMode)) {
      return res.status(400).json({
        error: 'Invalid mode',
        validModes,
      });
    }

    const state = await pluginCoordinatorService.initializeForFarm(farmId, mode as FarmMode);

    return res.json({
      status: 'initialized',
      farmId,
      state: {
        mode: state.mode,
        config: state.config,
        isActive: state.isActive,
      },
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error initializing: ${error}`);
    return res.status(500).json({ error: 'Failed to initialize plugins' });
  }
});

/**
 * POST /api/plugins/:farmId/stop
 * Stop plugins for a farm
 */
router.post('/:farmId/stop', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    await pluginCoordinatorService.stopForFarm(farmId);

    return res.json({
      status: 'stopped',
      farmId,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error stopping: ${error}`);
    return res.status(500).json({ error: 'Failed to stop plugins' });
  }
});

// ============================================================================
// Confidenz Endpoints
// ============================================================================

/**
 * GET /api/plugins/:farmId/confidence
 * Get confidence summary for a farm
 */
router.get('/:farmId/confidence', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const summary = pluginCoordinatorService.getConfidenceSummary(farmId);

    if (!summary) {
      return res.json({
        farmId,
        status: 'no_data',
        message: 'No confidence data available',
      });
    }

    return res.json({
      farmId,
      status: 'ok',
      confidence: summary,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error getting confidence: ${error}`);
    return res.status(500).json({ error: 'Failed to get confidence data' });
  }
});

// ============================================================================
// Continuez Endpoints
// ============================================================================

/**
 * GET /api/plugins/:farmId/continuez
 * Get continuez state for a farm
 */
router.get('/:farmId/continuez', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const state = pluginCoordinatorService.getPluginState(farmId);

    if (!state) {
      return res.json({
        farmId,
        status: 'not_initialized',
      });
    }

    return res.json({
      farmId,
      status: 'ok',
      continuez: state.continuez,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error getting continuez: ${error}`);
    return res.status(500).json({ error: 'Failed to get continuez state' });
  }
});

/**
 * POST /api/plugins/:farmId/continuez/threshold
 * Update continuez threshold for a farm
 */
router.post('/:farmId/continuez/threshold', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { threshold } = req.body;

    if (typeof threshold !== 'number' || threshold < 0 || threshold > 99) {
      return res.status(400).json({
        error: 'Threshold must be a number between 0 and 99',
      });
    }

    const success = pluginCoordinatorService.updateContinuezThreshold(farmId, threshold);

    if (!success) {
      return res.status(404).json({
        error: 'Farm not found or plugins not initialized',
      });
    }

    return res.json({
      status: 'updated',
      farmId,
      threshold,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error updating threshold: ${error}`);
    return res.status(500).json({ error: 'Failed to update threshold' });
  }
});

/**
 * POST /api/plugins/:farmId/continuez/evaluate
 * Evaluate continuez decision for an agent
 */
router.post('/:farmId/continuez/evaluate', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { agentId, score } = req.body;

    if (!agentId || typeof score !== 'number') {
      return res.status(400).json({
        error: 'agentId and score are required',
      });
    }

    const decision = pluginCoordinatorService.evaluateContinuez(farmId, agentId, score);

    return res.json({
      status: 'ok',
      decision,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error evaluating continuez: ${error}`);
    return res.status(500).json({ error: 'Failed to evaluate continuez' });
  }
});

// ============================================================================
// Planz Endpoints
// ============================================================================

/**
 * GET /api/plugins/:farmId/planz
 * Get planz session for a farm
 */
router.get('/:farmId/planz', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const session = pluginCoordinatorService.getPlanzSessionForFarm(farmId);

    if (!session) {
      return res.json({
        farmId,
        status: 'no_session',
        message: 'No planz session active for this farm',
      });
    }

    return res.json({
      farmId,
      status: 'ok',
      session,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error getting planz session: ${error}`);
    return res.status(500).json({ error: 'Failed to get planz session' });
  }
});

/**
 * POST /api/plugins/:farmId/planz/start
 * Start a new planz session
 */
router.post('/:farmId/planz/start', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        error: 'Prompt is required',
      });
    }

    const session = await pluginCoordinatorService.startPlanzSession(farmId, prompt);

    return res.json({
      status: 'started',
      session,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error starting planz: ${error}`);
    return res.status(500).json({ error: 'Failed to start planz session' });
  }
});

/**
 * POST /api/plugins/:farmId/planz/:sessionId/survey
 * Submit survey responses for a planz session
 */
router.post('/:farmId/planz/:sessionId/survey', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { responses } = req.body;

    if (!Array.isArray(responses)) {
      return res.status(400).json({
        error: 'Responses must be an array',
      });
    }

    const session = await pluginCoordinatorService.submitPlanzSurveyResponses(sessionId, responses);

    if (!session) {
      return res.status(404).json({
        error: 'Planz session not found',
      });
    }

    return res.json({
      status: 'submitted',
      session,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error submitting survey: ${error}`);
    return res.status(500).json({ error: 'Failed to submit survey responses' });
  }
});

// ============================================================================
// Configuration Endpoints
// ============================================================================

/**
 * GET /api/plugins/config/defaults
 * Get default plugin configurations for all modes
 */
router.get('/config/defaults', async (_req: Request, res: Response) => {
  try {
    const configs: Record<string, any> = {};

    // FarmMode is a const object, so we iterate over its values
    const farmModeValues = Object.values(FarmMode) as FarmMode[];
    for (const mode of farmModeValues) {
      configs[mode] = getPluginConfig(mode);
    }

    return res.json({
      status: 'ok',
      configs,
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error getting defaults: ${error}`);
    return res.status(500).json({ error: 'Failed to get plugin defaults' });
  }
});

/**
 * GET /api/plugins/active
 * Get all active plugin states
 */
router.get('/active', async (_req: Request, res: Response) => {
  try {
    const states = pluginCoordinatorService.getAllActiveStates();

    return res.json({
      status: 'ok',
      count: states.length,
      states: states.map(s => ({
        farmId: s.farmId,
        mode: s.mode,
        isActive: s.isActive,
        startedAt: s.startedAt,
      })),
    });
  } catch (error) {
    logger.error(LogCategory.API, `[Plugins API] Error getting active states: ${error}`);
    return res.status(500).json({ error: 'Failed to get active states' });
  }
});

export default router;
