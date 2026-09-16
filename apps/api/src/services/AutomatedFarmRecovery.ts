/**
 * Automated Farm Recovery System
 *
 * Monitors farms in real-time and automatically recovers from common failure scenarios:
 * - Stuck in launching (>15 minutes)
 * - Stuck in running (>timeout period)
 * - Orphaned (no tmux session)
 * - Failed harvest collection
 *
 * Integrates with FarmLifecycleStateMachine for safe state transitions.
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { farmLifecycleStateMachine } from './FarmLifecycleStateMachine';
import { FarmStatus } from '../types/farm';
import { harvestService } from './harvestService';
import { websocketManager } from '../websocket/websocketManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import { shutdownCoordinator } from './shutdownCoordinator';

const execAsync = promisify(exec);

export interface RecoveryAction {
  type: 'restart' | 'force-complete' | 'force-fail' | 'cleanup' | 'harvest-recovery';
  farmId: string;
  reason: string;
  timestamp: Date;
  success: boolean;
  details?: string;
}

export interface RecoveryStats {
  totalAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  byAction: Record<string, number>;
  lastRecovery?: Date;
}

class AutomatedFarmRecovery extends EventEmitter {
  private static instance: AutomatedFarmRecovery;
  private recoveryHistory: RecoveryAction[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;

  // Configurable thresholds (minutes)
  private readonly STUCK_LAUNCHING_THRESHOLD = 15;
  private readonly ORPHANED_CHECK_INTERVAL = 5; // minutes
  private readonly RECOVERY_INTERVAL = 120000; // 2 minutes

  private constructor() {
    super();
  }

  static getInstance(): AutomatedFarmRecovery {
    if (!AutomatedFarmRecovery.instance) {
      AutomatedFarmRecovery.instance = new AutomatedFarmRecovery();
    }
    return AutomatedFarmRecovery.instance;
  }

  /**
   * Start automated monitoring and recovery
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      logger.warn(LogCategory.FARM, 'Automated farm recovery already monitoring');
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      await this.runRecoveryCheck();
    }, this.RECOVERY_INTERVAL);

    // Run initial check immediately
    this.runRecoveryCheck();

    logger.info(LogCategory.FARM, `Automated farm recovery started (checking every ${this.RECOVERY_INTERVAL / 1000}s)`);
  }

  /**
   * Stop automated monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    logger.info(LogCategory.FARM, 'Automated farm recovery stopped');
  }

  /**
   * Run recovery check for all active farms
   */
  private async runRecoveryCheck(): Promise<void> {
    try {
      // Get all farms in non-terminal states
      const result = await db.query(`
        SELECT
          id,
          name,
          status,
          created_at,
          updated_at,
          timeout_seconds,
          EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as age_minutes,
          EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as idle_minutes
        FROM farms
        WHERE status IN ('launching', 'active', 'running', 'harvesting')
        ORDER BY created_at ASC
      `);

      logger.debug(LogCategory.FARM, `Recovery check: found ${result.rows.length} active farms`);

      for (const farm of result.rows) {
        await this.checkAndRecoverFarm(farm);
      }
    } catch (error) {
      logger.error(LogCategory.FARM, 'Error during recovery check:', error);
    }
  }

  /**
   * Check individual farm and attempt recovery if needed
   */
  private async checkAndRecoverFarm(farm: any): Promise<void> {
    const farmId = farm.id;
    const status = farm.status;
    const ageMinutes = parseFloat(farm.age_minutes);
    const idleMinutes = parseFloat(farm.idle_minutes);

    // Check 1: Stuck in launching
    if (status === 'launching' && ageMinutes > this.STUCK_LAUNCHING_THRESHOLD) {
      await this.recoverStuckLaunching(farmId, farm.name, ageMinutes);
      return;
    }

    // Check 2: Exceeded timeout
    if (status === 'running' && farm.timeout_seconds) {
      const timeoutMinutes = farm.timeout_seconds / 60;
      if (ageMinutes > timeoutMinutes) {
        await this.recoverTimedOutFarm(farmId, farm.name, ageMinutes, timeoutMinutes);
        return;
      }
    }

    // Check 3: Orphaned (no tmux session)
    if (['launching', 'active', 'running'].includes(status)) {
      const isOrphaned = await this.checkIfOrphaned(farmId);
      if (isOrphaned) {
        await this.recoverOrphanedFarm(farmId, farm.name);
        return;
      }
    }

    // Check 4: Stuck in harvesting
    if (status === 'harvesting' && idleMinutes > 10) {
      await this.recoverStuckHarvesting(farmId, farm.name, idleMinutes);
      return;
    }
  }

  /**
   * Recover farm stuck in launching state
   */
  private async recoverStuckLaunching(farmId: string, farmName: string, ageMinutes: number): Promise<void> {
    logger.warn(LogCategory.FARM,
      `Farm ${farmId} (${farmName}) stuck in LAUNCHING for ${ageMinutes.toFixed(1)} minutes - attempting recovery`
    );

    try {
      // Check if tmux session exists
      // Session name format: farm-${farmId.substring(0, 8)} (first 8 chars of UUID)
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      const hasSession = await this.checkTmuxSession(sessionName);

      if (!hasSession) {
        // No session - mark as failed
        await this.transitionToFailed(farmId, 'Launch failed - no tmux session created');

        this.recordRecovery({
          type: 'force-fail',
          farmId,
          reason: `Stuck in launching for ${ageMinutes.toFixed(1)}min, no tmux session`,
          timestamp: new Date(),
          success: true
        });
      } else {
        // Session exists - might still be initializing
        // Give it more time or check orchestrator status
        logger.info(LogCategory.FARM, `Farm ${farmId} has tmux session, monitoring...`);
      }
    } catch (error) {
      logger.error(LogCategory.FARM, `Error recovering stuck launching farm ${farmId}:`, error);
      this.recordRecovery({
        type: 'force-fail',
        farmId,
        reason: `Recovery error: ${error}`,
        timestamp: new Date(),
        success: false
      });
    }
  }

  /**
   * Recover farm that exceeded timeout
   */
  private async recoverTimedOutFarm(
    farmId: string,
    farmName: string,
    ageMinutes: number,
    timeoutMinutes: number
  ): Promise<void> {
    logger.warn(LogCategory.FARM,
      `Farm ${farmId} (${farmName}) exceeded timeout: ${ageMinutes.toFixed(1)}min > ${timeoutMinutes}min - forcing completion`
    );

    try {
      // Transition to harvesting state
      const transitioned = await farmLifecycleStateMachine.transition({
        farmId,
        currentState: farmLifecycleStateMachine.getCurrentState(farmId) || FarmStatus.RUNNING,
        targetState: FarmStatus.HARVESTING,
        reason: 'timeout_recovery',
        triggeredBy: 'automated_recovery',
        metadata: {
          ageMinutes,
          timeoutMinutes,
          autoRecovery: true
        }
      });

      if (transitioned) {
        const harvestId = await this.getActiveHarvestId(farmId);
        await this.ensureHarvestCollection(farmId, harvestId, {
          reason: 'timeout_recovery',
          metadata: {
            ageMinutes,
            timeoutMinutes,
            autoRecovery: true
          },
          currentState: FarmStatus.HARVESTING
        });

        this.recordRecovery({
          type: 'force-complete',
          farmId,
          reason: `Timeout recovery: ${ageMinutes.toFixed(1)}min > ${timeoutMinutes}min`,
          timestamp: new Date(),
          success: true
        });

        // Broadcast recovery event
        websocketManager.broadcast('farm:auto-recovered', {
          farmId,
          reason: 'timeout',
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error(LogCategory.FARM, `Error recovering timed out farm ${farmId}:`, error);
      this.recordRecovery({
        type: 'force-complete',
        farmId,
        reason: `Recovery error: ${error}`,
        timestamp: new Date(),
        success: false
      });
    }
  }

  /**
   * Recover orphaned farm (no tmux session)
   */
  private async recoverOrphanedFarm(farmId: string, farmName: string): Promise<void> {
    logger.warn(LogCategory.FARM, `Farm ${farmId} (${farmName}) is orphaned - no tmux session found`);

    try {
      // Transition to failed state
      await this.transitionToFailed(farmId, 'Orphaned - tmux session lost');

      this.recordRecovery({
        type: 'cleanup',
        farmId,
        reason: 'Orphaned farm - no tmux session',
        timestamp: new Date(),
        success: true
      });

      // Broadcast orphaned event
      websocketManager.broadcast('farm:orphaned', {
        farmId,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error(LogCategory.FARM, `Error recovering orphaned farm ${farmId}:`, error);
      this.recordRecovery({
        type: 'cleanup',
        farmId,
        reason: `Recovery error: ${error}`,
        timestamp: new Date(),
        success: false
      });
    }
  }

  /**
   * Recover farm stuck in harvesting
   */
  private async recoverStuckHarvesting(farmId: string, farmName: string, idleMinutes: number): Promise<void> {
    logger.warn(LogCategory.FARM,
      `Farm ${farmId} (${farmName}) stuck in HARVESTING for ${idleMinutes.toFixed(1)} minutes - forcing completion`
    );

    try {
      const harvestId = await this.getActiveHarvestId(farmId);
      await this.ensureHarvestCollection(farmId, harvestId, {
        reason: 'harvesting_recovery',
        metadata: { idleMinutes, autoRecovery: true },
        currentState: FarmStatus.HARVESTING
      });

      this.recordRecovery({
        type: 'harvest-recovery',
        farmId,
        reason: `Stuck in harvesting for ${idleMinutes.toFixed(1)}min`,
        timestamp: new Date(),
        success: true
      });
    } catch (error) {
      logger.error(LogCategory.FARM, `Error recovering stuck harvesting farm ${farmId}:`, error);
      this.recordRecovery({
        type: 'harvest-recovery',
        farmId,
        reason: `Recovery error: ${error}`,
        timestamp: new Date(),
        success: false
      });
    }
  }

  /**
   * Transition farm to failed state via state machine
   */
  private async transitionToFailed(farmId: string, reason: string): Promise<void> {
    const currentState = farmLifecycleStateMachine.getCurrentState(farmId);

    const transitioned = await farmLifecycleStateMachine.transition({
      farmId,
      currentState: currentState || FarmStatus.IDLE,
      targetState: FarmStatus.FAILED,
      reason,
      triggeredBy: 'automated_recovery',
      metadata: { autoRecovery: true }
    });

    if (transitioned) {
      // Update database
      await db.query(
        'UPDATE farms SET status = $1, updated_at = NOW(), completed_at = NOW() WHERE id = $2',
        ['failed', farmId]
      );

      websocketManager.broadcast('farm:status', {
        farmId,
        status: 'failed',
        reason
      });
    }
  }

  /**
   * Ensure harvest collection for a farm
   */
  private async ensureHarvestCollection(
    farmId: string,
    harvestId?: string,
    transitionContext?: {
      reason?: string;
      metadata?: Record<string, unknown>;
      currentState?: FarmStatus;
    }
  ): Promise<void> {
    try {
      const result = await shutdownCoordinator.executeGracefulShutdown({
        mode: 'farm',
        farmId,
        userId: 'automated_recovery',
        reason: 'completion',
        harvestId
      });

      if (!result.success) {
        const errorMessage = result.errors?.join(', ') || 'Unknown shutdown failure';
        throw new Error(`ShutdownCoordinator failed: ${errorMessage}`);
      }

      // Transition to completed
      await farmLifecycleStateMachine.transition({
        farmId,
        currentState: transitionContext?.currentState ||
          farmLifecycleStateMachine.getCurrentState(farmId) ||
          FarmStatus.HARVESTING,
        targetState: FarmStatus.COMPLETED,
        reason: transitionContext?.reason || 'auto_recovery',
        triggeredBy: 'automated_recovery',
        metadata: transitionContext?.metadata
      });

      // Update database (add completed_at timestamp for analytics consumers)
      await db.query(
        'UPDATE farms SET status = $1, updated_at = NOW(), completed_at = NOW() WHERE id = $2',
        ['completed', farmId]
      );
    } catch (error) {
      logger.error(LogCategory.FARM, `Error ensuring harvest collection for farm ${farmId}:`, error);
      throw error;
    }
  }

  private async getActiveHarvestId(farmId: string): Promise<string | undefined> {
    try {
      const harvests = await harvestService.getHarvestsByFarmId(farmId);
      const active = harvests.find(h => h.status !== 'ready' && h.status !== 'completed');
      return (active || harvests[0])?.id;
    } catch (error) {
      logger.warn(LogCategory.HARVEST, `Failed to load harvest metadata for ${farmId}, continuing without id`, error);
      return undefined;
    }
  }

  /**
   * Check if farm is orphaned (no tmux session)
   * Session name format: farm-${farmId.substring(0, 8)} (first 8 chars of UUID)
   */
  private async checkIfOrphaned(farmId: string): Promise<boolean> {
    const sessionName = `farm-${farmId.substring(0, 8)}`;
    return !(await this.checkTmuxSession(sessionName));
  }

  /**
   * Check if tmux session exists
   */
  private async checkTmuxSession(sessionName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null || true`);
      return stdout.includes(sessionName);
    } catch (error) {
      return false;
    }
  }

  /**
   * Record recovery action
   */
  private recordRecovery(action: RecoveryAction): void {
    this.recoveryHistory.push(action);

    // Keep only last 100 actions
    if (this.recoveryHistory.length > 100) {
      this.recoveryHistory = this.recoveryHistory.slice(-100);
    }

    // Emit recovery event
    this.emit('recovery:action', action);

    logger.info(LogCategory.FARM, `Recovery action recorded: ${action.type} for farm ${action.farmId}`, {
      success: action.success,
      reason: action.reason
    });
  }

  /**
   * Get recovery statistics
   */
  getStats(): RecoveryStats {
    const byAction: Record<string, number> = {};
    let successfulRecoveries = 0;
    let failedRecoveries = 0;
    let lastRecovery: Date | undefined;

    for (const action of this.recoveryHistory) {
      byAction[action.type] = (byAction[action.type] || 0) + 1;

      if (action.success) {
        successfulRecoveries++;
      } else {
        failedRecoveries++;
      }

      if (!lastRecovery || action.timestamp > lastRecovery) {
        lastRecovery = action.timestamp;
      }
    }

    return {
      totalAttempts: this.recoveryHistory.length,
      successfulRecoveries,
      failedRecoveries,
      byAction,
      lastRecovery
    };
  }

  /**
   * Get recent recovery actions
   */
  getRecentActions(limit = 20): RecoveryAction[] {
    return this.recoveryHistory.slice(-limit).reverse();
  }

  /**
   * Manual recovery trigger for specific farm
   */
  async triggerManualRecovery(farmId: string, action: 'force-complete' | 'force-fail' | 'restart'): Promise<boolean> {
    logger.info(LogCategory.FARM, `Manual recovery triggered for farm ${farmId}: ${action}`);

    try {
      const farmResult = await db.query('SELECT * FROM farms WHERE id = $1', [farmId]);

      if (farmResult.rows.length === 0) {
        throw new Error(`Farm ${farmId} not found`);
      }

      const farm = farmResult.rows[0];

      switch (action) {
        case 'force-complete':
          await this.recoverTimedOutFarm(farmId, farm.name, 0, 0);
          break;
        case 'force-fail':
          await this.transitionToFailed(farmId, 'Manual recovery - forced failure');
          break;
        case 'restart':
          // Not implemented yet
          throw new Error('Restart action not implemented');
      }

      this.recordRecovery({
        type: action === 'restart' ? 'restart' : action === 'force-fail' ? 'force-fail' : 'force-complete',
        farmId,
        reason: 'Manual recovery triggered',
        timestamp: new Date(),
        success: true
      });

      return true;
    } catch (error) {
      logger.error(LogCategory.FARM, `Manual recovery failed for farm ${farmId}:`, error);

      this.recordRecovery({
        type: action === 'restart' ? 'restart' : action === 'force-fail' ? 'force-fail' : 'force-complete',
        farmId,
        reason: `Manual recovery error: ${error}`,
        timestamp: new Date(),
        success: false,
        details: error instanceof Error ? error.message : String(error)
      });

      return false;
    }
  }
}

export const automatedFarmRecovery = AutomatedFarmRecovery.getInstance();
export { AutomatedFarmRecovery, RecoveryAction, RecoveryStats };
