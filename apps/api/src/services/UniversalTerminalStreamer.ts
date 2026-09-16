/**
 * UniversalTerminalStreamer - Guaranteed terminal streaming for ALL farm types
 *
 * This service ensures that terminal output is ALWAYS streamed, regardless of
 * which launch path is used (Harvest, GoWild, QuickTask, XenoSync, etc.)
 *
 * CRITICAL: This replaces all other terminal streaming services to ensure
 * consistent behavior across all farm launch modes.
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { unifiedWebSocketManager } from '../websocket/UnifiedWebSocketManager';
import { cleanTerminalOutput } from '../utils/terminalCleaner';
import { pathConfig } from '../config/paths';

const execAsync = promisify(exec);
const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

interface StreamingSession {
  farmId: string;
  sessionName: string;
  agentCount: number;
  agentNames: string[];
  pollInterval?: NodeJS.Timeout;
  lastContent: Map<number, string>;
  isActive: boolean;
  startTime: Date;
  messagesStreamed: number;
  bytesStreamed: number;
}

export class UniversalTerminalStreamer extends EventEmitter {
  private sessions: Map<string, StreamingSession> = new Map();
  private readonly POLL_INTERVAL = 250; // 250ms for responsive streaming
  private static instance: UniversalTerminalStreamer;

  private constructor() {
    super();
    logger.info(LogCategory.TERMINAL, '🌟 UniversalTerminalStreamer initialized - GUARANTEED streaming for ALL farms');
  }

  static getInstance(): UniversalTerminalStreamer {
    if (!UniversalTerminalStreamer.instance) {
      UniversalTerminalStreamer.instance = new UniversalTerminalStreamer();
    }
    return UniversalTerminalStreamer.instance;
  }

  /**
   * Start terminal streaming for a farm - WORKS FOR ALL FARM TYPES
   * This is the ONLY method that should be called to start streaming
   */
  public async startStreaming(
    farmId: string,
    sessionName?: string,
    agentCount?: number,
    agentNames?: string[]
  ): Promise<boolean> {
    try {
      // Auto-detect session if not provided
      if (!sessionName) {
        sessionName = await this.detectSession(farmId);
        if (!sessionName) {
          logger.error(LogCategory.TERMINAL, `No tmux session found for farm ${farmId}`);
          return false;
        }
      }

      // Auto-detect agent count if not provided
      if (!agentCount) {
        agentCount = await this.detectAgentCount(sessionName);
      }

      // Generate default agent names if not provided
      if (!agentNames || agentNames.length === 0) {
        agentNames = Array.from({ length: agentCount }, (_, i) => `Agent ${i + 1}`);
      }

      logger.info(LogCategory.TERMINAL, `🚀 Starting UNIVERSAL streaming for farm ${farmId}`, {
        sessionName,
        agentCount,
        agentNames
      });

      // Stop any existing streaming for this farm
      this.stopStreaming(farmId);

      // Create new session
      const session: StreamingSession = {
        farmId,
        sessionName,
        agentCount,
        agentNames,
        lastContent: new Map(),
        isActive: true,
        startTime: new Date(),
        messagesStreamed: 0,
        bytesStreamed: 0
      };

      this.sessions.set(farmId, session);

      // Start polling immediately
      session.pollInterval = setInterval(() => {
        this.pollAndStream(session).catch(err => {
          logger.error(LogCategory.TERMINAL, `Polling error for farm ${farmId}:`, err);
        });
      }, this.POLL_INTERVAL);

      // Do initial poll
      await this.pollAndStream(session);

      logger.info(LogCategory.TERMINAL, `✅ UNIVERSAL streaming ACTIVE for farm ${farmId}`);

      // Broadcast that terminal is ready
      await unifiedWebSocketManager.broadcast('terminal:ready', {
        farmId,
        sessionName,
        agentCount,
        agentNames,
        timestamp: new Date().toISOString()
      }, `farm:${farmId}`);

      return true;
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to start streaming for farm ${farmId}:`, error);
      return false;
    }
  }

  /**
   * Auto-detect tmux session for a farm
   */
  private async detectSession(farmId: string): Promise<string | null> {
    try {
      // Try short ID format first (most common)
      const shortId = farmId.substring(0, 8);
      const sessionName = `farm-${shortId}`;

      const { stdout } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux has-session -t ${sessionName} 2>/dev/null && echo "exists" || echo ""`
      );

      if (stdout.trim() === 'exists') {
        return sessionName;
      }

      // Try full ID format
      const fullSessionName = `farm-${farmId}`;
      const { stdout: fullStdout } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux has-session -t ${fullSessionName} 2>/dev/null && echo "exists" || echo ""`
      );

      if (fullStdout.trim() === 'exists') {
        return fullSessionName;
      }

      // Try to find any session with this farm ID
      const { stdout: listOutput } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-sessions 2>/dev/null | grep -E "${shortId}|${farmId}" | head -1 | cut -d: -f1`
      );

      if (listOutput.trim()) {
        return listOutput.trim();
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Auto-detect agent count in a session
   */
  private async detectAgentCount(sessionName: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-panes -t ${sessionName} 2>/dev/null | wc -l`
      );

      const count = parseInt(stdout.trim(), 10);
      return isNaN(count) ? 5 : count; // Default to 5 if detection fails
    } catch {
      return 5; // Default agent count
    }
  }

  /**
   * Detect window target (agents for XenoSync, 0 for standard)
   */
  private async detectWindowTarget(sessionName: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-windows -t ${sessionName} -F "#{window_name}" 2>/dev/null | head -1`
      );

      const windowName = stdout.trim();
      // If we have an 'agents' window, use it (XenoSync), otherwise use window 0
      if (windowName === 'agents') {
        return 'agents';
      }
      return '0';
    } catch {
      return '0'; // Default to window 0
    }
  }

  /**
   * Poll tmux and stream content
   */
  private async pollAndStream(session: StreamingSession): Promise<void> {
    if (!session.isActive) return;

    // Detect window target (agents for XenoSync, 0 for standard)
    const windowTarget = await this.detectWindowTarget(session.sessionName);

    for (let i = 0; i < session.agentCount; i++) {
      try {
        // Capture pane content
        const paneRef = `${session.sessionName}:${windowTarget}.${i}`;
        const { stdout } = await execAsync(
          `TMUX_TMPDIR="${tmuxTmpDir}" tmux capture-pane -t ${paneRef} -p -S -500 2>/dev/null || echo ""`
        );

        if (!stdout || stdout.trim() === '') continue;

        // Check if content changed
        const lastContent = session.lastContent.get(i) || '';
        if (stdout === lastContent) continue;

        // Extract new content
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

        // Stream to WebSocket
        await this.broadcastOutput(session, i, cleaned);

        // Update last content
        session.lastContent.set(i, stdout);

        // Update metrics
        session.messagesStreamed++;
        session.bytesStreamed += cleaned.length;

      } catch (error) {
        // Silently continue - don't flood logs
      }
    }
  }

  /**
   * Broadcast terminal output to WebSocket
   */
  private async broadcastOutput(session: StreamingSession, agentId: number, content: string): Promise<void> {
    const message = {
      farmId: session.farmId,
      agentId,
      agentName: session.agentNames[agentId] || `Agent ${agentId + 1}`,
      content,
      timestamp: new Date().toISOString(),
      source: 'universal-streamer'
    };

    // Broadcast to multiple channels for compatibility
    await Promise.all([
      unifiedWebSocketManager.broadcast('terminal:output', message, `farm:${session.farmId}`),
      unifiedWebSocketManager.broadcast('terminal:stream', message, `terminal:${session.farmId}:${agentId}`),
      unifiedWebSocketManager.broadcast('agent:output', message, `agent:${session.farmId}:${agentId}`)
    ]);
  }

  /**
   * Stop streaming for a farm
   */
  public stopStreaming(farmId: string): void {
    const session = this.sessions.get(farmId);
    if (!session) return;

    session.isActive = false;

    if (session.pollInterval) {
      clearInterval(session.pollInterval);
    }

    const duration = Date.now() - session.startTime.getTime();

    logger.info(LogCategory.TERMINAL, `Stopped streaming for farm ${farmId}`, {
      duration: `${(duration / 1000).toFixed(1)}s`,
      messagesStreamed: session.messagesStreamed,
      bytesStreamed: `${(session.bytesStreamed / 1024).toFixed(1)}KB`
    });

    this.sessions.delete(farmId);
  }

  /**
   * Get streaming status for a farm
   */
  public getStatus(farmId: string): any {
    const session = this.sessions.get(farmId);
    if (!session) {
      return { streaming: false, farmId };
    }

    const duration = Date.now() - session.startTime.getTime();

    return {
      streaming: true,
      farmId,
      sessionName: session.sessionName,
      agentCount: session.agentCount,
      agentNames: session.agentNames,
      isActive: session.isActive,
      duration: `${(duration / 1000).toFixed(1)}s`,
      messagesStreamed: session.messagesStreamed,
      bytesStreamed: `${(session.bytesStreamed / 1024).toFixed(1)}KB`,
      agentsWithContent: session.lastContent.size
    };
  }

  /**
   * Get all active sessions
   */
  public getAllSessions(): any[] {
    return Array.from(this.sessions.keys()).map(farmId => this.getStatus(farmId));
  }

  /**
   * Force immediate poll for a farm
   */
  public async forcePoll(farmId: string): Promise<void> {
    const session = this.sessions.get(farmId);
    if (session && session.isActive) {
      await this.pollAndStream(session);
    }
  }

  /**
   * Check if a farm is being streamed
   */
  public isStreaming(farmId: string): boolean {
    const session = this.sessions.get(farmId);
    return session?.isActive || false;
  }

  /**
   * Auto-register any active tmux sessions
   */
  public async autoRegisterActiveSessions(): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-sessions 2>/dev/null | grep "^farm-" | cut -d: -f1`
      );

      const sessions = stdout.trim().split('\n').filter(s => s);
      let registered = 0;

      for (const sessionName of sessions) {
        // Extract farm ID from session name
        const match = sessionName.match(/^farm-([a-f0-9-]+)/);
        if (match) {
          const farmId = match[1];

          // Check if already streaming
          if (!this.isStreaming(farmId)) {
            const success = await this.startStreaming(farmId, sessionName);
            if (success) registered++;
          }
        }
      }

      if (registered > 0) {
        logger.info(LogCategory.TERMINAL, `Auto-registered ${registered} active sessions`);
      }

      return registered;
    } catch {
      return 0;
    }
  }

  /**
   * Cleanup all sessions
   */
  public shutdown(): void {
    for (const farmId of this.sessions.keys()) {
      this.stopStreaming(farmId);
    }

    logger.info(LogCategory.TERMINAL, 'UniversalTerminalStreamer shutdown complete');
  }
}

// Export singleton instance
export const universalTerminalStreamer = UniversalTerminalStreamer.getInstance();

// Auto-register on startup
setTimeout(() => {
  universalTerminalStreamer.autoRegisterActiveSessions().catch(err => {
    logger.error(LogCategory.TERMINAL, 'Failed to auto-register sessions:', err);
  });
}, 5000); // Wait 5 seconds for server to fully initialize
