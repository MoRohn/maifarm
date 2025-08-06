/**
 * Shared State Manager for Trump Infog Pipeline
 * Manages shared state across all agents in the infographic generation pipeline
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { 
  SharedState,
  ProjectState,
  AgentInfo,
  Task,
  Resource,
  ProjectPhase,
  ProjectMetrics
} from '../../src/types/coordination';

export interface SharedStateConfig {
  stateFilePath: string;
  redisConfig?: {
    host: string;
    port: number;
    password?: string;
  };
  syncInterval?: number;
}

export class SharedStateManager extends EventEmitter {
  private state: SharedState;
  private config: SharedStateConfig;
  private redis: Redis | null = null;
  private syncTimer: NodeJS.Timer | null = null;
  private saveDebounceTimer: NodeJS.Timer | null = null;
  private readonly lockKey = 'trump-infog:state:lock';
  private readonly stateKey = 'trump-infog:state:current';

  constructor(config: SharedStateConfig) {
    super();
    this.config = config;
    
    // Initialize default state
    this.state = this.createDefaultState();
    
    // Setup Redis if config provided
    if (config.redisConfig) {
      this.redis = new Redis(config.redisConfig);
      this.setupRedisListeners();
    }
    
    // Start sync timer
    this.startSyncTimer();
    
    // Load initial state
    this.loadState().catch(err => {
      console.error('[SharedStateManager] Failed to load initial state:', err);
    });
  }

  private createDefaultState(): SharedState {
    return {
      projectId: `trump-infog-${Date.now()}`,
      version: 1,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: 'system',
      state: {
        phase: 'setup',
        agents: {},
        tasks: {},
        resources: {},
        dependencies: [],
        metrics: {
          totalTasks: 0,
          completedTasks: 0,
          inProgressTasks: 0,
          blockedTasks: 0,
          averageTaskTime: 0,
          agentUtilization: {},
          lastUpdated: new Date().toISOString()
        }
      }
    };
  }

  private setupRedisListeners(): void {
    if (!this.redis) return;
    
    // Subscribe to state change events
    const subscriber = new Redis(this.config.redisConfig!);
    subscriber.subscribe('trump-infog:state:changed');
    
    subscriber.on('message', async (channel, message) => {
      if (channel === 'trump-infog:state:changed') {
        try {
          const update = JSON.parse(message);
          if (update.version > this.state.version) {
            await this.loadStateFromRedis();
            this.emit('state:external_update', update);
          }
        } catch (error) {
          console.error('[SharedStateManager] Failed to process state change:', error);
        }
      }
    });
  }

  private startSyncTimer(): void {
    const interval = this.config.syncInterval || 5000; // 5 seconds default
    
    this.syncTimer = setInterval(async () => {
      await this.syncState();
    }, interval);
  }

  private async syncState(): Promise<void> {
    try {
      // Try to load from Redis first
      if (this.redis) {
        const redisState = await this.loadStateFromRedis();
        if (redisState && redisState.version > this.state.version) {
          this.state = redisState;
          await this.saveStateToFile();
          return;
        }
      }
      
      // Otherwise load from file
      const fileState = await this.loadStateFromFile();
      if (fileState && fileState.version > this.state.version) {
        this.state = fileState;
        if (this.redis) {
          await this.saveStateToRedis();
        }
      }
    } catch (error) {
      console.error('[SharedStateManager] Sync failed:', error);
    }
  }

  private async loadState(): Promise<void> {
    // Try Redis first
    if (this.redis) {
      const redisState = await this.loadStateFromRedis();
      if (redisState) {
        this.state = redisState;
        return;
      }
    }
    
    // Fall back to file
    const fileState = await this.loadStateFromFile();
    if (fileState) {
      this.state = fileState;
      // Sync to Redis if available
      if (this.redis) {
        await this.saveStateToRedis();
      }
    }
  }

  private async loadStateFromFile(): Promise<SharedState | null> {
    try {
      const data = await fs.readFile(this.config.stateFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // File doesn't exist yet
        return null;
      }
      throw error;
    }
  }

  private async loadStateFromRedis(): Promise<SharedState | null> {
    if (!this.redis) return null;
    
    try {
      const data = await this.redis.get(this.stateKey);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[SharedStateManager] Failed to load from Redis:', error);
    }
    
    return null;
  }

  private async saveState(): Promise<void> {
    // Increment version
    this.state.version++;
    this.state.lastUpdated = new Date().toISOString();
    
    // Debounce saves
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    this.saveDebounceTimer = setTimeout(async () => {
      await Promise.all([
        this.saveStateToFile(),
        this.redis ? this.saveStateToRedis() : Promise.resolve()
      ]);
      
      // Notify other agents of state change
      if (this.redis) {
        await this.redis.publish('trump-infog:state:changed', JSON.stringify({
          version: this.state.version,
          updatedBy: this.state.lastUpdatedBy,
          timestamp: this.state.lastUpdated
        }));
      }
    }, 500);
  }

  private async saveStateToFile(): Promise<void> {
    const dir = path.dirname(this.config.stateFilePath);
    await fs.mkdir(dir, { recursive: true });
    
    const tempFile = `${this.config.stateFilePath}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(this.state, null, 2));
    await fs.rename(tempFile, this.config.stateFilePath);
  }

  private async saveStateToRedis(): Promise<void> {
    if (!this.redis) return;
    
    // Use optimistic locking
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
      const lock = await this.acquireLock();
      if (lock) {
        try {
          await this.redis.set(this.stateKey, JSON.stringify(this.state));
          await this.releaseLock(lock);
          return;
        } catch (error) {
          await this.releaseLock(lock);
          throw error;
        }
      }
      
      retries++;
      await new Promise(resolve => setTimeout(resolve, 100 * retries));
    }
    
    throw new Error('Failed to acquire lock for state save');
  }

  private async acquireLock(): Promise<string | null> {
    if (!this.redis) return 'file-only';
    
    const token = `${process.pid}-${Date.now()}`;
    const acquired = await this.redis.set(
      this.lockKey,
      token,
      'PX', 5000, // 5 second TTL
      'NX'
    );
    
    return acquired === 'OK' ? token : null;
  }

  private async releaseLock(token: string): Promise<void> {
    if (!this.redis || token === 'file-only') return;
    
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    await this.redis.eval(script, 1, this.lockKey, token);
  }

  // Public API methods
  public async updateAgent(agentId: string, update: Partial<AgentInfo>): Promise<void> {
    if (!this.state.state.agents[agentId]) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    Object.assign(this.state.state.agents[agentId], update);
    this.state.lastUpdatedBy = agentId;
    
    await this.saveState();
    this.emit('agent:updated', { agentId, update });
  }

  public async registerAgent(agent: AgentInfo): Promise<void> {
    this.state.state.agents[agent.agentId] = agent;
    this.state.lastUpdatedBy = agent.agentId;
    
    await this.saveState();
    this.emit('agent:registered', agent);
  }

  public async updateTask(taskId: string, update: Partial<Task>): Promise<void> {
    if (!this.state.state.tasks[taskId]) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    Object.assign(this.state.state.tasks[taskId], update);
    
    // Update metrics
    this.updateMetrics();
    
    await this.saveState();
    this.emit('task:updated', { taskId, update });
  }

  public async addTask(task: Task): Promise<void> {
    this.state.state.tasks[task.id] = task;
    this.state.lastUpdatedBy = task.createdBy;
    
    // Update metrics
    this.updateMetrics();
    
    await this.saveState();
    this.emit('task:added', task);
  }

  public async updatePhase(phase: ProjectPhase): Promise<void> {
    this.state.state.phase = phase;
    
    await this.saveState();
    this.emit('phase:changed', phase);
  }

  public async lockResource(resourceId: string, agentId: string): Promise<boolean> {
    const resource = this.state.state.resources[resourceId];
    if (!resource || resource.locked) {
      return false;
    }
    
    resource.locked = true;
    resource.lockedBy = agentId;
    resource.lockedAt = new Date().toISOString();
    
    await this.saveState();
    this.emit('resource:locked', { resourceId, agentId });
    
    return true;
  }

  public async unlockResource(resourceId: string, agentId: string): Promise<boolean> {
    const resource = this.state.state.resources[resourceId];
    if (!resource || !resource.locked || resource.lockedBy !== agentId) {
      return false;
    }
    
    resource.locked = false;
    resource.lockedBy = undefined;
    resource.lockedAt = undefined;
    
    await this.saveState();
    this.emit('resource:unlocked', { resourceId, agentId });
    
    return true;
  }

  private updateMetrics(): void {
    const tasks = Object.values(this.state.state.tasks);
    const metrics = this.state.state.metrics;
    
    metrics.totalTasks = tasks.length;
    metrics.completedTasks = tasks.filter(t => t.status === 'completed').length;
    metrics.inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
    metrics.blockedTasks = tasks.filter(t => t.status === 'blocked').length;
    
    // Calculate average task time
    const completedWithTime = tasks.filter(
      t => t.status === 'completed' && t.startedAt && t.completedAt
    );
    
    if (completedWithTime.length > 0) {
      const totalTime = completedWithTime.reduce((sum, task) => {
        const duration = new Date(task.completedAt!).getTime() - 
                        new Date(task.startedAt!).getTime();
        return sum + duration;
      }, 0);
      
      metrics.averageTaskTime = Math.round(totalTime / completedWithTime.length / 1000 / 60); // Minutes
    }
    
    // Calculate agent utilization
    for (const [agentId, agent] of Object.entries(this.state.state.agents)) {
      const agentTasks = tasks.filter(t => t.assignedTo === agentId);
      const activeTasks = agentTasks.filter(t => 
        t.status === 'in_progress' || t.status === 'claimed'
      );
      
      metrics.agentUtilization[agentId] = Math.min(
        (activeTasks.length / 3) * 100, // Assume max 3 concurrent tasks
        100
      );
    }
    
    metrics.lastUpdated = new Date().toISOString();
  }

  // Getters
  public getState(): SharedState {
    return JSON.parse(JSON.stringify(this.state));
  }

  public getProjectState(): ProjectState {
    return JSON.parse(JSON.stringify(this.state.state));
  }

  public getAgent(agentId: string): AgentInfo | undefined {
    return this.state.state.agents[agentId];
  }

  public getTask(taskId: string): Task | undefined {
    return this.state.state.tasks[taskId];
  }

  public getResource(resourceId: string): Resource | undefined {
    return this.state.state.resources[resourceId];
  }

  public getCurrentPhase(): ProjectPhase {
    return this.state.state.phase;
  }

  public getMetrics(): ProjectMetrics {
    return { ...this.state.state.metrics };
  }

  // Pipeline-specific helpers
  public isPipelineStageComplete(stage: string): boolean {
    const stageTasks = Object.values(this.state.state.tasks)
      .filter(t => t.metadata?.stage === stage);
    
    return stageTasks.length > 0 && 
           stageTasks.every(t => t.status === 'completed');
  }

  public getCompletedStages(): string[] {
    const stages = ['data_collection', 'content_analysis', 'design_generation', 'output_assembly'];
    return stages.filter(stage => this.isPipelineStageComplete(stage));
  }

  public async markStageComplete(stage: string, agentId: string): Promise<void> {
    // Update all tasks for this stage
    const stageTasks = Object.entries(this.state.state.tasks)
      .filter(([_, task]) => task.metadata?.stage === stage);
    
    for (const [taskId, task] of stageTasks) {
      if (task.status !== 'completed') {
        await this.updateTask(taskId, {
          status: 'completed',
          completedAt: new Date().toISOString()
        });
      }
    }
    
    this.emit('stage:completed', { stage, agentId });
  }

  // Cleanup
  public async shutdown(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    // Final save
    await this.saveState();
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    this.removeAllListeners();
  }
}

// Create singleton instance
export const sharedStateManager = new SharedStateManager({
  stateFilePath: process.env.SHARED_STATE_PATH || '/tmp/claude_coordination/trump_infog/shared_state.json',
  redisConfig: process.env.REDIS_HOST ? {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  } : undefined,
  syncInterval: 5000
});