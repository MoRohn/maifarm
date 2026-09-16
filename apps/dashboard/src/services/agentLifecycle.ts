// Agent lifecycle management service

import { v4 as uuidv4 } from 'uuid';
import { Agent } from '@/types';
import { 
  AgentInstance, 
  AgentState, 
  AgentHealth,
  AgentResources,
  AgentProvisioningRequest,
  AgentLifecycleEvent,
  AgentTask,
  HealthCheck
} from '@/types/agent';
import { useAgentStore } from '@/store/agentStore';
import { websocketService } from './websocket';
import { metricsCollector } from './metricsCollector';

class AgentLifecycle {
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private agentTasks: Map<string, AgentTask[]> = new Map();

  async provisionAgent(request: AgentProvisioningRequest): Promise<AgentInstance[]> {
    const agents: AgentInstance[] = [];

    for (let i = 0; i < request.count; i++) {
      const agent = await this.createAgent(request);
      agents.push(agent);
      
      // Start the agent
      await this.startAgent(agent.instanceId);
    }

    return agents;
  }

  async startAgent(instanceId: string): Promise<void> {
    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.instanceId === instanceId);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Update agent state
    await this.updateAgentState(instanceId, 'idle', 'Agent started');

    // Start health checks
    this.startHealthChecks(instanceId);

    // Initialize metrics collection
    metricsCollector.initializeAgentMetrics(instanceId);

    // Emit lifecycle event
    this.emitLifecycleEvent({
      agentId: agent.id,
      instanceId,
      type: 'started',
      timestamp: new Date(),
      details: { previousState: agent.state.current },
      triggeredBy: 'system',
    });

    websocketService.broadcast({
      type: 'agent_started',
      payload: { agentId: agent.id, instanceId },
      timestamp: new Date(),
    });
  }

  async stopAgent(instanceId: string, graceful: boolean = true): Promise<void> {
    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.instanceId === instanceId);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (graceful && agent.state.current === 'busy') {
      // Wait for current task to complete
      await this.drainAgent(instanceId);
    }

    // Stop health checks
    this.stopHealthChecks(instanceId);

    // Update agent state
    await this.updateAgentState(instanceId, 'terminating', 'Agent stopping');

    // Clear assigned tasks
    this.agentTasks.delete(instanceId);

    // Stop metrics collection
    metricsCollector.stopAgentMetrics(instanceId);

    // Update final state
    await this.updateAgentState(instanceId, 'terminated', 'Agent stopped');

    // Emit lifecycle event
    this.emitLifecycleEvent({
      agentId: agent.id,
      instanceId,
      type: 'stopped',
      timestamp: new Date(),
      details: { graceful },
      triggeredBy: 'system',
    });

    websocketService.broadcast({
      type: 'agent_stopped',
      payload: { agentId: agent.id, instanceId, graceful },
      timestamp: new Date(),
    });
  }

  async restartAgent(instanceId: string): Promise<void> {
    await this.stopAgent(instanceId, true);
    await this.startAgent(instanceId);

    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.instanceId === instanceId);
    
    if (agent) {
      // Increment restart count
      agentStore.updateAgent(instanceId, {
        restartCount: agent.restartCount + 1,
      });

      this.emitLifecycleEvent({
        agentId: agent.id,
        instanceId,
        type: 'restarted',
        timestamp: new Date(),
        details: { restartCount: agent.restartCount + 1 },
        triggeredBy: 'system',
      });
    }
  }

  async terminateAgent(instanceId: string): Promise<void> {
    await this.stopAgent(instanceId, false);

    // Remove from store
    const agentStore = useAgentStore.getState();
    agentStore.removeAgent(instanceId);

    // Clean up resources
    this.healthCheckIntervals.delete(instanceId);
    this.agentTasks.delete(instanceId);
    metricsCollector.cleanupAgentMetrics(instanceId);

    websocketService.broadcast({
      type: 'agent_terminated',
      payload: { instanceId },
      timestamp: new Date(),
    });
  }

  async drainAgent(instanceId: string): Promise<void> {
    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.instanceId === instanceId);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Update state to draining
    await this.updateAgentState(instanceId, 'draining', 'Waiting for tasks to complete');

    // Wait for current tasks to complete
    const timeout = 300000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const tasks = this.agentTasks.get(instanceId) || [];
      const runningTasks = tasks.filter(t => t.status === 'active');
      
      if (runningTasks.length === 0) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async assignTask(instanceId: string, task: Omit<AgentTask, 'id' | 'agentId' | 'status' | 'retryCount' | 'createdAt'>): Promise<AgentTask> {
    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.instanceId === instanceId);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.state.current !== 'idle') {
      throw new Error('Agent is not available for tasks');
    }

    const agentTask: AgentTask = {
      id: uuidv4(),
      agentId: agent.id,
      status: 'assigned',
      retryCount: 0,
      createdAt: new Date(),
      ...task,
    };

    // Add task to agent's queue
    const tasks = this.agentTasks.get(instanceId) || [];
    tasks.push(agentTask);
    this.agentTasks.set(instanceId, tasks);

    // Update agent state
    await this.updateAgentState(instanceId, 'busy', `Working on task: ${task.type}`);
    agentStore.updateAgent(instanceId, {
      currentTask: agentTask.id,
      assignedTasks: tasks.map(t => t.id),
    });

    // Start task execution
    this.executeTask(instanceId, agentTask);

    return agentTask;
  }

  async scalePool(poolId: string, targetCount: number): Promise<void> {
    const agentStore = useAgentStore.getState();
    const poolAgents = agentStore.agents.filter(a => a.poolId === poolId);
    const currentCount = poolAgents.length;

    if (targetCount === currentCount) {
      return;
    }

    if (targetCount > currentCount) {
      // Scale up
      const agentsToAdd = targetCount - currentCount;
      const sampleAgent = poolAgents[0];
      
      if (sampleAgent) {
        await this.provisionAgent({
          poolId,
          count: agentsToAdd,
          agentType: sampleAgent.type,
          capabilities: sampleAgent.capabilities,
          resources: sampleAgent.resources.allocated ?? { cpu: 2, memory: 4 },
        });
      }
    } else {
      // Scale down
      const agentsToRemove = currentCount - targetCount;
      const agentsToTerminate = poolAgents
        .filter(a => a.state.current === 'idle')
        .slice(0, agentsToRemove);

      for (const agent of agentsToTerminate) {
        await this.terminateAgent(agent.instanceId);
      }
    }

    this.emitLifecycleEvent({
      agentId: poolId,
      instanceId: poolId,
      type: 'scaled',
      timestamp: new Date(),
      details: { previousCount: currentCount, newCount: targetCount },
      triggeredBy: 'policy',
    });
  }

  private async createAgent(request: AgentProvisioningRequest): Promise<AgentInstance> {
    const agentId = uuidv4();
    const instanceId = uuidv4();

    const agent: AgentInstance = {
      id: agentId,
      instanceId,
      poolId: request.poolId,
      farmId: request.poolId, // Use poolId as farmId for agent lifecycle
      name: `${request.agentType}-${agentId.slice(0, 8)}`,
      type: request.agentType,
      status: 'idle',
      progress: 0,
      memory: 0,
      cpu: 0,
      lastActive: new Date(),
      capabilities: request.capabilities,
      agentNumber: 0, // Will be assigned by caller
      createdAt: new Date(),
      updatedAt: new Date(),
      state: {
        current: 'initializing',
        transitionTime: new Date(),
      },
      health: {
        status: 'unknown',
        checks: [],
        lastCheck: new Date(),
        consecutiveFailures: 0,
      },
      resources: {
        // Required cpu and memory objects
        cpu: {
          allocated: request.resources.cpu,
          used: 0,
          limit: request.resources.cpu,
          usage: 0
        },
        memory: {
          allocated: request.resources.memory,
          used: '0',
          limit: request.resources.memory,
          usage: 0
        },
        // Legacy structure support
        allocated: request.resources,
        used: { cpu: 0, memory: 0, disk: 0 },
        limits: request.resources,
      },
      assignedTasks: [],
      startTime: new Date(),
      lastHealthCheck: new Date(),
      restartCount: 0,
      metadata: request.metadata || {},
    };

    // Add to store
    const agentStore = useAgentStore.getState();
    agentStore.addAgent(agent);

    // Emit lifecycle event
    this.emitLifecycleEvent({
      agentId,
      instanceId,
      type: 'created',
      timestamp: new Date(),
      details: { poolId: request.poolId, type: request.agentType },
      triggeredBy: 'system',
    });

    return agent;
  }

  private async updateAgentState(instanceId: string, state: AgentState['current'], reason?: string): Promise<void> {
    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.instanceId === instanceId);
    
    if (!agent) return;

    const previousState = agent.state.current;
    
    agentStore.updateAgent(instanceId, {
      state: {
        current: state,
        previous: previousState,
        transitionTime: new Date(),
        reason,
      },
    });

    websocketService.broadcast({
      type: 'agent_state_changed',
      payload: {
        instanceId,
        previousState,
        newState: state,
        reason,
      },
      timestamp: new Date(),
    });
  }

  private startHealthChecks(instanceId: string): void {
    const interval = setInterval(async () => {
      await this.performHealthCheck(instanceId);
    }, 30000); // Check every 30 seconds

    this.healthCheckIntervals.set(instanceId, interval);
  }

  private stopHealthChecks(instanceId: string): void {
    const interval = this.healthCheckIntervals.get(instanceId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(instanceId);
    }
  }

  private async performHealthCheck(instanceId: string): Promise<void> {
    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.instanceId === instanceId);
    
    if (!agent) return;

    const checks: HealthCheck[] = [];

    // CPU check
    const cpuCheck = this.checkCpu(agent);
    checks.push(cpuCheck);

    // Memory check
    const memoryCheck = this.checkMemory(agent);
    checks.push(memoryCheck);

    // Task processing check
    const taskCheck = this.checkTaskProcessing(agent);
    checks.push(taskCheck);

    // Determine overall health
    const failedChecks = checks.filter(c => c.status === 'fail').length;
    const warnChecks = checks.filter(c => c.status === 'warn').length;

    let healthStatus: AgentHealth['status'] = 'healthy';
    if (failedChecks > 0) {
      healthStatus = 'unhealthy';
    } else if (warnChecks > 0) {
      healthStatus = 'degraded';
    }

    // Update health status
    const consecutiveFailures = healthStatus === 'unhealthy' 
      ? agent.health.consecutiveFailures + 1 
      : 0;

    agentStore.updateAgent(instanceId, {
      health: {
        status: healthStatus,
        checks,
        lastCheck: new Date(),
        consecutiveFailures,
      },
      lastHealthCheck: new Date(),
    });

    // Handle unhealthy agents
    if (consecutiveFailures >= 3) {
      await this.handleUnhealthyAgent(instanceId);
    }
  }

  private checkCpu(agent: AgentInstance): HealthCheck {
    const cpuUsed = agent.resources.used?.cpu ?? agent.resources.cpu?.used ?? 0;
    const cpuAllocated = agent.resources.allocated?.cpu ?? agent.resources.cpu?.allocated ?? 1;
    const cpuUsage = cpuUsed / cpuAllocated;
    
    return {
      name: 'cpu',
      status: cpuUsage > 0.9 ? 'fail' : cpuUsage > 0.7 ? 'warn' : 'pass',
      message: `CPU usage: ${Math.round(cpuUsage * 100)}%`,
      timestamp: new Date(),
      duration: 0,
    };
  }

  private checkMemory(agent: AgentInstance): HealthCheck {
    // Use numeric 'usage' property or convert/fallback legacy values
    const memoryUsedRaw = agent.resources.used?.memory ?? agent.resources.memory?.usage ?? 0;
    const memoryAllocatedRaw = agent.resources.allocated?.memory ?? agent.resources.memory?.allocated ?? 1;
    // Ensure numeric values
    const memoryUsed = typeof memoryUsedRaw === 'number' ? memoryUsedRaw : 0;
    const memoryAllocated = typeof memoryAllocatedRaw === 'number' ? memoryAllocatedRaw : 1;
    const memoryUsage = memoryUsed / memoryAllocated;
    
    return {
      name: 'memory',
      status: memoryUsage > 0.9 ? 'fail' : memoryUsage > 0.7 ? 'warn' : 'pass',
      message: `Memory usage: ${Math.round(memoryUsage * 100)}%`,
      timestamp: new Date(),
      duration: 0,
    };
  }

  private checkTaskProcessing(agent: AgentInstance): HealthCheck {
    const tasks = this.agentTasks.get(agent.instanceId) || [];
    const stuckTasks = tasks.filter(t => 
      t.status === 'active' && 
      t.startedAt && 
      Date.now() - t.startedAt.getTime() > 300000 // 5 minutes
    );
    
    return {
      name: 'task_processing',
      status: stuckTasks.length > 0 ? 'fail' : 'pass',
      message: stuckTasks.length > 0 
        ? `${stuckTasks.length} tasks stuck` 
        : 'Tasks processing normally',
      timestamp: new Date(),
      duration: 0,
    };
  }

  private async handleUnhealthyAgent(instanceId: string): Promise<void> {
    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.instanceId === instanceId);
    
    if (!agent) return;

    // Try to restart the agent
    if (agent.restartCount < 3) {
      await this.restartAgent(instanceId);
    } else {
      // Too many restarts, terminate the agent
      await this.terminateAgent(instanceId);
      
      // Provision a replacement
      await this.provisionAgent({
        poolId: agent.poolId,
        count: 1,
        agentType: agent.type,
        capabilities: agent.capabilities,
        resources: agent.resources?.allocated ?? { cpu: 2, memory: 4 },
      });
    }

    this.emitLifecycleEvent({
      agentId: agent.id,
      instanceId,
      type: 'failed',
      timestamp: new Date(),
      details: { 
        health: agent.health,
        restartCount: agent.restartCount,
      },
      triggeredBy: 'health_check',
    });
  }

  private async executeTask(instanceId: string, task: AgentTask): Promise<void> {
    const agentStore = useAgentStore.getState();
    
    try {
      // Update task status
      task.status = 'active';
      task.startedAt = new Date();

      // Simulate task execution
      await this.simulateTaskExecution(task);

      // Task completed successfully
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = { success: true };

      // Update agent state
      await this.updateAgentState(instanceId, 'idle', 'Task completed');
      
      const agent = agentStore.agents.find(a => a.instanceId === instanceId);
      if (agent) {
        agentStore.updateAgent(instanceId, {
          currentTask: undefined,
          progress: 0,
        });
      }
    } catch (error) {
      // Task failed
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = error instanceof Error ? error.message : 'Unknown error';

      // Handle retry
      if (task.retryCount < 3) {
        task.retryCount++;
        task.status = 'queued';
        await this.executeTask(instanceId, task);
      } else {
        // Update agent state
        await this.updateAgentState(instanceId, 'idle', 'Task failed');
      }
    }

    // Broadcast task update
    websocketService.broadcast({
      type: 'task_updated',
      payload: task,
      timestamp: new Date(),
    });
  }

  private async simulateTaskExecution(task: AgentTask): Promise<void> {
    // Simulate different task durations based on type
    const durations: Record<string, number> = {
      build: 5000,
      test: 3000,
      deploy: 7000,
      analyze: 4000,
      custom: 2000,
    };

    const duration = durations[task.type] || 2000;
    await new Promise(resolve => setTimeout(resolve, duration));

    // Simulate random failures (10% chance)
    if (Math.random() < 0.1) {
      throw new Error('Task execution failed');
    }
  }

  private emitLifecycleEvent(event: AgentLifecycleEvent): void {
    websocketService.broadcast({
      type: 'agent_lifecycle_event',
      payload: event,
      timestamp: new Date(),
    });

    // Log event for audit trail
    console.log('Agent lifecycle event:', event);
  }

  async scaleAgents(farmId: string, delta: number): Promise<AgentInstance[]> {
    const agentStore = useAgentStore.getState();
    const farmAgents = agentStore.agents.filter(a => a.farmId === farmId);
    
    if (!farmAgents.length) {
      throw new Error('No agents found for farm');
    }

    const agents: AgentInstance[] = [];
    
    if (delta > 0) {
      // Scale up - provision new agents
      const firstAgent = farmAgents[0];
      const request: AgentProvisioningRequest = {
        poolId: firstAgent.poolId || 'default',
        count: delta,
        agentType: firstAgent.type,
        capabilities: firstAgent.capabilities,
        resources: {
          cpu: firstAgent.resources?.cpu?.allocated || firstAgent.resources?.allocated?.cpu || 2,
          memory: firstAgent.resources?.memory?.allocated || firstAgent.resources?.allocated?.memory || 4,
        }
      };
      
      const newInstances = await this.provisionAgent(request);
      // Return AgentInstances directly
      agents.push(...newInstances);
    } else if (delta < 0) {
      // Scale down - terminate idle agents
      const idleAgents = farmAgents
        .filter(a => a.status === 'idle')
        .slice(0, Math.abs(delta));
      
      for (const agent of idleAgents) {
        if (agent.instanceId) {
          await this.terminateAgent(agent.instanceId);
        }
      }
    }
    
    return agents;
  }

  async getAgentHealth(agentId: string): Promise<AgentHealth> {
    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.id === agentId || a.instanceId === agentId);
    
    if (!agent) {
      throw new Error('Agent not found');
    }

    // If agent has health property, return it
    if (agent.health) {
      return agent.health;
    }

    // Otherwise create a default health status
    return {
      status: agent.status === 'idle' || agent.status === 'working' ? 'healthy' : 'unhealthy',
      checks: [],
      lastCheck: new Date(),
      lastUpdated: new Date(),
      consecutiveFailures: 0
    } as AgentHealth;
  }
}

export const agentLifecycle = new AgentLifecycle();