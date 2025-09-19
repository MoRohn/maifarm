/**
 * Unified Orchestrator Service
 * Consolidates all orchestration functionality
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { farmService } from './farmService';
import { websocketHub } from './websocketHub';
import { stateCoordinator } from './stateCoordinator';
import { logger, LogCategory } from '../../utils/logger';
import { db } from '../../database/connection';

interface OrchestrationTask {
  id: string;
  type: 'farm' | 'agent' | 'task';
  farmId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  config: any;
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}

class OrchestratorService extends EventEmitter {
  private tasks: Map<string, OrchestrationTask> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  /**
   * Launch a new farm
   */
  async launchFarm(config: any): Promise<any> {
    const taskId = uuidv4();
    const task: OrchestrationTask = {
      id: taskId,
      type: 'farm',
      farmId: config.farmId || uuidv4(),
      status: 'pending',
      config,
      startTime: new Date()
    };

    this.tasks.set(taskId, task);

    try {
      // Use farmService for actual farm launch
      const result = await farmService.launchFarm(config);

      task.status = 'completed';
      task.endTime = new Date();
      task.result = result;

      this.emit('task:completed', task);
      return result;
    } catch (error: any) {
      task.status = 'failed';
      task.endTime = new Date();
      task.error = error.message;

      this.emit('task:failed', task);
      throw error;
    }
  }

  /**
   * Stop a farm
   */
  async stopFarm(farmId: string, graceful = true): Promise<void> {
    return farmService.stopFarm(farmId, graceful);
  }

  /**
   * Get farm status
   */
  async getFarmStatus(farmId: string): Promise<any> {
    return farmService.getFarmStatus(farmId);
  }

  /**
   * Launch a quick task
   */
  async launchQuickTask(prompt: string): Promise<any> {
    const taskId = uuidv4();
    const task: OrchestrationTask = {
      id: taskId,
      type: 'task',
      farmId: `quick-${taskId}`,
      status: 'pending',
      config: { prompt },
      startTime: new Date()
    };

    this.tasks.set(taskId, task);

    try {
      // Use quickTaskService for quick tasks
      const { quickTaskService } = await import('./quickTaskService');
      const result = await quickTaskService.executeQuickTask(prompt);

      task.status = 'completed';
      task.endTime = new Date();
      task.result = result;

      this.emit('task:completed', task);
      return result;
    } catch (error: any) {
      task.status = 'failed';
      task.endTime = new Date();
      task.error = error.message;

      this.emit('task:failed', task);
      throw error;
    }
  }

  /**
   * Execute Python orchestrator
   */
  async executePythonOrchestrator(scriptPath: string, args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [scriptPath, ...args]);
      const processId = uuidv4();

      this.processes.set(processId, pythonProcess);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
        logger.debug(LogCategory.ORCHESTRATOR, `Python output: ${data}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        logger.warn(LogCategory.ORCHESTRATOR, `Python error: ${data}`);
      });

      pythonProcess.on('close', (code) => {
        this.processes.delete(processId);

        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
        } else {
          resolve(output);
        }
      });

      pythonProcess.on('error', (error) => {
        this.processes.delete(processId);
        reject(error);
      });
    });
  }

  /**
   * Get all active tasks
   */
  getActiveTasks(): OrchestrationTask[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status === 'running' || task.status === 'pending'
    );
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): OrchestrationTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Clean up completed tasks older than specified time
   */
  cleanupOldTasks(olderThanMs = 3600000): void { // Default 1 hour
    const now = Date.now();
    for (const [id, task] of this.tasks.entries()) {
      if (task.endTime && now - task.endTime.getTime() > olderThanMs) {
        this.tasks.delete(id);
      }
    }
  }

  /**
   * Stop all running tasks
   */
  async stopAllTasks(): Promise<void> {
    const activeTasks = this.getActiveTasks();

    await Promise.all(
      activeTasks.map(async (task) => {
        if (task.type === 'farm') {
          await this.stopFarm(task.farmId, true);
        }
      })
    );

    // Kill all processes
    for (const [id, process] of this.processes.entries()) {
      process.kill('SIGTERM');
      this.processes.delete(id);
    }
  }

  /**
   * Get orchestrator stats
   */
  getStats(): any {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      processes: this.processes.size
    };
  }
}

// Export singleton instance
export const orchestratorService = new OrchestratorService();

// Also export as unifiedOrchestratorService for compatibility
export const unifiedOrchestratorService = orchestratorService;