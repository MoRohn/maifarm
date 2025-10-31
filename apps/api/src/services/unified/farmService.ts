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
import { logger, LogCategory } from '../../utils/logger';
import { pathConfig } from '../../config/paths';
import { shutdownCoordinator } from '../shutdownCoordinator';
import { orchestratorBridge } from '../OrchestratorBridge';
import { unifiedFarmLaunchOrchestrator, FarmMode } from '../UnifiedFarmLaunchOrchestrator';
import { lockManager } from '../../utils/AsyncLock';
import { workspaceManager } from '../workspaceManager';
import { getFarmAgentName } from '../../utils/farmAgentNames';
import { sessionCleanupManager } from '../SessionCleanupManager';
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
  CRASHED = 'crashed',
  STOPPED = 'stopped',
  TERMINATED = 'terminated',
  STALE = 'stale',
  RECOVERING = 'recovering',
  ORPHANED = 'orphaned'
}

export enum FarmMode {
  SEQUENTIAL = 'sequential',
  COLLABORATIVE = 'collaborative',
  AUTONOMOUS = 'autonomous',
  GO_WILD = 'go_wild',  // Changed to match UnifiedFarmLaunchOrchestrator
  QUICK_TASK = 'quick_task'  // Changed to match UnifiedFarmLaunchOrchestrator
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
  autoScale?: boolean;
  retryPolicy?: {
    enabled?: boolean;
    maxRetries?: number;
    backoffMultiplier?: number;
  };
  goWildMode?: {
    enabled?: boolean;
    creativityLevel?: number;
    boundaries?: string[];
  };
  userId?: string;
  farmerTemplateId?: string;
  farmerTemplateName?: string;
  contextFiles?: string[];
  barnReferences?: string[];
  staggerDelay?: number;
  debug?: boolean;
  orchestratorType?: 'xenosync' | 'maifarm';
  attachedFiles?: string[];
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
  status?: FarmStatus;
  error?: string;
  retryable?: boolean;
}

export class UnifiedFarmService extends EventEmitter {
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

    // Generate session name based on mode (must match UnifiedFarmLaunchOrchestrator logic)
    const sessionPrefix = config.mode === FarmMode.QUICK_TASK ? 'quick' :
                         config.mode === FarmMode.GO_WILD ? 'wild' : 'farm';
    const sessionName = `${sessionPrefix}-${farmId.substring(0, 8)}`;

    // Clean up any orphaned sessions before creating new farm
    await sessionCleanupManager.forceCleanupFarm(farmId);

    // Register farm as active to prevent cleanup during operation
    sessionCleanupManager.registerActiveFarm(farmId);

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
          attachedFiles: config.attachedFiles,
          barnReferences: config.barnReferences,
          prompt: config.prompt,
          orchestratorType: config.orchestratorType || 'maifarm',
          autoScale: config.autoScale,
          retryPolicy: config.retryPolicy,
          goWildMode: config.goWildMode
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

      // Ensure harvest tracking is initialized before launch so shutdown flows can store results
      await this.ensureHarvestInitialized(farm);

      // Launch farm with retry logic
      const orchestrator = config.orchestratorType || 'maifarm';
      const launchResult = orchestrator === 'xenosync'
        ? await this.launchWithXenoSync(farm, config)
        : await this.launchWithRetry(farm, config);

      if (!launchResult.success) {
        farm.status = FarmStatus.FAILED;
        await this.updateFarmStatus(farmId, FarmStatus.FAILED);

        // Broadcast launch failure to frontend
        this.broadcastFarmEvent('farm:launch:failed', {
          farmId,
          farmName: farm.name,
          error: launchResult.error || 'Farm launch failed',
          retryable: launchResult.retryable
        });

        return launchResult;
      }

      // Update farm with actual session name from launch result
      if (launchResult.sessionName) {
        farm.sessionName = launchResult.sessionName;
      }

      // Setup monitoring and timeouts
      this.setupFarmMonitoring(farm, config);

      // Broadcast farm creation
      this.broadcastFarmEvent('farm:created', farm);

      return {
        success: true,
        farmId,
        sessionName: launchResult.sessionName || sessionName  // Use sessionName from launch result
      };

    } catch (error) {
      const maifarmError = ErrorHandler.handle(error, { farmId });
      logger.error('Farm creation failed', maifarmError);

      // Broadcast error to frontend
      this.broadcastFarmEvent('farm:create:failed', {
        farmId,
        farmName: config.name,
        error: maifarmError.message,
        retryable: maifarmError.isRetryable,
        errorCode: maifarmError.code
      });

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
    try {
      // Determine farm mode
      let farmMode = FarmMode.HARVEST;
      if (config.mode === 'quick_task' || config.mode === 'quickTask') {
        farmMode = FarmMode.QUICK_TASK;
      } else if (config.mode === 'go_wild' || config.mode === 'goWild' || config.mode === 'gowild') {
        farmMode = FarmMode.GO_WILD;
      }

      // Use the unified farm launch orchestrator
      const result = await unifiedFarmLaunchOrchestrator.launchFarm({
        farmId: farm.id,
        farmName: farm.name,  // Pass farm name for YAML generation
        mode: farmMode,
        prompt: config.prompt || '',
        agentCount: config.numberOfAgents,
        timeout: config.timeout,
        provider: config.provider,
        userId: farm.createdBy || 'system',
        creativityLevel: config.goWildMode?.creativityLevel,
        files: config.attachedFiles,
        metadata: config.metadata,
        yamlContent: config.yamlContent // Pass YAML content for XenoSync coordination
      });

      if (!result.success) {
        throw new Error(result.error || 'Farm launch failed');
      }

      // Update farm status
      farm.status = FarmStatus.ACTIVE;
      farm.startedAt = new Date();
      await this.updateFarmStatus(farm.id, FarmStatus.ACTIVE);

      return {
        success: true,
        farmId: farm.id,
        sessionName: result.sessionName || farm.sessionName  // Use sessionName from orchestrator
      };

    } catch (error) {
      logger.error(`Failed to launch farm ${farm.id}:`, error);

      throw new FarmError(
        ErrorCode.FARM_LAUNCH_FAILED,
        `Failed to launch farm: ${error instanceof Error ? error.message : String(error)}`,
        { farmId: farm.id }
      );
    }
  }

  /**
   * Launch farm using XenoSync orchestrator
   */
  private async launchWithXenoSync(farm: Farm, config: FarmConfig): Promise<LaunchResult> {
    try {
      // Use UnifiedFarmLaunchOrchestrator which has proper XenoSync support
      const module = await import('../UnifiedFarmLaunchOrchestrator');
      const unifiedFarmOrchestrator = module.unifiedFarmLaunchOrchestrator;

      logger.info(LogCategory.FARM, `Launching farm ${farm.id} with XenoSync via UnifiedFarmLaunchOrchestrator`);

      const correlationId = `farm-${farm.id.substring(0, 8)}-${Date.now()}`;

      const launchConfig = {
        farmId: farm.id,
        farmName: farm.name,
        prompt: config.prompt || farm.description || '',
        mode: config.mode || FarmMode.HARVEST,
        agentCount: Math.max(2, config.numberOfAgents || 2),
        timeout: config.timeout || this.getDefaultTimeout(config.mode),
        contextFiles: config.contextFiles,
        useXenoSync: true,
        provider: config.provider || 'claude'
      };

      // Launch using UnifiedFarmLaunchOrchestrator which handles XenoSync properly
      const result = await unifiedFarmOrchestrator.launchFarm(launchConfig);

      if (result.success) {
        farm.status = FarmStatus.ACTIVE;
        farm.startedAt = new Date();
        farm.config = {
          ...farm.config,
          orchestratorType: 'xenosync',
          correlationId
        };

        await db.query(
          'UPDATE farms SET config = $1, started_at = $2, status = $3 WHERE id = $4',
          [JSON.stringify(farm.config), farm.startedAt, FarmStatus.ACTIVE, farm.id]
        );

        await this.updateFarmStatus(farm.id, FarmStatus.ACTIVE);

        this.broadcastFarmEvent('farm:launched', {
          farmId: farm.id,
          orchestrator: 'xenosync',
          sessionName: result.sessionName,
          correlationId,
          agentCount: config.numberOfAgents
        });

        return { success: true, farmId: farm.id, sessionName: result.sessionName || farm.sessionName };
      } else {
        // Launch failed
        logger.error(LogCategory.FARM, `Failed to launch farm ${farm.id} with XenoSync`);
        return {
          success: false,
          farmId: farm.id,
          sessionName: farm.sessionName,
          error: 'Failed to launch XenoSync agents'
        };
      }

    } catch (error) {
      throw new FarmError(
        ErrorCode.FARM_LAUNCH_FAILED,
        `Failed to launch farm with XenoSync: ${error instanceof Error ? error.message : String(error)}`,
        { farmId: farm.id }
      );
    }
  }

  /**
   * Launch the orchestrator process
   */
  private async launchOrchestrator(farm: Farm, config: FarmConfig): Promise<void> {
    // Prepare YAML prompt file if provided
    let promptFilePath: string | undefined;
    if (config.yamlContent) {
      promptFilePath = path.join(farm.workspacePath, 'config.yaml');
      await fs.writeFile(promptFilePath, config.yamlContent, 'utf-8');
    }

    const workspaceBaseDir = this.paths.FARM_WORKSPACES_ACTIVE
      ? this.paths.FARM_WORKSPACES_ACTIVE
      : path.dirname(farm.workspacePath);

    const coordinationDir = this.paths.COORDINATION_DIR
      ? this.paths.COORDINATION_DIR
      : path.join(workspaceBaseDir, '..', 'coordination');

    // Build orchestrator command with explicit long-form flags that match the CLI
    const orchestratorArgs: string[] = [
      this.ORCHESTRATOR_PATH,
      '--session',
      farm.sessionName,
      '--farm-id',
      farm.id,
      '--num-agents',
      (config.numberOfAgents || farm.config?.maxAgents || 3).toString(),
      '--provider',
      config.provider || farm.provider || 'claude',
      '--workspace-dir',
      workspaceBaseDir,
      '--coordination-dir',
      coordinationDir,
      '--reuse-session'
    ];

    if (config.prompt && config.prompt.trim().length > 0) {
      orchestratorArgs.push('--prompt', config.prompt);
    }

    if (promptFilePath) {
      orchestratorArgs.push('--prompt-file', promptFilePath);
    }

    if (config.staggerDelay && config.staggerDelay > 0) {
      orchestratorArgs.push('--stagger', config.staggerDelay.toString());
    } else {
      orchestratorArgs.push('--fast-launch');
    }

    if (config.mode === FarmMode.COLLABORATIVE) {
      orchestratorArgs.push('--collaborative');
    }

    // Spawn orchestrator process (use python3 for compatibility)
    const orchestrator = spawn('python3', orchestratorArgs, {
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
  /**
   * Update tmux session information for a farm
   */
  public async updateTmuxSession(farmId: string, sessionName: string, windowTarget: string = '0'): Promise<void> {
    try {
      const farm = await this.ensureFarmLoaded(farmId);
      if (!farm) {
        logger.warn(`Farm ${farmId} not found when updating tmux session`);
        return;
      }

      // Store tmux session info in farm metadata
      farm.tmuxSession = sessionName;
      farm.tmuxWindow = windowTarget;

      // Update cache
      this.farms.set(farmId, farm);

      // Update database - use both tmux_session column and metadata for compatibility
      await db.query(
        'UPDATE farms SET tmux_session = $1, metadata = jsonb_set(COALESCE(metadata, \'{}\'::jsonb), \'{tmuxSession}\', $2::jsonb) WHERE id = $3',
        [sessionName, JSON.stringify({ session: sessionName, window: windowTarget }), farmId]
      );

      logger.info(`Updated tmux session for farm ${farmId}: ${sessionName}:${windowTarget}`);
    } catch (error) {
      logger.error(`Failed to update tmux session for farm ${farmId}:`, error);
    }
  }

  public async updateFarmStatus(farmId: string, status: FarmStatus): Promise<void> {
    const farm = await this.ensureFarmLoaded(farmId);
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
  public async stopFarm(farmId: string, userId: string = 'system'): Promise<Farm | null> {
    const farm = await this.ensureFarmLoaded(farmId);
    if (!farm) {
      logger.warn(`Stop requested for unknown farm ${farmId}`);
      return null;
    }

    try {
      // Unregister from active farms
      sessionCleanupManager.unregisterFarm(farmId);

      const timeoutHandle = this.farmTimeouts.get(farmId);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.farmTimeouts.delete(farmId);
      }

      const processHandle = this.farmProcesses.get(farmId);
      if (processHandle) {
        processHandle.kill('SIGTERM');
        this.farmProcesses.delete(farmId);
      }

      await terminalService.stopSession(farm.sessionName).catch(error => {
        logger.warn(`Failed to stop terminal session for ${farm.sessionName}:`, error);
      });

      await this.updateFarmStatus(farmId, FarmStatus.TERMINATED);

      this.broadcastFarmEvent('farm:stopped', {
        farmId,
        userId
      });

      logger.info(`Farm ${farmId} stopped successfully`);
      return farm;

    } catch (error) {
      logger.error(`Error stopping farm ${farmId}:`, error);
      throw new FarmError(
        ErrorCode.FARM_OPERATION_FAILED,
        `Failed to stop farm: ${error instanceof Error ? error.message : String(error)}`,
        { farmId }
      );
    }
  }

  /**
   * Handle farm completion
   */
  private async handleFarmCompletion(farm: Farm): Promise<void> {
    try {
      // Unregister from active farms to allow cleanup
      sessionCleanupManager.unregisterFarm(farm.id);

      // Calculate metrics only if timestamps are available
      if (farm.completedAt && farm.startedAt) {
        const duration = farm.completedAt.getTime() - farm.startedAt.getTime();
        farm.metrics.duration = duration;
        farm.metrics.efficiency = this.calculateEfficiency(farm);
      } else {
        // Use current time if completedAt is not set
        const completedAt = farm.completedAt || new Date();
        const startedAt = farm.startedAt || farm.createdAt || new Date();
        const duration = completedAt.getTime() - startedAt.getTime();
        farm.metrics.duration = duration;
        farm.metrics.efficiency = this.calculateEfficiency(farm);
        logger.warn(`Farm ${farm.id} missing timestamps, using fallback values`);
      }

      // Trigger harvest
      await this.initiatHarvest(farm);

      // Cleanup resources
      await this.cleanupFarmResources(farm);

      logger.info(`Farm ${farm.id} completed. Duration: ${farm.metrics.duration}ms`);

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
      const harvest = await harvestService.startHarvest({
        farmId: farm.id,
        name: farm.name,
        metadata: { createdBy: farm.createdBy }
      });
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
    let timeout = config.timeout || this.getDefaultTimeout(config.mode);

    // CRITICAL FIX: Convert seconds to milliseconds if timeout is too small
    // Config timeout is often provided in seconds (e.g., 3600 for 1 hour)
    // but setTimeout expects milliseconds
    if (timeout < 10000) { // If less than 10 seconds, assume it's in seconds
      timeout = timeout * 1000; // Convert to milliseconds
    }

    // Setup timeout
    const timeoutHandle = setTimeout(async () => {
      logger.warn(`Farm ${farm.id} timed out after ${timeout}ms`);

      // Trigger graceful shutdown
      await this.gracefulShutdownFarm(farm.id, 'system', 'timeout');

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
    if (!config.prompt || config.prompt.trim().length === 0) {
      errors.push('Farm prompt is required');
    }
    if (config.numberOfAgents < 1 || config.numberOfAgents > 20) {
      errors.push('Number of agents must be between 1 and 20');
    }

    if (config.mode === FarmMode.GO_WILD && config.numberOfAgents < 2) {
      errors.push('Go Wild farms require at least 2 agents');
    }

    // Mode-specific validation - all modes require minimum 2 agents for XenoSync compatibility
    if (config.mode === FarmMode.QUICK_TASK && (config.numberOfAgents < 2 || config.numberOfAgents > 2)) {
      errors.push('Quick tasks must use exactly 2 agents for XenoSync compatibility');
    }

    if ((config.mode === FarmMode.HARVEST || config.mode === FarmMode.GO_WILD) &&
        (config.numberOfAgents < 2 || config.numberOfAgents > 12)) {
      errors.push('Harvest and Go Wild farms must use between 2 and 12 agents for XenoSync compatibility');
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

  private mapRowToFarm(row: any): Farm {
    const rawConfig = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {});
    const rawMetrics = typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics;
    const mode = rawConfig.mode && Object.values(FarmMode).includes(rawConfig.mode) ? rawConfig.mode : FarmMode.COLLABORATIVE;

    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      mode,
      status: row.status,
      provider: row.provider || 'claude',
      config: rawConfig,
      agents: [],
      sessionName: row.tmux_session || `farm-${row.id}`,
      workspacePath: row.workspace_path || pathConfig.getFarmWorkspacePath(row.id, false),
      harvestId: row.harvest_id,
      createdBy: row.created_by || 'unknown',
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      metrics: rawMetrics || this.getDefaultFarmMetrics()
    };
  }

  private async ensureFarmLoaded(farmId: string): Promise<Farm | null> {
    const cached = this.farms.get(farmId);
    if (cached) {
      return cached;
    }

    const result = await db.query('SELECT * FROM farms WHERE id = $1', [farmId]);
    if (result.rowCount === 0) {
      return null;
    }

    const farm = this.mapRowToFarm(result.rows[0]);
    this.farms.set(farm.id, farm);
    return farm;
  }

  private async cleanupWorkspace(farmId: string, existingPath?: string): Promise<void> {
    try {
      await workspaceManager.cleanupWorkspace(farmId, false);
    } catch (error) {
      logger.warn(`Workspace manager cleanup failed for farm ${farmId}:`, error);

      const fallbackPath = existingPath || pathConfig.getFarmWorkspacePath(farmId, false);
      if (fallbackPath) {
        try {
          await fs.rm(fallbackPath, { recursive: true, force: true });
        } catch (fallbackError) {
          logger.warn(`Fallback workspace cleanup failed for ${fallbackPath}:`, fallbackError);
        }
      }
    }
  }

  private async removeFarmFromDatabase(farmId: string): Promise<void> {
    const client = await db.connect();

    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM tasks WHERE farm_id = $1', [farmId]);
      await client.query('DELETE FROM agents WHERE farm_id = $1', [farmId]);
      await client.query('DELETE FROM harvests WHERE farm_id = $1', [farmId]);
      await client.query('DELETE FROM farms WHERE id = $1', [farmId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
        const farm = this.mapRowToFarm(row);
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
          harvest_id, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          metrics = EXCLUDED.metrics,
          harvest_id = EXCLUDED.harvest_id,
          updated_at = EXCLUDED.updated_at`,
        [
          farm.id,
          farm.name,
          farm.description,
          farm.status,
          farm.provider,
          JSON.stringify(farm.config),
          JSON.stringify(farm.metrics),
          farm.sessionName,
          farm.workspacePath,
          farm.harvestId,
          farm.createdBy,
          farm.createdAt,
          farm.updatedAt
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
      // Calculate how long the farm has existed
      const farmAge = Date.now() - new Date(farm.createdAt).getTime();

      // Skip farms that are still launching - give them time to set up
      if (farm.status === FarmStatus.LAUNCHING) {
        logger.debug(`Skipping reconciliation for launching farm ${farm.id}`);
        continue;
      }

      // Skip farms that are recently created (< 30 seconds old)
      // This prevents marking farms as orphaned during initialization
      if (farmAge < 30000) {
        logger.debug(`Farm ${farm.id} is recently created (${Math.floor(farmAge / 1000)}s old), skipping reconciliation`);
        continue;
      }

      const session = activeSessions.find(s => s.farmId === farm.id);

      if (farm.status === FarmStatus.ACTIVE && !session) {
        // Only mark as orphaned if farm has been active for more than 60 seconds without a session
        // This gives ample time for the orchestrator to create the tmux session
        if (farmAge > 60000) {
          logger.warn(`Orphaned farm detected: ${farm.id}, age: ${Math.floor(farmAge / 1000)}s, no session found`);
          farm.status = FarmStatus.ORPHANED;
          await this.updateFarmStatus(farm.id, FarmStatus.ORPHANED);
        } else {
          logger.debug(`Farm ${farm.id} has no session yet, but recently created (${Math.floor(farmAge / 1000)}s) - waiting for orchestrator...`);
        }
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

    // Handle orchestrator completion events
    orchestratorBridge.on('orchestrator-completed', async ({ farmId, status }) => {
      logger.info(`Orchestrator completed for farm ${farmId} - triggering harvest collection`);

      try {
        // Trigger graceful shutdown to collect harvest
        await shutdownCoordinator.gracefulShutdownFarm(
          farmId,
          'system',
          'orchestrator_completed'
        );
      } catch (error) {
        logger.error(`Error handling orchestrator completion for farm ${farmId}:`, error);
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
  public getFarm(farmId: string): Farm | undefined;
  public getFarm(farmId: string, userId: string): Promise<Farm | null>;
  public getFarm(
    farmId: string,
    userId?: string
  ): Farm | undefined | Promise<Farm | null> {
    if (typeof userId !== 'undefined') {
      return this.ensureFarmLoaded(farmId);
    }

    return this.farms.get(farmId);
  }

  /**
   * Gracefully shutdown an active farm
   */
  public async gracefulShutdownFarm(
    farmId: string,
    userId: string,
    reason: 'timeout' | 'user_request' | 'completion'
  ): Promise<Farm | null> {
    const farm = await this.ensureFarmLoaded(farmId);
    if (!farm) {
      logger.warn(`Graceful shutdown requested for unknown farm ${farmId}`);
      return null;
    }

    try {
      await shutdownCoordinator.executeGracefulShutdown({
        mode: 'farm',
        farmId,
        userId,
        reason,
        timeout: typeof farm.config?.timeout === 'number' ? farm.config.timeout * 1000 : undefined,
        harvestId: farm.harvestId,
        agentIds: farm.agents.map(agent => agent.id)
      });
    } catch (error) {
      logger.warn(`Graceful shutdown coordinator failed for ${farmId}:`, error);
    }

    const stopped = await this.stopFarm(farmId, userId).catch(error => {
      logger.error(`Failed to stop farm ${farmId} after graceful shutdown:`, error);
      return null;
    });

    this.broadcastFarmEvent('farm:graceful_shutdown', {
      farmId,
      userId,
      reason
    });

    return stopped;
  }

  /**
   * Ensure a harvest exists for a farm before agents start producing artifacts
   */
  private async ensureHarvestInitialized(farm: Farm): Promise<void> {
    if (farm.harvestId) {
      return;
    }

    try {
      const { harvestService } = await import('../harvestService');
      const harvest = await harvestService.startHarvest({
        farmId: farm.id,
        name: farm.name,
        metadata: { createdBy: farm.createdBy }
      });

      farm.harvestId = harvest.id;
      await db.query(
        'UPDATE farms SET harvest_id = $1 WHERE id = $2',
        [harvest.id, farm.id]
      );

      this.broadcastFarmEvent('harvest:initialized', {
        farmId: farm.id,
        harvestId: harvest.id
      });

    } catch (error) {
      logger.warn(`Failed to initialize harvest for farm ${farm.id}:`, error);
    }
  }

  /**
   * Delete farm and associated resources
   */
  public async deleteFarm(
    farmId: string,
    userOrOptions: string | { force?: boolean } = 'system'
  ): Promise<boolean> {
    const release = await lockManager.acquire(`farm:delete:${farmId}`, 'farmService');

    const userId = typeof userOrOptions === 'string' ? userOrOptions : 'system';
    const options = typeof userOrOptions === 'string' ? {} : userOrOptions;
    const forceDelete = options.force === true;

    try {
      const farm = await this.ensureFarmLoaded(farmId);

      if (!farm) {
        const result = await db.query('DELETE FROM farms WHERE id = $1 RETURNING name', [farmId]);
        if (result.rowCount > 0) {
          await this.cleanupWorkspace(farmId);
          this.broadcastFarmEvent('farm:deleted', {
            farmId,
            farmName: result.rows[0].name,
            userId,
            force: forceDelete
          });
          return true;
        }
        return false;
      }

      if (forceDelete) {
        await this.stopFarm(farmId, userId).catch(error => {
          logger.warn(`Forced stop during delete failed for ${farmId}:`, error);
        });
      } else if ([FarmStatus.ACTIVE, FarmStatus.RUNNING, FarmStatus.LAUNCHING].includes(farm.status)) {
        await this.gracefulShutdownFarm(farmId, userId, 'user_request').catch(error => {
          logger.warn(`Graceful shutdown during delete failed for ${farmId}:`, error);
        });
      } else {
        await this.stopFarm(farmId, userId).catch(error => {
          logger.warn(`Stop during delete failed for ${farmId}:`, error);
        });
      }

      await this.cleanupFarmResources(farm);
      await this.cleanupWorkspace(farmId, farm.workspacePath);

      await this.removeFarmFromDatabase(farmId);

      this.farms.delete(farmId);
      this.farmProcesses.delete(farmId);
      this.farmTimeouts.delete(farmId);

      this.broadcastFarmEvent('farm:deleted', {
        farmId,
        farmName: farm.name,
        userId,
        force: forceDelete
      });

      return true;
    } catch (error) {
      logger.error(`Failed to delete farm ${farmId}:`, error);
      return false;
    } finally {
      release();
    }
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
