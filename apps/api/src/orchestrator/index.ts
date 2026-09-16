import { taskQueue } from './taskQueue';
import { taskScheduler } from './scheduler';
import { taskExecutor } from './executor';
import { db } from '../database/connection';
import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';

export class Orchestrator extends EventEmitter {
  private isRunning = false;
  private executorInterval: NodeJS.Timeout | null = null;
  private quickTaskFarms = new Map<string, any>();
  private inMemoryTaskQueue: any[] = [];

  /**
   * Check if a table exists in the database
   */
  private async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const result = await db.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [tableName]
      );
      return result.rows[0]?.exists || false;
    } catch (error) {
      // If we can't check, assume it doesn't exist
      return false;
    }
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.info(LogCategory.ORCHESTRATOR, 'Orchestrator is already running');
      return;
    }

    logger.info(LogCategory.ORCHESTRATOR, 'Starting orchestrator...');
    
    try {
      // Start task queue processing
      taskQueue.startProcessing();
      
      // Start task scheduler
      taskScheduler.start();
      
      // Start executor loop
      this.startExecutorLoop();
      
      // Set up event listeners
      this.setupEventListeners();
      
      this.isRunning = true;
      this.emit('orchestrator:started');

      logger.info(LogCategory.ORCHESTRATOR, 'Orchestrator started successfully');
    } catch (error) {
      logger.error(LogCategory.ORCHESTRATOR, 'Failed to start orchestrator:', error);
      throw error;
    }
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.info(LogCategory.ORCHESTRATOR, 'Orchestrator is not running');
      return;
    }

    logger.info(LogCategory.ORCHESTRATOR, 'Stopping orchestrator...');
    
    try {
      // Stop task scheduler
      taskScheduler.stop();
      
      // Stop task queue processing
      taskQueue.stopProcessing();
      
      // Stop executor loop
      if (this.executorInterval) {
        clearInterval(this.executorInterval);
        this.executorInterval = null;
      }
      
      this.isRunning = false;
      this.emit('orchestrator:stopped');

      logger.info(LogCategory.ORCHESTRATOR, 'Orchestrator stopped successfully');
    } catch (error) {
      logger.error(LogCategory.ORCHESTRATOR, 'Failed to stop orchestrator:', error);
      throw error;
    }
  }

  /**
   * Get orchestrator status
   */
  async getStatus(): Promise<{
    running: boolean;
    queueStats: any;
    activeExecutions: number;
  }> {
    const queueStats = await taskQueue.getStats();
    
    return {
      running: this.isRunning,
      queueStats,
      activeExecutions: 0 // TODO: Track active executions
    };
  }

  /**
   * Start the executor loop
   */
  private startExecutorLoop(): void {
    // Check for assigned tasks and execute them
    this.executorInterval = setInterval(async () => {
      try {
        await this.executeAssignedTasks();
      } catch (error) {
        logger.error(LogCategory.ORCHESTRATOR, 'Error in executor loop:', error);
        this.emit('error', error);
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * Execute assigned tasks and process quick tasks
   */
  private async executeAssignedTasks(): Promise<void> {
    try {
      // Check if tasks table exists first
      const tableExists = await this.checkTableExists('tasks');
      if (!tableExists) {
        // Table doesn't exist yet, skip this cycle
        return;
      }

      // First, process queued Quick Tasks (they don't need agent assignment)
      const quickTaskResult = await db.query(
        `SELECT * FROM tasks
         WHERE status = 'queued' AND type = 'quick-task'
         ORDER BY priority DESC, created_at ASC
         LIMIT 3`
      );

      for (const row of quickTaskResult.rows) {
        const quickTask = {
          id: row.id,
          farmId: row.farm_id,
          type: row.type,
          priority: row.priority,
          status: row.status,
          payload: row.payload,
          dependencies: row.dependencies || [],
          retries: row.retries,
          maxRetries: row.max_retries,
          timeout: row.timeout,
          metadata: row.metadata || {},
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };

        logger.info(LogCategory.ORCHESTRATOR, `Processing Quick Task: ${quickTask.id}`);

        // Process the quick task immediately (don't await to allow parallel processing)
        this.processQuickTask(quickTask).catch(error => {
          logger.error(LogCategory.ORCHESTRATOR, `Failed to process quick task ${quickTask.id}:`, error);
        });
      }

      // Check if agents table exists too
      const agentsTableExists = await this.checkTableExists('agents');
      if (!agentsTableExists) {
        // Agents table doesn't exist yet, skip regular tasks
        return;
      }

      // Then get assigned tasks (regular tasks)
      const result = await db.query(
        `SELECT t.*, a.* 
         FROM tasks t
         JOIN agents a ON t.agent_id = a.id
         WHERE t.status = 'assigned'
         ORDER BY t.priority DESC, t.created_at ASC
         LIMIT 5`
      );

    for (const row of result.rows) {
      const task = {
        id: row.id,
        farmId: row.farm_id,
        agentId: row.agent_id,
        type: row.type,
        priority: row.priority,
        status: row.status,
        payload: row.payload,
        dependencies: row.dependencies || [],
        retries: row.retries,
        maxRetries: row.max_retries,
        timeout: row.timeout,
        metadata: row.metadata || {},
        createdAt: row.created_at,
        assignedAt: row.assigned_at,
        updatedAt: row.updated_at
      };

      const agent = {
        id: row.agent_id,
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

      // Execute task asynchronously
      this.executeTask(task, agent).catch(error => {
        logger.error(LogCategory.ORCHESTRATOR, `Error executing task ${task.id}:`, error);
        this.handleTaskError(task, error);
      });
    }
    } catch (error) {
      // Database not available - skip task execution
      if (error.code === 'ECONNREFUSED') {
        // Silently skip when database is not available
        return;
      }
      throw error;
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: any, agent: any): Promise<void> {
    try {
      this.emit('task:executing', { task, agent });
      
      const result = await taskExecutor.execute(task, agent);
      
      this.emit('task:completed', { task, agent, result });
    } catch (error) {
      this.emit('task:failed', { task, agent, error });
      throw error;
    }
  }

  /**
   * Handle task execution error
   */
  private async handleTaskError(task: any, error: any): Promise<void> {
    try {
      // Check if task should be retried
      if (task.retries < task.maxRetries) {
        // Update retry count and re-queue
        await db.query(
          'UPDATE tasks SET retries = retries + 1, status = $1, updated_at = $2 WHERE id = $3',
          ['queued', new Date(), task.id]
        );
      
      await taskQueue.enqueue({
        ...task,
        retries: task.retries + 1,
        status: 'queued'
      });
      
      this.emit('task:retrying', { task, attempt: task.retries + 1 });
    } else {
      // Max retries exceeded, mark as failed
      await taskQueue.markFailed(task.id, error);
      this.emit('task:max_retries', { task, error });
    }
    } catch (dbError) {
      // Database not available - just emit the event
      if (dbError.code === 'ECONNREFUSED') {
        this.emit('task:failed', { task, error });
        return;
      }
      throw dbError;
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Task queue events
    taskQueue.on('task:enqueued', (task) => {
      this.emit('queue:task_added', task);
    });

    taskQueue.on('task:dequeued', (task) => {
      this.emit('queue:task_removed', task);
    });

    taskQueue.on('task:failed', ({ taskId, error }) => {
      this.emit('queue:task_failed', { taskId, error });
    });

    // Scheduler events
    taskScheduler.on('task:assigned', ({ task, agent }) => {
      this.emit('scheduler:task_assigned', { task, agent });
    });

    taskScheduler.on('error', (error) => {
      this.emit('scheduler:error', error);
    });

    // Executor events
    taskExecutor.on('task:progress', (progress) => {
      this.emit('executor:progress', progress);
    });
  }

  /**
   * Submit a new task
   */
  async submitTask(taskData: {
    farmId: string;
    type: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    payload: any;
    dependencies?: string[];
    metadata?: any;
  }): Promise<string> {
    const taskId = require('uuid').v4();
    
    try {
      // Insert task into database
      await db.query(
        `INSERT INTO tasks (id, farm_id, type, priority, status, payload, dependencies, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          taskId,
          taskData.farmId,
          taskData.type,
          taskData.priority || 'medium',
          'queued',
          taskData.payload,
          taskData.dependencies || [],
          taskData.metadata || {}
        ]
      );
    } catch (error) {
      // Database not available - continue without persistence
      if (error.code !== 'ECONNREFUSED') {
        throw error;
      }
      logger.warn(LogCategory.ORCHESTRATOR, 'Task submitted without database persistence');
    }

    // Add to queue
    await taskQueue.enqueue({
      id: taskId,
      farmId: taskData.farmId,
      type: taskData.type,
      priority: taskData.priority || 'medium',
      status: 'queued',
      payload: taskData.payload,
      dependencies: taskData.dependencies || [],
      retries: 0,
      maxRetries: 3,
      timeout: 300000,
      metadata: taskData.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date()
    } as any);

    return taskId;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    try {
      // Cancel execution if running
      await taskExecutor.cancel(taskId);
      
      // Update database if available
      try {
        await db.query(
          'UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3 AND status NOT IN ($4, $5)',
          ['cancelled', new Date(), taskId, 'completed', 'failed']
        );
      } catch (dbError) {
        if (dbError.code !== 'ECONNREFUSED') {
          throw dbError;
        }
      }
      
      return true;
    } catch (error) {
      logger.error(LogCategory.ORCHESTRATOR, 'Error cancelling task:', error);
      return false;
    }
  }

  /**
   * Register a quick task farm in memory
   */
  registerQuickTaskFarm(farm: any): void {
    this.quickTaskFarms.set(farm.id, farm);
    this.emit('farm:registered', farm);
  }

  /**
   * Unregister a quick task farm
   */
  unregisterQuickTaskFarm(farmId: string): void {
    this.quickTaskFarms.delete(farmId);
    this.emit('farm:unregistered', farmId);
  }

  /**
   * Process a quick task immediately
   */
  async processQuickTask(task: any): Promise<void> {
    try {
      // Import the quick task executor
      const { quickTaskExecutor } = await import('../services/unified/quickTaskService');
      const { quickTaskService } = await import('../services/unified/quickTaskService');
      
      // Create execution config
      const executionConfig = {
        taskId: task.id,
        farmId: task.farmId,
        title: task.payload?.title || 'Quick Task',
        description: task.payload?.description || 'Quick task execution',
        timeout: task.timeout || 300000, // Default 5 minutes
        metadata: task.metadata || {}
      };
      
      // Update task status to processing
      try {
        await db.query(
          `UPDATE tasks SET status = 'processing', started_at = $1 WHERE id = $2`,
          [new Date(), task.id]
        );
      } catch (error) {
        // Fallback if DB not available
        logger.warn(LogCategory.ORCHESTRATOR, `Database update failed for task: ${task.id}`);
      }
      
      // Update farm status to running
      try {
        await db.query(
          `UPDATE farms SET status = 'running', updated_at = $1 WHERE id = $2`,
          [new Date(), task.farmId]
        );
        logger.info(LogCategory.ORCHESTRATOR, `Farm ${task.farmId} status updated to 'running'`);
      } catch (error) {
        logger.warn(LogCategory.ORCHESTRATOR, 'Failed to update farm status to running:', error);
      }
      
      this.emit('quicktask:processing', { task });
      
      // Execute the task with the new executor
      const result = await quickTaskExecutor.executeTask(executionConfig);
      
      if (result.success) {
        // Task has been launched successfully and is running in the background
        // Don't call completeTask here - it will be called when the task actually completes
        // via the monitoring system or timeout handler
        logger.info(LogCategory.ORCHESTRATOR, `Quick task ${task.id} launched successfully`);
        
        this.emit('quicktask:launched', { task, result });
      } else {
        // Task failed to launch - ensure error is a string
        const errorMessage = typeof result.error === 'string' 
          ? result.error 
          : (result.error?.message || JSON.stringify(result.error) || 'Task launch failed');
        await quickTaskService.failTask(task.id, errorMessage);
        
        this.emit('quicktask:failed', { task, error: result.error });
      }
    } catch (error) {
      logger.error(LogCategory.ORCHESTRATOR, 'Error processing quick task:', error);
      this.emit('quicktask:error', { task, error });
    }
  }

  /**
   * Enqueue a task in memory (fallback when Redis not available)
   */
  enqueueTask(task: any): void {
    this.inMemoryTaskQueue.push(task);
    this.inMemoryTaskQueue.sort((a, b) => {
      // Sort by priority then by creation time
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    this.emit('task:enqueued', task);
  }
}

// Create singleton instance
export const orchestrator = new Orchestrator();

// Export all components
export { taskQueue, taskScheduler, taskExecutor };