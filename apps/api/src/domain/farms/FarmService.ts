import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection';
import { websocketManager } from '../../websocket/websocketManager';
import { logger } from '../../utils/logger';
import { tmuxSessionManager } from '../agents/TmuxSessionManager';
import { harvestService } from '../harvests/HarvestService';
import { pathConfig } from '../../config/paths';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface Farm {
  id: string;
  name: string;
  description: string;
  status: FarmStatus;
  agents: Agent[];
  config: FarmConfig;
  metrics: FarmMetrics;
  tags: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  processId?: string;
  harvestId?: string;
}

export interface Agent {
  id: string;
  farmId: string;
  name: string;
  type: 'primary' | 'secondary' | 'specialized';
  status: 'idle' | 'active' | 'processing' | 'error' | 'terminated';
  capabilities: string[];
  resources: {
    cpu: number;
    memory: number;
  };
  metrics: any;
  lastHeartbeat: Date;
}

export interface FarmConfig {
  maxAgents: number;
  resourceLimits: {
    totalCpu: number;
    totalMemory: number;
  };
  orchestrationStrategy: string;
  autoScale: boolean;
  prompt: string;
  timeout: number;
  provider: 'claude' | 'openai' | 'qwen' | 'gpt_oss';
  yaml?: string;
  attachmentPaths?: string[];
}

export interface FarmMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  queuedTasks: number;
  avgCompletionTime: number;
  efficiency: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
  };
}

export type FarmStatus = 'idle' | 'preparing' | 'launching' | 'running' | 'active' | 
                        'paused' | 'stopping' | 'stopped' | 'completed' | 'failed' | 
                        'harvesting' | 'deleted';

interface CreateFarmOptions {
  name: string;
  description?: string;
  type?: 'sequential' | 'collaborative' | 'autonomous';
  provider?: 'claude' | 'openai' | 'qwen' | 'gpt_oss';
  config?: Partial<FarmConfig>;
  userId: string | null;
  createdBy?: string | null;
  tags?: string[];
}

/**
 * Unified Farm Service - Consolidates all farm-related operations
 * Replaces: farmManager, farmLauncher, farmLifecycleManager, enhancedFarmLifecycle, farmHarvestIntegration
 */
export class FarmService extends EventEmitter {
  private static instance: FarmService;
  private activeFarms: Map<string, Farm> = new Map();
  private farmTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEFAULT_TIMEOUT = 3600; // 1 hour in seconds

  private constructor() {
    super();
    this.initializeEventHandlers();
    this.startLifecycleMonitoring();
  }

  static getInstance(): FarmService {
    if (!FarmService.instance) {
      FarmService.instance = new FarmService();
    }
    return FarmService.instance;
  }

  private initializeEventHandlers(): void {
    // Listen for tmux session events
    tmuxSessionManager.on('session:lost', this.handleSessionLost.bind(this));
    tmuxSessionManager.on('session:degraded', this.handleSessionDegraded.bind(this));
  }

  /**
   * Create a new farm
   */
  async createFarm(options: CreateFarmOptions): Promise<Farm> {
    const farmId = uuidv4();
    
    try {
      const defaultConfig: FarmConfig = {
        maxAgents: options.config?.maxAgents || 8,
        resourceLimits: options.config?.resourceLimits || {
          totalCpu: 8,
          totalMemory: 16384
        },
        orchestrationStrategy: options.config?.orchestrationStrategy || 'round-robin',
        autoScale: options.config?.autoScale || false,
        prompt: options.config?.prompt || options.description || `Complete tasks for ${options.name}`,
        timeout: options.config?.timeout || this.DEFAULT_TIMEOUT,
        provider: options.provider || 'claude',
        yaml: options.config?.yaml,
        attachmentPaths: options.config?.attachmentPaths
      };

      const defaultMetrics: FarmMetrics = {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        queuedTasks: 0,
        avgCompletionTime: 0,
        efficiency: 0,
        resourceUtilization: {
          cpu: 0,
          memory: 0
        }
      };

      // Insert into database
      await db.query(
        `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          farmId,
          options.name,
          options.description || '',
          'preparing',
          JSON.stringify(defaultConfig),
          JSON.stringify(defaultMetrics),
          options.tags || [],
          options.userId || options.createdBy,
          new Date(),
          new Date()
        ]
      );

      const farm: Farm = {
        id: farmId,
        name: options.name,
        description: options.description || '',
        status: 'preparing',
        agents: [],
        config: defaultConfig,
        metrics: defaultMetrics,
        tags: options.tags || [],
        createdBy: options.userId || options.createdBy || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Cache the farm
      this.activeFarms.set(farmId, farm);

      // Create workspace
      await this.createWorkspace(farmId);

      // Emit events
      this.emit('farm:created', farm);
      websocketManager.broadcast('farm:created', { farm });

      logger.info(`[FarmService] Created farm ${farmId} (${options.name})`);
      return farm;

    } catch (error) {
      logger.error('[FarmService] Failed to create farm:', error);
      throw error;
    }
  }

  /**
   * Launch a farm with agents
   */
  async launchFarm(farmId: string, numberOfAgents: number = 3): Promise<void> {
    const farm = await this.getFarm(farmId);
    if (!farm) {
      throw new Error(`Farm ${farmId} not found`);
    }

    try {
      // Update status to launching
      await this.updateFarmStatus(farmId, 'launching');

      // Create tmux session
      const sessionName = await tmuxSessionManager.createSession(farmId, numberOfAgents);
      
      // Create agents
      const agents = await this.createAgents(farmId, numberOfAgents);
      farm.agents = agents;

      // Start harvest
      const harvest = await harvestService.startHarvest(farmId, farm.name, farm.createdBy || 'system');
      farm.harvestId = harvest.id;

      // Set up timeout if configured
      if (farm.config.timeout > 0) {
        this.scheduleTimeout(farmId, farm.config.timeout);
      }

      // Update status to running
      await this.updateFarmStatus(farmId, 'running');

      // Update cache
      this.activeFarms.set(farmId, farm);

      // Emit events
      this.emit('farm:launched', { farmId, sessionName, numberOfAgents });
      websocketManager.broadcast('farm:launched', {
        farmId,
        farmName: farm.name,
        status: 'running',
        numberOfAgents,
        sessionName
      });

      logger.info(`[FarmService] Launched farm ${farmId} with ${numberOfAgents} agents`);

    } catch (error) {
      logger.error('[FarmService] Failed to launch farm:', error);
      await this.updateFarmStatus(farmId, 'failed');
      throw error;
    }
  }

  /**
   * Stop a farm
   */
  async stopFarm(farmId: string, graceful: boolean = true): Promise<void> {
    const farm = await this.getFarm(farmId);
    if (!farm) {
      throw new Error(`Farm ${farmId} not found`);
    }

    try {
      // Cancel timeout if exists
      this.cancelTimeout(farmId);

      // Update status
      await this.updateFarmStatus(farmId, 'stopping');

      if (graceful && farm.harvestId) {
        // Collect files before stopping
        await harvestService.collectFiles(farmId, farm.harvestId);
        await harvestService.completeHarvest(farm.harvestId);
      }

      // Clean up tmux sessions
      await tmuxSessionManager.cleanupFarmSessions(farmId);

      // Update agents status
      await db.query(
        'UPDATE agents SET status = $1 WHERE farm_id = $2',
        ['terminated', farmId]
      );

      // Update farm status
      await this.updateFarmStatus(farmId, 'stopped');

      // Remove from cache
      this.activeFarms.delete(farmId);

      // Emit events
      this.emit('farm:stopped', { farmId });
      websocketManager.broadcast('farm:stopped', { farmId, farmName: farm.name });

      logger.info(`[FarmService] Stopped farm ${farmId}`);

    } catch (error) {
      logger.error('[FarmService] Failed to stop farm:', error);
      throw error;
    }
  }

  /**
   * Update farm status
   */
  async updateFarmStatus(farmId: string, status: FarmStatus): Promise<void> {
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      [status, new Date(), farmId]
    );

    const farm = this.activeFarms.get(farmId);
    if (farm) {
      farm.status = status;
      farm.updatedAt = new Date();
    }

    websocketManager.broadcast('farm:status', { farmId, status });
  }

  /**
   * Get farm by ID
   */
  async getFarm(farmId: string): Promise<Farm | null> {
    // Check cache first
    if (this.activeFarms.has(farmId)) {
      return this.activeFarms.get(farmId)!;
    }

    // Load from database
    try {
      const result = await db.query('SELECT * FROM farms WHERE id = $1', [farmId]);
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      
      // Get agents
      const agentsResult = await db.query('SELECT * FROM agents WHERE farm_id = $1', [farmId]);
      
      const farm: Farm = {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        agents: agentsResult.rows.map(a => ({
          id: a.id,
          farmId: a.farm_id,
          name: a.name,
          type: a.type,
          status: a.status,
          capabilities: a.capabilities || [],
          resources: a.resources || { cpu: 0, memory: 0 },
          metrics: a.metrics || {},
          lastHeartbeat: a.last_heartbeat
        })),
        config: row.config,
        metrics: row.metrics,
        tags: row.tags || [],
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        processId: row.config?.processId,
        harvestId: row.config?.harvestId
      };

      // Cache if active
      if (['launching', 'running', 'active'].includes(farm.status)) {
        this.activeFarms.set(farmId, farm);
      }

      return farm;

    } catch (error) {
      logger.error('[FarmService] Failed to get farm:', error);
      return null;
    }
  }

  /**
   * Get all farms
   */
  async getAllFarms(filters?: { status?: FarmStatus; userId?: string }): Promise<Farm[]> {
    try {
      let query = 'SELECT * FROM farms WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (filters?.status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(filters.status);
      }

      if (filters?.userId) {
        query += ` AND created_by = $${paramIndex++}`;
        params.push(filters.userId);
      }

      query += ' ORDER BY created_at DESC';

      const result = await db.query(query, params);
      
      const farms: Farm[] = [];
      for (const row of result.rows) {
        const farm = await this.getFarm(row.id);
        if (farm) {
          farms.push(farm);
        }
      }

      return farms;

    } catch (error) {
      logger.error('[FarmService] Failed to get all farms:', error);
      return [];
    }
  }

  /**
   * Delete a farm
   */
  async deleteFarm(farmId: string): Promise<boolean> {
    try {
      // Stop farm if running
      const farm = await this.getFarm(farmId);
      if (farm && ['running', 'active', 'launching'].includes(farm.status)) {
        await this.stopFarm(farmId);
      }

      // Delete from database (cascade will delete agents)
      await db.query('DELETE FROM farms WHERE id = $1', [farmId]);

      // Clean up workspace
      await this.deleteWorkspace(farmId);

      // Remove from cache
      this.activeFarms.delete(farmId);
      this.cancelTimeout(farmId);

      logger.info(`[FarmService] Deleted farm ${farmId}`);
      return true;

    } catch (error) {
      logger.error('[FarmService] Failed to delete farm:', error);
      return false;
    }
  }

  /**
   * Graceful shutdown of a farm
   */
  async gracefulShutdown(farmId: string, reason: 'timeout' | 'user_request' | 'completion'): Promise<void> {
    logger.info(`[FarmService] Initiating graceful shutdown for farm ${farmId} (reason: ${reason})`);
    
    const farm = await this.getFarm(farmId);
    if (!farm) {
      logger.warn(`[FarmService] Farm ${farmId} not found for graceful shutdown`);
      return;
    }

    try {
      // Update status
      await this.updateFarmStatus(farmId, 'harvesting');

      // Notify agents to wrap up
      websocketManager.broadcast('farm:graceful_shutdown_started', {
        farmId,
        reason,
        timestamp: new Date()
      });

      // Wait for agents to finish (max 30 seconds)
      await this.delay(30000);

      // Collect harvest
      if (farm.harvestId) {
        const collectionResult = await harvestService.collectFiles(farmId, farm.harvestId);
        if (collectionResult.success) {
          await harvestService.completeHarvest(farm.harvestId);
        }
      }

      // Stop the farm
      await this.stopFarm(farmId, false);

      logger.info(`[FarmService] Graceful shutdown completed for farm ${farmId}`);

    } catch (error) {
      logger.error('[FarmService] Graceful shutdown failed:', error);
      // Force stop on failure
      await this.stopFarm(farmId, false);
    }
  }

  // Helper methods

  private async createWorkspace(farmId: string): Promise<void> {
    const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
    await fs.mkdir(workspacePath, { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'docs'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, '.agents'), { recursive: true });
  }

  private async deleteWorkspace(farmId: string): Promise<void> {
    const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`[FarmService] Could not delete workspace: ${error}`);
    }
  }

  private async createAgents(farmId: string, count: number): Promise<Agent[]> {
    const agents: Agent[] = [];
    
    for (let i = 0; i < count; i++) {
      const agentId = uuidv4();
      const agent: Agent = {
        id: agentId,
        farmId,
        name: `Agent ${i + 1}`,
        type: i === 0 ? 'primary' : 'secondary',
        status: 'idle',
        capabilities: ['processing', 'analysis'],
        resources: { cpu: 1, memory: 1024 },
        metrics: {},
        lastHeartbeat: new Date()
      };

      await db.query(
        `INSERT INTO agents (id, farm_id, name, type, status, capabilities, resources, metrics, last_heartbeat)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          agentId, farmId, agent.name, agent.type, agent.status,
          agent.capabilities, JSON.stringify(agent.resources),
          JSON.stringify(agent.metrics), agent.lastHeartbeat
        ]
      );

      agents.push(agent);
    }

    return agents;
  }

  private scheduleTimeout(farmId: string, timeoutSeconds: number): void {
    this.cancelTimeout(farmId); // Cancel any existing timeout
    
    const timeoutMs = timeoutSeconds * 1000;
    const timeout = setTimeout(() => {
      logger.info(`[FarmService] Timeout reached for farm ${farmId}`);
      this.gracefulShutdown(farmId, 'timeout').catch(error => {
        logger.error(`[FarmService] Failed to shutdown farm ${farmId} on timeout:`, error);
      });
    }, timeoutMs);

    this.farmTimeouts.set(farmId, timeout);
    logger.info(`[FarmService] Scheduled timeout for farm ${farmId} in ${timeoutSeconds} seconds`);
  }

  private cancelTimeout(farmId: string): void {
    const timeout = this.farmTimeouts.get(farmId);
    if (timeout) {
      clearTimeout(timeout);
      this.farmTimeouts.delete(farmId);
      logger.info(`[FarmService] Cancelled timeout for farm ${farmId}`);
    }
  }

  private handleSessionLost(data: { sessionName: string; farmId: string }): void {
    logger.warn(`[FarmService] Session lost for farm ${data.farmId}`);
    this.updateFarmStatus(data.farmId, 'failed').catch(error => {
      logger.error('[FarmService] Failed to update farm status after session loss:', error);
    });
  }

  private handleSessionDegraded(data: any): void {
    logger.warn(`[FarmService] Session degraded:`, data);
    // Could implement recovery logic here
  }

  private startLifecycleMonitoring(): void {
    setInterval(async () => {
      // Check for stale farms
      for (const [farmId, farm] of this.activeFarms.entries()) {
        const ageMs = Date.now() - farm.updatedAt.getTime();
        const maxAgeMs = (farm.config.timeout || this.DEFAULT_TIMEOUT) * 1000;
        
        if (ageMs > maxAgeMs && ['running', 'active'].includes(farm.status)) {
          logger.warn(`[FarmService] Farm ${farmId} exceeded max age, shutting down`);
          await this.gracefulShutdown(farmId, 'timeout');
        }
      }
    }, 60000); // Check every minute
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get active farms
   */
  getActiveFarms(): Farm[] {
    return Array.from(this.activeFarms.values());
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.activeFarms.clear();
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    // Stop all active farms
    const farms = this.getActiveFarms();
    for (const farm of farms) {
      await this.stopFarm(farm.id, true);
    }

    // Clear all timeouts
    this.farmTimeouts.forEach(timeout => clearTimeout(timeout));
    this.farmTimeouts.clear();

    // Clear cache
    this.clearCache();
    
    this.removeAllListeners();
  }
}

// Export singleton instance
export const farmService = FarmService.getInstance();