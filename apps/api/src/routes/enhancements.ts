import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
const agentHealthMonitor: any = {}; // Stub
import { taskCheckpointService } from '../services/taskCheckpointService';
import { providerMetricsService } from '../services/providerMetricsService';
import { aiProviderService } from '../services/unified/aiProviderService';

// Create dynamicProviderRouter facade
const dynamicProviderRouter = {
  route: (request: any) => aiProviderService.routeRequest(request),
  getOptimalProvider: () => aiProviderService.getOptimalProvider()
};

// Create mixedProviderOrchestrator facade
const mixedProviderOrchestrator = {
  orchestrate: (config: any) => aiProviderService.orchestrateMultiProvider(config),
  distributeLoad: (tasks: any[]) => aiProviderService.distributeTasksAcrossProviders(tasks)
};
import { enhancementIntegration } from '../services/enhancementIntegration';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// ==================== Health Monitoring Routes ====================

// Get agent health status
router.get('/health/agents/:agentId', async (req: AuthRequest, res: Response) => {
  try {
    const { agentId } = req.params;
    const health = await agentHealthMonitor.getAgentHealthStatus(agentId);
    
    if (!health) {
      return res.status(404).json({
        success: false,
        error: 'Agent health data not found'
      });
    }

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get farm health statistics
router.get('/health/farms/:farmId', async (req: AuthRequest, res: Response) => {
  try {
    const { farmId } = req.params;
    const stats = await agentHealthMonitor.getFarmHealthStats(farmId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all health statuses
router.get('/health/agents', async (req: AuthRequest, res: Response) => {
  try {
    const statuses = await agentHealthMonitor.getAllHealthStatuses();
    
    res.json({
      success: true,
      data: statuses,
      count: statuses.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== Checkpoint Routes ====================

// Get task checkpoints
router.get('/checkpoints/tasks/:taskId', async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const checkpoints = await taskCheckpointService.getTaskCheckpoints(taskId);
    
    res.json({
      success: true,
      data: checkpoints,
      count: checkpoints.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create manual checkpoint
router.post('/checkpoints', async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, agentId, farmId, stage, progress, state } = req.body;
    
    const checkpoint = await taskCheckpointService.createCheckpoint(
      taskId,
      agentId,
      farmId,
      stage,
      progress,
      state
    );
    
    res.json({
      success: true,
      data: checkpoint
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Resume from checkpoint
router.post('/checkpoints/:checkpointId/resume', async (req: AuthRequest, res: Response) => {
  try {
    const { checkpointId } = req.params;
    const { newAgentId } = req.body;
    
    const result = await taskCheckpointService.resumeFromCheckpoint(
      checkpointId,
      newAgentId
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get checkpoint statistics
router.get('/checkpoints/stats', async (req: AuthRequest, res: Response) => {
  try {
    const stats = await taskCheckpointService.getCheckpointStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== Provider Metrics Routes ====================

// Get all provider metrics
router.get('/providers/metrics', async (req: AuthRequest, res: Response) => {
  try {
    const metrics = await providerMetricsService.getAllMetrics();
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific provider metrics
router.get('/providers/:provider/metrics', async (req: AuthRequest, res: Response) => {
  try {
    const { provider } = req.params;
    const metrics = await providerMetricsService.getProviderMetrics(provider);
    
    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: 'Provider metrics not found'
      });
    }

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get provider recommendations
router.post('/providers/recommend', async (req: AuthRequest, res: Response) => {
  try {
    const { taskType } = req.body;
    const recommendations = await providerMetricsService.getProviderRecommendations(
      taskType || 'general'
    );
    
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get optimal provider for requirements
router.post('/providers/optimal', async (req: AuthRequest, res: Response) => {
  try {
    const requirements = req.body;
    const provider = await providerMetricsService.getOptimalProvider(requirements);
    
    res.json({
      success: true,
      data: { provider }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== Dynamic Routing Routes ====================

// Route an AI request
router.post('/route', async (req: AuthRequest, res: Response) => {
  try {
    const request = req.body;
    const response = await dynamicProviderRouter.routeRequest(request);
    
    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get routing statistics
router.get('/route/stats', async (req: AuthRequest, res: Response) => {
  try {
    const stats = await dynamicProviderRouter.getRoutingStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get active requests
router.get('/route/active', async (req: AuthRequest, res: Response) => {
  try {
    const activeRequests = dynamicProviderRouter.getActiveRequests();
    
    res.json({
      success: true,
      data: activeRequests,
      count: activeRequests.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== Mixed Provider Routes ====================

// Launch mixed provider farm
router.post('/mixed/farms', async (req: AuthRequest, res: Response) => {
  try {
    const config = req.body;
    const result = await mixedProviderOrchestrator.launchMixedFarm(config);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get mixed farm statistics
router.get('/mixed/stats', async (req: AuthRequest, res: Response) => {
  try {
    const stats = await mixedProviderOrchestrator.getMixedFarmStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Shutdown mixed farm
router.delete('/mixed/farms/:farmId', async (req: AuthRequest, res: Response) => {
  try {
    const { farmId } = req.params;
    await mixedProviderOrchestrator.shutdownMixedFarm(farmId);
    
    res.json({
      success: true,
      message: `Mixed farm ${farmId} shut down successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== Overall Enhancement Statistics ====================

// Get all enhancement statistics
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const stats = await enhancementIntegration.getEnhancementStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Initialize enhancements (admin only)
router.post('/initialize', async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is admin (you may want to add proper admin check)
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    await enhancementIntegration.initialize();
    
    res.json({
      success: true,
      message: 'Enhancements initialized successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Shutdown enhancements (admin only)
router.post('/shutdown', async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    await enhancementIntegration.shutdown();
    
    res.json({
      success: true,
      message: 'Enhancements shut down successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;