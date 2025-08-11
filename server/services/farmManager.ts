import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { Farm, FarmStatus, Agent, AgentStatus } from '../types/farm';
import { yamlParser } from './yamlParser';
import { agentManager } from './agentManager';
import { metricsCollector } from './metricsCollector';
import { db } from '../database/connection';
import * as yaml from 'js-yaml';
import { shutdownCoordinator } from './shutdownCoordinator';
import { calculateGracefulShutdownTime, getGracePeriod, GRACEFUL_SHUTDOWN_PERIOD } from '../constants/timing';
import { workspaceManager } from './workspaceManager';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

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
  farmerTemplateId?: string;
  farmerTemplateName?: string;
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
  private farmTimeouts: Map<string, NodeJS.Timeout> = new Map();

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
    // Sync in-memory state with database every 2 seconds for better persistence
    this.syncInterval = setInterval(() => {
      this.syncWithDatabase();
    }, 2000);
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
    // Parse YAML first to check for farm_id in metadata
    let parsedConfig = {};
    let farmId = uuidv4(); // Default to new ID
    
    // Extract attached files from config if present
    const attachedFiles = (input.config as any)?.attachedFiles || [];
    
    if (input.config.yaml) {
      try {
        // If YAML doesn't contain full config, just parse as agents config
        const yamlContent = input.config.yaml.trim();
        if (yamlContent.startsWith('agents:') || yamlContent.startsWith('- name:')) {
          parsedConfig = { agents: yaml.load(yamlContent).agents || yaml.load(yamlContent) };
        } else {
          parsedConfig = await yamlParser.parse(input.config.yaml);
          
          // Check if YAML metadata contains a farm_id
          if (parsedConfig.metadata?.farm_id) {
            farmId = parsedConfig.metadata.farm_id;
            console.log(`[FarmManager] Using farm ID from YAML metadata: ${farmId}`);
          }
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
        parsedYaml: parsedConfig,
        persistInBackground: input.config.persistInBackground !== false // Default to true for persistence
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

    // Create workspace for the farm
    try {
      const workspaceInfo = await workspaceManager.createFarmWorkspace(farmId, {
        template: input.type === 'autonomous' ? 'advanced' : 'default',
        initFiles: true
      });
      console.log(`[FarmManager] Created workspace for farm ${farmId} at: ${workspaceInfo.path}`);
      
      // Copy attached files to workspace if any
      if (attachedFiles.length > 0) {
        const attachmentsDir = path.join(workspaceInfo.path, 'attachments');
        await fs.mkdir(attachmentsDir, { recursive: true });
        
        const copiedFiles: string[] = [];
        for (const file of attachedFiles) {
          if (file.path && file.filename) {
            const destPath = path.join(attachmentsDir, file.originalName || file.filename);
            try {
              await fs.copyFile(file.path, destPath);
              copiedFiles.push(destPath);
              logger.info(`[FarmManager] Copied attachment ${file.originalName} to workspace`);
            } catch (error) {
              logger.error(`[FarmManager] Failed to copy attachment ${file.originalName}:`, error);
            }
          }
        }
        
        // Add attachment paths to config for agent reference
        (input.config as any).attachmentPaths = copiedFiles;
      }
      
      // Add workspace path to farm config for reference
      farm.config.workspacePath = workspaceInfo.path;
    } catch (workspaceError) {
      console.error(`[FarmManager] Failed to create workspace for farm ${farmId}:`, workspaceError);
      // Continue farm creation even if workspace creation fails
      // The harvest collector will create a basic workspace if needed
    }
    
    // Store the farm in memory
    this.farms.set(farmId, farm);
    
    // Persist to database with proper fields
    try {
      await db.query(
        `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_by, farmer_template_id, farmer_template_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET 
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           config = EXCLUDED.config,
           metrics = EXCLUDED.metrics,
           farmer_template_id = EXCLUDED.farmer_template_id,
           farmer_template_name = EXCLUDED.farmer_template_name,
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
          input.farmerTemplateId || null,
          input.farmerTemplateName || null,
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

  async persistFarmToDatabase(farm: Farm): Promise<void> {
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
          farm.status,
          JSON.stringify(farm.config),
          JSON.stringify(farm.metrics),
          [],
          farm.createdBy,
          farm.createdAt,
          farm.updatedAt
        ]
      );
      console.log(`[FarmManager] Farm ${farm.id} persisted to database`);
    } catch (error) {
      console.error(`[FarmManager] Failed to persist farm ${farm.id}:`, error);
      throw error;
    }
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
    
    // Archive the farm workspace
    try {
      const archivedPath = await workspaceManager.archiveFarmWorkspace(farmId);
      console.log(`[FarmManager] Archived workspace for farm ${farmId} to: ${archivedPath}`);
    } catch (archiveError) {
      console.error(`[FarmManager] Failed to archive workspace for farm ${farmId}:`, archiveError);
      // Continue with deletion even if archival fails
    }

    // IMPORTANT: Harvests are preserved when farms are deleted
    // The harvests table has ON DELETE SET NULL for farm_id
    console.log(`[FarmManager] Deleting farm ${farmId} - associated harvests will be preserved`);
    
    // Mark farm as deleted in database (soft delete)
    try {
      await db.query(
        `UPDATE farms SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [farmId]
      );
      console.log(`[FarmManager] Farm ${farmId} marked as deleted in database`);
    } catch (error) {
      console.error(`[FarmManager] Failed to mark farm as deleted in database:`, error);
    }

    // Remove from memory
    this.farms.delete(farmId);
    this.userFarms.get(userId)?.delete(farmId);

    // Emit deletion event with agent cleanup info
    this.emit('farm:deleted', { 
      id: farmId, 
      userId,
      agentsRemoved: removedAgents,
      harvestsPreserved: true // Signal that harvests are preserved
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

    // Set timeout if configured - now using shutdown coordinator
    if (farm.config?.timeout && farm.config.timeout > 0) {
      const timeoutMs = farm.config.timeout * 1000; // Convert seconds to milliseconds
      console.log(`[FarmManager] Setting ${farm.config.timeout} second timeout for farm ${farmId}`);
      
      // Use shutdown coordinator to schedule graceful shutdown 30s before timeout
      shutdownCoordinator.scheduleShutdown({
        mode: 'farm',
        farmId: farmId,
        userId: userId,
        reason: 'timeout',
        timeout: farm.config.timeout, // Pass timeout in seconds (coordinator converts to ms)
        harvestId: farm.harvestId
      });
      
      const gracefulShutdownTime = calculateGracefulShutdownTime(timeoutMs);
      console.log(`[FarmManager] Scheduled graceful shutdown at ${gracefulShutdownTime / 1000}s (30s before ${farm.config.timeout}s timeout)`);
      
      // Also set a final timeout as a failsafe
      const timeoutHandle = setTimeout(async () => {
        console.log(`[FarmManager] Final timeout reached for farm ${farmId}`);
        this.farmTimeouts.delete(farmId);
        
        // Emit timeout event
        this.emit('farm:timeout', { farmId, timeout: farm.config.timeout });
      }, timeoutMs);
      
      this.farmTimeouts.set(farmId, timeoutHandle);
    }

    // Emit start event
    this.emit('farm:started', farm);

    // Track metrics
    metricsCollector.incrementCounter('farms_started', { userId });
    metricsCollector.setGauge('active_farms', this.getActiveFarmsCount(userId), { userId });

    return farm;
  }

  async gracefulShutdownFarm(farmId: string, userId: string, reason: 'timeout' | 'user_request' | 'completion' = 'completion'): Promise<Farm | null> {
    const farm = await this.getFarm(farmId, userId);
    
    if (!farm) {
      return null;
    }

    if (farm.status === 'idle' || farm.status === 'stopped') {
      return farm; // Already stopped
    }

    console.log(`[FarmManager] Initiating graceful shutdown for farm ${farmId} (reason: ${reason})`);
    
    // Set farm to harvesting status
    farm.status = 'harvesting';
    farm.updatedAt = new Date();
    
    // Emit graceful shutdown event
    this.emit('farm:graceful_shutdown_started', { farm, reason });

    try {
      // Import services dynamically to avoid circular dependencies
      const { harvestService } = await import('./harvestService');
      const { orchestratorService } = await import('./OrchestratorService');
      
      // Send closing prompt to all Claude agents to collect their work
      const closingPrompt = this.generateClosingPrompt(reason, farmId);
      
      // Get the current farm process from orchestratorService
      const farmStatus = await orchestratorService.getStatus(farmId);
      
      if (farmStatus.isRunning && farmStatus.agents.length > 0) {
        console.log(`[FarmManager] Sending closing prompt to ${farmStatus.agents.length} agents`);
        
        // Send closing prompt to each agent
        for (let i = 0; i < farmStatus.agents.length; i++) {
          try {
            await orchestratorService.sendCommandToAgent(farmStatus.processId, i, closingPrompt);
            console.log(`[FarmManager] Sent closing prompt to agent ${i}`);
          } catch (error) {
            console.error(`[FarmManager] Failed to send closing prompt to agent ${i}:`, error);
          }
        }
        
        // Wait for agents to process the closing prompt and generate outputs
        // Use standard 30-second grace period for proper file collection
        const gracePeriod = getGracePeriod((farm.config?.timeout || 300) * 1000); // Convert to ms
        console.log(`[FarmManager] Waiting ${gracePeriod}ms for agents to complete yield collection (standard: 30s)`);
        
        // Check for completion message periodically
        let completionDetected = false;
        const checkInterval = 2000; // Check every 2 seconds
        const maxChecks = Math.floor(gracePeriod / checkInterval);
        
        for (let i = 0; i < maxChecks; i++) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          
          // Check if agents have reported successful close
          completionDetected = await this.checkForCompletionMessage(farmId, farmStatus.agents);
          if (completionDetected) {
            console.log(`[FarmManager] Completion message detected from agents`);
            break;
          }
        }
        
        // Force capture of any agent outputs before stopping
        console.log(`[FarmManager] Capturing final agent outputs`);
        try {
          const { TmuxHelper } = await import('./tmuxHelper');
          const tmuxSession = `farm-${farmId.substring(0, 8)}`;
          
          // Capture output from all agent panes
          for (let i = 0; i < farmStatus.agents.length; i++) {
            try {
              const output = await TmuxHelper.capturePane(tmuxSession, i);
              if (output && output.length > 0) {
                console.log(`[FarmManager] Captured ${output.length} chars from agent ${i}`);
              }
            } catch (error) {
              console.error(`[FarmManager] Failed to capture output from agent ${i}:`, error);
            }
          }
        } catch (error) {
          console.error(`[FarmManager] Failed to capture agent outputs:`, error);
        }
        
        // Start or complete harvest collection
        let harvest;
        try {
          // Check if harvest already exists for this farm
          const existingHarvests = await harvestService.findByFarmId(farmId);
          const activeHarvest = existingHarvests.find(h => h.status === 'processing');
          
          if (activeHarvest) {
            // Complete existing harvest
            console.log(`[FarmManager] Completing existing harvest ${activeHarvest.id}`);
            harvest = await harvestService.completeHarvest(activeHarvest.id);
          } else {
            // Create and immediately complete new harvest
            console.log(`[FarmManager] Creating new harvest for graceful shutdown`);
            harvest = await harvestService.startHarvest(farmId, farm.name, userId);
            
            // Add summary information about the graceful shutdown
            harvest.summary.description = `Farm gracefully shut down due to ${reason}. Yields collected before termination.`;
            harvest.metadata = { 
              ...harvest.metadata, 
              shutdownReason: reason,
              gracefulShutdown: true
            };
            
            // Wait a moment for any final outputs to be captured
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            harvest = await harvestService.completeHarvest(harvest.id);
          }
          
          console.log(`[FarmManager] Harvest collection completed for farm ${farmId}`);
          
          // Trigger file collection even if harvest creation failed
          if (harvest) {
            try {
              const { harvestFileCollector } = await import('./harvestFileCollector');
              const agentIds = farmStatus.agents.map((_, i) => `agent-${i}`);
              
              console.log(`[FarmManager] Collecting harvest files for ${agentIds.length} agents`);
              const fileCollection = await harvestFileCollector.collectHarvestFiles(
                harvest.id,
                farmId,
                farm.name,
                agentIds
              );
              
              console.log(`[FarmManager] Collected ${fileCollection.totalFiles} files, total size: ${fileCollection.totalSize} bytes`);
            } catch (error) {
              console.error(`[FarmManager] Failed to collect harvest files:`, error);
            }
          }
          
          // Ensure harvest is properly stored in barn with graceful shutdown metadata
          if (harvest) {
            try {
              const { barnService } = await import('./barnService');
              
              // Determine barn storage type based on farm content and reason
              let barnType: 'application' | 'script' | 'workflow' | 'dataset' | 'template' | 'other' = 'other';
              let barnCategory: string = 'utility';
              let folderId = 'harvests'; // Default folder for graceful shutdown harvests
              
              // Categorize based on harvest content
              const hasCode = harvest.results.some(r => 
                r.taskType === 'generation' || 
                r.content.includes('code') || 
                r.content.includes('function') ||
                r.content.includes('import')
              );
              const hasWorkflow = harvest.results.some(r => 
                r.taskType === 'workflow' || 
                r.content.includes('workflow') ||
                r.content.includes('step')
              );
              const hasAnalysis = harvest.results.some(r => 
                r.taskType === 'analysis' ||
                r.content.includes('analysis') ||
                r.content.includes('summary')
              );
              
              // Enhanced categorization for graceful shutdowns
              if (hasCode && harvest.results.length > 3) {
                barnType = 'application';
                barnCategory = 'full-app';
                folderId = 'apps';
              } else if (hasWorkflow) {
                barnType = 'workflow';
                barnCategory = 'automation';
                folderId = 'workflows';
              } else if (hasCode) {
                barnType = 'script';
                barnCategory = 'utility';
                folderId = 'scripts';
              } else if (hasAnalysis) {
                barnType = 'dataset';
                barnCategory = 'analysis';
                folderId = 'templates';
              }
              
              // Skip barn storage for timeout shutdowns with minimal content
              if (reason === 'timeout' && harvest.results.length === 0 && (!harvest.yield || harvest.yield.length === 0)) {
                console.log(`[FarmManager] Skipping barn storage for empty timeout shutdown of farm ${farmId}`);
                return farm;
              }
              
              // Create enhanced barn item with graceful shutdown context
              const barnTags = [
                ...harvest.tags,
                'graceful-shutdown',
                `reason-${reason}`,
                barnType,
                `agents-${harvest.results.length}`,
                'yield-collected'
              ];
              
              // Add yield count and types to tags
              if (harvest.yield && harvest.yield.length > 0) {
                barnTags.push(`yields-${harvest.yield.length}`);
                const yieldTypes = Array.from(new Set(harvest.yield.map(y => y.type)));
                barnTags.push(...yieldTypes.map(type => `yield-${type}`));
              }
              
              const barnItemName = `${farm.name} - Graceful Shutdown (${new Date().toLocaleDateString()})`;
              const barnDescription = `Farm gracefully shut down ${reason === 'timeout' ? 'due to timeout' : reason === 'user_request' ? 'by user request' : 'upon completion'}. ` +
                `Collected ${harvest.results.length} results and ${harvest.yield?.length || 0} yield items before termination. ` +
                `Quality Score: ${harvest.quality.overallScore.toFixed(1)}%.`;
              
              const barnItem = await barnService.storeHarvest(harvest.id, {
                name: barnItemName,
                description: barnDescription,
                type: barnType,
                category: barnCategory,
                tags: barnTags,
                folderId,
                metadata: {
                  gracefulShutdown: true,
                  shutdownReason: reason,
                  originalTimeout: farm.config?.timeout,
                  harvestQuality: harvest.quality,
                  yieldCount: harvest.yield?.length || 0,
                  resultCount: harvest.results.length,
                  farmType: farm.type
                }
              });
              
              console.log(`[FarmManager] Graceful shutdown harvest ${harvest.id} stored in barn as ${barnItem.id} (${folderId}/${barnType})`);
              
              // Emit barn storage event with enhanced context
              this.emit('farm:barn_storage_completed', { 
                farm, 
                harvest, 
                barnItem,
                reason,
                gracefulShutdown: true
              });
              
            } catch (barnError) {
              console.error(`[FarmManager] Failed to store graceful shutdown harvest in barn:`, barnError);
              // Continue - barn storage failure shouldn't prevent shutdown
            }
          }
          
          // Emit harvest completion event
          this.emit('farm:harvest_completed', { farm, harvest, reason });
          
        } catch (harvestError) {
          console.error(`[FarmManager] Failed to complete harvest for farm ${farmId}:`, harvestError);
          // Continue with shutdown even if harvest fails
        }
      } else {
        console.log(`[FarmManager] No active agents found for farm ${farmId}, skipping closing prompt`);
      }
      
    } catch (error) {
      console.error(`[FarmManager] Error during graceful shutdown of farm ${farmId}:`, error);
      // Continue with regular shutdown even if graceful steps fail
    }
    
    // Now proceed with regular farm shutdown
    console.log(`[FarmManager] Proceeding with regular shutdown for farm ${farmId}`);
    return await this.stopFarm(farmId, userId);
  }

  /**
   * Check if agents have reported successful session close
   */
  private async checkForCompletionMessage(farmId: string, agents: any[]): Promise<boolean> {
    try {
      const { TmuxHelper } = await import('./tmuxHelper');
      const tmuxSession = `farm-${farmId.substring(0, 8)}`;
      
      // Check output from each agent pane for completion message
      for (let i = 0; i < agents.length; i++) {
        const paneOutput = await TmuxHelper.capturePane(tmuxSession, i, 20); // Last 20 lines
        
        // Look for completion messages
        if (paneOutput && (
          paneOutput.includes('Session closed successfully') ||
          paneOutput.includes('READY_FOR_HARVEST') ||
          paneOutput.includes('Shutdown complete') ||
          paneOutput.includes('Work saved successfully')
        )) {
          console.log(`[FarmManager] Agent ${i} reported successful completion`);
          
          // Update farm status to completed
          const farm = this.farms.get(farmId);
          if (farm && farm.status !== 'completed') {
            farm.status = 'completed';
            farm.updatedAt = new Date();
            
            // Update in database
            try {
              await db.query(
                'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['completed', farmId]
              );
            } catch (dbError) {
              console.error(`[FarmManager] Failed to update farm status in database:`, dbError);
            }
            
            // Emit status change event
            this.emit('farm:status', { 
              farmId, 
              status: 'completed',
              reason: 'agents_completed'
            });
          }
          
          return true;
        }
      }
    } catch (error) {
      console.error(`[FarmManager] Error checking for completion message:`, error);
    }
    
    return false;
  }

  private generateClosingPrompt(reason: string, farmId?: string): string {
    // Get workspace path for this farm
    const workspacePath = farmId ? `maibarn/workspaces/active/${farmId}` : 'your workspace';
    
    // Simplified prompt like orchestrator.py
    const basePrompt = `
🌾 HARVEST TIME - Session ending (${reason === 'timeout' ? 'timeout reached' : reason === 'user_request' ? 'CTRL+C received' : 'task completed'})

Please save your work:
1. Save all files to: ${workspacePath}/
2. Create HARVEST_SUMMARY.md with your results
3. Type "Session closed successfully" when done

You have 30 seconds to complete these actions.

Type 'READY_FOR_HARVEST' when all important work is saved.

⏱️  You have ~30 seconds to complete this process.
`;

    return basePrompt.trim();
  }

  async stopFarm(farmId: string, userId: string): Promise<Farm | null> {
    const farm = await this.getFarm(farmId, userId);
    
    if (!farm) {
      return null;
    }

    if (farm.status === 'idle' || farm.status === 'stopped') {
      return farm; // Already stopped
    }

    // Clear timeout if exists
    if (this.farmTimeouts.has(farmId)) {
      clearTimeout(this.farmTimeouts.get(farmId)!);
      this.farmTimeouts.delete(farmId);
      console.log(`[FarmManager] Cleared timeout for farm ${farmId}`);
    }

    // Check if farm should be marked as completed instead of stopped
    const wasRunning = farm.status === 'running' || farm.status === 'harvesting';
    farm.status = wasRunning ? 'completed' : 'stopped';
    farm.updatedAt = new Date();
    
    // Immediately persist completed farms to database
    if (farm.status === 'completed') {
      await this.persistFarmToDatabase(farm);
      console.log(`[FarmManager] Farm ${farmId} marked as completed and persisted to database`);
    }

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
    let totalAgents = 0;
    
    // ONLY count agents from farms that are actively running
    for (const farm of farms) {
      // Only count agents if farm is in a running state
      if (farm.status === 'running' || farm.status === 'launching') {
        try {
          // Try to get real agent count from orchestratorService
          const { orchestratorService } = await import('./OrchestratorService');
          const metrics = await orchestratorService.getStandardizedTaskMetrics(farm.id);
          
          if (metrics) {
            console.log(`[FarmManager] Farm ${farm.id} metrics:`, JSON.stringify(metrics));
            if (metrics.realTimeAgentCount > 0) {
              totalAgents += metrics.realTimeAgentCount;
              console.log(`[FarmManager] Farm ${farm.id} (${farm.status}): ${metrics.realTimeAgentCount} active agents from tmux`);
            } else {
              // For running farms without active tmux agents, use configured count
              const agentCount = Math.min(farm.agents.length || 0, farm.config.maxAgents || 0);
              totalAgents += agentCount;
              console.log(`[FarmManager] Farm ${farm.id} (${farm.status}): ${agentCount} configured agents (no tmux session)`);
            }
          } else if (farm.status === 'running') {
            // For running farms without metrics at all, use agent array length  
            const agentCount = farm.agents.length || 0;
            totalAgents += agentCount;
            console.log(`[FarmManager] Farm ${farm.id} (${farm.status}): ${agentCount} configured agents (no metrics available)`);
          }
        } catch (error) {
          // For running farms, fallback to agent array length
          if (farm.status === 'running') {
            totalAgents += farm.agents.length;
            console.log(`[FarmManager] Farm ${farm.id} (${farm.status}): ${farm.agents.length} agents (fallback)`);
          }
        }
      }
      // Farms that are NOT running (idle, stopped, completed, failed, etc.) don't contribute to agent count
    }
    
    console.log(`[FarmManager] Total active agents for user ${userId}: ${totalAgents}`);
    return totalAgents;
  }

  /**
   * Get standardized task metrics for all user farms
   */
  async getStandardizedFarmMetrics(userId: string): Promise<any> {
    const farms = await this.getUserFarms(userId);
    const farmMetrics = [];
    
    for (const farm of farms) {
      if (farm.status === 'running') {
        try {
          const { orchestratorService } = await import('./OrchestratorService');
          const metrics = await orchestratorService.getStandardizedTaskMetrics(farm.id);
          
          if (metrics) {
            farmMetrics.push({
              farmId: farm.id,
              farmName: farm.name,
              farmType: farm.type,
              ...metrics
            });
          }
        } catch (error) {
          console.warn(`[FarmManager] Could not get metrics for farm ${farm.id}:`, error);
        }
      }
    }
    
    return farmMetrics;
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
    
    const previousStatus = farm.status;
    
    // Update in-memory state first
    farm.status = status;
    farm.updatedAt = new Date();
    
    // Schedule shutdown when farm transitions to running (if not already scheduled)
    if (status === 'running' && previousStatus !== 'running') {
      console.log(`[FarmManager] Farm ${farmId} became running - checking timeout scheduling`);
      
      if (farm.config?.timeout && farm.config.timeout > 0) {
        console.log(`[FarmManager] Scheduling shutdown for farm ${farmId} with ${farm.config.timeout}s timeout`);
        
        // Schedule graceful shutdown using shutdown coordinator
        shutdownCoordinator.scheduleShutdown({
          mode: farm.config.goWildMode?.enabled ? 'gowild' : 'farm',
          farmId: farmId,
          userId: farm.createdBy || 'system',
          reason: 'timeout',
          timeout: farm.config.timeout, // Pass timeout in seconds
          harvestId: farm.config.harvestId
        });
        
        const gracefulShutdownTime = calculateGracefulShutdownTime(farm.config.timeout * 1000);
        console.log(`[FarmManager] Scheduled graceful shutdown at ${gracefulShutdownTime / 1000}s (30s before ${farm.config.timeout}s timeout)`);
      } else {
        console.log(`[FarmManager] No timeout configured for farm ${farmId} - no shutdown scheduled`);
      }
    }
    
    // Persist to database immediately for critical statuses
    const criticalStatuses = ['completed', 'failed', 'terminated', 'harvesting', 'running'];
    const shouldPersistImmediately = criticalStatuses.includes(status);
    
    try {
      await db.query(
        `UPDATE farms 
         SET status = $1, updated_at = $2, metrics = $3, config = $4
         WHERE id = $5`,
        [status, farm.updatedAt, JSON.stringify(farm.metrics), JSON.stringify(farm.config), farmId]
      );
      
      console.log(`[FarmManager] Farm ${farmId} status updated to ${status} and persisted to database`);
      
      // For completed farms, ensure they stay persisted
      if (status === 'completed') {
        console.log(`[FarmManager] Farm ${farmId} marked as completed - will persist until explicitly deleted`);
      }
    } catch (error) {
      console.error(`[FarmManager] Failed to persist farm status to database:`, error);
      
      // Add to persistence cache for retry
      this.farmPersistenceCache.set(farmId, farm);
      
      // If this is a critical status, retry immediately
      if (shouldPersistImmediately) {
        setTimeout(() => this.persistFarmToDatabase(farm), 1000);
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