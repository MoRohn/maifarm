import { Router, Request, Response } from 'express';
import { ApiResponse } from '../types/api';
import { authenticateToken } from '../middleware/auth';
import { farmService as farmLifecycleManager } from '../services/unified/farmService';
import { agentCleanupService } from '../services/agentCleanupService';
import { tmuxHealthManager } from '../services/tmuxHealthManager';
import { db } from '../database/connection';
import { logger } from '../utils/logger';

const router = Router();

// All admin endpoints require authentication
router.use(authenticateToken);

// Simple admin role check middleware
const requireAdmin = (req: Request, res: Response, next: any) => {
  const user = (req as any).user;
  if (!user || (user.role !== 'admin' && !user.roles?.includes('admin'))) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required'
      }
    };
    return res.status(403).json(response);
  }
  next();
};

router.use(requireAdmin);

/**
 * GET /api/admin/lifecycle/status
 * Get comprehensive lifecycle status
 */
router.get('/lifecycle/status', async (req: Request, res: Response) => {
  try {
    // Get cleanup stats
    const cleanupStats = await agentCleanupService.getCleanupStats();
    
    // Get tmux health summary
    const healthSummary = tmuxHealthManager.getHealthSummary();
    
    // Get orphaned farms from database
    const orphanedResult = await db.query(
      `SELECT * FROM detect_orphaned_farms()`
    );
    
    // Get recent lifecycle events
    const eventsResult = await db.query(
      `SELECT * FROM farm_lifecycle_events 
       ORDER BY created_at DESC 
       LIMIT 50`
    );
    
    const response: ApiResponse = {
      success: true,
      data: {
        cleanup: cleanupStats,
        health: healthSummary,
        orphanedFarms: orphanedResult.rows,
        recentEvents: eventsResult.rows
      }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('[Admin] Failed to get lifecycle status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'LIFECYCLE_STATUS_ERROR',
        message: 'Failed to get lifecycle status'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/admin/lifecycle/cleanup
 * Trigger emergency cleanup
 */
router.post('/lifecycle/cleanup', async (req: Request, res: Response) => {
  try {
    const { force = false, keepActiveFarms = false, dryRun = false } = req.body;
    
    logger.warn('[Admin] Emergency cleanup requested', {
      userId: (req as any).user?.id,
      force,
      keepActiveFarms,
      dryRun
    });
    
    // Run cleanup through agentCleanupService
    const cleanupResult = await agentCleanupService.cleanupOrphanedSessions({
      force,
      keepActiveFarms,
      dryRun
    });
    
    // If not dry run, also trigger lifecycle manager emergency cleanup
    let lifecycleResult = null;
    if (!dryRun && force) {
      lifecycleResult = await farmLifecycleManager.emergencyCleanup();
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        cleanup: cleanupResult,
        lifecycle: lifecycleResult,
        timestamp: new Date()
      }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('[Admin] Emergency cleanup failed:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'CLEANUP_ERROR',
        message: 'Emergency cleanup failed'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/admin/lifecycle/reconcile
 * Force reconciliation of farm states
 */
router.post('/lifecycle/reconcile', async (req: Request, res: Response) => {
  try {
    logger.info('[Admin] Reconciliation requested', {
      userId: (req as any).user?.id
    });
    
    // Trigger reconciliation in lifecycle manager
    const result = await farmLifecycleManager['reconcileOnStartup']();
    
    const response: ApiResponse = {
      success: true,
      data: {
        reconciliation: result,
        timestamp: new Date()
      }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('[Admin] Reconciliation failed:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RECONCILIATION_ERROR',
        message: 'Reconciliation failed'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * DELETE /api/admin/lifecycle/session/:sessionName
 * Force kill a specific tmux session
 */
router.delete('/lifecycle/session/:sessionName', async (req: Request, res: Response) => {
  try {
    const { sessionName } = req.params;
    const { reason = 'Admin force kill' } = req.body;
    
    logger.warn('[Admin] Force kill session requested', {
      userId: (req as any).user?.id,
      sessionName,
      reason
    });
    
    // Kill through lifecycle manager
    const killed = await farmLifecycleManager['killTmuxSession'](sessionName, reason);
    
    const response: ApiResponse = {
      success: killed,
      data: {
        sessionName,
        killed,
        reason,
        timestamp: new Date()
      }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('[Admin] Force kill failed:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'KILL_SESSION_ERROR',
        message: 'Failed to kill session'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/admin/lifecycle/orphaned
 * Get list of orphaned sessions
 */
router.get('/lifecycle/orphaned', async (req: Request, res: Response) => {
  try {
    // Get orphaned farms from database
    const orphanedResult = await db.query(
      `SELECT 
        f.id,
        f.name,
        f.status,
        f.session_name,
        f.last_heartbeat,
        f.owner_pid,
        f.orphaned_at,
        CURRENT_TIMESTAMP - f.last_heartbeat as time_since_heartbeat
      FROM farms f
      WHERE f.status IN ('active', 'launching', 'running')
      AND (
        f.last_heartbeat < CURRENT_TIMESTAMP - INTERVAL '90 seconds'
        OR f.orphaned_at IS NOT NULL
      )
      ORDER BY f.last_heartbeat DESC`
    );
    
    // Get tmux sessions from lifecycle manager
    const tmuxSessions = await farmLifecycleManager['getAllTmuxSessions']();
    
    const response: ApiResponse = {
      success: true,
      data: {
        orphanedFarms: orphanedResult.rows,
        tmuxSessions,
        timestamp: new Date()
      }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('[Admin] Failed to get orphaned sessions:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'ORPHANED_LIST_ERROR',
        message: 'Failed to get orphaned sessions'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/admin/lifecycle/heartbeat/:farmId
 * Manually send heartbeat for a farm
 */
router.post('/lifecycle/heartbeat/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    
    // Update heartbeat in database
    await db.query(
      `UPDATE farms 
       SET last_heartbeat = CURRENT_TIMESTAMP, 
           orphaned_at = NULL,
           actual_status = 'active'
       WHERE id = $1`,
      [farmId]
    );
    
    // Log lifecycle event
    await db.query(
      `INSERT INTO farm_lifecycle_events (farm_id, event_type, event_data, owner_pid, instance_id)
       VALUES ($1, 'manual_heartbeat', $2, $3, $4)`,
      [farmId, JSON.stringify({ admin_id: (req as any).user?.id }), process.pid, null]
    );
    
    logger.info('[Admin] Manual heartbeat sent', {
      userId: (req as any).user?.id,
      farmId
    });
    
    const response: ApiResponse = {
      success: true,
      data: {
        farmId,
        heartbeat: new Date()
      }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('[Admin] Failed to send heartbeat:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'HEARTBEAT_ERROR',
        message: 'Failed to send heartbeat'
      }
    };
    res.status(500).json(response);
  }
});

export default router;