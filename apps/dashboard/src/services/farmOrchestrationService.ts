import { 
  Farm, 
  FarmTemplate, 
  FarmSetupRequest, 
  FarmSetupProgress,
  Agent,
  AgentStatus,
  FarmStatus,
  SetupStep,
  OrchestrationEvent,
  OrchestrationResourceUsage
} from '@/types/orchestration';
import { ResourceUsage } from '@/types/index';
import { ensureDate } from '@/utils/dateHelpers';
import { WorkflowEngine } from './workflowEngine';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

interface FarmContext {
  farm: Farm;
  setupProgress?: FarmSetupProgress;
  workflowEngine: WorkflowEngine;
  agentPool: Map<string, Agent>;
}

// Helper function to safely get agents as Agent array
function getAgentsAsObjects(agents: Agent[] | string[]): Agent[] {
  if (agents.length === 0) return [];
  if (typeof agents[0] === 'string') return []; // If string IDs, return empty - lookup needed
  return agents as Agent[];
}

export class FarmOrchestrationService extends EventEmitter {
  private farms: Map<string, FarmContext> = new Map();
  private templates: Map<string, FarmTemplate> = new Map();
  private setupQueue: string[] = [];
  private isProcessingSetup = false;

  constructor() {
    super();
    this.loadDefaultTemplates();
  }

  private loadDefaultTemplates() {
    const templates: FarmTemplate[] = [
      {
        id: 'dev-basic',
        name: 'Basic Development Farm',
        description: 'A simple farm for development and testing',
        type: 'development',
        configuration: {
          agents: [
            {
              type: 'general',
              count: 3,
              capabilities: ['code', 'test', 'debug'],
              resources: {
                cpu: 2,
                memory: '4GB',
                storage: '10GB'
              },
              environment: {
                NODE_ENV: 'development'
              }
            }
          ],
          resources: {
            totalCpu: 6,
            totalMemory: '12GB',
            totalStorage: '30GB',
            limits: {
              maxAgents: 10,
              maxConcurrentTasks: 20,
              maxQueueDepth: 100
            }
          },
          security: {
            authentication: {
              required: false,
              methods: ['token']
            },
            authorization: {
              roleBasedAccess: false,
              permissions: []
            },
            encryption: {
              atRest: false,
              inTransit: true,
              algorithm: 'AES-256'
            }
          },
          monitoring: {
            metricsEnabled: true,
            loggingLevel: 'debug',
            alerting: {
              enabled: false,
              channels: [],
              rules: []
            }
          }
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          author: 'system',
          tags: ['development', 'basic', 'starter']
        }
      },
      {
        id: 'prod-scalable',
        name: 'Production Scalable Farm',
        description: 'High-performance farm with auto-scaling and monitoring',
        type: 'production',
        configuration: {
          agents: [
            {
              type: 'specialized',
              count: 5,
              capabilities: ['api', 'database', 'compute'],
              resources: {
                cpu: 4,
                memory: '8GB',
                storage: '50GB'
              },
              environment: {
                NODE_ENV: 'production',
                LOG_LEVEL: 'info'
              },
              healthCheck: {
                interval: 30000,
                timeout: 5000,
                retries: 3,
                successThreshold: 2,
                failureThreshold: 3
              }
            },
            {
              type: 'general',
              count: 10,
              capabilities: ['worker', 'processor'],
              resources: {
                cpu: 2,
                memory: '4GB',
                storage: '20GB'
              },
              environment: {
                NODE_ENV: 'production'
              }
            }
          ],
          resources: {
            totalCpu: 40,
            totalMemory: '80GB',
            totalStorage: '450GB',
            limits: {
              maxAgents: 50,
              maxConcurrentTasks: 200,
              maxQueueDepth: 1000
            }
          },
          security: {
            authentication: {
              required: true,
              methods: ['oauth2', 'token']
            },
            authorization: {
              roleBasedAccess: true,
              permissions: [
                {
                  resource: 'farm',
                  actions: ['read', 'write', 'execute']
                },
                {
                  resource: 'agent',
                  actions: ['read', 'scale', 'terminate']
                }
              ]
            },
            encryption: {
              atRest: true,
              inTransit: true,
              algorithm: 'AES-256-GCM'
            }
          },
          monitoring: {
            metricsEnabled: true,
            loggingLevel: 'info',
            alerting: {
              enabled: true,
              channels: [
                {
                  type: 'email',
                  configuration: {
                    recipients: ['admin@maifarm.io']
                  }
                }
              ],
              rules: [
                {
                  id: 'high-cpu',
                  name: 'High CPU Usage',
                  condition: 'cpu_usage > 80',
                  threshold: 80,
                  duration: '5m',
                  severity: 'high',
                  actions: ['notify', 'scale']
                }
              ]
            }
          }
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          author: 'system',
          tags: ['production', 'scalable', 'enterprise']
        }
      }
    ];

    templates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  async createFarm(request: FarmSetupRequest): Promise<FarmSetupProgress> {
    const farmId = uuidv4();
    const template = request.templateId ? this.templates.get(request.templateId) : undefined;
    
    const farm: Farm = {
      id: farmId,
      name: request.name,
      description: request.description || '',
      type: 'autonomous',
      status: 'active', // Base Farm type expects 'active' not 'launching'
      agents: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      owner: 'system',
      config: {
        yaml: undefined,
        autoScale: true,
        maxAgents: 10
      },
      metrics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        queuedTasks: 0,
        efficiency: 1,
        resourceUtilization: {
          cpu: 0,
          memory: 0
        }
      },
      template: template?.id,
      resources: {
        cpu: { total: 0, used: 0, percentage: 0 },
        memory: { total: 0, used: 0, percentage: 0 },
        disk: { total: 0, used: 0, percentage: 0 }
      }
    };

    const setupProgress: FarmSetupProgress = {
      farmId,
      status: 'initializing',
      progress: 0,
      currentStep: 'Initializing farm',
      steps: [
        { name: 'Initialize farm', status: 'active', progress: 0 },
        { name: 'Provision agents', status: 'pending', progress: 0 },
        { name: 'Configure resources', status: 'pending', progress: 0 },
        { name: 'Setup monitoring', status: 'pending', progress: 0 },
        { name: 'Validate configuration', status: 'pending', progress: 0 }
      ],
      startedAt: new Date()
    };

    const context: FarmContext = {
      farm,
      setupProgress,
      workflowEngine: new WorkflowEngine(),
      agentPool: new Map()
    };

    this.farms.set(farmId, context);
    this.setupQueue.push(farmId);

    this.emit('farm:creating', { farmId, name: request.name });

    if (!this.isProcessingSetup) {
      this.processSetupQueue();
    }

    return setupProgress;
  }

  private async processSetupQueue() {
    if (this.isProcessingSetup || this.setupQueue.length === 0) {
      return;
    }

    this.isProcessingSetup = true;

    while (this.setupQueue.length > 0) {
      const farmId = this.setupQueue.shift()!;
      const context = this.farms.get(farmId);
      
      if (!context) continue;

      try {
        await this.setupFarm(context);
      } catch (error) {
        if (context.setupProgress) {
          context.setupProgress.status = 'failed';
          context.setupProgress.error = error instanceof Error ? error.message : 'Unknown error';
          context.setupProgress.completedAt = new Date();
        }
        context.farm.status = 'failed';
        this.emit('farm:failed', { farmId, error });
      }
    }

    this.isProcessingSetup = false;
  }

  private async setupFarm(context: FarmContext) {
    const { farm, setupProgress } = context;
    if (!setupProgress) return;

    const steps = setupProgress.steps;
    
    // Step 1: Initialize farm
    await this.executeSetupStep(context, steps[0], async () => {
      setupProgress.status = 'provisioning';
      setupProgress.currentStep = 'Initializing farm infrastructure';
      
      // Simulate initialization
      await this.delay(2000);
      
      // Initialize resource allocation
      const template = farm.template ? this.templates.get(farm.template) : undefined;
      if (template && farm.resources) {
        const config = template.configuration;
        // Note: Base Farm type doesn't have allocated field, using total instead
        farm.resources.cpu.total = config.resources.totalCpu;
        farm.resources.memory.total = this.parseMemoryString(config.resources.totalMemory);
        // Base Farm type doesn't have storage in resources, skip for now
      }
    });

    // Step 2: Provision agents
    await this.executeSetupStep(context, steps[1], async () => {
      setupProgress.status = 'provisioning';
      setupProgress.currentStep = 'Provisioning agents';
      
      const template = farm.template ? this.templates.get(farm.template) : undefined;
      if (template) {
        for (const agentConfig of template.configuration.agents) {
          for (let i = 0; i < agentConfig.count; i++) {
            const agent = await this.provisionAgent(farm.id, agentConfig);
            context.agentPool.set(agent.id, agent);
            // Use type assertion since we're adding Agent objects
            (farm.agents as Agent[]).push(agent);

            // Update progress
            const totalAgents = template.configuration.agents.reduce((sum, ac) => sum + ac.count, 0);
            steps[1].progress = ((farm.agents.length / totalAgents) * 100);
          }
        }
      }
    });

    // Step 3: Configure resources
    await this.executeSetupStep(context, steps[2], async () => {
      setupProgress.status = 'configuring';
      setupProgress.currentStep = 'Configuring resources';
      
      // Calculate actual resource usage
      this.updateResourceUsage(farm);
      
      await this.delay(1500);
    });

    // Step 4: Setup monitoring
    await this.executeSetupStep(context, steps[3], async () => {
      setupProgress.status = 'configuring';
      setupProgress.currentStep = 'Setting up monitoring';
      
      // Initialize monitoring
      const template = farm.template ? this.templates.get(farm.template) : undefined;
      if (template?.configuration.monitoring.metricsEnabled) {
        // Setup metrics collection
        this.setupMetricsCollection(farm);
      }
      
      await this.delay(1000);
    });

    // Step 5: Validate configuration
    await this.executeSetupStep(context, steps[4], async () => {
      setupProgress.status = 'validating';
      setupProgress.currentStep = 'Validating configuration';
      
      // Validate all agents are healthy
      const allHealthy = await this.validateAgentHealth(farm);
      if (!allHealthy) {
        throw new Error('Some agents failed health checks');
      }
      
      await this.delay(1000);
    });

    // Complete setup
    setupProgress.status = 'ready';
    setupProgress.progress = 100;
    setupProgress.completedAt = new Date();
    farm.status = 'active'; // Use base Farm status
    
    this.emit('farm:created', { 
      farmId: farm.id, 
      name: farm.name,
      agentCount: farm.agents.length 
    });
  }

  private async executeSetupStep(
    context: FarmContext, 
    step: SetupStep, 
    action: () => Promise<void>
  ) {
    const { setupProgress } = context;
    if (!setupProgress) return;

    step.status = 'active';
    step.startedAt = new Date();
    
    try {
      await action();
      
      step.status = 'completed';
      step.progress = 100;
      step.completedAt = new Date();
      
      // Update overall progress
      const completedSteps = setupProgress.steps.filter(s => s.status === 'completed').length;
      setupProgress.progress = (completedSteps / setupProgress.steps.length) * 100;
      
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : 'Unknown error';
      step.completedAt = new Date();
      throw error;
    }
  }

  private async provisionAgent(farmId: string, config: any): Promise<Agent> {
    const agentId = uuidv4();

    const agent: Agent = {
      id: agentId,
      name: `Agent-${agentId.slice(0, 8)}`,
      type: config.type as 'builder' | 'reviewer' | 'tester' | 'documenter' | 'custom',
      status: 'initializing', // Use valid AgentStatus
      progress: 0,
      memory: 0,
      cpu: 0,
      lastActive: new Date(),
      farmId,
      agentNumber: 0, // Will be set by caller
      createdAt: new Date(),
      updatedAt: new Date(),
      lifecycle: {
        state: 'initializing', // Use valid AgentStatus
        phase: 'provisioning',
        startTime: new Date(),
        lastUpdate: new Date(),
        health: {
          status: 'unknown',
          lastCheck: new Date()
        }
      },
      resources: {
        cpu: 0,
        memory: 0
      },
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageExecutionTime: 0,
        uptime: 0,
        efficiency: 1.0
      },
      tasks: [],
      metadata: {
        environment: config.environment || {},
        capabilities: config.capabilities,
        allocatedCpu: config.resources.cpu,
        allocatedMemory: this.parseMemoryString(config.resources.memory)
      }
    };

    // Simulate provisioning
    await this.delay(1000);
    
    // Transition to running
    agent.status = 'idle';
    if (agent.lifecycle) {
      agent.lifecycle.state = 'idle';
      agent.lifecycle.lastUpdate = new Date();
    }
    
    // Store lifecycle event in metadata since base Agent type doesn't have history
    if (!agent.metadata) {
      agent.metadata = {};
    }
    if (!agent.metadata.lifecycleHistory) {
      agent.metadata.lifecycleHistory = [];
    }
    agent.metadata.lifecycleHistory.push({
      timestamp: new Date(),
      fromState: 'provisioning',
      toState: 'idle',
      reason: 'Provisioning completed'
    });

    this.emit('agent:provisioned', { agentId, farmId, type: config.type });
    
    return agent;
  }

  // This method is replaced by the one defined later in the file

  // This method is implemented later in the file

  private collectFarmMetrics(farm: Farm) {
    // Simulate metric collection - use helper to get agents safely
    const agents = getAgentsAsObjects(farm.agents);
    agents.forEach(agent => {
      if (agent.resources) {
        // Update CPU usage - resources.cpu is now a number
        agent.resources.cpu = Math.random() * 0.8 + 0.1; // 10-90%

        // Update memory usage - resources.memory is now a number
        agent.resources.memory = Math.random() * 0.8 + 0.1; // 10-90%
      }

      // Update metrics
      if (agent.metrics) {
        agent.metrics.uptime += 30; // seconds
        if (Math.random() > 0.3) {
          agent.metrics.tasksCompleted += Math.floor(Math.random() * 5);
        }
      }
    });

    this.updateResourceUsage(farm);
    this.emit('metrics:updated', { farmId: farm.id, resources: farm.resources });
  }

  // This method is implemented later in the file

  private async checkAgentHealth(agent: Agent): Promise<boolean> {
    // Simulate health check
    await this.delay(100);

    // resources.cpu and resources.memory are now numbers (0-1 range)
    const cpuUsage = agent.resources?.cpu || 0;
    const memUsage = agent.resources?.memory || 0;

    const cpuHealthy = cpuUsage < 0.9;
    const memHealthy = memUsage < 0.9;

    if (agent.lifecycle) {
      agent.lifecycle.health = {
        status: cpuHealthy && memHealthy ? 'healthy' : 'degraded',
        lastCheck: new Date()
      };
    }

    // Store health check details in metadata
    if (!agent.metadata) {
      agent.metadata = {};
    }
    agent.metadata.lastHealthCheck = {
      cpuHealthy,
      memHealthy,
      cpuUsage,
      memUsage,
      timestamp: new Date()
    };

    return cpuHealthy && memHealthy;
  }

  async scaleAgents(farmId: string, agentType: string, delta: number): Promise<void> {
    const context = this.farms.get(farmId);
    if (!context) throw new Error('Farm not found');

    const { farm } = context;

    if (delta > 0) {
      // Scale up
      const templateId = farm.template;
      const template = templateId ? this.templates.get(templateId) : undefined;
      if (!template) throw new Error('Agent type not found in template');

      for (let i = 0; i < delta; i++) {
        const agent = await this.provisionAgent(farmId, template);
        context.agentPool.set(agent.id, agent);
        // Use type assertion since we're adding Agent objects
        (farm.agents as Agent[]).push(agent);
      }

      this.emit('farm:scaled', { farmId, agentType, delta, action: 'up' });
    } else if (delta < 0) {
      // Scale down - get agents safely
      const agents = getAgentsAsObjects(farm.agents);
      const agentsToRemove = agents
        .filter(a => a.type === agentType && a.status === 'idle')
        .slice(0, Math.abs(delta));

      for (const agent of agentsToRemove) {
        await this.terminateAgent(farm, agent);
      }

      this.emit('farm:scaled', { farmId, agentType, delta: Math.abs(delta), action: 'down' });
    }

    this.updateResourceUsage(farm);
  }

  // This method is implemented later in the file

  // This method is implemented later in the file

  getFarm(farmId: string): Farm | undefined {
    return this.farms.get(farmId)?.farm;
  }

  getSetupProgress(farmId: string): FarmSetupProgress | undefined {
    return this.farms.get(farmId)?.setupProgress;
  }

  getAllFarms(): Farm[] {
    return Array.from(this.farms.values()).map(context => context.farm);
  }

  getTemplates(): FarmTemplate[] {
    return Array.from(this.templates.values());
  }

  // This method is implemented later in the file

  async getFarmHealth(farmId: string): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    agents: {
      total: number;
      healthy: number;
      unhealthy: number;
    };
    resources: ResourceUsage;
    issues: string[];
  }> {
    const context = this.farms.get(farmId);
    if (!context) {
      throw new Error(`Farm ${farmId} not found`);
    }

    const { farm } = context;
    const agents = Array.from(context.agentPool.values());
    const healthyAgents = agents.filter(a => a.status === 'idle' || a.status === 'working');
    const unhealthyAgents = agents.filter(a => a.status === 'error' || a.status === 'failed');

    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (unhealthyAgents.length > 0) {
      issues.push(`${unhealthyAgents.length} agents are unhealthy`);
      status = unhealthyAgents.length > agents.length / 2 ? 'unhealthy' : 'degraded';
    }

    if (farm.resources?.cpu.percentage && farm.resources.cpu.percentage > 80) {
      issues.push('High CPU usage detected');
      status = status === 'healthy' ? 'degraded' : status;
    }

    if (farm.resources?.memory.percentage && farm.resources.memory.percentage > 80) {
      issues.push('High memory usage detected');
      status = status === 'healthy' ? 'degraded' : status;
    }

    return {
      status,
      agents: {
        total: agents.length,
        healthy: healthyAgents.length,
        unhealthy: unhealthyAgents.length
      },
      resources: farm.resources ? {
        cpu: farm.resources.cpu.used,
        memory: farm.resources.memory.used,
        network: 0,
        disk: farm.resources.disk.used,
        timestamp: new Date()
      } : {
        cpu: 0,
        memory: 0,
        network: 0,
        disk: 0,
        timestamp: new Date()
      },
      issues
    };
  }

  async scaleFarm(farmId: string, targetAgentCount: number): Promise<void> {
    const context = this.farms.get(farmId);
    if (!context) {
      throw new Error(`Farm ${farmId} not found`);
    }

    const currentAgentCount = context.agentPool.size;
    
    if (targetAgentCount > currentAgentCount) {
      // Scale up
      const delta = targetAgentCount - currentAgentCount;
      const templateId = context.farm.template;
      const template = templateId ? this.templates.get(templateId) : undefined;
      const agentType = template?.configuration.agents[0]?.type || 'general';
      await this.scaleAgents(farmId, agentType, delta);
    } else if (targetAgentCount < currentAgentCount) {
      // Scale down
      const delta = currentAgentCount - targetAgentCount;
      const agentsToRemove = Array.from(context.agentPool.values())
        .filter(a => a.status === 'idle')
        .slice(0, delta);
      
      for (const agent of agentsToRemove) {
        await this.terminateAgent(context.farm, agent);
      }
    }

    this.emit('farm:scaled', {
      farmId,
      previousCount: currentAgentCount,
      newCount: targetAgentCount,
      timestamp: new Date()
    });
  }

  async pauseFarm(farmId: string, isAutoPause: boolean = false): Promise<void> {
    const context = this.farms.get(farmId);
    if (!context) {
      throw new Error(`Farm ${farmId} not found`);
    }

    const { farm } = context;
    
    // Check if already paused
    if (farm.status === 'paused') {
      return;
    }

    // Store previous status for resuming
    const previousStatus = farm.status;
    
    // Pause all agents
    const agents = Array.from(context.agentPool.values());
    for (const agent of agents) {
      if (agent.status === 'working' || agent.status === 'active') {
        agent.status = 'paused';
      }
    }

    // Update farm status
    farm.status = 'paused';

    // Stop workflow engine if exists
    if (context.workflowEngine) {
      // Pause workflow execution
      context.workflowEngine.pauseExecution();
    }

    // Emit pause event
    this.emit('farm:paused', {
      farmId,
      isAutoPause,
      previousStatus,
      timestamp: new Date()
    });
  }

  async resumeFarm(farmId: string, isAutoResume: boolean = false): Promise<void> {
    const context = this.farms.get(farmId);
    if (!context) {
      throw new Error(`Farm ${farmId} not found`);
    }

    const { farm } = context;
    
    // Check if not paused
    if (farm.status !== 'paused') {
      return;
    }

    // Resume all paused agents
    const agents = Array.from(context.agentPool.values());
    for (const agent of agents) {
      if (agent.status === 'paused') {
        agent.status = 'idle';
      }
    }

    // Update farm status
    farm.status = 'active';

    // Resume workflow engine if exists
    if (context.workflowEngine) {
      // Resume workflow execution
      context.workflowEngine.resumeExecution();
    }

    // Emit resume event
    this.emit('farm:resumed', {
      farmId,
      isAutoResume,
      timestamp: new Date()
    });
  }

  async triggerFailover(farmId: string): Promise<void> {
    const context = this.farms.get(farmId);
    if (!context) {
      throw new Error(`Farm ${farmId} not found`);
    }

    this.emit('farm:failover:start', { farmId, timestamp: new Date() });

    // Mark all current agents as draining
    const agents = Array.from(context.agentPool.values());
    for (const agent of agents) {
      if (agent.status === 'working') {
        await this.drainAgentTasks(agent);
      }
    }

    // Provision new agents
    const templateId = context.farm.template;
    const template = templateId ? this.templates.get(templateId) : undefined;
    const agentConfigs = template?.configuration.agents || [];
    const newAgents: Agent[] = [];
    
    for (const config of agentConfigs) {
      for (let i = 0; i < config.count; i++) {
        const newAgent = await this.provisionAgent(farmId, config);
        newAgents.push(newAgent);
      }
    }

    // Validate new agents
    const healthCheckPassed = await this.validateAgentHealth(context.farm);
    if (!healthCheckPassed) {
      throw new Error('Failover failed: New agents failed health check');
    }

    // Terminate old agents
    for (const agent of agents) {
      await this.terminateAgent(context.farm, agent);
    }

    this.emit('farm:failover:complete', {
      farmId,
      oldAgentCount: agents.length,
      newAgentCount: newAgents.length,
      timestamp: new Date()
    });
  }

  // Helper methods
  private parseMemoryString(memoryStr: string): number {
    const match = memoryStr.match(/(\d+)([A-Z]+)/);
    if (!match) return 1024; // Default 1GB in MB
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'GB': return value * 1024;
      case 'MB': return value;
      case 'KB': return Math.round(value / 1024);
      default: return value;
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateResourceUsage(farm: Farm): void {
    if (!farm.resources) return;

    // Calculate actual usage based on agents - use helper to get agents safely
    let totalCpuUsed = 0;
    let totalMemoryUsed = 0;

    const agents = getAgentsAsObjects(farm.agents);
    agents.forEach(agent => {
      if (agent.resources) {
        // resources.cpu and resources.memory are now numbers
        totalCpuUsed += agent.resources.cpu || 0;
        totalMemoryUsed += agent.resources.memory || 0;
      }
    });

    farm.resources.cpu.used = totalCpuUsed;
    farm.resources.memory.used = totalMemoryUsed;
    farm.resources.cpu.percentage = farm.resources.cpu.total > 0 ? (totalCpuUsed / farm.resources.cpu.total) * 100 : 0;
    farm.resources.memory.percentage = farm.resources.memory.total > 0 ? (totalMemoryUsed / farm.resources.memory.total) * 100 : 0;
  }

  private setupMetricsCollection(farm: Farm): void {
    // Initialize metrics collection for the farm
    // This would integrate with actual monitoring systems
    console.log(`Setting up metrics collection for farm ${farm.id}`);
  }

  private async validateAgentHealth(farm: Farm): Promise<boolean> {
    // Validate all agents are healthy - use helper to get agents safely
    const agents = getAgentsAsObjects(farm.agents);
    return agents.every(agent =>
      agent.status === 'active' || agent.status === 'idle'
    );
  }

  private async drainAgentTasks(agent: Agent): Promise<void> {
    // Wait for agent to complete current tasks
    console.log(`Draining tasks for agent ${agent.id}`);
    // Implementation would depend on task management system
  }

  private async terminateAgent(farm: Farm, agent: Agent): Promise<void> {
    // Terminate an agent
    console.log(`Terminating agent ${agent.id}`);
    // Use type assertion since we're filtering Agent objects
    const agents = getAgentsAsObjects(farm.agents);
    farm.agents = agents.filter(a => a.id !== agent.id);
  }
}

export const farmOrchestrationService = new FarmOrchestrationService();