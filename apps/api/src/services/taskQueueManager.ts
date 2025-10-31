/**
 * Task Queue Manager
 * 
 * Manages task distribution to agents, load balancing, and task lifecycle.
 * Integrates with AgentHandshakeService for agent availability tracking.
 */

import { EventEmitter } from 'events';
import * as uuid from 'uuid';
import { agentHandshakeService, Task, AgentStatus } from './agentHandshakeService';
import { logger } from '../monitoring/logger';
import { WebSocketServer } from '../websocket/socketServer';
import * as path from 'path';
import * as fs from 'fs/promises';
import { pathConfig } from '../config/paths';

export interface TaskRequest {
  prompt: string;
  context?: any;
  priority?: number;
  farmId?: string;
  userId?: string;
  timeout?: number;
  retryCount?: number;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  agentName: string;
  result?: string;
  error?: string;
  executionTime: number;
  completedAt: Date;
}

export class TaskQueueManager extends EventEmitter {
  private taskQueue: Map<string, Task> = new Map();
  private pendingTasks: Task[] = [];
  private activeTasks: Map<string, Task> = new Map();
  private completedTasks: Map<string, TaskResult> = new Map();
  private taskTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private wsServer: WebSocketServer | null = null;
  private coordinationDir: string;
  private readonly DEFAULT_TASK_TIMEOUT = 300000; // 5 minutes
  private readonly MAX_RETRIES = 3;
  private distributionInterval: NodeJS.Timer | null = null;
  private readonly DISTRIBUTION_INTERVAL = 2000; // 2 seconds

  constructor() {
    super();
    const paths = pathConfig.getPaths();
    this.coordinationDir = paths.COORDINATION_DIR;
    this.initialize();
  }

  private initialize() {
    // Listen to agent events
    agentHandshakeService.on('agent:registered', this.onAgentRegistered.bind(this));
    agentHandshakeService.on('agent:status', this.onAgentStatusChange.bind(this));
    agentHandshakeService.on('task:completed', this.onTaskCompleted.bind(this));
    
    // Start task distribution loop
    this.startDistributionLoop();
    
    logger.info('[TaskQueueManager] Initialized');
  }

  /**
   * Set WebSocket server for real-time updates
   */
  setWebSocketServer(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  /**
   * Submit a new task to the queue
   */
  async submitTask(request: TaskRequest): Promise<string> {
    const taskId = uuid.v4();
    
    const task: Task = {
      taskId,
      prompt: request.prompt,
      context: request.context,
      priority: request.priority || 0,
      createdAt: new Date(),
      status: 'pending'
    };
    
    // Add to queue
    this.taskQueue.set(taskId, task);
    this.pendingTasks.push(task);
    
    // Sort by priority
    this.pendingTasks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Emit task submission event
    this.emit('task:submitted', task);
    
    // Broadcast to WebSocket
    if (this.wsServer) {
      this.wsServer.broadcast('task:submitted', {
        taskId,
        farmId: request.farmId,
        status: 'pending',
        queuePosition: this.pendingTasks.length
      });
    }
    
    logger.info(`[TaskQueueManager] Task ${taskId} submitted to queue`);
    
    // Trigger immediate distribution attempt
    await this.distributeTasks();
    
    return taskId;
  }

  /**
   * Distribute tasks to available agents
   */
  private async distributeTasks() {
    if (this.pendingTasks.length === 0) {
      return;
    }
    
    // Get available agents
    const availableAgents = agentHandshakeService.getConnectedAgents().filter(
      agent => agent.status === AgentStatus.READY || agent.status === AgentStatus.IDLE
    );
    
    if (availableAgents.length === 0) {
      logger.debug('[TaskQueueManager] No available agents for task distribution');
      return;
    }
    
    // Distribute tasks to available agents
    while (this.pendingTasks.length > 0 && availableAgents.length > 0) {
      const task = this.pendingTasks.shift()!;
      const agent = availableAgents.shift()!;
      
      // Assign task to agent
      const assigned = await agentHandshakeService.assignTask(task);
      
      if (assigned) {
        // Move to active tasks
        this.activeTasks.set(task.taskId, task);
        
        // Set timeout for task
        this.setTaskTimeout(task.taskId);
        
        // Emit assignment event
        this.emit('task:assigned', { task, agentId: assigned });
        
        // Broadcast assignment
        if (this.wsServer) {
          this.wsServer.broadcast('task:assigned', {
            taskId: task.taskId,
            agentId: assigned,
            agentName: agent.agentName
          });
        }
        
        logger.info(`[TaskQueueManager] Task ${task.taskId} assigned to agent ${assigned}`);
      } else {
        // Put task back in queue if assignment failed
        this.pendingTasks.unshift(task);
        break;
      }
    }
  }

  /**
   * Set timeout for a task
   */
  private setTaskTimeout(taskId: string, timeout: number = this.DEFAULT_TASK_TIMEOUT) {
    // Clear existing timeout if any
    this.clearTaskTimeout(taskId);
    
    const timeoutHandle = setTimeout(() => {
      this.handleTaskTimeout(taskId);
    }, timeout);
    
    this.taskTimeouts.set(taskId, timeoutHandle);
  }

  /**
   * Clear timeout for a task
   */
  private clearTaskTimeout(taskId: string) {
    const timeout = this.taskTimeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.taskTimeouts.delete(taskId);
    }
  }

  /**
   * Handle task timeout
   */
  private async handleTaskTimeout(taskId: string) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;
    
    logger.warn(`[TaskQueueManager] Task ${taskId} timed out`);
    
    // Update task status
    task.status = 'failed';
    task.error = 'Task execution timeout';
    
    // Remove from active tasks
    this.activeTasks.delete(taskId);
    
    // Check retry count
    const retryCount = (task.context?.retryCount || 0) + 1;
    
    if (retryCount < this.MAX_RETRIES) {
      // Retry the task
      logger.info(`[TaskQueueManager] Retrying task ${taskId} (attempt ${retryCount + 1})`);
      
      task.context = { ...task.context, retryCount };
      task.status = 'pending';
      
      // Re-add to pending queue
      this.pendingTasks.push(task);
      
      // Emit retry event
      this.emit('task:retry', { taskId, retryCount });
    } else {
      // Max retries reached, mark as failed
      logger.error(`[TaskQueueManager] Task ${taskId} failed after ${this.MAX_RETRIES} retries`);
      
      // Emit failure event
      this.emit('task:failed', {
        taskId,
        error: 'Max retries exceeded',
        retryCount
      });
      
      // Broadcast failure
      if (this.wsServer) {
        this.wsServer.broadcast('task:failed', {
          taskId,
          error: 'Max retries exceeded'
        });
      }
    }
    
    // If agent was working on this task, mark it as ready
    if (task.assignedTo) {
      await agentHandshakeService.updateAgentStatus(task.assignedTo, AgentStatus.READY);
    }
  }

  /**
   * Handle agent registration
   */
  private onAgentRegistered(agent: any) {
    logger.info(`[TaskQueueManager] New agent registered: ${agent.agentId}`);
    
    // Trigger task distribution
    this.distributeTasks();
  }

  /**
   * Handle agent status change
   */
  private onAgentStatusChange(data: { agentId: string; status: AgentStatus }) {
    logger.debug(`[TaskQueueManager] Agent ${data.agentId} status changed to ${data.status}`);
    
    // If agent became available, trigger distribution
    if (data.status === AgentStatus.READY || data.status === AgentStatus.IDLE) {
      this.distributeTasks();
    }
  }

  /**
   * Handle task completion
   */
  private onTaskCompleted(task: Task) {
    logger.info(`[TaskQueueManager] Task ${task.taskId} completed`);
    
    // Clear timeout
    this.clearTaskTimeout(task.taskId);
    
    // Remove from active tasks
    this.activeTasks.delete(task.taskId);
    
    // Calculate execution time
    const executionTime = task.completedAt ? 
      new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime() : 0;
    
    // Store result
    const result: TaskResult = {
      taskId: task.taskId,
      agentId: task.assignedTo || '',
      agentName: task.assignedTo ? 
        agentHandshakeService.getAgent(task.assignedTo)?.agentName || 'Unknown' : 'Unknown',
      result: task.result,
      error: task.error,
      executionTime,
      completedAt: new Date(task.completedAt || new Date())
    };
    
    this.completedTasks.set(task.taskId, result);
    
    // Emit completion event
    this.emit('task:result', result);
    
    // Broadcast result
    if (this.wsServer) {
      this.wsServer.broadcast('task:result', result);
    }
    
    // Save result to file for persistence
    this.saveTaskResult(result);
  }

  /**
   * Save task result to file
   */
  private async saveTaskResult(result: TaskResult) {
    const resultsDir = path.join(this.coordinationDir, 'task_results');
    await fs.mkdir(resultsDir, { recursive: true });
    
    const resultFile = path.join(resultsDir, `${result.taskId}_result.json`);
    await fs.writeFile(resultFile, JSON.stringify(result, null, 2));
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): Task | undefined {
    return this.taskQueue.get(taskId) || 
           this.activeTasks.get(taskId);
  }

  /**
   * Get task result
   */
  getTaskResult(taskId: string): TaskResult | undefined {
    return this.completedTasks.get(taskId);
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return {
      pending: this.pendingTasks.length,
      active: this.activeTasks.size,
      completed: this.completedTasks.size,
      totalProcessed: this.completedTasks.size,
      availableAgents: agentHandshakeService.getConnectedAgents().filter(
        a => a.status === AgentStatus.READY || a.status === AgentStatus.IDLE
      ).length,
      totalAgents: agentHandshakeService.getConnectedAgents().length
    };
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.taskQueue.get(taskId);
    if (!task) return false;
    
    // Remove from pending queue
    const pendingIndex = this.pendingTasks.findIndex(t => t.taskId === taskId);
    if (pendingIndex >= 0) {
      this.pendingTasks.splice(pendingIndex, 1);
    }
    
    // Remove from active tasks
    if (this.activeTasks.has(taskId)) {
      this.activeTasks.delete(taskId);
      
      // Clear timeout
      this.clearTaskTimeout(taskId);
      
      // Update agent status if assigned
      if (task.assignedTo) {
        await agentHandshakeService.updateAgentStatus(task.assignedTo, AgentStatus.READY);
      }
    }
    
    // Update task status
    task.status = 'failed';
    task.error = 'Task cancelled by user';
    
    // Emit cancellation event
    this.emit('task:cancelled', { taskId });
    
    // Broadcast cancellation
    if (this.wsServer) {
      this.wsServer.broadcast('task:cancelled', { taskId });
    }
    
    logger.info(`[TaskQueueManager] Task ${taskId} cancelled`);
    
    return true;
  }

  /**
   * Start distribution loop
   */
  private startDistributionLoop() {
    this.distributionInterval = setInterval(() => {
      this.distributeTasks();
    }, this.DISTRIBUTION_INTERVAL);
  }

  /**
   * Stop distribution loop
   */
  private stopDistributionLoop() {
    if (this.distributionInterval) {
      clearInterval(this.distributionInterval);
      this.distributionInterval = null;
    }
  }

  /**
   * Send prompt to specific farm agents
   */
  async sendPromptToFarm(farmId: string, prompt: string, context?: any): Promise<string[]> {
    // Get all agents for this farm
    const farmAgents = agentHandshakeService.getConnectedAgents().filter(
      agent => agent.farmId === farmId
    );
    
    if (farmAgents.length === 0) {
      throw new Error(`No agents found for farm ${farmId}`);
    }
    
    const taskIds: string[] = [];
    
    // Submit task for each agent
    for (const agent of farmAgents) {
      const taskId = await this.submitTask({
        prompt,
        context: {
          ...context,
          farmId,
          targetAgent: agent.agentId
        },
        priority: 10 // Higher priority for direct farm tasks
      });
      
      taskIds.push(taskId);
    }
    
    logger.info(`[TaskQueueManager] Submitted ${taskIds.length} tasks to farm ${farmId}`);
    
    return taskIds;
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    // Stop distribution loop
    this.stopDistributionLoop();
    
    // Clear all timeouts
    for (const timeout of this.taskTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.taskTimeouts.clear();
    
    // Save pending tasks for recovery
    const pendingFile = path.join(this.coordinationDir, 'pending_tasks.json');
    await fs.writeFile(pendingFile, JSON.stringify(
      Array.from(this.pendingTasks),
      null,
      2
    ));
    
    logger.info('[TaskQueueManager] Cleaned up');
  }
}

// Export singleton instance
export const taskQueueManager = new TaskQueueManager();