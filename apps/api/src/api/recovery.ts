/**
 * Orphaned Session Recovery API
 *
 * Endpoints for detecting and recovering orphaned tmux sessions
 */

import { Router } from 'express';
import { orphanedSessionRecoveryService } from '../services/OrphanedSessionRecoveryService';
import { logger, LogCategory } from '../utils/logger';
import { verifyToken, requirePermission, Permission } from '../middleware/enhancedRBAC';

const router = Router();

// Apply authentication to all recovery routes
router.use(verifyToken);

/**
 * GET /api/recovery/stats
 * Get recovery service statistics
 */
router.get('/stats', requirePermission(Permission.SYSTEM_MONITOR), async (req, res) => {
  try {
    const stats = orphanedSessionRecoveryService.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error getting recovery stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get recovery stats'
      }
    });
  }
});

/**
 * POST /api/recovery/scan
 * Manually trigger a scan for orphaned sessions
 */
router.post('/scan', requirePermission(Permission.SYSTEM_ADMIN), async (req, res) => {
  try {
    logger.info(LogCategory.API, 'Manual orphaned session scan triggered');

    // Trigger scan asynchronously
    orphanedSessionRecoveryService.scanAndRecover().catch(error => {
      logger.error(LogCategory.SYSTEM, 'Manual scan failed:', error);
    });

    res.json({
      success: true,
      message: 'Orphaned session scan initiated'
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error triggering scan:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to trigger scan'
      }
    });
  }
});

/**
 * POST /api/recovery/recover/:sessionName
 * Manually recover a specific session
 */
router.post('/recover/:sessionName', requirePermission(Permission.SYSTEM_ADMIN), async (req, res) => {
  try {
    const { sessionName } = req.params;

    logger.info(LogCategory.API, `Manual recovery triggered for session: ${sessionName}`);

    const success = await orphanedSessionRecoveryService.recoverSession(sessionName);

    if (success) {
      res.json({
        success: true,
        message: `Successfully recovered session: ${sessionName}`
      });
    } else {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Session not found or already has database record: ${sessionName}`
        }
      });
    }
  } catch (error) {
    logger.error(LogCategory.API, 'Error recovering session:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to recover session'
      }
    });
  }
});

/**
 * PUT /api/recovery/dry-run
 * Enable/disable dry run mode
 */
router.put('/dry-run', requirePermission(Permission.SYSTEM_ADMIN), async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'enabled must be a boolean'
        }
      });
    }

    orphanedSessionRecoveryService.setDryRunMode(enabled);

    res.json({
      success: true,
      message: `Dry run mode ${enabled ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error setting dry run mode:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to set dry run mode'
      }
    });
  }
});

export default router;
