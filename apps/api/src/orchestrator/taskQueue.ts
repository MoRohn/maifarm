import { redis, redisPub } from '../database/connection';
import { Task } from '../types/api';
import { EventEmitter } from 'events';

export interface QueuedTask {
  id: string;
  farmId: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
}

export class TaskQueue extends EventEmitter {
  private readonly QUEUE_PREFIX = 'task_queue:';
  private readonly PROCESSING_SET = 'tasks:processing';
  private readonly DEAD_LETTER_QUEUE = 'tasks:dead_letter';
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * Add a task to the priority queue
   */
  async enqueue(task: Task): Promise<void> {
    const queuedTask: QueuedTask = {
      id: task.id,
      farmId: task.farmId,
      type: task.type,
      priority: task.priority,
      timestamp: Date.now()
    };

    const queueKey = `${this.QUEUE_PREFIX}${task.priority}`;
    const score = this.calculatePriority(task.priority);

    await redis.zAdd(queueKey, {
      score,
      value: JSON.stringify(queuedTask)
    });

    this.emit('task:enqueued', task);
  }

  /**
   * Get the next task from the highest priority queue
   */
  async dequeue(): Promise<QueuedTask | null> {
    const priorities = ['critical', 'high', 'medium', 'low'];
    
    for (const priority of priorities) {
      const queueKey = `${this.QUEUE_PREFIX}${priority}`;
      
      // Get task with lowest score (highest priority)
      const result = await redis.zRange(queueKey, 0, 0);
      
      if (result.length > 0) {
        // Remove from queue and add to processing set
        const taskData = result[0];
        const removed = await redis.zRem(queueKey, taskData);
        
        if (removed > 0) {
          const task = JSON.parse(taskData) as QueuedTask;
          
          // Add to processing set with expiry
          await redis.sAdd(this.PROCESSING_SET, task.id);
          await redis.expire(`${this.PROCESSING_SET}:${task.id}`, 3600); // 1 hour timeout
          
          this.emit('task:dequeued', task);
          return task;
        }
      }
    }
    
    return null;
  }

  /**
   * Mark a task as completed and remove from processing
   */
  async complete(taskId: string): Promise<void> {
    await redis.sRem(this.PROCESSING_SET, taskId);
    this.emit('task:completed', taskId);
  }

  /**
   * Move a failed task to dead letter queue
   */
  async markFailed(taskId: string, error: any): Promise<void> {
    await redis.sRem(this.PROCESSING_SET, taskId);
    
    await redis.zAdd(this.DEAD_LETTER_QUEUE, {
      score: Date.now(),
      value: JSON.stringify({
        taskId,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString()
      })
    });
    
    this.emit('task:failed', { taskId, error });
  }

  /**
   * Requeue a task (e.g., for retry)
   */
  async requeue(task: Task): Promise<void> {
    await redis.sRem(this.PROCESSING_SET, task.id);
    await this.enqueue(task);
    this.emit('task:requeued', task);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    queued: Record<string, number>;
    processing: number;
    deadLetter: number;
  }> {
    const priorities = ['critical', 'high', 'medium', 'low'];
    const queued: Record<string, number> = {};
    
    for (const priority of priorities) {
      const queueKey = `${this.QUEUE_PREFIX}${priority}`;
      queued[priority] = await redis.zCard(queueKey);
    }
    
    const processing = await redis.sCard(this.PROCESSING_SET);
    const deadLetter = await redis.zCard(this.DEAD_LETTER_QUEUE);
    
    return { queued, processing, deadLetter };
  }

  /**
   * Get tasks in a specific queue
   */
  async getQueuedTasks(priority: string, limit = 10): Promise<QueuedTask[]> {
    const queueKey = `${this.QUEUE_PREFIX}${priority}`;
    const results = await redis.zRange(queueKey, 0, limit - 1);
    
    return results.map(data => JSON.parse(data) as QueuedTask);
  }

  /**
   * Get processing tasks
   */
  async getProcessingTasks(): Promise<string[]> {
    return await redis.sMembers(this.PROCESSING_SET);
  }

  /**
   * Clean up stale processing tasks
   */
  async cleanupStaleProcessing(timeoutMs = 3600000): Promise<number> {
    const processingTasks = await this.getProcessingTasks();
    let cleaned = 0;
    
    for (const taskId of processingTasks) {
      const key = `${this.PROCESSING_SET}:${taskId}`;
      const ttl = await redis.ttl(key);
      
      if (ttl === -2) {
        // Key doesn't exist, remove from set
        await redis.sRem(this.PROCESSING_SET, taskId);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Start processing tasks
   */
  startProcessing(intervalMs = 1000): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processingInterval = setInterval(async () => {
      await this.cleanupStaleProcessing();
    }, 60000); // Cleanup every minute
    
    this.emit('queue:started');
  }

  /**
   * Stop processing tasks
   */
  stopProcessing(): void {
    if (!this.isProcessing) return;
    
    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    this.emit('queue:stopped');
  }

  /**
   * Calculate priority score (lower score = higher priority)
   */
  private calculatePriority(priority: string): number {
    const now = Date.now();
    const basePriority = {
      critical: 0,
      high: 1000000000,
      medium: 2000000000,
      low: 3000000000
    };
    
    return (basePriority[priority as keyof typeof basePriority] || basePriority.medium) + now;
  }

  /**
   * Clear all queues (use with caution!)
   */
  async clearAllQueues(): Promise<void> {
    const priorities = ['critical', 'high', 'medium', 'low'];
    
    for (const priority of priorities) {
      const queueKey = `${this.QUEUE_PREFIX}${priority}`;
      await redis.del(queueKey);
    }
    
    await redis.del(this.PROCESSING_SET);
    await redis.del(this.DEAD_LETTER_QUEUE);
    
    this.emit('queue:cleared');
  }
}

export const taskQueue = new TaskQueue();