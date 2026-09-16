/**
 * Session Cleanup Service
 * Handles cleanup of orphaned tmux sessions, terminal processes, and workspace resources
 * Critical for preventing resource leaks in production
 *
 * IMPORTANT: This service coordinates with terminal streaming services to prevent
 * race conditions where files are deleted while still being watched.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { websocketManager } from '../websocket/websocketManager';

// Import terminal streaming services for coordination
// Using dynamic imports to avoid circular dependencies
let unifiedTerminalStreamService: any = null;
let terminalFileWatcherService: any = null;

const getTerminalServices = async () => {
  if (!unifiedTerminalStreamService) {
    try {
      const module = await import('./UnifiedTerminalStreamService');
      unifiedTerminalStreamService = module.unifiedTerminalStreamService;
    } catch {
      // Service not available, continue without it
    }
  }
  if (!terminalFileWatcherService) {
    try {
      const module = await import('./terminalFileWatcherService');
      terminalFileWatcherService = module.terminalFileWatcherService;
    } catch {
      // Service not available, continue without it
    }
  }
  return { unifiedTerminalStreamService, terminalFileWatcherService };
};

const execAsync = promisify(exec);

interface SessionInfo {
  sessionName: string;
  farmId: string;
  created: Date;
  lastActivity: Date;
  pids: number[];
  orphaned: boolean;
}

interface CleanupStats {
  sessionsChecked: number;
  sessionsCleanedUp: number;
  filesDeleted: number;
  spaceReclaimed: number; // bytes
  errors: string[];
}

interface CleanupOptions {
  maxAge?: number; // milliseconds
  dryRun?: boolean;
  includeActivesSessions?: boolean;
  forceCleanup?: boolean;
}

class SessionCleanupService extends EventEmitter {
  private static instance: SessionCleanupService;
  private cleanupInterval: NodeJS.Timer | null = null;
  private isCleaningUp = false;
  private sessionRegistry = new Map<string, SessionInfo>();
  private readonly TMUX_TMPDIR = '/tmp';
  private readonly MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours
  private readonly CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private readonly TERMINAL_OUTPUT_MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours

  private constructor() {
    super();
  }

  public static getInstance(): SessionCleanupService {
    if (!SessionCleanupService.instance) {
      SessionCleanupService.instance = new SessionCleanupService();
    }
    return SessionCleanupService.instance;
  }

  /**
   * Start automated cleanup monitoring
   */
  public startMonitoring(intervalMs: number = this.CLEANUP_INTERVAL): void {
    if (this.cleanupInterval) {
      logger.warn(LogCategory.SYSTEM, 'Session cleanup already monitoring');
      return;
    }

    logger.info(LogCategory.SYSTEM, 'Starting session cleanup monitoring');

    // Initial scan
    this.performCleanup();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, intervalMs);

    this.emit('monitoring:started');
  }

  /**
   * Stop cleanup monitoring
   */
  public stopMonitoring(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    logger.info(LogCategory.SYSTEM, 'Session cleanup monitoring stopped');
    this.emit('monitoring:stopped');
  }

  /**
   * Perform comprehensive cleanup
   */
  public async performCleanup(options: CleanupOptions = {}): Promise<CleanupStats> {
    if (this.isCleaningUp && !options.forceCleanup) {
      logger.warn(LogCategory.SYSTEM, 'Cleanup already in progress');
      return {
        sessionsChecked: 0,
        sessionsCleanedUp: 0,
        filesDeleted: 0,
        spaceReclaimed: 0,
        errors: ['Cleanup already in progress']
      };
    }

    this.isCleaningUp = true;
    const stats: CleanupStats = {
      sessionsChecked: 0,
      sessionsCleanedUp: 0,
      filesDeleted: 0,
      spaceReclaimed: 0,
      errors: []
    };

    try {
      logger.info(LogCategory.SYSTEM, 'Starting session cleanup', options);

      // 1. Scan for tmux sessions
      const sessions = await this.scanTmuxSessions();
      stats.sessionsChecked = sessions.length;

      // 2. Identify orphaned sessions
      const orphanedSessions = await this.identifyOrphanedSessions(sessions, options);

      // 3. Clean up orphaned sessions
      for (const session of orphanedSessions) {
        if (!options.dryRun) {
          const cleaned = await this.cleanupSession(session);
          if (cleaned) {
            stats.sessionsCleanedUp++;
          }
        } else {
          logger.info(LogCategory.SYSTEM, `[DRY RUN] Would clean up session: ${session.sessionName}`);
          stats.sessionsCleanedUp++;
        }
      }

      // 4. Clean up old terminal outputs
      const terminalStats = await this.cleanupTerminalOutputs(options);
      stats.filesDeleted += terminalStats.filesDeleted;
      stats.spaceReclaimed += terminalStats.spaceReclaimed;

      // 5. Clean up orphaned workspaces
      const workspaceStats = await this.cleanupOrphanedWorkspaces(options);
      stats.filesDeleted += workspaceStats.filesDeleted;
      stats.spaceReclaimed += workspaceStats.spaceReclaimed;

      // 6. Clean up coordination files
      const coordStats = await this.cleanupCoordinationFiles(options);
      stats.filesDeleted += coordStats.filesDeleted;
      stats.spaceReclaimed += coordStats.spaceReclaimed;

      // Report stats
      this.reportCleanupStats(stats);

    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Session cleanup error:', error);
      stats.errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      this.isCleaningUp = false;
    }

    this.emit('cleanup:completed', stats);
    return stats;
  }

  /**
   * Scan for existing tmux sessions
   */
  private async scanTmuxSessions(): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];

    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux list-sessions -F '#{session_name}:#{session_created}:#{session_activity}' 2>/dev/null || true`
      );

      if (!stdout.trim()) {
        return sessions;
      }

      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        const [sessionName, created, activity] = line.split(':');
        
        // Extract farm ID from session name (format: farm-<id> or xenosync-<id>)
        const farmIdMatch = sessionName.match(/(?:farm|xenosync)-(\w+)/);
        if (!farmIdMatch) continue;

        const sessionInfo: SessionInfo = {
          sessionName,
          farmId: farmIdMatch[1],
          created: new Date(parseInt(created) * 1000),
          lastActivity: new Date(parseInt(activity) * 1000),
          pids: await this.getSessionPids(sessionName),
          orphaned: false
        };

        sessions.push(sessionInfo);
        this.sessionRegistry.set(sessionName, sessionInfo);
      }
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Failed to scan tmux sessions:', error);
    }

    return sessions;
  }

  /**
   * Get PIDs associated with a tmux session
   */
  private async getSessionPids(sessionName: string): Promise<number[]> {
    const pids: number[] = [];

    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux list-panes -t ${sessionName} -F '#{pane_pid}' 2>/dev/null || true`
      );

      if (stdout.trim()) {
        const pidList = stdout.trim().split('\n').map(pid => parseInt(pid)).filter(pid => !isNaN(pid));
        pids.push(...pidList);
      }
    } catch (error) {
      // Session might not exist anymore
    }

    return pids;
  }

  /**
   * Check if farm is protected by ShutdownCoordinator
   * CRITICAL: Prevents cleanup of farms that are actively running and scheduled for graceful shutdown
   */
  private async checkFarmProtected(farmId: string, sessionName: string): Promise<boolean> {
    try {
      // Check if shutdown is scheduled for this farm
      const { shutdownCoordinator } = await import('./shutdownCoordinator');

      // Try to match with both short and full farm IDs
      // Session names are "farm-{short-id}" so we need to check both formats
      const sessionShortId = sessionName.replace(/^farm-/, '');

      // Check if shutdown is scheduled (which means farm is protected until timeout)
      if (shutdownCoordinator.isShutdownScheduled(farmId)) {
        logger.debug(LogCategory.SYSTEM, `Farm ${farmId} is protected by scheduled shutdown`);
        return true;
      }

      // Also check with short ID in case of mismatch
      if (sessionShortId !== farmId && shutdownCoordinator.isShutdownScheduled(sessionShortId)) {
        logger.debug(LogCategory.SYSTEM, `Farm ${sessionShortId} is protected by scheduled shutdown`);
        return true;
      }

      return false;
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, `Failed to check farm protection for ${farmId}:`, error);
      return true; // Assume protected on error to avoid accidental cleanup
    }
  }

  /**
   * Identify orphaned sessions
   * CRITICAL: Enhanced to respect farm protection and proper UUID matching
   */
  private async identifyOrphanedSessions(
    sessions: SessionInfo[],
    options: CleanupOptions
  ): Promise<SessionInfo[]> {
    const orphaned: SessionInfo[] = [];
    const maxAge = options.maxAge || this.MAX_SESSION_AGE;
    const now = Date.now();

    for (const session of sessions) {
      // CRITICAL: Check if farm is protected by ShutdownCoordinator FIRST
      const isProtected = await this.checkFarmProtected(session.farmId, session.sessionName);
      if (isProtected) {
        logger.debug(LogCategory.SYSTEM,
          `Session ${session.sessionName} is protected, skipping cleanup`
        );
        continue;
      }

      // Check if session is too old
      const age = now - session.lastActivity.getTime();
      if (age > maxAge) {
        session.orphaned = true;
        orphaned.push(session);
        logger.info(LogCategory.SYSTEM,
          `Session ${session.sessionName} orphaned: age ${Math.round(age / 1000 / 60)} minutes`
        );
        continue;
      }

      // Check if farm exists in database (now handles short IDs properly)
      const farmExists = await this.checkFarmExists(session.farmId);
      if (!farmExists) {
        session.orphaned = true;
        orphaned.push(session);
        logger.info(LogCategory.SYSTEM,
          `Session ${session.sessionName} orphaned: farm ${session.farmId} not found`
        );
        continue;
      }

      // Check if any processes are still running
      if (session.pids.length === 0) {
        session.orphaned = true;
        orphaned.push(session);
        logger.info(LogCategory.SYSTEM,
          `Session ${session.sessionName} orphaned: no running processes`
        );
      }
    }

    return orphaned;
  }

  /**
   * Check if farm exists in database
   * CRITICAL: Handles both short IDs (from session names) and full UUIDs
   */
  private async checkFarmExists(farmId: string): Promise<boolean> {
    try {
      // Accept both UUIDs and legacy string IDs (prefixed with "test-" etc.)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isFullUUID = uuidRegex.test(farmId);

      let query: string;
      let params: string[];

      if (isFullUUID) {
        // Full UUID - query directly
        query = 'SELECT 1 FROM farms WHERE id = $1';
        params = [farmId];
      } else {
        // Short ID from session name (first 8 chars) - use LIKE pattern
        // Session names are "farm-{first-8-chars}" so farmId is already the short version
        query = 'SELECT 1 FROM farms WHERE id::text LIKE $1';
        params = [`${farmId}%`]; // Match any farm ID starting with this short ID
      }

      const { db } = await import('../database/connection');
      const result = await db.query(query, params);

      if (result.rows.length > 0) {
        logger.debug(LogCategory.SYSTEM, `Farm ${farmId} exists in database`);
        return true;
      }

      logger.debug(LogCategory.SYSTEM, `Farm ${farmId} not found in database`);
      return false;
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to check farm existence: ${farmId}`, error);
      return true; // Assume exists on error to avoid accidental cleanup
    }
  }

  /**
   * Clean up a single session
   */
  private async cleanupSession(session: SessionInfo): Promise<boolean> {
    try {
      logger.info(LogCategory.SYSTEM, `Cleaning up orphaned session: ${session.sessionName}`);

      // Kill tmux session
      await execAsync(
        `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux kill-session -t ${session.sessionName} 2>/dev/null || true`
      );

      // Kill any remaining processes
      for (const pid of session.pids) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch (error) {
          // Process might already be dead
        }
      }

      // Remove from registry
      this.sessionRegistry.delete(session.sessionName);

      // Emit event
      this.emit('session:cleaned', session);

      return true;
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to cleanup session ${session.sessionName}:`, error);
      return false;
    }
  }

  /**
   * Clean up old terminal outputs
   *
   * CRITICAL FIX: Coordinates with terminal streaming services to stop
   * watchers BEFORE deleting files. This prevents the race condition where
   * file watchers try to read from deleted files.
   */
  private async cleanupTerminalOutputs(options: CleanupOptions): Promise<{
    filesDeleted: number;
    spaceReclaimed: number;
  }> {
    const stats = { filesDeleted: 0, spaceReclaimed: 0 };
    const paths = pathConfig.getPaths();
    const terminalDir = paths.TERMINAL_DIR;
    const maxAge = this.TERMINAL_OUTPUT_MAX_AGE;
    const now = Date.now();

    // Get terminal services for coordination
    const { unifiedTerminalStreamService: uts, terminalFileWatcherService: tfw } =
      await getTerminalServices();

    try {
      const files = await fs.readdir(terminalDir);

      for (const file of files) {
        const filePath = path.join(terminalDir, file);
        let fileStat;

        try {
          fileStat = await fs.stat(filePath);
        } catch (err) {
          // File may have been deleted by another process
          logger.debug(LogCategory.SYSTEM, `File already gone during cleanup: ${file}`);
          continue;
        }

        const age = now - fileStat.mtimeMs;

        if (age > maxAge) {
          // Extract farmId from file/directory name (format: {farmId} or {farmId}/agent-*.log)
          const farmId = file.includes('-') ? file : file.replace('.log', '').replace('agent-', '');

          if (!options.dryRun) {
            // CRITICAL: Stop any active watchers BEFORE deleting the file
            // This prevents ENOENT errors in the watcher callbacks
            try {
              if (uts && typeof uts.stopAllStreamsByFarmId === 'function') {
                await uts.stopAllStreamsByFarmId(farmId);
                logger.debug(LogCategory.SYSTEM, `Stopped terminal streams for farm ${farmId} before cleanup`);
              }
              if (tfw && typeof tfw.stopWatching === 'function') {
                await tfw.stopWatching(farmId);
                logger.debug(LogCategory.SYSTEM, `Stopped file watchers for farm ${farmId} before cleanup`);
              }
            } catch (watcherError) {
              // Log but don't fail cleanup if watcher stop fails
              logger.warn(LogCategory.SYSTEM, `Failed to stop watchers before cleanup: ${watcherError}`);
            }

            // Small delay to let watchers fully close
            await new Promise(resolve => setTimeout(resolve, 100));

            stats.spaceReclaimed += fileStat.size;

            try {
              if (fileStat.isDirectory()) {
                await fs.rm(filePath, { recursive: true, force: true });
              } else {
                await fs.unlink(filePath);
              }
              stats.filesDeleted++;
              logger.debug(LogCategory.SYSTEM, `Deleted old terminal output: ${file}`);
            } catch (deleteError) {
              // Handle race condition where file was deleted by another process
              const errCode = (deleteError as any)?.code;
              if (errCode === 'ENOENT') {
                logger.debug(LogCategory.SYSTEM, `File already deleted: ${file}`);
              } else {
                logger.warn(LogCategory.SYSTEM, `Failed to delete ${file}: ${deleteError}`);
              }
            }
          } else {
            logger.info(LogCategory.SYSTEM, `[DRY RUN] Would delete terminal output: ${file}`);
            stats.filesDeleted++;
            stats.spaceReclaimed += fileStat.size;
          }
        }
      }
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Failed to cleanup terminal outputs:', error);
    }

    return stats;
  }

  /**
   * Clean up orphaned workspaces
   */
  private async cleanupOrphanedWorkspaces(options: CleanupOptions): Promise<{
    filesDeleted: number;
    spaceReclaimed: number;
  }> {
    const stats = { filesDeleted: 0, spaceReclaimed: 0 };
    const paths = pathConfig.getPaths();
    const workspacesDir = paths.WORKSPACES_DIR;

    try {
      const workspaces = await fs.readdir(workspacesDir);

      for (const workspace of workspaces) {
        const farmId = workspace; // Workspace name is farm ID
        const farmExists = await this.checkFarmExists(farmId);

        if (!farmExists) {
          const workspacePath = path.join(workspacesDir, workspace);

          if (!options.dryRun) {
            const size = await this.getDirectorySize(workspacePath);
            stats.spaceReclaimed += size;
            await this.removeDirectory(workspacePath);
            stats.filesDeleted++;
            logger.info(LogCategory.SYSTEM, `Deleted orphaned workspace: ${workspace}`);
          } else {
            logger.info(LogCategory.SYSTEM, `[DRY RUN] Would delete workspace: ${workspace}`);
            stats.filesDeleted++;
          }
        }
      }
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Failed to cleanup workspaces:', error);
    }

    return stats;
  }

  /**
   * Clean up old coordination files
   */
  private async cleanupCoordinationFiles(options: CleanupOptions): Promise<{
    filesDeleted: number;
    spaceReclaimed: number;
  }> {
    const stats = { filesDeleted: 0, spaceReclaimed: 0 };
    const paths = pathConfig.getPaths();
    const coordDir = paths.COORDINATION_DIR;
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();

    try {
      const files = await fs.readdir(coordDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(coordDir, file);
        const fileStat = await fs.stat(filePath);
        const age = now - fileStat.mtimeMs;

        if (age > maxAge) {
          if (!options.dryRun) {
            stats.spaceReclaimed += fileStat.size;
            await fs.unlink(filePath);
            stats.filesDeleted++;
            logger.debug(LogCategory.SYSTEM, `Deleted old coordination file: ${file}`);
          } else {
            logger.info(LogCategory.SYSTEM, `[DRY RUN] Would delete coordination file: ${file}`);
            stats.filesDeleted++;
            stats.spaceReclaimed += fileStat.size;
          }
        }
      }
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, 'Failed to cleanup coordination files:', error);
    }

    return stats;
  }

  /**
   * Get directory size recursively
   */
  private async getDirectorySize(dir: string): Promise<number> {
    let size = 0;

    try {
      const files = await fs.readdir(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
          size += await this.getDirectorySize(filePath);
        } else {
          size += stat.size;
        }
      }
    } catch (error) {
      // Directory might not exist
    }

    return size;
  }

  /**
   * Remove directory recursively
   */
  private async removeDirectory(dir: string): Promise<void> {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to remove directory ${dir}:`, error);
    }
  }

  /**
   * Report cleanup statistics
   */
  private reportCleanupStats(stats: CleanupStats): void {
    const message = `Session cleanup completed: ` +
      `${stats.sessionsCleanedUp}/${stats.sessionsChecked} sessions, ` +
      `${stats.filesDeleted} files deleted, ` +
      `${(stats.spaceReclaimed / 1024 / 1024).toFixed(2)}MB reclaimed`;

    logger.info(LogCategory.SYSTEM, message);

    // Send to websocket clients
    websocketManager.broadcast('system:cleanup', {
      type: 'session_cleanup',
      stats,
      timestamp: new Date()
    });

    // Send alert if significant cleanup occurred
    if (stats.sessionsCleanedUp > 5 || stats.spaceReclaimed > 100 * 1024 * 1024) {
      websocketManager.broadcast('alert:info', {
        type: 'cleanup',
        message,
        stats,
        timestamp: new Date()
      });
    }
  }

  /**
   * Force cleanup specific session
   */
  public async forceCleanupSession(sessionName: string): Promise<boolean> {
    const session = this.sessionRegistry.get(sessionName);
    
    if (!session) {
      // Try to get session info directly
      const sessions = await this.scanTmuxSessions();
      const found = sessions.find(s => s.sessionName === sessionName);
      
      if (!found) {
        logger.warn(LogCategory.SYSTEM, `Session not found: ${sessionName}`);
        return false;
      }
      
      return await this.cleanupSession(found);
    }

    return await this.cleanupSession(session);
  }

  /**
   * Get cleanup status
   */
  public getStatus(): {
    isRunning: boolean;
    sessionsMonitored: number;
    lastCleanup?: Date;
  } {
    return {
      isRunning: this.cleanupInterval !== null,
      sessionsMonitored: this.sessionRegistry.size,
      lastCleanup: undefined // TODO: Track last cleanup time
    };
  }

  /**
   * Emergency cleanup - clean all sessions
   */
  public async emergencyCleanup(): Promise<CleanupStats> {
    logger.warn(LogCategory.SYSTEM, 'Starting emergency cleanup - all sessions will be terminated');
    
    return await this.performCleanup({
      maxAge: 0, // Clean all sessions regardless of age
      forceCleanup: true,
      includeActivesSessions: true
    });
  }
}

// Export singleton instance
export const sessionCleanupService = SessionCleanupService.getInstance();

// Export types
export type { SessionInfo, CleanupStats, CleanupOptions };
