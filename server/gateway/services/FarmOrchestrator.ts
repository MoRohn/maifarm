import { farmManager } from '../../services/unified/farmService.js';
import { agentManager } from '../../services/unified/farmService.js';
import { harvestService } from '../../services/unified/farmService.js';
import { metricsService } from '../../services/metricsService.js';
import { taskQueueService } from '../../services/unified/quickTaskService.js';
import { EventEmitter } from 'events';

interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

export class FarmOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    // Forward events from underlying services
    farmManager.on('farm:created', (farm) => this.emit('farm:created', farm));
    farmManager.on('farm:updated', (farm) => this.emit('farm:updated', farm));
    farmManager.on('farm:deleted', (farmId) => this.emit('farm:deleted', farmId));
    agentManager.on('agent:status', (agent) => this.emit('agent:status', agent));
  }
  
  async listFarms(options: PaginationOptions): Promise<PaginatedResult<any>> {
    const { page, limit, sortBy, sortOrder, filters } = options;
    const offset = (page - 1) * limit;
    
    // Get farms from farmManager
    const allFarms = await farmManager.getAllFarms();
    
    // Apply filters
    let filteredFarms = allFarms;
    if (filters) {
      filteredFarms = allFarms.filter(farm => {
        return Object.entries(filters).every(([key, value]) => {
          if (key in farm) {
            return farm[key] === value;
          }
          return true;
        });
      });
    }
    
    // Sort farms
    if (sortBy) {
      filteredFarms.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        const order = sortOrder === 'asc' ? 1 : -1;
        return aVal > bVal ? order : -order;
      });
    }
    
    // Paginate
    const paginatedFarms = filteredFarms.slice(offset, offset + limit);
    
    return {
      data: paginatedFarms,
      total: filteredFarms.length,
      hasMore: offset + limit < filteredFarms.length
    };
  }
  
  async getFarmDetails(farmId: string): Promise<any> {
    const farm = await farmManager.getFarmById(farmId);
    if (!farm) return null;
    
    // Enrich with additional data
    const agents = await agentManager.getAgentsByFarmId(farmId);
    const metrics = await metricsService.getFarmMetrics(farmId);
    const harvests = await harvestService.getHarvestsByFarmId(farmId);
    
    return {
      ...farm,
      agents,
      metrics,
      recentHarvests: harvests.slice(0, 5)
    };
  }
  
  async createFarm(data: any): Promise<any> {
    // Create farm with consolidated logic
    const farm = await farmManager.createFarm({
      name: data.name,
      description: data.description,
      provider: data.provider,
      config: data.config
    });
    
    // Create initial agents
    if (data.agentCount > 0) {
      await this.addAgents(farm.id, { 
        count: data.agentCount,
        type: 'primary' 
      });
    }
    
    return farm;
  }
  
  async updateFarm(farmId: string, updates: any): Promise<any> {
    return await farmManager.updateFarm(farmId, updates);
  }
  
  async deleteFarm(farmId: string): Promise<boolean> {
    // Graceful shutdown sequence
    await this.performLifecycleAction(farmId, 'stop');
    await agentManager.removeAllAgents(farmId);
    return await farmManager.deleteFarm(farmId);
  }
  
  async addAgents(farmId: string, config: any): Promise<any[]> {
    const agents = [];
    for (let i = 0; i < config.count; i++) {
      const agent = await agentManager.createAgent({
        farmId,
        type: config.type || 'primary',
        name: `Agent-${Date.now()}-${i}`
      });
      agents.push(agent);
    }
    return agents;
  }
  
  async getFarmAgents(farmId: string): Promise<any[]> {
    return await agentManager.getAgentsByFarmId(farmId);
  }
  
  async removeAgent(farmId: string, agentId: string): Promise<boolean> {
    return await agentManager.removeAgent(agentId);
  }
  
  async getFarmMetrics(farmId: string, dateRange?: any): Promise<any> {
    const baseMetrics = await metricsService.getFarmMetrics(farmId);
    
    if (dateRange?.startDate || dateRange?.endDate) {
      // Apply date filtering
      const historicalMetrics = await metricsService.getHistoricalMetrics(
        farmId,
        dateRange.startDate,
        dateRange.endDate
      );
      
      return {
        current: baseMetrics,
        historical: historicalMetrics
      };
    }
    
    return baseMetrics;
  }
  
  async submitTask(farmId: string, taskData: any): Promise<any> {
    return await taskQueueService.submitTask({
      ...taskData,
      farmId
    });
  }
  
  async getFarmTasks(farmId: string, options: PaginationOptions): Promise<PaginatedResult<any>> {
    const tasks = await taskQueueService.getTasksByFarmId(farmId);
    
    // Apply pagination
    const offset = (options.page - 1) * options.limit;
    const paginatedTasks = tasks.slice(offset, offset + options.limit);
    
    return {
      data: paginatedTasks,
      total: tasks.length,
      hasMore: offset + options.limit < tasks.length
    };
  }
  
  async performLifecycleAction(farmId: string, action: string): Promise<any> {
    switch (action) {
      case 'start':
        return await farmManager.startFarm(farmId);
      case 'pause':
        return await farmManager.pauseFarm(farmId);
      case 'resume':
        return await farmManager.resumeFarm(farmId);
      case 'stop':
        return await farmManager.stopFarm(farmId);
      case 'restart':
        await farmManager.stopFarm(farmId);
        return await farmManager.startFarm(farmId);
      default:
        throw new Error(`Unknown lifecycle action: ${action}`);
    }
  }
  
  async getFarmHarvests(farmId: string, options: PaginationOptions): Promise<PaginatedResult<any>> {
    const harvests = await harvestService.getHarvestsByFarmId(farmId);
    
    // Apply pagination
    const offset = (options.page - 1) * options.limit;
    const paginatedHarvests = harvests.slice(offset, offset + options.limit);
    
    return {
      data: paginatedHarvests,
      total: harvests.length,
      hasMore: offset + options.limit < harvests.length
    };
  }
}

// Export singleton instance
export const farmOrchestrator = new FarmOrchestrator();