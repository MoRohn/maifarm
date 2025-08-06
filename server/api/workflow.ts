import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { apiRateLimits } from '../middleware/rateLimit';
import { workflowService } from '../services/workflowService';
import { ApiResponse } from '../types/api';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// POST /api/workflow/execute - Execute a complete Seeds→Farms→Harvest→Barn workflow
router.post('/execute', apiRateLimits.write, async (req: AuthRequest, res: Response) => {
  try {
    const userId = (req as any).user?.userId || 'default-user';
    const { seedId, farmName, farmDescription, config, autoHarvest, autoStore } = req.body;

    if (!seedId || !farmName) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'seedId and farmName are required'
        }
      };
      return res.status(400).json(response);
    }

    const result = await workflowService.executeWorkflow({
      seedId,
      farmName,
      farmDescription,
      config,
      userId,
      autoHarvest,
      autoStore
    });

    const response: ApiResponse = {
      success: true,
      data: result
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error executing workflow:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to execute workflow'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/workflow/:id/status - Get workflow status
router.get('/:id/status', apiRateLimits.read, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const status = workflowService.getWorkflowStatus(id);

    if (!status) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Workflow not found'
        }
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: status
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting workflow status:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get workflow status'
      }
    };
    res.status(500).json(response);
  }
});

// GET /api/workflow/active - Get all active workflows
router.get('/active', apiRateLimits.read, async (req: AuthRequest, res: Response) => {
  try {
    const workflows = workflowService.getAllActiveWorkflows();

    const response: ApiResponse = {
      success: true,
      data: workflows,
      meta: {
        count: workflows.length
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting active workflows:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get active workflows'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/workflow/:id/cancel - Cancel a workflow
router.post('/:id/cancel', apiRateLimits.write, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const cancelled = await workflowService.cancelWorkflow(id);

    if (!cancelled) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: 'Workflow not found or already completed'
        }
      };
      return res.status(400).json(response);
    }

    const response: ApiResponse = {
      success: true,
      data: { workflowId: id, status: 'cancelled' }
    };

    res.json(response);
  } catch (error) {
    console.error('Error cancelling workflow:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cancel workflow'
      }
    };
    res.status(500).json(response);
  }
});

// POST /api/workflow/demo-seeds - Create demo seed templates
router.post('/demo-seeds', apiRateLimits.write, async (req: AuthRequest, res: Response) => {
  try {
    const userId = (req as any).user?.userId || 'default-user';
    const seeds = await workflowService.createDemoSeeds(userId);

    const response: ApiResponse = {
      success: true,
      data: seeds,
      meta: {
        count: seeds.length
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error creating demo seeds:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create demo seeds'
      }
    };
    res.status(500).json(response);
  }
});

export default router;