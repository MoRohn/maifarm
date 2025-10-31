import { EventEmitter } from 'events';
import { Agent, Farm } from '@/types';
import type { AgentStatus } from '@/types';

interface FailoverConfig {
  enabled: boolean;
  strategy: 'round-robin' | 'least-loaded' | 'random';
  healthCheckInterval: number;
  failureThreshold: number;
  cooldownPeriod: number;
  maxFailovers: number;
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
}

interface AgentFailoverState {
  agentId: string;
  failoverCount: number;
  lastFailoverTime?: Date;
  circuitBreaker: CircuitBreakerState;
}

export class FailoverService extends EventEmitter {
  private config: FailoverConfig;
  private agentStates: Map<string, AgentFailoverState> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: FailoverConfig) {
    super();
    this.config = config;
  }

  startMonitoring(farm: Farm): void {
    if (!this.config.enabled) return;

    // Set up health check intervals for each agent
    (farm.agents || []).forEach(agent => {
      this.monitorAgent(agent, farm);
    });

    this.emit('failover:monitoring:started', { farmId: farm.id });
  }

  stopMonitoring(farmId: string): void {
    // Clear all health check intervals
    this.healthCheckIntervals.forEach((interval, key) => {
      if (key.startsWith(farmId)) {
        clearInterval(interval);
        this.healthCheckIntervals.delete(key);
      }
    });

    this.emit('failover:monitoring:stopped', { farmId });
  }

  private monitorAgent(agent: Agent, farm: Farm): void {
    const key = `${farm.id}:${agent.id}`;
    
    // Initialize agent state
    if (!this.agentStates.has(agent.id)) {
      this.agentStates.set(agent.id, {
        agentId: agent.id,
        failoverCount: 0,
        circuitBreaker: {
          state: 'closed',
          failureCount: 0
        }
      });
    }

    const interval = setInterval(async () => {
      await this.checkAgentHealth(agent, farm);
    }, this.config.healthCheckInterval);

    this.healthCheckIntervals.set(key, interval);
  }

  private async checkAgentHealth(agent: Agent, farm: Farm): Promise<void> {
    const state = this.agentStates.get(agent.id);
    if (!state) return;

    // Check circuit breaker state
    if (state.circuitBreaker.state === 'open') {
      if (this.shouldAttemptRecovery(state.circuitBreaker)) {
        state.circuitBreaker.state = 'half-open';
      } else {
        return; // Skip health check while circuit is open
      }
    }

    try {
      const isHealthy = await this.performHealthCheck(agent);
      
      if (isHealthy) {
        this.handleHealthCheckSuccess(agent, state);
      } else {
        await this.handleHealthCheckFailure(agent, state, farm);
      }
    } catch (error) {
      await this.handleHealthCheckError(agent, state, farm, error);
    }
  }

  private async performHealthCheck(agent: Agent): Promise<boolean> {
    // Check various health indicators
    const checks = [
      agent.lifecycle?.health?.status !== 'unhealthy',
      (agent.resources?.cpu?.usage ?? 0) < 0.95,
      (agent.resources?.memory?.usage ?? 0) < 95,
      (agent.metrics?.tasksCompleted ?? 0) > 0 || (agent.metrics?.tasksFailed ?? 0) < 10,
      this.checkAgentResponsiveness(agent)
    ];

    return checks.every(check => check === true);
  }

  private checkAgentResponsiveness(agent: Agent): boolean {
    // Check if agent has been responsive recently
    const lastHealthCheck = agent.lastHealthCheck || agent.lifecycle?.health?.lastCheck;
    if (!lastHealthCheck) return false;
    
    const lastHealthCheckDate = lastHealthCheck instanceof Date ? lastHealthCheck : new Date(lastHealthCheck);
    const now = new Date();
    const timeSinceLastCheck = now.getTime() - lastHealthCheckDate.getTime();
    
    return timeSinceLastCheck < this.config.healthCheckInterval * 2;
  }

  private handleHealthCheckSuccess(agent: Agent, state: AgentFailoverState): void {
    // Reset circuit breaker on success
    if (state.circuitBreaker.state === 'half-open') {
      state.circuitBreaker.state = 'closed';
      state.circuitBreaker.failureCount = 0;
      this.emit('failover:circuit:closed', { agentId: agent.id });
    }
  }

  private async handleHealthCheckFailure(
    agent: Agent, 
    state: AgentFailoverState, 
    farm: Farm
  ): Promise<void> {
    state.circuitBreaker.failureCount++;
    state.circuitBreaker.lastFailureTime = new Date();

    if (state.circuitBreaker.failureCount >= this.config.failureThreshold) {
      // Open circuit breaker
      state.circuitBreaker.state = 'open';
      state.circuitBreaker.nextRetryTime = new Date(
        Date.now() + this.config.cooldownPeriod
      );
      
      this.emit('failover:circuit:open', { agentId: agent.id });

      // Trigger failover
      await this.triggerFailover(agent, farm);
    }
  }

  private async handleHealthCheckError(
    agent: Agent, 
    state: AgentFailoverState, 
    farm: Farm,
    error: any
  ): Promise<void> {
    this.emit('failover:health:error', { 
      agentId: agent.id, 
      error: error.message || 'Unknown error' 
    });
    
    // Treat errors as failures
    await this.handleHealthCheckFailure(agent, state, farm);
  }

  private shouldAttemptRecovery(circuitBreaker: CircuitBreakerState): boolean {
    if (!circuitBreaker.nextRetryTime) return false;
    return new Date() >= circuitBreaker.nextRetryTime;
  }

  private async triggerFailover(failedAgent: Agent, farm: Farm): Promise<void> {
    const state = this.agentStates.get(failedAgent.id);
    if (!state) return;

    // Check if we've exceeded max failovers
    if (state.failoverCount >= this.config.maxFailovers) {
      this.emit('failover:max:exceeded', { 
        agentId: failedAgent.id, 
        failoverCount: state.failoverCount 
      });
      return;
    }

    // Find replacement agent
    const replacementAgent = this.selectReplacementAgent(failedAgent, farm);
    if (!replacementAgent) {
      this.emit('failover:no:replacement', { agentId: failedAgent.id });
      return;
    }

    // Perform failover
    state.failoverCount++;
    state.lastFailoverTime = new Date();

    this.emit('failover:started', { 
      failedAgentId: failedAgent.id, 
      replacementAgentId: replacementAgent.id 
    });

    try {
      // Migrate tasks from failed agent to replacement
      await this.migrateTasks(failedAgent, replacementAgent);
      
      // Update agent states
      failedAgent.status = 'failed';
      if (failedAgent.lifecycle) {
        failedAgent.lifecycle.state = 'failed';
      }
      
      this.emit('failover:completed', { 
        failedAgentId: failedAgent.id, 
        replacementAgentId: replacementAgent.id 
      });
    } catch (error) {
      this.emit('failover:failed', { 
        failedAgentId: failedAgent.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  private selectReplacementAgent(failedAgent: Agent, farm: Farm): Agent | null {
    const healthyAgents = (farm.agents || []).filter(agent => 
      agent.id !== failedAgent.id &&
      (agent.status === 'idle' || agent.status === 'active') &&
      agent.lifecycle?.health?.status === 'healthy' &&
      this.hasCapacity(agent)
    );

    if (healthyAgents.length === 0) return null;

    switch (this.config.strategy) {
      case 'round-robin':
        return this.selectRoundRobin(healthyAgents);
      
      case 'least-loaded':
        return this.selectLeastLoaded(healthyAgents);
      
      case 'random':
        return this.selectRandom(healthyAgents);
      
      default:
        return healthyAgents[0];
    }
  }

  private hasCapacity(agent: Agent): boolean {
    return (agent.resources?.cpu?.usage ?? 0) < 0.7 && 
           (agent.resources?.memory?.usage ?? 0) < 70 &&
           (agent.tasks?.length ?? 0) < 10;
  }

  private selectRoundRobin(agents: Agent[]): Agent {
    // Simple round-robin selection
    // In production, maintain a proper round-robin index
    return agents[0];
  }

  private selectLeastLoaded(agents: Agent[]): Agent {
    return agents.reduce((least, current) => {
      const leastCpu = least.resources?.cpu?.usage ?? 0;
      const leastMem = least.resources?.memory?.usage ?? 0;
      const leastLoad = leastCpu + (leastMem / 100);
      
      const currentCpu = current.resources?.cpu?.usage ?? 0;
      const currentMem = current.resources?.memory?.usage ?? 0;
      const currentLoad = currentCpu + (currentMem / 100);
      
      return currentLoad < leastLoad ? current : least;
    });
  }

  private selectRandom(agents: Agent[]): Agent {
    return agents[Math.floor(Math.random() * agents.length)];
  }

  private async migrateTasks(fromAgent: Agent, toAgent: Agent): Promise<void> {
    // Get all pending and running tasks
    const tasksToMigrate = (fromAgent.tasks || []).filter(task => 
      ['pending', 'active'].includes(task.status)
    );

    for (const task of tasksToMigrate) {
      // Mark task as pending on new agent
      task.status = 'pending';
      (task as any).agentId = toAgent.id;
      
      // Add to new agent's task queue
      if (!toAgent.tasks) {
        toAgent.tasks = [];
      }
      toAgent.tasks.push(task);
      
      this.emit('failover:task:migrated', { 
        taskId: task.id, 
        fromAgentId: fromAgent.id, 
        toAgentId: toAgent.id 
      });
    }

    // Clear tasks from failed agent
    if (fromAgent.tasks) {
      fromAgent.tasks = fromAgent.tasks.filter(task => 
        task.status === 'completed' || task.status === 'failed'
      );
    }
  }

  getAgentFailoverState(agentId: string): AgentFailoverState | undefined {
    return this.agentStates.get(agentId);
  }

  resetAgentState(agentId: string): void {
    const state = this.agentStates.get(agentId);
    if (state) {
      state.failoverCount = 0;
      state.lastFailoverTime = undefined;
      state.circuitBreaker = {
        state: 'closed',
        failureCount: 0
      };
    }
  }
}