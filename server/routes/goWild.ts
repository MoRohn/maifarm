import { Router, Request, Response } from 'express';
import { goWildManager } from '../services/goWildManager';
import { SafetyManager } from '../services/safetyManager';
import { WebSocketManager } from '../websocket/websocketManager';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const safetyManager = new SafetyManager();

// Start Go Wild exploration
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { farmId, config } = req.body;

    if (!farmId || !config) {
      return res.status(400).json({ 
        success: false, 
        error: 'Farm ID and configuration are required' 
      });
    }

    // Validate safety boundaries
    const safetyCheck = await safetyManager.validateBoundaries(config.boundaries);
    if (!safetyCheck.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid safety boundaries', 
        details: safetyCheck.violations 
      });
    }

    // Start exploration session
    const session = await goWildManager.startExploration(farmId, config);

    // Notify via WebSocket
    WebSocketManager.broadcast('goWild:started', {
      farmId,
      sessionId: session.id,
      config
    });

    res.json({ 
      success: true, 
      data: session 
    });
  } catch (error) {
    logger.error('Failed to start Go Wild exploration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start exploration' 
    });
  }
});

// Get exploration session
router.get('/session/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const session = await goWildManager.getSession(farmId);

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active session found' 
      });
    }

    res.json({ 
      success: true, 
      data: session 
    });
  } catch (error) {
    logger.error('Failed to get session:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get session' 
    });
  }
});

// List all exploration sessions
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await goWildManager.listSessions();
    res.json({ 
      success: true, 
      data: sessions 
    });
  } catch (error) {
    logger.error('Failed to list sessions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to list sessions' 
    });
  }
});

// Get session details
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = await goWildManager.getSessionById(id);

    if (!session) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }

    res.json({ 
      success: true, 
      data: session 
    });
  } catch (error) {
    logger.error('Failed to get session details:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get session details' 
    });
  }
});

// Pause exploration
router.put('/:sessionId/pause', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    await goWildManager.pauseExploration(sessionId);

    WebSocketManager.broadcast('goWild:paused', { sessionId });

    res.json({ 
      success: true, 
      message: 'Exploration paused' 
    });
  } catch (error) {
    logger.error('Failed to pause exploration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to pause exploration' 
    });
  }
});

// Resume exploration
router.put('/:sessionId/resume', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    await goWildManager.resumeExploration(sessionId);

    WebSocketManager.broadcast('goWild:resumed', { sessionId });

    res.json({ 
      success: true, 
      message: 'Exploration resumed' 
    });
  } catch (error) {
    logger.error('Failed to resume exploration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to resume exploration' 
    });
  }
});

// Stop exploration
router.put('/:sessionId/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const summary = await goWildManager.stopExploration(sessionId);

    WebSocketManager.broadcast('goWild:stopped', { 
      sessionId, 
      summary 
    });

    res.json({ 
      success: true, 
      data: summary 
    });
  } catch (error) {
    logger.error('Failed to stop exploration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to stop exploration' 
    });
  }
});

// Update configuration
router.put('/:sessionId/config', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const config = req.body;

    // Validate new boundaries
    const safetyCheck = await safetyManager.validateBoundaries(config.boundaries);
    if (!safetyCheck.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid safety boundaries', 
        details: safetyCheck.violations 
      });
    }

    await goWildManager.updateConfig(sessionId, config);

    WebSocketManager.broadcast('goWild:configUpdated', { 
      sessionId, 
      config 
    });

    res.json({ 
      success: true, 
      message: 'Configuration updated' 
    });
  } catch (error) {
    logger.error('Failed to update configuration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update configuration' 
    });
  }
});

// Update boundaries
router.put('/sessions/:id/boundaries', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { boundaries } = req.body;

    const safetyCheck = await safetyManager.validateBoundaries(boundaries);
    if (!safetyCheck.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid safety boundaries', 
        details: safetyCheck.violations 
      });
    }

    await goWildManager.updateBoundaries(id, boundaries);

    WebSocketManager.broadcast('goWild:boundariesUpdated', { 
      sessionId: id, 
      boundaries 
    });

    res.json({ 
      success: true, 
      message: 'Boundaries updated' 
    });
  } catch (error) {
    logger.error('Failed to update boundaries:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update boundaries' 
    });
  }
});

// Get discoveries
router.get('/sessions/:id/discoveries', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const discoveries = await goWildManager.getDiscoveries(id);

    res.json({ 
      success: true, 
      data: discoveries 
    });
  } catch (error) {
    logger.error('Failed to get discoveries:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get discoveries' 
    });
  }
});

// Save discovery
router.post('/:sessionId/discovery/:discoveryId/save', async (req: Request, res: Response) => {
  try {
    const { sessionId, discoveryId } = req.params;
    await goWildManager.saveDiscovery(sessionId, discoveryId);

    WebSocketManager.broadcast('goWild:discoverySaved', { 
      sessionId, 
      discoveryId 
    });

    res.json({ 
      success: true, 
      message: 'Discovery saved' 
    });
  } catch (error) {
    logger.error('Failed to save discovery:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save discovery' 
    });
  }
});

// Rollback to checkpoint
router.post('/sessions/:id/rollback/:checkpointId', async (req: Request, res: Response) => {
  try {
    const { id, checkpointId } = req.params;
    const result = await goWildManager.rollbackToCheckpoint(id, checkpointId);

    WebSocketManager.broadcast('goWild:rolledBack', { 
      sessionId: id, 
      checkpointId,
      result 
    });

    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    logger.error('Failed to rollback:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to rollback' 
    });
  }
});

// Emergency stop all sessions
router.post('/emergency-stop', async (req: Request, res: Response) => {
  try {
    const results = await goWildManager.emergencyStopAll();

    WebSocketManager.broadcast('goWild:emergencyStop', { 
      timestamp: new Date(),
      results 
    });

    res.json({ 
      success: true, 
      message: 'Emergency stop executed',
      data: results 
    });
  } catch (error) {
    logger.error('Failed to execute emergency stop:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to execute emergency stop' 
    });
  }
});

export default router;