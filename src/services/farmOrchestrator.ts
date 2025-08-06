// Farm orchestration service for managing farm lifecycle and operations

import { v4 as uuidv4 } from 'uuid';
import { Farm, FarmConfig } from '../types';
import { FarmTemplate, FarmProvisioningStatus, ProvisioningStep, AgentBlueprint } from '../types/farm';
import { Workflow, WorkflowExecution } from '../types/workflow';
import { AgentInstance } from '../types/agent';
import { useFarmStore } from '../store/farmStore';
import { useAgentStore } from '../store/agentStore';
import { agentLifecycle } from './agentLifecycle';
import { workflowEngine } from './workflowEngine';
import { templateManager } from './templateManager';
import yamlGeneratorService from './yamlGeneratorService';
import { metricsCollector } from './metricsCollector';
import { websocketService } from './websocket';

class FarmOrchestrator {
  private provisioningStatus: Map<string, FarmProvisioningStatus> = new Map();
  private farmExecutions: Map<string, WorkflowExecution> = new Map();

  async createFarm(request: {
    name: string;
    description: string;
    templateId?: string;
    config?: Partial<FarmConfig>;
    yaml?: string;
  }): Promise<Farm> {
    const farmId = uuidv4();
    
    // Initialize provisioning status
    const provisioningStatus: FarmProvisioningStatus = {
      farmId,
      status: 'provisioning',
      progress: 0,
      currentStep: 'Initializing farm',
      steps: this.getProvisioningSteps(),
      startTime: new Date(),
    };
    
    this.provisioningStatus.set(farmId, provisioningStatus);
    this.broadcastProvisioningUpdate(farmId);

    try {
      // Step 1: Load template if provided
      let template: FarmTemplate | undefined;
      let config: FarmConfig;
      
      if (request.templateId) {
        template = await templateManager.getTemplate(request.templateId);
        config = { ...template?.config, ...request.config };
        await this.updateProvisioningStep(farmId, 'Loading template', 'completed');
      } else {
        config = this.getDefaultConfig(request.config);
        await this.updateProvisioningStep(farmId, 'Loading template', 'completed');
      }

      // Step 2: Generate or validate YAML
      let yaml = request.yaml;
      if (!yaml && request.templateId && template) {
        yaml = await yamlGeneratorService.generateFromTemplate(template, config);
      }
      await this.updateProvisioningStep(farmId, 'Generating configuration', 'completed');

      // Step 3: Create farm entity
      const farm: Farm = {
        id: farmId,
        name: request.name,
        description: request.description,
        type: config?.yaml ? this.detectFarmType(config.yaml) : 'collaborative',
        status: 'active',
        agents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        config: { ...config, yaml },
        metrics: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          avgCompletionTime: 0,
          resourceUsage: { cpu: 0, memory: 0, network: 0 },
          collaborationScore: 0,
          efficiency: 0,
        },
      };

      // Save to store
      const farmStore = useFarmStore.getState();
      farmStore.addFarm(farm);
      await this.updateProvisioningStep(farmId, 'Creating farm entity', 'completed');

      // Step 4: Provision agents
      if (template?.agentBlueprints) {
        await this.provisionAgents(farmId, template.agentBlueprints);
      }
      await this.updateProvisioningStep(farmId, 'Provisioning agents', 'completed');

      // Step 5: Initialize workflow
      if (template?.workflowTemplate) {
        await this.initializeWorkflow(farmId, template.workflowTemplate);
      }
      await this.updateProvisioningStep(farmId, 'Setting up workflow', 'completed');

      // Step 6: Configure monitoring
      await this.setupMonitoring(farmId);
      await this.updateProvisioningStep(farmId, 'Configuring monitoring', 'completed');

      // Complete provisioning
      provisioningStatus.status = 'ready';
      provisioningStatus.progress = 100;
      provisioningStatus.endTime = new Date();
      this.broadcastProvisioningUpdate(farmId);

      // Broadcast farm creation
      websocketService.broadcast({
        type: 'farm_created',
        payload: farm,
        timestamp: new Date()
      });

      return farm;
    } catch (error) {
      // Handle provisioning failure
      const status = this.provisioningStatus.get(farmId);
      if (status) {
        status.status = 'failed';
        status.error = error instanceof Error ? error.message : 'Unknown error';
        status.endTime = new Date();
        this.broadcastProvisioningUpdate(farmId);
      }
      throw error;
    }
  }

  async startFarm(farmId: string): Promise<void> {
    const farmStore = useFarmStore.getState();
    const farm = farmStore.farms?.find(f => f.id === farmId);
    
    if (!farm) {
      throw new Error('Farm not found');
    }

    if (farm.status === 'active') {
      return; // Already running
    }

    // Update farm status
    farmStore.updateFarm(farmId, { status: 'active' });

    // Start all agents
    const agentStore = useAgentStore.getState();
    const farmAgents = agentStore.agents?.filter(a => a.poolId === farmId) || [];
    
    for (const agent of farmAgents) {
      await agentLifecycle.startAgent(agent.instanceId);
    }

    // Resume workflow if exists
    const execution = this.farmExecutions.get(farmId);
    if (execution && execution.status === 'suspended') {
      await workflowEngine.resumeExecution(execution.id);
    }

    // Start monitoring
    metricsCollector.startFarmMetrics(farmId);

    websocketService.broadcast({
      type: 'farm_started',
      payload: { farmId },
      timestamp: new Date()
    });
  }

  async stopFarm(farmId: string, graceful: boolean = true): Promise<void> {
    const farmStore = useFarmStore.getState();
    const farm = farmStore.farms?.find(f => f.id === farmId);
    
    if (!farm) {
      throw new Error('Farm not found');
    }

    // Update farm status
    farmStore.updateFarm(farmId, { status: 'paused' });

    if (graceful) {
      // Graceful shutdown - wait for current tasks to complete
      await this.drainFarmAgents(farmId);
    }

    // Stop all agents
    const agentStore = useAgentStore.getState();
    const farmAgents = agentStore.agents?.filter(a => a.poolId === farmId) || [];
    
    for (const agent of farmAgents) {
      await agentLifecycle.stopAgent(agent.instanceId, graceful);
    }

    // Suspend workflow
    const execution = this.farmExecutions.get(farmId);
    if (execution && execution.status === 'running') {
      await workflowEngine.suspendExecution(execution.id);
    }

    // Stop monitoring
    metricsCollector.stopFarmMetrics(farmId);

    websocketService.broadcast({
      type: 'farm_stopped',
      payload: { farmId, graceful },
      timestamp: new Date()
    });
  }

  async deleteFarm(farmId: string): Promise<void> {
    // Stop farm first
    await this.stopFarm(farmId, false);

    // Terminate all agents
    const agentStore = useAgentStore.getState();
    const farmAgents = agentStore.agents?.filter(a => a.poolId === farmId) || [];
    
    for (const agent of farmAgents) {
      await agentLifecycle.terminateAgent(agent.instanceId);
    }

    // Cancel workflow
    const execution = this.farmExecutions.get(farmId);
    if (execution) {
      await workflowEngine.cancelExecution(execution.id);
      this.farmExecutions.delete(farmId);
    }

    // Clean up resources
    await this.cleanupFarmResources(farmId);

    // Remove from store
    const farmStore = useFarmStore.getState();
    farmStore.removeFarm(farmId);

    websocketService.broadcast({
      type: 'farm_deleted',
      payload: { farmId },
      timestamp: new Date()
    });
  }

  async scaleFarm(farmId: string, targetAgents: number): Promise<void> {
    const farmStore = useFarmStore.getState();
    const farm = farmStore.farms?.find(f => f.id === farmId);
    
    if (!farm) {
      throw new Error('Farm not found');
    }

    const agentStore = useAgentStore.getState();
    const currentAgents = agentStore.agents?.filter(a => a.poolId === farmId).length || 0;

    if (targetAgents === currentAgents) {
      return; // No scaling needed
    }

    if (targetAgents > currentAgents) {
      // Scale up
      const template = await templateManager.getTemplateFromFarm(farm);
      if (template?.agentBlueprints) {
        const agentsToAdd = targetAgents - currentAgents;
        const blueprints = template.agentBlueprints.slice(0, agentsToAdd);
        await this.provisionAgents(farmId, blueprints);
      }
    } else {
      // Scale down
      const agentsToRemove = currentAgents - targetAgents;
      const agents = (agentStore.agents || [])
        .filter(a => a.poolId === farmId)
        .slice(-agentsToRemove);
      
      for (const agent of agents) {
        await agentLifecycle.terminateAgent(agent.instanceId);
      }
    }

    websocketService.broadcast({
      type: 'farm_scaled',
      payload: { farmId, previousCount: currentAgents, newCount: targetAgents },
      timestamp: new Date()
    });
  }

  async executeWorkflow(farmId: string, workflowId: string, inputs?: Record<string, any>): Promise<WorkflowExecution> {
    const farmStore = useFarmStore.getState();
    const farm = farmStore.farms?.find(f => f.id === farmId);
    
    if (!farm) {
      throw new Error('Farm not found');
    }

    if (farm.status !== 'active') {
      throw new Error('Farm is not active');
    }

    // Execute workflow
    const execution = await workflowEngine.executeWorkflow(workflowId, {
      farmId,
      inputs,
      context: {
        farm,
        agents: await this.getFarmAgents(farmId),
      },
    });

    this.farmExecutions.set(farmId, execution);

    websocketService.broadcast({
      type: 'workflow_started',
      payload: { farmId, workflowId, executionId: execution.id },
      timestamp: new Date()
    });

    return execution;
  }

  async getProvisioningStatus(farmId: string): Promise<FarmProvisioningStatus | undefined> {
    return this.provisioningStatus.get(farmId);
  }

  private getProvisioningSteps(): ProvisioningStep[] {
    return [
      { name: 'Loading template', status: 'pending' },
      { name: 'Generating configuration', status: 'pending' },
      { name: 'Creating farm entity', status: 'pending' },
      { name: 'Provisioning agents', status: 'pending' },
      { name: 'Setting up workflow', status: 'pending' },
      { name: 'Configuring monitoring', status: 'pending' },
    ];
  }

  private async updateProvisioningStep(
    farmId: string,
    stepName: string,
    status: ProvisioningStep['status'],
    error?: string
  ): Promise<void> {
    const provisioningStatus = this.provisioningStatus.get(farmId);
    if (!provisioningStatus) return;

    const step = provisioningStatus.steps.find(s => s.name === stepName);
    if (step) {
      step.status = status;
      step.error = error;
      if (status === 'completed') {
        step.duration = Date.now() - provisioningStatus.startTime.getTime();
      }
    }

    // Update progress
    const completedSteps = provisioningStatus.steps.filter(s => s.status === 'completed').length;
    provisioningStatus.progress = Math.round((completedSteps / provisioningStatus.steps.length) * 100);
    provisioningStatus.currentStep = stepName;

    this.broadcastProvisioningUpdate(farmId);
  }

  private broadcastProvisioningUpdate(farmId: string): void {
    const status = this.provisioningStatus.get(farmId);
    if (status) {
      websocketService.broadcast({
        type: 'farm_provisioning_update',
        payload: status,
        timestamp: new Date()
      });
    }
  }

  private async provisionAgents(farmId: string, blueprints: AgentBlueprint[]): Promise<void> {
    for (const blueprint of blueprints) {
      await agentLifecycle.provisionAgent({
        poolId: farmId,
        count: blueprint.scalingPolicy?.minInstances || 1,
        agentType: blueprint.type,
        capabilities: blueprint.capabilities,
        resources: blueprint.resources,
      });
    }
  }

  private async initializeWorkflow(farmId: string, workflowTemplate: any): Promise<void> {
    // Create workflow from template
    const workflow = await workflowEngine.createWorkflow({
      ...workflowTemplate,
      farmId,
    });

    // Store workflow association
    const farmStore = useFarmStore.getState();
    farmStore.updateFarm(farmId, {
      config: {
        ...(farmStore.farms?.find(f => f.id === farmId)?.config || {}),
        workflowId: workflow.id,
      },
    });
  }

  private async setupMonitoring(farmId: string): Promise<void> {
    // Initialize metrics collection
    metricsCollector.initializeFarmMetrics(farmId);

    // Set up alerts
    await this.configureDefaultAlerts(farmId);

    // Start collecting metrics
    metricsCollector.startFarmMetrics(farmId);
  }

  private async configureDefaultAlerts(farmId: string): Promise<void> {
    // Configure default alerts for the farm
    const alerts = [
      {
        name: 'High CPU Usage',
        metric: 'cpu_usage',
        threshold: 80,
        duration: 300, // 5 minutes
      },
      {
        name: 'Low Agent Availability',
        metric: 'agent_availability',
        threshold: 50,
        duration: 600, // 10 minutes
      },
      {
        name: 'High Error Rate',
        metric: 'error_rate',
        threshold: 10,
        duration: 300, // 5 minutes
      },
    ];

    // Implementation would integrate with alert manager
  }

  private async drainFarmAgents(farmId: string): Promise<void> {
    const agentStore = useAgentStore.getState();
    const agents = agentStore.agents?.filter(a => a.poolId === farmId) || [];

    // Set agents to draining state
    for (const agent of agents) {
      await agentLifecycle.drainAgent(agent.instanceId);
    }

    // Wait for agents to complete current tasks
    await this.waitForAgentsDrained(agents);
  }

  private async waitForAgentsDrained(agents: AgentInstance[]): Promise<void> {
    const timeout = 300000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const busyAgents = agents.filter(a => a.state.current === 'busy');
      if (busyAgents.length === 0) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
    }

    throw new Error('Timeout waiting for agents to drain');
  }

  private async cleanupFarmResources(farmId: string): Promise<void> {
    // Clean up monitoring data
    metricsCollector.cleanupFarmMetrics(farmId);

    // Clean up provisioning status
    this.provisioningStatus.delete(farmId);

    // Clean up execution data
    this.farmExecutions.delete(farmId);

    // Additional cleanup as needed
  }

  private async getFarmAgents(farmId: string): Promise<AgentInstance[]> {
    const agentStore = useAgentStore.getState();
    return agentStore.agents?.filter(a => a.poolId === farmId) || [];
  }

  private getDefaultConfig(partial?: Partial<FarmConfig>): FarmConfig {
    return {
      autoScale: true,
      maxAgents: 5,
      timeout: 3600,
      retryPolicy: {
        enabled: true,
        maxRetries: 3,
        backoffMultiplier: 2,
      },
      ...partial,
    };
  }

  private detectFarmType(yaml: string): Farm['type'] {
    // Simple detection based on YAML content
    if (yaml.includes('type: sequential')) return 'sequential';
    if (yaml.includes('type: autonomous')) return 'autonomous';
    return 'collaborative';
  }
}

export const farmOrchestrator = new FarmOrchestrator();