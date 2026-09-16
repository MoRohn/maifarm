/**
 * Farm Recovery Service
 *
 * Provides automatic recovery workflows for stuck, failed, or orphaned farms
 * Monitors farm health and takes corrective actions
 */

import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pathConfig } from '../config/paths';

const execAsync = promisify(exec);

interface FarmHealth {
  farmId: string;
  status: string;
  isStuck: boolean;
  isOrphaned: boolean;
  issues: string[];
  lastActivity?: Date;
  tmuxSessionExists: boolean;
  agentCount: number;
  runningTime: number; // in seconds
}

interface RecoveryAction {
  type: 'restart' | 'cleanup' | 'force-complete' | 'reset-agents' | 'kill-tmux';
  description: string;
  risk: 'low' | 'medium' | 'high';
}

interface RecoveryResult {
  success: boolean;
  farmId: string;
  actions: RecoveryAction[];
  message: string;
  error?: string;
}

class FarmRecoveryService {
  private static instance: FarmRecoveryService;
  private recoveryInProgress = new Set<string>();
  private healthMonitoringInterval: NodeJS.Timeout | null = null;
  private readonly STUCK_TIMEOUT = 600000; // 10 minutes with no activity
  private readonly MAX_RUNNING_TIME = 86400000; // 24 hours max

  private constructor() {
    // Start background health monitoring
    this.startHealthMonitoring();
  }

  static getInstance(): FarmRecoveryService {
    if (!FarmRecoveryService.instance) {
      FarmRecoveryService.instance = new FarmRecoveryService();
    }
    return FarmRecoveryService.instance;
  }

  /**
   * Start background health monitoring
   */
  private startHealthMonitoring(): void {
    // Check for stuck farms every 2 minutes
    this.healthMonitoringInterval = setInterval(async () => {
      try {
        await this.checkAndRecoverStuckFarms();
      } catch (error) {
        logger.error(LogCategory.FARM, 'Error in health monitoring:', error);
      }
    }, 120000); // 2 minutes

    logger.info(LogCategory.FARM, 'Farm recovery service health monitoring started');
  }

  /**
   * Stop health monitoring and clean up resources
   */
  destroy(): void {
    if (this.healthMonitoringInterval) {
      clearInterval(this.healthMonitoringInterval);
      this.healthMonitoringInterval = null;
    }
    this.recoveryInProgress.clear();
    logger.info(LogCategory.FARM, 'Farm recovery service stopped');
  }

  /**
   * Check for and recover stuck farms automatically
   */
  private async checkAndRecoverStuckFarms(): Promise<void> {
    try {
      const result = await db.query(
        `SELECT id, name, status, created_at, updated_at
         FROM farms
         WHERE status IN ('launching', 'running', 'active')
         AND updated_at < NOW() - INTERVAL '10 minutes'`
      );

      for (const farm of result.rows) {
        if (this.recoveryInProgress.has(farm.id)) {
          continue; // Already recovering
        }

        const health = await this.checkFarmHealth(farm.id);

        if (health.isStuck || health.isOrphaned) {
          logger.warn(LogCategory.FARM,
            `Detected stuck/orphaned farm ${farm.id} (${farm.name}), initiating recovery`);

          // Attempt automatic recovery
          await this.recoverFarm(farm.id, { automatic: true });
        }
      }
    } catch (error) {
      logger.error(LogCategory.FARM, 'Error checking for stuck farms:', error);
    }
  }

  /**
   * Check farm health status
   */
  async checkFarmHealth(farmId: string): Promise<FarmHealth> {
    try {
      // Get farm data
      const farmResult = await db.query(
        'SELECT id, name, status, created_at, updated_at FROM farms WHERE id = $1',
        [farmId]
      );

      if (farmResult.rows.length === 0) {
        throw new Error(`Farm ${farmId} not found`);
      }

      const farm = farmResult.rows[0];
      const now = Date.now();
      const createdAt = new Date(farm.created_at).getTime();
      const updatedAt = new Date(farm.updated_at).getTime();
      const runningTime = (now - createdAt) / 1000; // seconds
      const timeSinceActivity = now - updatedAt;

      const issues: string[] = [];

      // Check if stuck (no activity for STUCK_TIMEOUT)
      const isStuck = timeSinceActivity > this.STUCK_TIMEOUT;
      if (isStuck) {
        issues.push(`No activity for ${Math.round(timeSinceActivity / 60000)} minutes`);
      }

      // Check if running too long
      if (runningTime > this.MAX_RUNNING_TIME / 1000) {
        issues.push(`Running for ${Math.round(runningTime / 3600)} hours (max 24h)`);
      }

      // Check tmux session - use same format as UnifiedFarmLaunchOrchestrator
      // Session name format: farm-${farmId.substring(0, 8)} (first 8 chars of UUID)
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      const tmuxSessionExists = await this.checkTmuxSession(sessionName);

      if (!tmuxSessionExists && farm.status !== 'completed') {
        issues.push('Tmux session missing');
      }

      // Check agents
      const agentsResult = await db.query(
        'SELECT COUNT(*) as count FROM agents WHERE farm_id = $1',
        [farmId]
      );
      const agentCount = parseInt(agentsResult.rows[0].count);

      const isOrphaned = !tmuxSessionExists && farm.status === 'running';

      return {
        farmId,
        status: farm.status,
        isStuck,
        isOrphaned,
        issues,
        lastActivity: new Date(farm.updated_at),
        tmuxSessionExists,
        agentCount,
        runningTime
      };
    } catch (error) {
      logger.error(LogCategory.FARM, `Error checking health for farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Check if tmux session exists
   */
  private async checkTmuxSession(sessionName: string): Promise<boolean> {
    try {
      const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=${tmuxTmpDir} tmux list-sessions -F "#{session_name}"`,
        { timeout: 5000 }
      );

      return stdout.split('\n').some(name => name.trim() === sessionName);
    } catch (error) {
      // Session doesn't exist or tmux error
      return false;
    }
  }

  /**
   * Recover a stuck or failed farm
   */
  async recoverFarm(
    farmId: string,
    options: { automatic?: boolean; force?: boolean } = {}
  ): Promise<RecoveryResult> {
    // Prevent concurrent recovery attempts
    if (this.recoveryInProgress.has(farmId)) {
      return {
        success: false,
        farmId,
        actions: [],
        message: 'Recovery already in progress',
        error: 'RECOVERY_IN_PROGRESS'
      };
    }

    this.recoveryInProgress.add(farmId);
    const actions: RecoveryAction[] = [];

    try {
      logger.info(LogCategory.FARM, `Starting recovery for farm ${farmId}`, options);

      // Broadcast recovery started
      websocketManager.broadcastToFarm(farmId, 'farm:recovery-started', {
        farmId,
        automatic: options.automatic || false,
        timestamp: new Date().toISOString()
      });

      // Check health
      const health = await this.checkFarmHealth(farmId);

      // Determine recovery strategy
      if (health.isOrphaned) {
        // No tmux session - clean up database
        actions.push({
          type: 'cleanup',
          description: 'Clean up orphaned farm database records',
          risk: 'low'
        });

        await this.cleanupOrphanedFarm(farmId);
      } else if (health.isStuck) {
        // Farm is stuck - try to restart
        if (health.tmuxSessionExists) {
          actions.push({
            type: 'kill-tmux',
            description: 'Kill stuck tmux session',
            risk: 'medium'
          });

          await this.killTmuxSession(farmId);
        }

        actions.push({
          type: 'force-complete',
          description: 'Force farm completion and collect harvest',
          risk: 'medium'
        });

        await this.forceCompleteFarm(farmId);
      } else if (health.runningTime > this.MAX_RUNNING_TIME / 1000) {
        // Running too long - force complete
        actions.push({
          type: 'force-complete',
          description: 'Force complete due to max runtime exceeded',
          risk: 'low'
        });

        await this.forceCompleteFarm(farmId);
      }

      // Update farm status
      await db.query(
        'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['completed', farmId]
      );

      const message = `Recovery completed: ${actions.map(a => a.description).join(', ')}`;
      logger.info(LogCategory.FARM, `Farm ${farmId} recovery successful: ${message}`);

      // Broadcast recovery completed
      websocketManager.broadcastToFarm(farmId, 'farm:recovery-completed', {
        farmId,
        actions,
        message,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        farmId,
        actions,
        message
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(LogCategory.FARM, `Farm ${farmId} recovery failed:`, error);

      // FIXED: Update farm status to 'failed' when recovery fails
      // Don't leave farm in 'completed' state if recovery actually failed
      try {
        await db.query(
          'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['failed', farmId]
        );
      } catch (dbError) {
        logger.error(LogCategory.FARM, `Failed to update farm status after recovery failure:`, dbError);
      }

      // Broadcast recovery failed
      websocketManager.broadcastToFarm(farmId, 'farm:recovery-failed', {
        farmId,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        farmId,
        actions,
        message: 'Recovery failed',
        error: errorMessage
      };
    } finally {
      this.recoveryInProgress.delete(farmId);
    }
  }

  /**
   * Clean up orphaned farm
   */
  private async cleanupOrphanedFarm(farmId: string): Promise<void> {
    logger.info(LogCategory.FARM, `Cleaning up orphaned farm ${farmId}`);

    // Update agents status
    await db.query(
      'UPDATE agents SET status = $1 WHERE farm_id = $2',
      ['failed', farmId]
    );

    // Mark farm as failed
    await db.query(
      'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['failed', farmId]
    );
  }

  /**
   * Kill tmux session for farm
   */
  private async killTmuxSession(farmId: string): Promise<void> {
    // Use same format as UnifiedFarmLaunchOrchestrator: farm-${farmId.substring(0, 8)}
    const sessionName = `farm-${farmId.substring(0, 8)}`;
    logger.info(LogCategory.FARM, `Killing tmux session ${sessionName}`);

    try {
      const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');
      await execAsync(
        `TMUX_TMPDIR=${tmuxTmpDir} tmux kill-session -t ${sessionName}`,
        { timeout: 5000 }
      );
      logger.info(LogCategory.FARM, `Tmux session ${sessionName} killed successfully`);
    } catch (error) {
      // Session might not exist
      logger.warn(LogCategory.FARM, `Could not kill tmux session ${sessionName}:`, error);
    }
  }

  /**
   * Force complete a farm
   */
  private async forceCompleteFarm(farmId: string): Promise<void> {
    logger.info(LogCategory.FARM, `Force completing farm ${farmId}`);

    // Kill tmux session first
    await this.killTmuxSession(farmId);

    // Update agents
    await db.query(
      'UPDATE agents SET status = $1 WHERE farm_id = $2 AND status = $3',
      ['completed', farmId, 'running']
    );

    // Try to collect harvest (best effort) via ShutdownCoordinator
    // This ensures harvest collection goes through the proper coordinator with locking
    // IMPORTANT: Direct harvestService.collectHarvest() calls are prohibited per CLAUDE.md
    try {
      const { shutdownCoordinator } = await import('./shutdownCoordinator');
      const { harvestService } = await import('./harvestService');
      const harvests = await harvestService.getHarvestsByFarmId(farmId);

      for (const harvest of harvests) {
        if (harvest.status === 'collecting') {
          // Use shutdownCoordinator's forceCollectHarvest to ensure proper coordination
          // This method handles locking, yield generation, and barn storage
          const result = await shutdownCoordinator.forceCollectHarvest(farmId, harvest.id);
          if (!result.success) {
            logger.warn(LogCategory.FARM, `Harvest collection returned error for ${harvest.id}:`, result.error);
          }
        }
      }
    } catch (error) {
      logger.warn(LogCategory.FARM, `Could not collect harvest for farm ${farmId}:`, error);
    }

    // Update farm status
    await db.query(
      'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['completed', farmId]
    );
  }

  /**
   * Get recovery suggestions for a farm
   */
  async getRecoverySuggestions(farmId: string): Promise<RecoveryAction[]> {
    const health = await this.checkFarmHealth(farmId);
    const suggestions: RecoveryAction[] = [];

    if (health.isOrphaned) {
      suggestions.push({
        type: 'cleanup',
        description: 'Clean up orphaned farm (no active processes)',
        risk: 'low'
      });
    }

    if (health.isStuck) {
      suggestions.push({
        type: 'restart',
        description: 'Restart stuck farm agents',
        risk: 'medium'
      });
    }

    if (health.tmuxSessionExists) {
      suggestions.push({
        type: 'kill-tmux',
        description: 'Kill tmux session and clean up',
        risk: 'medium'
      });
    }

    if (health.runningTime > this.MAX_RUNNING_TIME / 1000) {
      suggestions.push({
        type: 'force-complete',
        description: 'Force farm completion (max runtime exceeded)',
        risk: 'low'
      });
    }

    return suggestions;
  }
}

export const farmRecoveryService = FarmRecoveryService.getInstance();
export { FarmRecoveryService, FarmHealth, RecoveryAction, RecoveryResult };
