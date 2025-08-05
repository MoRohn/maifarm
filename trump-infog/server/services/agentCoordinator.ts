/**
 * Agent Coordinator Service for Trump Infog
 * Manages multi-agent collaboration and task distribution
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
  AgentInfo,
  Task,
  TaskStatus,
  CoordinationEvent,
  Resource,
  Heartbeat,
  CoordinationError,
  DistributedLock,
  TaskClaim,
  TaskProgress,
  SharedState,
  ProjectState,
  AgentStatus,
  EventType,
  ResourceRequest,
  CoordinationConfig
} from '../../src/types/coordination';

export class AgentCoordinator extends EventEmitter {
  private redis: Redis;
  private pubClient: Redis;
  private subClient: Redis;
  private io: SocketServer | null = null;
  private agents: Map<string, AgentInfo> = new Map();
  private locks: Map<string, DistributedLock> = new Map();
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private config: CoordinationConfig;

  constructor(config: CoordinationConfig) {
    super();
    this.config = config;
    
    // Initialize Redis clients
    this.redis = new Redis(config.redis);
    this.pubClient = new Redis(config.redis);
    this.subClient = new Redis(config.redis);
    
    this.initializeSubscriptions();
    this.startHeartbeatMonitor();
  }

  /**
   * Initialize Redis pub/sub subscriptions
   */
  private initializeSubscriptions(): void {
    const channels = [
      'trump-infog:tasks',
      'trump-infog:status',
      'trump-infog:alerts',
      'trump-infog:sync'
    ];

    this.subClient.subscribe(...channels);
    
    this.subClient.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        this.handleChannelMessage(channel, data);
      } catch (error) {
        console.error('Failed to parse channel message:', error);
      }
    });
  }

  /**
   * Set Socket.IO server for real-time communication
   */
  public setSocketServer(io: SocketServer): void {
    this.io = io;
  }

  /**
   * Register a new agent
   */
  public async registerAgent(agentInfo: AgentInfo): Promise<void> {
    // Store agent info
    this.agents.set(agentInfo.agentId, agentInfo);
    
    // Save to Redis
    await this.redis.hset(
      'agents',
      agentInfo.agentId,
      JSON.stringify(agentInfo)
    );
    
    // Broadcast registration event
    await this.broadcastEvent({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId: agentInfo.agentId,
      eventType: 'agent:registered',
      payload: agentInfo
    });
    
    // Start heartbeat monitoring
    this.startHeartbeatTimer(agentInfo.agentId);
    
    this.emit('agent:registered', agentInfo);
  }

  /**
   * Handle agent heartbeat
   */
  public async handleHeartbeat(heartbeat: Heartbeat): Promise<void> {
    const agent = this.agents.get(heartbeat.agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${heartbeat.agentId}`);
    }
    
    // Update agent info
    agent.lastHeartbeat = heartbeat.timestamp;
    agent.status = heartbeat.status === 'healthy' ? 'ready' : 'error';
    
    // Reset heartbeat timer
    this.resetHeartbeatTimer(heartbeat.agentId);
    
    // Store metrics
    await this.redis.hset(
      `agent:metrics:${heartbeat.agentId}`,
      'latest',
      JSON.stringify(heartbeat.metrics)
    );
    
    this.emit('agent:heartbeat', heartbeat);
  }

  /**
   * Create a new task
   */
  public async createTask(task: Omit<Task, 'id' | 'createdAt' | 'status'>): Promise<Task> {
    const newTask: Task = {
      ...task,
      id: `task_${uuidv4()}`,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    
    // Store task
    await this.redis.hset('tasks', newTask.id, JSON.stringify(newTask));
    
    // Add to task queue
    await this.redis.lpush('task:queue', newTask.id);
    
    // Broadcast task creation
    await this.broadcastEvent({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId: task.createdBy,
      eventType: 'task:created',
      payload: newTask
    });
    
    return newTask;
  }

  /**
   * Get available tasks for an agent
   */
  public async getAvailableTasks(agentId: string): Promise<Task[]> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }
    
    // Get all pending tasks
    const taskIds = await this.redis.lrange('task:queue', 0, -1);
    const tasks: Task[] = [];
    
    for (const taskId of taskIds) {
      const taskData = await this.redis.hget('tasks', taskId);
      if (taskData) {
        const task = JSON.parse(taskData) as Task;
        
        // Check if agent has required capabilities
        if (this.canAgentHandleTask(agent, task)) {
          tasks.push(task);
        }
      }
    }
    
    return tasks;
  }

  /**
   * Claim a task for an agent
   */
  public async claimTask(claim: TaskClaim): Promise<Task> {
    // Use distributed lock to prevent race conditions
    const lockKey = `task:claim:${claim.taskId}`;
    const lock = await this.acquireLock(lockKey, 5000);
    
    if (!lock) {
      throw new Error('Failed to acquire task claim lock');
    }
    
    try {
      // Get task
      const taskData = await this.redis.hget('tasks', claim.taskId);
      if (!taskData) {
        throw new Error(`Task not found: ${claim.taskId}`);
      }
      
      const task = JSON.parse(taskData) as Task;
      
      // Check if task is still available
      if (task.status !== 'pending') {
        throw new Error(`Task already claimed: ${claim.taskId}`);
      }
      
      // Update task
      task.assignedTo = claim.agentId;
      task.status = 'claimed';
      task.claimedAt = new Date().toISOString();
      
      // Save updated task
      await this.redis.hset('tasks', task.id, JSON.stringify(task));
      
      // Remove from queue
      await this.redis.lrem('task:queue', 1, task.id);
      
      // Add to agent's tasks
      await this.redis.sadd(`agent:tasks:${claim.agentId}`, task.id);
      
      // Broadcast claim event
      await this.broadcastEvent({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        agentId: claim.agentId,
        eventType: 'task:claimed',
        payload: { task, claim }
      });
      
      return task;
    } finally {
      await this.releaseLock(lockKey, lock.token);
    }
  }

  /**
   * Update task progress
   */
  public async updateTaskProgress(progress: TaskProgress): Promise<void> {
    const taskData = await this.redis.hget('tasks', progress.taskId);
    if (!taskData) {
      throw new Error(`Task not found: ${progress.taskId}`);
    }
    
    const task = JSON.parse(taskData) as Task;
    
    // Verify ownership
    if (task.assignedTo !== progress.agentId) {
      throw new Error('Agent does not own this task');
    }
    
    // Update task
    task.progress = progress.progress;
    if (task.status === 'claimed') {
      task.status = 'in_progress';
      task.startedAt = new Date().toISOString();
    }
    
    // Save updated task
    await this.redis.hset('tasks', task.id, JSON.stringify(task));
    
    // Store progress history
    await this.redis.lpush(
      `task:progress:${task.id}`,
      JSON.stringify({
        ...progress,
        timestamp: new Date().toISOString()
      })
    );
    
    // Broadcast progress event
    await this.broadcastEvent({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId: progress.agentId,
      eventType: 'task:progress',
      payload: progress
    });
  }

  /**
   * Complete a task
   */
  public async completeTask(
    taskId: string,
    agentId: string,
    outputs?: Task['outputs']
  ): Promise<void> {
    const taskData = await this.redis.hget('tasks', taskId);
    if (!taskData) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    const task = JSON.parse(taskData) as Task;
    
    // Verify ownership
    if (task.assignedTo !== agentId) {
      throw new Error('Agent does not own this task');
    }
    
    // Update task
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.outputs = outputs;
    
    // Calculate actual time
    if (task.startedAt) {
      const duration = Date.now() - new Date(task.startedAt).getTime();
      task.actualTime = `${Math.round(duration / 1000 / 60)}m`;
    }
    
    // Save updated task
    await this.redis.hset('tasks', task.id, JSON.stringify(task));
    
    // Remove from agent's tasks
    await this.redis.srem(`agent:tasks:${agentId}`, taskId);
    
    // Add to completed tasks
    await this.redis.sadd('tasks:completed', taskId);
    
    // Broadcast completion event
    await this.broadcastEvent({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId,
      eventType: 'task:completed',
      payload: { task }
    });
    
    // Check and update dependencies
    await this.updateDependencies(taskId);
  }

  /**
   * Request a resource
   */
  public async requestResource(request: ResourceRequest): Promise<Resource> {
    const lockKey = `resource:${request.resourceId}`;
    const ttl = request.duration || 60000; // Default 1 minute
    
    const lock = await this.acquireLock(lockKey, ttl);
    if (!lock) {
      throw new Error(`Resource unavailable: ${request.resourceId}`);
    }
    
    const resource: Resource = {
      id: request.resourceId,
      type: 'service', // Would be determined by resource ID
      name: request.resourceId,
      locked: true,
      lockedBy: request.agentId,
      lockedAt: new Date().toISOString()
    };
    
    // Store resource state
    await this.redis.hset('resources', resource.id, JSON.stringify(resource));
    
    // Broadcast resource grant
    await this.broadcastEvent({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId: request.agentId,
      eventType: 'resource:granted',
      payload: { request, resource }
    });
    
    return resource;
  }

  /**
   * Get current project state
   */
  public async getProjectState(): Promise<ProjectState> {
    // Gather all state information
    const agents: Record<string, AgentInfo> = {};
    const tasks: Record<string, Task> = {};
    const resources: Record<string, Resource> = {};
    
    // Get agents
    for (const [id, agent] of this.agents) {
      agents[id] = agent;
    }
    
    // Get tasks
    const taskEntries = await this.redis.hgetall('tasks');
    for (const [id, data] of Object.entries(taskEntries)) {
      tasks[id] = JSON.parse(data);
    }
    
    // Get resources
    const resourceEntries = await this.redis.hgetall('resources');
    for (const [id, data] of Object.entries(resourceEntries)) {
      resources[id] = JSON.parse(data);
    }
    
    // Calculate metrics
    const taskStatuses = Object.values(tasks).map(t => t.status);
    const metrics = {
      totalTasks: taskStatuses.length,
      completedTasks: taskStatuses.filter(s => s === 'completed').length,
      inProgressTasks: taskStatuses.filter(s => s === 'in_progress').length,
      blockedTasks: taskStatuses.filter(s => s === 'blocked').length,
      averageTaskTime: await this.calculateAverageTaskTime(tasks),
      agentUtilization: await this.calculateAgentUtilization(),
      lastUpdated: new Date().toISOString()
    };
    
    return {
      phase: 'development', // Would be determined by project progress
      agents,
      tasks,
      resources,
      dependencies: [], // Would be loaded from storage
      metrics
    };
  }

  /**
   * Acquire distributed lock
   */
  private async acquireLock(
    resource: string,
    ttl: number
  ): Promise<DistributedLock | null> {
    const token = crypto.randomBytes(16).toString('hex');
    const key = `lock:${resource}`;
    
    const acquired = await this.redis.set(
      key,
      token,
      'PX',
      ttl,
      'NX'
    );
    
    if (acquired === 'OK') {
      const lock: DistributedLock = {
        resource,
        token,
        agentId: 'coordinator',
        acquiredAt: new Date().toISOString(),
        ttl
      };
      
      this.locks.set(resource, lock);
      return lock;
    }
    
    return null;
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(resource: string, token: string): Promise<void> {
    const key = `lock:${resource}`;
    
    // Lua script for atomic release
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    await this.redis.eval(script, 1, key, token);
    this.locks.delete(resource);
  }

  /**
   * Broadcast coordination event
   */
  private async broadcastEvent(event: CoordinationEvent): Promise<void> {
    // Publish to Redis
    await this.pubClient.publish(
      'trump-infog:events',
      JSON.stringify(event)
    );
    
    // Emit via Socket.IO if available
    if (this.io) {
      this.io.emit('coordination:event', event);
    }
    
    // Store event history
    await this.redis.lpush(
      'events:history',
      JSON.stringify(event)
    );
    
    // Trim history to last 1000 events
    await this.redis.ltrim('events:history', 0, 999);
  }

  /**
   * Check if agent can handle task
   */
  private canAgentHandleTask(agent: AgentInfo, task: Task): boolean {
    // Map task types to required capabilities
    const requiredCapabilities: Record<string, string[]> = {
      feature: ['api-development', 'frontend-development'],
      bug: ['testing', 'api-development', 'frontend-development'],
      test: ['testing'],
      docs: ['documentation'],
      infrastructure: ['deployment', 'monitoring']
    };
    
    const required = requiredCapabilities[task.type] || [];
    return required.some(cap => agent.capabilities.includes(cap));
  }

  /**
   * Handle channel messages
   */
  private handleChannelMessage(channel: string, data: any): void {
    this.emit('channel:message', { channel, data });
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitor(): void {
    setInterval(() => {
      const now = Date.now();
      
      for (const [agentId, agent] of this.agents) {
        const lastHeartbeat = new Date(agent.lastHeartbeat).getTime();
        const elapsed = now - lastHeartbeat;
        
        if (elapsed > this.config.heartbeat.timeout) {
          this.handleAgentTimeout(agentId);
        }
      }
    }, this.config.heartbeat.interval);
  }

  /**
   * Start heartbeat timer for agent
   */
  private startHeartbeatTimer(agentId: string): void {
    const timer = setTimeout(() => {
      this.handleAgentTimeout(agentId);
    }, this.config.heartbeat.timeout);
    
    this.heartbeatTimers.set(agentId, timer);
  }

  /**
   * Reset heartbeat timer
   */
  private resetHeartbeatTimer(agentId: string): void {
    const timer = this.heartbeatTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
    }
    this.startHeartbeatTimer(agentId);
  }

  /**
   * Handle agent timeout
   */
  private async handleAgentTimeout(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    agent.status = 'offline';
    
    // Reassign agent's tasks
    const taskIds = await this.redis.smembers(`agent:tasks:${agentId}`);
    for (const taskId of taskIds) {
      await this.reassignTask(taskId);
    }
    
    // Broadcast offline event
    await this.broadcastEvent({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      agentId,
      eventType: 'agent:offline',
      payload: { agentId }
    });
  }

  /**
   * Reassign task to another agent
   */
  private async reassignTask(taskId: string): Promise<void> {
    const taskData = await this.redis.hget('tasks', taskId);
    if (!taskData) return;
    
    const task = JSON.parse(taskData) as Task;
    
    // Reset task to pending
    task.status = 'pending';
    task.assignedTo = undefined;
    task.progress = 0;
    
    // Save updated task
    await this.redis.hset('tasks', task.id, JSON.stringify(task));
    
    // Add back to queue
    await this.redis.lpush('task:queue', task.id);
  }

  /**
   * Update task dependencies
   */
  private async updateDependencies(completedTaskId: string): Promise<void> {
    // Get all tasks
    const taskEntries = await this.redis.hgetall('tasks');
    
    for (const [id, data] of Object.entries(taskEntries)) {
      const task = JSON.parse(data) as Task;
      
      // Check if this task depends on the completed task
      if (task.dependencies.includes(completedTaskId)) {
        // Remove completed dependency
        task.dependencies = task.dependencies.filter(d => d !== completedTaskId);
        
        // If no more dependencies and task is blocked, make it available
        if (task.dependencies.length === 0 && task.status === 'blocked') {
          task.status = 'pending';
          await this.redis.lpush('task:queue', task.id);
        }
        
        // Save updated task
        await this.redis.hset('tasks', task.id, JSON.stringify(task));
      }
    }
  }

  /**
   * Calculate average task completion time
   */
  private async calculateAverageTaskTime(
    tasks: Record<string, Task>
  ): Promise<number> {
    const completedTasks = Object.values(tasks).filter(
      t => t.status === 'completed' && t.startedAt && t.completedAt
    );
    
    if (completedTasks.length === 0) return 0;
    
    const totalTime = completedTasks.reduce((sum, task) => {
      const duration = new Date(task.completedAt!).getTime() - 
                      new Date(task.startedAt!).getTime();
      return sum + duration;
    }, 0);
    
    return Math.round(totalTime / completedTasks.length / 1000 / 60); // Minutes
  }

  /**
   * Calculate agent utilization
   */
  private async calculateAgentUtilization(): Promise<Record<string, number>> {
    const utilization: Record<string, number> = {};
    
    for (const [agentId, agent] of this.agents) {
      const taskCount = await this.redis.scard(`agent:tasks:${agentId}`);
      utilization[agentId] = Math.min(
        (taskCount / this.config.task.maxConcurrent) * 100,
        100
      );
    }
    
    return utilization;
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    // Clear timers
    for (const timer of this.heartbeatTimers.values()) {
      clearTimeout(timer);
    }
    
    // Close Redis connections
    await this.redis.quit();
    await this.pubClient.quit();
    await this.subClient.quit();
    
    this.removeAllListeners();
  }
}

// Export singleton instance
export default new AgentCoordinator({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0')
  },
  websocket: {
    url: process.env.WS_URL || 'ws://localhost:4567',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  },
  heartbeat: {
    interval: 10000, // 10 seconds
    timeout: 30000   // 30 seconds
  },
  task: {
    maxConcurrent: 5,
    claimTimeout: 300000,  // 5 minutes
    progressInterval: 60000 // 1 minute
  },
  lock: {
    defaultTTL: 60000,  // 1 minute
    retryInterval: 100,
    maxRetries: 50
  }
});