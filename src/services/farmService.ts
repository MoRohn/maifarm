import { api } from './apiClient';
import { Farm, FarmConfig } from '../types';

export interface CreateFarmData {
  name: string;
  description?: string;
  type?: 'sequential' | 'collaborative' | 'autonomous';
  provider?: 'claude' | 'qwen';
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
        // Enhanced error handling with specific messages
        if (error.response?.data?.error) {
          const apiError = error.response.data.error;
          console.error('API Error:', apiError);
          
          // Provide user-friendly error messages
          switch (apiError.code) {
            case 'VALIDATION_ERROR':
              throw new Error(`Validation failed: ${apiError.message}`);
            case 'DUPLICATE_ERROR':
              throw new Error('A farm with this name already exists');
            case 'PERMISSION_DENIED':
              throw new Error('You do not have permission to create farms');
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
        return response.data.data.farm;
      } else {
        throw new Error(response.data.error?.message || 'Farm not found');
      }
    } catch (error: any) {
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
}

export const farmService = new FarmService();