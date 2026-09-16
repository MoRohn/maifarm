import { farmManager } from '../../services/unified/farmService.js';
import { agentManager } from '../../services/unified/farmService.js';
import { harvestService } from '../../services/unified/farmService.js';
import { metricsService } from '../../services/metricsService.js';
import { taskQueueService } from '../../services/unified/quickTaskService.js';
import { EventEmitter } from 'events';
import { aiProviderManager, AIProvider } from '../../config/aiProviders.js';
import { FarmMode } from '../../types/farm.js';
import type { FarmConfig } from '../../services/unified/farmService.js';

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
    const farmConfig = this.buildFarmConfig(data);

    const launchResult = await farmManager.createFarm(farmConfig);
    if (!launchResult.success) {
      throw new Error(launchResult.error || 'Failed to create farm');
    }

    const farm = await farmManager.getFarm(launchResult.farmId, farmConfig.userId || 'system');

    return farm ?? {
      id: launchResult.farmId,
      name: farmConfig.name,
      description: farmConfig.description,
      provider: farmConfig.provider,
      status: 'launching'
    };
  }

  private buildFarmConfig(data: any): FarmConfig {
    const provider = this.normalizeProvider(data.provider);
    const mode = this.normalizeMode(data.mode ?? data.type);
    const baseConfig = this.normalizeConfigObject(data.config);
    const numberOfAgents = this.normalizeAgentCount(data, baseConfig, mode);
    const prompt = this.normalizePrompt(data, baseConfig, numberOfAgents);
    const yamlContent = this.normalizeYamlContent(data, baseConfig);
    const timeout = this.normalizeTimeout(data, baseConfig);
    const contextFiles = this.normalizeStringArray(data.contextFiles ?? baseConfig.contextFiles ?? baseConfig.attachedFiles);
    const barnReferences = this.normalizeStringArray(data.barnReferences ?? baseConfig.barnReferences);
    const attachedFiles = this.normalizeStringArray(baseConfig.attachedFiles);
    const orchestratorType = this.normalizeOrchestratorType(data.orchestratorType);

    return {
      name: data.name,
      description: data.description ?? '',
      mode,
      provider,
      numberOfAgents,
      prompt,
      yamlContent,
      timeout,
      contextFiles: contextFiles ?? undefined,
      attachedFiles: attachedFiles ?? undefined,
      barnReferences: barnReferences ?? undefined,
      staggerDelay: typeof baseConfig.staggerDelay === 'number' ? baseConfig.staggerDelay : undefined,
      userId: data.userId || data.createdBy,
      farmerTemplateId: data.farmerTemplateId,
      farmerTemplateName: data.farmerTemplateName,
      orchestratorType,
      autoScale: typeof baseConfig.autoScale === 'boolean' ? baseConfig.autoScale : undefined,
      goWildMode: baseConfig.goWildMode,
      retryPolicy: baseConfig.retryPolicy
    } as FarmConfig;
  }

  private normalizeConfigObject(config: any): Record<string, any> {
    if (!config) return {};
    if (typeof config === 'string') {
      return { yaml: config };
    }
    if (typeof config === 'object') {
      return config;
    }
    return {};
  }

  private normalizeProvider(raw?: string): AIProvider {
    const requested = (raw || '').toLowerCase().replace('_', '-') as AIProvider;
    const allowed = new Set<AIProvider>([
      AIProvider.CLAUDE,
      AIProvider.OPENAI,
      AIProvider.GPT_OSS,
      AIProvider.LLAMA
    ]);

    if (allowed.has(requested) && aiProviderManager.isProviderEnabled(requested)) {
      return requested;
    }

    const defaultProvider = aiProviderManager.getDefaultProvider();
    return aiProviderManager.isProviderEnabled(defaultProvider) ? defaultProvider : AIProvider.CLAUDE;
  }

  private normalizeMode(raw?: string): FarmMode {
    const value = (raw || '').toLowerCase();
    switch (value) {
      case 'sequential':
        return FarmMode.SEQUENTIAL;
      case 'autonomous':
        return FarmMode.AUTONOMOUS;
      case 'quick-task':
      case 'quick_task':
      case 'quicktask':
        return FarmMode.QUICK_TASK;
      case 'gowild':
      case 'go_wild':
      case 'go-wild':
        return FarmMode.GO_WILD;
      case 'collaborative':
      default:
        return FarmMode.COLLABORATIVE;
    }
  }

  private normalizeAgentCount(data: any, config: Record<string, any>, mode: FarmMode): number {
    const candidates = [
      data.agentCount,
      data.numberOfAgents,
      config.numberOfAgents,
      config.maxAgents
    ];

    let count = candidates.find((value) => typeof value === 'number' && !Number.isNaN(value)) as number | undefined;
    count = Math.max(1, Math.min(20, Math.floor(count ?? 3)));

    if (mode === FarmMode.GO_WILD && count < 2) {
      return 2;
    }

    if (mode === FarmMode.QUICK_TASK) {
      return 2;
    }

    return count;
  }

  private normalizePrompt(data: any, config: Record<string, any>, agentCount: number): string {
    const promptCandidates = [
      data.prompt,
      config.prompt,
      data.description
    ];

    const prompt = promptCandidates.find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;

    if (prompt && prompt.trim().length > 0) {
      return prompt.trim();
    }

    const safeName = typeof data.name === 'string' ? data.name.trim() : 'MaiFarm Project';
    return `Coordinate ${agentCount} agents to accomplish the goals for ${safeName}.`;
  }

  private normalizeYamlContent(data: any, config: Record<string, any>): string | undefined {
    if (typeof config.yaml === 'string' && config.yaml.trim().length > 0) {
      return config.yaml;
    }
    if (typeof data.yaml === 'string' && data.yaml.trim().length > 0) {
      return data.yaml;
    }
    if (typeof data.yamlContent === 'string' && data.yamlContent.trim().length > 0) {
      return data.yamlContent;
    }
    if (typeof data.config === 'string' && data.config.trim().length > 0) {
      return data.config;
    }
    return undefined;
  }

  private normalizeTimeout(data: any, config: Record<string, any>): number | undefined {
    const timeoutSeconds =
      (typeof config.timeout === 'number' && config.timeout > 0 ? config.timeout : undefined) ??
      (typeof data.timeout === 'number' && data.timeout > 0 ? data.timeout : undefined);

    if (typeof config.timeoutMinutes === 'number' && config.timeoutMinutes > 0) {
      return config.timeoutMinutes * 60;
    }
    if (typeof data.timeoutMinutes === 'number' && data.timeoutMinutes > 0) {
      return data.timeoutMinutes * 60;
    }
    return timeoutSeconds;
  }

  private normalizeStringArray(value: unknown): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item : undefined))
        .filter((item): item is string => !!item);
    }
    return undefined;
  }

  private normalizeOrchestratorType(raw?: string): 'maifarm' | 'xenosync' {
    const value = (raw || '').toLowerCase();
    return value === 'xenosync' ? 'xenosync' : 'maifarm';
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
