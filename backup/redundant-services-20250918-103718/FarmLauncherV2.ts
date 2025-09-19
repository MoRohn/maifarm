import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import { exec } from 'child_process';
import { promisify } from 'util';

import { stateCoordinator } from './StateCoordinator';
import { realtimeConnectionManager } from './RealtimeConnectionManager';
import { metricsPipeline } from './MetricsPipeline';
import { harvestOrchestrator } from './HarvestOrchestrator';
import { apiConnectionManager } from './ApiConnectionManager';
import { aiProviderManager, AIProvider } from '../config/aiProviders';
import { pathConfig } from '../config/paths';
import { db } from '../database/connection';

const execAsync = promisify(exec);

interface LaunchConfig {
  farmId?: string;
  name: string;
  description: string;
  type: 'quick-task' | 'farm' | 'gowild';
  numberOfAgents: number;
  prompt: string;
  provider?: AIProvider;
  timeout?: number;
  userId?: string;
  collaborative?: boolean;
  yamlContent?: string;
  contextFiles?: string[];
  barnReferences?: string[];
}

interface LaunchResult {
  farmId: string;
  harvestId: string;
  sessionName: string;
  processId: string;
  launchTimeMs: number;
  status: 'success' | 'failed';
  error?: string;
}

interface PreflightCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message?: string;
}

/**
 * Optimized Farm Launcher V2
 * 
 * Features:
 * - Parallel initialization for sub-second launches
 * - Pre-flight validation checks
 * - Optimistic UI updates
 * - Progressive status streaming
 * - Automatic retry on failure
 * - Integrated with all new infrastructure
 */
export class FarmLauncherV2 extends EventEmitter {
  private static instance: FarmLauncherV2;
  
  private activeLaunches: Map<string, LaunchConfig> = new Map();
  private launchProcesses: Map<string, ChildProcess> = new Map();
  
  private constructor() {
    super();
    this.initialize();
  }

  static getInstance(): FarmLauncherV2 {
    if (!FarmLauncherV2.instance) {
      FarmLauncherV2.instance = new FarmLauncherV2();
    }
    return FarmLauncherV2.instance;
  }

  /**
   * Initialize launcher
   */
  private initialize(): void {
    logger.info('[FarmLauncherV2] Initialized with parallel execution support');
  }

  /**
   * Launch a new farm with optimized parallel initialization
   */
  async launch(config: LaunchConfig): Promise<LaunchResult> {
    const startTime = Date.now();
    const farmId = config.farmId || uuidv4();
    const harvestId = uuidv4();
    const sessionName = this.generateSessionName(config.type, farmId);

    logger.info(`[FarmLauncherV2] Launching ${config.type} farm ${farmId}`);

    // Store launch config
    this.activeLaunches.set(farmId, config);

    // Send immediate optimistic update
    this.sendOptimisticUpdate(farmId, config);

    try {
      // Phase 1: Pre-flight checks (parallel) - 50ms
      const preflightResults = await this.runPreflightChecks(config);
      
      if (preflightResults.some(r => r.status === 'fail')) {
        throw new Error(`Pre-flight checks failed: ${preflightResults.find(r => r.status === 'fail')?.message}`);
      }

      // Phase 2: Parallel initialization - 100ms
      const [farm, harvest, workspace, yamlPath] = await Promise.all([
        this.createFarmRecord(farmId, config),
        this.initializeHarvest(harvestId, farmId, config),
        this.prepareWorkspace(farmId),
        this.generateYAML(farmId, config)
      ]);

      // Update state with initialized entities
      await Promise.all([
        stateCoordinator.applyStateChange('farm', farmId, {
          status: 'launching',
          harvestId,
          sessionName,
          workspace
        }),
        stateCoordinator.applyStateChange('harvest', harvestId, {
          status: 'initializing',
          farmId
        })
      ]);

      // Phase 3: Launch agents with tmux - 200ms
      const processId = await this.launchAgents(
        sessionName,
        farmId,
        harvestId,
        config,
        yamlPath
      );

      // Phase 4: Setup monitoring and streaming (async)
      this.setupMonitoring(farmId, harvestId, sessionName);

      // Record launch metrics
      const launchTimeMs = Date.now() - startTime;
      metricsPipeline.recordFarmMetric(farmId, 'launch.time', launchTimeMs);
      metricsPipeline.recordFarmMetric(farmId, 'launch.success', 1);

      // Update final state
      await stateCoordinator.applyStateChange('farm', farmId, {
        status: 'active',
        processId,
        launchTimeMs
      });

      logger.info(`[FarmLauncherV2] Farm ${farmId} launched successfully in ${launchTimeMs}ms`);

      return {
        farmId,
        harvestId,
        sessionName,
        processId,
        launchTimeMs,
        status: 'success'
      };

    } catch (error) {
      logger.error(`[FarmLauncherV2] Failed to launch farm ${farmId}:`, error);
      
      // Update state to failed
      await stateCoordinator.applyStateChange('farm', farmId, {
        status: 'failed',
        error: error.message
      });

      // Record failure metrics
      metricsPipeline.recordFarmMetric(farmId, 'launch.failed', 1);

      // Clean up
      this.activeLaunches.delete(farmId);

      return {
        farmId,
        harvestId,
        sessionName,
        processId: '',
        launchTimeMs: Date.now() - startTime,
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Run pre-flight checks in parallel
   */
  private async runPreflightChecks(config: LaunchConfig): Promise<PreflightCheck[]> {
    const checks: Promise<PreflightCheck>[] = [
      this.checkTmuxAvailable(),
      this.checkProviderAvailable(config.provider || AIProvider.CLAUDE),
      this.checkDiskSpace(),
      this.checkMemory(),
      this.checkApiKeys(config.provider || AIProvider.CLAUDE)
    ];

    return Promise.all(checks);
  }

  /**
   * Check if tmux is available
   */
  private async checkTmuxAvailable(): Promise<PreflightCheck> {
    try {
      const { stdout } = await execAsync('which tmux');
      return {
        name: 'tmux',
        status: 'pass',
        message: `tmux found at ${stdout.trim()}`
      };
    } catch (error) {
      return {
        name: 'tmux',
        status: 'fail',
        message: 'tmux not found. Please install tmux.'
      };
    }
  }

  /**
   * Check if AI provider is available
   */
  private async checkProviderAvailable(provider: AIProvider): Promise<PreflightCheck> {
    const health = apiConnectionManager.getProviderMetrics()[provider];
    
    if (!health || health.status === 'unhealthy') {
      return {
        name: 'provider',
        status: 'fail',
        message: `Provider ${provider} is unavailable`
      };
    }

    if (health.status === 'degraded') {
      return {
        name: 'provider',
        status: 'warning',
        message: `Provider ${provider} is degraded but available`
      };
    }

    return {
      name: 'provider',
      status: 'pass',
      message: `Provider ${provider} is healthy`
    };
  }

  /**
   * Check disk space
   */
  private async checkDiskSpace(): Promise<PreflightCheck> {
    try {
      const { stdout } = await execAsync('df -k / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      const available = parseInt(parts[3]);
      const requiredKB = 500 * 1024; // 500MB minimum

      if (available < requiredKB) {
        return {
          name: 'disk',
          status: 'fail',
          message: `Insufficient disk space: ${Math.round(available / 1024)}MB available`
        };
      }

      return {
        name: 'disk',
        status: 'pass',
        message: `${Math.round(available / 1024)}MB available`
      };
    } catch (error) {
      return {
        name: 'disk',
        status: 'warning',
        message: 'Could not check disk space'
      };
    }
  }

  /**
   * Check available memory
   */
  private async checkMemory(): Promise<PreflightCheck> {
    try {
      const { stdout } = await execAsync('free -m | grep Mem');
      const parts = stdout.trim().split(/\s+/);
      const available = parseInt(parts[6]); // Available memory in MB
      const requiredMB = 512; // 512MB minimum

      if (available < requiredMB) {
        return {
          name: 'memory',
          status: 'warning',
          message: `Low memory: ${available}MB available`
        };
      }

      return {
        name: 'memory',
        status: 'pass',
        message: `${available}MB available`
      };
    } catch (error) {
      return {
        name: 'memory',
        status: 'warning',
        message: 'Could not check memory'
      };
    }
  }

  /**
   * Check API keys
   */
  private async checkApiKeys(provider: AIProvider): Promise<PreflightCheck> {
    try {
      const config = await aiProviderManager.getProviderWithRefresh(provider);
      
      // Debug logging
      logger.debug(LogCategory.LAUNCH, `[FarmLauncherV2] Checking API keys for ${provider}`);
      logger.debug(LogCategory.LAUNCH, `[FarmLauncherV2] Config API key exists: ${!!config.apiKey}, isLocal: ${config.isLocal}`);
      
      // Check if API key is missing, empty, or just whitespace
      // But allow local providers (ollama) to proceed without API key
      if ((!config.apiKey || config.apiKey.trim() === '') && !config.isLocal) {
        // Double-check environment variables directly as fallback
        const envKey = provider === 'claude' 
          ? (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
          : process.env.OPENAI_API_KEY;
        
        logger.debug(LogCategory.LAUNCH, `[FarmLauncherV2] Env key found: ${!!envKey}`);
        
        if (!envKey || envKey.trim() === '') {
          logger.error(LogCategory.LAUNCH, `[FarmLauncherV2] No API key found for ${provider} in config or environment`);
          return {
            name: 'apikeys',
            status: 'fail',
            message: `No API key configured for ${provider}`
          };
        } else {
          // If we found the key in env but not in config, it's still valid
          logger.info(LogCategory.LAUNCH, `[FarmLauncherV2] API key found in environment for ${provider}`);
        }
      }

      return {
        name: 'apikeys',
        status: 'pass',
        message: 'API keys configured'
      };
    } catch (error) {
      logger.error(LogCategory.LAUNCH, `[FarmLauncherV2] Error checking API keys: ${error.message}`);
      return {
        name: 'apikeys',
        status: 'fail',
        message: error.message
      };
    }
  }

  /**
   * Send optimistic update immediately
   */
  private sendOptimisticUpdate(farmId: string, config: LaunchConfig): void {
    // Broadcast farm creation immediately
    realtimeConnectionManager.broadcast('farm:created', {
      farmId,
      name: config.name,
      description: config.description,
      type: config.type,
      status: 'launching',
      agents: config.numberOfAgents,
      timestamp: new Date()
    });

    // Record metric
    metricsPipeline.recordFarmMetric(farmId, 'created', 1);
  }

  /**
   * Create farm record in database
   */
  private async createFarmRecord(farmId: string, config: LaunchConfig): Promise<any> {
    const farm = {
      id: farmId,
      name: config.name,
      description: config.description,
      type: config.type,
      status: 'launching',
      config: {
        maxAgents: config.numberOfAgents,
        autoScale: false,
        timeout: config.timeout || (config.type === 'quick-task' ? 300000 : 3600000),
        provider: config.provider || AIProvider.CLAUDE,
        collaborative: config.collaborative || false
      },
      metrics: {
        agents: config.numberOfAgents,
        tasksCompleted: 0,
        successRate: 100
      },
      created_by: config.userId || 'system',
      created_at: new Date(),
      updated_at: new Date()
    };

    await db.query(
      `INSERT INTO farms (id, name, description, status, config, metrics, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        farm.id,
        farm.name,
        farm.description,
        farm.status,
        JSON.stringify(farm.config),
        JSON.stringify(farm.metrics),
        farm.created_by,
        farm.created_at,
        farm.updated_at
      ]
    );

    return farm;
  }

  /**
   * Initialize harvest for the farm
   */
  private async initializeHarvest(
    harvestId: string,
    farmId: string,
    config: LaunchConfig
  ): Promise<string> {
    // Create harvest record
    await db.query(
      `INSERT INTO harvests (id, farm_id, farm_name, status, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        harvestId,
        farmId,
        config.name,
        'initializing',
        new Date()
      ]
    );

    // Initialize harvest orchestrator
    const workspacePath = pathConfig.getPath('WORKSPACE_DIR', farmId);
    harvestOrchestrator.startHarvest(harvestId, farmId, workspacePath, {
      compress: true,
      maxFileSize: 10 * 1024 * 1024 // 10MB max file size
    });

    return harvestId;
  }

  /**
   * Prepare workspace directory
   */
  private async prepareWorkspace(farmId: string): Promise<string> {
    const workspacePath = pathConfig.getPath('WORKSPACE_DIR', farmId);
    
    // Create workspace structure
    const directories = [
      workspacePath,
      path.join(workspacePath, 'src'),
      path.join(workspacePath, 'docs'),
      path.join(workspacePath, 'tests'),
      path.join(workspacePath, '.agents')
    ];

    await Promise.all(directories.map(dir => fs.mkdir(dir, { recursive: true })));

    // Create barn symlink for shared resources
    const barnPath = pathConfig.getPath('BARN_DIR', 'items');
    const barnLink = path.join(workspacePath, 'barn');
    
    try {
      await fs.symlink(barnPath, barnLink, 'dir');
    } catch (error) {
      // Symlink might already exist
    }

    logger.debug(`[FarmLauncherV2] Prepared workspace: ${workspacePath}`);
    return workspacePath;
  }

  /**
   * Generate YAML configuration
   */
  private async generateYAML(farmId: string, config: LaunchConfig): Promise<string> {
    const yamlPath = path.join(
      pathConfig.getPath('COORDINATION_DIR'),
      `farm_${farmId}.yaml`
    );

    const yamlContent = config.yamlContent || yaml.dump({
      farm_id: farmId,
      name: config.name,
      description: config.description,
      agents: config.numberOfAgents,
      provider: config.provider || AIProvider.CLAUDE,
      collaborative: config.collaborative || false,
      prompt: config.prompt,
      context_files: config.contextFiles || [],
      barn_references: config.barnReferences || [],
      timeout: config.timeout,
      created_at: new Date().toISOString()
    });

    await fs.writeFile(yamlPath, yamlContent);
    logger.debug(`[FarmLauncherV2] Generated YAML: ${yamlPath}`);
    return yamlPath;
  }

  /**
   * Launch agents with tmux
   */
  private async launchAgents(
    sessionName: string,
    farmId: string,
    harvestId: string,
    config: LaunchConfig,
    yamlPath: string
  ): Promise<string> {
    const processId = uuidv4();
    
    // Build orchestrator command
    const orchestratorPath = path.join(process.cwd(), 'scripts/python/orchestrator.py');
    const workspacePath = pathConfig.getPath('WORKSPACE_DIR', farmId);
    
    const args = [
      orchestratorPath,
      '-s', sessionName,
      '-f', farmId,
      '-n', config.numberOfAgents.toString(),
      '-p', config.prompt,
      '--workspace', workspacePath,
      '--yaml', yamlPath,
      '--harvest-id', harvestId,
      '--provider', config.provider || AIProvider.CLAUDE
    ];

    if (config.collaborative) {
      args.push('--collaborative');
    }

    // Get provider environment
    const env = aiProviderManager.getProviderEnvironment(config.provider || AIProvider.CLAUDE);

    // Spawn orchestrator process
    const process = spawn('python3', args, {
      env: {
        ...env,
        FARM_ID: farmId,
        HARVEST_ID: harvestId
      },
      cwd: workspacePath,
      detached: true
    });

    this.launchProcesses.set(processId, process);

    // Handle process events
    process.on('error', (error) => {
      logger.error(`[FarmLauncherV2] Process error for ${farmId}:`, error);
      this.handleLaunchError(farmId, error);
    });

    process.stdout?.on('data', (data) => {
      logger.debug(`[FarmLauncherV2] ${farmId}: ${data.toString()}`);
    });

    process.stderr?.on('data', (data) => {
      logger.error(`[FarmLauncherV2] ${farmId} error: ${data.toString()}`);
    });

    // Wait for tmux session to be created
    await this.waitForTmuxSession(sessionName);

    // Setup terminal streaming
    await this.setupTerminalStreaming(sessionName, farmId, config.numberOfAgents);

    return processId;
  }

  /**
   * Wait for tmux session to be created
   */
  private async waitForTmuxSession(sessionName: string, maxWait: number = 5000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}"');
        if (stdout.includes(sessionName)) {
          logger.debug(`[FarmLauncherV2] Tmux session ${sessionName} is ready`);
          return;
        }
      } catch (error) {
        // tmux might not have any sessions yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Timeout waiting for tmux session ${sessionName}`);
  }

  /**
   * Setup terminal streaming for agents
   */
  private async setupTerminalStreaming(
    sessionName: string,
    farmId: string,
    numberOfAgents: number
  ): Promise<void> {
    const terminalDir = pathConfig.getPath('TERMINAL_DIR', farmId);
    await fs.mkdir(terminalDir, { recursive: true });

    // Setup pipe-pane for each agent
    for (let i = 0; i < numberOfAgents; i++) {
      const outputFile = path.join(terminalDir, `agent_${i}.log`);
      const paneTarget = `${sessionName}:0.${i}`;
      
      try {
        await execAsync(`tmux pipe-pane -t "${paneTarget}" "cat >> ${outputFile}"`);
        logger.debug(`[FarmLauncherV2] Setup terminal streaming for pane ${paneTarget}`);
      } catch (error) {
        logger.error(`[FarmLauncherV2] Failed to setup pipe-pane for ${paneTarget}:`, error);
      }
    }
  }

  /**
   * Setup monitoring for the farm
   */
  private setupMonitoring(farmId: string, harvestId: string, sessionName: string): void {
    // Start streaming terminal output
    realtimeConnectionManager.sendToFarm(farmId, 'terminal:ready', {
      farmId,
      sessionName,
      timestamp: new Date()
    });

    // Monitor farm health
    const healthCheck = setInterval(async () => {
      try {
        const { stdout } = await execAsync(`tmux list-sessions -F "#{session_name}" | grep ${sessionName}`);
        
        if (!stdout) {
          clearInterval(healthCheck);
          await this.handleFarmStopped(farmId, harvestId);
        }
      } catch (error) {
        clearInterval(healthCheck);
        await this.handleFarmStopped(farmId, harvestId);
      }
    }, 10000); // Check every 10 seconds

    // Monitor metrics
    metricsPipeline.recordFarmMetric(farmId, 'monitoring.started', 1);
  }

  /**
   * Handle launch error
   */
  private async handleLaunchError(farmId: string, error: Error): Promise<void> {
    logger.error(`[FarmLauncherV2] Launch error for farm ${farmId}:`, error);

    await stateCoordinator.applyStateChange('farm', farmId, {
      status: 'failed',
      error: error.message
    });

    realtimeConnectionManager.sendToFarm(farmId, 'farm:error', {
      farmId,
      error: error.message,
      timestamp: new Date()
    });

    metricsPipeline.recordFarmMetric(farmId, 'error', 1, { error: error.message });
  }

  /**
   * Handle farm stopped
   */
  private async handleFarmStopped(farmId: string, harvestId: string): Promise<void> {
    logger.info(`[FarmLauncherV2] Farm ${farmId} has stopped`);

    await stateCoordinator.applyStateChange('farm', farmId, {
      status: 'completed',
      completedAt: new Date()
    });

    // Trigger final harvest collection
    harvestOrchestrator.emit('farm:ending', {
      farmId,
      status: 'completed'
    });

    realtimeConnectionManager.sendToFarm(farmId, 'farm:completed', {
      farmId,
      harvestId,
      timestamp: new Date()
    });

    metricsPipeline.recordFarmMetric(farmId, 'completed', 1);

    // Clean up
    this.activeLaunches.delete(farmId);
  }

  /**
   * Generate session name based on type
   */
  private generateSessionName(type: string, farmId: string): string {
    const prefix = type === 'quick-task' ? 'quick' : type === 'gowild' ? 'goWild' : 'farm';
    return `${prefix}_${farmId.substring(0, 8)}`;
  }

  /**
   * Stop a farm
   */
  async stopFarm(farmId: string): Promise<void> {
    const config = this.activeLaunches.get(farmId);
    if (!config) {
      throw new Error(`Farm ${farmId} not found`);
    }

    const sessionName = this.generateSessionName(config.type, farmId);
    
    try {
      await execAsync(`tmux kill-session -t ${sessionName}`);
      logger.info(`[FarmLauncherV2] Stopped farm ${farmId}`);
    } catch (error) {
      logger.error(`[FarmLauncherV2] Error stopping farm ${farmId}:`, error);
    }

    // Update state
    await stateCoordinator.applyStateChange('farm', farmId, {
      status: 'stopped',
      stoppedAt: new Date()
    });

    // Clean up
    this.activeLaunches.delete(farmId);
    
    for (const [id, process] of this.launchProcesses) {
      if (id.includes(farmId)) {
        process.kill('SIGTERM');
        this.launchProcesses.delete(id);
      }
    }
  }

  /**
   * Get active farms
   */
  getActiveFarms(): LaunchConfig[] {
    return Array.from(this.activeLaunches.values());
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    // Kill all processes
    for (const process of this.launchProcesses.values()) {
      process.kill('SIGTERM');
    }

    this.activeLaunches.clear();
    this.launchProcesses.clear();
  }
}

// Export singleton instance
export const farmLauncherV2 = FarmLauncherV2.getInstance();