/**
 * Session Cleanup Manager - Prevents orphaned tmux sessions from interfering with new farms
 *
 * Handles:
 * - Detection of orphaned tmux sessions
 * - Cleanup of stale terminal streams
 * - Prevention of cross-farm contamination
 * - Automatic recovery from failed cleanups
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, LogCategory } from '../utils/logger';
import { terminalStreamService } from './terminalStreamService';

const execAsync = promisify(exec);

interface OrphanedSession {
  sessionName: string;
  farmId: string;
  createdAt: Date;
  lastActivity: Date;
  paneCount: number;
}

export class SessionCleanupManager {
  private static instance: SessionCleanupManager;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 30000; // 30 seconds
  private readonly SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private activeFarmIds: Set<string> = new Set();

  private constructor() {
    this.startCleanupInterval();
  }

  static getInstance(): SessionCleanupManager {
    if (!SessionCleanupManager.instance) {
      SessionCleanupManager.instance = new SessionCleanupManager();
    }
    return SessionCleanupManager.instance;
  }

  /**
   * Register an active farm to prevent it from being cleaned up
   */
  registerActiveFarm(farmId: string): void {
    const cleanFarmId = farmId.replace(/^(farm-)?/, '').substring(0, 36);
    // Also register the short ID (first 8 chars) for session name matching
    const shortId = cleanFarmId.substring(0, 8);
    this.activeFarmIds.add(cleanFarmId);
    this.activeFarmIds.add(shortId);
    logger.debug(LogCategory.TERMINAL, `Registered active farm: ${cleanFarmId} (short: ${shortId})`);
  }

  /**
   * Unregister a farm when it completes or fails
   */
  unregisterFarm(farmId: string): void {
    const cleanFarmId = farmId.replace(/^(farm-)?/, '').substring(0, 36);
    const shortId = cleanFarmId.substring(0, 8);
    this.activeFarmIds.delete(cleanFarmId);
    this.activeFarmIds.delete(shortId);
    logger.debug(LogCategory.TERMINAL, `Unregistered farm: ${cleanFarmId} (short: ${shortId})`);
  }

  /**
   * Start the periodic cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.performCleanup().catch(error => {
        logger.error(LogCategory.TERMINAL, 'Error during session cleanup:', error);
      });
    }, this.CLEANUP_INTERVAL_MS);

    logger.info(LogCategory.TERMINAL, 'Session cleanup manager started');
  }

  /**
   * Perform cleanup of orphaned sessions
   */
  async performCleanup(): Promise<void> {
    try {
      const orphanedSessions = await this.detectOrphanedSessions();

      if (orphanedSessions.length === 0) {
        return;
      }

      logger.info(LogCategory.TERMINAL, `Found ${orphanedSessions.length} orphaned sessions to clean`);

      for (const session of orphanedSessions) {
        await this.cleanupSession(session);
      }
    } catch (error) {
      logger.error(LogCategory.TERMINAL, 'Failed to perform cleanup:', error);
    }
  }

  /**
   * Detect orphaned tmux sessions
   */
  private async detectOrphanedSessions(): Promise<OrphanedSession[]> {
    const orphaned: OrphanedSession[] = [];

    try {
      // List all tmux sessions
      const { stdout } = await execAsync('TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}:#{session_created}:#{session_activity}" 2>/dev/null || echo ""');

      if (!stdout.trim()) {
        return orphaned;
      }

      const sessions = stdout.trim().split('\n');
      const now = Date.now();

      for (const sessionLine of sessions) {
        const [sessionName, created, activity] = sessionLine.split(':');

        // Only check farm sessions
        if (!sessionName.startsWith('farm-')) {
          continue;
        }

        // Extract farm ID from session name
        const farmId = sessionName.replace('farm-', '');

        // Skip active farms
        if (this.activeFarmIds.has(farmId)) {
          continue;
        }

        // Check if session is orphaned (no activity for timeout period)
        const lastActivity = parseInt(activity) * 1000;
        const sessionAge = now - lastActivity;

        if (sessionAge > this.SESSION_TIMEOUT_MS) {
          // Get pane count
          let paneCount = 0;
          try {
            const { stdout: paneOutput } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName} 2>/dev/null | wc -l`);
            paneCount = parseInt(paneOutput.trim()) || 0;
          } catch {
            // Session might have disappeared
          }

          orphaned.push({
            sessionName,
            farmId,
            createdAt: new Date(parseInt(created) * 1000),
            lastActivity: new Date(lastActivity),
            paneCount
          });
        }
      }
    } catch (error) {
      // Tmux might not have any sessions
      logger.debug(LogCategory.TERMINAL, 'No tmux sessions found or tmux error:', error);
    }

    return orphaned;
  }

  /**
   * Cleanup a specific orphaned session
   */
  private async cleanupSession(session: OrphanedSession): Promise<void> {
    logger.info(LogCategory.TERMINAL, `Cleaning up orphaned session: ${session.sessionName} (inactive since ${session.lastActivity})`);

    try {
      // Stop any terminal streams for this farm
      const streamingStatus = terminalStreamService.getStreamingStatus(session.farmId);

      for (const agentId of Object.keys(streamingStatus)) {
        try {
          await terminalStreamService.stopStream(session.farmId, agentId);
        } catch (error) {
          logger.debug(LogCategory.TERMINAL, `Failed to stop stream for ${session.farmId}:${agentId}:`, error);
        }
      }

      // Kill the tmux session
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${session.sessionName} 2>/dev/null || true`);

      logger.info(LogCategory.TERMINAL, `Successfully cleaned up session: ${session.sessionName}`);
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to cleanup session ${session.sessionName}:`, error);
    }
  }

  /**
   * Force cleanup of a specific farm
   */
  async forceCleanupFarm(farmId: string): Promise<void> {
    const cleanFarmId = farmId.replace(/^(farm-)?/, '').substring(0, 36);
    const sessionName = `farm-${cleanFarmId.substring(0, 8)}`;

    logger.info(LogCategory.TERMINAL, `Force cleaning up farm ${cleanFarmId} (session: ${sessionName})`);

    // Unregister from active farms
    this.unregisterFarm(cleanFarmId);

    // Stop all streams
    const streamingStatus = terminalStreamService.getStreamingStatus(cleanFarmId);

    for (const agentId of Object.keys(streamingStatus)) {
      try {
        await terminalStreamService.stopStream(cleanFarmId, agentId);
      } catch (error) {
        logger.debug(LogCategory.TERMINAL, `Failed to stop stream during force cleanup:`, error);
      }
    }

    // Kill tmux session
    try {
      await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${sessionName} 2>/dev/null || true`);
    } catch (error) {
      logger.debug(LogCategory.TERMINAL, `Failed to kill tmux session during force cleanup:`, error);
    }
  }

  /**
   * Stop the cleanup manager
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logger.info(LogCategory.TERMINAL, 'Session cleanup manager stopped');
  }
}

// Export singleton instance
export const sessionCleanupManager = SessionCleanupManager.getInstance();