import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { EventEmitter } from 'events';
import { MAIFARM_SESSION_PATTERNS } from './maibarn';

const execAsync = promisify(exec);

interface CleanupOptions {
  force?: boolean;
  keepActiveFarms?: boolean;
  dryRun?: boolean;
}

interface OrphanedSession {
  sessionName: string;
  created: Date;
  paneCount: number;
  farmId?: string;
  isOrphaned: boolean;
  reason?: string;
}

interface CleanupResult {
  sessionsKilled: string[];
  sessionsKept: string[];
  filesRemoved: string[];
  errors: string[];
  memoryFreed?: number;
}

class AgentCleanupService extends EventEmitter {
  private readonly COORDINATION_PATH = '/tmp/claude_coordination';
  private readonly TMUX_SESSION_PREFIX = MAIFARM_SESSION_PATTERNS;
  private activeFarmIds: Set<string> = new Set();
  private isCleanupInProgress = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * Initialize cleanup service and perform startup cleanup
   */
  async initialize(): Promise<void> {
    logger.info('[AgentCleanup] Initializing agent cleanup service');
    
    // Perform startup cleanup
    await this.performStartupCleanup();
    
    // Setup periodic cleanup (every 30 minutes)
    this.startPeriodicCleanup();
    
    // Setup exit handlers
    this.setupExitHandlers();
    
    logger.info('[AgentCleanup] Agent cleanup service initialized with periodic cleanup');
  }

  /**
   * Perform cleanup on server startup
   */
  private async performStartupCleanup(): Promise<void> {
    logger.info('[AgentCleanup] Performing startup cleanup');
    
    try {
      const result = await this.cleanupOrphanedSessions({
        force: false,
        keepActiveFarms: true,
        dryRun: false
      });
      
      logger.info('[AgentCleanup] Startup cleanup complete', {
        sessionsKilled: result.sessionsKilled.length,
        filesRemoved: result.filesRemoved.length
      });
      
      if (result.errors.length > 0) {
        logger.warn('[AgentCleanup] Startup cleanup had errors:', result.errors);
      }
    } catch (error) {
      logger.error('[AgentCleanup] Startup cleanup failed:', error);
    }
  }

  /**
   * Register an active farm to prevent its cleanup
   */
  registerActiveFarm(farmId: string): void {
    this.activeFarmIds.add(farmId);
    logger.debug(`[AgentCleanup] Registered active farm: ${farmId}`);
  }

  /**
   * Unregister a farm, allowing it to be cleaned up
   */
  unregisterFarm(farmId: string): void {
    this.activeFarmIds.delete(farmId);
    logger.debug(`[AgentCleanup] Unregistered farm: ${farmId}`);
  }

  /**
   * Get all tmux sessions that match our patterns
   */
  private async getTmuxSessions(): Promise<OrphanedSession[]> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}:#{session_created}:#{session_windows}" 2>/dev/null || echo ""');
      
      if (!stdout.trim()) {
        return [];
      }

      const sessions = stdout.trim().split('\n').map(line => {
        const [sessionName, created, windows] = line.split(':');
        return {
          sessionName,
          created: new Date(parseInt(created) * 1000),
          paneCount: parseInt(windows) || 0,
          isOrphaned: false
        };
      });

      // Filter to only our sessions
      return sessions.filter(session => 
        this.TMUX_SESSION_PREFIX.some(prefix => session.sessionName.startsWith(prefix))
      );
    } catch (error) {
      logger.error('[AgentCleanup] Failed to get tmux sessions:', error);
      return [];
    }
  }

  /**
   * Check if a session is orphaned
   */
  private async isSessionOrphaned(session: OrphanedSession): Promise<boolean> {
    // Extract farm ID from session name
    const farmIdMatch = session.sessionName.match(/farm[_-]([a-f0-9]{8})/);
    if (farmIdMatch) {
      session.farmId = farmIdMatch[1];
      
      // Check if farm is active
      if (this.activeFarmIds.has(session.farmId)) {
        return false;
      }
    }

    // Different age thresholds for different session types
    const ageInMinutes = (Date.now() - session.created.getTime()) / (1000 * 60);
    const ageInHours = ageInMinutes / 60;
    
    // Quick task sessions: cleanup after 10 minutes
    if (session.sessionName.includes('quick')) {
      if (ageInMinutes > 10) {
        session.reason = `Quick task session is ${ageInMinutes.toFixed(1)} minutes old`;
        return true;
      }
    }
    
    // GoWild sessions: cleanup after 30 minutes
    if (session.sessionName.includes('goWild') || session.sessionName.includes('gowild')) {
      if (ageInMinutes > 30) {
        session.reason = `GoWild session is ${ageInMinutes.toFixed(1)} minutes old`;
        return true;
      }
    }
    
    // Regular farm sessions: cleanup after 2 hours
    if (ageInHours > 2) {
      session.reason = `Session is ${ageInHours.toFixed(1)} hours old`;
      return true;
    }

    // Check if session has no active panes
    try {
      const { stdout } = await execAsync(`tmux list-panes -t ${session.sessionName} -F "#{pane_active}" 2>/dev/null || echo ""`);
      const activePanes = stdout.trim().split('\n').filter(line => line === '1');
      
      if (activePanes.length === 0) {
        session.reason = 'No active panes';
        return true;
      }
    } catch {
      session.reason = 'Failed to check panes';
      return true;
    }

    return false;
  }

  /**
   * Kill a tmux session
   */
  private async killTmuxSession(sessionName: string): Promise<boolean> {
    try {
      await execAsync(`tmux kill-session -t ${sessionName}`);
      logger.info(`[AgentCleanup] Killed tmux session: ${sessionName}`);
      return true;
    } catch (error) {
      logger.error(`[AgentCleanup] Failed to kill tmux session ${sessionName}:`, error);
      return false;
    }
  }

  /**
   * Clean up coordination files for a farm
   */
  private async cleanupCoordinationFiles(farmId: string): Promise<string[]> {
    const removedFiles: string[] = [];
    
    try {
      // Clean up various coordination files
      const patterns = [
        `active_agents_${farmId}*.json`,
        `work_claims/agent_*${farmId}*.json`,
        `harvests/*${farmId}*.json`,
        `farms/*${farmId}*.json`
      ];

      for (const pattern of patterns) {
        const fullPath = path.join(this.COORDINATION_PATH, pattern);
        
        try {
          // Use glob pattern to find files
          const { stdout } = await execAsync(`find ${this.COORDINATION_PATH} -name "${pattern}" 2>/dev/null || echo ""`);
          const files = stdout.trim().split('\n').filter(Boolean);
          
          for (const file of files) {
            try {
              await fs.unlink(file);
              removedFiles.push(file);
              logger.debug(`[AgentCleanup] Removed file: ${file}`);
            } catch (err) {
              logger.warn(`[AgentCleanup] Failed to remove file ${file}:`, err);
            }
          }
        } catch (error) {
          logger.debug(`[AgentCleanup] No files found for pattern: ${pattern}`);
        }
      }
    } catch (error) {
      logger.error('[AgentCleanup] Failed to cleanup coordination files:', error);
    }

    return removedFiles;
  }

  /**
   * Main cleanup function for orphaned sessions
   */
  async cleanupOrphanedSessions(options: CleanupOptions = {}): Promise<CleanupResult> {
    if (this.isCleanupInProgress) {
      logger.warn('[AgentCleanup] Cleanup already in progress, skipping');
      return {
        sessionsKilled: [],
        sessionsKept: [],
        filesRemoved: [],
        errors: ['Cleanup already in progress']
      };
    }

    this.isCleanupInProgress = true;
    const result: CleanupResult = {
      sessionsKilled: [],
      sessionsKept: [],
      filesRemoved: [],
      errors: []
    };

    try {
      logger.info('[AgentCleanup] Starting orphaned session cleanup', options);
      
      // Get all tmux sessions
      const sessions = await this.getTmuxSessions();
      logger.info(`[AgentCleanup] Found ${sessions.length} tmux sessions to check`);

      // Check each session
      for (const session of sessions) {
        try {
          const isOrphaned = await this.isSessionOrphaned(session);
          
          if (isOrphaned) {
            session.isOrphaned = true;
            
            if (options.dryRun) {
              logger.info(`[AgentCleanup] DRY RUN: Would kill session ${session.sessionName} (${session.reason})`);
              result.sessionsKilled.push(session.sessionName);
            } else {
              // Kill the session
              const killed = await this.killTmuxSession(session.sessionName);
              if (killed) {
                result.sessionsKilled.push(session.sessionName);
                
                // Clean up related files
                if (session.farmId) {
                  const removedFiles = await this.cleanupCoordinationFiles(session.farmId);
                  result.filesRemoved.push(...removedFiles);
                }
                
                // Emit cleanup event
                this.emit('session:cleaned', {
                  sessionName: session.sessionName,
                  farmId: session.farmId,
                  reason: session.reason
                });
              } else {
                result.errors.push(`Failed to kill session ${session.sessionName}`);
              }
            }
          } else {
            result.sessionsKept.push(session.sessionName);
            logger.debug(`[AgentCleanup] Keeping active session: ${session.sessionName}`);
          }
        } catch (error) {
          logger.error(`[AgentCleanup] Error processing session ${session.sessionName}:`, error);
          result.errors.push(`Error processing ${session.sessionName}: ${error}`);
        }
      }

      // Clean up old coordination files without sessions
      if (!options.dryRun) {
        await this.cleanupOldCoordinationFiles();
      }

      // Estimate memory freed (rough estimate: 50MB per session)
      result.memoryFreed = result.sessionsKilled.length * 50 * 1024 * 1024;

      logger.info('[AgentCleanup] Cleanup complete', {
        killed: result.sessionsKilled.length,
        kept: result.sessionsKept.length,
        filesRemoved: result.filesRemoved.length,
        errors: result.errors.length,
        memoryFreed: `${(result.memoryFreed || 0) / (1024 * 1024)}MB`
      });

    } catch (error) {
      logger.error('[AgentCleanup] Cleanup failed:', error);
      result.errors.push(`Cleanup failed: ${error}`);
    } finally {
      this.isCleanupInProgress = false;
    }

    return result;
  }

  /**
   * Clean up old coordination files without associated sessions
   */
  private async cleanupOldCoordinationFiles(): Promise<void> {
    try {
      const { stdout } = await execAsync(`find ${this.COORDINATION_PATH} -type f -mtime +1 -name "*.json" 2>/dev/null || echo ""`);
      const oldFiles = stdout.trim().split('\n').filter(Boolean);
      
      for (const file of oldFiles) {
        try {
          await fs.unlink(file);
          logger.debug(`[AgentCleanup] Removed old file: ${file}`);
        } catch (err) {
          logger.debug(`[AgentCleanup] Failed to remove old file ${file}:`, err);
        }
      }
    } catch (error) {
      logger.debug('[AgentCleanup] Failed to cleanup old coordination files:', error);
    }
  }

  /**
   * Clean up a specific farm (called on deletion/failure)
   */
  async cleanupFarm(farmId: string, reason: string = 'unknown'): Promise<CleanupResult> {
    logger.info(`[AgentCleanup] Cleaning up farm ${farmId}, reason: ${reason}`);
    
    const result: CleanupResult = {
      sessionsKilled: [],
      sessionsKept: [],
      filesRemoved: [],
      errors: []
    };

    try {
      // Unregister the farm
      this.unregisterFarm(farmId);

      // Find and kill related tmux sessions
      const sessions = await this.getTmuxSessions();
      const farmSessions = sessions.filter(s => {
        const match = s.sessionName.match(/farm[_-]([a-f0-9]{8})/);
        return match && match[1] === farmId.substring(0, 8);
      });

      for (const session of farmSessions) {
        const killed = await this.killTmuxSession(session.sessionName);
        if (killed) {
          result.sessionsKilled.push(session.sessionName);
        } else {
          result.errors.push(`Failed to kill session ${session.sessionName}`);
        }
      }

      // Clean up coordination files
      const removedFiles = await this.cleanupCoordinationFiles(farmId);
      result.filesRemoved.push(...removedFiles);

      // Broadcast cleanup event
      websocketManager.broadcast({
        type: 'farm:cleanup:completed',
        payload: {
          farmId,
          reason,
          sessionsKilled: result.sessionsKilled,
          filesRemoved: result.filesRemoved.length
        }
      });

      logger.info(`[AgentCleanup] Farm ${farmId} cleanup complete`, result);
    } catch (error) {
      logger.error(`[AgentCleanup] Failed to cleanup farm ${farmId}:`, error);
      result.errors.push(`Failed to cleanup farm: ${error}`);
    }

    return result;
  }

  /**
   * Start periodic cleanup task
   */
  private startPeriodicCleanup(): void {
    // Run cleanup every 30 minutes
    this.cleanupInterval = setInterval(async () => {
      logger.info('[AgentCleanup] Running periodic cleanup');
      try {
        const result = await this.cleanupOrphanedSessions({
          force: false,
          keepActiveFarms: true,
          dryRun: false
        });
        
        if (result.sessionsKilled.length > 0) {
          logger.info(`[AgentCleanup] Periodic cleanup removed ${result.sessionsKilled.length} sessions`);
        }
      } catch (error) {
        logger.error('[AgentCleanup] Periodic cleanup failed:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes
  }
  
  /**
   * Stop periodic cleanup
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  /**
   * Setup graceful shutdown handlers
   */
  private setupExitHandlers(): void {
    const cleanup = async (signal: string) => {
      logger.info(`[AgentCleanup] Received ${signal}, performing cleanup...`);
      
      // Stop periodic cleanup
      this.stopPeriodicCleanup();
      
      try {
        // Perform quick cleanup of all active farms
        const result = await this.cleanupOrphanedSessions({
          force: true,
          keepActiveFarms: false,
          dryRun: false
        });
        
        logger.info('[AgentCleanup] Shutdown cleanup complete', result);
      } catch (error) {
        logger.error('[AgentCleanup] Shutdown cleanup failed:', error);
      }
      
      process.exit(0);
    };

    // Handle various shutdown signals
    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGUSR2', () => cleanup('SIGUSR2')); // Nodemon restart
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('[AgentCleanup] Uncaught exception:', error);
      cleanup('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('[AgentCleanup] Unhandled rejection:', reason);
      cleanup('unhandledRejection');
    });
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    activeSessions: number;
    orphanedSessions: number;
    activeFarms: number;
    coordinationFiles: number;
    estimatedMemoryUsage: number;
  }> {
    const sessions = await this.getTmuxSessions();
    const orphaned = await Promise.all(
      sessions.map(async s => await this.isSessionOrphaned(s))
    );
    
    const { stdout } = await execAsync(`find ${this.COORDINATION_PATH} -type f -name "*.json" 2>/dev/null | wc -l || echo 0`);
    const fileCount = parseInt(stdout.trim()) || 0;

    return {
      activeSessions: sessions.length - orphaned.filter(Boolean).length,
      orphanedSessions: orphaned.filter(Boolean).length,
      activeFarms: this.activeFarmIds.size,
      coordinationFiles: fileCount,
      estimatedMemoryUsage: sessions.length * 50 * 1024 * 1024 // 50MB per session estimate
    };
  }
}

// Export singleton instance
export const agentCleanupService = new AgentCleanupService();