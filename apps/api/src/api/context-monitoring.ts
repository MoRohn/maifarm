/**
 * Context Window Monitoring API
 *
 * Provides endpoints for monitoring context window usage across AI providers
 * and farms. Enables real-time tracking and automated context management.
 */

import { Router, Request, Response } from 'express';
import { logger, LogCategory } from '../utils/logger';
import { contextManager } from '../services/contextManager';
import { db } from '../database/connection';
import { requirePermission } from '../middleware/auth';

const router = Router();

// Threshold configuration for alerts
const CONTEXT_THRESHOLDS = {
  WARNING: 0.75,    // 75% - yellow warning
  CAUTION: 0.85,    // 85% - orange caution
  CRITICAL: 0.95,   // 95% - red critical
  COMPRESS: 0.90    // 90% - auto-compress trigger
};

interface ContextStats {
  sessionId: string;
  farmId: string;
  provider: 'claude' | 'llama' | 'openai';
  tokensUsed: number;
  maxTokens: number;
  utilization: number;
  status: 'healthy' | 'warning' | 'caution' | 'critical';
  messageCount: number;
  lastActivity: Date;
  compressionEnabled: boolean;
  compressionCount: number;
}

/**
 * Get context stats for a specific farm
 * GET /api/context/:farmId
 */
router.get('/:farmId', requirePermission(['farms:read']), async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    const session = await contextManager.getSessionByFarmId(farmId);

    if (!session) {
      return res.json({
        hasContext: false,
        stats: null,
        message: 'No active context session for this farm'
      });
    }

    const utilization = session.tokenCount / session.maxTokens;

    let status: ContextStats['status'] = 'healthy';
    if (utilization >= CONTEXT_THRESHOLDS.CRITICAL) {
      status = 'critical';
    } else if (utilization >= CONTEXT_THRESHOLDS.CAUTION) {
      status = 'caution';
    } else if (utilization >= CONTEXT_THRESHOLDS.WARNING) {
      status = 'warning';
    }

    const stats: ContextStats = {
      sessionId: session.id,
      farmId: session.farmId,
      provider: session.provider,
      tokensUsed: session.tokenCount,
      maxTokens: session.maxTokens,
      utilization: Math.round(utilization * 100) / 100,
      status,
      messageCount: session.messages?.length || 0,
      lastActivity: session.lastAccessed,
      compressionEnabled: session.metadata?.compressionEnabled !== false,
      compressionCount: session.metadata?.compressionCount || 0
    };

    res.json({
      hasContext: true,
      stats,
      thresholds: CONTEXT_THRESHOLDS
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error getting context stats:', error);
    res.status(500).json({ error: 'Failed to get context stats' });
  }
});

/**
 * Get context stats for all active farms for a user
 * GET /api/context/user/:userId/all
 */
router.get('/user/:userId/all', requirePermission(['farms:read']), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get all active farms for this user
    const farmsResult = await db.query(
      `SELECT id, name, status FROM farms
       WHERE user_id = $1 AND status IN ('running', 'active', 'launching')
       ORDER BY updated_at DESC`,
      [userId]
    );

    const contextData = [];

    for (const farm of farmsResult.rows) {
      const session = await contextManager.getSessionByFarmId(farm.id);

      if (session) {
        const utilization = session.tokenCount / session.maxTokens;

        let status: ContextStats['status'] = 'healthy';
        if (utilization >= CONTEXT_THRESHOLDS.CRITICAL) {
          status = 'critical';
        } else if (utilization >= CONTEXT_THRESHOLDS.CAUTION) {
          status = 'caution';
        } else if (utilization >= CONTEXT_THRESHOLDS.WARNING) {
          status = 'warning';
        }

        contextData.push({
          farmId: farm.id,
          farmName: farm.name,
          farmStatus: farm.status,
          context: {
            tokensUsed: session.tokenCount,
            maxTokens: session.maxTokens,
            utilization: Math.round(utilization * 100) / 100,
            status,
            provider: session.provider,
            messageCount: session.messages?.length || 0
          }
        });
      }
    }

    res.json({
      totalFarms: farmsResult.rows.length,
      farmsWithContext: contextData.length,
      farms: contextData,
      summary: {
        totalTokensUsed: contextData.reduce((sum, f) => sum + f.context.tokensUsed, 0),
        criticalCount: contextData.filter(f => f.context.status === 'critical').length,
        cautionCount: contextData.filter(f => f.context.status === 'caution').length,
        warningCount: contextData.filter(f => f.context.status === 'warning').length
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error getting all context stats:', error);
    res.status(500).json({ error: 'Failed to get context stats' });
  }
});

/**
 * Manually trigger context compression for a farm
 * POST /api/context/:farmId/compress
 */
router.post('/:farmId/compress', requirePermission(['farms:control']), async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { targetUtilization = 0.5 } = req.body; // Default to compress to 50%

    const session = await contextManager.getSessionByFarmId(farmId);

    if (!session) {
      return res.status(404).json({ error: 'No active context session for this farm' });
    }

    const targetTokens = Math.floor(session.maxTokens * targetUtilization);
    const tokensToFree = session.tokenCount - targetTokens;

    if (tokensToFree <= 0) {
      return res.json({
        compressed: false,
        message: 'Context already below target utilization',
        currentUtilization: session.tokenCount / session.maxTokens
      });
    }

    await contextManager.compressContext(session.id, tokensToFree);

    // Get updated session
    const updatedSession = await contextManager.getSessionByFarmId(farmId);

    res.json({
      compressed: true,
      tokensBefore: session.tokenCount,
      tokensAfter: updatedSession?.tokenCount || 0,
      tokensFreed: session.tokenCount - (updatedSession?.tokenCount || 0),
      newUtilization: updatedSession ? updatedSession.tokenCount / updatedSession.maxTokens : 0
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error compressing context:', error);
    res.status(500).json({ error: 'Failed to compress context' });
  }
});

/**
 * Update context settings for a farm
 * PATCH /api/context/:farmId/settings
 */
router.patch('/:farmId/settings', requirePermission(['farms:control']), async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { compressionEnabled, autoCompressThreshold, windowSize } = req.body;

    const session = await contextManager.getSessionByFarmId(farmId);

    if (!session) {
      return res.status(404).json({ error: 'No active context session for this farm' });
    }

    // Update metadata
    const updates: Record<string, any> = {};

    if (typeof compressionEnabled === 'boolean') {
      updates.compressionEnabled = compressionEnabled;
    }
    if (typeof autoCompressThreshold === 'number' && autoCompressThreshold > 0 && autoCompressThreshold <= 1) {
      updates.autoCompressThreshold = autoCompressThreshold;
    }
    if (windowSize && ['standard', 'large', 'maximum'].includes(windowSize)) {
      updates.windowSize = windowSize;
    }

    await contextManager.updateSessionMetadata(session.id, updates);

    res.json({
      updated: true,
      settings: {
        compressionEnabled: updates.compressionEnabled ?? session.metadata?.compressionEnabled,
        autoCompressThreshold: updates.autoCompressThreshold ?? session.metadata?.autoCompressThreshold,
        windowSize: updates.windowSize ?? session.metadata?.windowSize ?? 'standard'
      }
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Error updating context settings:', error);
    res.status(500).json({ error: 'Failed to update context settings' });
  }
});

/**
 * Health check for context monitoring service
 * GET /api/context/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    res.json({
      status: 'healthy',
      service: 'context-monitoring',
      version: '1.0.0',
      timestamp: new Date(),
      thresholds: CONTEXT_THRESHOLDS
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: String(error) });
  }
});

export default router;
