import { harvestService } from '../../services/unified/farmService.js';
import { barnService } from '../../services/unified/farmService.js';
import { taskQueueService } from '../../services/unified/quickTaskService.js';

export class TaskOrchestrator {
  async listTasks(filters: any) {
    // Consolidate tasks from harvest, barn, and queue
    const [harvestTasks, barnTasks, queuedTasks] = await Promise.all([
      harvestService.getTasks(filters),
      barnService.getTasks(filters),
      taskQueueService.getTasks(filters)
    ]);
    
    return [...harvestTasks, ...barnTasks, ...queuedTasks];
  }
  
  async createTask(data: any) {
    return taskQueueService.submitTask(data);
  }
  
  async getTask(id: string) {
    return taskQueueService.getTask(id);
  }
  
  async cancelTask(id: string) {
    return taskQueueService.cancelTask(id);
  }
}