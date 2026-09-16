/**
 * Enhanced farm launch service with comprehensive debugging and fixes
 */

import { api } from './apiClient';
import { toast } from 'react-hot-toast';

export interface FarmLaunchOptions {
  name: string;
  description: string;
  type: 'sequential' | 'collaborative' | 'autonomous';
  config: {
    maxAgents: number;
    timeout: number;
    yaml?: string;
    autoScale?: boolean;
    goWildMode?: {
      enabled: boolean;
      creativityLevel?: number;
      boundaries?: string[];
    };
  };
  provider?: string;
  attachedFiles?: File[];
}

export class FarmLaunchService {
  private static isLaunching = false;
  private static isCreatingQuickTask = false;

  /**
   * Create and launch a farm with comprehensive error handling
   */
  static async createAndLaunchFarm(options: FarmLaunchOptions): Promise<any> {
    if (this.isLaunching) {
      console.warn('[FarmLaunchFix] Already launching a farm, skipping duplicate request');
      return null;
    }

    this.isLaunching = true;
    console.log('[FarmLaunchFix] Starting farm creation with options:', options);

    try {
      // Step 1: Create the farm
      const farm = await this.createFarm(options);
      
      if (!farm || !farm.id) {
        throw new Error('Farm creation returned invalid response');
      }

      console.log('[FarmLaunchFix] Farm created:', farm);

      // Step 2: Launch agents for the farm
      await this.launchFarmAgents(farm.id, options);

      // Step 3: Setup terminal streaming
      await this.setupTerminalStreaming(farm.id);

      console.log('[FarmLaunchFix] Farm launch completed successfully');
      return farm;
    } catch (error: any) {
      console.error('[FarmLaunchFix] Farm launch failed:', error);
      throw error;
    } finally {
      this.isLaunching = false;
    }
  }

  /**
   * Create a new farm
   */
  private static async createFarm(options: FarmLaunchOptions): Promise<any> {
    console.log('[FarmLaunchFix] Creating farm...');

    const farmData = {
      name: options.name,
      description: options.description,
      type: options.type,
      config: {
        ...options.config,
        yaml: options.config.yaml || this.generateDefaultYaml(options),
        provider: options.provider || 'claude'
      },
      yaml: options.config.yaml || this.generateDefaultYaml(options),
      provider: options.provider || 'claude'
    };

    try {
      let response;
      
      if (options.attachedFiles && options.attachedFiles.length > 0) {
        // Handle file uploads
        const formData = new FormData();
        formData.append('farmData', JSON.stringify(farmData));
        options.attachedFiles.forEach(file => {
          formData.append('files', file);
        });

        const res = await fetch('/api/farms', {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('[FarmLaunchFix] Farm creation failed:', errorText);
          throw new Error(`Failed to create farm: ${res.statusText}`);
        }

        response = await res.json();
      } else {
        // Regular JSON request
        response = await api.post('/api/farms', farmData);
      }

      // Handle response structure variations
      const farm = response.data?.data || response.data || response;
      
      if (!farm.id) {
        console.error('[FarmLaunchFix] Invalid farm response:', response);
        throw new Error('Farm created but missing ID');
      }

      return farm;
    } catch (error: any) {
      console.error('[FarmLaunchFix] Farm creation error:', error);
      
      // Provide user-friendly error messages
      if (error.response?.status === 403) {
        throw new Error('Permission denied. Please check your authentication.');
      } else if (error.response?.status === 400) {
        throw new Error(error.response?.data?.error?.message || 'Invalid farm configuration');
      } else if (error.message.includes('fetch')) {
        throw new Error('Network error. Please check your connection.');
      }
      
      throw error;
    }
  }

  /**
   * Launch agents for a farm
   */
  private static async launchFarmAgents(farmId: string, options: FarmLaunchOptions): Promise<void> {
    console.log('[FarmLaunchFix] Launching farm agents...');

    const launchData = {
      numberOfAgents: options.config.maxAgents || 3,
      yamlContent: options.config.yaml,
      prompt: options.description || options.name,
      provider: options.provider || 'claude',
      collaborative: options.type === 'collaborative',
      goWildMode: options.config.goWildMode?.enabled || false,
      timeout: options.config.timeout
    };

    try {
      const response = await api.post(`/api/farms/${farmId}/launch`, launchData);
      console.log('[FarmLaunchFix] Launch response:', response);
      
      if (response.data?.success === false) {
        throw new Error(response.data?.error?.message || 'Failed to launch agents');
      }
    } catch (error: any) {
      console.error('[FarmLaunchFix] Agent launch error:', error);
      
      // Don't fail the entire operation if agents fail to launch
      // The farm is already created and can be manually started
      toast.warning('Farm created but agents may need manual start');
      
      // Log detailed error for debugging
      console.error('[FarmLaunchFix] Launch error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
    }
  }

  /**
   * Setup terminal streaming for the farm
   */
  private static async setupTerminalStreaming(farmId: string): Promise<void> {
    console.log('[FarmLaunchFix] Setting up terminal streaming...');

    try {
      // Trigger terminal streaming setup via API
      await api.post(`/api/terminal/setup`, {
        farmId,
        sessionName: `farm-${farmId}`
      });
      
      console.log('[FarmLaunchFix] Terminal streaming setup complete');
    } catch (error) {
      // Terminal streaming is not critical for farm creation
      console.warn('[FarmLaunchFix] Terminal streaming setup failed:', error);
    }
  }

  /**
   * Generate default YAML configuration
   */
  private static generateDefaultYaml(options: FarmLaunchOptions): string {
    const agentCount = options.config.maxAgents || 3;
    const agents = Array.from({ length: agentCount }, (_, i) => ({
      name: `Agent ${i + 1}`,
      role: i === 0 ? 'coordinator' : 'worker',
      tasks: i === 0 
        ? ['Coordinate work', 'Monitor progress']
        : [`Execute task ${i}`, 'Report status']
    }));

    const yaml = {
      name: options.name,
      type: options.type,
      timeout: options.config.timeout,
      agents: agents
    };

    return JSON.stringify(yaml, null, 2);
  }

  /**
   * Quick task creation (5-minute sprint)
   */
  static async createQuickTask(description: string, attachedFiles?: File[]): Promise<any> {
    // Prevent duplicate submissions
    if (this.isCreatingQuickTask) {
      console.warn('[FarmLaunchFix] Already creating a quick task, skipping duplicate request');
      throw new Error('Quick task creation already in progress');
    }

    this.isCreatingQuickTask = true;
    console.log('[FarmLaunchFix] Creating quick task:', description);
    console.log('[FarmLaunchFix] Attached files:', attachedFiles?.length || 0);

    try {
      let response;
      
      // If files are attached, use FormData
      if (attachedFiles && attachedFiles.length > 0) {
        const formData = new FormData();
        formData.append('description', description);
        formData.append('timeout', '300000'); // 5 minutes in milliseconds
        
        // Append each file
        attachedFiles.forEach((file) => {
          formData.append('files', file);
        });
        
        response = await api.post('/api/tasks/quick', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      } else {
        // No files, use regular JSON
        response = await api.post('/api/tasks/quick', {
          description,
          timeout: 300000 // 5 minutes in milliseconds
        });
      }

      console.log('[FarmLaunchFix] API Response:', response.data);
      
      // The API returns data in different formats, handle all cases
      const farmId = response.data?.farmId || 
                     response.data?.data?.farmId || 
                     response.data?.data?.result?.farmId;
      const harvestId = response.data?.harvestId || 
                        response.data?.data?.harvestId || 
                        response.data?.data?.result?.harvestId;
      
      if (!farmId) {
        console.error('[FarmLaunchFix] No farm ID in response:', response.data);
        throw new Error('Quick task created but missing farm ID');
      }

      console.log('[FarmLaunchFix] Quick task created with farm ID:', farmId, 'harvest ID:', harvestId);
      return { farmId, harvestId };
    } catch (error: any) {
      console.error('[FarmLaunchFix] Quick task creation failed:', error);

      if (error?.response?.data?.error?.message) {
        throw new Error(error.response.data.error.message);
      }

      throw error;
    } finally {
      this.isCreatingQuickTask = false;
    }
  }
}
