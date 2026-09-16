/**
 * Inference Continuez API
 *
 * REST API endpoints for the inference-continuez plugin integration.
 *
 * Endpoints:
 * - GET /api/inference-continuez/settings - Get current settings
 * - PUT /api/inference-continuez/settings - Update settings
 * - POST /api/inference-continuez/evaluate - Evaluate context for continuation
 * - POST /api/inference-continuez/evaluate-tool - Evaluate tool operation
 * - GET /api/inference-continuez/stats - Get evaluation statistics
 */

import { Router, Request, Response } from 'express';
import { logger, LogCategory } from '../utils/logger';
import { inferenceContinuezService, ContinuezSettings } from '../services/InferenceContinuezService';

const router = Router();

/**
 * GET /api/inference-continuez/settings
 * Get current inference-continuez settings
 */
router.get('/settings', (_req: Request, res: Response) => {
  try {
    const settings = inferenceContinuezService.getSettings();
    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get inference-continuez settings', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get settings',
    });
  }
});

/**
 * PUT /api/inference-continuez/settings
 * Update inference-continuez settings
 */
router.put('/settings', (req: Request, res: Response) => {
  try {
    const updates: Partial<ContinuezSettings> = req.body;

    // Validate threshold if provided
    if (updates.confidence_threshold !== undefined) {
      const threshold = updates.confidence_threshold;
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 99) {
        return res.status(400).json({
          success: false,
          error: 'confidence_threshold must be a number between 0 and 99',
        });
      }
    }

    inferenceContinuezService.updateSettings(updates);
    const settings = inferenceContinuezService.getSettings();

    logger.info(LogCategory.API, 'Inference-continuez settings updated', updates);

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to update inference-continuez settings', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
    });
  }
});

/**
 * POST /api/inference-continuez/evaluate
 * Evaluate context for continuation confidence
 */
router.post('/evaluate', (req: Request, res: Response) => {
  try {
    const { context, farmId } = req.body;

    if (!context || typeof context !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'context is required and must be a string',
      });
    }

    const evaluation = inferenceContinuezService.calculateConfidence(context, farmId);

    res.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to evaluate context', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate context',
    });
  }
});

/**
 * POST /api/inference-continuez/evaluate-tool
 * Evaluate tool operation for auto-approval
 */
router.post('/evaluate-tool', (req: Request, res: Response) => {
  try {
    const { toolName, toolInput, farmId } = req.body;

    if (!toolName || typeof toolName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'toolName is required and must be a string',
      });
    }

    const evaluation = inferenceContinuezService.evaluateToolOperation(
      toolName,
      toolInput || {},
      farmId
    );

    res.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to evaluate tool operation', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate tool operation',
    });
  }
});

/**
 * POST /api/inference-continuez/evaluate-agent
 * Evaluate agent output for continuation
 */
router.post('/evaluate-agent', (req: Request, res: Response) => {
  try {
    const { agentId, output, farmId } = req.body;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'agentId is required and must be a string',
      });
    }

    if (!output || typeof output !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'output is required and must be a string',
      });
    }

    if (!farmId || typeof farmId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'farmId is required and must be a string',
      });
    }

    const evaluation = inferenceContinuezService.evaluateAgentOutput(agentId, output, farmId);

    res.json({
      success: true,
      evaluation,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to evaluate agent output', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate agent output',
    });
  }
});

/**
 * GET /api/inference-continuez/stats
 * Get evaluation statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = inferenceContinuezService.getStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get inference-continuez stats', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
    });
  }
});

/**
 * POST /api/inference-continuez/farm/:farmId/override
 * Set farm-specific settings override
 */
router.post('/farm/:farmId/override', (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const overrides: Partial<ContinuezSettings> = req.body;

    // Validate threshold if provided
    if (overrides.confidence_threshold !== undefined) {
      const threshold = overrides.confidence_threshold;
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 99) {
        return res.status(400).json({
          success: false,
          error: 'confidence_threshold must be a number between 0 and 99',
        });
      }
    }

    inferenceContinuezService.setFarmOverride(farmId, overrides);
    const effectiveSettings = inferenceContinuezService.getEffectiveSettings(farmId);

    logger.info(LogCategory.API, `Farm ${farmId} inference-continuez override set`, overrides);

    res.json({
      success: true,
      farmId,
      effectiveSettings,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to set farm override', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to set farm override',
    });
  }
});

/**
 * DELETE /api/inference-continuez/farm/:farmId/override
 * Clear farm-specific settings override
 */
router.delete('/farm/:farmId/override', (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    inferenceContinuezService.clearFarmOverride(farmId);

    logger.info(LogCategory.API, `Farm ${farmId} inference-continuez override cleared`);

    res.json({
      success: true,
      farmId,
      message: 'Override cleared, using global settings',
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to clear farm override', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to clear farm override',
    });
  }
});

export default router;
