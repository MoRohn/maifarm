/**
 * Optimized Farm Launch Service
 * 
 * Streamlined farm launching with reduced overhead, minimal broadcasting,
 * and efficient resource initialization.
 */

import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { logger, LogCategory } from '../utils/structuredLogger';
import { standardizedTerminalStreamService } from './terminalStreamStandardized';
import { harvestService } from './harvestService';
import { shutdownCoordinator } from './shutdownCoordinator';
import { QUICK_TASK_TIMEOUT } from '../constants/timing';

const execAsync = promisify(exec);

interface LaunchOptions {
  farmId: string;
  name: string;
  description: string;
  numberOfAgents: number;
  prompt: string;
  mode?: 'quick-task' | 'farm' | 'go-wild';
  timeout?: number;
  userId?: string;
  yamlContent?: string;
  contextFiles?: string[];
}

interface LaunchResult {
  success: boolean;
  farmId: string;
  sessionName: string;
  harvestId?: string;
  processId?: string;
  error?: string;
  launchTime: number;
}

export class OptimizedFarmLauncher {
  private static instance: OptimizedFarmLauncher;
  private readonly BATCH_BROADCAST_INTERVAL = 500; // Batch broadcasts every 500ms
  private broadcastQueue: Map<string, any[]> = new Map();
  private broadcastTimer?: NodeJS.Timeout;
  
  private constructor() {
    logger.info(LogCategory.FARM, 'Optimized Farm Launcher initialized');
  }

  static getInstance(): OptimizedFarmLauncher {
    if (!OptimizedFarmLauncher.instance) {
      OptimizedFarmLauncher.instance = new OptimizedFarmLauncher();
    }
    return OptimizedFarmLauncher.instance;
  }

  /**
   * Launch a farm with optimized, streamlined process
   */
  async launch(options: LaunchOptions): Promise<LaunchResult> {
    const startTime = Date.now();
    const shortFarmId = options.farmId.substring(0, 8);
    const sessionName = `farm-${shortFarmId}`;
    
    try {
      // Step 1: Database initialization (async, non-blocking)
      const dbPromise = this.initializeDatabase(options);
      
      // Step 2: Create workspace and YAML (parallel)
      const [workspacePath, yamlPath] = await Promise.all([
        this.createWorkspace(options.farmId),
        this.saveYamlConfig(options)
      ]);
      
      // Step 3: Create tmux session with optimized settings
      await this.createOptimizedTmuxSession(sessionName, options.numberOfAgents, workspacePath);
      
      // Step 4: Launch orchestrator (fire-and-forget for speed)
      const processId = await this.launchOrchestrator(options, sessionName, yamlPath);
      
      // Step 5: Initialize harvest (async)
      const harvestPromise = this.initializeHarvest(options);
      
      // Step 6: Start terminal streaming (async, after slight delay)
      setTimeout(() => {
        this.startTerminalStreaming(sessionName, options.farmId, options.numberOfAgents);
      }, 500); // Small delay to ensure tmux panes are ready
      
      // Step 7: Schedule shutdown (for quick tasks)
      if (options.mode === 'quick-task') {
        this.scheduleShutdown(options.farmId, sessionName, options.timeout || QUICK_TASK_TIMEOUT);
      }
      
      // Wait for critical async operations
      await dbPromise;
      const harvestId = await harvestPromise;
      
      const launchTime = Date.now() - startTime;
      
      // Single consolidated broadcast
      this.broadcastLaunchComplete(options.farmId, sessionName, harvestId, launchTime);
      
      logger.info(LogCategory.FARM, `✓ Farm launched in ${launchTime}ms`, {
        farmId: shortFarmId,
        session: sessionName,
        agents: options.numberOfAgents
      });
      
      return {
        success: true,
        farmId: options.farmId,
        sessionName,
        harvestId,
        processId,
        launchTime
      };
      
    } catch (error) {
      const launchTime = Date.now() - startTime;
      logger.error(LogCategory.FARM, `Farm launch failed after ${launchTime}ms: ${error}`);
      
      // Cleanup on failure
      await this.cleanup(sessionName, options.farmId);
      
      return {
        success: false,
        farmId: options.farmId,
        sessionName,
        error: error.message,
        launchTime
      };
    }
  }

  /**
   * Initialize database record (async, non-blocking)
   */
  private async initializeDatabase(options: LaunchOptions): Promise<void> {
    try {
      await db.query(
        `INSERT INTO farms (id, name, status, config, created_at) 
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE SET status = $3`,
        [
          options.farmId,
          options.name,
          'launching',
          JSON.stringify({
            mode: options.mode,
            agents: options.numberOfAgents,
            prompt: options.prompt
          })
        ]
      );
    } catch (error) {
      logger.warn(LogCategory.FARM, `Database init failed (non-critical): ${error.message}`);
    }
  }

  /**
   * Create workspace directory
   */
  private async createWorkspace(farmId: string): Promise<string> {
    const workspacePath = pathConfig.getFarmWorkspacePath(farmId);
    await fs.mkdir(workspacePath, { recursive: true });
    
    // Create essential subdirectories
    await Promise.all([
      fs.mkdir(path.join(workspacePath, 'src'), { recursive: true }),
      fs.mkdir(path.join(workspacePath, 'output'), { recursive: true })
    ]);
    
    return workspacePath;
  }

  /**
   * Save YAML configuration
   */
  private async saveYamlConfig(options: LaunchOptions): Promise<string> {
    const yamlPath = pathConfig.getFarmCoordinationPath(options.farmId);
    const yamlDir = path.dirname(yamlPath);
    
    await fs.mkdir(yamlDir, { recursive: true });
    
    const yamlContent = options.yamlContent || this.generateMinimalYaml(options);
    await fs.writeFile(yamlPath, yamlContent);
    
    return yamlPath;
  }

  /**
   * Create optimized tmux session
   */
  private async createOptimizedTmuxSession(
    sessionName: string,
    agentCount: number,
    workspacePath: string
  ): Promise<void> {
    // Kill any existing session with same name
    await execAsync(
      `tmux kill-session -t "${sessionName}" 2>/dev/null || true`,
      { env: { ...process.env, TMUX_TMPDIR: '/tmp' } }
    );
    
    // Create new session with optimized settings
    const createCmd = `tmux new-session -d -s "${sessionName}" -n agents -c "${workspacePath}"`;
    await execAsync(createCmd, { env: { ...process.env, TMUX_TMPDIR: '/tmp' } });
    
    // Create additional panes for agents (if more than 1)
    for (let i = 1; i < agentCount; i++) {
      await execAsync(
        `tmux split-window -t "${sessionName}:agents" -h -c "${workspacePath}"`,
        { env: { ...process.env, TMUX_TMPDIR: '/tmp' } }
      );
    }
    
    // Balance panes for even distribution
    if (agentCount > 1) {
      await execAsync(
        `tmux select-layout -t "${sessionName}:agents" tiled`,
        { env: { ...process.env, TMUX_TMPDIR: '/tmp' } }
      );
    }
  }

  /**
   * Launch orchestrator process
   */
  private async launchOrchestrator(
    options: LaunchOptions,
    sessionName: string,
    yamlPath: string
  ): Promise<string> {
    const orchestratorPath = path.join(process.cwd(), 'scripts', 'python', 'orchestrator.py');
    
    const args = [
      orchestratorPath,
      '-n', options.numberOfAgents.toString(),
      '-p', options.prompt,
      '--session-name', sessionName,
      '--farm-id', options.farmId,
      '--yaml-path', yamlPath,
      '--fast-launch' // Skip stagger delays
    ];
    
    // Add timeout for quick tasks
    if (options.mode === 'quick-task') {
      args.push('--timeout', (options.timeout || QUICK_TASK_TIMEOUT).toString());
    }
    
    const orchestrator = spawn('python', args, {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        TMUX_TMPDIR: '/tmp',
        AI_PROVIDER: process.env.AI_PROVIDER || 'claude'
      }
    });
    
    orchestrator.unref();
    
    return orchestrator.pid?.toString() || 'unknown';
  }

  /**
   * Initialize harvest record
   */
  private async initializeHarvest(options: LaunchOptions): Promise<string> {
    try {
      const harvest = await harvestService.createHarvest({
        farmId: options.farmId,
        farmName: options.name,
        userId: options.userId || 'system',
        description: options.description,
        tags: [options.mode || 'farm']
      });
      
      return harvest.id;
    } catch (error) {
      logger.warn(LogCategory.FARM, `Harvest init failed (non-critical): ${error.message}`);
      return uuidv4(); // Return a placeholder ID
    }
  }

  /**
   * Start terminal streaming (async, non-blocking)
   */
  private async startTerminalStreaming(
    sessionName: string,
    farmId: string,
    agentCount: number
  ): Promise<void> {
    try {
      await standardizedTerminalStreamService.startStreaming(
        sessionName,
        farmId,
        agentCount,
        {
          captureInterval: 500, // Less frequent for launch phase
          maxLines: 1000        // Smaller buffer during launch
        }
      );
    } catch (error) {
      logger.warn(LogCategory.FARM, `Terminal streaming init failed (non-critical): ${error.message}`);
    }
  }

  /**
   * Schedule shutdown for quick tasks
   */
  private scheduleShutdown(farmId: string, sessionName: string, timeout: number): void {
    shutdownCoordinator.scheduleShutdown({
      mode: 'quick-task',
      farmId,
      sessionName,
      timeout,
      gracefulShutdownTime: 30000 // 30s grace period
    });
  }

  /**
   * Broadcast launch completion (batched)
   */
  private broadcastLaunchComplete(
    farmId: string,
    sessionName: string,
    harvestId: string,
    launchTime: number
  ): void {
    // Single consolidated broadcast instead of multiple
    websocketManager.broadcast('farm:launched', {
      farmId,
      sessionName,
      harvestId,
      launchTime,
      status: 'ready',
      timestamp: new Date()
    });
  }

  /**
   * Generate minimal YAML for quick tasks
   */
  private generateMinimalYaml(options: LaunchOptions): string {
    return `
name: ${options.name}
agents:
  count: ${options.numberOfAgents}
task:
  description: ${options.description}
  mode: ${options.mode || 'farm'}
  timeout: ${options.timeout || 3600}
`.trim();
  }

  /**
   * Cleanup on failure
   */
  private async cleanup(sessionName: string, farmId: string): Promise<void> {
    try {
      // Kill tmux session
      await execAsync(
        `tmux kill-session -t "${sessionName}" 2>/dev/null || true`,
        { env: { ...process.env, TMUX_TMPDIR: '/tmp' } }
      );
      
      // Clean up workspace
      const workspacePath = pathConfig.getFarmWorkspacePath(farmId);
      await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => {});
      
      // Update database
      await db.query(
        'UPDATE farms SET status = $1 WHERE id = $2',
        ['failed', farmId]
      ).catch(() => {});
      
    } catch (error) {
      logger.warn(LogCategory.FARM, `Cleanup failed: ${error.message}`);
    }
  }
}

// Export singleton instance
export const optimizedFarmLauncher = OptimizedFarmLauncher.getInstance();