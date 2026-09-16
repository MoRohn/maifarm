/**
 * DirectTerminalStreamer - Simple, direct terminal streaming that actually works
 *
 * This service directly monitors terminal log files and broadcasts their content
 * via WebSocket. No complexity, just streaming.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, LogCategory } from '../utils/logger';
import { unifiedWebSocketManager } from '../websocket/UnifiedWebSocketManager';
import { cleanTerminalOutput } from '../utils/terminalCleaner';
import { pathConfig } from '../config/paths';

const execAsync = promisify(exec);
const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');
const terminalsDir = pathConfig.getPath('TERMINALS_DIR');

interface AgentStream {
  farmId: string;
  agentId: number;
  agentName: string;
  logPath: string;
  watcher?: chokidar.FSWatcher;
  lastPosition: number;
  lastContent: string;
  isActive: boolean;
}

interface FarmSession {
  farmId: string;
  sessionName: string;
  agentCount: number;
  agents: Map<number, AgentStream>;
  pollInterval?: NodeJS.Timeout;
  isActive: boolean;
}

export class DirectTerminalStreamer extends EventEmitter {
  private farms: Map<string, FarmSession> = new Map();
  private readonly POLL_INTERVAL = 500; // 500ms polling for tmux capture
  private static instance: DirectTerminalStreamer;

  private constructor() {
    super();
    logger.info(LogCategory.TERMINAL, '🚀 DirectTerminalStreamer initialized - DIRECT file & tmux monitoring');

    // Auto-discover and start streaming for existing sessions
    setTimeout(() => this.autoDiscoverSessions(), 3000);
  }

  static getInstance(): DirectTerminalStreamer {
    if (!DirectTerminalStreamer.instance) {
      DirectTerminalStreamer.instance = new DirectTerminalStreamer();
    }
    return DirectTerminalStreamer.instance;
  }

  /**
   * Start streaming for a farm - monitors both files and tmux directly
   */
  public async startStreaming(farmId: string): Promise<boolean> {
    try {
      // Stop any existing streaming
      this.stopStreaming(farmId);

      // Auto-detect session
      const sessionInfo = await this.detectSession(farmId);
      if (!sessionInfo) {
        logger.error(LogCategory.TERMINAL, `No tmux session found for farm ${farmId}`);
        return false;
      }

      const { sessionName, agentCount, windowTarget } = sessionInfo;

      logger.info(LogCategory.TERMINAL, `Starting DIRECT streaming for farm ${farmId}`, {
        sessionName,
        agentCount,
        windowTarget
      });

      // Create farm session
      const farmSession: FarmSession = {
        farmId,
        sessionName,
        agentCount,
        agents: new Map(),
        isActive: true
      };

      // Set up agents
      for (let i = 0; i < agentCount; i++) {
        const agentStream: AgentStream = {
          farmId,
          agentId: i,
          agentName: `Agent ${i + 1}`,
          logPath: path.join(terminalsDir, farmId, `agent-${i}.log`),
          lastPosition: 0,
          lastContent: '',
          isActive: true
        };

        // Try to set up file watcher
        if (fs.existsSync(agentStream.logPath)) {
          await this.setupFileWatcher(agentStream);
        }

        farmSession.agents.set(i, agentStream);
      }

      // Start tmux polling as primary method
      farmSession.pollInterval = setInterval(() => {
        this.pollTmuxSessions(farmSession, windowTarget).catch(err => {
          logger.debug(LogCategory.TERMINAL, `Tmux poll error for farm ${farmId}:`, err);
        });
      }, this.POLL_INTERVAL);

      this.farms.set(farmId, farmSession);

      // Do initial poll
      await this.pollTmuxSessions(farmSession, windowTarget);

      logger.info(LogCategory.TERMINAL, `✅ DIRECT streaming active for farm ${farmId}`);

      // Notify clients
      await unifiedWebSocketManager.broadcast('terminal:streaming:started', {
        farmId,
        sessionName,
        agentCount,
        timestamp: new Date().toISOString()
      }, `farm:${farmId}`);

      return true;
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to start streaming for farm ${farmId}:`, error);
      return false;
    }
  }

  /**
   * Set up file watcher for an agent's log file
   */
  private async setupFileWatcher(agent: AgentStream): Promise<void> {
    try {
      agent.watcher = chokidar.watch(agent.logPath, {
        persistent: true,
        usePolling: false,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 10
        }
      });

      agent.watcher.on('change', async () => {
        if (!agent.isActive) return;
        await this.processFileChange(agent);
      });

      // Process initial content
      await this.processFileChange(agent);
    } catch (error) {
      logger.debug(LogCategory.TERMINAL, `Could not set up file watcher for agent ${agent.agentId}:`, error);
    }
  }

  /**
   * Process file changes and broadcast new content
   */
  private async processFileChange(agent: AgentStream): Promise<void> {
    try {
      const stats = await fs.promises.stat(agent.logPath);
      if (stats.size <= agent.lastPosition) return;

      // Read new content
      const buffer = Buffer.alloc(stats.size - agent.lastPosition);
      const fd = await fs.promises.open(agent.logPath, 'r');

      try {
        await fd.read(buffer, 0, buffer.length, agent.lastPosition);
        agent.lastPosition = stats.size;
      } finally {
        await fd.close();
      }

      const content = buffer.toString('utf-8');
      if (!content.trim()) return;

      // Clean and broadcast
      const cleaned = cleanTerminalOutput(content, {
        preserveColor: false,
        normalizeLineEndings: true,
        trimEmpty: false
      });

      if (cleaned.trim()) {
        await this.broadcastContent(agent.farmId, agent.agentId, agent.agentName, cleaned);
      }
    } catch (error) {
      // Silent fail - file might not exist yet
    }
  }

  /**
   * Poll tmux sessions directly
   */
  private async pollTmuxSessions(farm: FarmSession, windowTarget: string): Promise<void> {
    if (!farm.isActive) return;

    for (const [agentId, agent] of farm.agents) {
      try {
        const paneRef = `${farm.sessionName}:${windowTarget}.${agentId}`;
        const { stdout } = await execAsync(
          `TMUX_TMPDIR="${tmuxTmpDir}" tmux capture-pane -t ${paneRef} -p -S -100 2>/dev/null || echo ""`
        );

        if (!stdout || stdout.trim() === '') continue;

        // Check if content changed
        if (stdout === agent.lastContent) continue;

        // Extract new content
        let newContent = stdout;
        if (agent.lastContent && stdout.includes(agent.lastContent)) {
          const index = stdout.indexOf(agent.lastContent);
          newContent = stdout.substring(index + agent.lastContent.length);
        }

        if (!newContent.trim()) continue;

        // Clean and broadcast
        const cleaned = cleanTerminalOutput(newContent, {
          preserveColor: false,
          normalizeLineEndings: true,
          trimEmpty: false
        });

        if (cleaned.trim()) {
          await this.broadcastContent(farm.farmId, agentId, agent.agentName, cleaned);
          agent.lastContent = stdout;
        }
      } catch (error) {
        // Silent continue
      }
    }
  }

  /**
   * Broadcast terminal content
   */
  private async broadcastContent(farmId: string, agentId: number, agentName: string, content: string): Promise<void> {
    const message = {
      farmId,
      agentId,
      agentIndex: agentId,
      agentName,
      content,
      lines: content.split('\n'),
      output: content,
      timestamp: new Date().toISOString(),
      source: 'direct-streamer'
    };

    // Broadcast to multiple event names for compatibility
    await Promise.all([
      unifiedWebSocketManager.broadcast('terminal:output', message, `farm:${farmId}`),
      unifiedWebSocketManager.broadcast('agent:terminal', message, `farm:${farmId}`),
      unifiedWebSocketManager.broadcast('terminal:stream', message, `farm:${farmId}`)
    ]);

    logger.debug(LogCategory.TERMINAL, `Broadcast ${content.length} bytes for farm ${farmId}, agent ${agentId}`);
  }

  /**
   * Auto-detect tmux session for a farm
   */
  private async detectSession(farmId: string): Promise<{ sessionName: string; agentCount: number; windowTarget: string } | null> {
    try {
      const shortId = farmId.substring(0, 8);
      const sessionName = `farm-${shortId}`;

      // Check if session exists
      const { stdout: hasSession } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux has-session -t ${sessionName} 2>/dev/null && echo "yes" || echo "no"`
      );

      if (hasSession.trim() !== 'yes') {
        return null;
      }

      // Count panes
      const { stdout: paneCount } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-panes -t ${sessionName} 2>/dev/null | wc -l`
      );

      // Detect window target
      const { stdout: windows } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-windows -t ${sessionName} -F "#{window_name}" 2>/dev/null`
      );

      const windowTarget = windows.includes('agents') ? 'agents' : '0';

      return {
        sessionName,
        agentCount: parseInt(paneCount.trim()) || 5,
        windowTarget
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Stop streaming for a farm
   */
  public stopStreaming(farmId: string): void {
    const farm = this.farms.get(farmId);
    if (!farm) return;

    farm.isActive = false;

    // Stop polling
    if (farm.pollInterval) {
      clearInterval(farm.pollInterval);
    }

    // Close file watchers
    for (const agent of farm.agents.values()) {
      agent.isActive = false;
      if (agent.watcher) {
        agent.watcher.close();
      }
    }

    this.farms.delete(farmId);
    logger.info(LogCategory.TERMINAL, `Stopped streaming for farm ${farmId}`);
  }

  /**
   * Auto-discover and start streaming for existing sessions
   */
  public async autoDiscoverSessions(): Promise<void> {
    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-sessions 2>/dev/null | grep "^farm-" | cut -d: -f1`
      );

      const sessions = stdout.trim().split('\n').filter(s => s);

      for (const sessionName of sessions) {
        const match = sessionName.match(/^farm-([a-f0-9-]+)/);
        if (match) {
          const farmId = match[1];

          // Try to find full farm ID from terminal directory
          const terminalDirs = await fs.promises.readdir(terminalsDir).catch(() => []);
          const fullFarmId = terminalDirs.find(dir => dir.startsWith(farmId)) || farmId;

          if (!this.farms.has(fullFarmId)) {
            const success = await this.startStreaming(fullFarmId);
            if (success) {
              logger.info(LogCategory.TERMINAL, `Auto-discovered and started streaming for farm ${fullFarmId}`);
            }
          }
        }
      }
    } catch (error) {
      logger.debug(LogCategory.TERMINAL, 'No sessions to auto-discover');
    }
  }

  /**
   * Check if farm is streaming
   */
  public isStreaming(farmId: string): boolean {
    return this.farms.has(farmId) && this.farms.get(farmId)!.isActive;
  }

  /**
   * Get streaming status
   */
  public getStatus(): any {
    const status: any[] = [];

    for (const [farmId, farm] of this.farms) {
      status.push({
        farmId,
        sessionName: farm.sessionName,
        agentCount: farm.agentCount,
        isActive: farm.isActive,
        agents: Array.from(farm.agents.values()).map(a => ({
          agentId: a.agentId,
          agentName: a.agentName,
          hasWatcher: !!a.watcher,
          lastPosition: a.lastPosition
        }))
      });
    }

    return status;
  }

  /**
   * Shutdown all streams
   */
  public shutdown(): void {
    for (const farmId of this.farms.keys()) {
      this.stopStreaming(farmId);
    }
    logger.info(LogCategory.TERMINAL, 'DirectTerminalStreamer shutdown complete');
  }
}

// Export singleton
export const directTerminalStreamer = DirectTerminalStreamer.getInstance();