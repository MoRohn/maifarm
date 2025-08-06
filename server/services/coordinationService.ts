/**
 * Coordination Service
 * Central service for coordinating multi-agent activities and WebSocket updates
 */

import { EventEmitter } from 'events';
import { multiClaudeIntegration } from './multiClaudeIntegration';
import { workCoordinationService } from './workCoordination';
import * as fs from 'fs/promises';
import * as path from 'path';
import { watchFile } from 'fs';
import { fileWatcher } from './coordinationFileWatcher';

interface CoordinationEvent {
  type: string;
  data: any;
  timestamp: string;
  source: string;
}

class CoordinationService extends EventEmitter {
  private coordinationDir = '/tmp/claude_coordination';
  private harvestDir = path.join(this.coordinationDir, 'harvests');
  private activeAgentsFile = path.join(this.coordinationDir, 'active_agents.json');
  private workClaimsDir = path.join(this.coordinationDir, 'work_claims');
  private isInitialized = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private agentHealthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initialize();
  }

  private async initialize() {
    try {
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
      
      // Start agent health monitoring
      this.startAgentHealthMonitoring();
      
      this.isInitialized = true;
      console.log('[CoordinationService] Initialized successfully with file watching');
    } catch (error) {
      console.error('[CoordinationService] Failed to initialize:', error);
    }
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
            timestamp: agent.started,
            currentStep: agent.current_step
          });
          
          // Register agent with harvest if harvestId is present
          if (agent.harvest_id) {
            const { harvestService } = await import('./harvestService');
            await harvestService.registerAgent(agent.harvest_id, agent.agent_id, {
              farmId: agent.farm_id,
              sessionName: agent.session_name,
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
          artifacts: harvest.artifacts || [],
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
   * Get health summary for all agents
   */
  public getHealthSummary() {
    const agents = this.getActiveAgents();
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

  /**
   * Get health status for all agents
   */
  public getAllAgentHealth() {
    const agents = this.getActiveAgents();
    return agents.map(agent => this.getAgentHealth(agent.agent_id));
  }

  /**
   * Get health status for a specific agent
   */
  public getAgentHealth(agentId: string) {
    const agents = this.getActiveAgents();
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
      const agents = this.getActiveAgents();
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
   * Get active agents
   */
  public getActiveAgents() {
    return multiClaudeIntegration.getAgents();
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
      
      const report = {
        id: reportId,
        farmId,
        timestamp: new Date().toISOString(),
        results,
        agentCount: this.getActiveAgents().length,
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
  private handleActiveAgentsFileUpdate(agents: any) {
    // Convert agents object to array format
    const agentArray = Object.entries(agents || {}).map(([id, agent]: [string, any]) => ({
      ...agent,
      id,
      agent_id: id
    }));
    
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
        sessionName: agent.session_name
      });
    });
    
    console.log(`[CoordinationService] Active agents updated from file: ${agentArray.length} agents`);
  }
  
  /**
   * Start agent health monitoring
   */
  private startAgentHealthMonitoring() {
    // Check agent health every 5 seconds
    this.agentHealthCheckInterval = setInterval(() => {
      const agents = this.getActiveAgents();
      const now = Date.now();
      
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
    }, 5000);
  }
  
  /**
   * Clean up resources
   */
  public async destroy() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    if (this.agentHealthCheckInterval) {
      clearInterval(this.agentHealthCheckInterval);
      this.agentHealthCheckInterval = null;
    }
    
    // Destroy file watcher
    fileWatcher.destroy();
    
    this.removeAllListeners();
    multiClaudeIntegration.destroy();
    workCoordinationService.destroy();
    
    console.log('[CoordinationService] Service destroyed');
  }
}

// Export singleton instance
export const coordinationService = new CoordinationService();