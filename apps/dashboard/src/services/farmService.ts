import { api } from './apiClient';
import { Farm, FarmConfig } from '@/types';

export interface CreateFarmData {
  name: string;
  description?: string;
  type?: 'sequential' | 'collaborative' | 'autonomous';
  provider?: 'claude' | 'openai';
  config?: Partial<FarmConfig>;
  tags?: string[];
}

export interface FarmResponse {
  success: boolean;
  data?: Farm;
  error?: {
    code: string;
    message: string;
  };
}

export interface FarmsListResponse {
  success: boolean;
  data?: Farm[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    timestamp: Date;
  };
  error?: {
    code: string;
    message: string;
  };
}

class FarmService {
  private baseUrl = '/api';

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }
        
        // Don't retry on the last attempt
        if (i === maxRetries - 1) {
          throw error;
        }
        
        // Exponential backoff
        const delay = initialDelay * Math.pow(2, i);
        console.log(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  async createFarmWithFiles(formData: FormData): Promise<Farm> {
    // Retry logic for network failures
    return this.retryWithBackoff(async () => {
      try {
        const response = await fetch(`${this.baseUrl}/farms`, {
          method: 'POST',
          body: formData,
          // Don't set Content-Type header - browser will set it with boundary for multipart/form-data
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `Failed to create farm: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.success && result.data) {
          return result.data;
        } else {
          throw new Error(result.error?.message || 'Failed to create farm');
        }
      } catch (error: any) {
        if (error.message) {
          throw error;
        } else {
          throw new Error('An unexpected error occurred while creating the farm');
        }
      }
    });
  }

  async createFarm(data: CreateFarmData): Promise<Farm> {
    // Input validation
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Farm name is required');
    }
    
    if (data.name.length > 100) {
      throw new Error('Farm name must be less than 100 characters');
    }
    
    if (data.description && data.description.length > 500) {
      throw new Error('Description must be less than 500 characters');
    }
    
    // Retry logic for network failures
    return this.retryWithBackoff(async () => {
      try {
        const response = await api.farms.create({
          name: data.name.trim(),
          description: data.description?.trim() || '',
          type: data.type || 'sequential',
          provider: data.provider || 'claude',
          config: {
            maxAgents: data.config?.maxAgents || 5,
            resourceLimits: {
              totalCpu: 8,
              totalMemory: 16384
            },
            orchestrationStrategy: 'round-robin',
            autoScale: data.config?.autoScale || false,
            timeout: data.config?.timeout || 3600,
            retryPolicy: data.config?.retryPolicy || {
              enabled: true,
              maxRetries: 3,
              backoffMultiplier: 2
            },
            goWildMode: data.config?.goWildMode || {
              enabled: false,
              creativityLevel: 3,
              boundaries: []
            },
            yaml: data.config?.yaml || '',
            provider: data.provider || 'claude'
          },
          tags: data.tags || []
        });

        if (response.data.success && response.data.data) {
          return response.data.data;
        } else {
          const errorMessage = response.data.error?.message || 'Failed to create farm';
          console.error('Farm creation API error:', response.data.error);
          throw new Error(errorMessage);
        }
      } catch (error: any) {
        console.error('[FarmService] Farm creation failed:', error);
        console.error('[FarmService] Error response:', error.response?.data);
        
        // Enhanced error handling with specific messages
        if (error.response?.data?.error) {
          const apiError = error.response.data.error;
          console.error('[FarmService] API Error details:', apiError);
          
          // Provide user-friendly error messages
          switch (apiError.code) {
            case 'VALIDATION_ERROR':
              throw new Error(`Validation failed: ${apiError.message}`);
            case 'DUPLICATE_ERROR':
              throw new Error('A farm with this name already exists');
            case 'PERMISSION_DENIED':
              throw new Error('You do not have permission to create farms');
            case 'DATABASE_ERROR':
              throw new Error('Database connection failed. Please try again later.');
            case 'FARM_CREATION_ERROR':
            case 'FARM_MANAGER_ERROR':
              throw new Error(apiError.message || 'Failed to create farm');
            case 'RATE_LIMIT_EXCEEDED':
              throw new Error('Too many requests. Please wait a moment and try again');
            default:
              throw new Error(apiError.message || 'Failed to create farm');
          }
        } else if (error.code === 'ECONNREFUSED') {
          throw new Error('Cannot connect to server. Please ensure the server is running on port 4567');
        } else if (error.code === 'ERR_NETWORK') {
          throw new Error('Network error. Please check your connection');
        } else if (error.message) {
          throw error;
        } else {
          throw new Error('An unexpected error occurred while creating the farm');
        }
      }
    });
  }

  async fetchFarms(params?: { 
    page?: number; 
    limit?: number; 
    status?: string;
    tags?: string;
  }): Promise<{ farms: Farm[]; total: number }> {
    try {
      const response = await api.farms.list(params);
      
      if (response.data.success && response.data.data) {
        // Ensure all farms have agents arrays
        const normalizedFarms = response.data.data.map((farm: Farm) => ({
          ...farm,
          agents: farm.agents || []
        }));
        return {
          farms: normalizedFarms,
          total: response.data.meta?.total || 0
        };
      } else {
        throw new Error(response.data.error?.message || 'Failed to fetch farms');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async getTerminalSessions(farmId: string): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/terminal/sessions?farmId=${encodeURIComponent(farmId)}`);
      if (!response.ok) {
        throw new Error(`Failed to get terminal sessions: ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.data || [];
    } catch (error: any) {
      console.error('Error fetching terminal sessions:', error);
      return [];
    }
  }

  async linkTerminalSession(farmId: string, sessionName: string): Promise<boolean> {
    try {
      // This would be used to explicitly link a session to a farm
      // For now, we rely on session naming conventions
      console.log(`Linking session ${sessionName} to farm ${farmId}`);
      return true;
    } catch (error: any) {
      console.error('Error linking terminal session:', error);
      return false;
    }
  }

  async getFarm(id: string): Promise<Farm> {
    try {
      const response = await api.farms.get(id);
      
      if (response.data.success && response.data.data) {
        // Fix: response.data.data is the farm object, not response.data.data.farm
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Farm not found');
      }
    } catch (error: any) {
      console.error('[FarmService] Error fetching farm:', error);
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async updateFarm(id: string, data: Partial<Farm>): Promise<Farm> {
    try {
      const response = await api.farms.update(id, data);
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to update farm');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async deleteFarm(id: string): Promise<void> {
    try {
      const response = await api.farms.delete(id);
      
      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to delete farm');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async launchFarm(id: string, config: {
    numberOfAgents?: number;
    yamlContent?: string;
    prompt?: string;
    provider?: string;
    collaborative?: boolean;
    goWildMode?: boolean;
  }): Promise<any> {
    try {
      const response = await api.farms.launch(id, config);
      
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to launch farm');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async startFarm(id: string): Promise<void> {
    try {
      const response = await api.post(`/api/farms/${id}/start`);
      
      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to start farm');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async pauseFarm(id: string): Promise<void> {
    try {
      const response = await api.post(`/api/farms/${id}/pause`);
      
      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to pause farm');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async createClaudeCodeFarm(farmId: string, options: {
    prompt?: string;
    steps?: string[];
    collaborative?: boolean;
  }): Promise<{ farmId: string; claudeFarmId: string; sessionName: string; status: string }> {
    try {
      const response = await api.post(`/api/farms/${farmId}/claude-code`, options);
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create Claude Code farm');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async createFarmFromSeed(seedId: string, data: {
    name: string;
    description?: string;
    config?: any;
  }): Promise<{ farm: Farm; seed: { id: string; name: string; category: string } }> {
    try {
      const response = await api.post('/api/farms/from-seed', {
        seedId,
        ...data
      });
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to create farm from seed');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  async getClaudeCodeStatus(farmId: string): Promise<any> {
    try {
      const response = await api.get(`/api/farms/${farmId}/claude-code/status`);

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error?.message || 'Failed to get Claude Code status');
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error.message);
      }
      throw error;
    }
  }

  /**
   * Harvest Now - Capture a snapshot of current work without stopping the farm
   * Farm continues running after snapshot is captured
   */
  async harvestNow(farmId: string): Promise<{
    success: boolean;
    data?: {
      farmId: string;
      snapshotId: string;
      status: string;
      farmStatus: string;
      message: string;
      timestamp: string;
    };
    error?: {
      code: string;
      message: string;
    };
  }> {
    try {
      const response = await api.post(`/api/farms/${farmId}/harvest-now`);
      return response.data;
    } catch (error: any) {
      console.error('[FarmService] Harvest now failed:', error);
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'HARVEST_NOW_FAILED',
          message: error.response?.data?.error?.message || error.message || 'Failed to capture snapshot'
        }
      };
    }
  }

  /**
   * Graceful Shutdown - Stop farm with yield collection
   * Collects all yields before shutting down
   */
  async gracefulShutdown(farmId: string, reason: string = 'user_request'): Promise<{
    success: boolean;
    data?: any;
    error?: {
      code: string;
      message: string;
    };
  }> {
    try {
      const response = await api.post(`/api/farms/${farmId}/graceful-shutdown`, {
        reason
      });
      return response.data;
    } catch (error: any) {
      console.error('[FarmService] Graceful shutdown failed:', error);
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'SHUTDOWN_FAILED',
          message: error.response?.data?.error?.message || error.message || 'Failed to shutdown farm'
        }
      };
    }
  }

  /**
   * Stop Farm - Quick stop without graceful yield collection
   */
  async stopFarm(farmId: string, graceful: boolean = true): Promise<{
    success: boolean;
    data?: any;
    error?: {
      code: string;
      message: string;
    };
  }> {
    try {
      const response = await api.post(`/api/farms/${farmId}/stop`, {
        graceful
      });
      return response.data;
    } catch (error: any) {
      console.error('[FarmService] Stop farm failed:', error);
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'STOP_FAILED',
          message: error.response?.data?.error?.message || error.message || 'Failed to stop farm'
        }
      };
    }
  }
}

// Workflow service functionality
export interface WorkflowStatus {
  id: string;
  farmId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message?: string;
  result?: any;
  error?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowOptions {
  timeout?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

export interface WorkflowResult {
  success: boolean;
  data?: any;
  error?: any;
}

// Extended WorkflowStatus interface for seed workflows
export interface ExtendedWorkflowStatus extends WorkflowStatus {
  currentStep?: string;
  workflowId?: string;
  completedAt?: Date;
}

class WorkflowService {
  private subscribers: Map<string, ((status: ExtendedWorkflowStatus) => void)[]> = new Map();

  async createWorkflow(farmId: string, options?: WorkflowOptions): Promise<WorkflowStatus> {
    try {
      const response = await api.post(`/api/workflows`, {
        farmId,
        ...options
      });
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to create workflow');
    }
  }

  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
    try {
      const response = await api.get(`/api/workflows/${workflowId}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to get workflow status');
    }
  }

  async runWorkflow(farmId: string, workflowConfig: any): Promise<WorkflowResult> {
    try {
      const response = await api.post(`/api/workflows/run`, {
        farmId,
        config: workflowConfig
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to run workflow');
    }
  }

  async createFarmFromSeedWithWorkflow(
    seedId: string,
    farmName: string,
    options: {
      description?: string;
      autoHarvest?: boolean;
      autoStore?: boolean;
      autoPauseOnClose?: boolean;
    }
  ): Promise<{ farm: any; workflowId: string }> {
    try {
      const response = await api.post('/api/farms/from-seed-workflow', {
        seedId,
        name: farmName,
        ...options
      });
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to create farm from seed');
    }
  }

  subscribeToWorkflowProgress(workflowId: string, callback: (status: ExtendedWorkflowStatus) => void): () => void {
    // Add subscriber
    const subscribers = this.subscribers.get(workflowId) || [];
    subscribers.push(callback);
    this.subscribers.set(workflowId, subscribers);

    // FIX: Track consecutive errors to prevent infinite polling on persistent failures
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;
    let isCleanedUp = false;

    // Helper to clean up interval and subscribers
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      clearInterval(interval);
      this.subscribers.delete(workflowId);
    };

    // Start polling for updates
    const interval = setInterval(async () => {
      // FIX: Skip if already cleaned up
      if (isCleanedUp) return;

      try {
        const status = await this.getWorkflowStatus(workflowId);
        consecutiveErrors = 0; // Reset on success

        const extendedStatus: ExtendedWorkflowStatus = {
          ...status,
          workflowId,
          currentStep: this.determineCurrentStep(status)
        };

        // Notify subscribers
        subscribers.forEach(cb => cb(extendedStatus));

        // Stop polling if completed or failed
        if (status.status === 'completed' || status.status === 'failed') {
          cleanup();
        }
      } catch (error) {
        consecutiveErrors++;
        console.error(`Failed to poll workflow status (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);

        // FIX: Stop polling after too many consecutive errors to prevent memory leak
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error('Too many consecutive polling errors, stopping workflow subscription');
          cleanup();
        }
      }
    }, 2000);

    // Return unsubscribe function
    return () => {
      cleanup();
      const subs = this.subscribers.get(workflowId) || [];
      const index = subs.indexOf(callback);
      if (index >= 0) subs.splice(index, 1);
    };
  }

  private determineCurrentStep(status: WorkflowStatus): string {
    // Determine the current step based on progress
    if (status.progress < 20) return 'initializing';
    if (status.progress < 40) return 'planting';
    if (status.progress < 60) return 'growing';
    if (status.progress < 80) return 'harvesting';
    if (status.progress < 100) return 'storing';
    return 'completed';
  }
}

// Harvest service functionality
class HarvestService {
  private eventHandlers: Map<string, Function[]> = new Map();
  private rooms: Set<string> = new Set();

  async collectHarvest(farmId: string): Promise<any> {
    try {
      const response = await api.post(`/api/farms/${farmId}/harvest`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to collect harvest');
    }
  }

  async getHarvest(harvestId: string): Promise<any> {
    try {
      const response = await api.get(`/api/harvests/${harvestId}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to get harvest');
    }
  }

  async listHarvests(params?: { farmId?: string; limit?: number; offset?: number }): Promise<any[]> {
    try {
      const response = await api.get(`/api/harvests`, { params });
      return response.data.data || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to list harvests');
    }
  }

  async saveAsSeed(harvestId: string, seedData: any): Promise<any> {
    try {
      const response = await api.post(`/api/harvests/${harvestId}/save-as-seed`, seedData);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to save harvest as seed');
    }
  }

  // WebSocket room management
  joinHarvestRoom(roomId: string): void {
    this.rooms.add(roomId);
    // In a real implementation, this would join a WebSocket room
    console.log(`Joined harvest room: ${roomId}`);
  }

  leaveHarvestRoom(roomId: string): void {
    this.rooms.delete(roomId);
    // In a real implementation, this would leave a WebSocket room
    console.log(`Left harvest room: ${roomId}`);
  }

  // Event handling
  onHarvestUpdate(callback: (update: any) => void): () => void {
    const handlers = this.eventHandlers.get('harvest:update') || [];
    handlers.push(callback);
    this.eventHandlers.set('harvest:update', handlers);

    // Return unsubscribe function
    return () => {
      const index = handlers.indexOf(callback);
      if (index >= 0) handlers.splice(index, 1);
    };
  }

  onAgentsUpdate(callback: (agents: any) => void): () => void {
    const handlers = this.eventHandlers.get('agents:update') || [];
    handlers.push(callback);
    this.eventHandlers.set('agents:update', handlers);

    return () => {
      const index = handlers.indexOf(callback);
      if (index >= 0) handlers.splice(index, 1);
    };
  }

  onWorkCompleted(callback: (completed: any) => void): () => void {
    const handlers = this.eventHandlers.get('work:completed') || [];
    handlers.push(callback);
    this.eventHandlers.set('work:completed', handlers);

    return () => {
      const index = handlers.indexOf(callback);
      if (index >= 0) handlers.splice(index, 1);
    };
  }

  // Trigger events (used internally or by WebSocket handlers)
  triggerEvent(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }
}

// Barn service functionality
class BarnService {
  async getItems(folderId?: string): Promise<any[]> {
    try {
      const response = await api.get(`/api/barn/items`, {
        params: { folderId }
      });
      return response.data.data || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to get barn items');
    }
  }

  async uploadItem(formData: FormData): Promise<any> {
    try {
      const response = await api.post(`/api/barn/upload`, formData);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to upload barn item');
    }
  }

  async deleteItem(itemId: string): Promise<void> {
    try {
      await api.delete(`/api/barn/items/${itemId}`);
    } catch (error: any) {
      throw new Error(error.response?.data?.error?.message || 'Failed to delete barn item');
    }
  }
}

export const farmService = new FarmService();
export const workflowService = new WorkflowService();
export const harvestService = new HarvestService();
export const barnService = new BarnService();