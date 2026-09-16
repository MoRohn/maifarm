/**
 * API Routes for Enhancement Features
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
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
import { workspacePoolManager } from '../services/workspacePoolManager';
import { unifiedCacheService as resourceCacheService } from '../services/unified/stateCoordinator';
import { harvestIntegrityService } from '../services/harvestIntegrityService';
import { cleanupValidator } from '../services/cleanupValidator';
import { sandboxExecutor } from '../services/sandboxExecutor';
import { securityPolicyEngine } from '../services/securityPolicyEngine';
import { enhancementIntegration } from '../services/enhancementIntegration';

const router = Router();

/**
 * Enhancement Integration Status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const healthCheck = await enhancementIntegration.healthCheck();
    const stats = await enhancementIntegration.getStatistics();
    
    res.json({
      success: true,
      healthy: healthCheck.healthy,
      services: healthCheck.services,
      statistics: stats
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get enhancement status'
    });
  }
});

/**
 * Agent Health Monitoring
 */
router.get('/health/agents', async (req: Request, res: Response) => {
  try {
    const stats = await agentHealthMonitor.getStatistics();
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting agent health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get agent health statistics'
    });
  }
});

router.get('/health/agents/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const health = await agentHealthMonitor.getAgentHealth(agentId);
    
    res.json({
      success: true,
      agentId,
      health
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting agent health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get agent health'
    });
  }
});

router.post('/health/agents/:agentId/restart', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    await agentHealthMonitor.restartAgent(agentId);
    
    res.json({
      success: true,
      message: `Agent ${agentId} restart initiated`
    });
  } catch (error) {
    logger.error('[Enhancements API] Error restarting agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restart agent'
    });
  }
});

/**
 * Task Checkpoints
 */
router.get('/checkpoints/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const checkpoints = await taskCheckpointService.getTaskCheckpoints(taskId);
    
    res.json({
      success: true,
      taskId,
      checkpoints
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting checkpoints:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task checkpoints'
    });
  }
});

router.post('/checkpoints/tasks/:taskId/resume', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { agentId } = req.body;
    
    const result = await taskCheckpointService.resumeFromCheckpoint(taskId, agentId);
    
    res.json({
      success: true,
      taskId,
      agentId,
      resumed: result
    });
  } catch (error) {
    logger.error('[Enhancements API] Error resuming from checkpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume from checkpoint'
    });
  }
});

/**
 * Provider Metrics
 */
router.get('/providers/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await providerMetricsService.getAllMetrics();
    
    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting provider metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get provider metrics'
    });
  }
});

router.get('/providers/metrics/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const metrics = await providerMetricsService.getProviderMetrics(provider);
    
    res.json({
      success: true,
      provider,
      metrics
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting provider metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get provider metrics'
    });
  }
});

router.post('/providers/best', async (req: Request, res: Response) => {
  try {
    const { requirements } = req.body;
    const provider = await dynamicProviderRouter.selectBestProvider(requirements);
    
    res.json({
      success: true,
      provider,
      requirements
    });
  } catch (error) {
    logger.error('[Enhancements API] Error selecting provider:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to select best provider'
    });
  }
});

/**
 * Mixed Provider Orchestration
 */
router.post('/orchestration/translate', async (req: Request, res: Response) => {
  try {
    const { message, fromProvider, toProvider } = req.body;
    
    const translated = await mixedProviderOrchestrator.translateMessage(
      message,
      fromProvider,
      toProvider
    );
    
    res.json({
      success: true,
      original: message,
      translated,
      fromProvider,
      toProvider
    });
  } catch (error) {
    logger.error('[Enhancements API] Error translating message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to translate message'
    });
  }
});

/**
 * Workspace Pool
 */
router.get('/workspaces/pool/stats', async (req: Request, res: Response) => {
  try {
    const stats = workspacePoolManager.getStatistics();
    
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting workspace stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workspace pool statistics'
    });
  }
});

router.post('/workspaces/acquire', async (req: Request, res: Response) => {
  try {
    const requirements = req.body;
    const workspace = await workspacePoolManager.acquireWorkspace(requirements);
    
    res.json({
      success: true,
      workspace
    });
  } catch (error) {
    logger.error('[Enhancements API] Error acquiring workspace:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to acquire workspace'
    });
  }
});

router.post('/workspaces/:workspaceId/release', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    await workspacePoolManager.releaseWorkspace(workspaceId);
    
    res.json({
      success: true,
      message: `Workspace ${workspaceId} released`
    });
  } catch (error) {
    logger.error('[Enhancements API] Error releasing workspace:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to release workspace'
    });
  }
});

/**
 * Resource Cache
 */
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    const stats = resourceCacheService.getStatistics();
    
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache statistics'
    });
  }
});

router.post('/cache/warmup', async (req: Request, res: Response) => {
  try {
    const { farmId, resources } = req.body;
    await resourceCacheService.warmupForFarm(farmId, resources);
    
    res.json({
      success: true,
      message: `Cache warmed up for farm ${farmId}`,
      resourceCount: resources.length
    });
  } catch (error) {
    logger.error('[Enhancements API] Error warming cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to warm up cache'
    });
  }
});

router.delete('/cache/clear', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    
    if (type && ['barn', 'template', 'dependency'].includes(type as string)) {
      resourceCacheService.clearCache(type as any);
    } else {
      resourceCacheService.clearAll();
    }
    
    res.json({
      success: true,
      message: type ? `${type} cache cleared` : 'All caches cleared'
    });
  } catch (error) {
    logger.error('[Enhancements API] Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

/**
 * Harvest Integrity
 */
router.get('/harvests/:harvestId/integrity', async (req: Request, res: Response) => {
  try {
    const { harvestId } = req.params;
    const verification = await harvestIntegrityService.verifyHarvest(harvestId);
    
    res.json({
      success: true,
      harvestId,
      verification
    });
  } catch (error) {
    logger.error('[Enhancements API] Error verifying harvest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify harvest integrity'
    });
  }
});

router.post('/harvests/:harvestId/repair', async (req: Request, res: Response) => {
  try {
    const { harvestId } = req.params;
    const result = await harvestIntegrityService.repairIncompleteHarvest(harvestId);
    
    res.json({
      success: true,
      harvestId,
      repairResult: result
    });
  } catch (error) {
    logger.error('[Enhancements API] Error repairing harvest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to repair harvest'
    });
  }
});

router.get('/harvests/integrity/stats', async (req: Request, res: Response) => {
  try {
    const stats = await harvestIntegrityService.getStatistics();
    
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting integrity stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get integrity statistics'
    });
  }
});

/**
 * Cleanup Validation
 */
router.post('/cleanup/validate/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const validation = await cleanupValidator.validateFarmCleanup(farmId);
    
    res.json({
      success: true,
      farmId,
      validation
    });
  } catch (error) {
    logger.error('[Enhancements API] Error validating cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate cleanup'
    });
  }
});

router.get('/cleanup/stats', async (req: Request, res: Response) => {
  try {
    const stats = await cleanupValidator.getStatistics();
    
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting cleanup stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cleanup statistics'
    });
  }
});

/**
 * Sandbox Execution
 */
router.post('/sandbox/execute', async (req: Request, res: Response) => {
  try {
    const { command, args, config } = req.body;
    
    const execution = await sandboxExecutor.executeInSandbox(
      command,
      args || [],
      config
    );
    
    res.json({
      success: true,
      execution
    });
  } catch (error) {
    logger.error('[Enhancements API] Error executing in sandbox:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute in sandbox'
    });
  }
});

router.get('/sandbox/stats', async (req: Request, res: Response) => {
  try {
    const stats = await sandboxExecutor.getStatistics();
    
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting sandbox stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sandbox statistics'
    });
  }
});

/**
 * Security Policies
 */
router.post('/security/evaluate', async (req: Request, res: Response) => {
  try {
    const { action, resource, context } = req.body;
    
    const evaluation = await securityPolicyEngine.evaluateAction(
      action,
      resource,
      context
    );
    
    res.json({
      success: true,
      evaluation
    });
  } catch (error) {
    logger.error('[Enhancements API] Error evaluating security:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate security policy'
    });
  }
});

router.get('/security/policies', async (req: Request, res: Response) => {
  try {
    const policies = securityPolicyEngine.getAllPolicies();
    
    res.json({
      success: true,
      policies
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting policies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get security policies'
    });
  }
});

router.get('/security/policies/:policyId', async (req: Request, res: Response) => {
  try {
    const { policyId } = req.params;
    const policy = securityPolicyEngine.getPolicy(policyId);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        error: 'Policy not found'
      });
    }
    
    res.json({
      success: true,
      policy
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting policy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get security policy'
    });
  }
});

router.put('/security/policies/:policyId', async (req: Request, res: Response) => {
  try {
    const { policyId } = req.params;
    const updates = req.body;
    
    await securityPolicyEngine.updatePolicy(policyId, updates);
    
    res.json({
      success: true,
      message: `Policy ${policyId} updated`
    });
  } catch (error) {
    logger.error('[Enhancements API] Error updating policy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update security policy'
    });
  }
});

router.get('/security/violations/:farmId', async (req: Request, res: Response) => {
  try {
    const { farmId } = req.params;
    const violations = securityPolicyEngine.getFarmViolations(farmId);
    
    res.json({
      success: true,
      farmId,
      violations
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting violations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get security violations'
    });
  }
});

router.get('/security/stats', async (req: Request, res: Response) => {
  try {
    const stats = await securityPolicyEngine.getStatistics();
    
    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('[Enhancements API] Error getting security stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get security statistics'
    });
  }
});

export default router;