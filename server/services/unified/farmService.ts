/**
 * Unified Farm Service
 * Consolidates all farm management, lifecycle, and orchestration functionality
 * Replaces: farmManager, farmLauncher, robustFarmLauncher, farmLifecycleManager, etc.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { db, redis } from '../../database/connection';
import { websocketManager } from '../../websocket/websocketManager';
import { terminalService } from './terminalService';
import { logger } from '../../utils/logger';
import { pathConfig } from '../../config/paths';
import { shutdownCoordinator } from '../shutdownCoordinator';
import { lockManager } from '../../utils/AsyncLock';
import { workspaceManager } from '../workspaceManager';
import { getFarmAgentName } from '../../utils/farmAgentNames';
import {
  MaiFarmError,
  FarmError,
  ErrorCode,
  ErrorSeverity,
  ErrorContext,
  ErrorHandler
} from '../../types/errors';
import {
  QUICK_TASK_TIMEOUT,
  GRACEFUL_SHUTDOWN_PERIOD,
  calculateGracefulShutdownTime
} from '../../constants/timing';

export enum FarmStatus {
  IDLE = 'idle',
  LAUNCHING = 'launching',
  ACTIVE = 'active',
  RUNNING = 'running',
  HARVESTING = 'harvesting',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated',
  ORPHANED = 'orphaned'
}

export enum FarmMode {
  SEQUENTIAL = 'sequential',
  COLLABORATIVE = 'collaborative',
  AUTONOMOUS = 'autonomous',
  GO_WILD = 'gowild',
  QUICK_TASK = 'quick-task'
}

export interface FarmConfig {
  id?: string;
  name: string;
  description: string;
  mode: FarmMode;
  provider: 'claude' | 'openai' | 'qwen' | 'ollama';
  numberOfAgents: number;
  prompt: string;
  yamlContent?: string;
  timeout?: number;
  userId?: string;
  farmerTemplateId?: string;
  farmerTemplateName?: string;
  contextFiles?: string[];
  barnReferences?: string[];
  staggerDelay?: number;
  debug?: boolean;
}

export interface Farm {
  id: string;
  name: string;
  description: string;
  mode: FarmMode;
  status: FarmStatus;
  provider: string;
  config: any;
  agents: Agent[];
  sessionName: string;
  workspacePath: string;
  harvestId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metrics: FarmMetrics;
}

export interface Agent {
  id: string;
  farmId: string;
  name: string;
  index: number;
  status: 'idle' | 'active' | 'working' | 'completed' | 'failed';
  paneId: string;
  lastHeartbeat: Date;
}

export interface FarmMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  duration: number;
  efficiency: number;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
}

export interface LaunchResult {
  success: boolean;
  farmId: string;
  sessionName?: string;
  error?: string;
  retryable?: boolean;
}

class UnifiedFarmService extends EventEmitter {
  private static instance: UnifiedFarmService;
  private farms: Map<string, Farm> = new Map();
  private farmProcesses: Map<string, ChildProcess> = new Map();
  private farmTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private launchRetries: Map<string, number> = new Map();
  private readonly MAX_LAUNCH_RETRIES = 3;
  private readonly ORCHESTRATOR_PATH = path.join(process.cwd(), 'orchestrator.py');
  private readonly paths = pathConfig.getPaths();
  private reconciliationInterval: NodeJS.Timer | null = null;

  private constructor() {
    super();
    this.initialize();
  }

  public static getInstance(): UnifiedFarmService {
    if (!UnifiedFarmService.instance) {
      UnifiedFarmService.instance = new UnifiedFarmService();
    }
    return UnifiedFarmService.instance;
  }

  private async initialize(): Promise<void> {
    // Load persisted farms
    await this.loadPersistedFarms();

    // Start periodic reconciliation
    this.startPeriodicReconciliation();

    // Setup event handlers
    this.setupEventHandlers();

    logger.info('UnifiedFarmService initialized', {
      activeFarms: this.farms.size
    });
  }

  /**
   * Create and launch a new farm with race condition protection
   */
  public async createFarm(config: FarmConfig): Promise<LaunchResult> {
    const farmId = config.id || uuidv4();
    const sessionName = `farm-${farmId}`;

    // Acquire lock to prevent concurrent farm creation with same ID
    const releaseLock = await lockManager.acquire(`farm:create:${farmId}`, 'farmService');

    try {
      // Check if farm already exists (double-check after lock)
      if (this.farms.has(farmId)) {
        throw new FarmError(
          `Farm ${farmId} already exists`,
          ErrorCode.FARM_ALREADY_EXISTS,
          { farmId }
        );
      }

      // Validate configuration
      this.validateFarmConfig(config);

      // Create farm record
      const farm: Farm = {
        id: farmId,
        name: config.name,
        description: config.description,
        mode: config.mode,
        status: FarmStatus.LAUNCHING,
        provider: config.provider,
        config: {
          maxAgents: config.numberOfAgents,
          timeout: config.timeout || this.getDefaultTimeout(config.mode),
          yamlContent: config.yamlContent,
          contextFiles: config.contextFiles,
          barnReferences: config.barnReferences
        },
        agents: [],
        sessionName,
        workspacePath: '',
        createdBy: config.userId || '00000000-0000-0000-0000-000000000000', // Use system UUID instead of 'system'
        createdAt: new Date(),
        updatedAt: new Date(),
        metrics: this.getDefaultFarmMetrics()
      };

      // Create workspace BEFORE persisting
      farm.workspacePath = await this.createWorkspace(farmId);

      // Store farm
      this.farms.set(farmId, farm);
      await this.persistFarm(farm);

      // Launch farm with retry logic
      const launchResult = await this.launchWithRetry(farm, config);

      if (!launchResult.success) {
        farm.status = FarmStatus.FAILED;
        await this.updateFarmStatus(farmId, FarmStatus.FAILED);
        return launchResult;
      }

      // Setup monitoring and timeouts
      this.setupFarmMonitoring(farm, config);

      // Broadcast farm creation
      this.broadcastFarmEvent('farm:created', farm);

      return {
        success: true,
        farmId,
        sessionName
      };

    } catch (error) {
      const maifarmError = ErrorHandler.handle(error, { farmId });
      logger.error('Farm creation failed', maifarmError);

      return {
        success: false,
        farmId,
        error: maifarmError.message,
        retryable: maifarmError.isRetryable
      };
    } finally {
      // Always release the lock
      releaseLock();
    }
  }

  /**
   * Launch farm with retry logic
   */
  private async launchWithRetry(farm: Farm, config: FarmConfig): Promise<LaunchResult> {
    const maxRetries = this.MAX_LAUNCH_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Launching farm ${farm.id} (attempt ${attempt}/${maxRetries})`);

        // Create tmux session
        await terminalService.createSession(farm.id, config.numberOfAgents);

        // Launch orchestrator
        await this.launchOrchestrator(farm, config);

        // Wait for agents to be ready
        await this.waitForAgents(farm.id, config.numberOfAgents);

        // Update farm status
        farm.status = FarmStatus.ACTIVE;
        farm.startedAt = new Date();
        await this.updateFarmStatus(farm.id, FarmStatus.ACTIVE);

        return { success: true, farmId: farm.id, sessionName: farm.sessionName };

      } catch (error) {
        lastError = error;
        logger.warn(`Farm launch attempt ${attempt} failed:`, error);

        if (attempt < maxRetries) {
          await this.delay(2000 * attempt); // Exponential backoff
        }
      }
    }

    throw new FarmError(
      ErrorCode.FARM_LAUNCH_FAILED,
      `Failed to launch farm after ${maxRetries} attempts: ${lastError?.message}`,
      { farmId: farm.id }
    );
  }

  /**
   * Launch the orchestrator process
   */
  private async launchOrchestrator(farm: Farm, config: FarmConfig): Promise<void> {
    // Prepare YAML file if provided
    let yamlPath: string | undefined;
    if (config.yamlContent) {
      yamlPath = path.join(farm.workspacePath, 'config.yaml');
      await fs.writeFile(yamlPath, config.yamlContent);
    }

    // Build orchestrator command
    const args = [
      this.ORCHESTRATOR_PATH,
      '-n', config.numberOfAgents.toString(),
      '-p', config.prompt,
      '--farm-id', farm.id,
      '--session-name', farm.sessionName
    ];

    if (yamlPath) {
      args.push('--yaml', yamlPath);
    }

    if (config.provider !== 'claude') {
      args.push('--provider', config.provider);
    }

    if (config.staggerDelay === 0) {
      args.push('--fast-launch');
    }

    // Spawn orchestrator process (use python3 for compatibility)
    const orchestrator = spawn('python3', args, {
      cwd: farm.workspacePath,
      env: {
        ...process.env,
        FARM_ID: farm.id,
        AI_PROVIDER: config.provider,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY
      }
    });

    // Store process reference
    this.farmProcesses.set(farm.id, orchestrator);

    // Handle orchestrator output
    orchestrator.stdout.on('data', (data) => {
      logger.info(`[Orchestrator ${farm.id}] ${data.toString()}`);
    });

    orchestrator.stderr.on('data', (data) => {
      logger.error(`[Orchestrator ${farm.id} ERROR] ${data.toString()}`);
    });

    orchestrator.on('exit', (code) => {
      logger.info(`Orchestrator ${farm.id} exited with code ${code}`);
      this.farmProcesses.delete(farm.id);
    });
  }

  /**
   * Wait for agents to be ready
   */
  private async waitForAgents(farmId: string, expectedCount: number, timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const farm = this.farms.get(farmId);
      if (!farm) throw new Error('Farm not found');

      // Check if agents are created in database
      const agents = await this.getAgentsFromDatabase(farmId);
      if (agents.length >= expectedCount) {
        // Update farm agents
        farm.agents = agents.map((agent, index) => ({
          id: agent.id,
          farmId,
          name: getFarmAgentName(index + 1),
          index,
          status: 'active' as const,
          paneId: `${farm.sessionName}:0.${index}`,
          lastHeartbeat: new Date()
        }));

        return;
      }

      await this.delay(500);
    }

    throw new FarmError(
      ErrorCode.AGENT_LAUNCH_FAILED,
      `Timeout waiting for ${expectedCount} agents`,
      { farmId }
    );
  }

  /**
   * Update farm status
   */
  public async updateFarmStatus(farmId: string, status: FarmStatus): Promise<void> {
    const farm = this.farms.get(farmId);
    if (!farm) {
      throw new FarmError(
        ErrorCode.FARM_NOT_FOUND,
        `Farm ${farmId} not found`,
        { farmId }
      );
    }

    const previousStatus = farm.status;
    farm.status = status;
    farm.updatedAt = new Date();

    // Update database
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      [status, farm.updatedAt, farmId]
    );

    // Handle status-specific actions
    switch (status) {
      case FarmStatus.COMPLETED:
      case FarmStatus.FAILED:
        farm.completedAt = new Date();
        await this.handleFarmCompletion(farm);
        break;
      case FarmStatus.HARVESTING:
        await this.initiatHarvest(farm);
        break;
    }

    // Broadcast status change
    this.broadcastFarmEvent('farm:status:changed', {
      farmId,
      previousStatus,
      currentStatus: status
    });

    logger.info(`Farm ${farmId} status changed: ${previousStatus} -> ${status}`);
  }

  /**
   * Stop a farm
   */
  public async stopFarm(farmId: string): Promise<void> {
    const farm = this.farms.get(farmId);
    if (!farm) {
      throw new FarmError(
        ErrorCode.FARM_NOT_FOUND,
        `Farm ${farmId} not found`,
        { farmId }
      );
    }

    try {
      // Clear timeout if exists
      const timeout = this.farmTimeouts.get(farmId);
      if (timeout) {
        clearTimeout(timeout);
        this.farmTimeouts.delete(farmId);
      }

      // Kill orchestrator process
      const process = this.farmProcesses.get(farmId);
      if (process) {
        process.kill('SIGTERM');
        this.farmProcesses.delete(farmId);
      }

      // Stop terminal session
      await terminalService.stopSession(farm.sessionName);

      // Update status
      await this.updateFarmStatus(farmId, FarmStatus.TERMINATED);

      logger.info(`Farm ${farmId} stopped successfully`);

    } catch (error) {
      logger.error(`Error stopping farm ${farmId}:`, error);
      throw new FarmError(
        ErrorCode.FARM_OPERATION_FAILED,
        `Failed to stop farm: ${error.message}`,
        { farmId }
      );
    }
  }

  /**
   * Handle farm completion
   */
  private async handleFarmCompletion(farm: Farm): Promise<void> {
    try {
      // Calculate metrics
      const duration = farm.completedAt!.getTime() - farm.startedAt!.getTime();
      farm.metrics.duration = duration;
      farm.metrics.efficiency = this.calculateEfficiency(farm);

      // Trigger harvest
      await this.initiatHarvest(farm);

      // Cleanup resources
      await this.cleanupFarmResources(farm);

      logger.info(`Farm ${farm.id} completed. Duration: ${duration}ms`);

    } catch (error) {
      logger.error(`Error handling farm completion for ${farm.id}:`, error);
    }
  }

  /**
   * Initiate harvest for a farm
   */
  private async initiatHarvest(farm: Farm): Promise<void> {
    try {
      const { harvestService } = await import('../harvestService');
      const harvest = await harvestService.startHarvest(
        farm.id,
        farm.name,
        farm.createdBy
      );
      farm.harvestId = harvest.id;

      logger.info(`Harvest ${harvest.id} initiated for farm ${farm.id}`);

    } catch (error) {
      logger.error(`Failed to initiate harvest for farm ${farm.id}:`, error);
    }
  }

  /**
   * Setup farm monitoring and timeouts
   */
  private setupFarmMonitoring(farm: Farm, config: FarmConfig): void {
    const timeout = config.timeout || this.getDefaultTimeout(config.mode);

    // Setup timeout
    const timeoutHandle = setTimeout(async () => {
      logger.warn(`Farm ${farm.id} timed out after ${timeout}ms`);

      // Trigger graceful shutdown
      await shutdownCoordinator.initiateShutdown(farm.id, 'timeout');

      // After grace period, force stop
      setTimeout(async () => {
        if (this.farms.get(farm.id)?.status !== FarmStatus.COMPLETED) {
          await this.stopFarm(farm.id);
        }
      }, GRACEFUL_SHUTDOWN_PERIOD);

    }, timeout);

    this.farmTimeouts.set(farm.id, timeoutHandle);

    // Setup health monitoring
    this.monitorFarmHealth(farm);
  }

  /**
   * Monitor farm health
   */
  private monitorFarmHealth(farm: Farm): void {
    const healthInterval = setInterval(async () => {
      if (farm.status !== FarmStatus.ACTIVE && farm.status !== FarmStatus.RUNNING) {
        clearInterval(healthInterval);
        return;
      }

      try {
        // Check terminal session health
        const sessionHealth = await terminalService.getHealthStatus();

        // Check agent health
        for (const agent of farm.agents) {
          const timeSinceHeartbeat = Date.now() - agent.lastHeartbeat.getTime();
          if (timeSinceHeartbeat > 120000) { // 2 minutes
            logger.warn(`Agent ${agent.id} unhealthy in farm ${farm.id}`);
            agent.status = 'failed';
          }
        }

        // Update metrics
        await this.updateFarmMetrics(farm);

      } catch (error) {
        logger.error(`Health check failed for farm ${farm.id}:`, error);
      }

    }, 30000); // Every 30 seconds
  }

  /**
   * Validate farm configuration
   */
  private validateFarmConfig(config: FarmConfig): void {
    const errors: string[] = [];

    if (!config.name) errors.push('Farm name is required');
    if (!config.description) errors.push('Farm description is required');
    if (config.numberOfAgents < 1 || config.numberOfAgents > 20) {
      errors.push('Number of agents must be between 1 and 20');
    }

    // Mode-specific validation
    if (config.mode === FarmMode.QUICK_TASK && config.numberOfAgents !== 2) {
      errors.push('Quick tasks must use exactly 2 agents');
    }

    if (errors.length > 0) {
      throw new FarmError(
        ErrorCode.FARM_INVALID_CONFIG,
        `Invalid farm configuration: ${errors.join(', ')}`,
        { config }
      );
    }
  }

  /**
   * Create workspace for farm
   */
  private async createWorkspace(farmId: string): Promise<string> {
    // Use workspaceManager to create the farm workspace properly
    // This creates an isolated workspace with proper structure and AI provider setup
    const workspace = await workspaceManager.createFarmWorkspace(farmId, {
      template: 'default',
      includeBarnAccess: true,
      initAI: true,
      metadata: {
        createdBy: 'UnifiedFarmService',
        timestamp: new Date().toISOString()
      }
    });

    return workspace.path;
  }

  /**
   * Load persisted farms from database
   */
  private async loadPersistedFarms(): Promise<void> {
    try {
      const result = await db.query(
        'SELECT * FROM farms WHERE status NOT IN ($1, $2)',
        ['deleted', 'terminated']
      );

      for (const row of result.rows) {
        const farm: Farm = {
          id: row.id,
          name: row.name,
          description: row.description || '',
          mode: row.config?.mode || FarmMode.COLLABORATIVE,
          status: row.status,
          provider: row.provider || 'claude',
          config: row.config || {},
          agents: [],
          sessionName: row.tmux_session || `farm-${row.id}`,
          workspacePath: row.workspace_path || '',
          harvestId: row.harvest_id,
          createdBy: row.created_by,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          startedAt: row.started_at ? new Date(row.started_at) : undefined,
          completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
          metrics: row.metrics || this.getDefaultFarmMetrics()
        };

        this.farms.set(farm.id, farm);
      }

      logger.info(`Loaded ${this.farms.size} persisted farms`);

    } catch (error) {
      logger.error('Failed to load persisted farms:', error);
    }
  }

  /**
   * Get default farm metrics
   */
  private getDefaultFarmMetrics(): FarmMetrics {
    return {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      duration: 0,
      efficiency: 100
    };
  }

  /**
   * Persist farm to database
   */
  private async persistFarm(farm: Farm): Promise<void> {
    try {
      await db.query(
        `INSERT INTO farms (
          id, name, description, status, provider,
          config, metrics, tmux_session, workspace_path,
          created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          status = $4, metrics = $7, updated_at = $12`,
        [
          farm.id, farm.name, farm.description, farm.status,
          farm.provider, JSON.stringify(farm.config),
          JSON.stringify(farm.metrics), farm.sessionName,
          farm.workspacePath, farm.createdBy,
          farm.createdAt, farm.updatedAt
        ]
      );
    } catch (error) {
      logger.error(`Failed to persist farm ${farm.id}:`, error);
    }
  }

  /**
   * Get agents from database
   */
  private async getAgentsFromDatabase(farmId: string): Promise<any[]> {
    const result = await db.query(
      'SELECT * FROM agents WHERE farm_id = $1',
      [farmId]
    );
    return result.rows;
  }

  /**
   * Update farm metrics
   */
  private async updateFarmMetrics(farm: Farm): Promise<void> {
    // Calculate current metrics
    const completedAgents = farm.agents.filter(a => a.status === 'completed').length;
    const failedAgents = farm.agents.filter(a => a.status === 'failed').length;

    farm.metrics.completedTasks = completedAgents;
    farm.metrics.failedTasks = failedAgents;
    farm.metrics.efficiency = this.calculateEfficiency(farm);

    // Update in database
    await db.query(
      'UPDATE farms SET metrics = $1 WHERE id = $2',
      [JSON.stringify(farm.metrics), farm.id]
    );
  }

  /**
   * Calculate farm efficiency
   */
  private calculateEfficiency(farm: Farm): number {
    const total = farm.metrics.totalTasks || farm.agents.length;
    const completed = farm.metrics.completedTasks;
    return total > 0 ? (completed / total) * 100 : 0;
  }

  /**
   * Cleanup farm resources
   */
  private async cleanupFarmResources(farm: Farm): Promise<void> {
    try {
      // Remove timeout
      const timeout = this.farmTimeouts.get(farm.id);
      if (timeout) {
        clearTimeout(timeout);
        this.farmTimeouts.delete(farm.id);
      }

      // Clear cache
      await redis.del(`farm:${farm.id}`);

      // Archive workspace (don't delete immediately)
      // This allows harvest collection to complete
      logger.info(`Resources cleaned up for farm ${farm.id}`);

    } catch (error) {
      logger.error(`Failed to cleanup resources for farm ${farm.id}:`, error);
    }
  }

  /**
   * Get default timeout for farm mode
   */
  private getDefaultTimeout(mode: FarmMode): number {
    switch (mode) {
      case FarmMode.QUICK_TASK:
        return QUICK_TASK_TIMEOUT; // 5 minutes
      case FarmMode.GO_WILD:
        return 1800000; // 30 minutes
      default:
        return 3600000; // 1 hour
    }
  }

  /**
   * Start periodic reconciliation
   */
  private startPeriodicReconciliation(): void {
    this.reconciliationInterval = setInterval(async () => {
      try {
        await this.reconcileFarmStates();
      } catch (error) {
        logger.error('Reconciliation failed:', error);
      }
    }, 120000); // Every 2 minutes
  }

  /**
   * Reconcile farm states with database and tmux
   */
  private async reconcileFarmStates(): Promise<void> {
    const activeSessions = terminalService.getActiveSessions();

    for (const farm of this.farms.values()) {
      const session = activeSessions.find(s => s.farmId === farm.id);

      if (farm.status === FarmStatus.ACTIVE && !session) {
        // Farm marked as active but no session found
        logger.warn(`Orphaned farm detected: ${farm.id}`);
        farm.status = FarmStatus.ORPHANED;
        await this.updateFarmStatus(farm.id, FarmStatus.ORPHANED);
      }
    }
  }

  /**
   * Broadcast farm event
   */
  private broadcastFarmEvent(event: string, data: any): void {
    websocketManager.broadcast(event, {
      ...data,
      timestamp: new Date()
    });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle agent events
    this.on('agent:status:changed', async (agentId: string, status: string) => {
      // Update agent status in corresponding farm
      for (const farm of this.farms.values()) {
        const agent = farm.agents.find(a => a.id === agentId);
        if (agent) {
          agent.status = status as any;
          agent.lastHeartbeat = new Date();
          break;
        }
      }
    });

    // Handle shutdown events
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Shutdown service gracefully
   */
  private async shutdown(): Promise<void> {
    logger.info('Shutting down UnifiedFarmService');

    // Stop reconciliation
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
    }

    // Stop all active farms
    for (const farm of this.farms.values()) {
      if (farm.status === FarmStatus.ACTIVE || farm.status === FarmStatus.RUNNING) {
        await this.stopFarm(farm.id);
      }
    }

    logger.info('UnifiedFarmService shutdown complete');
  }

  /**
   * Utility: delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get farm by ID
   */
  public getFarm(farmId: string): Farm | undefined {
    return this.farms.get(farmId);
  }

  /**
   * Get all farms
   */
  public getAllFarms(): Farm[] {
    return Array.from(this.farms.values());
  }

  /**
   * Get farms by status
   */
  public getFarmsByStatus(status: FarmStatus): Farm[] {
    return Array.from(this.farms.values()).filter(f => f.status === status);
  }
}

// Export singleton instance
export const farmService = UnifiedFarmService.getInstance();