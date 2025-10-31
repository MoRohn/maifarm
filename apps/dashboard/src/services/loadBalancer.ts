import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import PQueue from 'p-queue';

interface AgentNode {
  id: string;
  type: string;
  status: 'idle' | 'busy' | 'offline';
  load: number;
  maxCapacity: number;
  specializations: string[];
  performance: {
    avgResponseTime: number;
    successRate: number;
    tasksCompleted: number;
  };
  lastAssignment: number;
  healthScore: number;
}

interface Task {
  id: string;
  type: string;
  priority: number;
  requirements: {
    specialization?: string;
    minPerformance?: number;
    preferredAgent?: string;
  };
  estimatedDuration: number;
  retries: number;
  createdAt: number;
}

interface LoadBalancingStrategy {
  name: string;
  selectAgent: (task: Task, agents: AgentNode[]) => AgentNode | null;
}

class LoadBalancerService extends EventEmitter {
  private agents: Map<string, AgentNode> = new Map();
  private taskQueue: PQueue;
  private pendingTasks: Map<string, Task> = new Map();
  private activeAssignments: Map<string, string> = new Map(); // taskId -> agentId
  private strategy: LoadBalancingStrategy;
  private strategies: Map<string, LoadBalancingStrategy> = new Map();
  
  constructor() {
    super();
    
    // Initialize task queue with concurrency control
    this.taskQueue = new PQueue({ 
      concurrency: 10,
      interval: 1000,
      intervalCap: 50
    });

    // Register default strategies
    this.registerDefaultStrategies();
    
    // Use round-robin as default
    this.strategy = this.strategies.get('least-connections')!;

    // Start monitoring
    this.startMonitoring();
  }

  private registerDefaultStrategies(): void {
    // Least Connections Strategy
    this.strategies.set('least-connections', {
      name: 'least-connections',
      selectAgent: (task, agents) => {
        const available = agents.filter(a => 
          a.status !== 'offline' && 
          a.load < a.maxCapacity &&
          this.meetsRequirements(task, a)
        );

        if (available.length === 0) return null;

        return available.reduce((best, agent) => 
          agent.load < best.load ? agent : best
        );
      }
    });

    // Resource-Based Strategy
    this.strategies.set('resource-based', {
      name: 'resource-based',
      selectAgent: (task, agents) => {
        const available = agents.filter(a => 
          a.status !== 'offline' && 
          a.load < a.maxCapacity &&
          this.meetsRequirements(task, a)
        );

        if (available.length === 0) return null;

        return available.reduce((best, agent) => {
          const agentScore = this.calculateResourceScore(agent);
          const bestScore = this.calculateResourceScore(best);
          return agentScore > bestScore ? agent : best;
        });
      }
    });

    // Performance-Based Strategy
    this.strategies.set('performance-based', {
      name: 'performance-based',
      selectAgent: (task, agents) => {
        const available = agents.filter(a => 
          a.status !== 'offline' && 
          a.load < a.maxCapacity &&
          this.meetsRequirements(task, a)
        );

        if (available.length === 0) return null;

        return available.reduce((best, agent) => {
          const agentScore = agent.performance.successRate * 
            (1 / agent.performance.avgResponseTime) * 
            agent.healthScore;
          const bestScore = best.performance.successRate * 
            (1 / best.performance.avgResponseTime) * 
            best.healthScore;
          return agentScore > bestScore ? agent : best;
        });
      }
    });

    // Weighted Round Robin Strategy
    this.strategies.set('weighted-round-robin', {
      name: 'weighted-round-robin',
      selectAgent: (task, agents) => {
        const available = agents.filter(a => 
          a.status !== 'offline' && 
          a.load < a.maxCapacity &&
          this.meetsRequirements(task, a)
        );

        if (available.length === 0) return null;

        // Sort by last assignment time and capacity
        return available.sort((a, b) => {
          const timeDiff = a.lastAssignment - b.lastAssignment;
          if (timeDiff !== 0) return timeDiff;
          
          // If same time, prefer higher capacity
          return b.maxCapacity - a.maxCapacity;
        })[0];
      }
    });
  }

  private meetsRequirements(task: Task, agent: AgentNode): boolean {
    const { requirements } = task;

    // Check specialization
    if (requirements.specialization && 
        !agent.specializations.includes(requirements.specialization)) {
      return false;
    }

    // Check performance threshold
    if (requirements.minPerformance && 
        agent.performance.successRate < requirements.minPerformance) {
      return false;
    }

    // Check preferred agent
    if (requirements.preferredAgent && 
        agent.id !== requirements.preferredAgent) {
      // Allow non-preferred agents only if load is high
      const preferred = this.agents.get(requirements.preferredAgent);
      if (preferred && preferred.status !== 'offline' && 
          preferred.load < preferred.maxCapacity * 0.8) {
        return false;
      }
    }

    return true;
  }

  private calculateResourceScore(agent: AgentNode): number {
    const availableCapacity = (agent.maxCapacity - agent.load) / agent.maxCapacity;
    const performanceScore = agent.performance.successRate;
    const healthScore = agent.healthScore;
    
    return (availableCapacity * 0.4 + performanceScore * 0.4 + healthScore * 0.2);
  }

  async registerAgent(agent: Omit<AgentNode, 'healthScore'>): Promise<void> {
    const agentWithHealth: AgentNode = {
      ...agent,
      healthScore: 1.0
    };

    this.agents.set(agent.id, agentWithHealth);
    this.emit('agent:registered', agent);

    // Rebalance if needed
    await this.rebalanceLoad();
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Reassign active tasks
    const activeTasks = Array.from(this.activeAssignments.entries())
      .filter(([_, aId]) => aId === agentId)
      .map(([taskId]) => this.pendingTasks.get(taskId))
      .filter(Boolean) as Task[];

    this.agents.delete(agentId);
    this.emit('agent:unregistered', agentId);

    // Reassign tasks
    for (const task of activeTasks) {
      this.activeAssignments.delete(task.id);
      await this.assignTask(task);
    }
  }

  async submitTask(task: Omit<Task, 'id' | 'retries' | 'createdAt'>): Promise<string> {
    const fullTask: Task = {
      ...task,
      id: uuidv4(),
      retries: 0,
      createdAt: Date.now()
    };

    this.pendingTasks.set(fullTask.id, fullTask);
    
    // Add to queue
    this.taskQueue.add(async () => {
      await this.assignTask(fullTask);
    });

    this.emit('task:submitted', fullTask);
    return fullTask.id;
  }

  private async assignTask(task: Task): Promise<void> {
    const maxRetries = 3;
    
    while (task.retries < maxRetries) {
      const agent = this.strategy.selectAgent(
        task,
        Array.from(this.agents.values())
      );

      if (!agent) {
        // No suitable agent available
        task.retries++;
        
        if (task.retries >= maxRetries) {
          this.emit('task:failed', {
            task,
            reason: 'No suitable agent available'
          });
          this.pendingTasks.delete(task.id);
          return;
        }

        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000 * task.retries));
        continue;
      }

      try {
        // Assign task to agent
        await this.executeAssignment(task, agent);
        break;
      } catch (error) {
        task.retries++;
        
        if (task.retries >= maxRetries) {
          this.emit('task:failed', {
            task,
            reason: (error as Error).message
          });
          this.pendingTasks.delete(task.id);
          return;
        }
      }
    }
  }

  private async executeAssignment(task: Task, agent: AgentNode): Promise<void> {
    // Update agent state
    agent.load++;
    agent.status = agent.load >= agent.maxCapacity ? 'busy' : 'idle';
    agent.lastAssignment = Date.now();

    // Record assignment
    this.activeAssignments.set(task.id, agent.id);

    this.emit('task:assigned', {
      taskId: task.id,
      agentId: agent.id,
      timestamp: Date.now()
    });

    // In a real implementation, this would communicate with the actual agent
    // For now, we'll simulate task execution
    setTimeout(() => {
      this.completeTask(task.id, agent.id);
    }, task.estimatedDuration);
  }

  async completeTask(taskId: string, agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    const task = this.pendingTasks.get(taskId);

    if (!agent || !task) return;

    // Update agent metrics
    agent.load = Math.max(0, agent.load - 1);
    agent.status = agent.load === 0 ? 'idle' : agent.status;
    agent.performance.tasksCompleted++;

    // Clean up
    this.activeAssignments.delete(taskId);
    this.pendingTasks.delete(taskId);

    this.emit('task:completed', {
      taskId,
      agentId,
      timestamp: Date.now()
    });

    // Check for queued tasks
    if (this.taskQueue.size > 0 && agent.status === 'idle') {
      // Agent is available for more work
      this.emit('agent:available', agentId);
    }
  }

  async updateAgentMetrics(
    agentId: string,
    metrics: Partial<AgentNode['performance']>
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.performance = { ...agent.performance, ...metrics };
    
    // Recalculate health score
    agent.healthScore = this.calculateHealthScore(agent);

    this.emit('agent:metrics:updated', {
      agentId,
      metrics: agent.performance,
      healthScore: agent.healthScore
    });
  }

  private calculateHealthScore(agent: AgentNode): number {
    const loadFactor = 1 - (agent.load / agent.maxCapacity);
    const performanceFactor = agent.performance.successRate;
    const responseFactor = Math.min(1, 1000 / agent.performance.avgResponseTime);
    
    return (loadFactor * 0.3 + performanceFactor * 0.5 + responseFactor * 0.2);
  }

  async rebalanceLoad(): Promise<void> {
    const overloadedAgents = Array.from(this.agents.values())
      .filter(a => a.load > a.maxCapacity * 0.8);

    const underloadedAgents = Array.from(this.agents.values())
      .filter(a => a.load < a.maxCapacity * 0.5 && a.status !== 'offline');

    if (overloadedAgents.length === 0 || underloadedAgents.length === 0) {
      return;
    }

    // Find tasks to reassign
    const tasksToReassign: Task[] = [];
    
    for (const agent of overloadedAgents) {
      const agentTasks = Array.from(this.activeAssignments.entries())
        .filter(([_, aId]) => aId === agent.id)
        .map(([taskId]) => this.pendingTasks.get(taskId))
        .filter(Boolean) as Task[];

      // Select lower priority tasks for reassignment
      const candidates = agentTasks
        .sort((a, b) => a.priority - b.priority)
        .slice(0, Math.floor(agentTasks.length * 0.3));

      tasksToReassign.push(...candidates);
    }

    // Reassign tasks
    for (const task of tasksToReassign) {
      const currentAgentId = this.activeAssignments.get(task.id);
      if (!currentAgentId) continue;

      const newAgent = this.strategy.selectAgent(task, underloadedAgents);
      if (!newAgent || newAgent.id === currentAgentId) continue;

      // Move task
      this.activeAssignments.set(task.id, newAgent.id);
      
      const oldAgent = this.agents.get(currentAgentId);
      if (oldAgent) {
        oldAgent.load--;
      }
      
      newAgent.load++;

      this.emit('task:rebalanced', {
        taskId: task.id,
        fromAgent: currentAgentId,
        toAgent: newAgent.id
      });
    }
  }

  setStrategy(strategyName: string): void {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown strategy: ${strategyName}`);
    }

    this.strategy = strategy;
    this.emit('strategy:changed', strategyName);
  }

  getStatistics(): {
    totalAgents: number;
    activeAgents: number;
    totalTasks: number;
    queuedTasks: number;
    activeTasks: number;
    avgLoad: number;
    strategy: string;
  } {
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter(a => a.status !== 'offline');
    
    const avgLoad = activeAgents.length > 0
      ? activeAgents.reduce((sum, a) => sum + (a.load / a.maxCapacity), 0) / activeAgents.length
      : 0;

    return {
      totalAgents: agents.length,
      activeAgents: activeAgents.length,
      totalTasks: this.pendingTasks.size + this.taskQueue.size,
      queuedTasks: this.taskQueue.size,
      activeTasks: this.activeAssignments.size,
      avgLoad: avgLoad * 100,
      strategy: this.strategy.name
    };
  }

  private startMonitoring(): void {
    // Monitor queue health
    setInterval(() => {
      const stats = this.getStatistics();
      
      if (stats.queuedTasks > 100) {
        this.emit('queue:backlog', {
          queueSize: stats.queuedTasks,
          avgLoad: stats.avgLoad
        });
      }

      if (stats.avgLoad > 80) {
        this.emit('capacity:warning', {
          avgLoad: stats.avgLoad,
          activeAgents: stats.activeAgents
        });
      }
    }, 10000);

    // Periodic rebalancing
    setInterval(() => {
      this.rebalanceLoad();
    }, 30000);
  }

  async scaleAgents(targetCount: number): Promise<void> {
    const currentCount = this.agents.size;
    
    if (targetCount > currentCount) {
      // Scale up
      const toAdd = targetCount - currentCount;
      this.emit('scale:up', { count: toAdd });
    } else if (targetCount < currentCount) {
      // Scale down
      const toRemove = currentCount - targetCount;
      const candidates = Array.from(this.agents.values())
        .filter(a => a.load === 0)
        .slice(0, toRemove);
      
      for (const agent of candidates) {
        await this.unregisterAgent(agent.id);
      }
      
      this.emit('scale:down', { count: candidates.length });
    }
  }
}

export const loadBalancer = new LoadBalancerService();