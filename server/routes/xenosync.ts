import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { farmService as farmManager } from '../services/unified/farmService';
import { terminalService } from '../services/unified/terminalService';

// Alias for compatibility
const terminalStreamService = terminalService;
import { websocketManager } from '../websocket/websocketManager';

const router = Router();

/**
 * Endpoint for XenoSync to notify when agents are launching
 * This triggers immediate terminal monitoring before agents start outputting
 */
router.post('/agents-launching', async (req: Request, res: Response) => {
  try {
    const { farmId, sessionId, numAgents, windowTarget, timestamp } = req.body;
    
    logger.info('[XenoSync] Received agent launch notification', {
      farmId,
      sessionId,
      numAgents,
      windowTarget,
      timestamp
    });
    
    // Update farm with tmux session information
    await farmManager.updateTmuxSession(farmId, sessionId, windowTarget || '0');
    
    // Start terminal streaming immediately
    const streamStarted = await terminalStreamService.startStreamingForFarm(
      farmId,
      sessionId,
      numAgents,
      windowTarget || 'agents'
    );
    
    if (streamStarted) {
      logger.info('[XenoSync] Terminal streaming started successfully for farm', farmId);
      
      // Emit WebSocket event to notify frontend
      websocketManager.emitToAll('xenosync:agents_launching', {
        farmId,
        sessionId,
        numAgents,
        windowTarget,
        timestamp,
        streamingActive: true
      });
      
      // Also emit farm status update
      websocketManager.emitToAll('farm:status', {
        farmId,
        status: 'launching',
        message: `Launching ${numAgents} XenoSync agents`
      });
      
      res.json({
        success: true,
        message: 'Terminal streaming activated',
        farmId,
        sessionId
      });
    } else {
      logger.warn('[XenoSync] Failed to start terminal streaming for farm', farmId);
      res.status(500).json({
        success: false,
        message: 'Failed to start terminal streaming',
        farmId
      });
    }
  } catch (error) {
    logger.error('[XenoSync] Error handling agent launch notification:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Endpoint to register tmux session preservation
 */
router.post('/preserve-session', async (req: Request, res: Response) => {
  try {
    const { farmId, sessionId } = req.body;
    
    await farmManager.updateTmuxSession(farmId, sessionId);
    
    res.json({
      success: true,
      message: 'Session preservation registered',
      farmId,
      sessionId
    });
  } catch (error) {
    logger.error('[XenoSync] Error preserving session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preserve session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;