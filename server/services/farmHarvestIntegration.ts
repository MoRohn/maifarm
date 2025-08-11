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
    console.log('[FarmHarvestIntegration] Service initialized - checking for farms every 5 seconds');
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
      
      if (allFarms.length === 0) {
        return; // No farms to check
      }
      
      console.log(`[FarmHarvestIntegration] Checking ${allFarms.length} farms for completion`);
      
      const runningFarms = allFarms.filter(farm => farm.status === 'running' || farm.status === 'launching');
      console.log(`[FarmHarvestIntegration] Found ${runningFarms.length} running/launching farms`);
      
      for (const farm of runningFarms) {
        console.log(`[FarmHarvestIntegration] Checking farm ${farm.id} (${farm.name}), status: ${farm.status}`);
        console.log(`[FarmHarvestIntegration] Farm metrics:`, {
          totalTasks: farm.metrics?.totalTasks,
          completedTasks: farm.metrics?.completedTasks,
          failedTasks: farm.metrics?.failedTasks,
          agentCount: farm.agents?.length
        });
        
        // Check if farm has completed based on actual metrics
        const isCompleted = this.checkFarmCompletion(farm);
        
        if (isCompleted) {
          console.log(`[FarmHarvestIntegration] Farm ${farm.id} detected as completed`);
          
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
        } else {
          console.log(`[FarmHarvestIntegration] Farm ${farm.id} not yet completed`);
        }
      }
    } catch (error) {
      console.error('[FarmHarvestIntegration] Error checking farm completions:', error);
    }
  }

  private checkFarmCompletion(farm: any): boolean {
    // Check multiple conditions for farm completion
    
    // 1. Check if farm status is already marked as completed
    if (farm.status === 'completed') {
      console.log(`[FarmHarvestIntegration] Farm ${farm.id} already marked as completed`);
      return true;
    }
    
    // 2. Check if all agents are completed, failed, stopped, or idle (not working)
    if (farm.agents && farm.agents.length > 0) {
      const allAgentsFinished = farm.agents.every(
        (agent: any) => {
          const finished = agent.status === 'completed' || 
                          agent.status === 'failed' || 
                          agent.status === 'stopped' ||
                          agent.status === 'idle' ||
                          agent.status === 'error';
          if (!finished) {
            console.log(`[FarmHarvestIntegration] Agent ${agent.id} still working with status: ${agent.status}`);
          }
          return finished;
        }
      );
      if (allAgentsFinished) {
        console.log(`[FarmHarvestIntegration] All ${farm.agents.length} agents have finished`);
        return true;
      }
    }
    
    // 3. Check farm metrics for task completion
    if (farm.metrics) {
      const { tasksCompleted, tasksFailed, tasksRunning } = farm.metrics;
      
      // If we have completed/failed tasks and no running tasks, farm is done
      if ((tasksCompleted > 0 || tasksFailed > 0) && tasksRunning === 0) {
        console.log(`[FarmHarvestIntegration] Farm has ${tasksCompleted} completed, ${tasksFailed} failed, ${tasksRunning} running tasks`);
        return true;
      }
      
      // Legacy totalTasks check
      const totalTasks = farm.metrics.totalTasks;
      if (totalTasks && totalTasks > 0 && (tasksCompleted + tasksFailed) >= totalTasks) {
        console.log(`[FarmHarvestIntegration] Farm completed all ${totalTasks} tasks`);
        return true;
      }
    }
    
    // 4. Check if farm has explicit progress metadata (legacy support)
    if (farm.metadata?.progress === 100) {
      console.log(`[FarmHarvestIntegration] Farm has 100% progress metadata`);
      return true;
    }
    
    return false;
  }

  private async createHarvestFromFarm(farm: any) {
    try {
      console.log(`[FarmHarvestIntegration] Starting harvest creation for farm ${farm.id} (${farm.name})`);
      
      // Check if harvest already exists
      const existingHarvests = await harvestService.findAll({ farmId: farm.id });
      if (existingHarvests.length > 0) {
        console.log(`[FarmHarvestIntegration] Harvest already exists for farm ${farm.id}`);
        return; // Harvest already exists
      }

      // Create harvest using the harvest service
      const harvest = await harvestService.startHarvest(
        farm.id,
        farm.name,
        farm.userId || 'system'
      );
      console.log(`[FarmHarvestIntegration] Created harvest ${harvest.id} for farm ${farm.id}`);

      // Collect results from farm agents
      let resultsAdded = 0;
      if (farm.agents && farm.agents.length > 0) {
        for (const agent of farm.agents) {
          // Add agent's work as a result
          harvest.results.push({
            id: uuidv4(),
            agentId: agent.id,
            agentName: agent.name,
            agentType: agent.type || 'worker',
            taskType: 'development',
            content: JSON.stringify({
              status: agent.status,
              currentTask: agent.currentTask,
              progress: agent.progress,
              capabilities: agent.capabilities
            }),
            metadata: {
              agentMetrics: {
                cpu: agent.cpu,
                memory: agent.memory,
                lastActive: agent.lastActive
              }
            },
            timestamp: new Date(),
            processingTime: 0,
            success: agent.status === 'completed'
          });
          resultsAdded++;
        }
      }

      // Add any additional farm outputs if available
      if (farm.outputs || farm.results) {
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
          resultsAdded++;
        }
      }
      
      console.log(`[FarmHarvestIntegration] Added ${resultsAdded} results to harvest ${harvest.id}`);

      // Add yield items based on farm work
      if (farm.metrics && farm.metrics.completedTasks > 0) {
        const yieldData = {
          farmId: farm.id,
          farmName: farm.name,
          metrics: farm.metrics,
          agents: farm.agents?.map(agent => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            currentTask: agent.currentTask
          })) || [],
          completedAt: new Date()
        };
        
        harvest.yield.push({
          id: uuidv4(),
          type: 'farm-output',
          name: `${farm.name}-summary.json`,
          description: `Output from ${farm.metrics.completedTasks} completed tasks`,
          mimeType: 'application/json',
          size: Buffer.byteLength(JSON.stringify(yieldData, null, 2)),
          data: yieldData,
          createdBy: {
            agentId: 'farm-coordinator',
            agentName: 'Farm Coordinator'
          },
          createdAt: new Date(),
          metadata: {
            taskCount: farm.metrics.completedTasks,
            agentCount: farm.agents?.length || 0,
            farmType: farm.type
          }
        });
        console.log(`[FarmHarvestIntegration] Added yield item for ${farm.metrics.completedTasks} completed tasks`);
        
        // Also create a readable report if there are agent results
        if (harvest.results.length > 0) {
          const reportContent = `# ${farm.name} - Farm Report

## Summary
- **Farm ID**: ${farm.id}
- **Completed Tasks**: ${farm.metrics.completedTasks}
- **Active Agents**: ${farm.agents?.length || 0}
- **Results Collected**: ${harvest.results.length}
- **Completed At**: ${new Date().toISOString()}

## Agent Results
${harvest.results.map((result, index) => `
### ${result.agentName} (${result.agentType})
- **Task**: ${result.taskType}
- **Success**: ${result.success ? '✅' : '❌'}
- **Processing Time**: ${result.processingTime}s
- **Timestamp**: ${result.timestamp}

\`\`\`
${result.content}
\`\`\`
`).join('\n')}

## Raw Data
\`\`\`json
${JSON.stringify(yieldData, null, 2)}
\`\`\`
`;
          
          harvest.yield.push({
            id: uuidv4(),
            type: 'report',
            name: `${farm.name}-report.md`,
            description: `Human-readable report for farm ${farm.name}`,
            mimeType: 'text/markdown',
            size: Buffer.byteLength(reportContent),
            data: reportContent,
            createdBy: {
              agentId: 'farm-coordinator',
              agentName: 'Farm Coordinator'
            },
            createdAt: new Date(),
            metadata: {
              reportType: 'farm-summary',
              agentCount: farm.agents?.length || 0
            }
          });
          
          console.log(`[FarmHarvestIntegration] Added readable report for farm ${farm.id}`);
        }
      }

      // Complete the harvest
      await harvestService.completeHarvest(harvest.id);
      console.log(`[FarmHarvestIntegration] Completed harvest ${harvest.id}`);

      // Store in barn with proper metadata - with retry logic
      let barnItem;
      let barnStorageAttempts = 0;
      const maxBarnRetries = 3;
      
      while (barnStorageAttempts < maxBarnRetries && !barnItem) {
        try {
          barnStorageAttempts++;
          console.log(`[FarmHarvestIntegration] Attempting barn storage (attempt ${barnStorageAttempts}/${maxBarnRetries})`);
          
          // Verify harvest is ready before storing
          const updatedHarvest = await harvestService.findById(harvest.id);
          if (!updatedHarvest) {
            throw new Error('Harvest not found after completion');
          }
          
          if (updatedHarvest.status !== 'ready') {
            console.log(`[FarmHarvestIntegration] Harvest ${harvest.id} status is ${updatedHarvest.status}, waiting 1 second...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          
          console.log(`[FarmHarvestIntegration] Harvest ${harvest.id} is ready with ${updatedHarvest.yield.length} yield items`);
          
          barnItem = await barnService.storeHarvest(harvest.id, {
            name: `${farm.name} - ${new Date().toLocaleDateString()}`,
            description: `Automated harvest from farm ${farm.name}. Collected ${harvest.results.length} results and ${harvest.yield.length} yield items.`,
            type: 'harvest',
            category: 'farm-output',
            tags: ['auto-harvest', `farm-${farm.id}`, `agents-${farm.agents?.length || 0}`],
            folderId: 'harvests'
          });
          
          console.log(`[FarmHarvestIntegration] Successfully stored harvest ${harvest.id} in barn as item ${barnItem.id} (attempt ${barnStorageAttempts})`);
          break;
          
        } catch (barnError) {
          console.error(`[FarmHarvestIntegration] Barn storage attempt ${barnStorageAttempts} failed:`, barnError);
          
          if (barnStorageAttempts === maxBarnRetries) {
            console.error(`[FarmHarvestIntegration] Failed to store harvest ${harvest.id} in barn after ${maxBarnRetries} attempts`);
            // Continue without barn storage - harvest is still available
            break;
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 2000 * barnStorageAttempts));
        }
      }

      // Broadcast harvest creation with detailed info
      websocketManager.broadcast('harvest:created', {
        harvestId: harvest.id,
        farmId: farm.id,
        farmName: farm.name,
        resultCount: harvest.results.length,
        yieldCount: harvest.yield.length,
        barnItemId: barnItem?.id,
        storedInBarn: !!barnItem
      });

      console.log(`[FarmHarvestIntegration] Successfully created and stored harvest ${harvest.id} from farm ${farm.id}`);
    } catch (error) {
      console.error(`[FarmHarvestIntegration] Error creating harvest from farm ${farm.id}:`, error);
      
      // Broadcast error event
      websocketManager.broadcast('harvest:error', {
        farmId: farm.id,
        farmName: farm.name,
        error: error.message || 'Failed to create harvest'
      });
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