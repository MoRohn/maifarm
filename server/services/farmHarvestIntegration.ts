import { EventEmitter } from 'events';
import { db } from '../database/connection';
import { WebSocketManager, websocketManager } from '../websocket/websocketManager';
import { v4 as uuidv4 } from 'uuid';
import { harvestService } from './harvestService';
import { farmManager } from './farmManager';
import { barnService } from './barnService';

interface FarmCompletionEvent {
  farmId: string;
  farmName: string;
  status: 'completed' | 'failed';
  results?: any;
  error?: string;
  completedAt: Date;
}

interface HarvestCreationData {
  farmId: string;
  farmName: string;
  name: string;
  description: string;
  type: string;
  artifacts: any[];
  metadata: Record<string, any>;
}

class FarmHarvestIntegration extends EventEmitter {
  private isInitialized = false;

  initialize() {
    if (this.isInitialized) return;

    // Listen for farm completion events
    this.setupFarmListeners();
    
    // Setup periodic check for completed farms
    this.startCompletionChecker();

    this.isInitialized = true;
    console.log('Farm-Harvest integration initialized');
  }

  private setupFarmListeners() {
    // Since WebSocketManager doesn't extend EventEmitter, we'll use a different approach
    // We'll check for farm completions periodically and listen to farm status updates
    
    // Set up periodic check for farm status changes
    setInterval(async () => {
      await this.checkAllFarmCompletions();
    }, 5000); // Check every 5 seconds
  }

  private startCompletionChecker() {
    // Check for completed farms every 30 seconds
    setInterval(async () => {
      try {
        await this.checkPendingFarms();
      } catch (error) {
        console.error('Error checking pending farms:', error);
      }
    }, 30000);
  }

  private async checkPendingFarms() {
    try {
      // Use in-memory farm service instead of database
      const allFarms = await farmManager.getAllFarms();
      const completedFarms = allFarms.filter(farm => farm.status === 'completed');
      
      for (const farm of completedFarms) {
        // Check if harvest already exists for this farm
        const harvests = await harvestService.findAll({ farmId: farm.id });
        if (harvests.length === 0) {
          await this.createHarvestFromFarm(farm);
        }
      }
    } catch (error) {
      console.error('Error checking pending farms:', error);
    }
  }

  private async handleFarmCompletion(event: FarmCompletionEvent) {
    try {
      const { farmId, status } = event;

      if (status === 'completed') {
        // Get farm details from in-memory service
        const farm = await farmManager.getFarm(farmId);
        if (farm) {
          await this.createHarvestFromFarm(farm);
        }
      }
    } catch (error) {
      console.error('Error handling farm completion:', error);
    }
  }

  private async checkAllFarmCompletions() {
    try {
      const allFarms = await farmManager.getAllFarms();
      const runningFarms = allFarms.filter(farm => farm.status === 'running');
      
      for (const farm of runningFarms) {
        // Check if farm has completed (simplified check)
        // In a real implementation, this would check task completion status
        if (farm.metadata?.progress === 100) {
          // Update farm status
          await farmManager.updateFarmStatus(farm.id, 'completed');
          
          // Create harvest
          await this.createHarvestFromFarm(farm);
          
          // Broadcast completion event
          websocketManager.broadcast('farm:completed', {
            farmId: farm.id,
            farmName: farm.name,
            status: 'completed',
            completedAt: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Error checking farm completions:', error);
    }
  }

  private async createHarvestFromFarm(farm: any) {
    try {
      // Check if harvest already exists
      const existingHarvests = await harvestService.findAll({ farmId: farm.id });
      if (existingHarvests.length > 0) {
        return; // Harvest already exists
      }

      // Create harvest using the harvest service
      const harvest = await harvestService.startHarvest(
        farm.id,
        farm.name,
        farm.userId || 'system'
      );

      // Add some sample results to the harvest
      if (farm.outputs || farm.results) {
        // Add actual farm outputs if available
        const results = farm.outputs || farm.results || [];
        for (const result of results) {
          harvest.results.push({
            id: uuidv4(),
            agentId: result.agentId || 'farm-agent',
            agentName: result.agentName || 'Farm Agent',
            agentType: 'worker',
            taskType: result.type || 'processing',
            content: JSON.stringify(result),
            metadata: result,
            timestamp: new Date(),
            processingTime: result.duration || 0,
            success: true
          });
        }
      }

      // Complete the harvest
      await harvestService.completeHarvest(harvest.id);

      // Store in barn
      const barnItem = await barnService.storeHarvest(harvest);

      // Broadcast harvest creation
      websocketManager.broadcast('harvest:created', {
        harvestId: harvest.id,
        farmId: farm.id,
        farmName: farm.name,
        artifactCount: harvest.artifacts.length
      });

      console.log(`Created harvest ${harvest.id} from farm ${farm.id}`);
    } catch (error) {
      console.error('Error creating harvest from farm:', error);
    }
  }

  async manualCreateHarvest(farmId: string, userId: string) {
    try {
      const farm = await farmManager.getFarm(farmId, userId);
      if (!farm) {
        throw new Error('Farm not found or unauthorized');
      }

      await this.createHarvestFromFarm(farm);
      return { success: true, message: 'Harvest created successfully' };
    } catch (error) {
      console.error('Error manually creating harvest:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const farmHarvestIntegration = new FarmHarvestIntegration();