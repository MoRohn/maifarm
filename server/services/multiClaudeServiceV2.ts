/**
 * Multi-Claude Service V2
 * Refactored to use AtomicCoordinator and Redis-based state management
 * Eliminates race conditions and provides reliable farm operations
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../database/connection';
import { RedisCoordinationStore, FarmState, AgentState } from './redisCoordinationStore';
import { SessionController, TmuxSession } from './sessionController';
import { websocketManager } from '../websocket/websocketManager';
import { aiProviderManager } from '../config/aiProviders';
import { pathConfig } from '../config/paths';
import { fileManager } from './fileManagerService';
import { workspaceManager } from './workspaceManager';
import { agentCleanupService } from './agentCleanupService';
import { barnCatalogService } from './barnCatalogService';
import { db } from '../database/connection';

// Define FarmLaunchRequest interface locally (was in atomicCoordinator)
interface FarmLaunchRequest {
  farmId: string;
  prompt: string;
  agentCount: number;
  config?: {
    timeout?: number;
    maxRetries?: number;
    provider?: string;
    workingDirectory?: string;
  };
  metadata?: any;
}

export interface LaunchOptionsV2 {
  farmId: string;
  name: string;
  description: string;
  numberOfAgents: number;
  prompt: string;
  yamlContent?: string;
  steps?: string[];
  collaborative?: boolean;
  bundleSteps?: number;
  attachments?: Array<{
    path: string;
    type: 'image' | 'file';
    mimeType?: string;
  }>;
  workingDirectory?: string;
  workspaceTemplate?: string;
  contextFiles?: string[];
  staggerDelay?: number;
  debug?: boolean;
  provider?: 'claude' | 'qwen';
  farmerTemplateId?: string;
  farmerTemplateName?: string;
  barnReferences?: string[];
  includeBarnCatalog?: boolean;
  timeout?: number;
  maxRetries?: number;
}

interface AgentProcess {
  farmId: string;
  agentId: string;
  process: ChildProcess | null;
  paneIndex: number;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error' | 'stopped';
  terminalBuffer: string[];
  lastActivity: Date;
  config: {
    provider: string;
    workingDirectory: string;
    prompt: string;
  };
}

/**
 * Enhanced MultiClaudeService using atomic operations
 */
class MultiClaudeServiceV2 extends EventEmitter {
  private store: RedisCoordinationStore;
  private sessionController: SessionController;
  
  private agentProcesses: Map<string, AgentProcess> = new Map(); // agentId -> process
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  private readonly ORCHESTRATOR_PATH = path.join(process.cwd(), 'orchestrator.py');
  private readonly BUFFER_LIMIT = 1000;
  private paths = pathConfig.getPaths();

  constructor() {
    super();
    
    // Initialize atomic coordinator
    this.store = new RedisCoordinationStore(redis);
    this.sessionController = new SessionController(redis);
    
    this.setupEventHandlers();
    this.startGlobalMonitoring();
  }

  /**
   * Launch farm using atomic operations
   */
  async launchFarm(options: LaunchOptionsV2): Promise<{ 
    success: boolean; 
    farmId?: string; 
    sessionId?: string; 
    error?: string;
  }> {
    try {
      // Prepare farm launch request
      const request: FarmLaunchRequest = {
        farmId: options.farmId,
        prompt: options.prompt,
        agentCount: options.numberOfAgents,
        config: {
          timeout: options.timeout || 300000, // 5 minutes default
          maxRetries: options.maxRetries || 3,
          provider: options.provider || 'claude',
          workingDirectory: pathConfig.getFarmWorkspacePath(options.farmId, false)
        },
        metadata: {
          name: options.name,
          description: options.description,
          yamlContent: options.yamlContent,
          steps: options.steps,
          collaborative: options.collaborative,
          attachments: options.attachments,
          contextFiles: options.contextFiles,
          debug: options.debug,
          farmerTemplateId: options.farmerTemplateId,
          barnReferences: options.barnReferences,
          includeBarnCatalog: options.includeBarnCatalog
        }
      };

      // Execute farm launch directly using store
      const farmState: FarmState = {
        farmId: request.farmId,
        status: 'starting',
        agentCount: request.agentCount,
        agents: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const created = await this.store.createFarm(farmState);
      const result = { success: created, farmId: request.farmId };
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Unknown error during farm launch'
        };
      }

      // Start agent processes after atomic launch
      if (result.farmState && result.session && result.agents) {
        await this.initializeAgentProcesses(
          result.farmState,
          result.session,
          result.agents,
          options
        );
      }

      return {
        success: true,
        farmId: options.farmId,
        sessionId: result.session?.id
      };

    } catch (error) {
      console.error('[MultiClaudeServiceV2] Farm launch failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Stop farm using atomic operations
   */
  async stopFarm(farmId: string, force: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      // Stop all agent processes first
      await this.stopAgentProcesses(farmId);
      
      // Execute atomic farm stop
      // Stop farm directly using store
      const updated = await this.store.updateFarmStatus(farmId, 'stopped');
      const result = { success: updated };
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Unknown error during farm stop'
        };
      }

      // Cleanup monitoring
      this.cleanupFarmMonitoring(farmId);

      return { success: true };

    } catch (error) {
      console.error('[MultiClaudeServiceV2] Farm stop failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get farm status from Redis store
   */
  async getFarmStatus(farmId: string): Promise<{
    farm: FarmState | null;
    agents: AgentState[];
    session: TmuxSession | null;
  }> {
    const [farm, agents, session] = await Promise.all([
      this.store.getFarmState(farmId),
      this.store.getFarmAgents(farmId),
      this.sessionController.getSessionByFarm(farmId)
    ]);

    return { farm, agents, session };
  }

  /**
   * Send command to specific agent
   */
  async sendAgentCommand(farmId: string, agentIndex: number, command: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const session = await this.sessionController.getSessionByFarm(farmId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      await this.sessionController.sendCommand(session.id, agentIndex, command);
      
      // Update agent activity
      const agents = await this.store.getFarmAgents(farmId);
      const agent = agents[agentIndex];
      if (agent) {
        await this.store.updateAgentState(agent.id, {
          status: 'working',
          currentTask: command,
          lastHeartbeat: new Date()
        });
      }

      return { success: true };

    } catch (error) {
      console.error('[MultiClaudeServiceV2] Send command failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get agent terminal output
   */
  async getAgentTerminal(farmId: string, agentIndex: number, lines: number = 50): Promise<{
    success: boolean;
    output?: string;
    error?: string;
  }> {
    try {
      const session = await this.sessionController.getSessionByFarm(farmId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const output = await this.sessionController.capturePane(session.id, agentIndex, lines);
      return { success: true, output };

    } catch (error) {
      console.error('[MultiClaudeServiceV2] Get terminal failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * List all farms
   */
  async listFarms(): Promise<FarmState[]> {
    // Get all farm keys from Redis
    const pattern = 'maifarm:coordination:farm:*';
    const keys = await redis.keys(pattern);
    
    const farms: FarmState[] = [];
    for (const key of keys) {
      const farmId = key.split(':').pop();
      if (farmId) {
        const farm = await this.store.getFarmState(farmId);
        if (farm) {
          farms.push(farm);
        }
      }
    }
    
    return farms.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * Initialize agent processes after atomic launch
   */
  private async initializeAgentProcesses(
    farmState: FarmState,
    session: TmuxSession,
    agents: AgentState[],
    options: LaunchOptionsV2
  ): Promise<void> {
    console.log(`[MultiClaudeServiceV2] Initializing ${agents.length} agent processes for farm ${farmState.id}`);

    // Prepare workspace if needed
    if (options.workingDirectory) {
      await workspaceManager.createWorkspace(farmState.id, {
        templateId: options.workspaceTemplate,
        contextFiles: options.contextFiles,
        baseDirectory: options.workingDirectory
      });
    }

    // Get barn catalog if requested
    let barnContext = '';
    if (options.includeBarnCatalog) {
      try {
        const catalog = await barnCatalogService.generateCatalogContext(
          options.barnReferences || []
        );
        barnContext = catalog;
      } catch (error) {
        console.warn('[MultiClaudeServiceV2] Failed to get barn catalog:', error);
      }
    }

    // Start each agent process
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const staggerDelay = (options.staggerDelay || 0) * i;
      
      setTimeout(async () => {
        try {
          await this.startAgentProcess(agent, session, options, barnContext);
        } catch (error) {
          console.error(`[MultiClaudeServiceV2] Failed to start agent ${agent.id}:`, error);
          
          // Mark agent as error
          await this.store.updateAgentState(agent.id, {
            status: 'error',
            metadata: { 
              ...agent.metadata, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            }
          });
        }
      }, staggerDelay);
    }

    // Start monitoring for this farm
    this.startFarmMonitoring(farmState.id);
  }

  /**
   * Start individual agent process
   */
  private async startAgentProcess(
    agent: AgentState,
    session: TmuxSession,
    options: LaunchOptionsV2,
    barnContext: string
  ): Promise<void> {
    const agentProcess: AgentProcess = {
      farmId: agent.farmId,
      agentId: agent.id,
      process: null,
      paneIndex: parseInt(agent.metadata.agentIndex || '0'),
      status: 'starting',
      terminalBuffer: [],
      lastActivity: new Date(),
      config: {
        provider: options.provider || 'claude',
        workingDirectory: pathConfig.getFarmWorkspacePath(agent.farmId, false),
        prompt: this.buildAgentPrompt(options, barnContext, agent.metadata.agentIndex)
      }
    };

    this.agentProcesses.set(agent.id, agentProcess);

    // Send initial command to start Claude CLI
    const startCommand = this.buildClaudeCommand(agentProcess.config);
    await this.sessionController.sendCommand(session.id, agentProcess.paneIndex, startCommand);

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Send initial prompt
    const promptCommand = this.buildPromptCommand(agentProcess.config.prompt);
    await this.sessionController.sendCommand(session.id, agentProcess.paneIndex, promptCommand);

    // Update agent state
    await this.store.updateAgentState(agent.id, {
      status: 'ready',
      currentTask: 'Initialized with prompt',
      lastHeartbeat: new Date()
    });

    agentProcess.status = 'ready';
    
    console.log(`[MultiClaudeServiceV2] Started agent ${agent.id} in pane ${agentProcess.paneIndex}`);
  }

  /**
   * Build Claude CLI command
   */
  private buildClaudeCommand(config: { provider: string; workingDirectory: string }): string {
    const claudeCmd = ['claude'];
    
    // Add provider-specific options
    if (config.provider === 'qwen') {
      claudeCmd.push('--provider', 'qwen');
    }
    
    // Change to working directory first
    return `cd "${config.workingDirectory}" && ${claudeCmd.join(' ')}`;
  }

  /**
   * Build agent prompt with context
   */
  private buildAgentPrompt(options: LaunchOptionsV2, barnContext: string, agentIndex?: number): string {
    let prompt = options.prompt;

    // Add agent-specific context
    if (typeof agentIndex === 'number' && options.numberOfAgents > 1) {
      prompt = `[Agent ${agentIndex + 1}/${options.numberOfAgents}] ${prompt}`;
    }

    // Add barn context if available
    if (barnContext) {
      prompt = `${prompt}\n\n## Available Barn Resources:\n${barnContext}`;
    }

    // Add steps if provided
    if (options.steps && options.steps.length > 0) {
      prompt += '\n\n## Steps to follow:\n';
      options.steps.forEach((step, i) => {
        prompt += `${i + 1}. ${step}\n`;
      });
    }

    // Add context files if provided
    if (options.contextFiles && options.contextFiles.length > 0) {
      prompt += '\n\n## Context Files Available:\n';
      options.contextFiles.forEach(file => {
        prompt += `- ${file}\n`;
      });
    }

    return prompt;
  }

  /**
   * Build prompt command for Claude CLI
   */
  private buildPromptCommand(prompt: string): string {
    // Escape quotes and newlines for shell
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
    
    return `echo "${escapedPrompt}"`;
  }

  /**
   * Stop all agent processes for a farm
   */
  private async stopAgentProcesses(farmId: string): Promise<void> {
    const farmAgents = Array.from(this.agentProcesses.values())
      .filter(process => process.farmId === farmId);

    for (const agentProcess of farmAgents) {
      try {
        // Update agent state
        await this.store.updateAgentState(agentProcess.agentId, {
          status: 'stopped',
          lastHeartbeat: new Date()
        });

        // Kill process if running
        if (agentProcess.process && !agentProcess.process.killed) {
          agentProcess.process.kill('SIGTERM');
        }

        agentProcess.status = 'stopped';
        this.agentProcesses.delete(agentProcess.agentId);
        
      } catch (error) {
        console.error(`[MultiClaudeServiceV2] Error stopping agent ${agentProcess.agentId}:`, error);
      }
    }
  }

  /**
   * Start monitoring for a specific farm
   */
  private startFarmMonitoring(farmId: string): void {
    // Monitor every 30 seconds
    const interval = setInterval(async () => {
      try {
        await this.checkFarmHealth(farmId);
      } catch (error) {
        console.error(`[MultiClaudeServiceV2] Farm monitoring error for ${farmId}:`, error);
      }
    }, 30000);

    this.monitoringIntervals.set(farmId, interval);
  }

  /**
   * Check farm health and update states
   */
  private async checkFarmHealth(farmId: string): Promise<void> {
    const { farm, agents, session } = await this.getFarmStatus(farmId);
    
    if (!farm || farm.status !== 'running') {
      return; // Farm is not active
    }

    let healthyAgents = 0;
    let errorAgents = 0;

    // Check each agent
    for (const agent of agents) {
      const agentProcess = this.agentProcesses.get(agent.id);
      const now = Date.now();
      const timeSinceHeartbeat = now - agent.lastHeartbeat.getTime();

      // Agent is stale if no heartbeat for 2 minutes
      if (timeSinceHeartbeat > 120000) {
        if (agent.status !== 'error') {
          await this.store.updateAgentState(agent.id, {
            status: 'error',
            metadata: {
              ...agent.metadata,
              error: 'Agent became unresponsive',
              lastSeen: agent.lastHeartbeat.toISOString()
            }
          });
          errorAgents++;
        }
      } else if (agent.status === 'ready' || agent.status === 'working' || agent.status === 'idle') {
        healthyAgents++;
        
        // Send periodic heartbeat
        await this.store.recordHeartbeat(agent.id, {
          processActive: agentProcess ? !agentProcess.process?.killed : false,
          lastActivity: agentProcess?.lastActivity?.toISOString()
        });
      }
    }

    // Update farm metrics
    await this.store.updateFarmState(farmId, {
      lastUpdate: new Date()
    });

    // Emit health status
    this.emit('farm:health', {
      farmId,
      healthyAgents,
      totalAgents: agents.length,
      errorAgents,
      sessionActive: session?.status === 'active'
    });

    // Check if farm should be marked as failed
    if (errorAgents > 0 && healthyAgents === 0) {
      console.warn(`[MultiClaudeServiceV2] All agents in farm ${farmId} have failed`);
      
      await this.store.updateFarmState(farmId, {
        status: 'error',
        lastUpdate: new Date()
      });

      this.emit('farm:failed', {
        farmId,
        reason: 'All agents failed',
        timestamp: new Date()
      });
    }
  }

  /**
   * Cleanup monitoring for a farm
   */
  private cleanupFarmMonitoring(farmId: string): void {
    const interval = this.monitoringIntervals.get(farmId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(farmId);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Since we removed AtomicCoordinator, we'll handle events directly
    // The store and sessionController don't emit events by default
    // So we'll emit events when we perform actions instead

    // Forward store events for Redis updates
    this.store.on('redis:systemEvents', (event) => {
      if (event.type === 'health:warning') {
        this.emit('health:warning', event);
      }
    });
  }

  /**
   * Start global monitoring
   */
  private startGlobalMonitoring(): void {
    // Monitor all farms every minute
    setInterval(async () => {
      try {
        const farms = await this.listFarms();
        
        for (const farm of farms) {
          if (farm.status === 'running') {
            await this.checkFarmHealth(farm.id);
          }
        }
      } catch (error) {
        console.error('[MultiClaudeServiceV2] Global monitoring error:', error);
      }
    }, 60000);
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<{
    totalFarms: number;
    activeFarms: number;
    totalAgents: number;
    activeAgents: number;
    activeSessions: number;
  }> {
    const farms = await this.listFarms();
    const activeFarms = farms.filter(f => f.status === 'running');
    const sessions = await this.sessionController.listSessions();
    const activeSessions = sessions.filter(s => s.status === 'active');
    
    let totalAgents = 0;
    let activeAgents = 0;
    
    for (const farm of farms) {
      const agents = await this.store.getFarmAgents(farm.id);
      totalAgents += agents.length;
      activeAgents += agents.filter(a => a.status === 'ready' || a.status === 'working' || a.status === 'idle').length;
    }

    return {
      totalFarms: farms.length,
      activeFarms: activeFarms.length,
      totalAgents,
      activeAgents,
      activeSessions: activeSessions.length
    };
  }

  /**
   * Cleanup and destroy
   */
  async destroy(): Promise<void> {
    // Stop all agent processes
    for (const [agentId, agentProcess] of this.agentProcesses) {
      if (agentProcess.process && !agentProcess.process.killed) {
        agentProcess.process.kill('SIGTERM');
      }
    }
    this.agentProcesses.clear();

    // Clear monitoring intervals
    for (const interval of this.monitoringIntervals.values()) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();

    // Destroy coordinator
    // Clean up resources
    // Store and sessionController don't have destroy methods by default
    
    this.removeAllListeners();
    console.log('[MultiClaudeServiceV2] Destroyed');
  }
}

// Export singleton instance
export const multiClaudeServiceV2 = new MultiClaudeServiceV2();