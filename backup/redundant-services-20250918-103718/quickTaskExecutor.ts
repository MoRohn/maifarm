import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger, LogCategory } from '../utils/logger';
import { QUICK_TASK_TIMEOUT } from '../constants/timing';

interface QuickTaskConfig {
  prompt: string;
  timeout?: number;
  metadata?: Record<string, any>;
}

interface QuickTaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  artifacts?: any[];
}

class QuickTaskExecutor extends EventEmitter {
  private static instance: QuickTaskExecutor;
  private activeTasks = new Map<string, QuickTaskResult>();

  private constructor() {
    super();
  }

  static getInstance(): QuickTaskExecutor {
    if (!this.instance) {
      this.instance = new QuickTaskExecutor();
    }
    return this.instance;
  }

  async executeQuickTask(config: QuickTaskConfig): Promise<QuickTaskResult> {
    const taskId = uuidv4();
    const startTime = Date.now();
    const timeout = config.timeout || QUICK_TASK_TIMEOUT;

    logger.info(LogCategory.TASK, `Starting quick task ${taskId} with timeout ${timeout}ms`);

    const result: QuickTaskResult = {
      taskId,
      success: false,
      duration: 0
    };

    this.activeTasks.set(taskId, result);
    this.emit('task:started', { taskId, config });

    try {
      // Simulate task execution
      // In a real implementation, this would launch an agent or process
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Task timeout'));
        }, timeout);

        // Simulate some work
        setTimeout(() => {
          clearTimeout(timer);
          resolve({
            output: `Executed task: ${config.prompt}`,
            metadata: config.metadata
          });
        }, Math.min(2000, timeout / 2));
      });

      result.success = true;
      result.result = {
        output: `Task completed: ${config.prompt}`,
        metadata: config.metadata
      };

      logger.info(LogCategory.TASK, `Quick task ${taskId} completed successfully`);
      this.emit('task:completed', result);

    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);

      logger.error(LogCategory.TASK, `Quick task ${taskId} failed:`, error);
      this.emit('task:failed', { taskId, error: result.error });

    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return false;
    }

    logger.info(LogCategory.TASK, `Cancelling task ${taskId}`);
    this.emit('task:cancelled', { taskId });

    this.activeTasks.delete(taskId);
    return true;
  }

  getTask(taskId: string): QuickTaskResult | undefined {
    return this.activeTasks.get(taskId);
  }

  getActiveTasks(): QuickTaskResult[] {
    return Array.from(this.activeTasks.values());
  }

  clearCompletedTasks(): void {
    for (const [taskId, task] of this.activeTasks) {
      if (task.success || task.error) {
        this.activeTasks.delete(taskId);
      }
    }
  }
}

export const quickTaskExecutor = QuickTaskExecutor.getInstance();
export { QuickTaskExecutor, QuickTaskConfig, QuickTaskResult };