/**
 * Robust Farm Launcher Service
 * Handles Quick Task, Farm, and GoWild modes with comprehensive error handling
 */

import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { db } from '../database/connection';
import { terminalOutputCache } from './terminalOutputCache';
import { terminalOutputWatcher } from './terminalOutputWatcher';
import { QUICK_TASK_TIMEOUT } from '../constants/timing';

const execAsync = promisify(exec);

// Helper to execute with TMUX_TMPDIR set
const execWithTmuxDir = async (command: string): Promise<{stdout: string, stderr: string}> => {
  return execAsync(command, { env: { ...process.env, TMUX_TMPDIR: '/tmp' } });
};

export interface RobustLaunchOptions {
  farmId: string;
  name: string;
  description: string;
  numberOfAgents: number;
  prompt: string;
  mode: 'quick-task' | 'farm' | 'go-wild';
  timeout?: number;
  userId?: string;
  yamlContent?: string;
  contextFiles?: string[];
  retryAttempts?: number;
}

export interface LaunchResult {
  success: boolean;
  farmId: string;
  sessionName: string;
  harvestId?: string;
  error?: string;
  retries?: number;
}

class RobustFarmLauncher {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;
  private readonly AGENT_INIT_DELAY = 5000;
  private readonly TMUX_PREFIX = 'farm-';

  /**
   * Launch a farm with automatic retry and recovery
   */
  async launch(options: RobustLaunchOptions): Promise<LaunchResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let retryCount = 0;
    const maxRetries = options.retryAttempts ?? this.MAX_RETRIES;

    logger.info(LogCategory.FARM, `🚀 Starting robust launch for ${options.mode}`, {
      farmId: options.farmId,
      name: options.name,
      agents: options.numberOfAgents,
      mode: options.mode
    });

    // Validate inputs
    if (!this.validateInputs(options)) {
      return {
        success: false,
        farmId: options.farmId,
        sessionName: '',
        error: 'Invalid launch options provided'
      };
    }

    // Attempt launch with retries
    while (retryCount <= maxRetries) {
      try {
        const result = await this.attemptLaunch(options);

        if (result.success) {
          const duration = Date.now() - startTime;
          logger.info(LogCategory.FARM, `✅ Farm launched successfully in ${duration}ms`, {
            farmId: options.farmId,
            sessionName: result.sessionName,
            retries: retryCount
          });

          return { ...result, retries: retryCount };
        }

        lastError = new Error(result.error || 'Unknown launch error');

      } catch (error) {
        lastError = error as Error;
        logger.error(LogCategory.FARM, `Launch attempt ${retryCount + 1} failed`, {
          farmId: options.farmId,
          error: lastError.message
        });
      }

      if (retryCount < maxRetries) {
        logger.info(LogCategory.FARM, `Retrying launch (attempt ${retryCount + 2}/${maxRetries + 1})...`);
        await this.cleanup(options.farmId);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      }

      retryCount++;
    }

    // All attempts failed
    const finalError = lastError?.message || 'Failed after all retry attempts';
    logger.error(LogCategory.FARM, `❌ Farm launch failed completely`, {
      farmId: options.farmId,
      error: finalError,
      attempts: retryCount
    });

    return {
      success: false,
      farmId: options.farmId,
      sessionName: '',
      error: finalError,
      retries: retryCount
    };
  }

  /**
   * Validate launch options
   */
  private validateInputs(options: RobustLaunchOptions): boolean {
    if (!options.farmId || !options.name || !options.prompt) {
      logger.error(LogCategory.FARM, 'Missing required launch parameters');
      return false;
    }

    if (options.numberOfAgents < 1 || options.numberOfAgents > 10) {
      logger.error(LogCategory.FARM, 'Invalid number of agents (must be 1-10)');
      return false;
    }

    // Mode-specific validation
    if (options.mode === 'quick-task' && options.numberOfAgents !== 2) {
      logger.warn(LogCategory.FARM, 'Quick tasks should use exactly 2 agents, adjusting...');
      options.numberOfAgents = 2;
    }

    return true;
  }

  /**
   * Single launch attempt
   */
  private async attemptLaunch(options: RobustLaunchOptions): Promise<LaunchResult> {
    const sessionName = `${this.TMUX_PREFIX}${options.farmId.substring(0, 8)}`;

    try {
      // Step 1: Create database entry
      await this.createDatabaseEntry(options);

      // Step 2: Create tmux session
      await this.createTmuxSession(sessionName, options);

      // Step 3: Create workspace
      const workspacePath = await this.createWorkspace(options);

      // Step 4: Initialize terminal caching
      await this.initializeTerminalCaching(sessionName, options);

      // Step 5: Launch agents
      await this.launchAgents(sessionName, workspacePath, options);

      // Step 6: Verify agents are running
      const verified = await this.verifyAgents(sessionName, options);
      if (!verified) {
        throw new Error('Agent verification failed');
      }

      // Step 7: Create harvest entry
      const harvestId = await this.createHarvestEntry(options);

      // Step 8: Start terminal monitoring
      await this.startTerminalMonitoring(sessionName, options);

      // Broadcast success
      websocketManager.broadcast('farm:created', {
        farmId: options.farmId,
        sessionName,
        harvestId,
        mode: options.mode,
        agents: options.numberOfAgents,
        timestamp: new Date()
      });

      return {
        success: true,
        farmId: options.farmId,
        sessionName,
        harvestId
      };

    } catch (error) {
      logger.error(LogCategory.FARM, 'Launch attempt failed', {
        farmId: options.farmId,
        error: (error as Error).message
      });

      // Cleanup partial launch
      await this.cleanup(options.farmId);

      return {
        success: false,
        farmId: options.farmId,
        sessionName,
        error: (error as Error).message
      };
    }
  }

  /**
   * Create database entry for the farm
   */
  private async createDatabaseEntry(options: RobustLaunchOptions): Promise<void> {
    // Prepare the config JSON with agent count and other settings
    const config = {
      maxAgents: options.numberOfAgents,
      autoScale: false,
      timeout: options.timeout,
      yaml: options.yamlContent || '',
      mode: options.mode
    };

    const query = `
      INSERT INTO farms (id, name, description, status, config, created_by, created_at, session_name)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (id) DO UPDATE SET
        status = $4,
        config = $5,
        session_name = $7,
        updated_at = NOW()
    `;

    const sessionName = `farm-${options.farmId.substring(0, 8)}`;

    await db.query(query, [
      options.farmId,
      options.name,
      options.description,
      'launching',
      JSON.stringify(config),
      options.userId || '00000000-0000-0000-0000-000000000000', // System UUID for default user
      sessionName
    ]);
  }

  /**
   * Create tmux session with proper window structure
   */
  private async createTmuxSession(sessionName: string, options: RobustLaunchOptions): Promise<void> {
    // Kill any existing session
    try {
      await execWithTmuxDir(`tmux kill-session -t "${sessionName}" 2>/dev/null`);
    } catch {
      // Ignore error if session doesn't exist
    }

    // Create new session with agents window
    await execWithTmuxDir(
      `tmux new-session -d -s "${sessionName}" -n agents`
    );

    // Create additional panes for multi-agent setup
    for (let i = 1; i < options.numberOfAgents; i++) {
      await execWithTmuxDir(
        `tmux split-window -t "${sessionName}:agents" -h`
      );
    }

    // Apply tiled layout for even distribution
    if (options.numberOfAgents > 1) {
      await execWithTmuxDir(
        `tmux select-layout -t "${sessionName}:agents" tiled`
      );
    }

    // Enable mouse and pane titles
    await execWithTmuxDir(
      `tmux set-option -t "${sessionName}" -g mouse on`
    );
    await execWithTmuxDir(
      `tmux set-option -t "${sessionName}" -g pane-border-status top`
    );
  }

  /**
   * Create workspace directory
   */
  private async createWorkspace(options: RobustLaunchOptions): Promise<string> {
    const workspacePath = path.join(
      process.cwd(),
      'maibarn',
      'workspaces',
      options.farmId
    );

    await fs.mkdir(workspacePath, { recursive: true });

    // Write context files if provided
    if (options.contextFiles && options.contextFiles.length > 0) {
      const contextDir = path.join(workspacePath, 'context');
      await fs.mkdir(contextDir, { recursive: true });

      for (const file of options.contextFiles) {
        const fileName = path.basename(file);
        const destPath = path.join(contextDir, fileName);
        try {
          await fs.copyFile(file, destPath);
        } catch (error) {
          logger.warn(LogCategory.FARM, `Failed to copy context file: ${file}`);
        }
      }
    }

    // Write prompt to file for reference
    const promptPath = path.join(workspacePath, 'prompt.txt');
    await fs.writeFile(promptPath, options.prompt, 'utf-8');

    return workspacePath;
  }

  /**
   * Initialize terminal output caching
   */
  private async initializeTerminalCaching(sessionName: string, options: RobustLaunchOptions): Promise<void> {
    // Pre-cache session info for late-joining clients
    for (let i = 0; i < options.numberOfAgents; i++) {
      terminalOutputCache.addOutput(
        sessionName,
        i,
        `Agent ${i + 1} initializing...\\n`,
        [`Agent ${i + 1} initializing...`]
      );

      // Also cache with farmId variation
      terminalOutputCache.addOutput(
        options.farmId,
        i,
        `Agent ${i + 1} initializing...\\n`,
        [`Agent ${i + 1} initializing...`]
      );
    }
  }

  /**
   * Launch agents in tmux panes
   */
  private async launchAgents(
    sessionName: string,
    workspacePath: string,
    options: RobustLaunchOptions
  ): Promise<void> {

    for (let i = 0; i < options.numberOfAgents; i++) {
      const paneTarget = `${sessionName}:agents.${i}`;

      try {
        // Set pane title
        const agentName = `Agent ${i + 1}`;
        await execWithTmuxDir(
          `tmux select-pane -t "${paneTarget}" -T "${agentName}"`
        );

        // Change to workspace directory
        await this.sendTmuxCommand(paneTarget, `cd ${workspacePath}`);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Determine launch command based on mode and provider
        const launchCommand = this.getLaunchCommand(options);

        // Launch the agent
        await this.sendTmuxCommand(paneTarget, launchCommand);

        // Wait for agent initialization
        logger.info(LogCategory.FARM, `Waiting for ${agentName} to initialize...`);
        await new Promise(resolve => setTimeout(resolve, this.AGENT_INIT_DELAY));

        // Send the prompt
        if (!launchCommand.includes('-p')) {
          // If prompt wasn't included in command, send it separately
          await this.sendTmuxCommand(paneTarget, options.prompt);
        }

        logger.info(LogCategory.FARM, `✓ ${agentName} launched successfully`);

        // Cache initial output
        terminalOutputCache.addOutput(
          sessionName,
          i,
          `${agentName} started\\n${options.prompt}\\n`,
          [`${agentName} started`, options.prompt]
        );

      } catch (error) {
        throw new Error(`Failed to launch agent ${i + 1}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Get appropriate launch command based on mode and provider
   */
  private getLaunchCommand(options: RobustLaunchOptions): string {
    const provider = process.env.AI_PROVIDER || 'claude';

    // For Quick Tasks, use simple command without prompt flag
    if (options.mode === 'quick-task') {
      if (provider === 'claude') {
        return 'claude --dangerously-skip-permissions';
      } else if (provider === 'openai') {
        return 'openai-cli';
      }
    }

    // For regular farms and GoWild, include prompt in command if safe
    const escapedPrompt = options.prompt.replace(/'/g, "'\\''");

    if (provider === 'claude') {
      // Avoid using -p flag as it can cause hanging
      return 'claude --dangerously-skip-permissions';
    } else if (provider === 'openai') {
      return `openai-cli --prompt '${escapedPrompt}'`;
    }

    // Fallback
    return 'claude --dangerously-skip-permissions';
  }

  /**
   * Send command to tmux pane
   */
  private async sendTmuxCommand(paneTarget: string, command: string): Promise<void> {
    const escapedCommand = command.replace(/'/g, "'\\''");
    await execWithTmuxDir(
      `tmux send-keys -t '${paneTarget}' '${escapedCommand}' Enter`
    );
  }

  /**
   * Verify agents are running
   */
  private async verifyAgents(sessionName: string, options: RobustLaunchOptions): Promise<boolean> {
    try {
      const { stdout } = await execWithTmuxDir(
        `tmux list-panes -t "${sessionName}:agents" -F "#{pane_index}:#{pane_pid}"`
      );

      const panes = stdout.trim().split('\\n');
      if (panes.length !== options.numberOfAgents) {
        logger.error(LogCategory.FARM, 'Pane count mismatch', {
          expected: options.numberOfAgents,
          actual: panes.length
        });
        return false;
      }

      // Check each pane has a running process
      for (const pane of panes) {
        const [index, pid] = pane.split(':');
        if (!pid || pid === '0') {
          logger.error(LogCategory.FARM, `Agent ${index} not running`);
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to verify agents', {
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Create harvest entry
   */
  private async createHarvestEntry(options: RobustLaunchOptions): Promise<string> {
    const harvestId = uuidv4();

    const query = `
      INSERT INTO harvests (id, farm_id, status, created_at)
      VALUES ($1, $2, 'pending', NOW())
    `;

    await db.query(query, [harvestId, options.farmId]);

    return harvestId;
  }

  /**
   * Start terminal output monitoring
   */
  private async startTerminalMonitoring(sessionName: string, options: RobustLaunchOptions): Promise<void> {
    // Start watching terminal output
    terminalOutputWatcher.startWatching(
      sessionName,
      options.farmId,
      options.numberOfAgents
    );

    // Update farm status to active
    await db.query(
      `UPDATE farms SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [options.farmId]
    );

    // Broadcast status update
    websocketManager.broadcast('farm:status', {
      farmId: options.farmId,
      status: 'active',
      sessionName,
      timestamp: new Date()
    });
  }

  /**
   * Cleanup failed launch
   */
  private async cleanup(farmId: string): Promise<void> {
    const sessionName = `${this.TMUX_PREFIX}${farmId.substring(0, 8)}`;

    try {
      // Kill tmux session
      await execWithTmuxDir(`tmux kill-session -t "${sessionName}" 2>/dev/null`);
    } catch {
      // Ignore error
    }

    // Update database status
    await db.query(
      `UPDATE farms SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [farmId]
    );

    // Clear any cached output
    terminalOutputCache.removeSession(sessionName);
    terminalOutputCache.removeSession(farmId);

    // Stop watching if started
    terminalOutputWatcher.stopWatching(sessionName);
  }
}

export const robustFarmLauncher = new RobustFarmLauncher();