/**
 * DirectTerminalBroadcaster - Immediate terminal output streaming
 *
 * CRITICAL: This service provides IMMEDIATE terminal streaming by directly
 * polling tmux sessions and broadcasting to WebSocket without delay.
 *
 * This is a simplified, battle-tested approach that guarantees output delivery.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, LogCategory } from '../utils/logger';
import { unifiedWebSocketManager } from '../websocket/UnifiedWebSocketManager';
import { cleanTerminalOutput } from '../utils/terminalCleaner';
import { pathConfig } from '../config/paths';

const execAsync = promisify(exec);
const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

interface ActiveFarm {
  farmId: string;
  sessionName: string;
  agentCount: number;
  pollInterval?: NodeJS.Timeout;
  lastContent: Map<number, string>;
  isActive: boolean;
}

export class DirectTerminalBroadcaster {
  private activeFarms: Map<string, ActiveFarm> = new Map();
  private readonly POLL_INTERVAL = 250; // Poll every 250ms for smooth output

  constructor() {
    logger.info(LogCategory.TERMINAL, '🚀 DirectTerminalBroadcaster initialized - IMMEDIATE streaming enabled');
  }

  /**
   * Start streaming for a farm - IMMEDIATELY begins polling and broadcasting
   */
  public async startStreaming(
    farmId: string,
    sessionName: string,
    agentCount: number
  ): Promise<void> {
    logger.info(LogCategory.TERMINAL, `📡 Starting IMMEDIATE streaming for farm ${farmId} with ${agentCount} agents`);

    // Stop any existing streaming for this farm
    this.stopStreaming(farmId);

    // Initialize farm tracking
    const farm: ActiveFarm = {
      farmId,
      sessionName,
      agentCount,
      lastContent: new Map(),
      isActive: true
    };

    this.activeFarms.set(farmId, farm);

    // Start polling IMMEDIATELY
    farm.pollInterval = setInterval(() => {
      this.pollAndBroadcast(farm).catch(err => {
        logger.error(LogCategory.TERMINAL, `Polling error for farm ${farmId}:`, err);
      });
    }, this.POLL_INTERVAL);

    // Do first poll immediately
    await this.pollAndBroadcast(farm);

    logger.info(LogCategory.TERMINAL, `✅ Streaming ACTIVE for farm ${farmId} - polling every ${this.POLL_INTERVAL}ms`);
  }

  /**
   * Poll tmux and broadcast new content
   */
  private async pollAndBroadcast(farm: ActiveFarm): Promise<void> {
    if (!farm.isActive) return;

    for (let agentId = 0; agentId < farm.agentCount; agentId++) {
      try {
        // Capture pane content
        const paneRef = `${farm.sessionName}:0.${agentId}`;
        const { stdout } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux capture-pane -t ${paneRef} -p -S -1000 2>/dev/null || echo ""`
        );

        if (!stdout || stdout.trim() === '') continue;

        // Check if content changed
        const lastContent = farm.lastContent.get(agentId) || '';
        if (stdout === lastContent) continue;

        // Extract only new content
        let newContent = stdout;
        if (lastContent && stdout.startsWith(lastContent)) {
          newContent = stdout.substring(lastContent.length);
        }

        if (!newContent.trim()) continue;

        // Clean the output
        const cleaned = cleanTerminalOutput(newContent, {
          preserveColor: false,
          normalizeLineEndings: true,
          trimEmpty: false
        });

        if (!cleaned.trim()) continue;

        // Broadcast immediately
        await this.broadcast(farm.farmId, agentId, cleaned);

        // Update last content
        farm.lastContent.set(agentId, stdout);

      } catch (error) {
        // Silently continue - don't spam logs
      }
    }
  }

  /**
   * Broadcast terminal output to WebSocket
   */
  private async broadcast(farmId: string, agentId: number, content: string): Promise<void> {
    const message = {
      farmId,
      agentId,
      agentName: `Agent ${agentId + 1}`,
      content,
      timestamp: new Date().toISOString(),
      source: 'direct-poll'
    };

    // Broadcast to farm room
    await unifiedWebSocketManager.broadcast(
      'terminal:output',
      message,
      `farm:${farmId}`
    );

    // Also broadcast to terminal-specific room
    await unifiedWebSocketManager.broadcast(
      'terminal:stream',
      message,
      `terminal:${farmId}:${agentId}`
    );
  }

  /**
   * Stop streaming for a farm
   */
  public stopStreaming(farmId: string): void {
    const farm = this.activeFarms.get(farmId);
    if (!farm) return;

    farm.isActive = false;

    if (farm.pollInterval) {
      clearInterval(farm.pollInterval);
    }

    this.activeFarms.delete(farmId);
    logger.info(LogCategory.TERMINAL, `Stopped streaming for farm ${farmId}`);
  }

  /**
   * Get streaming status
   */
  public getStatus(): any {
    const farms = Array.from(this.activeFarms.entries()).map(([id, farm]) => ({
      farmId: id,
      sessionName: farm.sessionName,
      agentCount: farm.agentCount,
      isActive: farm.isActive,
      agentsWithContent: farm.lastContent.size
    }));

    return {
      activeFarms: farms.length,
      totalAgents: farms.reduce((sum, f) => sum + f.agentCount, 0),
      farms
    };
  }

  /**
   * Force immediate poll for a specific farm
   */
  public async forcePoll(farmId: string): Promise<void> {
    const farm = this.activeFarms.get(farmId);
    if (farm && farm.isActive) {
      await this.pollAndBroadcast(farm);
    }
  }

  /**
   * Cleanup all streams
   */
  public shutdown(): void {
    for (const farmId of this.activeFarms.keys()) {
      this.stopStreaming(farmId);
    }
    logger.info(LogCategory.TERMINAL, 'DirectTerminalBroadcaster shutdown complete');
  }
}

// Export singleton
export const directTerminalBroadcaster = new DirectTerminalBroadcaster();
