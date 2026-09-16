/**
 * Farm Lifecycle Manager - Manages the complete lifecycle of farms
 *
 * Handles:
 * - Farm creation and initialization
 * - State transitions
 * - Health monitoring
 * - Cleanup and termination
 * - Recovery from failures
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { redisClientManager } from './redisClientManager';
import { FarmStatus } from '../types/farm';

export interface FarmLifecycleEvent {
  farmId: string;
  event: string;
  previousStatus: FarmStatus;
  newStatus: FarmStatus;
  metadata?: any;
  timestamp: Date;
}

export interface FarmRecoveryOptions {
  maxAttempts: number;
  retryDelay: number;
  preserveWorkspace: boolean;
}

// FIX: Differentiated heartbeat thresholds to prevent premature orphan detection
// AI models can have extended thinking periods (5-15+ minutes) without terminal output
// Using a shorter threshold causes farms to be falsely marked as orphaned during thinking
//
// IDLE/LAUNCHING farms: 5 minutes (these should transition quickly)
// ACTIVE/RUNNING farms: 30 minutes (allow for extended AI thinking)
const FARM_HEARTBEAT_STALE_THRESHOLD_DEFAULT = 5 * 60 * 1000; // 5 minutes for idle/launching
const FARM_HEARTBEAT_STALE_THRESHOLD_ACTIVE = 30 * 60 * 1000; // 30 minutes for active/running

class FarmLifecycleManager extends EventEmitter {
  private static instance: FarmLifecycleManager;
  private activeMonitors: Map<string, NodeJS.Timeout> = new Map();
  private stateTransitions: Map<string, FarmStatus[]> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();

  // Valid state transitions
  private readonly VALID_TRANSITIONS: Partial<Record<FarmStatus, FarmStatus[]>> = {
    [FarmStatus.IDLE]: [FarmStatus.LAUNCHING],
    [FarmStatus.LAUNCHING]: [FarmStatus.ACTIVE, FarmStatus.FAILED],
    [FarmStatus.ACTIVE]: [FarmStatus.RUNNING, FarmStatus.PAUSED, FarmStatus.HARVESTING, FarmStatus.FAILED, FarmStatus.TERMINATED],
    [FarmStatus.RUNNING]: [FarmStatus.ACTIVE, FarmStatus.PAUSED, FarmStatus.HARVESTING, FarmStatus.COMPLETED, FarmStatus.FAILED, FarmStatus.TERMINATED],
    [FarmStatus.PAUSED]: [FarmStatus.ACTIVE, FarmStatus.RUNNING, FarmStatus.TERMINATED],
    [FarmStatus.HARVESTING]: [FarmStatus.COMPLETED, FarmStatus.FAILED],
    [FarmStatus.COMPLETED]: [FarmStatus.TERMINATED],
    [FarmStatus.FAILED]: [FarmStatus.TERMINATED, FarmStatus.LAUNCHING], // Allow retry
    [FarmStatus.TERMINATED]: [], // Terminal state
    [FarmStatus.CRASHED]: [FarmStatus.TERMINATED],
    [FarmStatus.STOPPED]: [FarmStatus.TERMINATED],
    [FarmStatus.STALE]: [FarmStatus.RECOVERING, FarmStatus.TERMINATED],
    [FarmStatus.RECOVERING]: [FarmStatus.RUNNING, FarmStatus.TERMINATED],
    [FarmStatus.ORPHANED]: [FarmStatus.RECOVERING, FarmStatus.TERMINATED]
  };

  private constructor() {
    super();
    this.setupEventHandlers();
  }

  static getInstance(): FarmLifecycleManager {
    if (!FarmLifecycleManager.instance) {
      FarmLifecycleManager.instance = new FarmLifecycleManager();
    }
    return FarmLifecycleManager.instance;
  }

  /**
   * Setup internal event handlers
   */
  private setupEventHandlers(): void {
    // Handle farm state changes
    this.on('stateChanged', (event: FarmLifecycleEvent) => {
      this.logLifecycleEvent(event);
      this.broadcastStateChange(event);
    });

    // Handle farm failures
    this.on('farmFailed', (farmId: string, error: any) => {
      this.handleFarmFailure(farmId, error);
    });
  }

  /**
   * Initialize a new farm
   */
  async initializeFarm(farmId: string, config: any): Promise<void> {
    try {
      logger.info(LogCategory.FARM, `Initializing farm ${farmId}`);

      // Set initial state
      await this.transitionState(farmId, FarmStatus.IDLE, FarmStatus.LAUNCHING, {
        config,
        startTime: new Date()
      });

      // Start health monitoring
      this.startHealthMonitoring(farmId);

      // Initialize state tracking
      this.stateTransitions.set(farmId, [FarmStatus.LAUNCHING]);

    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to initialize farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Transition farm to a new state with retry logic for race conditions
   */
  async transitionState(
    farmId: string,
    fromStatus: FarmStatus,
    toStatus: FarmStatus,
    metadata?: any,
    retryCount: number = 0
  ): Promise<void> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 100;

    // Validate transition
    if (!this.isValidTransition(fromStatus, toStatus)) {
      throw new Error(`Invalid state transition from ${fromStatus} to ${toStatus}`);
    }

    try {
      // Update database with conditional check
      const result = await db.query(
        `UPDATE farms
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND status = $3
         RETURNING *`,
        [toStatus, farmId, fromStatus]
      );

      if (result.rows.length === 0) {
        // RACE CONDITION HANDLING: Check current state and retry if appropriate
        const currentState = await db.query(
          'SELECT status FROM farms WHERE id = $1',
          [farmId]
        );

        if (currentState.rows.length === 0) {
          throw new Error(`Farm ${farmId} not found`);
        }

        const actualStatus = currentState.rows[0].status as FarmStatus;

        // If already in target state, consider it a success (another process completed the transition)
        if (actualStatus === toStatus) {
          logger.info(LogCategory.FARM,
            `Farm ${farmId} already transitioned to ${toStatus} by another process`);
          return;
        }

        // If the transition from current state is valid, retry with current state
        if (retryCount < MAX_RETRIES && this.isValidTransition(actualStatus, toStatus)) {
          logger.warn(LogCategory.FARM,
            `Farm ${farmId} state changed during transition (expected ${fromStatus}, got ${actualStatus}). Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
          return this.transitionState(farmId, actualStatus, toStatus, metadata, retryCount + 1);
        }

        throw new Error(
          `Farm ${farmId} state transition failed: expected ${fromStatus}, actual ${actualStatus}. ` +
          `Transition to ${toStatus} not valid from current state.`
        );
      }

      // Track state history
      const history = this.stateTransitions.get(farmId) || [];
      history.push(toStatus);
      this.stateTransitions.set(farmId, history);

      // Emit event
      const event: FarmLifecycleEvent = {
        farmId,
        event: 'stateChanged',
        previousStatus: fromStatus,
        newStatus: toStatus,
        metadata,
        timestamp: new Date()
      };

      this.emit('stateChanged', event);

      // Handle special transitions
      await this.handleSpecialTransitions(farmId, toStatus, metadata);

    } catch (error) {
      logger.error(LogCategory.FARM, `Failed to transition farm ${farmId} state:`, error);
      throw error;
    }
  }

  /**
   * Check if a state transition is valid
   */
  private isValidTransition(from: FarmStatus, to: FarmStatus): boolean {
    return this.VALID_TRANSITIONS[from]?.includes(to) || false;
  }

  /**
   * Handle special state transitions
   */
  private async handleSpecialTransitions(
    farmId: string,
    newStatus: FarmStatus,
    metadata?: any
  ): Promise<void> {
    switch (newStatus) {
      case FarmStatus.ACTIVE:
        await this.onFarmActive(farmId);
        break;
      case FarmStatus.HARVESTING:
        await this.onFarmHarvesting(farmId);
        break;
      case FarmStatus.COMPLETED:
        await this.onFarmCompleted(farmId);
        break;
      case FarmStatus.FAILED:
        await this.onFarmFailed(farmId, metadata?.error);
        break;
      case FarmStatus.TERMINATED:
        await this.onFarmTerminated(farmId);
        break;
    }
  }

  /**
   * Handle farm becoming active
   */
  private async onFarmActive(farmId: string): Promise<void> {
    logger.info(LogCategory.FARM, `Farm ${farmId} is now active`);

    // Update last_heartbeat
    await db.query(
      `UPDATE farms SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = $1`,
      [farmId]
    );
  }

  /**
   * Handle farm entering harvest phase
   */
  private async onFarmHarvesting(farmId: string): Promise<void> {
    logger.info(LogCategory.FARM, `Farm ${farmId} entering harvest phase`);

    // Stop health monitoring during harvest
    this.stopHealthMonitoring(farmId);
  }

  /**
   * Handle farm completion
   */
  private async onFarmCompleted(farmId: string): Promise<void> {
    logger.info(LogCategory.FARM, `Farm ${farmId} completed successfully`);

    // Update completion time
    await db.query(
      `UPDATE farms SET completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [farmId]
    );

    // Stop monitoring
    this.stopHealthMonitoring(farmId);
  }

  /**
   * Handle farm failure
   */
  private async onFarmFailed(farmId: string, error?: any): Promise<void> {
    logger.error(LogCategory.FARM, `Farm ${farmId} failed:`, error);

    // Check if recovery is possible
    const attempts = this.recoveryAttempts.get(farmId) || 0;
    if (attempts < 3) {
      await this.attemptRecovery(farmId);
    } else {
      await this.transitionState(farmId, FarmStatus.FAILED, FarmStatus.TERMINATED);
    }
  }

  /**
   * Handle farm termination
   */
  private async onFarmTerminated(farmId: string): Promise<void> {
    logger.info(LogCategory.FARM, `Farm ${farmId} terminated`);

    // Cleanup
    this.stopHealthMonitoring(farmId);
    this.stateTransitions.delete(farmId);
    this.recoveryAttempts.delete(farmId);
  }

  /**
   * Start health monitoring for a farm
   */
  private startHealthMonitoring(farmId: string): void {
    // Clear existing monitor if any
    this.stopHealthMonitoring(farmId);

    const monitor = setInterval(async () => {
      try {
        await this.checkFarmHealth(farmId);
      } catch (error) {
        logger.error(LogCategory.FARM, `Health check failed for farm ${farmId}:`, error);
      }
    }, 30000); // Check every 30 seconds

    this.activeMonitors.set(farmId, monitor);
  }

  /**
   * Stop health monitoring for a farm
   */
  private stopHealthMonitoring(farmId: string): void {
    const monitor = this.activeMonitors.get(farmId);
    if (monitor) {
      clearInterval(monitor);
      this.activeMonitors.delete(farmId);
    }
  }

  /**
   * Check farm health
   */
  private async checkFarmHealth(farmId: string): Promise<void> {
    const result = await db.query(
      `SELECT status, last_heartbeat FROM farms WHERE id = $1`,
      [farmId]
    );

    if (result.rows.length === 0) return;

    const farm = result.rows[0];
    const lastHeartbeat = farm.last_heartbeat ? new Date(farm.last_heartbeat) : null;
    const now = new Date();

    // Check if heartbeat is stale using differentiated thresholds
    // ACTIVE/RUNNING farms get longer threshold to allow for AI thinking pauses
    const threshold = (farm.status === FarmStatus.ACTIVE || farm.status === FarmStatus.RUNNING)
      ? FARM_HEARTBEAT_STALE_THRESHOLD_ACTIVE  // 30 minutes for active/running
      : FARM_HEARTBEAT_STALE_THRESHOLD_DEFAULT; // 5 minutes for other states

    if (lastHeartbeat && (now.getTime() - lastHeartbeat.getTime()) > threshold) {
      if (farm.status === FarmStatus.ACTIVE || farm.status === FarmStatus.RUNNING) {
        const staleMinutes = Math.round((now.getTime() - lastHeartbeat.getTime()) / 60000);
        logger.warn(LogCategory.FARM, `Farm ${farmId} heartbeat is stale (${staleMinutes} minutes without activity)`);
        this.emit('farmUnhealthy', farmId);
      }
    }
  }

  /**
   * Attempt to recover a failed farm
   */
  private async attemptRecovery(farmId: string): Promise<void> {
    const attempts = (this.recoveryAttempts.get(farmId) || 0) + 1;
    this.recoveryAttempts.set(farmId, attempts);

    logger.info(LogCategory.FARM, `Attempting recovery for farm ${farmId} (attempt ${attempts}/3)`);

    try {
      // Mark recovery attempt in database
      await db.query(
        `UPDATE farms SET recovery_attempted = true WHERE id = $1`,
        [farmId]
      );

      // Emit recovery event
      this.emit('farmRecovering', farmId);

      // Attempt to restart
      await this.transitionState(farmId, FarmStatus.FAILED, FarmStatus.LAUNCHING, {
        recoveryAttempt: attempts
      });

    } catch (error) {
      logger.error(LogCategory.FARM, `Recovery failed for farm ${farmId}:`, error);

      if (attempts >= 3) {
        await this.transitionState(farmId, FarmStatus.FAILED, FarmStatus.TERMINATED, {
          reason: 'Max recovery attempts reached'
        });
      }
    }
  }

  /**
   * Handle farm failure from external source
   */
  private async handleFarmFailure(farmId: string, error: any): Promise<void> {
    const result = await db.query(
      `SELECT status FROM farms WHERE id = $1`,
      [farmId]
    );

    if (result.rows.length > 0) {
      const currentStatus = result.rows[0].status as FarmStatus;
      if (currentStatus !== FarmStatus.FAILED && currentStatus !== FarmStatus.TERMINATED) {
        await this.transitionState(farmId, currentStatus, FarmStatus.FAILED, { error });
      }
    }
  }

  /**
   * Log lifecycle event to database
   */
  private async logLifecycleEvent(event: FarmLifecycleEvent): Promise<void> {
    try {
      await db.query(
        `INSERT INTO farm_lifecycle_events
         (farm_id, event_type, metadata, created_at)
         VALUES ($1, $2, $3, $4)`,
        [
          event.farmId,
          `${event.previousStatus}_to_${event.newStatus}`,
          JSON.stringify(event.metadata || {}),
          event.timestamp
        ]
      );
    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to log lifecycle event:', error);
    }
  }

  /**
   * Broadcast state change via WebSocket
   */
  private broadcastStateChange(event: FarmLifecycleEvent): void {
    websocketManager.broadcast('farm:statusChanged', {
      farmId: event.farmId,
      status: event.newStatus,
      previousStatus: event.previousStatus,
      metadata: event.metadata,
      timestamp: event.timestamp
    });
  }

  /**
   * Get farm lifecycle history
   */
  async getFarmHistory(farmId: string): Promise<FarmLifecycleEvent[]> {
    const result = await db.query(
      `SELECT * FROM farm_lifecycle_events
       WHERE farm_id = $1
       ORDER BY created_at ASC`,
      [farmId]
    );

    return result.rows.map(row => ({
      farmId: row.farm_id,
      event: row.event_type,
      previousStatus: row.event_type.split('_to_')[0] as FarmStatus,
      newStatus: row.event_type.split('_to_')[1] as FarmStatus,
      metadata: row.metadata,
      timestamp: new Date(row.created_at)
    }));
  }

  /**
   * Cleanup orphaned farms
   */
  async cleanupOrphanedFarms(): Promise<void> {
    try {
      // FIX: Use 30-minute threshold for ACTIVE/RUNNING farms to allow for AI thinking pauses
      // Previously 5 minutes - caused farms to be falsely marked orphaned during extended thinking
      const result = await db.query(
        `UPDATE farms
         SET orphaned_at = CURRENT_TIMESTAMP,
             status = 'failed'
         WHERE status IN ('active', 'running')
           AND last_heartbeat < NOW() - INTERVAL '30 minutes'
           AND orphaned_at IS NULL
         RETURNING id`
      );

      for (const row of result.rows) {
        logger.warn(LogCategory.FARM, `Marked farm ${row.id} as orphaned (no heartbeat for 30+ minutes)`);
        this.emit('farmOrphaned', row.id);
      }

    } catch (error) {
      logger.error(LogCategory.FARM, 'Failed to cleanup orphaned farms:', error);
    }
  }

  /**
   * Shutdown the lifecycle manager
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.FARM, 'Shutting down FarmLifecycleManager');

    // Stop all monitors
    for (const [farmId, monitor] of this.activeMonitors) {
      clearInterval(monitor);
    }

    this.activeMonitors.clear();
    this.stateTransitions.clear();
    this.recoveryAttempts.clear();
  }
}

// Export singleton instance
export const farmLifecycleManager = FarmLifecycleManager.getInstance();
