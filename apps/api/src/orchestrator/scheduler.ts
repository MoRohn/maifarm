import { db } from '../database/connection';
import { taskQueue } from './taskQueue';
import { Task, Agent } from '../types/api';
import { EventEmitter } from 'events';

export interface SchedulingStrategy {
  selectAgent(agents: Agent[], task: Task): Agent | null;
}

export class RoundRobinStrategy implements SchedulingStrategy {
  private lastAssignedIndex = 0;

  selectAgent(agents: Agent[], task: Task): Agent | null {
    if (agents.length === 0) return null;
    
    const availableAgents = agents.filter(a => 
      a.status === 'idle' || a.status === 'active'
    );
    
    if (availableAgents.length === 0) return null;
    
    this.lastAssignedIndex = (this.lastAssignedIndex + 1) % availableAgents.length;
    return availableAgents[this.lastAssignedIndex];
  }
}

export class LeastLoadedStrategy implements SchedulingStrategy {
  selectAgent(agents: Agent[], task: Task): Agent | null {
    const availableAgents = agents.filter(a => 
      a.status === 'idle' || a.status === 'active'
    );
    
    if (availableAgents.length === 0) return null;
    
    return availableAgents.reduce((least, current) => {
      const leastLoad = least.metrics?.tasksCompleted || 0;
      const currentLoad = current.metrics?.tasksCompleted || 0;
      return currentLoad < leastLoad ? current : least;
    });
  }
}

export class ResourceBasedStrategy implements SchedulingStrategy {
  selectAgent(agents: Agent[], task: Task): Agent | null {
    const availableAgents = agents.filter(a => 
      (a.status === 'idle' || a.status === 'active') &&
      this.hasRequiredResources(a, task)
    );
    
    if (availableAgents.length === 0) return null;
    
    // Select agent with most available resources
    return availableAgents.reduce((best, current) => {
      const bestScore = this.calculateResourceScore(best);
      const currentScore = this.calculateResourceScore(current);
      return currentScore > bestScore ? current : best;
    });
  }

  private hasRequiredResources(agent: Agent, task: Task): boolean {
    const taskRequirements = task.metadata?.resources || {};
    const agentResources = agent.resources;
    
    if (taskRequirements.cpu && agentResources.cpu < taskRequirements.cpu) {
      return false;
    }
    
    if (taskRequirements.memory && agentResources.memory < taskRequirements.memory) {
      return false;
    }
    
    if (taskRequirements.gpu && (!agentResources.gpu || agentResources.gpu < taskRequirements.gpu)) {
      return false;
    }
    
    return true;
  }

  private calculateResourceScore(agent: Agent): number {
    const cpu = agent.resources.cpu || 0;
    const memory = agent.resources.memory || 0;
    const gpu = agent.resources.gpu || 0;
    
    // Weighted score based on resource availability
    return cpu * 0.3 + (memory / 1024) * 0.5 + gpu * 0.2;
  }
}

export class TaskScheduler extends EventEmitter {
  private strategies: Map<string, SchedulingStrategy> = new Map();
  private isRunning = false;
  private schedulingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    
    // Register default strategies
    this.strategies.set('round-robin', new RoundRobinStrategy());
    this.strategies.set('least-loaded', new LeastLoadedStrategy());
    this.strategies.set('resource-based', new ResourceBasedStrategy());
  }

  /**
   * Register a custom scheduling strategy
   */
  registerStrategy(name: string, strategy: SchedulingStrategy): void {
    this.strategies.set(name, strategy);
  }

  /**
   * Start the scheduler
   */
  start(intervalMs = 5000): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.schedulingInterval = setInterval(() => {
      this.scheduleNextTasks().catch(err => {
        console.error('Scheduling error:', err);
        this.emit('error', err);
      });
    }, intervalMs);
    
    // Run immediately
    this.scheduleNextTasks();
    
    this.emit('scheduler:started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.schedulingInterval) {
      clearInterval(this.schedulingInterval);
      this.schedulingInterval = null;
    }
    
    this.emit('scheduler:stopped');
  }

  /**
   * Schedule next batch of tasks
   */
  private async scheduleNextTasks(): Promise<void> {
    try {
      // Get next task from queue
      const queuedTask = await taskQueue.dequeue();
      if (!queuedTask) return;

      // Get task details from database
      const taskResult = await db.query(
        'SELECT * FROM tasks WHERE id = $1 AND status = $2',
        [queuedTask.id, 'queued']
      );
      
      if (taskResult.rows.length === 0) {
        // Task no longer exists or not queued
        return;
      }
      
      const task = this.rowToTask(taskResult.rows[0]);
      
      // Check dependencies
      if (task.dependencies.length > 0) {
        const allDependenciesComplete = await this.checkDependencies(task.dependencies);
        if (!allDependenciesComplete) {
          // Re-queue the task
          await taskQueue.enqueue(task);
          return;
        }
      }
      
      // Get farm configuration
      const farmResult = await db.query(
        'SELECT config FROM farms WHERE id = $1',
        [task.farmId]
      );
      
      if (farmResult.rows.length === 0) {
        await this.markTaskFailed(task.id, 'Farm not found');
        return;
      }
      
      const farmConfig = farmResult.rows[0].config;
      const strategyName = farmConfig.orchestrationStrategy || 'round-robin';
      
      // Get available agents
      const agentsResult = await db.query(
        'SELECT * FROM agents WHERE farm_id = $1 AND status IN ($2, $3)',
        [task.farmId, 'idle', 'active']
      );
      
      const agents = agentsResult.rows.map(this.rowToAgent);
      
      if (agents.length === 0) {
        // No agents available, re-queue
        await taskQueue.enqueue(task);
        return;
      }
      
      // Select agent using strategy
      const strategy = this.strategies.get(strategyName) || this.strategies.get('round-robin')!;
      const selectedAgent = strategy.selectAgent(agents, task);
      
      if (!selectedAgent) {
        // No suitable agent, re-queue
        await taskQueue.enqueue(task);
        return;
      }
      
      // Assign task to agent
      await this.assignTaskToAgent(task.id, selectedAgent.id);
      
      this.emit('task:assigned', { task, agent: selectedAgent });
    } catch (error) {
      console.error('Error in task scheduling:', error);
      this.emit('error', error);
    }
  }

  /**
   * Check if all dependencies are completed
   */
  private async checkDependencies(dependencies: string[]): Promise<boolean> {
    const result = await db.query(
      'SELECT COUNT(*) FROM tasks WHERE id = ANY($1::uuid[]) AND status != $2',
      [dependencies, 'completed']
    );
    
    return parseInt(result.rows[0].count) === 0;
  }

  /**
   * Assign task to agent
   */
  private async assignTaskToAgent(taskId: string, agentId: string): Promise<void> {
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update task
      await client.query(
        `UPDATE tasks 
         SET status = 'assigned', agent_id = $1, assigned_at = $2, updated_at = $2
         WHERE id = $3`,
        [agentId, new Date(), taskId]
      );
      
      // Update agent status
      await client.query(
        `UPDATE agents 
         SET status = 'processing', updated_at = $1
         WHERE id = $2`,
        [new Date(), agentId]
      );
      
      await client.query('COMMIT');
      
      // Mark task as complete in queue
      await taskQueue.complete(taskId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark task as failed
   */
  private async markTaskFailed(taskId: string, error: string): Promise<void> {
    await db.query(
      `UPDATE tasks 
       SET status = 'failed', error = $1, updated_at = $2
       WHERE id = $3`,
      [{ message: error }, new Date(), taskId]
    );
    
    await taskQueue.markFailed(taskId, new Error(error));
  }

  /**
   * Convert database row to Task object
   */
  private rowToTask(row: any): Task {
    return {
      id: row.id,
      farmId: row.farm_id,
      agentId: row.agent_id,
      type: row.type,
      priority: row.priority,
      status: row.status,
      payload: row.payload,
      result: row.result,
      error: row.error,
      dependencies: row.dependencies || [],
      retries: row.retries,
      maxRetries: row.max_retries,
      timeout: row.timeout,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      assignedAt: row.assigned_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Convert database row to Agent object
   */
  private rowToAgent(row: any): Agent {
    return {
      id: row.id,
      farmId: row.farm_id,
      name: row.name,
      type: row.type,
      status: row.status,
      capabilities: row.capabilities,
      resources: row.resources,
      metrics: row.metrics,
      config: row.config,
      lastHeartbeat: row.last_heartbeat,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const taskScheduler = new TaskScheduler();