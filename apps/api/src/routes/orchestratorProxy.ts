/**
 * Orchestrator Proxy Routes
 * Exposes Python orchestrator capabilities through Node.js API
 */

import { Router, Request, Response } from 'express';
import { pythonOrchestratorProxy } from '../services/pythonOrchestratorProxy';
import { logger, LogCategory } from '../utils/logger';

const router = Router();

/**
 * Get active agents from Python orchestrator
 * GET /api/orchestrator/active
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const activeAgents = await pythonOrchestratorProxy.getActiveAgents();

    res.json({
      success: true,
      agents: activeAgents,
      count: activeAgents.length,
      source: 'python_orchestrator',
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Error getting active agents', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get active agents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Check orchestrator status
 * GET /api/orchestrator/status
 */
router.get('/status', async (req: Request, res: Response) => {
  const isAvailable = pythonOrchestratorProxy.isOrchestratorAvailable();

  res.json({
    available: isAvailable,
    url: process.env.PYTHON_ORCHESTRATOR_URL || 'http://127.0.0.1:8000',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Run agent via Python orchestrator
 * POST /api/orchestrator/run
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      prompt,
      agentId,
      systemPrompt,
      profileId,
      tools,
      files,
      metadata,
      tmuxPaneId,
    } = req.body;

    if (!sessionId || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, prompt',
      });
    }

    const result = await pythonOrchestratorProxy.runAgent({
      sessionId,
      prompt,
      agentId,
      systemPrompt,
      profileId,
      tools,
      files,
      metadata,
      tmuxPaneId,
    });

    if (!result) {
      return res.status(503).json({
        success: false,
        error: 'Python orchestrator not available',
      });
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Error running agent', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to run agent',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Cancel agent run
 * POST /api/orchestrator/cancel/:runId
 */
router.post('/cancel/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    const success = await pythonOrchestratorProxy.cancelRun(runId);

    if (success) {
      res.json({
        success: true,
        message: 'Agent run cancelled',
        runId,
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Run not found or could not be cancelled',
        runId,
      });
    }
  } catch (error) {
    logger.error(LogCategory.FARM, 'Error cancelling agent run', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to cancel agent run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get run status
 * GET /api/orchestrator/runs/:runId
 */
router.get('/runs/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    const status = await pythonOrchestratorProxy.getRunStatus(runId);

    if (status) {
      res.json({
        success: true,
        ...status,
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Run not found',
        runId,
      });
    }
  } catch (error) {
    logger.error(LogCategory.FARM, 'Error getting run status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get run status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
