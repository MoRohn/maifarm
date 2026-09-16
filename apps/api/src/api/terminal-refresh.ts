/**
 * Terminal Refresh API
 * Provides endpoints to force-refresh terminal output
 */

import { Router, Request, Response } from 'express';
import { logger, LogCategory } from '../utils/logger';
import { terminalRefreshService } from '../services/TerminalRefreshService';

const router = Router();

/**
 * Force refresh terminal output for a specific agent
 * POST /api/terminal-refresh/:farmId/:agentId
 */
router.post('/:farmId/:agentId', async (req: Request, res: Response) => {
  try {
    const { farmId, agentId } = req.params;
    const agentIndex = parseInt(agentId, 10);

    if (isNaN(agentIndex)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agent ID'
      });
    }

    logger.info(LogCategory.TERMINAL,
      `Force refresh requested for agent ${agentIndex} in farm ${farmId}`);

    const success = await terminalRefreshService.forceRefresh(farmId, agentIndex);

    res.json({
      success,
      farmId,
      agentId: agentIndex,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Error force refreshing agent:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Force refresh all agents in a farm
 * POST /api/terminal-refresh/:farmId
 */
router.post('/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    logger.info(LogCategory.TERMINAL,
      `Force refresh requested for all agents in farm ${farmId}`);

    const refreshed = await terminalRefreshService.forceRefreshFarm(farmId);

    res.json({
      success: true,
      farmId,
      agentsRefreshed: refreshed,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Error force refreshing farm:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get refresh service statistics
 * GET /api/terminal-refresh/stats
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = terminalRefreshService.getStats();

    res.json({
      success: true,
      stats,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Error getting refresh stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
