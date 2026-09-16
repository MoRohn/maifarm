/**
 * Multi-Agent Terminal Coordinator
 *
 * Ensures ALL agents in a farm have visible, active terminal streams
 * regardless of tmux session state.
 *
 * Key Features:
 * - Monitors all agents and ensures terminal visibility
 * - Falls back to file-based streaming when tmux fails
 * - Broadcasts terminal output for ALL agents simultaneously
 * - Maintains agent state synchronization with frontend
 * - Auto-recovers from tmux session failures
 */

import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'chokidar';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { db } from '../database/connection';
import { exec } from 'child_process';
import { promisify } from 'util';
import { cleanTerminalOutput } from '../utils/terminalCleaner';

const execAsync = promisify(exec);

interface AgentTerminalState {
  farmId: string;
  agentId: string;
  agentIndex: number;
  agentName: string;
  sessionName: string;

  // Output tracking
  outputPath: string;
  lastPosition: number;
  watcher?: FSWatcher;

  // State
  isActive: boolean;
  isStreaming: boolean;
  lastActivity: Date;

  // Error handling
  errorCount: number;
  lastError?: string;
}

interface CoordinatorStats {
  totalAgents: number;
  activeStreams: number;
  inactiveStreams: number;
  failedStreams: number;
  totalBytesStreamed: number;
  averageLatency: number;
}

export class MultiAgentTerminalCoordinator extends EventEmitter {
  private static instance: MultiAgentTerminalCoordinator;
  private agentStates: Map<string, AgentTerminalState> = new Map(); // farmId:agentIndex -> state
  private farmAgents: Map<string, Set<string>> = new Map(); // farmId -> Set<agentKey>
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private readonly HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
  private readonly STREAM_FLUSH_INTERVAL = 100; // 100ms for smooth streaming
  private readonly MAX_ERROR_COUNT = 5;

  private stats: CoordinatorStats = {
    totalAgents: 0,
    activeStreams: 0,
    inactiveStreams: 0,
    failedStreams: 0,
    totalBytesStreamed: 0,
    averageLatency: 0
  };

  private constructor() {
    super();
    this.startHealthCheck();
    logger.info(LogCategory.TERMINAL, 'MultiAgentTerminalCoordinator initialized');
  }

  static getInstance(): MultiAgentTerminalCoordinator {
    if (!MultiAgentTerminalCoordinator.instance) {
      MultiAgentTerminalCoordinator.instance = new MultiAgentTerminalCoordinator();
    }
    return MultiAgentTerminalCoordinator.instance;
  }

  /**
   * Register all agents for a farm
   */
  async registerFarm(
    farmId: string,
    sessionName: string,
    agentCount: number,
    agentNames: string[]
  ): Promise<void> {
    logger.info(LogCategory.TERMINAL,
      `Registering ${agentCount} agents for farm ${farmId}`);

    // Initialize farm tracking
    if (!this.farmAgents.has(farmId)) {
      this.farmAgents.set(farmId, new Set());
    }

    // Register each agent
    for (let i = 0; i < agentCount; i++) {
      await this.registerAgent(farmId, i, sessionName, agentNames[i] || `Agent ${i + 1}`);
    }

    // Broadcast initial state to frontend
    await this.broadcastFarmAgentStates(farmId);

    logger.info(LogCategory.TERMINAL,
      `Successfully registered ${agentCount} agents for farm ${farmId}`);
  }

  /**
   * Register individual agent
   */
  async registerAgent(
    farmId: string,
    agentIndex: number,
    sessionName: string,
    agentName: string
  ): Promise<void> {
    const agentKey = `${farmId}:${agentIndex}`;
    const agentId = `agent-${agentIndex}`;

    // Skip if already registered
    if (this.agentStates.has(agentKey)) {
      logger.debug(LogCategory.TERMINAL, `Agent ${agentKey} already registered`);
      return;
    }

    const outputPath = join(
      pathConfig.getPath('TERMINALS_DIR'),
      farmId,
      `${agentId}.log`
    );

    // Ensure directory exists
    await fs.mkdir(join(pathConfig.getPath('TERMINALS_DIR'), farmId), { recursive: true });

    const state: AgentTerminalState = {
      farmId,
      agentId,
      agentIndex,
      agentName,
      sessionName,
      outputPath,
      lastPosition: 0,
      isActive: true,
      isStreaming: false,
      lastActivity: new Date(),
      errorCount: 0
    };

    this.agentStates.set(agentKey, state);
    this.farmAgents.get(farmId)!.add(agentKey);
    this.stats.totalAgents++;

    // Start streaming for this agent
    await this.startAgentStream(state);

    logger.info(LogCategory.TERMINAL,
      `Registered agent ${agentName} (${agentIndex}) for farm ${farmId}`);
  }

  /**
   * Start streaming for an agent
   */
  private async startAgentStream(state: AgentTerminalState): Promise<void> {
    const agentKey = `${state.farmId}:${state.agentIndex}`;

    try {
      // Check if output file exists, if not wait a bit
      let attempts = 0;
      while (attempts < 10) {
        try {
          await fs.access(state.outputPath);
          break;
        } catch {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      }

      // Setup file watcher
      state.watcher = watch(state.outputPath, {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 50
        }
      });

      state.watcher.on('change', async () => {
        await this.handleFileChange(state);
      });

      state.watcher.on('add', async () => {
        await this.handleFileChange(state);
      });

      state.watcher.on('error', (error) => {
        logger.error(LogCategory.TERMINAL,
          `File watcher error for ${agentKey}:`, error);
        state.errorCount++;
      });

      state.isStreaming = true;
      this.stats.activeStreams++;

      logger.info(LogCategory.TERMINAL,
        `Started streaming for agent ${state.agentName} (${agentKey})`);

      // Emit initial notification
      this.emitAgentStatus(state, 'streaming');

    } catch (error) {
      logger.error(LogCategory.TERMINAL,
        `Failed to start stream for ${agentKey}:`, error);
      state.errorCount++;
      state.lastError = error instanceof Error ? error.message : String(error);

      // Retry after delay
      setTimeout(() => this.startAgentStream(state), 2000);
    }
  }

  /**
   * Handle file changes and stream output
   */
  private async handleFileChange(state: AgentTerminalState): Promise<void> {
    try {
      const stats = await fs.stat(state.outputPath);
      const currentSize = stats.size;

      // Only read new content
      if (currentSize > state.lastPosition) {
        const stream = await fs.open(state.outputPath, 'r');
        const buffer = Buffer.alloc(currentSize - state.lastPosition);

        await stream.read(buffer, 0, buffer.length, state.lastPosition);
        await stream.close();

        const newContent = buffer.toString('utf-8');
        state.lastPosition = currentSize;

        // Clean output (remove ANSI codes, control characters, etc.)
        const cleanedContent = this.cleanTerminalOutput(newContent);

        if (cleanedContent.trim().length > 0) {
          // Broadcast to all farm watchers
          this.broadcastTerminalOutput(state, cleanedContent);

          // Update stats
          state.lastActivity = new Date();
          this.stats.totalBytesStreamed += buffer.length;
        }
      }
    } catch (error) {
      logger.error(LogCategory.TERMINAL,
        `Error reading file for ${state.farmId}:${state.agentIndex}:`, error);
      state.errorCount++;
    }
  }

  /**
   * Broadcast terminal output to all connected clients
   */
  private broadcastTerminalOutput(state: AgentTerminalState, content: string): void {
    const payload = {
      farmId: state.farmId,
      agentId: state.agentId,
      agentIndex: state.agentIndex,
      agentName: state.agentName,
      sessionName: state.sessionName,
      content,
      timestamp: new Date().toISOString()
    };

    // Broadcast to farm room
    websocketManager.broadcastToFarm(state.farmId, 'terminal:output', payload);

    // Also broadcast to global terminal room for monitoring
    websocketManager.broadcast('terminal:global:output', {
      ...payload,
      farmId: state.farmId
    });

    logger.debug(LogCategory.TERMINAL,
      `Broadcasted ${content.length} bytes from ${state.agentName}`);
  }

  /**
   * Clean terminal output (remove ANSI codes, duplicate keystrokes, UI chrome, etc.)
   * Uses the comprehensive terminalCleaner utility for production-grade cleaning
   */
  private cleanTerminalOutput(content: string): string {
    return cleanTerminalOutput(content, {
      preserveColor: false,           // Remove all color codes for clean WebSocket streaming
      normalizeLineEndings: true,     // Normalize to \n
      trimEmpty: false                // Keep empty lines for formatting
    });
  }

  /**
   * Broadcast agent states to frontend
   */
  private async broadcastFarmAgentStates(farmId: string): Promise<void> {
    const agentKeys = this.farmAgents.get(farmId);
    if (!agentKeys) return;

    const agents = Array.from(agentKeys).map(key => {
      const state = this.agentStates.get(key);
      if (!state) return null;

      return {
        id: state.agentId,
        index: state.agentIndex,
        name: state.agentName,
        status: state.isActive ? 'active' : 'inactive',
        isStreaming: state.isStreaming,
        lastActivity: state.lastActivity,
        errorCount: state.errorCount
      };
    }).filter(Boolean);

    const payload = {
      farmId,
      agents,
      totalCount: agents.length,
      activeCount: agents.filter(a => a?.isStreaming).length,
      timestamp: new Date().toISOString()
    };

    websocketManager.broadcastToFarm(farmId, 'terminal:agents:status', payload);

    logger.debug(LogCategory.TERMINAL,
      `Broadcasted status for ${agents.length} agents in farm ${farmId}`);
  }

  /**
   * Emit agent status change
   */
  private emitAgentStatus(state: AgentTerminalState, status: string): void {
    const payload = {
      farmId: state.farmId,
      agentId: state.agentId,
      agentIndex: state.agentIndex,
      agentName: state.agentName,
      status,
      isStreaming: state.isStreaming,
      lastActivity: state.lastActivity,
      errorCount: state.errorCount
    };

    websocketManager.broadcastToFarm(state.farmId, 'terminal:agent:status', payload);
  }

  /**
   * Health check - ensure all agents are streaming
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);

    logger.info(LogCategory.TERMINAL, 'Health check started');
  }

  private async performHealthCheck(): Promise<void> {
    let activeCount = 0;
    let inactiveCount = 0;
    let failedCount = 0;

    for (const [key, state] of this.agentStates.entries()) {
      // Check if agent is stale (no activity for 30 seconds)
      const timeSinceActivity = Date.now() - state.lastActivity.getTime();
      const isStale = timeSinceActivity > 30000;

      // Check if stream is healthy
      if (!state.isStreaming || state.errorCount >= this.MAX_ERROR_COUNT) {
        failedCount++;

        // Attempt recovery
        if (state.errorCount < this.MAX_ERROR_COUNT) {
          logger.warn(LogCategory.TERMINAL,
            `Attempting to recover stream for ${key}`);
          await this.recoverAgentStream(state);
        }
      } else if (isStale) {
        inactiveCount++;
      } else {
        activeCount++;
      }
    }

    // Update stats
    this.stats.activeStreams = activeCount;
    this.stats.inactiveStreams = inactiveCount;
    this.stats.failedStreams = failedCount;

    // Log health status
    if (failedCount > 0 || inactiveCount > this.stats.totalAgents / 2) {
      logger.warn(LogCategory.TERMINAL,
        `Health check: ${activeCount} active, ${inactiveCount} inactive, ${failedCount} failed`);
    }
  }

  /**
   * Recover a failed agent stream
   */
  private async recoverAgentStream(state: AgentTerminalState): Promise<void> {
    try {
      // Stop existing watcher
      if (state.watcher) {
        await state.watcher.close();
        state.watcher = undefined;
      }

      // Reset error count
      state.errorCount = 0;
      state.isStreaming = false;

      // Restart stream
      await this.startAgentStream(state);

      logger.info(LogCategory.TERMINAL,
        `Successfully recovered stream for ${state.agentName}`);

    } catch (error) {
      logger.error(LogCategory.TERMINAL,
        `Failed to recover stream for ${state.farmId}:${state.agentIndex}:`, error);
      state.errorCount++;
    }
  }

  /**
   * Stop streaming for a farm
   */
  async stopFarm(farmId: string): Promise<void> {
    const agentKeys = this.farmAgents.get(farmId);
    if (!agentKeys) return;

    logger.info(LogCategory.TERMINAL, `Stopping streams for farm ${farmId}`);

    for (const key of agentKeys) {
      const state = this.agentStates.get(key);
      if (state) {
        if (state.watcher) {
          await state.watcher.close();
        }
        state.isActive = false;
        state.isStreaming = false;
        this.agentStates.delete(key);
        this.stats.totalAgents--;
      }
    }

    this.farmAgents.delete(farmId);

    logger.info(LogCategory.TERMINAL, `Stopped all streams for farm ${farmId}`);
  }

  /**
   * Get statistics
   */
  getStats(): CoordinatorStats {
    return { ...this.stats };
  }

  /**
   * Get farm agent states
   */
  getFarmAgentStates(farmId: string): any[] {
    const agentKeys = this.farmAgents.get(farmId);
    if (!agentKeys) return [];

    return Array.from(agentKeys).map(key => {
      const state = this.agentStates.get(key);
      if (!state) return null;

      return {
        agentId: state.agentId,
        agentIndex: state.agentIndex,
        agentName: state.agentName,
        isActive: state.isActive,
        isStreaming: state.isStreaming,
        lastActivity: state.lastActivity,
        errorCount: state.errorCount,
        lastError: state.lastError
      };
    }).filter(Boolean);
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.TERMINAL, 'Shutting down MultiAgentTerminalCoordinator');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop all farms
    for (const farmId of this.farmAgents.keys()) {
      await this.stopFarm(farmId);
    }

    logger.info(LogCategory.TERMINAL, 'MultiAgentTerminalCoordinator shutdown complete');
  }
}

export const multiAgentTerminalCoordinator = MultiAgentTerminalCoordinator.getInstance();
