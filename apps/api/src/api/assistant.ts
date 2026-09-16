/**
 * Assistant API Endpoints
 *
 * Handles nudge dispatch from iOS Assistant to Orchestrator
 * and provides session context management endpoints
 */

import { Router, Request, Response } from 'express';
import { logger, LogCategory } from '../utils/logger';
import { getSocketServer } from '../websocket/socketServer';
import { db } from '../database/connection';

const router = Router();

// Nudge request interface
interface NudgeRequest {
  nudge_id: string;
  session_id: string;
  message: string;
  timestamp: string;
}

// Nudge response interface
interface NudgeResponse {
  success: boolean;
  nudge_id: string;
  acknowledged: boolean;
  message?: string;
}

/**
 * POST /api/assistant/nudge
 * Receives a nudge from the iOS Assistant and forwards to Orchestrator
 */
router.post('/nudge', async (req: Request, res: Response) => {
  try {
    const nudgeRequest: NudgeRequest = req.body;

    // Validate request
    if (!nudgeRequest.nudge_id || !nudgeRequest.session_id || !nudgeRequest.message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: nudge_id, session_id, message',
      });
    }

    logger.info(LogCategory.API, 'Received nudge from Assistant', {
      nudgeId: nudgeRequest.nudge_id,
      sessionId: nudgeRequest.session_id,
    });

    // Get the socket server to broadcast the nudge
    const io = getSocketServer();

    // Broadcast nudge to all connected clients for this session
    io.to(`session:${nudgeRequest.session_id}`).emit('assistant:nudge', {
      nudgeId: nudgeRequest.nudge_id,
      sessionId: nudgeRequest.session_id,
      message: nudgeRequest.message,
      timestamp: nudgeRequest.timestamp || new Date().toISOString(),
    });

    // Also broadcast to the orchestrator room
    io.to(`orchestrator:${nudgeRequest.session_id}`).emit('assistant:nudge', {
      nudgeId: nudgeRequest.nudge_id,
      sessionId: nudgeRequest.session_id,
      message: nudgeRequest.message,
      timestamp: nudgeRequest.timestamp || new Date().toISOString(),
    });

    // Store nudge in database for history
    await storeNudge(nudgeRequest);

    // Forward to Python orchestrator if available
    await forwardToOrchestrator(nudgeRequest);

    const response: NudgeResponse = {
      success: true,
      nudge_id: nudgeRequest.nudge_id,
      acknowledged: true,
      message: 'Nudge dispatched to orchestrator',
    };

    logger.info(LogCategory.API, 'Nudge dispatched successfully', {
      nudgeId: nudgeRequest.nudge_id,
    });

    return res.status(200).json(response);
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to process nudge', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to process nudge',
    });
  }
});

/**
 * POST /api/assistant/nudge/:nudgeId/ack
 * Acknowledges a nudge from the orchestrator
 */
router.post('/nudge/:nudgeId/ack', async (req: Request, res: Response) => {
  try {
    const { nudgeId } = req.params;
    const { response: ackResponse } = req.body;

    logger.info(LogCategory.API, 'Nudge acknowledged', { nudgeId });

    // Broadcast acknowledgment
    const io = getSocketServer();
    io.emit('assistant:nudge:ack', {
      nudgeId,
      response: ackResponse,
      timestamp: new Date().toISOString(),
    });

    // Update nudge record in database
    await updateNudgeAck(nudgeId, ackResponse);

    return res.status(200).json({
      success: true,
      nudge_id: nudgeId,
      acknowledged: true,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to acknowledge nudge', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to acknowledge nudge',
    });
  }
});

/**
 * GET /api/assistant/sessions/:sessionId/summary
 * Returns the current assistant summary for a session
 */
router.get('/sessions/:sessionId/summary', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Get summary from database or file system
    const summary = await getSessionSummary(sessionId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Summary not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        sessionId,
        summary,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get session summary', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get session summary',
    });
  }
});

/**
 * GET /api/assistant/sessions/:sessionId/context
 * Returns the current context snapshot for a session
 */
router.get('/sessions/:sessionId/context', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const context = await getSessionContext(sessionId);

    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'Context not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: context,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get session context', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get session context',
    });
  }
});

/**
 * GET /api/assistant/sessions/:sessionId/nudges
 * Returns nudge history for a session
 */
router.get('/sessions/:sessionId/nudges', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const nudges = await getNudgeHistory(sessionId);

    return res.status(200).json({
      success: true,
      data: nudges,
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to get nudge history', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to get nudge history',
    });
  }
});

/**
 * DELETE /api/assistant/sessions/:sessionId
 * Deletes all assistant data for a session
 */
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    await deleteSessionData(sessionId);

    logger.info(LogCategory.API, 'Session data deleted', { sessionId });

    return res.status(200).json({
      success: true,
      message: 'Session data deleted',
    });
  } catch (error) {
    logger.error(LogCategory.API, 'Failed to delete session data', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to delete session data',
    });
  }
});

// Helper functions

async function storeNudge(nudge: NudgeRequest): Promise<void> {
  const query = `
    INSERT INTO assistant_nudges (
      nudge_id, session_id, message, timestamp, acknowledged
    ) VALUES ($1, $2, $3, $4, false)
    ON CONFLICT (nudge_id) DO NOTHING
  `;

  try {
    await db.query(query, [
      nudge.nudge_id,
      nudge.session_id,
      nudge.message,
      nudge.timestamp || new Date().toISOString(),
    ]);
  } catch (error) {
    // Table might not exist yet - log and continue
    logger.warn(LogCategory.DATABASE, 'Failed to store nudge (table may not exist)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function updateNudgeAck(nudgeId: string, response: string): Promise<void> {
  const query = `
    UPDATE assistant_nudges
    SET acknowledged = true, ack_response = $2, ack_timestamp = NOW()
    WHERE nudge_id = $1
  `;

  try {
    await db.query(query, [nudgeId, response]);
  } catch (error) {
    logger.warn(LogCategory.DATABASE, 'Failed to update nudge ack', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function forwardToOrchestrator(nudge: NudgeRequest): Promise<void> {
  try {
    // Forward to Python orchestrator via HTTP
    const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:8000';
    const response = await fetch(`${orchestratorUrl}/api/nudge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nudge_id: nudge.nudge_id,
        session_id: nudge.session_id,
        message: nudge.message,
        timestamp: nudge.timestamp,
      }),
    });

    if (!response.ok) {
      logger.warn(LogCategory.API, 'Orchestrator returned non-OK response', {
        status: response.status,
      });
    }
  } catch (error) {
    // Orchestrator might not be running - this is okay
    logger.debug(LogCategory.API, 'Could not forward to orchestrator', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getSessionSummary(sessionId: string): Promise<string | null> {
  // Try database first
  try {
    const result = await db.query(
      'SELECT summary FROM assistant_summaries WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
      [sessionId]
    );
    if (result.rows.length > 0) {
      return result.rows[0].summary;
    }
  } catch {
    // Table might not exist
  }

  return null;
}

async function getSessionContext(sessionId: string): Promise<object | null> {
  try {
    const result = await db.query(
      'SELECT context FROM assistant_contexts WHERE session_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [sessionId]
    );
    if (result.rows.length > 0) {
      return result.rows[0].context;
    }
  } catch {
    // Table might not exist
  }

  return null;
}

async function getNudgeHistory(sessionId: string): Promise<object[]> {
  try {
    const result = await db.query(
      'SELECT * FROM assistant_nudges WHERE session_id = $1 ORDER BY timestamp DESC',
      [sessionId]
    );
    return result.rows;
  } catch {
    return [];
  }
}

async function deleteSessionData(sessionId: string): Promise<void> {
  const queries = [
    'DELETE FROM assistant_nudges WHERE session_id = $1',
    'DELETE FROM assistant_summaries WHERE session_id = $1',
    'DELETE FROM assistant_contexts WHERE session_id = $1',
    'DELETE FROM assistant_events WHERE session_id = $1',
  ];

  for (const query of queries) {
    try {
      await db.query(query, [sessionId]);
    } catch {
      // Table might not exist - continue
    }
  }
}

export default router;
