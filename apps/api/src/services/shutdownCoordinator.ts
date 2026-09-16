import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import {
  GRACEFUL_SHUTDOWN_PERIOD,
  QUICK_TASK_TIMEOUT,
  calculateGracefulShutdownTime,
  getGracePeriod,
  FILE_COLLECTION_TIMEOUT,
  AGENT_CLOSING_PROMPT_TIMEOUT
} from '../constants/timing';
import { harvestService } from './unified/harvestService';
import { websocketManager } from '../websocket/websocketManager';
import { orchestratorService } from './unified/orchestratorService';
import { activityParser } from './activityParser';
import { yieldDetectionService } from './YieldDetectionService';
import { farmerGroupService } from './FarmerGroupService';
import { lockManager } from '../utils/AsyncLock';

export type ShutdownMode = 'quick-task' | 'farm' | 'gowild';
export type ShutdownReason = 'timeout' | 'user_request' | 'completion';

export interface ShutdownConfig {
  mode: ShutdownMode;
  farmId: string;
  userId: string;
  reason: ShutdownReason;
  timeout?: number; // Total timeout in ms (only for farm/gowild modes)
  harvestId?: string;
  agentIds?: string[];
}

export interface ShutdownResult {
  success: boolean;
  filesCollected: boolean;
  barnStored: boolean;
  errors?: string[];
  timing: {
    shutdownStarted: Date;
    shutdownCompleted: Date;
    durationMs: number;
    gracePeriodUsed: number;
  };
}

/**
 * Centralized shutdown coordinator for all quick action modes
 * Ensures consistent timing and file collection across Quick Task, Farm, and GoWild modes
 * Simplified to work like orchestrator.py with CTRL+C handling
 */
class ShutdownCoordinator extends EventEmitter {
  private activeShutdowns: Map<string, NodeJS.Timeout> = new Map();
  private isShuttingDown: boolean = false;
  // REMOVED: shutdownLocks Map - now using lockManager from AsyncLock utility
  // This provides proper mutex semantics without TOCTOU race conditions
  private shutdownInProgress: Set<string> = new Set(); // Track farms currently shutting down

  constructor() {
    super();
    this.setupSignalHandlers();
  }

  /**
   * Setup SIGINT/SIGTERM handlers for graceful shutdown (like orchestrator.py)
   * ASYNC ERROR FIX: Properly handle async operations in signal handlers
   */
  private setupSignalHandlers(): void {
    const handleSignal = async (signal: string) => {
      if (this.isShuttingDown) return;

      logger.info(LogCategory.SYSTEM, `[ShutdownCoordinator] ${signal} received - initiating graceful shutdown`);
      this.isShuttingDown = true;

      // ASYNC ERROR FIX: Collect all farm IDs first to avoid mutation during iteration
      const farmIds = Array.from(this.activeShutdowns.keys());

      // Trigger graceful shutdown for all active farms with proper error handling
      const shutdownPromises = farmIds.map(async (farmId) => {
        const timer = this.activeShutdowns.get(farmId);
        if (timer) {
          clearTimeout(timer);
        }

        try {
          await this.executeGracefulShutdown({
            mode: 'farm',
            farmId,
            userId: 'system',
            reason: 'user_request'
          });
        } catch (error) {
          // ASYNC ERROR FIX: Log but don't rethrow - we want to try all farms
          logger.error(LogCategory.SYSTEM, `[ShutdownCoordinator] Failed to shutdown farm ${farmId} during ${signal}:`, error);
        }
      });

      // Wait for all shutdowns to complete (with their own error handling)
      await Promise.allSettled(shutdownPromises);
      logger.info(LogCategory.SYSTEM, `[ShutdownCoordinator] All farm shutdowns processed for ${signal}`);
    };

    // ASYNC ERROR FIX: Wrap async handler to catch unhandled rejections
    const safeHandleSignal = (signal: string) => {
      handleSignal(signal).catch((error) => {
        logger.error(LogCategory.SYSTEM, `[ShutdownCoordinator] Critical error during ${signal} handling:`, error);
      });
    };

    // Handle CTRL+C like orchestrator.py
    process.once('SIGINT', () => safeHandleSignal('SIGINT'));
    process.once('SIGTERM', () => safeHandleSignal('SIGTERM'));
  }

  /**
   * Schedule a graceful shutdown for a farm/task
   * This sets up the timer to trigger shutdown 30s before the ultimate timeout
   * CRITICAL FIX: Uses AsyncLock to prevent race conditions (TOCTOU vulnerability)
   */
  async scheduleShutdown(config: ShutdownConfig): Promise<void> {
    const { farmId } = config;
    const lockResource = `shutdown:${farmId}`;
    const lockHolder = `scheduler:${Date.now()}`;

    // CRITICAL FIX: Use proper mutex lock instead of manual while loop
    // The previous implementation had a TOCTOU race condition where multiple
    // coroutines could pass the while check simultaneously when a lock was released
    let releaseLock: (() => void) | undefined;

    try {
      // Acquire lock with 60 second timeout (long enough for shutdown operations)
      releaseLock = await lockManager.acquire(lockResource, lockHolder, 60000);
      logger.debug(LogCategory.SYSTEM, `[ShutdownCoordinator] Lock acquired for farm ${farmId.substring(0, 8)}`);

      // Now we have exclusive access - execute the shutdown scheduling
      await this._scheduleShutdownWithLock(config);

    } catch (error) {
      // Lock acquisition failed (timeout or queue full)
      logger.error(LogCategory.SYSTEM, `[ShutdownCoordinator] Failed to acquire lock for farm ${farmId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      // Always release the lock when done
      if (releaseLock) {
        releaseLock();
        logger.debug(LogCategory.SYSTEM, `[ShutdownCoordinator] Lock released for farm ${farmId.substring(0, 8)}`);
      }
    }
  }

  private async _scheduleShutdownWithLock(config: ShutdownConfig): Promise<void> {
    const { mode, farmId, userId, timeout } = config;

    // Check if shutdown is already in progress for this farm
    if (this.shutdownInProgress.has(farmId)) {
      logger.info(`[ShutdownCoordinator] Shutdown already in progress for farm ${farmId}, skipping duplicate request`);
      return;
    }

    // Clear any existing shutdown timer for this farm to prevent conflicts
    if (this.activeShutdowns.has(farmId)) {
      logger.warn(`[ShutdownCoordinator] CRITICAL: Cancelling existing shutdown timer for farm ${farmId} to prevent race condition`);
      this.cancelShutdown(farmId);
    }

    // UPDATED: Trigger graceful shutdown AT the timeout mark, not before
    // This gives agents the full time requested, then adds grace period AFTER
    let totalTimeoutMs: number;
    let gracefulShutdownTime: number;

    if (mode === 'quick-task') {
      // Quick Task: Shutdown starts AT the 5-minute mark
      totalTimeoutMs = QUICK_TASK_TIMEOUT;
      gracefulShutdownTime = totalTimeoutMs; // Start shutdown at timeout, not before
    } else {
      // Farm and GoWild: Shutdown starts AT the configured timeout
      if (!timeout || timeout <= 0) {
        logger.error(`[ShutdownCoordinator] CRITICAL: No valid timeout provided for ${mode} mode, defaulting to 1 hour`);
        totalTimeoutMs = 3600000; // 1 hour in ms as safe default
      } else if (timeout < 60000 && timeout > 60) {
        // If timeout is < 1 minute but > 60, likely in seconds (common mistake)
        logger.warn(`[ShutdownCoordinator] Timeout ${timeout} seems to be in seconds, converting to ms`);
        totalTimeoutMs = timeout * 1000;
      } else {
        // FIXED: Always expect milliseconds from all callers
        totalTimeoutMs = timeout;
      }

      // CRITICAL: Cap timeout to prevent 32-bit overflow in setTimeout (max ~24.8 days)
      const MAX_TIMEOUT_MS = 2147483647; // Maximum 32-bit signed integer
      if (totalTimeoutMs > MAX_TIMEOUT_MS) {
        logger.warn(`[ShutdownCoordinator] Timeout ${totalTimeoutMs}ms exceeds maximum, capping to ${MAX_TIMEOUT_MS}ms (${Math.round(MAX_TIMEOUT_MS / 1000 / 60 / 60)} hours)`);
        totalTimeoutMs = MAX_TIMEOUT_MS;
      }

      logger.info(`[ShutdownCoordinator] Timeout set to ${totalTimeoutMs}ms (${Math.round(totalTimeoutMs / 1000)}s = ${Math.round(totalTimeoutMs / 60000)} minutes) for ${mode} mode`);

      // UPDATED: Start shutdown AT the timeout mark, not 30s before
      gracefulShutdownTime = totalTimeoutMs; // Give agents full time, then shutdown
    }

    // Ensure gracefulShutdownTime is positive
    if (gracefulShutdownTime <= 0) {
      logger.warn(`[ShutdownCoordinator] Graceful shutdown time is non-positive (${gracefulShutdownTime}ms), using minimum delay of 10s`);
      gracefulShutdownTime = 10000; // Use 10 second minimum
    }
    
    // Log timer configuration
    logger.debug('[ShutdownCoordinator] Timer configuration', {
      mode,
      farmId: farmId.substring(0, 8),
      timeoutMs: totalTimeoutMs,
      shutdownDelayMs: gracefulShutdownTime,
      shutdownDelaySeconds: Math.round(gracefulShutdownTime / 1000),
      scheduledAt: new Date().toISOString(),
      willFireAt: new Date(Date.now() + gracefulShutdownTime).toISOString()
    });
    
    logger.info(`[ShutdownCoordinator] CRITICAL: Scheduling ${mode} shutdown for ${farmId}:`, {
      totalTimeout: `${totalTimeoutMs / 1000}s`,
      shutdownStartsAt: `${gracefulShutdownTime / 1000}s`,
      gracePeriodAfter: `${GRACEFUL_SHUTDOWN_PERIOD / 1000}s`,
      scheduledAt: new Date().toISOString(),
      farmId: farmId
    });
    
    // Log farm protection details
    logger.info('[ShutdownCoordinator] Farm protection activated', {
      farmId: farmId.substring(0, 8),
      sessionName: `farm-${farmId.substring(0, 8)}`,
      protectedUntil: new Date(Date.now() + totalTimeoutMs).toISOString(),
      shutdownStartsAt: new Date(Date.now() + gracefulShutdownTime).toISOString(),
      note: 'Farm is protected from cleanup until timeout expires'
    });
    
    // ASYNC ERROR FIX: Set timer for graceful shutdown with proper error handling
    // setTimeout with async callback can throw unhandled promise rejections
    const shutdownTimer = setTimeout(() => {
      // FIX: Wrap entire callback in try-catch to handle synchronous errors
      try {
        logger.info(LogCategory.SYSTEM, '[ShutdownCoordinator] Timeout reached, initiating graceful shutdown', {
          farmId: farmId.substring(0, 8),
          mode,
          reason: 'timeout',
          triggeredAt: new Date().toISOString()
        });

        // ASYNC ERROR FIX: Wrap async operation in .catch() to prevent unhandled rejection
        this.executeGracefulShutdown({
          ...config,
          reason: 'timeout'
        }).catch((error) => {
          logger.error(LogCategory.SYSTEM, `[ShutdownCoordinator] Failed to execute scheduled shutdown for farm ${farmId}:`, error);
          // Emit error event for monitoring
          this.emit('shutdown:error', {
            farmId,
            mode,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date()
          });
        });
      } catch (syncError) {
        // Handle synchronous errors in the callback
        logger.error(LogCategory.SYSTEM, `[ShutdownCoordinator] Synchronous error in shutdown timer for farm ${farmId}:`, syncError);
        this.emit('shutdown:error', {
          farmId,
          mode,
          error: syncError instanceof Error ? syncError.message : String(syncError),
          timestamp: new Date()
        });
      }
    }, gracefulShutdownTime);
    
    this.activeShutdowns.set(farmId, shutdownTimer);
    
    // Emit event for monitoring
    this.emit('shutdown:scheduled', {
      farmId,
      mode,
      totalTimeoutMs,
      gracefulShutdownTime,
      scheduledAt: new Date()
    });
  }

  /**
   * Execute graceful shutdown immediately
   * Used for user-requested or completion-based shutdowns
   *
   * CRITICAL: Uses try/finally to ensure cleanup ALWAYS happens,
   * preventing zombie farms that can never be shut down again.
   */
  async executeGracefulShutdown(config: ShutdownConfig): Promise<ShutdownResult> {
    const startTime = new Date();
    const { farmId } = config;

    // Check if already shutting down this farm
    if (this.shutdownInProgress.has(farmId)) {
      logger.warn(`[ShutdownCoordinator] Shutdown already in progress for farm ${farmId}, preventing duplicate execution`);
      return {
        success: false,
        filesCollected: false,
        barnStored: false,
        errors: ['Shutdown already in progress'],
        timing: {
          shutdownStarted: startTime,
          shutdownCompleted: new Date(),
          durationMs: 0,
          gracePeriodUsed: 0
        }
      };
    }

    // Mark this farm as shutting down - MUST be cleaned up in finally
    this.shutdownInProgress.add(farmId);
    const { mode, userId, reason, harvestId, agentIds } = config;

    // Log shutdown execution details
    logger.info('[ShutdownCoordinator] Executing graceful shutdown', {
      farmId: farmId.substring(0, 8),
      mode,
      reason,
      harvestId,
      startedAt: startTime.toISOString()
    });

    // Cancel any scheduled shutdown since we're doing it now
    this.cancelShutdown(farmId);

    const errors: string[] = [];
    let filesCollected = false;
    let barnStored = false;
    let result: ShutdownResult;

    try {
      // Step 1: Notify via WebSocket that shutdown is starting
      websocketManager.broadcast('farm:graceful_shutdown_started', {
        farmId,
        mode,
        reason,
        timestamp: startTime
      });

      // Step 2: Send closing prompt to agents to collect their work
      if (mode !== 'quick-task' || agentIds?.length) {
        try {
          await this.sendClosingPrompts(farmId, mode, reason, agentIds);

          // Wait for agents to process closing prompt
          await new Promise(resolve => setTimeout(resolve, AGENT_CLOSING_PROMPT_TIMEOUT));
        } catch (error) {
          // Don't fail the entire shutdown if closing prompts fail
          logger.warn(`[ShutdownCoordinator] Continuing shutdown despite closing prompt error:`, error);
        }
      }

      // Step 3: Collect files from agents
      try {
        const fileCollection = await this.collectFiles(farmId, mode, harvestId);
        filesCollected = fileCollection.success;
        if (!fileCollection.success) {
          errors.push(`File collection failed: ${fileCollection.error}`);
        }
      } catch (error) {
        logger.error(`[ShutdownCoordinator] File collection failed for ${farmId}:`, error);
        errors.push(`File collection error: ${error}`);
      }

      // Step 3.5: Link yield items to harvest
      // CRITICAL FIX: Must link yield items to harvest BEFORE barn storage
      // Without this, yield items have NULL harvest_id and barn displays empty harvests
      const effectiveHarvestId = harvestId || `harvest-${farmId}`;
      try {
        await yieldDetectionService.linkYieldItemsToHarvest(farmId, effectiveHarvestId);
        logger.info(`[ShutdownCoordinator] Linked yield items to harvest ${effectiveHarvestId} for farm ${farmId}`);
      } catch (error) {
        logger.warn(`[ShutdownCoordinator] Failed to link yield items to harvest for ${farmId}:`, error);
        // Don't fail the entire flow - continue with barn storage
      }

      // Step 4: Store in Barn
      try {
        const barnResult = await this.storeInBarn(farmId, mode, harvestId);
        barnStored = barnResult.success;
        if (!barnResult.success) {
          errors.push(`Barn storage failed: ${barnResult.error}`);
        }
      } catch (error) {
        logger.error(`[ShutdownCoordinator] Barn storage failed for ${farmId}:`, error);
        errors.push(`Barn storage error: ${error}`);
      }

      // Step 5: Update farm/task status
      try {
        await this.updateStatus(farmId, mode, reason);
      } catch (error) {
        logger.error(`[ShutdownCoordinator] Status update failed for ${farmId}:`, error);
        errors.push(`Status update error: ${error}`);
      }

      // Step 6: Clean up resources
      try {
        await this.cleanupResources(farmId, mode);
      } catch (error) {
        logger.error(`[ShutdownCoordinator] Resource cleanup failed for ${farmId}:`, error);
        errors.push(`Resource cleanup error: ${error}`);
      }

    } catch (error) {
      logger.error(`[ShutdownCoordinator] Shutdown failed for ${farmId}:`, error);
      errors.push(`General shutdown error: ${error}`);
    } finally {
      // CRITICAL: ALWAYS clean up the shutdown lock to prevent zombie farms
      // This runs even if an error was thrown above
      this.shutdownInProgress.delete(farmId);

      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();

      // Build result object
      result = {
        success: filesCollected && barnStored && errors.length === 0,
        filesCollected,
        barnStored,
        errors: errors.length > 0 ? errors : undefined,
        timing: {
          shutdownStarted: startTime,
          shutdownCompleted: endTime,
          durationMs,
          gracePeriodUsed: durationMs
        }
      };

      // Emit completion event (even on failure)
      this.emit('shutdown:completed', {
        farmId,
        mode,
        reason,
        result
      });

      websocketManager.broadcast('farm:graceful_shutdown_completed', {
        farmId,
        mode,
        reason,
        result,
        timestamp: endTime
      });

      logger.info(`[ShutdownCoordinator] Shutdown completed for ${farmId}`, {
        success: result.success,
        duration: `${durationMs / 1000}s`,
        filesCollected,
        barnStored,
        errorCount: errors.length
      });
    }

    return result!;
  }

  /**
   * Cancel a scheduled shutdown
   */
  cancelShutdown(farmId: string): void {
    const timer = this.activeShutdowns.get(farmId);
    if (timer) {
      clearTimeout(timer);
      this.activeShutdowns.delete(farmId);
      logger.info(`[ShutdownCoordinator] Cancelled scheduled shutdown for ${farmId}`);

      this.emit('shutdown:cancelled', { farmId });
    }
  }

  /**
   * Trigger immediate shutdown for a farm
   * Used when a farm needs to be stopped immediately (e.g., user cancellation)
   */
  async triggerShutdown(farmId: string): Promise<void> {
    logger.info(`[ShutdownCoordinator] Triggering immediate shutdown for farm ${farmId}`);

    // Cancel any scheduled shutdown first
    this.cancelShutdown(farmId);

    // Execute graceful shutdown immediately
    try {
      await this.executeGracefulShutdown({
        mode: 'farm', // Default mode
        farmId,
        userId: 'system', // System-triggered shutdown
        timeout: 30000, // 30 second grace period
        reason: 'user_request'
      });
    } catch (error) {
      logger.error(`[ShutdownCoordinator] Failed to trigger shutdown for farm ${farmId}:`, error);
      throw error;
    }
  }

  /**
   * Check if shutdown is scheduled for a farm
   * CRITICAL: Checks both full farm ID and short farm ID for compatibility
   */
  isShutdownScheduled(farmId: string): boolean {
    // Check exact match first
    if (this.activeShutdowns.has(farmId)) {
      return true;
    }

    // If farmId is a short ID (8 chars), check if any full UUID starts with it
    if (farmId.length === 8 || farmId.length < 36) {
      for (const scheduledFarmId of this.activeShutdowns.keys()) {
        if (scheduledFarmId.startsWith(farmId)) {
          return true;
        }
      }
    }

    // If farmId is a full UUID, check if its short version is scheduled
    if (farmId.length === 36) {
      const shortId = farmId.substring(0, 8);
      if (this.activeShutdowns.has(shortId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Send closing prompts to agents
   */
  private async sendClosingPrompts(
    farmId: string, 
    mode: ShutdownMode, 
    reason: ShutdownReason,
    agentIds?: string[]
  ): Promise<void> {
    // Skip if we're already shutting down (prevent errors during process exit)
    if (this.isShuttingDown) {
      logger.info(`[ShutdownCoordinator] Skipping closing prompts - system is shutting down`);
      return;
    }
    
    const closingPrompt = this.generateClosingPrompt(mode, reason);
    
    try {
      // Get farm status to find agents
      const farmStatus = await orchestratorService.getStatus(farmId);
      
      if (farmStatus.isRunning && farmStatus.agents.length > 0) {
        logger.info(`[ShutdownCoordinator] Sending closing prompt to ${farmStatus.agents.length} agents`);
        
        // Send to each agent
        for (let i = 0; i < farmStatus.agents.length; i++) {
          try {
            await orchestratorService.sendCommandToAgent(farmStatus.processId, i, closingPrompt);
          } catch (error) {
            logger.error(`[ShutdownCoordinator] Failed to send closing prompt to agent ${i}:`, error);
          }
        }
      }
    } catch (error) {
      // Check if this is a shutdown-related error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('service is no longer running') || 
          errorMessage.includes('esbuild') ||
          this.isShuttingDown) {
        logger.info(`[ShutdownCoordinator] Service unavailable during shutdown - skipping closing prompts`);
      } else {
        logger.error(`[ShutdownCoordinator] Failed to send closing prompts:`, error);
      }
    }
  }

  /**
   * Collect files from agents and complete the harvest
   * AUTO-RECOVERY: Creates harvest if missing, ensuring yield generation never fails
   */
  private async collectFiles(
    farmId: string,
    mode: ShutdownMode,
    harvestId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let effectiveHarvestId = harvestId;

      // AUTO-RECOVERY: If no harvestId provided, create one
      if (!effectiveHarvestId) {
        logger.warn(`[ShutdownCoordinator] No harvestId for ${farmId} - creating recovery harvest`);

        try {
          // Get farm info for harvest creation
          const { db } = await import('../database/connection');
          const farmResult = await db.query(
            'SELECT name, created_by FROM farms WHERE id = $1',
            [farmId]
          );
          const farmName = farmResult.rows[0]?.name || `Farm ${farmId.substring(0, 8)}`;
          const userId = farmResult.rows[0]?.created_by || 'system';

          const recoveryHarvest = await harvestService.startHarvest({
            farmId,
            name: `Recovery Harvest - ${farmName}`,
            metadata: { createdBy: userId, recovery: true }
          });

          effectiveHarvestId = recoveryHarvest.id;
          logger.info(`[ShutdownCoordinator] Created recovery harvest ${effectiveHarvestId} for farm ${farmId}`);

          // Broadcast recovery event
          websocketManager.broadcast('harvest:auto-recovery', {
            farmId,
            harvestId: effectiveHarvestId,
            reason: 'Missing harvestId during shutdown',
            timestamp: new Date()
          });
        } catch (recoveryError) {
          logger.error(`[ShutdownCoordinator] Failed to create recovery harvest:`, recoveryError);
          return {
            success: false,
            error: `No harvest ID and recovery failed: ${recoveryError}`
          };
        }
      }

      logger.info(`[ShutdownCoordinator] Starting harvest collection for harvest ${effectiveHarvestId}`);

      // collectHarvest gathers terminal output and workspace artifacts,
      // then internally calls completeHarvest with yield items populated
      // DO NOT call completeHarvest again - it's already called inside collectHarvest
      const collectionPromise = harvestService.collectHarvest(effectiveHarvestId);

      // FIX: Use timeout with graceful handling - don't abandon collection, just log warning
      // This ensures partial results are still saved even if collection takes longer than expected
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`[ShutdownCoordinator] Harvest collection taking longer than ${FILE_COLLECTION_TIMEOUT}ms, continuing...`);
      }, FILE_COLLECTION_TIMEOUT);

      // FIX: Track collection success to properly report errors to caller
      let collectionSucceeded = true;
      let collectionErrorMessage: string | undefined;

      try {
        await collectionPromise;
        clearTimeout(timeoutId);
        if (timedOut) {
          logger.info(`[ShutdownCoordinator] Harvest collection eventually completed for ${effectiveHarvestId} (exceeded timeout)`);
        } else {
          logger.info(`[ShutdownCoordinator] Harvest collection completed for ${effectiveHarvestId}`);
        }
      } catch (collectionError) {
        clearTimeout(timeoutId);
        collectionSucceeded = false;
        collectionErrorMessage = String(collectionError);
        logger.error(`[ShutdownCoordinator] Harvest collection failed for ${effectiveHarvestId}:`, collectionError);
        // Continue with shutdown to try incubation, but mark as failed
      }

      // OPTIONAL AUTO-INCUBATION: Start incubation if farm has auto-incubate enabled
      try {
        const { incubationService } = await import('./IncubationService');
        const incubationSessionId = await incubationService.maybeStartIncubation(
          farmId,
          effectiveHarvestId
        );

        if (incubationSessionId) {
          logger.info(
            `[ShutdownCoordinator] Auto-incubation started for farm ${farmId}: session ${incubationSessionId}`
          );

          // Broadcast incubation start event
          websocketManager.broadcast('incubation:auto-started', {
            farmId,
            harvestId: effectiveHarvestId,
            sessionId: incubationSessionId,
            timestamp: new Date()
          });
        } else {
          logger.debug(
            `[ShutdownCoordinator] Auto-incubate disabled or not applicable for farm ${farmId}`
          );
        }
      } catch (incubationError) {
        // Don't fail harvest if incubation fails - it's optional
        logger.warn(
          `[ShutdownCoordinator] Auto-incubation failed for farm ${farmId}, continuing without incubation:`,
          incubationError
        );
      }

      // FIX: Return proper success status based on collection result
      if (collectionSucceeded) {
        return { success: true };
      } else {
        return {
          success: false,
          error: collectionErrorMessage || 'Harvest collection failed with unknown error'
        };
      }
    } catch (error) {
      logger.error(`[ShutdownCoordinator] Harvest collection failed:`, error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Store collected files in Barn
   */
  private async storeInBarn(
    farmId: string,
    mode: ShutdownMode,
    harvestId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!harvestId) {
        return { success: false, error: 'No harvest ID for barn storage' };
      }

      const { barnService } = await import('./unified/barnService');

      // FIX: Use getHarvestById which doesn't require userId
      // This allows barn storage to work even without the original user context
      const harvest = await harvestService.getHarvestById(harvestId);
      if (!harvest) {
        return { success: false, error: `Harvest ${harvestId} not found` };
      }

      // Persist the collected harvest bundle as a Barn item so UI can surface yielded assets
      await barnService.storeHarvest(harvest);

      websocketManager.broadcast('barn:item:created', {
        farmId,
        harvestId,
        mode,
        timestamp: new Date()
      });

      return { success: true };
    } catch (error) {
      logger.error(`[ShutdownCoordinator] Barn storage failed:`, error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Update farm/task status after shutdown
   */
  private async updateStatus(
    farmId: string,
    mode: ShutdownMode,
    reason: ShutdownReason
  ): Promise<void> {
    try {
      const { db } = await import('../database/connection');
      
      const status = reason === 'timeout' ? 'failed' :  // Changed from 'timeout' to 'failed'
                     reason === 'user_request' ? 'stopped' :
                     'completed';

      // FIX: Prevent status regression - only update if farm is not already in a terminal state
      // This prevents race conditions where orchestrator.py already marked farm as completed
      const result = await db.query(
        `UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND status NOT IN ('completed', 'terminated', 'failed')
         RETURNING status`,
        [status, farmId]
      );

      if (result.rowCount === 0) {
        // Farm was already in terminal state, check what it is
        const currentResult = await db.query('SELECT status FROM farms WHERE id = $1', [farmId]);
        const currentStatus = currentResult.rows[0]?.status || 'unknown';
        logger.info(`[ShutdownCoordinator] Farm ${farmId} already in terminal state '${currentStatus}', skipping status update to '${status}'`);
        return;
      }

      logger.info(`[ShutdownCoordinator] Updated ${farmId} status to ${status}`);

      // CRITICAL FIX: Broadcast status change to frontend
      // Without this, UI never learns that farm completed/failed/stopped
      const statusPayload = {
        farmId,
        status,
        reason,
        mode,
        timestamp: new Date(),
        source: 'shutdown_coordinator'
      };

      websocketManager.broadcast('farm:status', statusPayload);
      websocketManager.broadcastToFarm(farmId, 'farm:status', statusPayload);

      // Also emit more specific event for UI state machines
      if (status === 'completed') {
        websocketManager.broadcast('farm:completed', statusPayload);
        websocketManager.broadcastToFarm(farmId, 'farm:completed', statusPayload);
      } else if (status === 'failed') {
        websocketManager.broadcast('farm:failed', statusPayload);
        websocketManager.broadcastToFarm(farmId, 'farm:failed', statusPayload);
      }

      logger.info(`[ShutdownCoordinator] Broadcast farm:status event for ${farmId} -> ${status}`);

      // Record farmer template statistics if farm was created from a template
      try {
        const farmResult = await db.query(
          'SELECT farmer_template_id, created_at FROM farms WHERE id = $1',
          [farmId]
        );
        const farmData = farmResult.rows[0];

        if (farmData?.farmer_template_id) {
          const completionTimeSeconds = farmData.created_at
            ? Math.floor((Date.now() - new Date(farmData.created_at).getTime()) / 1000)
            : undefined;

          await farmerGroupService.recordFarmCompletion(
            farmData.farmer_template_id,
            status === 'completed',
            completionTimeSeconds
          );
          logger.info(`[ShutdownCoordinator] Recorded farmer stats for template ${farmData.farmer_template_id}`);
        }
      } catch (statsError) {
        // Don't fail shutdown if stats recording fails
        logger.warn(`[ShutdownCoordinator] Failed to record farmer stats:`, statsError);
      }
    } catch (error) {
      logger.error(`[ShutdownCoordinator] Failed to update status:`, error);
    }
  }

  /**
   * Clean up resources after shutdown
   */
  private async cleanupResources(farmId: string, mode: ShutdownMode): Promise<void> {
    try {
      // Clean up farm resources
      const sessionName = `farm-${farmId.substring(0, 8)}`;

      // Clean up activity parser session data
      try {
        activityParser.cleanupSession(sessionName);
        logger.info(`[ShutdownCoordinator] Cleaned up activity parser for session ${sessionName}`);
      } catch (error) {
        logger.warn(`[ShutdownCoordinator] Failed to cleanup activity parser:`, error);
      }

      // Clean up yield detection service data
      try {
        yieldDetectionService.cleanupFarm(farmId);
        logger.info(`[ShutdownCoordinator] Cleaned up yield detection for farm ${farmId}`);
      } catch (error) {
        logger.warn(`[ShutdownCoordinator] Failed to cleanup yield detection:`, error);
      }

      // TODO: Unregister farm from active farms when agentCleanupService has the method
      // try {
      //   const { agentCleanupService } = await import('./agentCleanupService');
      //   agentCleanupService.unregisterFarm(farmId);
      //   logger.info(`[ShutdownCoordinator] Unregistered farm ${farmId} from active farms`);
      // } catch (error) {
      //   logger.warn(`[ShutdownCoordinator] Failed to unregister farm ${farmId}:`, error);
      // }

      // Stop terminal streaming using the unified terminal service
      try {
        const { terminalService } = await import('./unified/terminalService');
        await terminalService.stopStreaming(sessionName);
        logger.info(`[ShutdownCoordinator] Stopped terminal streaming for ${sessionName}`);
      } catch (error) {
        logger.warn(`[ShutdownCoordinator] Failed to stop terminal streaming for ${sessionName}:`, error);
      }
      
      // Stop tmux sessions
      const { killTmuxSession } = await import('../utils/tmuxHelpers');
      logger.info(`[ShutdownCoordinator] CRITICAL: Killing tmux session ${sessionName} for farm ${farmId}`);

      await killTmuxSession(sessionName);
      
      // Clean up any remaining timers
      this.cancelShutdown(farmId);

      logger.info('[ShutdownCoordinator] Farm cleanup completed', {
        farmId: farmId.substring(0, 8),
        sessionName,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`[ShutdownCoordinator] Resource cleanup failed for ${farmId}:`, error);
    }
  }

  /**
   * Generate appropriate closing prompt for agents
   */
  private generateClosingPrompt(mode: ShutdownMode, reason: ShutdownReason): string {
    const reasonText = reason === 'timeout' ? 'due to timeout' : 
                      reason === 'user_request' ? 'by user request' : 
                      'upon completion';
    
    return `/system 🌾 HARVEST TIME - The ${mode} session is ending ${reasonText}. 

CRITICAL: If you have opened any files using the Bash(open [file_path]) command during this session, you MUST save them now using the appropriate Write or Edit tools before shutdown completes.

Please provide a summary of your work including:
1. Tasks completed
2. Files created or modified (including any files you opened with Bash(open) that need saving)
3. Key insights or discoveries
4. Any pending work or recommendations

Ensure all your outputs are saved before shutdown completes, especially any files you may have opened for viewing.`;
  }

  /**
   * Get shutdown status for a farm
   */
  getShutdownStatus(farmId: string): {
    scheduled: boolean;
    timeRemaining?: number;
  } {
    const timer = this.activeShutdowns.get(farmId);
    if (!timer) {
      return { scheduled: false };
    }

    // Note: We can't get exact time remaining from setTimeout
    // This would need additional tracking if precise timing is needed
    return { scheduled: true };
  }

  /**
   * Force harvest collection for recovery scenarios
   * PUBLIC METHOD: Used by farmRecoveryService for stuck/orphaned farm recovery
   * This ensures harvest collection goes through the coordinator with proper locking
   */
  async forceCollectHarvest(farmId: string, harvestId?: string): Promise<{
    success: boolean;
    harvestId?: string;
    error?: string;
  }> {
    logger.info(`[ShutdownCoordinator] Force collecting harvest for farm ${farmId}`, { harvestId });

    try {
      // If harvestId provided, use it; otherwise collectFiles will create a recovery harvest
      const result = await this.collectFiles(farmId, 'farm', harvestId);

      if (result.success) {
        // Try to store in barn as well
        const actualHarvestId = harvestId || result.error; // collectFiles may have created a new ID
        if (harvestId) {
          await this.storeInBarn(farmId, 'farm', harvestId);
        }
        return { success: true, harvestId };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[ShutdownCoordinator] Force harvest collection failed for farm ${farmId}:`, error);
      return { success: false, error: errorMessage };
    }
  }
}

export const shutdownCoordinator = new ShutdownCoordinator();
