/**
 * Barn Collection API Routes
 * Endpoints for managing workspace collection and automatic collection
 */

import { Router, Request, Response } from 'express';
import { barnService as barnCollectionService } from '../services/unified/barnService';
import { proactiveCollectionEngine } from '../services/ProactiveCollectionEngine';
import { enhancedFileWatcher } from '../services/EnhancedFileWatcher';
import { logger } from '../monitoring/logger';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = Router();

/**
 * Start collection for a workspace
 */
router.post('/collection/start', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { workspaceId, farmId, agentId, policy } = req.body;

    if (!workspaceId || !farmId) {
      return res.status(400).json({
        error: 'Missing required fields: workspaceId and farmId'
      });
    }

    // Start barn collection monitoring
    await barnCollectionService.startCollection(
      workspaceId,
      farmId,
      agentId,
      policy
    );

    // Start proactive monitoring if enabled
    if (policy?.enableProactiveCollection) {
      await proactiveCollectionEngine.startMonitoring(
        workspaceId,
        farmId,
        agentId,
        policy.patterns
      );
    }

    res.json({
      success: true,
      message: 'Collection started successfully',
      data: {
        workspaceId,
        farmId,
        agentId,
        policy
      }
    });

  } catch (error) {
    logger.error('Failed to start collection:', error);
    res.status(500).json({
      error: 'Failed to start collection',
      message: error.message
    });
  }
});

/**
 * Stop collection for a workspace
 */
router.post('/collection/stop', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({
        error: 'Missing required field: workspaceId'
      });
    }

    // Stop barn collection monitoring - skip final collection to prevent premature collection
    // Collection should only happen via ShutdownCoordinator at farm timeout
    await barnCollectionService.stopCollection(workspaceId, true);

    // Stop proactive monitoring
    await proactiveCollectionEngine.stopMonitoring(workspaceId);

    res.json({
      success: true,
      message: 'Collection stopped successfully',
      data: { workspaceId }
    });

  } catch (error) {
    logger.error('Failed to stop collection:', error);
    res.status(500).json({
      error: 'Failed to stop collection',
      message: error.message
    });
  }
});

/**
 * Get collection status for a workspace
 */
router.get('/collection/status/:workspaceId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;

    const collectionStatus = barnCollectionService.getCollectionStatus(workspaceId);
    const monitoringStatus = proactiveCollectionEngine.getMonitoringStatus(workspaceId);
    const watchSessions = enhancedFileWatcher.getAllSessions()
      .filter(s => s.id === workspaceId || s.rootPath.includes(workspaceId));

    res.json({
      success: true,
      data: {
        collection: collectionStatus,
        monitoring: monitoringStatus,
        watchSessions
      }
    });

  } catch (error) {
    logger.error('Failed to get collection status:', error);
    res.status(500).json({
      error: 'Failed to get collection status',
      message: error.message
    });
  }
});

/**
 * Get all active collection sessions
 */
router.get('/collection/active', authenticateToken, async (req: Request, res: Response) => {
  try {
    const activeCollection = barnCollectionService.getActiveCollection();
    const activeMonitoring = proactiveCollectionEngine.getAllMonitoringSessions();
    const activeWatchSessions = enhancedFileWatcher.getAllSessions();

    res.json({
      success: true,
      data: {
        collection: activeCollection,
        monitoring: activeMonitoring,
        watchSessions: activeWatchSessions,
        statistics: {
          totalCollection: activeCollection.length,
          totalMonitoring: activeMonitoring.length,
          totalWatchSessions: activeWatchSessions.length
        }
      }
    });

  } catch (error) {
    logger.error('Failed to get active collection:', error);
    res.status(500).json({
      error: 'Failed to get active collection',
      message: error.message
    });
  }
});

/**
 * Trigger manual collection for a workspace
 */
router.post('/collection/trigger', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { workspaceId, reason } = req.body;

    if (!workspaceId) {
      return res.status(400).json({
        error: 'Missing required field: workspaceId'
      });
    }

    await barnCollectionService.triggerManualCollection(workspaceId);

    res.json({
      success: true,
      message: 'Collection triggered successfully',
      data: {
        workspaceId,
        reason: reason || 'Manual trigger via API',
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error('Failed to trigger collection:', error);
    res.status(500).json({
      error: 'Failed to trigger collection',
      message: error.message
    });
  }
});

/**
 * Configure collection policy for a workspace
 */
router.put('/policy/:workspaceId', authenticateToken, requirePermission(['admin', 'operator']), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const policy = req.body;

    // Validate policy
    if (!policy || typeof policy !== 'object') {
      return res.status(400).json({
        error: 'Invalid policy configuration'
      });
    }

    // Get current collection status
    const status = barnCollectionService.getCollectionStatus(workspaceId);
    
    if (!status || !status.isActive) {
      return res.status(404).json({
        error: 'No active collection for workspace'
      });
    }

    // Restart collection with new policy
    await barnCollectionService.stopCollection(workspaceId);
    await barnCollectionService.startCollection(
      workspaceId,
      status.activity.farmId,
      status.activity.agentId,
      policy
    );

    res.json({
      success: true,
      message: 'Policy updated successfully',
      data: {
        workspaceId,
        policy
      }
    });

  } catch (error) {
    logger.error('Failed to update policy:', error);
    res.status(500).json({
      error: 'Failed to update policy',
      message: error.message
    });
  }
});

/**
 * Create a file watch session
 */
router.post('/watch/create', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { rootPath, options, sessionId } = req.body;

    if (!rootPath) {
      return res.status(400).json({
        error: 'Missing required field: rootPath'
      });
    }

    const watchSessionId = await enhancedFileWatcher.createWatchSession(
      rootPath,
      options,
      sessionId
    );

    res.json({
      success: true,
      message: 'Watch session created successfully',
      data: {
        sessionId: watchSessionId,
        rootPath,
        options
      }
    });

  } catch (error) {
    logger.error('Failed to create watch session:', error);
    res.status(500).json({
      error: 'Failed to create watch session',
      message: error.message
    });
  }
});

/**
 * Stop a file watch session
 */
router.post('/watch/stop', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Missing required field: sessionId'
      });
    }

    await enhancedFileWatcher.stopWatchSession(sessionId);

    res.json({
      success: true,
      message: 'Watch session stopped successfully',
      data: { sessionId }
    });

  } catch (error) {
    logger.error('Failed to stop watch session:', error);
    res.status(500).json({
      error: 'Failed to stop watch session',
      message: error.message
    });
  }
});

/**
 * Get watch session statistics
 */
router.get('/watch/stats/:sessionId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const statistics = enhancedFileWatcher.getSessionStatistics(sessionId);
    
    if (!statistics) {
      return res.status(404).json({
        error: 'Watch session not found'
      });
    }

    res.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    logger.error('Failed to get watch statistics:', error);
    res.status(500).json({
      error: 'Failed to get watch statistics',
      message: error.message
    });
  }
});

/**
 * Perform deep scan of a directory
 */
router.post('/scan/deep', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { rootPath, options } = req.body;

    if (!rootPath) {
      return res.status(400).json({
        error: 'Missing required field: rootPath'
      });
    }

    const results = await enhancedFileWatcher.deepScan(rootPath, options);

    res.json({
      success: true,
      data: {
        rootPath,
        filesScanned: results.size,
        files: Array.from(results.values())
      }
    });

  } catch (error) {
    logger.error('Failed to perform deep scan:', error);
    res.status(500).json({
      error: 'Failed to perform deep scan',
      message: error.message
    });
  }
});

/**
 * Get proactive patterns
 */
router.get('/patterns', authenticateToken, async (req: Request, res: Response) => {
  try {
    // For now, return a static list of available patterns
    const patterns = [
      {
        id: 'burst-activity',
        name: 'Burst Activity Detection',
        description: 'Detects rapid file changes indicating active development',
        enabled: true
      },
      {
        id: 'idle-after-activity',
        name: 'Idle After Activity',
        description: 'Collects files when workspace becomes idle after activity',
        enabled: true
      },
      {
        id: 'milestone-completion',
        name: 'Milestone Completion',
        description: 'Detects completion of significant work milestones',
        enabled: true
      },
      {
        id: 'error-recovery',
        name: 'Error Recovery',
        description: 'Collects files after error detection and recovery',
        enabled: true
      },
      {
        id: 'smart-completion',
        name: 'Smart Completion Detection',
        description: 'Uses machine learning to detect task completion',
        enabled: true
      }
    ];

    res.json({
      success: true,
      data: patterns
    });

  } catch (error) {
    logger.error('Failed to get patterns:', error);
    res.status(500).json({
      error: 'Failed to get patterns',
      message: error.message
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const activeCollection = barnCollectionService.getActiveCollection();
    const activeMonitoring = proactiveCollectionEngine.getAllMonitoringSessions();
    const activeWatchSessions = enhancedFileWatcher.getAllSessions();

    res.json({
      status: 'healthy',
      services: {
        barnCollection: {
          active: true,
          sessions: activeCollection.length
        },
        proactiveEngine: {
          active: true,
          sessions: activeMonitoring.length
        },
        fileWatcher: {
          active: true,
          sessions: activeWatchSessions.length
        }
      },
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    });
  }
});

export default router;