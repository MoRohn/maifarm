import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { Farm, FarmStatus, Agent, AgentStatus } from '../types/farm';
import { yamlParser } from './yamlParser';
import { agentManager } from './agentManager';
import { metricsCollector } from './metricsCollector';
import { db } from '../database/connection';
import * as yaml from 'js-yaml';

interface FarmCreateInput {
  name: string;
  description?: string;
  type: 'sequential' | 'collaborative' | 'autonomous';
  config: {
    maxAgents: number;
    autoScale: boolean;
    timeout?: number;
    yaml?: string;
  };
  userId: string;
  createdBy: string;
}

interface FarmUpdateInput {
  name?: string;
  description?: string;
  status?: FarmStatus;
  config?: Partial<FarmCreateInput['config']>;
}

class FarmManager extends EventEmitter {
  private farms: Map<string, Farm> = new Map();
  private userFarms: Map<string, Set<string>> = new Map();
  private farmPersistenceCache: Map<string, any> = new Map();
  private syncInterval: NodeJS.Timer | null = null;

  constructor() {
    super();
    this.initializeEventHandlers();
    this.startPeriodicSync();
    this.loadPersistedFarms();
  }

  private initializeEventHandlers() {
    // Listen for agent events
    agentManager.on('agent:statusChanged', (agentId: string, status: AgentStatus) => {
      this.handleAgentStatusChange(agentId, status);
    });

    agentManager.on('agent:taskCompleted', (agentId: string, taskId: string) => {
      this.handleAgentTaskCompleted(agentId, taskId);
    });
    
    // Listen for WebSocket events to update farm status
    if (typeof websocketManager !== 'undefined') {
      // Import websocketManager if available
      const { websocketManager } = require('../websocket/websocketManager');
      
      // Listen for tmux ready events
      websocketManager.on('farm:tmux:ready', (data: any) => {
        if (data.payload?.farmId) {
          this.updateFarmStatus(data.payload.farmId, 'running');
        }
      });
      
      // Listen for multi-claude status events
      websocketManager.on('multi-claude:status', (data: any) => {
        if (data.payload?.farmId && data.payload?.status) {
          this.updateFarmStatus(data.payload.farmId, data.payload.status);
        }
      });
    }
  }

  private async loadPersistedFarms() {
    try {
      console.log('[FarmManager] Loading persisted farms from database...');
      const result = await db.query('SELECT * FROM farms WHERE status != $1', ['deleted']);
      
      for (const row of result.rows) {
        const farm: Farm = {
          id: row.id,
          name: row.name,
          description: row.description,
          type: row.type || 'collaborative',
          status: row.status || 'idle',
          config: row.config || {},
          agents: [],
          metrics: row.metrics || this.getDefaultMetrics(),
          outputs: [],
          results: [],
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
        
        // Store in memory for fast access
        this.farms.set(farm.id, farm);
        
        // Track user farms
        if (!this.userFarms.has(farm.createdBy)) {
          this.userFarms.set(farm.createdBy, new Set());
        }
        this.userFarms.get(farm.createdBy)!.add(farm.id);
        
        console.log(`[FarmManager] Loaded farm ${farm.id} (${farm.name}) with status ${farm.status}`);
      }
      
      console.log(`[FarmManager] Loaded ${this.farms.size} farms from database`);
    } catch (error) {
      console.error('[FarmManager] Error loading persisted farms:', error);
    }
  }

  private startPeriodicSync() {
    // Sync in-memory state with database every 5 seconds
    this.syncInterval = setInterval(() => {
      this.syncWithDatabase();
    }, 5000);
  }

  private async syncWithDatabase() {
    try {
      // Sync any farms in cache that need persistence
      for (const [farmId, farmData] of this.farmPersistenceCache) {
        try {
          await db.query(
            `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET 
               status = EXCLUDED.status,
               config = EXCLUDED.config,
               metrics = EXCLUDED.metrics,
               updated_at = CURRENT_TIMESTAMP`,
            [
              farmData.id,
              farmData.name,
              farmData.description,
              farmData.status,
              farmData.config,
              farmData.metrics,
              farmData.tags || [],
              farmData.createdBy
            ]
          );
          
          // Remove from cache after successful persistence
          this.farmPersistenceCache.delete(farmId);
        } catch (error) {
          console.error(`[FarmManager] Error persisting farm ${farmId}:`, error);
        }
      }
    } catch (error) {
      console.error('[FarmManager] Error syncing with database:', error);
    }
  }

  public async initializeMockFarms() {
    // Add mock farms for development/testing
    if (process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true') {
      // Create mock farms with the IDs that the frontend is expecting
      const mockFarms = [
        {
          id: '5a5ef5e4-1c6a-45f6-a693-b81f1832be7d',
          name: 'wildflowers',
          description: 'Development test farm',
          type: 'collaborative' as const,
          status: 'running' as FarmStatus,
          config: {
            maxAgents: 3,
            autoScale: false,
            timeout: 3600,
            yaml: '',
            parsedYaml: {},
            processId: null
          },
          agents: [
            {
              id: 'agent-1',
              name: 'Agent 1',
              status: 'idle' as AgentStatus,
              tasks: [],
              metrics: {
                tasksCompleted: 0,
                tasksFailed: 0,
                averageResponseTime: 0
              }
            }
          ],
          metrics: {
            tasksCompleted: 0,
            tasksRunning: 0,
            tasksFailed: 0,
            averageTaskTime: 0,
            successRate: 100,
            resourceUtilization: 0
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'dev-user',
          createdBy: 'dev-user'
        },
        {
          id: '44eca127-0abd-4ce2-9355-c6abf75ca904',
          name: 'trump infoG',
          description: 'Test farm for harvest terminal',
          type: 'collaborative' as const,
          status: 'launching' as FarmStatus,
          config: {
            maxAgents: 3,
            autoScale: false,
            timeout: 3600,
            yaml: '',
            parsedYaml: {}
          },
          agents: [],
          metrics: {
            tasksCompleted: 0,
            tasksRunning: 0,
            tasksFailed: 0,
            averageTaskTime: 0,
            successRate: 100,
            resourceUtilization: 0
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'dev-user',
          createdBy: 'dev-user'
        }
      ];

      for (const farm of mockFarms) {
        this.farms.set(farm.id, farm as Farm);
        if (!this.userFarms.has(farm.userId)) {
          this.userFarms.set(farm.userId, new Set());
        }
        this.userFarms.get(farm.userId)!.add(farm.id);
        
        // Also add to database if using in-memory mode
        if (db.isInMemoryMode()) {
          console.log(`[FarmManager] Adding farm ${farm.id} to in-memory database`);
          db.query(
            `INSERT INTO farms (id, name, description, status, config, agents, metrics, tags, created_by, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              farm.id,
              farm.name,
              farm.description,
              farm.status,
              JSON.stringify(farm.config),
              JSON.stringify(farm.agents),
              JSON.stringify(farm.metrics),
              [],
              farm.createdBy,
              farm.createdAt,
              farm.updatedAt
            ]
          ).then(() => {
            console.log(`[FarmManager] Successfully added farm ${farm.id} to database`);
          }).catch(err => {
            console.error(`[FarmManager] Error inserting mock farm ${farm.id} to DB:`, err);
          });
        }
      }

      console.log(`[FarmManager] Initialized ${mockFarms.length} mock farm(s) for development`);
    }
  }

  async createFarm(input: FarmCreateInput): Promise<Farm> {
    const farmId = uuidv4();
    
    // Parse YAML if provided
    let parsedConfig = {};
    if (input.config.yaml) {
      try {
        // If YAML doesn't contain full config, just parse as agents config
        const yamlContent = input.config.yaml.trim();
        if (yamlContent.startsWith('agents:') || yamlContent.startsWith('- name:')) {
          parsedConfig = { agents: yaml.load(yamlContent).agents || yaml.load(yamlContent) };
        } else {
          parsedConfig = await yamlParser.parse(input.config.yaml);
        }
      } catch (error) {
        console.warn(`YAML parsing warning: ${error.message}, continuing without YAML config`);
        parsedConfig = {};
      }
    }

    const farm: Farm = {
      id: farmId,
      name: input.name,
      description: input.description || '',
      type: input.type,
      status: 'active', // Start with 'active' status for immediate availability
      config: {
        ...input.config,
        parsedYaml: parsedConfig
      },
      agents: [],
      metrics: this.getDefaultMetrics(),
      outputs: [],
      results: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: input.userId,
      createdBy: input.createdBy
    };

    // Store the farm in memory
    this.farms.set(farmId, farm);
    
    // Persist to database with proper fields
    try {
      await db.query(
        `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET 
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           config = EXCLUDED.config,
           metrics = EXCLUDED.metrics,
           updated_at = CURRENT_TIMESTAMP`,
        [
          farm.id,
          farm.name,
          farm.description,
          farm.status, // Will be 'active' initially
          farm.config,
          farm.metrics,
          [],  // tags
          farm.createdBy,
          farm.createdAt,
          farm.updatedAt
        ]
      );
      console.log(`[FarmManager] Farm ${farmId} created with status '${farm.status}' and persisted to database`);
    } catch (error) {
      console.error(`[FarmManager] Failed to persist new farm to database:`, error);
      // Add to persistence cache for retry
      this.farmPersistenceCache.set(farmId, farm);
    }
    
    // Add to user's farms
    if (!this.userFarms.has(input.userId)) {
      this.userFarms.set(input.userId, new Set());
    }
    this.userFarms.get(input.userId)!.add(farmId);

    // Initialize agents based on config
    if (parsedConfig.agents) {
      await this.initializeAgents(farm, parsedConfig.agents);
    }

    // Emit creation event
    this.emit('farm:created', farm);

    // Track metrics
    metricsCollector.incrementCounter('farms_created', { userId: input.userId });

    return farm;
  }

  async getUserFarms(userId: string): Promise<Farm[]> {
    const userFarmIds = this.userFarms.get(userId) || new Set();
    const farms: Farm[] = [];
    
    for (const farmId of userFarmIds) {
      const farm = this.farms.get(farmId);
      if (farm) {
        farms.push(farm);
      }
    }

    return farms.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getAllFarms(): Promise<Farm[]> {
    const farms: Farm[] = Array.from(this.farms.values());
    return farms.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getFarm(farmId: string, userId: string): Promise<Farm | null> {
    // First check in-memory cache
    let farm = this.farms.get(farmId);
    
    // If not in memory, try loading from database
    if (!farm) {
      try {
        const result = await db.query('SELECT * FROM farms WHERE id = $1', [farmId]);
        if (result.rows.length > 0) {
          const row = result.rows[0];
          farm = {
            id: row.id,
            name: row.name,
            description: row.description,
            type: row.type || 'collaborative',
            status: row.status || 'idle',
            config: row.config || {},
            agents: [],
            metrics: row.metrics || this.getDefaultMetrics(),
            outputs: [],
            results: [],
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            userId: row.created_by // Use created_by as userId for consistency
          };
          
          // Cache it for future access
          this.farms.set(farmId, farm);
          console.log(`[FarmManager] Loaded farm ${farmId} from database with status ${farm.status}`);
        }
      } catch (error) {
        console.error(`[FarmManager] Error loading farm ${farmId} from database:`, error);
      }
    }
    
    if (!farm) {
      console.log(`[FarmManager] Farm ${farmId} not found in memory or database`);
      return null;
    }

    // In development mode with auth bypass, allow any user to access any farm
    if (process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true') {
      return farm;
    }

    // In production, check ownership
    if (farm.userId !== userId && farm.createdBy !== userId) {
      console.log(`[FarmManager] Farm ${farmId} access denied for user ${userId}`);
      return null;
    }

    return farm;
  }

  async updateFarm(
    farmId: string, 
    userId: string, 
    updates: FarmUpdateInput
  ): Promise<Farm | null> {
    const farm = await this.getFarm(farmId, userId);
    
    if (!farm) {
      return null;
    }

    // Update farm properties
    if (updates.name !== undefined) farm.name = updates.name;
    if (updates.description !== undefined) farm.description = updates.description;
    if (updates.status !== undefined) farm.status = updates.status;
    if (updates.config) {
      farm.config = { ...farm.config, ...updates.config };
    }

    farm.updatedAt = new Date();

    // Emit update event
    this.emit('farm:updated', farm);

    return farm;
  }

  async deleteFarm(farmId: string, userId: string): Promise<boolean> {
    const farm = await this.getFarm(farmId, userId);
    
    if (!farm) {
      return false;
    }

    // Stop all agents first
    await this.stopFarm(farmId, userId);

    // Remove all agents associated with this farm
    const removedAgents = await agentManager.removeAgentsByFarmId(farmId);
    console.log(`[FarmManager] Removed ${removedAgents} agents from farm ${farmId}`);

    // Remove farm
    this.farms.delete(farmId);
    this.userFarms.get(userId)?.delete(farmId);

    // Emit deletion event with agent cleanup info
    this.emit('farm:deleted', { 
      id: farmId, 
      userId,
      agentsRemoved: removedAgents 
    });

    // Track metrics
    metricsCollector.incrementCounter('farms_deleted', { userId });
    metricsCollector.incrementCounter('agents_removed', { userId, count: removedAgents });

    return true;
  }

  async startFarm(farmId: string, userId: string): Promise<Farm | null> {
    const farm = await this.getFarm(farmId, userId);
    
    if (!farm) {
      return null;
    }

    if (farm.status === 'running') {
      return farm; // Already running
    }

    farm.status = 'running';
    farm.updatedAt = new Date();

    // Start all agents
    for (const agent of farm.agents) {
      await agentManager.startAgent(agent.id);
    }

    // Emit start event
    this.emit('farm:started', farm);

    // Track metrics
    metricsCollector.incrementCounter('farms_started', { userId });
    metricsCollector.setGauge('active_farms', this.getActiveFarmsCount(userId), { userId });

    return farm;
  }

  async stopFarm(farmId: string, userId: string): Promise<Farm | null> {
    const farm = await this.getFarm(farmId, userId);
    
    if (!farm) {
      return null;
    }

    if (farm.status === 'idle') {
      return farm; // Already stopped
    }

    farm.status = 'idle';
    farm.updatedAt = new Date();

    // Stop all agents
    for (const agent of farm.agents) {
      await agentManager.stopAgent(agent.id);
    }

    // Emit stop event
    this.emit('farm:stopped', farm);

    // Track metrics
    metricsCollector.incrementCounter('farms_stopped', { userId });
    metricsCollector.setGauge('active_farms', this.getActiveFarmsCount(userId), { userId });

    return farm;
  }

  async getActiveFarmsCount(userId: string): Promise<number> {
    const farms = await this.getUserFarms(userId);
    return farms.filter(f => f.status === 'running').length;
  }

  async getTotalAgentsCount(userId: string): Promise<number> {
    const farms = await this.getUserFarms(userId);
    return farms.reduce((total, farm) => total + farm.agents.length, 0);
  }

  private async initializeAgents(farm: Farm, agentConfigs: any[]): Promise<void> {
    for (const config of agentConfigs) {
      const agent = await agentManager.createAgent({
        name: config.name,
        type: config.type || 'general',
        capabilities: config.capabilities || [],
        farmId: farm.id,
        config: config
      });

      farm.agents.push(agent);
    }
  }

  private handleAgentStatusChange(agentId: string, status: AgentStatus) {
    // Find the farm containing this agent
    for (const farm of this.farms.values()) {
      const agent = farm.agents.find(a => a.id === agentId);
      if (agent) {
        agent.status = status;
        farm.updatedAt = new Date();
        
        // Update farm metrics
        this.updateFarmMetrics(farm);
        
        // Emit update event
        this.emit('farm:agentStatusChanged', { farm, agentId, status });
        break;
      }
    }
  }

  private handleAgentTaskCompleted(agentId: string, taskId: string) {
    // Find the farm containing this agent
    for (const farm of this.farms.values()) {
      const agent = farm.agents.find(a => a.id === agentId);
      if (agent) {
        farm.metrics.tasksCompleted++;
        farm.updatedAt = new Date();
        
        // Update success rate
        this.updateFarmMetrics(farm);
        
        // Emit update event
        this.emit('farm:taskCompleted', { farm, agentId, taskId });
        break;
      }
    }
  }

  private getDefaultMetrics() {
    return {
      tasksCompleted: 0,
      tasksRunning: 0,
      tasksFailed: 0,
      averageTaskTime: 0,
      successRate: 100,
      resourceUtilization: 0,
      totalAgents: 0,
      activeAgents: 0,
      queuedTasks: 0,
      avgCompletionTime: 0,
      efficiency: 0,
      resourceUsage: {
        cpu: 0,
        memory: 0,
        network: 0
      },
      collaborationScore: 0
    };
  }

  private updateFarmMetrics(farm: Farm) {
    // Count agent statuses
    const activeAgents = farm.agents.filter(a => a.status === 'running').length;
    const idleAgents = farm.agents.filter(a => a.status === 'idle').length;
    
    // Update resource utilization
    farm.metrics.resourceUtilization = farm.agents.length > 0 
      ? (activeAgents / farm.agents.length) * 100 
      : 0;

    // Update running tasks count
    farm.metrics.tasksRunning = farm.agents
      .filter(a => a.status === 'running')
      .length;

    // Calculate success rate
    const totalTasks = farm.metrics.tasksCompleted + farm.metrics.tasksFailed;
    farm.metrics.successRate = totalTasks > 0
      ? (farm.metrics.tasksCompleted / totalTasks) * 100
      : 100;
  }

  async updateFarmStatus(farmId: string, status: FarmStatus): Promise<Farm | null> {
    const farm = this.farms.get(farmId);
    if (!farm) {
      return null;
    }
    
    // Update in-memory state first
    farm.status = status;
    farm.updatedAt = new Date();
    
    // Persist to database
    try {
      await db.query(
        `UPDATE farms 
         SET status = $1, updated_at = $2 
         WHERE id = $3`,
        [status, farm.updatedAt, farmId]
      );
      
      console.log(`[FarmManager] Farm ${farmId} status updated to ${status} and persisted`);
    } catch (error) {
      // Log error but don't fail - in-memory state is already updated
      console.error(`[FarmManager] Failed to persist farm status to database:`, error);
      
      // In development mode, this is expected if using in-memory DB
      if (process.env.NODE_ENV !== 'development' && process.env.BYPASS_AUTH !== 'true') {
        // In production, we should be more concerned about persistence failures
        console.error(`[FarmManager] CRITICAL: Farm ${farmId} status ${status} not persisted!`);
      }
    }
    
    // Emit status change event
    this.emit('farm:statusChanged', farm);
    
    // Track metrics
    metricsCollector.updateFarmStatus(farmId, status);
    
    return farm;
  }

  // Utility method for testing
  async clearAllFarms(): Promise<void> {
    this.farms.clear();
    this.userFarms.clear();
  }
}

// Export singleton instance
export const farmManager = new FarmManager();