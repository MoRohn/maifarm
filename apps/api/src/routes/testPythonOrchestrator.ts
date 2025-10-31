/**
 * Test Routes for Python Orchestrator Integration
 * Demonstrates the new Python FastAPI orchestrator without modifying existing farm launch flow
 */

import { Router, Request, Response } from 'express';
import { pythonOrchestratorProxy } from '../services/pythonOrchestratorProxy';
import { pythonWebSocketBridge } from '../services/pythonWebSocketBridge';
import { logger, LogCategory } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * Test endpoint: Create a simple test farm using Python orchestrator
 * POST /api/test/python-farm
 */
router.post('/python-farm', async (req: Request, res: Response) => {
  try {
    const { prompt = 'Write a simple hello world script', agentCount = 2 } = req.body;

    const sessionId = `test-${uuidv4().substring(0, 8)}`;
    const farmId = `test-farm-${Date.now()}`;

    logger.info(LogCategory.FARM, 'Creating test farm via Python orchestrator', {
      farmId,
      sessionId,
      agentCount,
    });

    // Check if orchestrator is available
    if (!pythonOrchestratorProxy.isOrchestratorAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Python orchestrator not available',
        message: 'Make sure the Python orchestrator is running on port 8000',
        hint: 'Run: cd apps/orchestrator && ./start_orchestrator.sh',
      });
    }

    // Subscribe to Python WebSocket events for this session
    if (pythonWebSocketBridge.isConnected()) {
      pythonWebSocketBridge.subscribeToSession(sessionId);
      logger.info(LogCategory.FARM, 'Subscribed to Python WebSocket session', { sessionId });
    } else {
      logger.warn(LogCategory.FARM, 'Python WebSocket bridge not connected');
    }

    // Launch agents via Python orchestrator
    const agents = [];
    for (let i = 0; i < agentCount; i++) {
      const agentId = `agent-${i}`;
      const result = await pythonOrchestratorProxy.runAgent({
        sessionId,
        prompt: `${prompt} (Agent ${i})`,
        agentId,
        metadata: {
          farmId,
          agentIndex: i,
          testRun: true,
        },
      });

      if (result) {
        agents.push({
          agentId,
          runId: result.run_id,
          status: result.status,
        });
        logger.info(LogCategory.FARM, 'Agent launched via Python orchestrator', {
          agentId,
          runId: result.run_id,
        });
      } else {
        logger.error(LogCategory.FARM, 'Failed to launch agent via Python orchestrator', {
          agentId,
        });
      }
    }

    res.json({
      success: true,
      data: {
        farmId,
        sessionId,
        agents,
        orchestratorUrl: 'http://127.0.0.1:8000',
        websocketConnected: pythonWebSocketBridge.isConnected(),
        instructions: {
          viewActiveAgents: 'GET /api/python-orchestrator/active',
          viewFastAPIDocs: 'http://127.0.0.1:8000/docs',
          monitorInFrontend: `Join WebSocket room 'farm-${sessionId}' to see terminal output`,
        },
      },
    });
  } catch (error) {
    logger.error(LogCategory.FARM, 'Error creating test Python farm', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create test farm',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Test endpoint: Check Python orchestrator status
 * GET /api/test/python-status
 */
router.get('/python-status', async (req: Request, res: Response) => {
  const orchestratorAvailable = pythonOrchestratorProxy.isOrchestratorAvailable();
  const websocketConnected = pythonWebSocketBridge.isConnected();

  let activeAgents = [];
  if (orchestratorAvailable) {
    activeAgents = await pythonOrchestratorProxy.getActiveAgents();
  }

  res.json({
    success: true,
    data: {
      orchestratorAvailable,
      orchestratorUrl: process.env.PYTHON_ORCHESTRATOR_URL || 'http://127.0.0.1:8000',
      websocketConnected,
      websocketUrl: process.env.PYTHON_ORCHESTRATOR_WS_URL || 'http://127.0.0.1:8000',
      activeAgents: activeAgents.length,
      agents: activeAgents.map((a) => ({
        runId: a.run_id,
        agentId: a.agent_id,
        sessionId: a.session_id,
        phase: a.phase,
        tokensIn: a.tokens_in,
        tokensOut: a.tokens_out,
        idleSeconds: a.idle_seconds,
      })),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
