import { v4 as uuidv4 } from 'uuid';
import { Task } from '../types/api';
import { db, redis } from '../database/connection';
import { WebSocketManager } from '../websocket/websocketManager';
import { orchestrator } from '../orchestrator';
import { harvestService } from './harvestService';
import { shutdownCoordinator } from './shutdownCoordinator';
import { QUICK_TASK_TIMEOUT } from '../constants/timing';

export interface QuickTaskConfig {
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
  metadata?: Record<string, any>;
}

export interface QuickTaskResult {
  taskId: string;
  farmId: string;
  harvestId?: string;
  status: 'created' | 'queued' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

class QuickTaskService {
  private readonly QUICK_TASK_FARM_PREFIX = 'quick-task-';

  /**
   * Creates a quick task with minimal setup
   */
  async createQuickTask(config: QuickTaskConfig, userId: string = 'default-user'): Promise<QuickTaskResult> {
    const taskId = uuidv4();
    const farmId = `${this.QUICK_TASK_FARM_PREFIX}${taskId}`;
    
    try {
      // Create a minimal farm for quick task execution
      const farm = {
        id: farmId,
        name: config.title || `Quick Task ${new Date().toLocaleTimeString()}`,
        description: config.description || 'Quick task execution',
        type: 'sequential',
        status: 'launching', // Start with launching status
        config: {
          maxAgents: 1,
          autoScale: false,
          timeout: QUICK_TASK_TIMEOUT, // Always use fixed 5-minute timeout for Quick Tasks
          quickTask: true
        },
        metadata: {
          ...config.metadata,
          isQuickTask: true,
          createdAt: new Date()
        }
      };

      // Store farm in database (with fallback to in-memory)
      try {
        await db.query(
          `INSERT INTO farms (id, name, description, status, config)
           VALUES ($1, $2, $3, $4, $5)`,
          [farm.id, farm.name, farm.description, farm.status, 
           JSON.stringify({...farm.config, type: farm.type, metadata: farm.metadata})]
        );
      } catch (dbError) {
        console.warn('Database insert failed, using in-memory storage:', dbError);
        // Store in memory as fallback
        orchestrator.registerQuickTaskFarm(farm);
      }

      // Create the task
      const task: Task = {
        id: taskId,
        farmId: farmId,
        type: 'quick-task',
        priority: config.priority || 'medium',
        status: 'queued',
        payload: {
          title: config.title,
          description: config.description,
          ...config.metadata
        },
        dependencies: [],
        retries: 0,
        maxRetries: 1, // Quick tasks get limited retries
        timeout: QUICK_TASK_TIMEOUT, // Always use fixed 5-minute timeout
        metadata: {
          isQuickTask: true,
          ...config.metadata
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store task
      console.log(`[QuickTaskService] Attempting to store task ${task.id} in database...`);
      try {
        await db.query(
          `INSERT INTO tasks (id, farm_id, type, priority, status, payload, dependencies, 
           retries, max_retries, timeout, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [task.id, task.farmId, task.type, task.priority, task.status,
           JSON.stringify(task.payload), task.dependencies, task.retries,
           task.maxRetries, task.timeout, JSON.stringify(task.metadata),
           task.createdAt, task.updatedAt]
        );
        console.log(`[QuickTaskService] ✓ Task ${task.id} stored in database successfully`);
      } catch (dbError) {
        console.error('[QuickTaskService] ✗ Database task insert failed:', dbError);
      }

      // Add to Redis queue
      await this.queueTask(task);

      // Notify via WebSocket
      WebSocketManager.broadcast('task:created', {
        taskId: task.id,
        farmId: task.farmId,
        title: config.title,
        status: 'queued',
        priority: task.priority,
        isQuickTask: true
      });
      
      // Also broadcast quick task specific event
      WebSocketManager.broadcast('quicktask:created', {
        taskId: task.id,
        farmId: task.farmId,
        title: config.title,
        description: config.description,
        priority: task.priority,
        timeout: task.timeout,
        metadata: task.metadata,
        timestamp: new Date()
      });

      // Create harvest for this quick task farm
      let harvestId: string | null = null;
      try {
        const harvest = await harvestService.startHarvest(
          farm.id,
          farm.name,
          userId
        );
        harvestId = harvest.id;
        
        // Emit harvest created event
        WebSocketManager.broadcast('harvest:created', {
          harvestId: harvest.id,
          farmId: farm.id,
          farmName: farm.name,
          isQuickTask: true,
          timestamp: new Date()
        });
        
        // Update farm status to active
        farm.status = 'active';
        try {
          await db.query(
            'UPDATE farms SET status = $1 WHERE id = $2',
            ['active', farm.id]
          );
        } catch (dbError) {
          console.warn('Failed to update farm status in DB:', dbError);
        }
        
        // Emit farm status update
        WebSocketManager.broadcast('farm:status', {
          farmId: farm.id,
          status: 'active',
          harvestId: harvest.id,
          timestamp: new Date()
        });
        
      } catch (harvestError) {
        console.error('Failed to create harvest for quick task:', harvestError);
        // Continue without harvest - not critical
      }

      // Launch the farm with multi-claude agents for Quick Task
      try {
        const orchestratorModule = await import('./OrchestratorService');
        const orchestratorService = orchestratorModule.orchestratorService;
        const processId = await orchestratorService.launchFarm({
          farmId: farm.id,
          name: farm.name,
          description: farm.description,
          numberOfAgents: 1, // Quick tasks use single agent
          prompt: config.description || config.title,
          collaborative: false,
          provider: (config.metadata?.provider as 'claude' | 'qwen') || 'claude',
          harvestId: harvestId || undefined
        });
        
        console.log(`[QuickTaskService] Launched multi-claude agents for farm ${farm.id}, process: ${processId}`);
        
        // Schedule graceful shutdown using the coordinator
        shutdownCoordinator.scheduleShutdown({
          mode: 'quick-task',
          farmId: farm.id,
          userId: userId,
          reason: 'timeout', // Will be overridden if completed earlier
          harvestId: harvestId || undefined,
          agentIds: [] // Will be populated by the coordinator
        });
        
        console.log(`[QuickTaskService] Scheduled graceful shutdown for ${farm.id} at ${(QUICK_TASK_TIMEOUT - 30000) / 1000}s (30s before 5min timeout)`);
        
        // Update farm status to running after successful launch
        farm.status = 'running';
        try {
          await db.query(
            'UPDATE farms SET status = $1, config = $2 WHERE id = $3',
            ['running', JSON.stringify({ ...farm.config, processId }), farm.id]
          );
        } catch (dbError) {
          console.warn('Failed to update farm status after launch:', dbError);
        }
        
        // Emit farm running event
        WebSocketManager.broadcast('farm:status', {
          farmId: farm.id,
          status: 'running',
          processId,
          harvestId,
          timestamp: new Date()
        });
      } catch (launchError) {
        console.error('[QuickTaskService] Failed to launch multi-claude agents:', launchError);
        // Continue without agents - fallback to orchestrator
        orchestrator.processQuickTask(task);
      }

      return {
        taskId: task.id,
        farmId: farm.id,
        status: 'queued',
        harvestId,
        result: null,
        error: null
      };
    } catch (error) {
      console.error('Error creating quick task:', error);
      throw new Error('Failed to create quick task');
    }
  }

  /**
   * Gets the status and result of a quick task
   */
  async getQuickTaskStatus(taskId: string): Promise<QuickTaskResult> {
    try {
      // Try database first
      const result = await db.query(
        'SELECT * FROM tasks WHERE id = $1',
        [taskId]
      );

      if (result.rows.length > 0) {
        const task = result.rows[0];
        return {
          taskId: task.id,
          farmId: task.farm_id,
          status: task.status,
          result: task.result,
          error: task.error
        };
      }

      // Fallback to Redis/memory
      if (redis && redis.isReady) {
        const cachedTask = await redis.get(`task:${taskId}`);
        if (cachedTask) {
        const task = JSON.parse(cachedTask);
          return {
            taskId: task.id,
            farmId: task.farmId,
            status: task.status,
            result: task.result,
            error: task.error
          };
        }
      }

      throw new Error('Task not found');
    } catch (error) {
      console.error('Error getting task status:', error);
      throw error;
    }
  }

  /**
   * Updates task progress and notifies clients
   */
  async updateTaskProgress(taskId: string, progress: number, message?: string): Promise<void> {
    try {
      // Update in database
      await db.query(
        `UPDATE tasks 
         SET metadata = jsonb_set(metadata, '{progress}', $1::jsonb),
             updated_at = $2
         WHERE id = $3`,
        [JSON.stringify(progress), new Date(), taskId]
      );

      // Update in cache if Redis available
      if (redis && redis.isReady) {
        await redis.set(`task:progress:${taskId}`, JSON.stringify({
          progress,
          message,
          timestamp: new Date()
        }), { EX: 3600 }); // 1 hour TTL
      }

      // Notify via WebSocket
      WebSocketManager.broadcast('task:progress', {
        taskId,
        progress,
        message
      });
    } catch (error) {
      console.error('Error updating task progress:', error);
    }
  }

  /**
   * Completes a quick task
   */
  async completeTask(taskId: string, result: any): Promise<void> {
    try {
      // Update task status
      await db.query(
        `UPDATE tasks 
         SET status = 'completed', 
             result = $1,
             completed_at = $2,
             updated_at = $2
         WHERE id = $3`,
        [JSON.stringify(result), new Date(), taskId]
      );

      // Get farm ID for cleanup
      const taskResult = await db.query(
        'SELECT farm_id FROM tasks WHERE id = $1',
        [taskId]
      );

      if (taskResult.rows.length > 0) {
        const farmId = taskResult.rows[0].farm_id;
        
        // Use graceful shutdown for quick task completion to collect yields
        if (farmId.startsWith(this.QUICK_TASK_FARM_PREFIX)) {
          try {
            console.log(`[QuickTaskService] Initiating graceful shutdown for quick task farm ${farmId}`);
            
            // Use the centralized shutdown coordinator for completion
            const shutdownResult = await shutdownCoordinator.executeGracefulShutdown({
              mode: 'quick-task',
              farmId: farmId,
              userId: 'dev-user',
              reason: 'completion'
            });
            
            console.log(`[QuickTaskService] Graceful shutdown completed for quick task farm ${farmId}`, {
              success: shutdownResult.success,
              filesCollected: shutdownResult.filesCollected,
              barnStored: shutdownResult.barnStored
            });
          } catch (gracefulError) {
            console.warn(`[QuickTaskService] Graceful shutdown failed for farm ${farmId}, using standard cleanup:`, gracefulError);
            
            // Fallback to standard cleanup
            try {
              await db.query(
                `UPDATE farms SET status = 'completed', updated_at = $1 WHERE id = $2`,
                [new Date(), farmId]
              );
              console.log(`[QuickTaskService] Farm ${farmId} status updated to 'completed'`);
            } catch (error) {
              console.error('Error updating farm status:', error);
            }
            
            await this.cleanupQuickTaskFarm(farmId);
          }
        }
      }

      // Notify via WebSocket
      WebSocketManager.broadcast('task:completed', {
        taskId,
        result,
        completedAt: new Date()
      });
    } catch (error) {
      console.error('Error completing task:', error);
    }
  }

  /**
   * Fails a quick task
   */
  async failTask(taskId: string, error: string): Promise<void> {
    try {
      await db.query(
        `UPDATE tasks 
         SET status = 'failed', 
             error = $1,
             completed_at = $2,
             updated_at = $2
         WHERE id = $3`,
        [error, new Date(), taskId]
      );

      // Get farm ID to update status
      const taskResult = await db.query(
        'SELECT farm_id FROM tasks WHERE id = $1',
        [taskId]
      );

      if (taskResult.rows.length > 0) {
        const farmId = taskResult.rows[0].farm_id;
        
        // Use graceful shutdown even for failed tasks to collect partial yields
        if (farmId.startsWith(this.QUICK_TASK_FARM_PREFIX)) {
          try {
            console.log(`[QuickTaskService] Task ${taskId} failed (${error}), attempting graceful shutdown to collect partial yields`);
            
            // Import farmManager dynamically to avoid circular dependency
            // Use the centralized shutdown coordinator for failed tasks
            const shutdownReason = error.toLowerCase().includes('timeout') ? 'timeout' : 'completion';
            const shutdownResult = await shutdownCoordinator.executeGracefulShutdown({
              mode: 'quick-task',
              farmId: farmId,
              userId: 'dev-user',
              reason: shutdownReason as 'timeout' | 'completion'
            });
            
            console.log(`[QuickTaskService] Graceful shutdown completed for failed quick task farm ${farmId}`, {
              success: shutdownResult.success,
              filesCollected: shutdownResult.filesCollected,
              barnStored: shutdownResult.barnStored
            });
          } catch (gracefulError) {
            console.warn(`[QuickTaskService] Graceful shutdown failed for failed farm ${farmId}, using standard cleanup:`, gracefulError);
            
            // Fallback to standard cleanup
            try {
              await db.query(
                `UPDATE farms SET status = 'failed', updated_at = $1 WHERE id = $2`,
                [new Date(), farmId]
              );
              console.log(`[QuickTaskService] Farm ${farmId} status updated to 'failed'`);
            } catch (updateError) {
              console.error('Error updating farm status:', updateError);
            }
          }
        }
      }

      // Notify via WebSocket
      WebSocketManager.broadcast('task:failed', {
        taskId,
        error,
        failedAt: new Date()
      });
    } catch (error) {
      console.error('Error failing task:', error);
    }
  }

  /**
   * Gets logs for a quick task
   */
  async getTaskLogs(taskId: string): Promise<string[]> {
    try {
      if (redis && redis.isReady) {
        const logs = await redis.lRange(`task:logs:${taskId}`, 0, -1);
        return logs;
      }
      return [];
    } catch (error) {
      console.error('Error getting task logs:', error);
      return [];
    }
  }

  /**
   * Adds a log entry for a task
   */
  async addTaskLog(taskId: string, message: string, level: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
    try {
      const logEntry = JSON.stringify({
        timestamp: new Date(),
        level,
        message
      });

      // Add to Redis if available
      if (redis && redis.isReady) {
        await redis.lPush(`task:logs:${taskId}`, logEntry);
        await redis.expire(`task:logs:${taskId}`, 3600); // 1 hour TTL
      }

      // Notify via WebSocket
      WebSocketManager.broadcast('task:log', {
        taskId,
        log: {
          timestamp: new Date(),
          level,
          message
        }
      });
    } catch (error) {
      console.error('Error adding task log:', error);
    }
  }

  /**
   * Queues a task for processing
   */
  private async queueTask(task: Task): Promise<void> {
    try {
      // Check if Redis is available
      if (redis && redis.isReady) {
        await redis.zAdd(`task_queue:${task.priority}`, {
          score: Date.now(),
          value: JSON.stringify({
            id: task.id,
            farmId: task.farmId,
            type: task.type
          })
        });
      } else {
        // Redis not available, use in-memory queue
        console.log('Redis not available, using in-memory queue for task:', task.id);
        orchestrator.enqueueTask(task);
      }
    } catch (error) {
      console.error('Error queuing task:', error);
      // Fallback to in-memory queue
      orchestrator.enqueueTask(task);
    }
  }

  /**
   * Cleans up resources for a quick task farm
   */
  private async cleanupQuickTaskFarm(farmId: string): Promise<void> {
    try {
      // Mark farm as completed
      await db.query(
        `UPDATE farms SET status = 'completed' WHERE id = $1`,
        [farmId]
      );

      // Clean up from orchestrator
      orchestrator.unregisterQuickTaskFarm(farmId);

      // Clean up Redis keys if available
      if (redis && redis.isReady) {
        const keys = await redis.keys(`farm:${farmId}:*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (error) {
      console.error('Error cleaning up quick task farm:', error);
    }
  }
}

// Export singleton instance
export const quickTaskService = new QuickTaskService();