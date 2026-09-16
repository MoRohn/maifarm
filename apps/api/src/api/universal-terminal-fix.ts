/**
 * Universal Terminal Fix API - Immediately start terminal streaming for any farm
 *
 * This is the FINAL solution to terminal streaming issues.
 * It bypasses all complex logic and directly starts streaming.
 */

import { Router } from 'express';
import { universalTerminalStreamer } from '../services/UniversalTerminalStreamer';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';

const router = Router();

/**
 * Start universal terminal streaming for a farm
 */
router.post('/start/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;

    logger.info(LogCategory.TERMINAL, `🌟 UNIVERSAL FIX: Starting terminal streaming for farm ${farmId}`);

    // Get farm details (optional - for agent count)
    let agentCount = 5; // Default
    let farmName = 'Unknown';

    try {
      const result = await db.query(
        `SELECT id, name,
                jsonb_array_length(COALESCE(agents, '[]'::jsonb)) as agent_count
         FROM farms
         WHERE id = $1`,
        [farmId]
      );

      if (result.rows.length > 0) {
        const farm = result.rows[0];
        agentCount = farm.agent_count || 5;
        farmName = farm.name;
      }
    } catch (err) {
      logger.warn(LogCategory.TERMINAL, 'Could not fetch farm details, using defaults');
    }

    // Start streaming - let UniversalTerminalStreamer auto-detect everything
    const success = await universalTerminalStreamer.startStreaming(
      farmId,
      undefined, // Let it auto-detect session name
      agentCount
    );

    if (success) {
      res.json({
        success: true,
        message: 'Universal terminal streaming started',
        farmId,
        farmName,
        agentCount,
        status: universalTerminalStreamer.getStatus(farmId)
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to start streaming',
        farmId,
        details: 'No tmux session found or session not accessible'
      });
    }

  } catch (error: any) {
    logger.error(LogCategory.TERMINAL, 'Universal terminal fix failed:', error);
    res.status(500).json({
      error: 'Failed to start universal streaming',
      details: error.message
    });
  }
});

/**
 * Auto-register all active tmux sessions
 */
router.post('/auto-register', async (req, res) => {
  try {
    logger.info(LogCategory.TERMINAL, '🌟 UNIVERSAL FIX: Auto-registering all active sessions');

    const registered = await universalTerminalStreamer.autoRegisterActiveSessions();

    res.json({
      success: true,
      registered,
      sessions: universalTerminalStreamer.getAllSessions()
    });

  } catch (error: any) {
    logger.error(LogCategory.TERMINAL, 'Auto-registration failed:', error);
    res.status(500).json({
      error: 'Failed to auto-register',
      details: error.message
    });
  }
});

/**
 * Get streaming status
 */
router.get('/status', (req, res) => {
  const sessions = universalTerminalStreamer.getAllSessions();
  res.json({
    activeSessions: sessions.length,
    sessions
  });
});

/**
 * Force poll a specific farm
 */
router.post('/poll/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;
    await universalTerminalStreamer.forcePoll(farmId);

    res.json({
      success: true,
      message: 'Poll triggered',
      farmId,
      status: universalTerminalStreamer.getStatus(farmId)
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to trigger poll',
      details: error.message
    });
  }
});

/**
 * Stop streaming for a farm
 */
router.delete('/stop/:farmId', (req, res) => {
  try {
    const { farmId } = req.params;
    universalTerminalStreamer.stopStreaming(farmId);

    res.json({
      success: true,
      message: 'Streaming stopped',
      farmId
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to stop streaming',
      details: error.message
    });
  }
});

export default router;