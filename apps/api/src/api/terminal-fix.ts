/**
 * Terminal Fix API - Emergency endpoint to fix terminal streaming
 *
 * This endpoint can be used to immediately start terminal streaming
 * for any active farm that isn't showing output.
 */

import { Router } from 'express';
import { directTerminalBroadcaster } from '../services/DirectTerminalBroadcaster';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';

const router = Router();

/**
 * Start immediate terminal streaming for a farm
 */
router.post('/fix/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;

    // Get farm details from database
    const result = await db.query(
      `SELECT id, name, status,
              jsonb_array_length(COALESCE(agents, '[]'::jsonb)) as agent_count
       FROM farms
       WHERE id = $1`,
      [farmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    const farm = result.rows[0];

    if (farm.status !== 'running' && farm.status !== 'active') {
      return res.status(400).json({
        error: 'Farm is not active',
        status: farm.status
      });
    }

    // Start streaming with short farm ID format
    const shortId = farmId.substring(0, 8);
    const sessionName = `farm-${shortId}`;

    logger.info(LogCategory.TERMINAL, `🔧 FIXING terminal streaming for farm ${farmId}`);

    await directTerminalBroadcaster.startStreaming(
      farmId,
      sessionName,
      farm.agent_count || 5  // Default to 5 agents if not specified
    );

    // Force an immediate poll
    await directTerminalBroadcaster.forcePoll(farmId);

    res.json({
      success: true,
      message: 'Terminal streaming started',
      farmId,
      sessionName,
      agentCount: farm.agent_count || 5,
      status: directTerminalBroadcaster.getStatus()
    });

  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Failed to fix terminal streaming:', error);
    res.status(500).json({
      error: 'Failed to start streaming',
      details: error.message
    });
  }
});

/**
 * Auto-fix all active farms
 */
router.post('/fix-all', async (req, res) => {
  try {
    // Find all active farms
    const result = await db.query(
      `SELECT id, name, status,
              jsonb_array_length(COALESCE(agents, '[]'::jsonb)) as agent_count
       FROM farms
       WHERE status IN ('running', 'active')
       ORDER BY created_at DESC`,
      []
    );

    const fixed = [];
    const failed = [];

    for (const farm of result.rows) {
      try {
        const shortId = farm.id.substring(0, 8);
        const sessionName = `farm-${shortId}`;

        await directTerminalBroadcaster.startStreaming(
          farm.id,
          sessionName,
          farm.agent_count || 5
        );

        fixed.push({
          id: farm.id,
          name: farm.name,
          sessionName
        });
      } catch (error) {
        failed.push({
          id: farm.id,
          name: farm.name,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      fixed: fixed.length,
      failed: failed.length,
      farms: { fixed, failed },
      status: directTerminalBroadcaster.getStatus()
    });

  } catch (error) {
    logger.error(LogCategory.TERMINAL, 'Failed to fix all farms:', error);
    res.status(500).json({
      error: 'Failed to fix farms',
      details: error.message
    });
  }
});

/**
 * Get streaming status
 */
router.get('/status', async (req, res) => {
  res.json(directTerminalBroadcaster.getStatus());
});

/**
 * Force poll for a specific farm
 */
router.post('/poll/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;
    await directTerminalBroadcaster.forcePoll(farmId);

    res.json({
      success: true,
      message: 'Poll triggered',
      farmId
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to trigger poll',
      details: error.message
    });
  }
});

/**
 * Stop streaming for a farm
 */
router.delete('/stop/:farmId', async (req, res) => {
  try {
    const { farmId } = req.params;
    directTerminalBroadcaster.stopStreaming(farmId);

    res.json({
      success: true,
      message: 'Streaming stopped',
      farmId
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stop streaming',
      details: error.message
    });
  }
});

export default router;