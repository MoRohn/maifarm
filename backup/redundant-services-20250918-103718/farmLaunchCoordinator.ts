import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { structuredLogger as logger, LogCategory } from '../utils/structuredLogger';
import { getFarmAgentName, formatFarmAgentNameNoEmoji } from '../utils/farmAgentNames';
import { shutdownCoordinator } from './shutdownCoordinator';
import { harvestService } from './harvestService';
import { terminalViewCoordinator } from './terminalViewCoordinator';
import { QUICK_TASK_TIMEOUT } from '../constants/timing';

const execAsync = promisify(exec);

export interface LaunchPhase {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
}

export interface FarmLaunchOptions {
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

export interface FarmLaunchResult {
  success: boolean;
  farmId: string;
  sessionName: string;
  harvestId?: string;
  processId?: string;
  error?: string;
  metrics: {
    totalDuration: number;
    phases: LaunchPhase[];
  };
}

/**
 * Unified farm launch coordinator that streamlines the launch process
 * and provides consolidated logging with clear phase tracking
 */
export class FarmLaunchCoordinator {
  private static instance: FarmLaunchCoordinator;
  private phases: Map<string, LaunchPhase[]> = new Map();
  private readonly paths = pathConfig.getPaths();

  private constructor() {
    logger.info(LogCategory.FARM, 'Farm Launch Coordinator initialized');
  }

  static getInstance(): FarmLaunchCoordinator {
    if (!FarmLaunchCoordinator.instance) {
      FarmLaunchCoordinator.instance = new FarmLaunchCoordinator();
    }
    return FarmLaunchCoordinator.instance;
  }

  /**
   * Launch a farm with optimized flow and consolidated logging
   */
  async launchFarm(options: FarmLaunchOptions): Promise<FarmLaunchResult> {
    const launchStartTime = Date.now();
    const phases: LaunchPhase[] = [];
    
    // Initialize phases
    const phaseNames = [
      'Database Setup',
      'Workspace Creation',
      'Session Creation',
      'Terminal Setup',
      'Agent Launch',
      'Connection Verification'
    ];
    
    for (const name of phaseNames) {
      phases.push({ name, status: 'pending' });
    }
    
    this.phases.set(options.farmId, phases);
    
    // Log launch initiation
    logger.info(LogCategory.FARM, `🚀 LAUNCHING FARM: ${options.name}`, {
      farmId: options.farmId,
      agents: options.numberOfAgents,
      mode: options.mode || 'farm',
      timeout: options.timeout
    });

    try {
      // Phase 1: Database Setup
      await this.executePhase(options.farmId, 'Database Setup', async () => {
        await this.setupDatabase(options);
      });

      // Phase 2: Workspace Creation (parallel with session creation)
      const workspacePromise = this.executePhase(options.farmId, 'Workspace Creation', async () => {
        return await this.createWorkspace(options);
      });

      // Phase 3: Session Creation (parallel with workspace)
      const sessionPromise = this.executePhase(options.farmId, 'Session Creation', async () => {
        return await this.createTmuxSession(options);
      });

      // Wait for both parallel operations
      const [workspacePath, sessionName] = await Promise.all([workspacePromise, sessionPromise]);

      // Phase 4: Terminal Setup
      await this.executePhase(options.farmId, 'Terminal Setup', async () => {
        await this.setupTerminals(options, sessionName);
      });

      // Phase 5: Agent Launch
      const processId = await this.executePhase(options.farmId, 'Agent Launch', async () => {
        return await this.launchAgents(options, sessionName, workspacePath);
      });

      // Phase 6: Connection Verification
      const harvestId = await this.executePhase(options.farmId, 'Connection Verification', async () => {
        return await this.verifyConnections(options, sessionName);
      });

      // Calculate total duration
      const totalDuration = Date.now() - launchStartTime;
      
      // Log successful launch
      logger.info(LogCategory.FARM, `✅ FARM LAUNCHED SUCCESSFULLY in ${totalDuration}ms`, {
        farmId: options.farmId,
        sessionName,
        processId,
        harvestId
      });

      // Broadcast success event
      websocketManager.broadcast('farm:launch-complete', {
        farmId: options.farmId,
        sessionName,
        harvestId,
        duration: totalDuration,
        timestamp: new Date()
      });

      return {
        success: true,
        farmId: options.farmId,
        sessionName,
        harvestId,
        processId,
        metrics: {
          totalDuration,
          phases: this.phases.get(options.farmId) || []
        }
      };

    } catch (error) {
      const totalDuration = Date.now() - launchStartTime;
      
      logger.error(LogCategory.FARM, `❌ FARM LAUNCH FAILED after ${totalDuration}ms`, {
        farmId: options.farmId,
        error: error.message
      });

      // Mark remaining phases as failed
      const farmPhases = this.phases.get(options.farmId);
      if (farmPhases) {
        for (const phase of farmPhases) {
          if (phase.status === 'pending' || phase.status === 'running') {
            phase.status = 'failed';
            phase.error = 'Launch aborted due to previous error';
          }
        }
      }

      return {
        success: false,
        farmId: options.farmId,
        sessionName: '',
        error: error.message,
        metrics: {
          totalDuration,
          phases: this.phases.get(options.farmId) || []
        }
      };
    }
  }

  /**
   * Execute a phase with timing and error handling
   */
  private async executePhase<T>(
    farmId: string,
    phaseName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const phases = this.phases.get(farmId);
    const phase = phases?.find(p => p.name === phaseName);
    
    if (phase) {
      phase.status = 'running';
      phase.startTime = new Date();
      
      // Broadcast phase start
      websocketManager.broadcast('farm:launch-phase', {
        farmId,
        phase: phaseName,
        status: 'running',
        timestamp: new Date()
      });
    }

    try {
      const result = await fn();
      
      if (phase) {
        phase.status = 'completed';
        phase.endTime = new Date();
        phase.duration = phase.endTime.getTime() - phase.startTime!.getTime();
        
        logger.info(LogCategory.FARM, `  ✓ ${phaseName} (${phase.duration}ms)`);
        
        // Broadcast phase completion
        websocketManager.broadcast('farm:launch-phase', {
          farmId,
          phase: phaseName,
          status: 'completed',
          duration: phase.duration,
          timestamp: new Date()
        });
      }
      
      return result;
    } catch (error) {
      if (phase) {
        phase.status = 'failed';
        phase.endTime = new Date();
        phase.duration = phase.endTime.getTime() - phase.startTime!.getTime();
        phase.error = error.message;
        
        logger.error(LogCategory.FARM, `  ✗ ${phaseName} failed (${phase.duration}ms): ${error.message}`);
        
        // Broadcast phase failure
        websocketManager.broadcast('farm:launch-phase', {
          farmId,
          phase: phaseName,
          status: 'failed',
          error: error.message,
          duration: phase.duration,
          timestamp: new Date()
        });
      }
      
      throw error;
    }
  }

  /**
   * Setup database entries for the farm
   */
  private async setupDatabase(options: FarmLaunchOptions): Promise<void> {
    // Single atomic farm creation
    await db.query(
      `INSERT INTO farms (id, name, description, status, config, metrics, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         status = $4,
         updated_at = $9`,
      [
        options.farmId,
        options.name,
        options.description,
        'launching',
        JSON.stringify({
          type: 'sequential',
          maxAgents: options.numberOfAgents,
          timeout: options.timeout,
          mode: options.mode,
          quickTask: options.mode === 'quick-task'
        }),
        JSON.stringify({
          totalAgents: options.numberOfAgents,
          activeAgents: 0,
          completedTasks: 0,
          failedTasks: 0
        }),
        options.mode === 'quick-task' ? ['quick-task'] : ['farm'],
        new Date(),
        new Date()
      ]
    );

    // Register with farmManager for in-memory cache
    const { farmManager } = await import('./farmManager');
    farmManager.farms.set(options.farmId, {
      id: options.farmId,
      name: options.name,
      description: options.description,
      type: 'sequential',
      status: 'launching',
      config: {
        maxAgents: options.numberOfAgents,
        timeout: options.timeout,
        autoScale: false,
        quickTask: options.mode === 'quick-task'
      },
      metrics: {
        totalAgents: options.numberOfAgents,
        activeAgents: 0,
        completedTasks: 0,
        failedTasks: 0,
        avgResponseTime: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        throughput: 0
      },
      agents: [],
      tags: options.mode === 'quick-task' ? ['quick-task'] : ['farm'],
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  /**
   * Create workspace directory for the farm
   */
  private async createWorkspace(options: FarmLaunchOptions): Promise<string> {
    const workspacePath = path.join(this.paths.FARM_WORKSPACES_ACTIVE, options.farmId);
    
    // Create workspace structure
    await fs.mkdir(workspacePath, { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'docs'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'tests'), { recursive: true });
    
    // Save YAML if provided
    if (options.yamlContent) {
      await fs.writeFile(
        path.join(workspacePath, 'farm.yaml'),
        options.yamlContent,
        'utf-8'
      );
    }
    
    // Create simple prompt file for agents
    const promptContent = `Task: ${options.prompt}
Mode: ${options.mode || 'farm'}
Agents: ${options.numberOfAgents}
Timeout: ${options.timeout ? options.timeout / 1000 : 'unlimited'} seconds`;
    
    await fs.writeFile(
      path.join(workspacePath, 'prompt.txt'),
      promptContent,
      'utf-8'
    );
    
    return workspacePath;
  }

  /**
   * Create tmux session with proper pane setup
   */
  private async createTmuxSession(options: FarmLaunchOptions): Promise<string> {
    const sessionName = `farm-${options.farmId.substring(0, 8)}`;
    
    // Ensure tmux server is running
    await execAsync('TMUX_TMPDIR=/tmp tmux start-server 2>/dev/null || true');
    
    // Check if session exists
    try {
      await execAsync(`TMUX_TMPDIR=/tmp tmux has-session -t "${sessionName}" 2>/dev/null`);
      // Session exists, kill it to start fresh
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
    } catch {
      // Session doesn't exist, which is fine
    }
    
    // Create new session with first pane
    await execAsync(
      `TMUX_TMPDIR=/tmp tmux new-session -d -s "${sessionName}" -n agents`
    );
    
    // Create additional panes for each agent
    for (let i = 1; i < options.numberOfAgents; i++) {
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux split-window -t "${sessionName}:agents"`
      );
      
      // Apply tiled layout for even distribution
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux select-layout -t "${sessionName}:agents" tiled`
      );
    }
    
    // Set pane titles for identification
    for (let i = 0; i < options.numberOfAgents; i++) {
      const agentName = getFarmAgentName('general', i);
      const formattedName = formatFarmAgentNameNoEmoji(agentName);
      
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux select-pane -t "${sessionName}:agents.${i}" -T "${formattedName}"`
      );
    }
    
    // Configure tmux options for better display
    const tmuxConfigs = [
      `set-option -g pane-border-status top`,
      `set-option -g pane-border-style fg=colour240`,
      `set-option -g pane-active-border-style fg=colour250`,
      `set-option -g mouse on`
    ];
    
    for (const config of tmuxConfigs) {
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux ${config} -t "${sessionName}" 2>/dev/null || true`
      );
    }
    
    return sessionName;
  }

  /**
   * Setup terminal streaming and view coordination
   */
  private async setupTerminals(options: FarmLaunchOptions, sessionName: string): Promise<void> {
    // Register session with terminal view coordinator
    await terminalViewCoordinator.registerSession({
      sessionName,
      farmId: options.farmId,
      agentCount: options.numberOfAgents,
      windowTarget: 'agents' // Using 'agents' window for all farms
    });
    
    // Pre-allocate terminal log files
    const terminalLogDir = path.join(this.paths.MAIBARN_ROOT, 'terminals', options.farmId);
    await fs.mkdir(terminalLogDir, { recursive: true });
    
    for (let i = 0; i < options.numberOfAgents; i++) {
      const logPath = path.join(terminalLogDir, `agent-${i}.log`);
      await fs.writeFile(logPath, '', 'utf-8');
      
      // Register pane with coordinator
      await terminalViewCoordinator.registerPane({
        sessionName,
        farmId: options.farmId,
        agentIndex: i,
        paneId: `${sessionName}:agents.${i}`,
        logPath
      });
    }
    
    // Start terminal streaming service
    // For Quick Tasks, don't wait for streaming setup as it can timeout
    const { terminalStreamService } = await import('./terminalStreamService');
    if (options.mode === 'quick-task') {
      // Non-blocking for Quick Tasks - start streaming in background
      terminalStreamService.startStreaming(
        sessionName,
        options.farmId,
        options.numberOfAgents
      ).catch(err => {
        logger.warn(LogCategory.TERMINAL, `Terminal streaming setup failed for Quick Task: ${err.message}`);
      });
    } else {
      // Wait for streaming setup for regular farms
      await terminalStreamService.startStreaming(
        sessionName,
        options.farmId,
        options.numberOfAgents
      );
    }
    
    // Broadcast terminal ready events for UI
    websocketManager.broadcast('terminal:session-ready', {
      farmId: options.farmId,
      sessionName,
      agentCount: options.numberOfAgents,
      panes: Array.from({ length: options.numberOfAgents }, (_, i) => ({
        index: i,
        id: `${sessionName}:agents.${i}`,
        title: formatFarmAgentNameNoEmoji(getFarmAgentName('general', i))
      })),
      timestamp: new Date()
    });
  }

  /**
   * Launch agents using optimized launcher
   */
  private async launchAgents(
    options: FarmLaunchOptions,
    sessionName: string,
    workspacePath: string
  ): Promise<string> {
    const processId = uuidv4();
    
    // Check if XenoSync should be used for quick tasks
    const useXenoSync = process.env.USE_XENOSYNC === 'true' && 
                        options.numberOfAgents >= 2 &&
                        process.env.AI_PROVIDER === 'claude';
    
    if (options.mode === 'quick-task' && useXenoSync) {
      // Use XenoSync for Quick Tasks when enabled
      logger.info(LogCategory.FARM, '🚀 Using XenoSync for Quick Task', {
        farmId: options.farmId,
        agents: options.numberOfAgents
      });
      
      const { xenoSyncService } = await import('./XenoSyncService');
      await xenoSyncService.launchFarm({
        farmId: options.farmId,
        name: options.name,
        description: options.description,
        numberOfAgents: options.numberOfAgents,
        prompt: options.prompt,
        yamlContent: options.yamlContent,
        mode: 'parallel',
        timeout: options.timeout,
        contextFiles: options.contextFiles
      });
    } else if (options.mode === 'quick-task') {
      // INTEGRATION FIX: Use direct tmux commands instead of Python launcher
      // This implements the same two-stage launch that works in the Python script
      
      logger.info(LogCategory.FARM, '🚀 Launching Quick Task agents with direct tmux commands');
      
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Helper function to send tmux commands
      const sendTmuxCommand = async (paneTarget: string, command: string) => {
        const tmuxCmd = `tmux send-keys -t '${paneTarget}' '${command.replace(/'/g, "'\\''")}'`;
        await execAsync(tmuxCmd, {
          env: { ...process.env, TMUX_TMPDIR: '/tmp' }
        });
      };
      
      // Launch each agent using two-stage approach
      for (let i = 0; i < options.numberOfAgents; i++) {
        const paneTarget = `${sessionName}:agents.${i}`;
        
        try {
          logger.info(LogCategory.FARM, `Launching agent ${i + 1} in pane ${i}`);
          
          // Stage 1: Change to workspace directory
          await sendTmuxCommand(paneTarget, `cd ${workspacePath}`);
          await execAsync(`tmux send-keys -t '${paneTarget}' Enter`, {
            env: { ...process.env, TMUX_TMPDIR: '/tmp' }
          });
          
          // Brief pause for directory change
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Stage 2: Launch Claude WITHOUT the -p flag (critical for avoiding hanging)
          await sendTmuxCommand(paneTarget, 'claude --dangerously-skip-permissions');
          await execAsync(`tmux send-keys -t '${paneTarget}' Enter`, {
            env: { ...process.env, TMUX_TMPDIR: '/tmp' }
          });
          
          // Stage 3: Wait for Claude to fully initialize (critical delay)
          logger.info(LogCategory.FARM, `Waiting for Claude to initialize in pane ${i}...`);
          await new Promise(resolve => setTimeout(resolve, 4000));
          
          // Stage 4: Send the prompt as separate input
          await sendTmuxCommand(paneTarget, options.prompt);
          await execAsync(`tmux send-keys -t '${paneTarget}' Enter`, {
            env: { ...process.env, TMUX_TMPDIR: '/tmp' }
          });
          
          logger.info(LogCategory.FARM, `✓ Successfully launched agent ${i + 1}`);
          
          // Small delay between agent launches to avoid overwhelming
          if (i < options.numberOfAgents - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          logger.error(LogCategory.FARM, `Failed to launch agent ${i + 1}:`, error);
          throw new Error(`Failed to launch agent ${i + 1}: ${error.message}`);
        }
      }
      
      logger.info(LogCategory.FARM, `✅ All ${options.numberOfAgents} agents launched successfully`);
      
      // Create launch marker file for verification
      const markerPath = path.join(workspacePath, '.agents', 'launch-complete');
      await fs.mkdir(path.dirname(markerPath), { recursive: true });
      await fs.writeFile(markerPath, `Launched ${options.numberOfAgents} agents at ${new Date().toISOString()}`);
      
      // Brief pause to ensure all agents are ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Return early for Quick Task - agents are launched, no Python launcher needed
      return processId;
      
    } else {
      // Use existing XenoSync for complex farms
      const { xenoSyncService } = await import('./XenoSyncService');
      await xenoSyncService.launchFarm({
        farmId: options.farmId,
        name: options.name,
        description: options.description,
        numberOfAgents: options.numberOfAgents,
        prompt: options.prompt,
        yamlContent: options.yamlContent,
        mode: 'parallel',
        timeout: options.timeout,
        contextFiles: options.contextFiles
      });
    }
    
    return processId;
  }

  /**
   * Verify connections and setup harvest
   */
  private async verifyConnections(
    options: FarmLaunchOptions,
    sessionName: string
  ): Promise<string | undefined> {
    // Create harvest for the farm
    let harvestId: string | undefined;
    
    try {
      const harvest = await harvestService.startHarvest(
        options.farmId,
        options.name,
        options.userId || 'system'
      );
      harvestId = harvest.id;
      
      // Broadcast harvest ready
      websocketManager.broadcast('harvest:ready', {
        harvestId,
        farmId: options.farmId,
        sessionName,
        timestamp: new Date()
      });
    } catch (error) {
      logger.warn(LogCategory.FARM, 'Failed to create harvest:', error);
    }
    
    // Update farm status to active
    await db.query(
      'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
      ['active', new Date(), options.farmId]
    );
    
    // Schedule graceful shutdown
    if (options.timeout) {
      shutdownCoordinator.scheduleShutdown({
        mode: options.mode === 'quick-task' ? 'quick-task' : 'farm',
        farmId: options.farmId,
        userId: options.userId || 'system',
        reason: 'timeout',
        timeout: options.mode === 'quick-task' ? undefined : Math.floor(options.timeout / 1000), // Convert ms to seconds for farm mode, undefined for quick-task (uses fixed timeout)
        harvestId,
        agentIds: []
      });
    }
    
    // Verify terminal connections
    await terminalViewCoordinator.verifyConnections(sessionName);
    
    return harvestId;
  }

  /**
   * Create quick task launcher script
   */
  private async createQuickTaskLauncher(launcherPath: string): Promise<void> {
    const launcherContent = `#!/usr/bin/env python3
"""
Quick Task Launcher - Lightweight launcher for simple Claude tasks
"""

import sys
import os
import subprocess
import argparse
import time
import shlex

def launch_agent_in_pane(session_name, pane_index, prompt, workspace):
    """Launch Claude in a specific tmux pane"""
    
    # Escape the prompt for shell
    escaped_prompt = shlex.quote(prompt)
    
    # Build Claude command
    claude_cmd = f"cd {workspace} && claude --dangerously-skip-permissions -p {escaped_prompt}"
    
    # Send command to specific pane
    tmux_cmd = [
        'tmux',
        'send-keys',
        '-t', f'{session_name}:agents.{pane_index}',
        claude_cmd,
        'Enter'
    ]
    
    env = os.environ.copy()
    env['TMUX_TMPDIR'] = '/tmp'
    
    subprocess.run(tmux_cmd, env=env)
    print(f"Launched agent {pane_index + 1} in pane {pane_index}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--session', required=True)
    parser.add_argument('--agents', type=int, required=True)
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--timeout', type=int, default=300000)
    
    args = parser.parse_args()
    
    print(f"Launching {args.agents} agents in session {args.session}")
    
    # Launch each agent in its pane
    for i in range(args.agents):
        launch_agent_in_pane(args.session, i, args.prompt, args.workspace)
        time.sleep(0.5)  # Small delay between launches
    
    print("All agents launched successfully")
    return 0

if __name__ == '__main__':
    sys.exit(main())
`;
    
    await fs.writeFile(launcherPath, launcherContent, { mode: 0o755 });
  }

  /**
   * Get launch metrics for a farm
   */
  getMetrics(farmId: string): LaunchPhase[] | undefined {
    return this.phases.get(farmId);
  }
}

// Export singleton instance
export const farmLaunchCoordinator = FarmLaunchCoordinator.getInstance();