/**
 * Modeling API Endpoints
 *
 * REST API for Problem Models (Model-First Reasoning) and
 * Causal Models (DEMOCRITUS Pipeline)
 *
 * Based on:
 * - arxiv 2512.14474 (Model-First Reasoning LLM Agents)
 * - arxiv 2512.07796 (Large Causal Models / DEMOCRITUS)
 */

import { Router, Request, Response } from 'express';
import { ProblemModelingService } from '../services/ProblemModelingService.js';
import { CausalModelingService } from '../services/CausalModelingService.js';
import { db } from '../database/connection.js';
import { logger, LogCategory } from '../utils/logger.js';

const router = Router();

// Get singleton instances
const problemModelingService = ProblemModelingService.getInstance();
const causalModelingService = CausalModelingService.getInstance();

/**
 * GET /api/modeling/problem/:farmId
 * Get the problem model for a specific farm
 */
router.get('/problem/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    if (!farmId) {
      return res.status(400).json({
        success: false,
        error: 'Farm ID is required',
      });
    }

    // Try to get from service cache first
    let model = await problemModelingService.getModel(farmId);

    // If not in cache, try database
    if (!model) {
      const result = await db.query(
        `SELECT * FROM problem_models WHERE farm_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [farmId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        model = {
          id: row.id,
          farmId: row.farm_id,
          version: row.version,
          entities: row.entities,
          variables: row.variables,
          actions: row.actions,
          constraints: row.constraints,
          goals: row.goals,
          verified: row.verified,
          verificationScore: row.verification_score,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
    }

    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Problem model not found for this farm',
      });
    }

    res.json({
      success: true,
      data: model,
    });
  } catch (error) {
    logger.error(LogCategory.FARM, `Error fetching problem model: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch problem model',
    });
  }
});

/**
 * POST /api/modeling/problem/generate
 * Generate a new problem model for a farm prompt
 */
router.post('/problem/generate', async (req: Request, res: Response) => {
  try {
    const { farmId, prompt, mode = 'HARVEST' } = req.body;

    if (!farmId || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Farm ID and prompt are required',
      });
    }

    logger.info(LogCategory.FARM, `Generating problem model for farm ${farmId}`);

    const model = await problemModelingService.generateModel({
      farmId,
      prompt,
      mode,
    });

    res.json({
      success: true,
      data: model,
    });
  } catch (error) {
    logger.error(LogCategory.FARM, `Error generating problem model: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to generate problem model',
    });
  }
});

/**
 * GET /api/modeling/causal/:farmId
 * Get the causal model for a specific farm
 */
router.get('/causal/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    if (!farmId) {
      return res.status(400).json({
        success: false,
        error: 'Farm ID is required',
      });
    }

    // Try to get from service cache first
    let model = await causalModelingService.getModel(farmId);

    // If not in cache, try database
    if (!model) {
      const result = await db.query(
        `SELECT * FROM causal_models WHERE farm_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [farmId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        model = {
          id: row.id,
          farmId: row.farm_id,
          problemModelId: row.problem_model_id,
          version: row.version,
          triples: row.triples,
          graph: {
            nodes: row.graph_nodes,
            edges: row.graph_edges,
            topologicalOrder: row.topological_order || [],
            isDAG: true, // Computed from cycles
            stats: {
              nodeCount: row.graph_nodes?.length || 0,
              edgeCount: row.graph_edges?.length || 0,
              rootCount: 0,
              leafCount: 0,
              maxDepth: 0,
              avgConfidence: 0,
              componentCount: 1,
            },
          },
          conflicts: row.conflicts || [],
          topologicalOrder: row.topological_order || [],
          conflictResolutionStatus: row.conflict_resolution_status || 'pending',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
    }

    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Causal model not found for this farm',
      });
    }

    res.json({
      success: true,
      data: model,
    });
  } catch (error) {
    logger.error(LogCategory.FARM, `Error fetching causal model: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch causal model',
    });
  }
});

/**
 * POST /api/modeling/causal/generate
 * Generate a new causal model for a farm prompt
 */
router.post('/causal/generate', async (req: Request, res: Response) => {
  try {
    const { farmId, prompt, problemModel } = req.body;

    if (!farmId || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Farm ID and prompt are required',
      });
    }

    logger.info(LogCategory.FARM, `Generating causal model for farm ${farmId}`);

    const model = await causalModelingService.extractCausalModel({
      farmId,
      prompt,
      problemModel,
    });

    res.json({
      success: true,
      data: model,
    });
  } catch (error) {
    logger.error(LogCategory.FARM, `Error generating causal model: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to generate causal model',
    });
  }
});

/**
 * GET /api/modeling/agent-context/:farmId/:agentId
 * Get combined model context for a specific agent
 */
router.get('/agent-context/:farmId/:agentId', async (req: Request, res: Response) => {
  try {
    const { farmId, agentId } = req.params;

    if (!farmId || !agentId) {
      return res.status(400).json({
        success: false,
        error: 'Farm ID and Agent ID are required',
      });
    }

    const problemModel = await problemModelingService.getModel(farmId);
    const causalModel = await causalModelingService.getModel(farmId);

    const context: Record<string, unknown> = {};

    if (problemModel) {
      context.problemContext = problemModelingService.generateAgentContext(
        problemModel,
        agentId
      );
    }

    if (causalModel) {
      context.causalContext = causalModelingService.generateAgentCausalContext(
        causalModel,
        agentId
      );
    }

    res.json({
      success: true,
      data: context,
    });
  } catch (error) {
    logger.error(LogCategory.FARM, `Error fetching agent context: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agent context',
    });
  }
});

/**
 * POST /api/modeling/verify/:farmId
 * Verify agent output against the problem model
 */
router.post('/verify/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const { agentOutput } = req.body;

    if (!farmId || !agentOutput) {
      return res.status(400).json({
        success: false,
        error: 'Farm ID and agent output are required',
      });
    }

    const problemModel = await problemModelingService.getModel(farmId);

    if (!problemModel) {
      return res.status(404).json({
        success: false,
        error: 'Problem model not found for this farm',
      });
    }

    const result = await problemModelingService.verifyOutput(
      problemModel,
      agentOutput
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(LogCategory.FARM, `Error verifying output: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to verify output',
    });
  }
});

/**
 * GET /api/modeling/stats/:farmId
 * Get modeling statistics for a farm
 */
router.get('/stats/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    const problemModel = await problemModelingService.getModel(farmId);
    const causalModel = await causalModelingService.getModel(farmId);

    const stats = {
      hasProblemModel: !!problemModel,
      hasCausalModel: !!causalModel,
      problemModel: problemModel
        ? {
            entityCount: problemModel.entities?.length || 0,
            variableCount: problemModel.variables?.length || 0,
            actionCount: problemModel.actions?.length || 0,
            constraintCount: problemModel.constraints?.length || 0,
            goalCount: problemModel.goals?.length || 0,
            verified: problemModel.verified,
            verificationScore: problemModel.verificationScore,
          }
        : null,
      causalModel: causalModel
        ? {
            tripleCount: causalModel.triples?.length || 0,
            nodeCount: causalModel.graph?.stats?.nodeCount || 0,
            edgeCount: causalModel.graph?.stats?.edgeCount || 0,
            conflictCount: causalModel.conflicts?.length || 0,
            unresolvedConflicts: causalModel.conflicts?.filter(
              (c: { resolved: boolean }) => !c.resolved
            ).length || 0,
            isDAG: causalModel.graph?.isDAG,
            conflictResolutionStatus: causalModel.conflictResolutionStatus,
          }
        : null,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error(LogCategory.FARM, `Error fetching modeling stats: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch modeling stats',
    });
  }
});

/**
 * DELETE /api/modeling/:farmId
 * Clear models for a farm
 */
router.delete('/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;

    // Clear from database
    await db.query('DELETE FROM causal_models WHERE farm_id = $1', [farmId]);
    await db.query('DELETE FROM problem_models WHERE farm_id = $1', [farmId]);

    // Clear from service caches
    problemModelingService.clearCache(farmId);
    causalModelingService.clearCache(farmId);

    logger.info(LogCategory.FARM, `Cleared models for farm ${farmId}`);

    res.json({
      success: true,
      message: 'Models cleared successfully',
    });
  } catch (error) {
    logger.error(LogCategory.FARM, `Error clearing models: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to clear models',
    });
  }
});

export default router;
