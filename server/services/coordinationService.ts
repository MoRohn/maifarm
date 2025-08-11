/**
 * Coordination Service V2
 * Updated to use Redis-based event-driven coordination
 * Provides backward compatibility while leveraging new atomic architecture
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { redis } from '../database/connection';
import { multiClaudeServiceV2 } from './multiClaudeServiceV2';
import { RedisCoordinationStore, FarmState, AgentState } from './redisCoordinationStore';
import { SessionController } from './sessionController';
// Keep legacy imports for backward compatibility during transition
import { multiClaudeIntegration } from './multiClaudeIntegration';
import { workCoordinationService } from './workCoordination';
import { fileWatcher } from './coordinationFileWatcher';
import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { pathConfig } from '../config/paths';

interface CoordinationEvent {
  type: string;
  data: any;
  timestamp: string;
  source: string;
}

class CoordinationService extends EventEmitter {
  // New Redis-based services
  private store: RedisCoordinationStore;
  private sessionController: SessionController;
  
  // Use centralized path configuration for all file operations
  private coordinationDir = pathConfig.getPath('COORDINATION_DIR');
  private harvestDir = pathConfig.getPath('HARVEST_STORAGE_ACTIVE');
  private activeAgentsFile = pathConfig.getPath('ACTIVE_AGENTS_FILE');
  private workClaimsDir = path.join(pathConfig.getPath('COORDINATION_DIR'), 'work_claims');
  
  private isInitialized = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private agentHealthCheckInterval: NodeJS.Timeout | null = null;
  
  // Feature flags for gradual migration
  private useRedisCoordination = true; // Enable new Redis-based coordination
  private useLegacyFallback = true;    // Keep legacy system as fallback

  constructor() {
    super();
    
    // Initialize Redis-based coordination directly
    this.store = new RedisCoordinationStore(redis);
    this.sessionController = new SessionController(redis);
    
    this.initialize();
  }

  private async initialize() {
    try {
      // Initialize Redis-based coordination
      if (this.useRedisCoordination) {
        this.setupRedisEventListeners();
        console.log('[CoordinationService] Redis-based coordination enabled');
      }
      
      // Initialize legacy system if needed
      if (this.useLegacyFallback) {
        // Ensure directories exist
        await fs.mkdir(this.coordinationDir, { recursive: true });
        await fs.mkdir(this.harvestDir, { recursive: true });
        await fs.mkdir(this.workClaimsDir, { recursive: true });
        
        // Setup file watchers for active agents
        this.setupFileWatchers();
        
        // Setup listeners for multi-claude integration
        this.setupMultiClaudeListeners();
        
        // Start monitoring for harvests
        this.startHarvestMonitoring();
        
        console.log('[CoordinationService] Legacy file-based coordination enabled as fallback');
      }
      
      // Start health monitoring (uses Redis if available, falls back to legacy)
      this.startAgentHealthMonitoring();
      
      this.isInitialized = true;
      console.log('[CoordinationService] Initialized successfully');
    } catch (error) {
      console.error('[CoordinationService] Failed to initialize:', error);
    }
  }

  /**
   * Setup Redis-based event listeners
   */
  private setupRedisEventListeners() {
    // Since we removed AtomicCoordinator, we don't have built-in event emitters
    // Events will be handled directly when performing actions through the store and sessionController

    // Listen to multiClaudeServiceV2 events
    multiClaudeServiceV2.on('farm:updated', (event) => {
      this.emit('farm:updated', event);
    });

    multiClaudeServiceV2.on('agent:updated', (event) => {
      this.emit('agent:updated', event);
    });

    multiClaudeServiceV2.on('farm:health', (event) => {
      this.emit('health:summary', event);
    });

    multiClaudeServiceV2.on('farm:failed', (event) => {
      this.emit('health:warning', {
        type: 'farm_failure',
        farmId: event.farmId,
        message: event.reason,
        severity: 'critical',
        timestamp: event.timestamp
      });
    });

    multiClaudeServiceV2.on('health:warning', (event) => {
      this.emit('health:warning', event);
    });

    // Listen to Redis store events
    this.store.on('redis:farmUpdates', (event) => {
      this.handleStoreEvent('farm', event);
    });

    this.store.on('redis:agentUpdates', (event) => {
      this.handleStoreEvent('agent', event);
    });

    this.store.on('redis:systemEvents', (event) => {
      if (event.type === 'health:warning') {
        this.emit('health:warning', event);
      }
    });
  }

  /**
   * Handle Redis coordination events
   */
  private handleRedisEvent(type: 'farm' | 'agent', event: any) {
    if (type === 'farm') {
      // Convert Redis event to legacy format for backward compatibility
      const legacyEvent = this.convertFarmEventToLegacy(event);
      this.emit('farm:updated', legacyEvent);
    } else if (type === 'agent') {
      const legacyEvent = this.convertAgentEventToLegacy(event);
      this.emit('agent:updated', legacyEvent);
      this.emit('agents:updated', [legacyEvent]); // Some listeners expect array format
    }
  }

  /**
   * Handle Redis store events
   */
  private handleStoreEvent(type: 'farm' | 'agent', event: any) {
    // Forward store events with proper formatting
    if (type === 'farm' && event.type === 'farm:created') {
      this.emit('farm:created', {
        farmId: event.farmId,
        farm: event.data,
        timestamp: event.timestamp
      });
    } else if (type === 'agent' && event.type === 'agent:created') {
      this.emit('agent:created', {
        agentId: event.agentId,
        farmId: event.farmId,
        agent: event.data,
        timestamp: event.timestamp
      });
    }
  }

  /**
   * Convert Redis farm events to legacy format
   */
  private convertFarmEventToLegacy(event: any): any {
    return {
      farmId: event.farmId,
      status: event.data?.status,
      timestamp: event.timestamp,
      data: event.data,
      type: event.type
    };
  }

  /**
   * Convert Redis agent events to legacy format
   */
  private convertAgentEventToLegacy(event: any): any {
    const agent = event.data;
    return {
      agent_id: agent?.id || event.agentId,
      farm_id: agent?.farmId || event.farmId,
      session_name: agent?.name || agent?.sessionId, // Use name if available
      status: agent?.status,
      started: agent?.startTime || agent?.lastHeartbeat,
      current_step: agent?.currentTask,
      harvest_id: agent?.metadata?.harvestId,
      timestamp: event.timestamp
    };
  }

  private setupMultiClaudeListeners() {
    // Forward agent updates
    multiClaudeIntegration.on('agent:updated', (update) => {
      this.emit('agents:updated', update.data);
      
      // Also emit individual agent status for specific agent tracking
      if (Array.isArray(update.data)) {
        update.data.forEach(async (agent) => {
          this.emit('agent:status', {
            agentId: agent.agent_id,
            farmId: agent.farm_id,
            harvestId: agent.harvest_id,
            status: agent.status,
            sessionName: agent.name || agent.session_name, // Use agent name if available
            timestamp: agent.started,
            currentStep: agent.current_step
          });
          
          // Register agent with harvest if harvestId is present
          if (agent.harvest_id) {
            const { harvestService } = await import('./harvestService');
            await harvestService.registerAgent(agent.harvest_id, agent.agent_id, {
              farmId: agent.farm_id,
              sessionName: agent.name || agent.session_name, // Use agent name if available
              agentId: agent.agent_id,
              status: agent.status
            });
          }
        });
      }
    });
    
    // Forward work claims from legacy system
    multiClaudeIntegration.on('work:claimed', (update) => {
      this.emit('claims:updated', update.data);
    });
    
    // Forward completed work from legacy system
    multiClaudeIntegration.on('work:completed', (update) => {
      this.emit('work:completed', update.data);
    });
    
    // Setup new work coordination listeners
    this.setupWorkCoordinationListeners();
  }


  private setupWorkCoordinationListeners() {
    // Forward work claimed events from new system
    workCoordinationService.on('work:claimed', async (event) => {
      this.emit('work:coordination:claimed', event);
      
      
      // Also emit legacy format for compatibility
      this.emit('claims:updated', [event.claim]);
    });
    
    // Forward work completed events
    workCoordinationService.on('work:completed', async (event) => {
      this.emit('work:coordination:completed', event);
      
      
      // Also emit legacy format
      this.emit('work:completed', [{
        agentId: event.claim.agentId,
        description: event.claim.description,
        timestamp: event.timestamp,
        success: event.success
      }]);
    });
    
    // Forward work queued events
    workCoordinationService.on('work:queued', (event) => {
      this.emit('work:coordination:queued', event);
    });
  }

  private startHarvestMonitoring() {
    // Poll for new harvest files
    this.pollingInterval = setInterval(async () => {
      try {
        const files = await fs.readdir(this.harvestDir);
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            await this.processHarvestFile(path.join(this.harvestDir, file));
          }
        }
      } catch (error) {
        // Directory might not exist yet
        if (error.code !== 'ENOENT') {
          console.error('[CoordinationService] Error monitoring harvests:', error);
        }
      }
    }, 3000); // Check every 3 seconds
  }

  private async processHarvestFile(filePath: string) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const harvest = JSON.parse(data);
      
      // Check if this is a new harvest
      if (!harvest.processed) {
        harvest.processed = true;
        
        // Update the file to mark as processed
        await fs.writeFile(filePath, JSON.stringify(harvest, null, 2));
        
        // Emit harvest ready event
        this.emit('harvest:ready', {
          id: path.basename(filePath, '.json'),
          timestamp: harvest.timestamp || new Date().toISOString(),
          agents: harvest.agents || [],
          artifacts: harvest.yield || harvest.artifacts || [],
          metrics: harvest.metrics || {},
          status: 'ready'
        });
        
        console.log(`[CoordinationService] New harvest ready: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.error(`[CoordinationService] Failed to process harvest file ${filePath}:`, error);
    }
  }

  /**
   * Trigger a harvest collection
   */
  public async triggerHarvest(farmId: string, agentIds: string[]): Promise<void> {
    try {
      const harvestId = `harvest_${farmId}_${Date.now()}`;
      const harvestFile = path.join(this.harvestDir, `${harvestId}.json`);
      
      const harvestData = {
        id: harvestId,
        farmId,
        timestamp: new Date().toISOString(),
        agents: agentIds,
        artifacts: [],
        metrics: {},
        status: 'collecting',
        processed: false
      };
      
      await fs.writeFile(harvestFile, JSON.stringify(harvestData, null, 2));
      
      console.log(`[CoordinationService] Triggered harvest: ${harvestId}`);
    } catch (error) {
      console.error('[CoordinationService] Failed to trigger harvest:', error);
      throw error;
    }
  }

  /**
   * Update agent status through coordination
   */
  public async updateAgentStatus(agentId: string, status: string, additionalData?: any) {
    try {
      await multiClaudeIntegration.updateAgentStatus(agentId, status as any, additionalData);
      
      
      // Emit status update
      this.emit('agent:status', {
        agentId,
        status,
        ...additionalData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[CoordinationService] Failed to update agent status:', error);
      throw error;
    }
  }


  /**
   * Get current coordination state
   */
  public getCoordinationState() {
    return multiClaudeIntegration.getCoordinationState();
  }

  /**
   * Get health summary for all agents (Redis-first with legacy fallback)
   */
  public async getHealthSummary() {
    if (this.useRedisCoordination) {
      try {
        // Get aggregated health from all farms
        const farms = await multiClaudeServiceV2.listFarms();
        let totalAgents = 0;
        let healthyAgents = 0;
        let warningAgents = 0;
        let errorAgents = 0;

        for (const farm of farms) {
          const health = await this.store.getHealthStatus(farm.id);
          totalAgents += health.healthy.length + health.stale.length + health.failed.length;
          healthyAgents += health.healthy.length;
          warningAgents += health.stale.length;
          errorAgents += health.failed.length;
        }

        return {
          totalAgents,
          healthyAgents,
          warningAgents,
          errorAgents,
          healthPercentage: totalAgents > 0 ? (healthyAgents / totalAgents) * 100 : 100,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('[CoordinationService] Error getting health summary from Redis:', error);
      }
    }

    // Fallback to legacy system
    if (this.useLegacyFallback) {
      const agents = await this.getActiveAgents();
      const totalAgents = agents.length;
      const healthyAgents = agents.filter(a => a.status === 'active' || a.status === 'idle').length;
      const warningAgents = agents.filter(a => a.status === 'working').length;
      const errorAgents = agents.filter(a => a.status === 'error').length;
      
      return {
        totalAgents,
        healthyAgents,
        warningAgents,
        errorAgents,
        healthPercentage: totalAgents > 0 ? (healthyAgents / totalAgents) * 100 : 100,
        timestamp: new Date().toISOString()
      };
    }

    return {
      totalAgents: 0,
      healthyAgents: 0,
      warningAgents: 0,
      errorAgents: 0,
      healthPercentage: 100,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get health status for all agents
   */
  public async getAllAgentHealth() {
    const agents = await this.getActiveAgents();
    return Promise.all(agents.map(agent => this.getAgentHealth(agent.agent_id)));
  }

  /**
   * Get health status for a specific agent
   */
  public async getAgentHealth(agentId: string) {
    const agents = await this.getActiveAgents();
    const agent = agents.find(a => a.agent_id === agentId);
    
    if (!agent) {
      return {
        agentId,
        status: 'unknown',
        contextPercentage: 0,
        cycleTime: 0,
        lastHeartbeat: null,
        errorCount: 0,
        timestamp: new Date().toISOString()
      };
    }
    
    // Calculate health metrics
    const now = Date.now();
    const startTime = new Date(agent.started).getTime();
    const uptime = now - startTime;
    
    return {
      agentId,
      status: agent.status,
      contextPercentage: 0, // This would need to be tracked separately
      cycleTime: uptime / 1000, // Convert to seconds
      lastHeartbeat: agent.started, // Using started time as last heartbeat for now
      errorCount: agent.status === 'error' ? 1 : 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get coordination data for WebSocket updates
   */
  public async getCoordinationData() {
    try {
      const agents = await this.getActiveAgents();
      const workClaims = this.getWorkClaims();
      const completedWork = this.getCompletedWork();
      
      return {
        activeAgents: agents,
        workClaims,
        completedWork,
        healthSummary: this.getHealthSummary(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[CoordinationService] Failed to get coordination data:', error);
      throw error;
    }
  }

  /**
   * Submit a work claim
   */
  public async submitWorkClaim(agentId: string, claim: any) {
    try {
      // Use new work coordination service for better conflict management
      const result = await workCoordinationService.claimWork(agentId, {
        description: claim.description || claim.task,
        files: claim.files || [],
        type: claim.type || 'task',
        priority: claim.priority || 'medium',
        dependencies: claim.dependencies,
        estimatedDuration: claim.estimatedDuration,
        agentUid: claim.agentUid
      });
      
      if (!result.success) {
        throw new Error(result.message);
      }
      
      // Also submit to legacy system for compatibility
      await multiClaudeIntegration.claimWork(agentId, claim);
      
      // Emit claim update
      this.emit('claims:updated', [result.claim]);
      
      return result;
    } catch (error) {
      console.error('[CoordinationService] Failed to submit work claim:', error);
      throw error;
    }
  }

  /**
   * Mark work as complete
   */
  public async markWorkComplete(agentId: string, description: string, claimId?: string) {
    try {
      // If we have a claim ID, use new system
      if (claimId) {
        await workCoordinationService.completeWork(claimId, true);
      }
      
      // Also mark in legacy system
      await multiClaudeIntegration.markWorkComplete(agentId, description);
      
      // Emit completion
      this.emit('work:completed', [{
        agentId,
        description,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('[CoordinationService] Failed to mark work complete:', error);
      throw error;
    }
  }

  /**
   * Get active agents (Redis-first with legacy fallback)
   */
  public async getActiveAgents() {
    if (this.useRedisCoordination) {
      try {
        // Get all farms from Redis
        const farms = await multiClaudeServiceV2.listFarms();
        const allAgents = [];
        
        for (const farm of farms) {
          const agents = await this.store.getFarmAgents(farm.id);
          // Convert to legacy format
          for (const agent of agents) {
            allAgents.push(this.convertAgentEventToLegacy({
              data: agent,
              agentId: agent.id,
              farmId: agent.farmId
            }));
          }
        }
        
        return allAgents;
      } catch (error) {
        console.error('[CoordinationService] Error getting agents from Redis:', error);
      }
    }
    
    // Fallback to legacy system
    if (this.useLegacyFallback) {
      return multiClaudeIntegration.getAgents();
    }
    
    return [];
  }

  /**
   * Get work claims
   */
  public getWorkClaims() {
    return multiClaudeIntegration.getWorkClaims();
  }

  /**
   * Get completed work
   */
  public getCompletedWork() {
    return multiClaudeIntegration.getCompletedWork();
  }

  /**
   * Collect completed work from coordination directory
   */
  public async collectCompletedWork(): Promise<any[]> {
    try {
      const completedDir = path.join(this.coordinationDir, 'completed_work');
      const files = await fs.readdir(completedDir).catch(() => []);
      
      const completedWork = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async (file) => {
            try {
              const content = await fs.readFile(path.join(completedDir, file), 'utf-8');
              return JSON.parse(content);
            } catch (error) {
              console.error(`Failed to read completed work file ${file}:`, error);
              return null;
            }
          })
      );
      
      return completedWork.filter(work => work !== null);
    } catch (error) {
      console.error('[CoordinationService] Failed to collect completed work:', error);
      return [];
    }
  }

  /**
   * Create harvest report from collected data
   */
  public async createHarvestReport(farmId: string, results: any[]): Promise<any> {
    try {
      const reportId = `report_${farmId}_${Date.now()}`;
      const reportFile = path.join(this.harvestDir, `${reportId}.json`);
      
      const agents = await this.getActiveAgents();
      const report = {
        id: reportId,
        farmId,
        timestamp: new Date().toISOString(),
        results,
        agentCount: agents.length,
        completedTasks: results.length,
        status: 'completed',
        metrics: {
          totalTime: 0,
          successRate: 0,
          errorCount: 0
        }
      };
      
      // Calculate metrics
      if (results.length > 0) {
        report.metrics.successRate = (results.filter(r => r.status === 'success').length / results.length) * 100;
        report.metrics.errorCount = results.filter(r => r.status === 'error').length;
      }
      
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      
      // Emit report ready event
      this.emit('harvest:report:ready', report);
      
      return report;
    } catch (error) {
      console.error('[CoordinationService] Failed to create harvest report:', error);
      throw error;
    }
  }

  /**
   * Get harvest reports
   */
  public async getHarvestReports(farmId?: string): Promise<any[]> {
    try {
      const files = await fs.readdir(this.harvestDir).catch(() => []);
      
      const reports = await Promise.all(
        files
          .filter(f => f.startsWith('report_') && f.endsWith('.json'))
          .map(async (file) => {
            try {
              const content = await fs.readFile(path.join(this.harvestDir, file), 'utf-8');
              const report = JSON.parse(content);
              
              // Filter by farmId if provided
              if (farmId && report.farmId !== farmId) {
                return null;
              }
              
              return report;
            } catch (error) {
              console.error(`Failed to read report file ${file}:`, error);
              return null;
            }
          })
      );
      
      return reports.filter(report => report !== null);
    } catch (error) {
      console.error('[CoordinationService] Failed to get harvest reports:', error);
      return [];
    }
  }

  /**
   * Get work coordination metrics
   */
  public async getWorkCoordinationMetrics() {
    return await workCoordinationService.getMetrics();
  }

  /**
   * Get agent work profile
   */
  public async getAgentWorkProfile(agentId: string) {
    return await workCoordinationService.getAgentProfile(agentId);
  }

  /**
   * Queue work for agents
   */
  public async queueWork(workItem: any) {
    return await workCoordinationService.queueWork(workItem);
  }

  /**
   * Assign queued work to agent
   */
  public async assignQueuedWork(agentId: string, count: number = 1) {
    return await workCoordinationService.assignQueuedWork(agentId, count);
  }



  /**
   * Setup file watchers for coordination files
   */
  private setupFileWatchers() {
    // Watch active agents file
    fileWatcher.watchFile(this.activeAgentsFile, 'agents:file:changed');
    
    // Listen for agent file changes
    fileWatcher.on('agents:file:changed', (data) => {
      this.handleActiveAgentsFileUpdate(data);
    });
    
    // Watch work claims directory
    this.watchWorkClaimsDirectory();
    
    // Handle file watcher errors
    fileWatcher.on('watch:error', (error) => {
      console.error('[CoordinationService] File watch error:', error);
      // Attempt recovery
      setTimeout(() => {
        if (error.filePath === this.activeAgentsFile) {
          fileWatcher.watchFile(this.activeAgentsFile, 'agents:file:changed');
        }
      }, 5000);
    });
  }
  
  /**
   * Watch work claims directory for changes
   */
  private async watchWorkClaimsDirectory() {
    setInterval(async () => {
      try {
        const files = await fs.readdir(this.workClaimsDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(this.workClaimsDir, file);
            // Watch each claim file if not already watched
            fileWatcher.watchFile(filePath, `claim:${file}`);
          }
        }
      } catch (error) {
        // Directory might not exist yet
      }
    }, 3000);
  }
  
  /**
   * Handle active agents file update
   */
  private async handleActiveAgentsFileUpdate(agents: any) {
    // Convert agents object to array format
    const agentArray = Object.entries(agents || {}).map(([id, agent]: [string, any]) => ({
      ...agent,
      id,
      agent_id: id
    }));
    
    // Sync agents to database for dashboard visibility
    for (const agent of agentArray) {
      try {
        // Check if agent already exists in database
        const existingAgent = await db.query(
          'SELECT id FROM agents WHERE config->>"uid" = $1 OR (farm_id = $2 AND config->>"agentIndex" = $3)',
          [agent.agent_id, agent.farm_id, agent.agent_id.toString()]
        );
        
        if (existingAgent.rows.length === 0) {
          // Create new agent in database
          const agentDbId = uuidv4();
          await db.query(
            `INSERT INTO agents (id, farm_id, name, type, status, capabilities, resources, metrics, config, last_heartbeat, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              agentDbId,
              agent.farm_id,
              `Agent ${agent.agent_id} (${agent.session_name})`,
              'coordination-synced',
              agent.status || 'active',
              JSON.stringify(['text-generation', 'code-execution', 'file-operations']),
              JSON.stringify({ cpu: 2, memory: 2048 }),
              JSON.stringify({ tasksCompleted: 0, avgResponseTime: 0 }),
              JSON.stringify({ 
                uid: agent.agent_id,
                sessionName: agent.session_name,
                harvestId: agent.harvest_id,
                started: agent.started,
                fromCoordination: true
              }),
              new Date(agent.started || Date.now()),
              new Date(agent.started || Date.now()),
              new Date()
            ]
          );
          console.log(`[CoordinationService] Synced new agent ${agent.agent_id} to database`);
        } else {
          // Update existing agent status
          await db.query(
            `UPDATE agents SET status = $1, last_heartbeat = $2, updated_at = $3 WHERE config->>"uid" = $4 OR (farm_id = $5 AND config->>"agentIndex" = $6)`,
            [agent.status || 'active', new Date(), new Date(), agent.agent_id, agent.farm_id, agent.agent_id.toString()]
          );
        }
      } catch (dbError) {
        console.error(`[CoordinationService] Failed to sync agent ${agent.agent_id} to database:`, dbError);
        // Continue processing other agents even if one fails
      }
    }
    
    // Emit agents updated event
    this.emit('agents:updated', agentArray);
    
    // Also update multi-claude integration
    multiClaudeIntegration.emit('agent:updated', { data: agentArray });
    
    // Emit individual agent status events
    agentArray.forEach(agent => {
      this.emit('agent:status', {
        agentId: agent.agent_id,
        farmId: agent.farm_id,
        harvestId: agent.harvest_id,
        status: agent.status,
        timestamp: agent.started,
        sessionName: agent.name || agent.session_name // Use name if available
      });
    });
    
    console.log(`[CoordinationService] Active agents updated from file: ${agentArray.length} agents`);
  }
  
  /**
   * Start agent health monitoring
   */
  private startAgentHealthMonitoring() {
    // Check agent health every 5 seconds
    this.agentHealthCheckInterval = setInterval(async () => {
      try {
        const agents = await this.getActiveAgents();
        const now = Date.now();
        
        if (Array.isArray(agents)) {
          agents.forEach(agent => {
            const lastUpdate = new Date(agent.started || agent.timestamp).getTime();
            const timeSinceUpdate = now - lastUpdate;
            
            // Emit health warning if no update for 60 seconds
            if (timeSinceUpdate > 60000) {
              this.emit('health:warning', {
                agentId: agent.agent_id,
                type: 'stale',
                message: `Agent ${agent.agent_id} has not updated for ${Math.round(timeSinceUpdate / 1000)} seconds`,
                severity: timeSinceUpdate > 120000 ? 'critical' : 'warning'
              });
            }
          });
        }
      } catch (error) {
        console.error('[CoordinationService] Error in agent health monitoring:', error);
      }
    }, 5000);
  }
  
  /**
   * Get Redis store for direct access (new feature)
   */
  public getStore(): RedisCoordinationStore {
    return this.store;
  }

  /**
   * Get session controller for direct access (new feature)
   */
  public getSessionController(): SessionController {
    return this.sessionController;
  }

  /**
   * Enable/disable Redis coordination (for debugging/testing)
   */
  public setRedisCoordination(enabled: boolean): void {
    this.useRedisCoordination = enabled;
    console.log(`[CoordinationService] Redis coordination ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable/disable legacy fallback (for migration)
   */
  public setLegacyFallback(enabled: boolean): void {
    this.useLegacyFallback = enabled;
    console.log(`[CoordinationService] Legacy fallback ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Clean up resources
   */
  public async destroy() {
    // Destroy Redis-based services
    if (this.coordinator) {
      await this.coordinator.destroy();
    }

    // Clean up legacy services
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    if (this.agentHealthCheckInterval) {
      clearInterval(this.agentHealthCheckInterval);
      this.agentHealthCheckInterval = null;
    }
    
    if (this.useLegacyFallback) {
      // Destroy file watcher
      fileWatcher.destroy();
      multiClaudeIntegration.destroy();
      workCoordinationService.destroy();
    }
    
    this.removeAllListeners();
    
    console.log('[CoordinationService] Service destroyed');
  }
}

// Export singleton instance
export const coordinationService = new CoordinationService();