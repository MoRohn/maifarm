/**
 * Advanced Terminal API Routes
 *
 * Endpoints for advanced terminal streaming, yield detection, and incubation
 */

import { Router, Request, Response } from 'express';
import { logger, LogCategory } from '../utils/logger';
import { advancedTerminalStreamService } from '../services/AdvancedTerminalStreamService';
import { intelligentYieldDetectionService } from '../services/IntelligentYieldDetectionService';
import { db } from '../database/connection';
import { verifyToken, requirePermission, Permission } from '../middleware/enhancedRBAC';
import { z } from 'zod';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateSessionSchema = z.object({
  farmId: z.string().uuid(),
  agentId: z.number().int().min(0),
  agentName: z.string().min(1),
  sessionName: z.string().min(1),
  userPrompt: z.string().min(1)
});

const YieldDetectionSchema = z.object({
  farmId: z.string().uuid(),
  agentId: z.number().int().min(0),
  filePath: z.string().min(1),
  content: z.string(),
  activity: z.string().optional()
});

const IncubateYieldSchema = z.object({
  yieldId: z.string().min(1),
  prompt: z.string().min(1),
  agentCount: z.number().int().min(1).max(10).default(1),
  timeout: z.number().int().min(60).max(7200).default(1800)
});

// ============================================================================
// Terminal Streaming Endpoints
// ============================================================================

/**
 * Create advanced terminal stream session
 */
router.post('/sessions', verifyToken, async (req: Request, res: Response) => {
  try {
    const validated = CreateSessionSchema.parse(req.body);

    await advancedTerminalStreamService.createSession(
      validated.farmId,
      validated.agentId,
      validated.agentName,
      validated.sessionName,
      validated.userPrompt
    );

    res.json({
      success: true,
      sessionKey: `${validated.farmId}:${validated.agentId}`,
      message: 'Stream session created successfully'
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to create stream session', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create stream session'
    });
  }
});

/**
 * Get session statistics
 */
router.get('/sessions/:farmId/:agentId/stats', verifyToken, async (req: Request, res: Response) => {
  try {
    const { farmId, agentId } = req.params;
    const stats = advancedTerminalStreamService.getSessionStatistics(
      farmId,
      parseInt(agentId)
    );

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to get session stats', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get session statistics'
    });
  }
});

/**
 * Get recent messages
 */
router.get('/sessions/:farmId/:agentId/messages', verifyToken, async (req: Request, res: Response) => {
  try {
    const { farmId, agentId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const important = req.query.important === 'true';

    const messages = important
      ? advancedTerminalStreamService.getImportantMessages(farmId, parseInt(agentId))
      : advancedTerminalStreamService.getRecentMessages(farmId, parseInt(agentId), limit);

    res.json({
      success: true,
      messages,
      count: messages.length
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to get messages', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get messages'
    });
  }
});

/**
 * Get session yields
 */
router.get('/sessions/:farmId/:agentId/yields', verifyToken, async (req: Request, res: Response) => {
  try {
    const { farmId, agentId } = req.params;
    const yields = advancedTerminalStreamService.getSessionYields(
      farmId,
      parseInt(agentId)
    );

    res.json({
      success: true,
      yields,
      count: yields.length
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to get yields', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get yields'
    });
  }
});

/**
 * Close session
 */
router.delete('/sessions/:farmId/:agentId', verifyToken, async (req: Request, res: Response) => {
  try {
    const { farmId, agentId } = req.params;
    await advancedTerminalStreamService.closeSession(farmId, parseInt(agentId));

    res.json({
      success: true,
      message: 'Session closed successfully'
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to close session', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to close session'
    });
  }
});

// ============================================================================
// Yield Detection Endpoints
// ============================================================================

/**
 * Initialize yield detection for a farm
 */
router.post('/yields/initialize', verifyToken, async (req: Request, res: Response) => {
  try {
    const { farmId, userPrompt, agentNames, harvestId } = req.body;

    const agentMap = new Map<number, string>();
    Object.entries(agentNames).forEach(([id, name]) => {
      agentMap.set(parseInt(id), name as string);
    });

    await intelligentYieldDetectionService.initializeFarm(
      farmId,
      userPrompt,
      agentMap,
      harvestId
    );

    res.json({
      success: true,
      message: 'Yield detection initialized'
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to initialize yield detection', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initialize yield detection'
    });
  }
});

/**
 * Detect yield from content
 */
router.post('/yields/detect', verifyToken, async (req: Request, res: Response) => {
  try {
    const validated = YieldDetectionSchema.parse(req.body);

    const yieldItem = await intelligentYieldDetectionService.detectYield(
      validated.farmId,
      validated.agentId,
      validated.filePath,
      validated.content,
      validated.activity
    );

    res.json({
      success: true,
      yield: yieldItem,
      detected: yieldItem !== null
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to detect yield', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to detect yield'
    });
  }
});

/**
 * Get farm yields
 */
router.get('/yields/farm/:farmId', verifyToken, async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const type = req.query.type as string | undefined;
    const quality = req.query.quality === 'high';
    const incubatable = req.query.incubatable === 'true';

    let yields;
    if (type) {
      yields = intelligentYieldDetectionService.getYieldsByType(farmId, type as any);
    } else if (quality) {
      yields = intelligentYieldDetectionService.getHighQualityYields(farmId);
    } else if (incubatable) {
      yields = intelligentYieldDetectionService.getIncubationCandidates(farmId);
    } else {
      yields = intelligentYieldDetectionService.getFarmYields(farmId);
    }

    res.json({
      success: true,
      yields,
      count: yields.length
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to get farm yields', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get farm yields'
    });
  }
});

/**
 * Save yields to database
 */
router.post('/yields/save/:farmId', verifyToken, async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    await intelligentYieldDetectionService.saveYields(farmId);

    res.json({
      success: true,
      message: 'Yields saved successfully'
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to save yields', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save yields'
    });
  }
});

// ============================================================================
// Incubation Endpoints
// ============================================================================

/**
 * Incubate a yield
 */
router.post('/incubate', verifyToken, requirePermission(Permission.FARM_CREATE), async (req: Request, res: Response) => {
  try {
    const validated = IncubateYieldSchema.parse(req.body);
    const userId = (req as any).user?.id;

    // Get the yield from database
    const yieldResult = await db.query(`
      SELECT * FROM yields WHERE id = $1
    `, [validated.yieldId]);

    if (yieldResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Yield not found'
      });
    }

    const yieldItem = yieldResult.rows[0];

    // Create incubation farm
    const incubationName = `Incubate: ${yieldItem.title}`;
    const incubationPrompt = `
      ${validated.prompt}

      Context: You are improving the following yield:
      - Title: ${yieldItem.title}
      - Type: ${yieldItem.type}
      - Path: ${yieldItem.path}
      - Current Quality: ${yieldItem.quality_grade} (${yieldItem.quality_score}%)
      - Improvement Areas: ${JSON.stringify(yieldItem.incubation?.improvementAreas || [])}

      Original Content:
      ${yieldItem.content || yieldItem.preview}
    `;

    // Create the incubation farm
    const farmResult = await db.query(`
      INSERT INTO farms (
        id, name, status, mode, user_prompt,
        user_id, agent_count, timeout_seconds,
        parent_yield_id, created_at
      ) VALUES (
        gen_random_uuid(), $1, 'launching', 'incubation', $2,
        $3, $4, $5, $6, NOW()
      ) RETURNING *
    `, [
      incubationName,
      incubationPrompt,
      userId,
      validated.agentCount,
      validated.timeout,
      validated.yieldId
    ]);

    const farm = farmResult.rows[0];

    // Update yield with incubation farm ID
    await db.query(`
      UPDATE yields
      SET incubation_farm_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [farm.id, validated.yieldId]);

    // TODO: Launch the farm through orchestrator

    res.json({
      success: true,
      farmId: farm.id,
      message: 'Incubation started successfully'
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to incubate yield', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to incubate yield'
    });
  }
});

/**
 * Get incubation status
 */
router.get('/incubate/:yieldId/status', verifyToken, async (req: Request, res: Response) => {
  try {
    const { yieldId } = req.params;

    const result = await db.query(`
      SELECT
        y.id, y.title, y.incubation_farm_id,
        f.id as farm_id, f.name as farm_name, f.status as farm_status,
        f.agent_count, f.timeout_seconds, f.created_at as started_at
      FROM yields y
      LEFT JOIN farms f ON f.id = y.incubation_farm_id
      WHERE y.id = $1
    `, [yieldId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Yield not found'
      });
    }

    const data = result.rows[0];

    res.json({
      success: true,
      incubation: {
        yieldId: data.id,
        yieldTitle: data.title,
        farmId: data.farm_id,
        farmName: data.farm_name,
        status: data.farm_status || 'not_started',
        agentCount: data.agent_count,
        timeoutSeconds: data.timeout_seconds,
        startedAt: data.started_at,
        isIncubating: data.incubation_farm_id !== null
      }
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to get incubation status', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get incubation status'
    });
  }
});

/**
 * Get incubation results
 */
router.get('/incubate/:yieldId/results', verifyToken, async (req: Request, res: Response) => {
  try {
    const { yieldId } = req.params;

    // Get improved yields from incubation
    const result = await db.query(`
      SELECT * FROM yields
      WHERE parent_yield_id = $1
      ORDER BY quality_score DESC, created_at DESC
    `, [yieldId]);

    res.json({
      success: true,
      improvedYields: result.rows,
      count: result.rows.length
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to get incubation results', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get incubation results'
    });
  }
});

// ============================================================================
// Health & Metrics
// ============================================================================

/**
 * Get advanced terminal health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const sessions = advancedTerminalStreamService.getAllSessions();
    const activeSessions = sessions.filter(s => s.isActive);

    const metrics = {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      totalMessages: sessions.reduce((acc, s) => acc + s.statistics.totalMessages, 0),
      totalYields: sessions.reduce((acc, s) => acc + s.yields.length, 0),
      avgMessagesPerSession: sessions.length > 0
        ? Math.round(sessions.reduce((acc, s) => acc + s.statistics.totalMessages, 0) / sessions.length)
        : 0,
      avgYieldsPerSession: sessions.length > 0
        ? (sessions.reduce((acc, s) => acc + s.yields.length, 0) / sessions.length).toFixed(1)
        : 0
    };

    res.json({
      success: true,
      healthy: true,
      metrics
    });
  } catch (error: any) {
    logger.error(LogCategory.API, 'Failed to get health metrics', error);
    res.status(500).json({
      success: false,
      healthy: false,
      error: error.message || 'Failed to get health metrics'
    });
  }
});

export default router;