/**
 * Terminal Output Watcher Service
 *
 * Monitors terminal output from tmux sessions and broadcasts updates
 * via WebSocket. This is a facade that delegates to the underlying
 * terminalFileWatcherService for actual file watching.
 */

import { Server as SocketServer } from 'socket.io';
import { terminalFileWatcherService } from './terminalFileWatcherService';
import { logger, LogCategory } from './ProductionLogger';

interface WatchedSession {
  sessionName: string;
  farmId?: string;
  agentCount: number;
  startedAt: Date;
}

class TerminalOutputWatcher {
  private watchedSessions: Map<string, WatchedSession> = new Map();
  private io: SocketServer | null = null;

  /**
   * Set the WebSocket server for broadcasting
   */
  setWebSocketServer(io: SocketServer): void {
    this.io = io;
    logger.debug(LogCategory.TERMINAL, 'WebSocket server set for terminal output watcher');
  }

  /**
   * Start watching a terminal session
   */
  async startWatching(
    sessionName: string,
    farmId?: string,
    agentCount: number = 1
  ): Promise<void> {
    if (this.watchedSessions.has(sessionName)) {
      logger.debug(LogCategory.TERMINAL, 'Session already being watched', { sessionName });
      return;
    }

    this.watchedSessions.set(sessionName, {
      sessionName,
      farmId,
      agentCount,
      startedAt: new Date()
    });

    // Delegate to file watcher service
    if (farmId) {
      try {
        await terminalFileWatcherService.watchFarm(farmId, sessionName);
        logger.info(LogCategory.TERMINAL, 'Started watching terminal session', {
          sessionName,
          farmId,
          agentCount
        });
      } catch (error) {
        logger.warn(LogCategory.TERMINAL, 'Failed to start file watcher, continuing anyway', {
          sessionName,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Stop watching a terminal session
   */
  stopWatching(sessionName: string): void {
    const session = this.watchedSessions.get(sessionName);
    if (!session) {
      return;
    }

    this.watchedSessions.delete(sessionName);

    // Stop file watcher if it was started
    if (session.farmId) {
      try {
        terminalFileWatcherService.stopWatching(session.farmId);
      } catch (error) {
        logger.warn(LogCategory.TERMINAL, 'Error stopping file watcher', {
          sessionName,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    logger.info(LogCategory.TERMINAL, 'Stopped watching terminal session', { sessionName });
  }

  /**
   * Check if a session is being watched
   */
  isWatching(sessionName: string): boolean {
    return this.watchedSessions.has(sessionName);
  }

  /**
   * Get all watched sessions
   */
  getWatchedSessions(): string[] {
    return Array.from(this.watchedSessions.keys());
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionName: string): WatchedSession | undefined {
    return this.watchedSessions.get(sessionName);
  }

  /**
   * Legacy watch method (alias for startWatching)
   */
  watch(sessionName: string): void {
    this.startWatching(sessionName);
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const sessionName of this.watchedSessions.keys()) {
      this.stopWatching(sessionName);
    }
    logger.info(LogCategory.TERMINAL, 'Stopped all terminal watchers');
  }

  /**
   * Get watcher statistics
   */
  getStats(): {
    activeWatchers: number;
    sessions: Array<{ sessionName: string; farmId?: string; uptimeMs: number }>;
  } {
    const now = Date.now();
    return {
      activeWatchers: this.watchedSessions.size,
      sessions: Array.from(this.watchedSessions.values()).map(s => ({
        sessionName: s.sessionName,
        farmId: s.farmId,
        uptimeMs: now - s.startedAt.getTime()
      }))
    };
  }
}

// Export singleton instance
export const terminalOutputWatcher = new TerminalOutputWatcher();
