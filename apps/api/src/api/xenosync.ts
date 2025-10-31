/**
 * XenoSync API endpoints
 * Handles communication between XenoSync Python orchestrator and MaiFarm
 */

import { Request, Response, Router } from 'express';
import { xenoSyncService } from '../services/XenoSyncService';
import { terminalService } from '../services/unified/terminalService';
import { websocketManager } from '../websocket/websocketManager';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Notify MaiFarm that XenoSync agents are launching
 * Called by xenosync-maifarm-launcher.py when tmux session is created
 */
router.post('/agents-launching', async (req: Request, res: Response) => {
  try {
    const { farmId, sessionId, numAgents, windowTarget, timestamp } = req.body;

    logger.info('[XenoSync API] Agents launching notification received', {
      farmId,
      sessionId,
      numAgents,
      windowTarget,
      timestamp
    });

    // Notify terminal service to start monitoring early
    const sessionName = sessionId || `farm-${farmId.substring(0, 8)}`;

    // Broadcast that agents are launching
    websocketManager.broadcast('xenosync:agents:launching', {
      farmId,
      sessionName,
      numAgents,
      windowTarget: windowTarget || 'agents',
      timestamp: timestamp || new Date()
    });

    // Pre-register the session with both terminal services
    try {
      // Register with terminal service for session tracking
      await terminalService.registerPendingSession({
        sessionName,
        farmId,
        expectedAgents: numAgents,
        windowTarget: windowTarget || 'agents'
      });
      logger.info(`[XenoSync API] Pre-registered session ${sessionName} with terminal service`);

      // Also register with terminal stream service for accurate agent counting
      const { terminalStreamService } = await import('../services/terminalStreamService');
      terminalStreamService.registerPendingSession(
        farmId,
        numAgents,
        windowTarget || 'agents',
        sessionName
      );
      logger.info(`[XenoSync API] Pre-registered session with terminal stream service for ${numAgents} agents`);
    } catch (error) {
      logger.warn('[XenoSync API] Failed to pre-register session:', error);
    }

    res.json({
      success: true,
      message: 'Agents launching notification received',
      sessionName
    });

  } catch (error) {
    logger.error('[XenoSync API] Error handling agents launching:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process agents launching notification'
    });
  }
});

/**
 * Get XenoSync status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isAvailable = await xenoSyncService.isAvailable();
    const activeProcesses = xenoSyncService.getActiveProcesses();

    res.json({
      available: isAvailable,
      activeProcesses: Array.from(activeProcesses.entries()).map(([id, process]) => ({
        id,
        farmId: process.farmId,
        status: process.status,
        numberOfAgents: process.numberOfAgents,
        mode: process.mode,
        startTime: process.startTime
      }))
    });
  } catch (error) {
    logger.error('[XenoSync API] Error getting status:', error);
    res.status(500).json({
      error: 'Failed to get XenoSync status'
    });
  }
});

/**
 * Stop a XenoSync process
 */
router.post('/stop/:processId', async (req: Request, res: Response) => {
  try {
    const { processId } = req.params;

    await xenoSyncService.stopFarm(processId);

    res.json({
      success: true,
      message: `XenoSync process ${processId} stopped`
    });
  } catch (error) {
    logger.error('[XenoSync API] Error stopping process:', error);
    res.status(500).json({
      error: 'Failed to stop XenoSync process'
    });
  }
});

export default router;
