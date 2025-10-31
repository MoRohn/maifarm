/**
 * Enhancement Integration Service
 * Wires together all reliability and robustness improvements
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// Import all enhancement services
import { agentHealthMonitor } from './agentHealthMonitor';
import { taskCheckpointService } from './taskCheckpointService';
import { providerMetricsService } from './providerMetricsService';
import { dynamicProviderRouter } from './dynamicProviderRouter';
import { universalAgentProtocol } from '../protocols/universalAgentProtocol';
import { mixedProviderOrchestrator } from './mixedProviderOrchestrator';

// Import existing services to integrate with
import { agentManager } from './agentManager';
import { farmService } from './unified/farmService';
import { orchestratorService } from './OrchestratorService';
import { harvestService } from './unified/harvestService';
import { websocketManager } from '../websocket/websocketManager';

export class EnhancementIntegration extends EventEmitter {
  private initialized = false;

  /**
   * Initialize all enhancement services and integrate with existing system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('[EnhancementIntegration] Already initialized');
      return;
    }

    try {
      logger.info('[EnhancementIntegration] Initializing reliability enhancements...');

      // 1. Set up Agent Health Monitoring
      await this.setupAgentHealthMonitoring();

      // 2. Set up Task Checkpointing
      await this.setupTaskCheckpointing();

      // 3. Set up Provider Metrics and Load Balancing
      await this.setupLoadBalancing();

      // 4. Set up Cross-Provider Collaboration
      await this.setupCrossProviderCollaboration();

      // 5. Set up Event Handlers
      this.setupEventHandlers();

      // 6. Set up WebSocket Integrations
      this.setupWebSocketIntegrations();

      this.initialized = true;
      logger.info('[EnhancementIntegration] All enhancements initialized successfully');

      // Emit initialization complete event
      this.emit('enhancements:initialized');

    } catch (error) {
      logger.error('[EnhancementIntegration] Failed to initialize enhancements:', error);
      throw error;
    }
  }

  /**
   * Set up agent health monitoring integration
   */
  private async setupAgentHealthMonitoring(): Promise<void> {
    // Hook into agent lifecycle events
    agentManager.on('agent:created', async (agent) => {
      await agentHealthMonitor.startMonitoring(agent.id, agent.farmId);
      logger.info(`[EnhancementIntegration] Started health monitoring for agent ${agent.id}`);
    });

    agentManager.on('agent:stopped', async (agentId) => {
      await agentHealthMonitor.stopMonitoring(agentId);
      logger.info(`[EnhancementIntegration] Stopped health monitoring for agent ${agentId}`);
    });

    // Hook into health monitor events for automatic recovery
    agentHealthMonitor.on('agent:recovery:failed', async ({ agentId, attempts }) => {
      logger.error(`[EnhancementIntegration] Agent ${agentId} recovery failed after ${attempts} attempts`);
      
      // Trigger task redistribution
      const agent = await agentManager.getAgent(agentId);
      if (agent) {
        await this.redistributeAgentTasks(agentId, agent.farmId);
      }
    });

    agentHealthMonitor.on('agent:recovery:success', ({ agentId, strategy }) => {
      logger.info(`[EnhancementIntegration] Agent ${agentId} recovered using ${strategy} strategy`);
      
      // Resume from checkpoint if available
      this.resumeAgentFromCheckpoint(agentId);
    });

    logger.info('[EnhancementIntegration] Agent health monitoring integrated');
  }

  /**
   * Set up task checkpointing integration
   */
  private async setupTaskCheckpointing(): Promise<void> {
    // Create checkpoints at key task milestones
    const checkpointInterval = setInterval(async () => {
      const activeTasks = await this.getActiveTasks();
      
      for (const task of activeTasks) {
        await taskCheckpointService.createAutomaticCheckpoint(
          task.id,
          task.agentId,
          task.farmId
        );
      }
    }, 30000); // Every 30 seconds

    // Hook into task events
    orchestratorService.on('task:progress', async (data) => {
      const { taskId, agentId, farmId, progress, stage } = data;
      
      // Create checkpoint at significant progress points
      if (progress % 25 === 0 && progress > 0) {
        await taskCheckpointService.createCheckpoint(
          taskId,
          agentId,
          farmId,
          stage,
          progress,
          {
            variables: data.state || {},
            files: data.files || [],
            outputs: data.outputs || [],
            dependencies: data.dependencies || []
          }
        );
      }
    });

    logger.info('[EnhancementIntegration] Task checkpointing integrated');
  }

  /**
   * Set up load balancing integration
   */
  private async setupLoadBalancing(): Promise<void> {
    // Start metrics collection
    await providerMetricsService.collectMetrics();

    // Hook into farm creation to use optimal provider
    farmService.on('farm:creating', async (farmConfig) => {
      if (!farmConfig.provider) {
        // Auto-select optimal provider
        const requirements = {
          priority: farmConfig.priority || 'medium',
          estimatedTokens: farmConfig.estimatedTokens || 5000,
          maxCost: farmConfig.maxCost
        };

        const optimalProvider = await providerMetricsService.getOptimalProvider(requirements);
        farmConfig.provider = optimalProvider;
        
        logger.info(`[EnhancementIntegration] Auto-selected provider ${optimalProvider} for farm ${farmConfig.id}`);
      }
    });

    // Replace direct LLM calls with dynamic router
    this.replaceDirectLLMCalls();

    logger.info('[EnhancementIntegration] Load balancing integrated');
  }

  /**
   * Set up cross-provider collaboration
   */
  private async setupCrossProviderCollaboration(): Promise<void> {
    // Enable mixed farms in farm manager
    farmService.on('farm:type:mixed', async (farmConfig) => {
      const mixedConfig = {
        farmId: farmConfig.id,
        name: farmConfig.name,
        description: farmConfig.description,
        agents: farmConfig.agents || [],
        enableUniversalProtocol: true,
        coordinationMode: 'hybrid' as const,
        timeout: farmConfig.timeout
      };

      await mixedProviderOrchestrator.launchMixedFarm(mixedConfig);
    });

    logger.info('[EnhancementIntegration] Cross-provider collaboration integrated');
  }

  /**
   * Set up event handlers for cross-service communication
   */
  private setupEventHandlers(): void {
    // Provider metrics updates trigger load balancer recalculation
    providerMetricsService.on('metrics:updated', ({ provider, metrics }) => {
      if (metrics.availability < 50 || metrics.errorRate > 20) {
        logger.warn(`[EnhancementIntegration] Provider ${provider} degraded, triggering rebalancing`);
        this.rebalanceActiveRequests(provider);
      }
    });

    // Task failures trigger checkpoint recovery
    orchestratorService.on('task:failed', async ({ taskId, agentId, error }) => {
      logger.info(`[EnhancementIntegration] Task ${taskId} failed, attempting checkpoint recovery`);
      
      const latestCheckpoint = await taskCheckpointService.getLatestCheckpoint(taskId);
      if (latestCheckpoint) {
        // Find healthy agent for recovery
        const healthyAgent = await this.findHealthyAgent(latestCheckpoint.farmId);
        if (healthyAgent) {
          await taskCheckpointService.resumeFromCheckpoint(
            latestCheckpoint.checkpointId,
            healthyAgent.id
          );
        }
      }
    });

    // NOTE: Harvest completion triggers verification
    // harvestService is not an EventEmitter, so we can't use .on()
    // This would need to be integrated differently, perhaps by:
    // 1. Modifying harvestService to emit events
    // 2. Using a polling mechanism
    // 3. Calling verification directly from harvest collection points
    
    // For now, harvest verification can be triggered manually via API:
    // POST /api/enhancements/harvests/:harvestId/verify
  }

  /**
   * Set up WebSocket integrations for real-time updates
   */
  private setupWebSocketIntegrations(): void {
    // Broadcast health status updates
    agentHealthMonitor.on('agent:health:updated', (healthCheck) => {
      websocketManager.broadcast('enhancement:agent:health', healthCheck);
    });

    // Broadcast provider metrics
    providerMetricsService.on('metrics:updated', ({ provider, metrics }) => {
      websocketManager.broadcast('enhancement:provider:metrics', { provider, metrics });
    });

    // NOTE: Broadcast checkpoint events
    // taskCheckpointService is not an EventEmitter, so we can't use .on()
    // For now, checkpoint events can be broadcast directly from the service
    // TODO: Add event emitter to taskCheckpointService or use alternative approach

    // Broadcast routing decisions
    dynamicProviderRouter.on('routing:decision', (decision) => {
      websocketManager.broadcast('enhancement:routing:decision', decision);
    });

    logger.info('[EnhancementIntegration] WebSocket integrations established');
  }

  /**
   * Replace direct LLM calls with dynamic router
   */
  private replaceDirectLLMCalls(): void {
    // Monkey-patch LLM service calls to use dynamic router
    const originalSendPrompt = global.llmService?.sendPrompt;
    if (originalSendPrompt) {
      global.llmService.sendPrompt = async (request) => {
        return await dynamicProviderRouter.routeRequest({
          prompt: request.prompt,
          context: request.context,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
          requirements: request.requirements
        });
      };
    }
  }

  /**
   * Redistribute tasks from failed agent
   */
  private async redistributeAgentTasks(failedAgentId: string, farmId: string): Promise<void> {
    try {
      // Get pending tasks for failed agent
      const tasks = await this.getAgentTasks(failedAgentId);
      
      // Get healthy agents in farm
      const healthyAgents = await this.getHealthyAgentsInFarm(farmId);
      
      if (healthyAgents.length === 0) {
        logger.error(`[EnhancementIntegration] No healthy agents available for task redistribution`);
        return;
      }

      // Distribute tasks among healthy agents
      for (let i = 0; i < tasks.length; i++) {
        const targetAgent = healthyAgents[i % healthyAgents.length];
        await this.reassignTask(tasks[i].id, targetAgent.id);
      }

      logger.info(`[EnhancementIntegration] Redistributed ${tasks.length} tasks from agent ${failedAgentId}`);
    } catch (error) {
      logger.error('[EnhancementIntegration] Error redistributing tasks:', error);
    }
  }

  /**
   * Resume agent from checkpoint
   */
  private async resumeAgentFromCheckpoint(agentId: string): Promise<void> {
    try {
      // Get agent's current task
      const tasks = await this.getAgentTasks(agentId);
      
      for (const task of tasks) {
        const checkpoint = await taskCheckpointService.getLatestCheckpoint(task.id);
        if (checkpoint) {
          await taskCheckpointService.resumeFromCheckpoint(checkpoint.checkpointId, agentId);
          logger.info(`[EnhancementIntegration] Resumed task ${task.id} from checkpoint for agent ${agentId}`);
        }
      }
    } catch (error) {
      logger.error('[EnhancementIntegration] Error resuming from checkpoint:', error);
    }
  }

  /**
   * Rebalance active requests when provider degrades
   */
  private async rebalanceActiveRequests(degradedProvider: string): Promise<void> {
    const activeRequests = dynamicProviderRouter.getActiveRequests();
    
    for (const request of activeRequests) {
      if (request.provider === degradedProvider && request.duration < 30000) {
        // Force fallback for requests on degraded provider
        await dynamicProviderRouter.forceFallback(request.requestId);
      }
    }
  }

  /**
   * Find healthy agent in farm
   */
  private async findHealthyAgent(farmId: string): Promise<any> {
    const farmHealth = await agentHealthMonitor.getFarmHealthStats(farmId);
    const allHealth = await agentHealthMonitor.getAllHealthStatuses();
    
    for (const health of allHealth) {
      if (health.farmId === farmId && health.status === 'healthy') {
        return await agentManager.getAgent(health.agentId);
      }
    }
    
    return null;
  }

  /**
   * Get healthy agents in farm
   */
  private async getHealthyAgentsInFarm(farmId: string): Promise<any[]> {
    const allHealth = await agentHealthMonitor.getAllHealthStatuses();
    const healthyAgentIds = allHealth
      .filter(h => h.farmId === farmId && h.status === 'healthy')
      .map(h => h.agentId);
    
    const agents = [];
    for (const agentId of healthyAgentIds) {
      const agent = await agentManager.getAgent(agentId);
      if (agent) agents.push(agent);
    }
    
    return agents;
  }

  /**
   * Get active tasks
   */
  private async getActiveTasks(): Promise<any[]> {
    // This would query the database for active tasks
    return [];
  }

  /**
   * Get agent tasks
   */
  private async getAgentTasks(agentId: string): Promise<any[]> {
    // This would query the database for agent's tasks
    return [];
  }

  /**
   * Reassign task to another agent
   */
  private async reassignTask(taskId: string, newAgentId: string): Promise<void> {
    // This would update the task assignment in the database
    logger.info(`[EnhancementIntegration] Reassigned task ${taskId} to agent ${newAgentId}`);
  }

  /**
   * Get enhancement statistics
   */
  async getEnhancementStatistics(): Promise<{
    healthMonitoring: {
      monitoredAgents: number;
      healthyAgents: number;
      recoveredAgents: number;
    };
    checkpointing: {
      totalCheckpoints: number;
      successfulRecoveries: number;
    };
    loadBalancing: {
      routingDecisions: number;
      fallbacksUsed: number;
      averageResponseTime: number;
    };
    crossProvider: {
      mixedFarms: number;
      bridgedMessages: number;
    };
  }> {
    const healthStats = await agentHealthMonitor.getAllHealthStatuses();
    const checkpointStats = await taskCheckpointService.getCheckpointStats();
    const routingStats = await dynamicProviderRouter.getRoutingStatistics();
    const mixedStats = await mixedProviderOrchestrator.getMixedFarmStatistics();

    return {
      healthMonitoring: {
        monitoredAgents: healthStats.length,
        healthyAgents: healthStats.filter(h => h.status === 'healthy').length,
        recoveredAgents: healthStats.filter(h => h.recoveryAttempts > 0).length
      },
      checkpointing: {
        totalCheckpoints: checkpointStats.totalCheckpoints,
        successfulRecoveries: 0 // Would need to track this
      },
      loadBalancing: {
        routingDecisions: routingStats.totalRequests,
        fallbacksUsed: routingStats.fallbackUsage,
        averageResponseTime: routingStats.averageResponseTime
      },
      crossProvider: {
        mixedFarms: mixedStats.totalMixedFarms,
        bridgedMessages: mixedStats.messageStatistics.totalMessages
      }
    };
  }

  /**
   * Shutdown enhancement services
   */
  async shutdown(): Promise<void> {
    logger.info('[EnhancementIntegration] Shutting down enhancement services...');
    
    // Stop metrics collection
    providerMetricsService.stop();
    
    // Stop health monitoring for all agents
    const allHealth = await agentHealthMonitor.getAllHealthStatuses();
    for (const health of allHealth) {
      await agentHealthMonitor.stopMonitoring(health.agentId);
    }
    
    this.initialized = false;
    logger.info('[EnhancementIntegration] Enhancement services shut down');
  }
}

// Export singleton instance
export const enhancementIntegration = new EnhancementIntegration();