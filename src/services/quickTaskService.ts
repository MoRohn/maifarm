import { api } from './apiClient';
import { websocketService } from './websocket';

export interface QuickTask {
  id: string;
  title: string;
  description: string;
  type: 'simple' | 'code_review' | 'test_generation' | 'documentation' | 'custom';
  payload: any;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'queued' | 'assigned' | 'processing' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: any;
  createdAt?: Date;
  completedAt?: Date;
}

export interface QuickTaskTemplate {
  type: QuickTask['type'];
  title: string;
  description: string;
  defaultPayload: any;
  estimatedTime: number; // in seconds
}

export const quickTaskTemplates: QuickTaskTemplate[] = [
  {
    type: 'simple',
    title: 'Simple Task',
    description: 'Execute a straightforward task with a single agent',
    defaultPayload: {
      instructions: '',
      context: {}
    },
    estimatedTime: 60 // 1 minute
  },
  {
    type: 'code_review',
    title: 'Code Review',
    description: 'Review code for best practices and improvements',
    defaultPayload: {
      code: '',
      language: 'typescript',
      reviewType: 'comprehensive'
    },
    estimatedTime: 180 // 3 minutes
  },
  {
    type: 'test_generation',
    title: 'Generate Tests',
    description: 'Create unit tests for your code',
    defaultPayload: {
      code: '',
      framework: 'jest',
      coverage: 'full'
    },
    estimatedTime: 300 // 5 minutes
  },
  {
    type: 'documentation',
    title: 'Generate Documentation',
    description: 'Create documentation for code or APIs',
    defaultPayload: {
      source: '',
      format: 'markdown',
      detail: 'comprehensive'
    },
    estimatedTime: 240 // 4 minutes
  },
  {
    type: 'custom',
    title: 'Custom Task',
    description: 'Define your own task requirements',
    defaultPayload: {
      instructions: '',
      requirements: [],
      constraints: []
    },
    estimatedTime: 300 // 5 minutes
  }
];

// Helper function to format seconds to hours and minutes
export const formatEstimatedTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
};

class QuickTaskService {
  private farmId?: string;

  async initialize() {
    // Create or get a dedicated quick task farm
    try {
      const farms = await api.farms.list();
      const quickTaskFarm = farms.data.data?.find((f: any) => f.name === 'Quick Task Farm');
      
      if (quickTaskFarm) {
        this.farmId = quickTaskFarm.id;
      } else {
        // Create a dedicated quick task farm
        const response = await api.farms.create({
          name: 'Quick Task Farm',
          description: 'Dedicated farm for quick task execution',
          type: 'sequential',
          config: {
            maxAgents: 3,
            autoScale: true,
            timeout: 600,
            yaml: `name: Quick Task Farm
type: sequential
agents:
  - name: Task Executor
    type: builder
    capabilities: [General Purpose]
    max_instances: 3`
          }
        });
        
        if (response.data.success) {
          this.farmId = response.data.data.id;
        }
      }
    } catch (error) {
      console.error('Failed to initialize quick task farm:', error);
    }
  }

  async createQuickTask(task: Partial<QuickTask>): Promise<QuickTask> {
    if (!this.farmId) {
      await this.initialize();
    }

    if (!this.farmId) {
      throw new Error('Failed to initialize quick task farm');
    }

    try {
      const response = await api.post('/api/tasks', {
        farmId: this.farmId,
        type: task.type || 'simple',
        priority: task.priority || 'medium',
        payload: {
          title: task.title,
          description: task.description,
          ...task.payload
        },
        metadata: {
          source: 'quick_task',
          createdBy: 'user'
        }
      });

      if (response.data.success) {
        // Subscribe to task updates via WebSocket
        this.subscribeToTaskUpdates(response.data.data.id);
        return this.mapApiTaskToQuickTask(response.data.data);
      } else {
        throw new Error(response.data.error?.message || 'Failed to create task');
      }
    } catch (error) {
      console.error('Error creating quick task:', error);
      throw error;
    }
  }

  async getQuickTask(taskId: string): Promise<QuickTask> {
    try {
      const response = await api.get(`/api/tasks/${taskId}`);
      if (response.data.success) {
        return this.mapApiTaskToQuickTask(response.data.data);
      }
      throw new Error('Task not found');
    } catch (error) {
      console.error('Error fetching quick task:', error);
      throw error;
    }
  }

  async getRecentQuickTasks(limit: number = 10): Promise<QuickTask[]> {
    if (!this.farmId) {
      await this.initialize();
    }

    try {
      const response = await api.get('/api/tasks', {
        params: {
          farmId: this.farmId,
          limit,
          sort: 'createdAt',
          order: 'desc'
        }
      });

      if (response.data.success) {
        return response.data.data.map(this.mapApiTaskToQuickTask);
      }
      return [];
    } catch (error) {
      console.error('Error fetching recent tasks:', error);
      return [];
    }
  }

  async cancelQuickTask(taskId: string): Promise<void> {
    try {
      await api.put(`/api/tasks/${taskId}/cancel`);
    } catch (error) {
      console.error('Error cancelling task:', error);
      throw error;
    }
  }

  async retryQuickTask(taskId: string): Promise<void> {
    try {
      await api.post(`/api/tasks/${taskId}/retry`);
    } catch (error) {
      console.error('Error retrying task:', error);
      throw error;
    }
  }

  private subscribeToTaskUpdates(taskId: string) {
    // Subscribe to WebSocket events for this task
    websocketService.on(`task:${taskId}:status`, (data) => {
      console.log('Task status update:', data);
      // Emit custom event for UI updates
      window.dispatchEvent(new CustomEvent('quickTaskUpdate', { 
        detail: { taskId, ...data } 
      }));
    });

    websocketService.on(`task:${taskId}:progress`, (data) => {
      console.log('Task progress:', data);
      window.dispatchEvent(new CustomEvent('quickTaskProgress', { 
        detail: { taskId, ...data } 
      }));
    });

    websocketService.on(`task:${taskId}:completed`, (data) => {
      console.log('Task completed:', data);
      window.dispatchEvent(new CustomEvent('quickTaskCompleted', { 
        detail: { taskId, ...data } 
      }));
    });
  }

  private mapApiTaskToQuickTask(apiTask: any): QuickTask {
    return {
      id: apiTask.id,
      title: apiTask.payload?.title || 'Untitled Task',
      description: apiTask.payload?.description || '',
      type: apiTask.type as QuickTask['type'],
      payload: apiTask.payload,
      priority: apiTask.priority,
      status: apiTask.status,
      result: apiTask.result,
      error: apiTask.error,
      createdAt: new Date(apiTask.createdAt),
      completedAt: apiTask.completedAt ? new Date(apiTask.completedAt) : undefined
    };
  }
}

export const quickTaskService = new QuickTaskService();