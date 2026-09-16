import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { logThrottling } from '../utils/logThrottling';
import { db } from '../database/connection';
import { spawn } from 'child_process';
import { fileManager } from './fileManagerService';
import { pathConfig } from '../config/paths';
import path from 'path';

const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

interface ZombieFarm {
  farmId: string;
  sessionName: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  lastHealthCheck: Date | null;
}

/**
 * Service to clean up zombie farms with dead sessions and orphaned database entries
 */
export class ZombieFarmCleanupService extends EventEmitter {
  private static instance: ZombieFarmCleanupService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes
  private readonly ZOMBIE_THRESHOLD = 1800000; // 30 minutes
  private readonly MAX_CLEANUP_PER_RUN = 5; // Limit cleanup operations per run
  private cleanupInProgress = false;

  private constructor() {
    super();
    this.startCleanupService();
  }

  static getInstance(): ZombieFarmCleanupService {
    if (!ZombieFarmCleanupService.instance) {
      ZombieFarmCleanupService.instance = new ZombieFarmCleanupService();
    }
    return ZombieFarmCleanupService.instance;
  }

  /**
   * Start the periodic cleanup service
   */
  private startCleanupService(): void {
    this.cleanupInterval = setInterval(async () => {
      if (!this.cleanupInProgress) {
        await this.performCleanup();
      }
    }, this.CLEANUP_INTERVAL);

    logThrottling.info('zombie-cleanup-start', 'Zombie farm cleanup service started');
  }

  /**
   * Perform zombie farm cleanup
   */
  private async performCleanup(): Promise<void> {
    this.cleanupInProgress = true;

    try {
      const zombieFarms = await this.identifyZombieFarms();
      
      if (zombieFarms.length === 0) {
        logThrottling.debug('no-zombies', 'No zombie farms found');
        return;
      }

      logThrottling.info('zombie-farms-found', `Found ${zombieFarms.length} zombie farms for cleanup`);

      // Limit cleanup per run to avoid overwhelming the system
      const farmsToCleanup = zombieFarms.slice(0, this.MAX_CLEANUP_PER_RUN);

      for (const farm of farmsToCleanup) {
        try {
          await this.cleanupZombieFarm(farm);
          this.emit('zombie:cleaned', { farmId: farm.farmId, sessionName: farm.sessionName });
        } catch (error) {
          logThrottling.error(`cleanup-error-${farm.farmId}`, `Failed to cleanup zombie farm ${farm.farmId}: ${error.message}`);
          this.emit('zombie:cleanup_failed', { farmId: farm.farmId, error: error.message });
        }
      }

    } catch (error) {
      logger.error('[ZombieCleanup] Error during cleanup:', error);
    } finally {
      this.cleanupInProgress = false;
    }
  }

  /**
   * Identify zombie farms with dead sessions
   */
  private async identifyZombieFarms(): Promise<ZombieFarm[]> {
    try {
      // Get farms that might be zombies
      const result = await db.query(`
        SELECT 
          id as farm_id,
          name,
          status,
          created_at,
          updated_at,
          config
        FROM farms 
        WHERE 
          status IN ('launching', 'active', 'running')
          AND updated_at < NOW() - INTERVAL '30 minutes'
          AND created_at < NOW() - INTERVAL '30 minutes'
          -- Exclude quick tasks
          AND NOT (
            CAST(id AS TEXT) LIKE 'quick_%' 
            OR CAST(id AS TEXT) LIKE 'quicktask%' 
            OR CAST(id AS TEXT) LIKE 'qt_%'
            OR LENGTH(CAST(id AS TEXT)) < 20
          )
        ORDER BY updated_at ASC
        LIMIT 20
      `);

      const potentialZombies: ZombieFarm[] = result.rows.map(row => ({
        farmId: row.farm_id,
        sessionName: `farm-${row.farm_id.substring(0, 8)}`,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        lastHealthCheck: null
      }));

      // Check which ones actually have dead sessions
      const confirmedZombies: ZombieFarm[] = [];

      for (const farm of potentialZombies) {
        const sessionExists = await this.checkTmuxSession(farm.sessionName);
        if (!sessionExists) {
          confirmedZombies.push(farm);
          logThrottling.debug(`zombie-confirmed-${farm.farmId}`, `Confirmed zombie farm with dead session: ${farm.sessionName}`);
        }
      }

      return confirmedZombies;

    } catch (error) {
      logger.error('[ZombieCleanup] Error identifying zombie farms:', error);
      return [];
    }
  }

  /**
   * Check if a tmux session exists
   */
  private async checkTmuxSession(sessionName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn('tmux', ['has-session', '-t', sessionName], {
        env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
      });
      
      let timeout: NodeJS.Timeout;
      
      checkProcess.on('exit', (code) => {
        clearTimeout(timeout);
        resolve(code === 0);
      });

      checkProcess.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      // Set timeout for session check
      timeout = setTimeout(() => {
        checkProcess.kill('SIGTERM');
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Clean up a zombie farm
   */
  private async cleanupZombieFarm(farm: ZombieFarm): Promise<void> {
    logger.info(`[ZombieCleanup] Cleaning up zombie farm ${farm.farmId} (session: ${farm.sessionName})`);

    try {
      // Step 1: Update farm status to failed in database
      await db.query(
        `UPDATE farms 
         SET status = 'failed', 
             updated_at = CURRENT_TIMESTAMP,
             error_message = 'Cleaned up zombie farm - session no longer exists'
         WHERE id = $1`,
        [farm.farmId]
      );

      // Step 2: Clean up agents associated with this farm
      await db.query(
        `UPDATE agents 
         SET status = 'failed', 
             updated_at = CURRENT_TIMESTAMP
         WHERE farm_id = $1 AND status NOT IN ('completed', 'failed')`,
        [farm.farmId]
      );

      // Step 3: Clean up workspace files if they exist
      try {
        // CRITICAL FIX: Use getFarmWorkspacePath() instead of non-existent getWorkspaceDirectory()
        const workspacePath = pathConfig.getFarmWorkspacePath(farm.farmId, false);
        const workspaceExists = await fileManager.directoryExists(workspacePath);
        
        if (workspaceExists) {
          await fileManager.removeDirectory(workspacePath);
          logThrottling.debug(`workspace-cleanup-${farm.farmId}`, `Cleaned up workspace directory`);
        }
      } catch (workspaceError) {
        logThrottling.warn(`workspace-cleanup-error-${farm.farmId}`, `Failed to cleanup workspace: ${workspaceError.message}`);
      }

      // Step 4: Clean up coordination files
      try {
        const coordinationPath = path.join(pathConfig.getCoordinationDirectory(), `${farm.sessionName}.json`);
        const coordinationExists = await fileManager.fileExists(coordinationPath);
        
        if (coordinationExists) {
          await fileManager.deleteFile(coordinationPath);
          logThrottling.debug(`coordination-cleanup-${farm.farmId}`, `Cleaned up coordination file`);
        }
      } catch (coordinationError) {
        logThrottling.warn(`coordination-cleanup-error-${farm.farmId}`, `Failed to cleanup coordination: ${coordinationError.message}`);
      }

      // Step 5: Stop any monitoring services
      try {
        const { terminalOutputWatcher } = await import('./terminalOutputWatcher');
        const { unifiedTerminalStreamService } = await import('./UnifiedTerminalStreamService');

        if (terminalOutputWatcher.isWatching(farm.sessionName)) {
          terminalOutputWatcher.stopWatching(farm.sessionName);
        }

        await unifiedTerminalStreamService.stopFarm(farm.farmId);
      } catch (monitoringError) {
        logThrottling.debug(`monitoring-cleanup-error-${farm.farmId}`, `Error stopping monitoring: ${monitoringError.message}`);
      }

      logger.info(`[ZombieCleanup] Successfully cleaned up zombie farm ${farm.farmId}`);

    } catch (error) {
      throw new Error(`Failed to cleanup zombie farm ${farm.farmId}: ${error.message}`);
    }
  }

  /**
   * Manually trigger cleanup for a specific farm
   */
  async cleanupSpecificFarm(farmId: string): Promise<boolean> {
    try {
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      const sessionExists = await this.checkTmuxSession(sessionName);
      
      if (sessionExists) {
        logThrottling.warn(`manual-cleanup-session-exists-${farmId}`, `Cannot cleanup farm ${farmId} - tmux session still exists`);
        return false;
      }

      // Get farm info
      const result = await db.query('SELECT * FROM farms WHERE id = $1', [farmId]);
      if (result.rows.length === 0) {
        logThrottling.warn(`manual-cleanup-not-found-${farmId}`, `Farm ${farmId} not found in database`);
        return false;
      }

      const farm: ZombieFarm = {
        farmId,
        sessionName,
        status: result.rows[0].status,
        created_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at,
        lastHealthCheck: null
      };

      await this.cleanupZombieFarm(farm);
      return true;

    } catch (error) {
      logger.error(`[ZombieCleanup] Error in manual cleanup for ${farmId}:`, error);
      return false;
    }
  }

  /**
   * Get statistics about zombie farms
   */
  async getZombieStats(): Promise<{
    totalZombies: number;
    zombiesByAge: Array<{ ageHours: number; count: number }>;
    recentCleanups: number;
  }> {
    try {
      // Count potential zombies
      const zombieResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '1 hour') as over_1hr,
          COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '2 hours') as over_2hr,
          COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '6 hours') as over_6hr,
          COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '12 hours') as over_12hr
        FROM farms 
        WHERE 
          status IN ('launching', 'active', 'running')
          AND updated_at < NOW() - INTERVAL '30 minutes'
          AND NOT (
            CAST(id AS TEXT) LIKE 'quick_%' 
            OR CAST(id AS TEXT) LIKE 'quicktask%' 
            OR CAST(id AS TEXT) LIKE 'qt_%'
            OR LENGTH(CAST(id AS TEXT)) < 20
          )
      `);

      // Count recent cleanups (farms marked as failed in last hour)
      const cleanupResult = await db.query(`
        SELECT COUNT(*) as recent_cleanups
        FROM farms 
        WHERE 
          status = 'failed'
          AND error_message LIKE '%zombie%'
          AND updated_at >= NOW() - INTERVAL '1 hour'
      `);

      const zombieData = zombieResult.rows[0];
      return {
        totalZombies: parseInt(zombieData.total),
        zombiesByAge: [
          { ageHours: 1, count: parseInt(zombieData.over_1hr) },
          { ageHours: 2, count: parseInt(zombieData.over_2hr) },
          { ageHours: 6, count: parseInt(zombieData.over_6hr) },
          { ageHours: 12, count: parseInt(zombieData.over_12hr) }
        ],
        recentCleanups: parseInt(cleanupResult.rows[0].recent_cleanups)
      };

    } catch (error) {
      logger.error('[ZombieCleanup] Error getting zombie stats:', error);
      return {
        totalZombies: 0,
        zombiesByAge: [],
        recentCleanups: 0
      };
    }
  }

  /**
   * Stop the cleanup service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logThrottling.info('zombie-cleanup-stop', 'Zombie farm cleanup service stopped');
  }
}

export const zombieFarmCleanupService = ZombieFarmCleanupService.getInstance();
