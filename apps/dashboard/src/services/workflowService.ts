import { api } from './apiClient';

export interface WorkflowOptions {
  seedId: string;
  farmName: string;
  farmDescription?: string;
  config?: any;
  autoHarvest?: boolean;
  autoStore?: boolean;
}

export interface WorkflowResult {
  workflowId: string;
  seed: {
    id: string;
    name: string;
    category: string;
  };
  farm: {
    id: string;
    name: string;
    status: string;
  };
  harvest?: {
    id: string;
    status: string;
  };
  barn?: {
    id: string;
    entryCount: number;
  };
}

export interface WorkflowStatus {
  workflowId: string;
  status: 'initializing' | 'planting' | 'growing' | 'harvesting' | 'storing' | 'completed' | 'failed';
  currentStep: string;
  progress: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

class WorkflowService {
  async executeWorkflow(options: WorkflowOptions): Promise<WorkflowResult> {
    try {
      const response = await api.post('/api/workflow/execute', options);
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to execute workflow');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
    try {
      const response = await api.get(`/api/workflow/${workflowId}/status`);
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to get workflow status');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async getActiveWorkflows(): Promise<WorkflowStatus[]> {
    try {
      const response = await api.get('/api/workflow/active');
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to get active workflows');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    try {
      const response = await api.post(`/api/workflow/${workflowId}/cancel`);
      
      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to cancel workflow');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async createDemoSeeds(): Promise<any[]> {
    try {
      const response = await api.post('/api/workflow/demo-seeds');
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create demo seeds');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  // Helper method to create a farm from seed with full workflow
  async createFarmFromSeedWithWorkflow(
    seedId: string,
    farmName: string,
    options?: {
      description?: string;
      config?: any;
      autoHarvest?: boolean;
      autoStore?: boolean;
      autoPauseOnClose?: boolean;
    }
  ): Promise<WorkflowResult> {
    return this.executeWorkflow({
      seedId,
      farmName,
      farmDescription: options?.description,
      config: { ...options?.config, autoPauseOnClose: options?.autoPauseOnClose },
      autoHarvest: options?.autoHarvest ?? true,
      autoStore: options?.autoStore ?? true
    });
  }

  // Subscribe to workflow progress updates via WebSocket
  subscribeToWorkflowProgress(workflowId: string, callback: (status: WorkflowStatus) => void): () => void {
    // This would integrate with the WebSocket service
    // For now, we'll use polling as a fallback
    const interval = setInterval(async () => {
      try {
        const status = await this.getWorkflowStatus(workflowId);
        callback(status);
        
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Error fetching workflow status:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }
}

export const workflowService = new WorkflowService();