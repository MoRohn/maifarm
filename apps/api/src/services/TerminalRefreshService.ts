/**
 * Terminal Refresh Service
 * Provides automated and on-demand terminal output refresh for active agents
 *
 * Features:
 * - Periodic polling of terminal log files
 * - Force refresh on demand
 * - Health-based refresh (faster refresh for active agents)
 * - Dead agent detection
 */

import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { cleanTerminalOutput } from '../utils/terminalCleaner';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface AgentTerminalState {
  farmId: string;
  agentId: number;
  sessionName: string;
  logFile: string;
  lastSize: number;
  lastRefresh: number;
  lastActivity: number;
  isActive: boolean;
  refreshInterval: number; // Dynamic based on activity
}

export class TerminalRefreshService {
  private static instance: TerminalRefreshService;
  private agents: Map<string, AgentTerminalState> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly BASE_REFRESH_INTERVAL = 1000; // 1 second for active agents
  private readonly SLOW_REFRESH_INTERVAL = 5000; // 5 seconds for idle agents
  private readonly DEAD_AGENT_THRESHOLD = 60000; // 60 seconds without activity = potentially dead
  private readonly TMUX_TMPDIR = pathConfig.getPath('TMUX_TMP_DIR');

  private constructor() {
    logger.info(LogCategory.TERMINAL, 'Terminal Refresh Service initialized');
    this.startRefreshLoop();
  }

  static getInstance(): TerminalRefreshService {
    if (!this.instance) {
      this.instance = new TerminalRefreshService();
    }
    return this.instance;
  }

  /**
   * Register an agent for terminal refresh
   */
  async registerAgent(farmId: string, agentId: number, sessionName: string): Promise<void> {
    const key = `${farmId}:${agentId}`;

    // Construct log file path
    const terminalsDir = pathConfig.getPath('TERMINALS_DIR');
    const logFile = path.join(terminalsDir, farmId, `agent-${agentId}.log`);

    // Check if log file exists
    if (!existsSync(logFile)) {
      logger.warn(LogCategory.TERMINAL,
        `Log file does not exist for agent ${agentId} in farm ${farmId}: ${logFile}`);
      // Don't return - register anyway, file may be created soon
    }

    const state: AgentTerminalState = {
      farmId,
      agentId,
      sessionName,
      logFile,
      lastSize: 0,
      lastRefresh: Date.now(),
      lastActivity: Date.now(),
      isActive: true,
      refreshInterval: this.BASE_REFRESH_INTERVAL
    };

    this.agents.set(key, state);
    logger.info(LogCategory.TERMINAL,
      `Registered agent ${agentId} for terminal refresh in farm ${farmId}`);

    // Do immediate refresh
    await this.refreshAgent(key);
  }

  /**
   * Unregister an agent from terminal refresh
   */
  unregisterAgent(farmId: string, agentId: number): void {
    const key = `${farmId}:${agentId}`;
    this.agents.delete(key);
    logger.info(LogCategory.TERMINAL,
      `Unregistered agent ${agentId} from terminal refresh in farm ${farmId}`);
  }

  /**
   * Unregister all agents for a farm
   */
  unregisterFarm(farmId: string): void {
    const toRemove: string[] = [];
    for (const [key, state] of this.agents.entries()) {
      if (state.farmId === farmId) {
        toRemove.push(key);
      }
    }

    toRemove.forEach(key => this.agents.delete(key));
    logger.info(LogCategory.TERMINAL,
      `Unregistered ${toRemove.length} agents from terminal refresh for farm ${farmId}`);
  }

  /**
   * Force refresh for specific agent (on-demand)
   */
  async forceRefresh(farmId: string, agentId: number): Promise<boolean> {
    const key = `${farmId}:${agentId}`;
    const state = this.agents.get(key);

    if (!state) {
      logger.warn(LogCategory.TERMINAL,
        `Cannot force refresh - agent ${agentId} not registered for farm ${farmId}`);
      return false;
    }

    logger.info(LogCategory.TERMINAL,
      `Force refreshing terminal for agent ${agentId} in farm ${farmId}`);

    return await this.refreshAgent(key);
  }

  /**
   * Force refresh all agents in a farm
   */
  async forceRefreshFarm(farmId: string): Promise<number> {
    let refreshed = 0;

    for (const [key, state] of this.agents.entries()) {
      if (state.farmId === farmId) {
        const success = await this.refreshAgent(key);
        if (success) refreshed++;
      }
    }

    logger.info(LogCategory.TERMINAL,
      `Force refreshed ${refreshed} agents for farm ${farmId}`);

    return refreshed;
  }

  /**
   * Capture terminal output directly from tmux pane
   */
  private async captureFromTmux(sessionName: string, agentId: number): Promise<string | null> {
    try {
      const paneTarget = `${sessionName}:agents.${agentId}`;
      const cmd = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux capture-pane -t ${paneTarget} -p -S -100`;

      const { stdout, stderr } = await execAsync(cmd);

      if (stderr && !stderr.includes('no server running')) {
        logger.debug(LogCategory.TERMINAL, `Tmux capture stderr: ${stderr}`);
      }

      return stdout || null;
    } catch (error) {
      // Tmux not available or pane doesn't exist - not an error, just means we rely on log files
      return null;
    }
  }

  /**
   * Refresh terminal output for a specific agent
   */
  private async refreshAgent(key: string): Promise<boolean> {
    const state = this.agents.get(key);
    if (!state) return false;

    const now = Date.now();
    state.lastRefresh = now;

    try {
      // Strategy 1: Read from log file
      if (existsSync(state.logFile)) {
        const stats = await stat(state.logFile);
        const fileSize = stats.size;

        // Only read if file has grown
        if (fileSize > state.lastSize) {
          const content = await readFile(state.logFile, 'utf-8');

          // Get only new content
          const newContent = content.substring(state.lastSize);

          if (newContent.trim()) {
            // Update state
            state.lastSize = fileSize;
            state.lastActivity = now;
            state.isActive = true;
            state.refreshInterval = this.BASE_REFRESH_INTERVAL;

            // Clean and emit
            const cleaned = cleanTerminalOutput(newContent, {
              preserveColor: false,
              normalizeLineEndings: true,
              trimEmpty: true
            });

            this.emitTerminalOutput(state.farmId, state.agentId, state.sessionName, cleaned);
            return true;
          }
        }
      }

      // Strategy 2: Fallback to tmux capture if log file is empty or missing
      if (state.lastSize === 0 || !existsSync(state.logFile)) {
        const tmuxOutput = await this.captureFromTmux(state.sessionName, state.agentId);

        if (tmuxOutput) {
          const cleaned = cleanTerminalOutput(tmuxOutput, {
            preserveColor: false,
            normalizeLineEndings: true,
            trimEmpty: true
          });

          this.emitTerminalOutput(state.farmId, state.agentId, state.sessionName, cleaned);
          state.lastActivity = now;
          return true;
        }
      }

      // No new content - check if agent is dead
      const idleTime = now - state.lastActivity;
      if (idleTime > this.DEAD_AGENT_THRESHOLD) {
        if (state.isActive) {
          logger.warn(LogCategory.TERMINAL,
            `Agent ${state.agentId} in farm ${state.farmId} appears dead (no activity for ${Math.floor(idleTime / 1000)}s)`);
          state.isActive = false;
          state.refreshInterval = this.SLOW_REFRESH_INTERVAL;

          // Emit status update
          websocketManager.broadcastToFarm(state.farmId, 'terminal:agent:inactive', {
            farmId: state.farmId,
            agentId: state.agentId,
            sessionName: state.sessionName,
            idleTime,
            timestamp: new Date()
          });
        }
      }

      return false;

    } catch (error) {
      logger.error(LogCategory.TERMINAL,
        `Error refreshing agent ${state.agentId} in farm ${state.farmId}:`, error);
      return false;
    }
  }

  /**
   * Emit terminal output via WebSocket
   */
  private emitTerminalOutput(farmId: string, agentId: number, sessionName: string, content: string): void {
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) return;

    const eventData = {
      farmId,
      agentId,
      agentIndex: agentId,
      sessionName,
      sessionId: sessionName,
      output: content,
      lines,
      timestamp: new Date(),
      source: 'refresh-service'
    };

    // Emit to multiple room formats for compatibility
    const rooms = [
      `terminal:${sessionName}`,
      `terminal:${farmId}`,
      `farm:${farmId}`,
      `harvest:${farmId}`,
      `farm-${farmId.substring(0, 8)}`
    ];

    for (const room of rooms) {
      websocketManager.sendToRoom(room, 'terminal:output', eventData);
    }

    logger.debug(LogCategory.TERMINAL,
      `Emitted ${lines.length} lines for agent ${agentId} in farm ${farmId}`);
  }

  /**
   * Main refresh loop - runs continuously
   */
  private startRefreshLoop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    // Run refresh every 500ms to check which agents need refreshing
    this.refreshTimer = setInterval(async () => {
      const now = Date.now();

      for (const [key, state] of this.agents.entries()) {
        // Check if agent needs refresh based on its interval
        const timeSinceRefresh = now - state.lastRefresh;

        if (timeSinceRefresh >= state.refreshInterval) {
          await this.refreshAgent(key);
        }
      }
    }, 500); // Check every 500ms

    logger.info(LogCategory.TERMINAL, 'Terminal refresh loop started (500ms interval)');
  }

  /**
   * Stop refresh loop
   */
  stopRefreshLoop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      logger.info(LogCategory.TERMINAL, 'Terminal refresh loop stopped');
    }
  }

  /**
   * Get refresh statistics
   */
  getStats(): {
    totalAgents: number;
    activeAgents: number;
    inactiveAgents: number;
    farms: string[];
  } {
    const farms = new Set<string>();
    let active = 0;
    let inactive = 0;

    for (const state of this.agents.values()) {
      farms.add(state.farmId);
      if (state.isActive) {
        active++;
      } else {
        inactive++;
      }
    }

    return {
      totalAgents: this.agents.size,
      activeAgents: active,
      inactiveAgents: inactive,
      farms: Array.from(farms)
    };
  }

  /**
   * Cleanup on shutdown
   */
  cleanup(): void {
    this.stopRefreshLoop();
    this.agents.clear();
    logger.info(LogCategory.TERMINAL, 'Terminal Refresh Service cleaned up');
  }
}

export const terminalRefreshService = TerminalRefreshService.getInstance();
