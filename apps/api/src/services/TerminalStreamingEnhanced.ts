/**
 * Enhanced Terminal Streaming Service
 * Provides robust terminal streaming with automatic recovery and monitoring
 *
 * Features:
 * - Guaranteed pipe-pane setup with verification
 * - Automatic recovery on failure
 * - Real-time output streaming
 * - Agent name management
 * - Connection health monitoring
 */

import { EventEmitter } from 'events';
import { spawn, exec, execSync } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import * as chokidar from 'chokidar';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { db } from '../database/connection';

const TMUX_TMP_DIR = '/tmp';
const PIPE_PANE_RETRY_ATTEMPTS = 3;
const PIPE_PANE_RETRY_DELAY = 500; // ms
const OUTPUT_CHECK_INTERVAL = 1000; // ms
const HEALTH_CHECK_INTERVAL = 5000; // ms
const MAX_BUFFER_SIZE = 1000; // lines

interface StreamingSession {
  farmId: string;
  sessionName: string;
  windowName: string;
  agentCount: number;
  agents: Map<number, AgentInfo>;
  watchers: Map<number, chokidar.FSWatcher>;
  healthCheckers: Map<number, NodeJS.Timer>;
  outputMonitors: Map<number, NodeJS.Timer>;
  isActive: boolean;
  startTime: Date;
  lastHealthCheck: Date;
}

interface AgentInfo {
  id: number;
  paneIndex: number;
  name: string;
  displayName: string;
  logPath: string;
  lastPosition: number;
  outputBuffer: string[];
  pipePaneActive: boolean;
  lastOutput: Date;
  status: 'initializing' | 'active' | 'idle' | 'failed';
}

// Farm-themed agent names for consistent identification
const FARM_AGENT_NAMES = [
  'Bessie the Cow',       // Agent 0 (Lead)
  'Cluck the Chicken',    // Agent 1
  'Wilbur the Pig',       // Agent 2
  'Charlotte the Spider', // Agent 3
  'Babe the Sheep',       // Agent 4
  'Donald the Duck',      // Agent 5
  'Henrietta the Hen',    // Agent 6
  'Ferdinand the Bull',   // Agent 7
  'Peggy the Goat'        // Agent 8
];

class TerminalStreamingEnhancedService extends EventEmitter {
  private static instance: TerminalStreamingEnhancedService;
  private sessions = new Map<string, StreamingSession>();
  private globalHealthChecker?: NodeJS.Timer;

  private constructor() {
    super();
    this.startGlobalHealthMonitoring();
  }

  static getInstance(): TerminalStreamingEnhancedService {
    if (!this.instance) {
      this.instance = new TerminalStreamingEnhancedService();
    }
    return this.instance;
  }

  /**
   * Initialize streaming for a farm with guaranteed setup
   */
  async initializeStreaming(
    farmId: string,
    sessionName: string,
    agentCount: number,
    windowName: string = 'agents'
  ): Promise<void> {
    logger.info(LogCategory.TERMINAL, `[Enhanced] Initializing streaming for farm ${farmId} with ${agentCount} agents`);

    // Clean up any existing session
    if (this.sessions.has(farmId)) {
      await this.cleanupSession(farmId);
    }

    // Create session object
    const session: StreamingSession = {
      farmId,
      sessionName,
      windowName,
      agentCount,
      agents: new Map(),
      watchers: new Map(),
      healthCheckers: new Map(),
      outputMonitors: new Map(),
      isActive: true,
      startTime: new Date(),
      lastHealthCheck: new Date()
    };

    // Initialize agents with proper names
    for (let i = 0; i < agentCount; i++) {
      const displayName = FARM_AGENT_NAMES[i % FARM_AGENT_NAMES.length];
      const agent: AgentInfo = {
        id: i,
        paneIndex: i,
        name: `agent_${i}`,
        displayName,
        logPath: join(pathConfig.getPath('TERMINALS_DIR'), farmId, `agent-${i}.log`),
        lastPosition: 0,
        outputBuffer: [],
        pipePaneActive: false,
        lastOutput: new Date(),
        status: 'initializing'
      };
      session.agents.set(i, agent);
    }

    this.sessions.set(farmId, session);

    // Ensure terminal directory exists
    const terminalDir = join(pathConfig.getPath('TERMINALS_DIR'), farmId);
    await fs.mkdir(terminalDir, { recursive: true });

    // Setup terminal capture with verification
    await this.setupEnhancedTerminalCapture(session);

    // Start output monitoring
    await this.startEnhancedOutputMonitoring(session);

    // Send initial agent info to frontend
    await this.broadcastAgentStatus(session);

    logger.info(LogCategory.TERMINAL, `[Enhanced] Streaming initialized for farm ${farmId}`);
  }

  /**
   * Enhanced terminal capture with guaranteed pipe-pane setup
   */
  private async setupEnhancedTerminalCapture(session: StreamingSession): Promise<void> {
    const { sessionName, windowName, agents } = session;

    // Verify tmux session exists
    if (!await this.verifyTmuxSession(sessionName)) {
      throw new Error(`Tmux session ${sessionName} not found`);
    }

    for (const [agentId, agent] of agents) {
      // Create log file with initial content
      await fs.writeFile(agent.logPath, `# Terminal output for ${agent.displayName} (Agent ${agentId})\n`, { flag: 'w' });

      // Setup pipe-pane with retries and verification
      const paneRef = `${sessionName}:${windowName}.${agentId}`;
      const success = await this.setupPipePaneWithVerification(paneRef, agent);

      if (success) {
        agent.pipePaneActive = true;
        agent.status = 'active';
        logger.info(LogCategory.TERMINAL, `[Enhanced] Pipe-pane active for ${agent.displayName}`);

        // Send initial test output to verify streaming
        await this.sendTestOutput(paneRef, agent);
      } else {
        // Setup fallback capture mechanism
        logger.warn(LogCategory.TERMINAL, `[Enhanced] Setting up fallback capture for ${agent.displayName}`);
        await this.setupFallbackCapture(session, agentId);
      }

      // Setup individual health monitoring for this agent
      this.setupAgentHealthMonitoring(session, agentId);
    }
  }

  /**
   * Setup pipe-pane with multiple retry attempts and verification
   */
  private async setupPipePaneWithVerification(paneRef: string, agent: AgentInfo): Promise<boolean> {
    for (let attempt = 1; attempt <= PIPE_PANE_RETRY_ATTEMPTS; attempt++) {
      logger.info(LogCategory.TERMINAL, `[Enhanced] Setting up pipe-pane for ${paneRef}, attempt ${attempt}`);

      // Kill any existing pipe-pane first
      await this.killExistingPipePane(paneRef);

      // Small delay to ensure pane is ready
      await this.delay(100);

      // Setup new pipe-pane
      const setupSuccess = await this.executePipePane(paneRef, agent.logPath);

      if (setupSuccess) {
        // Verify it's working by checking file growth
        const verified = await this.verifyPipePane(paneRef, agent);

        if (verified) {
          return true;
        }
      }

      if (attempt < PIPE_PANE_RETRY_ATTEMPTS) {
        await this.delay(PIPE_PANE_RETRY_DELAY);
      }
    }

    return false;
  }

  /**
   * Kill existing pipe-pane to ensure clean setup
   */
  private async killExistingPipePane(paneRef: string): Promise<void> {
    return new Promise((resolve) => {
      const command = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux pipe-pane -t ${paneRef}`;
      exec(command, () => {
        // Ignore errors - pipe-pane might not exist
        resolve();
      });
    });
  }

  /**
   * Execute pipe-pane command
   */
  private async executePipePane(paneRef: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const command = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux pipe-pane -t ${paneRef} -o 'cat >> ${outputPath}'`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.error(LogCategory.TERMINAL, `[Enhanced] Pipe-pane setup failed: ${stderr || error.message}`);
          resolve(false);
        } else {
          logger.info(LogCategory.TERMINAL, `[Enhanced] Pipe-pane command executed for ${paneRef}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Verify pipe-pane is actually capturing output
   */
  private async verifyPipePane(paneRef: string, agent: AgentInfo): Promise<boolean> {
    const initialSize = await this.getFileSize(agent.logPath);

    // Send test message
    const testMessage = `[VERIFY] Pipe-pane test for ${agent.displayName} at ${new Date().toISOString()}`;
    await this.sendToPane(paneRef, `echo "${testMessage}"`);

    // Wait and check if file grew
    await this.delay(500);

    const finalSize = await this.getFileSize(agent.logPath);
    const grew = finalSize > initialSize;

    if (grew) {
      logger.info(LogCategory.TERMINAL, `[Enhanced] Pipe-pane verified for ${agent.displayName}`);
    } else {
      logger.warn(LogCategory.TERMINAL, `[Enhanced] Pipe-pane verification failed for ${agent.displayName}`);
    }

    return grew;
  }

  /**
   * Setup fallback capture using capture-pane polling
   */
  private async setupFallbackCapture(session: StreamingSession, agentId: number): Promise<void> {
    const agent = session.agents.get(agentId);
    if (!agent) return;

    const paneRef = `${session.sessionName}:${session.windowName}.${agentId}`;

    // Poll for output using capture-pane
    const captureInterval = setInterval(async () => {
      if (!session.isActive) {
        clearInterval(captureInterval);
        return;
      }

      try {
        const output = await this.capturePane(paneRef);
        if (output && output.length > 0) {
          // Append new output to log file
          await fs.appendFile(agent.logPath, output);
          agent.lastOutput = new Date();
          agent.status = 'active';
        }
      } catch (error) {
        logger.error(LogCategory.TERMINAL, `[Enhanced] Fallback capture error: ${error}`);
      }
    }, OUTPUT_CHECK_INTERVAL);

    session.outputMonitors.set(agentId, captureInterval);
  }

  /**
   * Capture pane content using tmux capture-pane
   */
  private async capturePane(paneRef: string): Promise<string> {
    return new Promise((resolve) => {
      const command = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux capture-pane -t ${paneRef} -p`;

      exec(command, (error, stdout) => {
        if (error) {
          resolve('');
        } else {
          resolve(stdout);
        }
      });
    });
  }

  /**
   * Enhanced output monitoring with file watching
   */
  private async startEnhancedOutputMonitoring(session: StreamingSession): Promise<void> {
    for (const [agentId, agent] of session.agents) {
      // Setup file watcher
      const watcher = chokidar.watch(agent.logPath, {
        persistent: true,
        usePolling: true,
        interval: 100,
        binaryInterval: 300,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      });

      watcher.on('change', async () => {
        await this.handleFileChange(session, agentId);
      });

      session.watchers.set(agentId, watcher);
    }
  }

  /**
   * Handle file changes and broadcast updates
   */
  private async handleFileChange(session: StreamingSession, agentId: number): Promise<void> {
    const agent = session.agents.get(agentId);
    if (!agent || !session.isActive) return;

    try {
      const content = await fs.readFile(agent.logPath, 'utf-8');
      const lines = content.split('\n');

      // Get new lines since last position
      const newLines = lines.slice(agent.lastPosition);

      if (newLines.length > 0) {
        agent.lastPosition = lines.length;
        agent.lastOutput = new Date();
        agent.status = 'active';

        // Add to buffer (maintain size limit)
        agent.outputBuffer.push(...newLines);
        if (agent.outputBuffer.length > MAX_BUFFER_SIZE) {
          agent.outputBuffer = agent.outputBuffer.slice(-MAX_BUFFER_SIZE);
        }

        // Broadcast to frontend
        this.broadcastTerminalOutput(session.farmId, agentId, agent.displayName, newLines);
      }
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `[Enhanced] Error reading log file: ${error}`);
    }
  }

  /**
   * Setup health monitoring for individual agent
   */
  private setupAgentHealthMonitoring(session: StreamingSession, agentId: number): void {
    const healthChecker = setInterval(async () => {
      if (!session.isActive) {
        clearInterval(healthChecker);
        return;
      }

      const agent = session.agents.get(agentId);
      if (!agent) return;

      // Check if agent is producing output
      const timeSinceLastOutput = Date.now() - agent.lastOutput.getTime();

      if (timeSinceLastOutput > 30000 && agent.status === 'active') {
        // No output for 30 seconds, mark as idle
        agent.status = 'idle';
        logger.warn(LogCategory.TERMINAL, `[Enhanced] Agent ${agent.displayName} is idle`);

        // Try to recover pipe-pane
        if (agent.pipePaneActive) {
          const paneRef = `${session.sessionName}:${session.windowName}.${agentId}`;
          const recovered = await this.setupPipePaneWithVerification(paneRef, agent);

          if (recovered) {
            logger.info(LogCategory.TERMINAL, `[Enhanced] Recovered pipe-pane for ${agent.displayName}`);
            await this.sendTestOutput(paneRef, agent);
          }
        }
      } else if (timeSinceLastOutput < 10000 && agent.status === 'idle') {
        // Output resumed, mark as active
        agent.status = 'active';
        logger.info(LogCategory.TERMINAL, `[Enhanced] Agent ${agent.displayName} is active again`);
      }

      // Broadcast status update
      await this.broadcastAgentStatus(session);
    }, HEALTH_CHECK_INTERVAL);

    session.healthCheckers.set(agentId, healthChecker);
  }

  /**
   * Send test output to verify streaming
   */
  private async sendTestOutput(paneRef: string, agent: AgentInfo): Promise<void> {
    const message = `[STREAM-TEST] ${agent.displayName} terminal streaming initialized at ${new Date().toISOString()}`;
    await this.sendToPane(paneRef, `echo "${message}"`);
  }

  /**
   * Send command to tmux pane
   */
  private async sendToPane(paneRef: string, command: string): Promise<void> {
    return new Promise((resolve) => {
      const tmuxCommand = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux send-keys -t ${paneRef} "${command}" Enter`;

      exec(tmuxCommand, (error) => {
        if (error) {
          logger.error(LogCategory.TERMINAL, `[Enhanced] Failed to send to pane: ${error}`);
        }
        resolve();
      });
    });
  }

  /**
   * Verify tmux session exists
   */
  private async verifyTmuxSession(sessionName: string): Promise<boolean> {
    try {
      const result = execSync(
        `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux has-session -t ${sessionName} 2>/dev/null`
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Broadcast terminal output to frontend
   */
  private broadcastTerminalOutput(farmId: string, agentId: number, agentName: string, lines: string[]): void {
    const output = lines.join('\n');

    websocketManager.broadcastToFarm(farmId, 'terminal:output', {
      farmId,
      agentId,
      agentName,
      output,
      timestamp: new Date().toISOString()
    });

    this.emit('output', { farmId, agentId, agentName, output });
  }

  /**
   * Broadcast agent status to frontend
   */
  private async broadcastAgentStatus(session: StreamingSession): Promise<void> {
    const agents = Array.from(session.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.displayName,
      status: agent.status,
      pipePaneActive: agent.pipePaneActive,
      lastOutput: agent.lastOutput.toISOString()
    }));

    websocketManager.broadcastToFarm(session.farmId, 'terminal:agents', {
      farmId: session.farmId,
      agents,
      timestamp: new Date().toISOString()
    });

    // Also update database
    try {
      for (const agent of agents) {
        await db.query(
          `UPDATE agents SET status = $1 WHERE farm_id = $2 AND pane_index = $3`,
          [agent.status, session.farmId, agent.id]
        );
      }
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `[Enhanced] Failed to update agent status in DB: ${error}`);
    }
  }

  /**
   * Start global health monitoring
   */
  private startGlobalHealthMonitoring(): void {
    this.globalHealthChecker = setInterval(() => {
      for (const [farmId, session] of this.sessions) {
        if (session.isActive) {
          const timeSinceLastCheck = Date.now() - session.lastHealthCheck.getTime();

          if (timeSinceLastCheck > 60000) {
            logger.warn(LogCategory.TERMINAL, `[Enhanced] Session ${farmId} health check overdue`);
          }

          session.lastHealthCheck = new Date();
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Clean up session resources
   */
  private async cleanupSession(farmId: string): Promise<void> {
    const session = this.sessions.get(farmId);
    if (!session) return;

    session.isActive = false;

    // Clean up watchers
    for (const watcher of session.watchers.values()) {
      await watcher.close();
    }

    // Clear intervals
    for (const interval of session.healthCheckers.values()) {
      clearInterval(interval);
    }
    for (const interval of session.outputMonitors.values()) {
      clearInterval(interval);
    }

    this.sessions.delete(farmId);
    logger.info(LogCategory.TERMINAL, `[Enhanced] Cleaned up session for farm ${farmId}`);
  }

  /**
   * Get file size helper
   */
  private async getFileSize(path: string): Promise<number> {
    try {
      const stats = await fs.stat(path);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop a specific farm session
   */
  async stopStreaming(farmId: string): Promise<void> {
    logger.info(LogCategory.TERMINAL, `[Enhanced] Stopping streaming for farm ${farmId}`);
    await this.cleanupSession(farmId);
  }

  /**
   * Get session info
   */
  getSession(farmId: string): StreamingSession | undefined {
    return this.sessions.get(farmId);
  }

  /**
   * Cleanup all sessions on shutdown
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.TERMINAL, '[Enhanced] Shutting down terminal streaming service');

    if (this.globalHealthChecker) {
      clearInterval(this.globalHealthChecker);
    }

    for (const farmId of this.sessions.keys()) {
      await this.cleanupSession(farmId);
    }
  }
}

// Export singleton instance
export const terminalStreamingEnhanced = TerminalStreamingEnhancedService.getInstance();