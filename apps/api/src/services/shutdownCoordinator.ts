import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
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
  private shutdownLocks: Map<string, Promise<void>> = new Map(); // Mutex for preventing race conditions
  private shutdownInProgress: Set<string> = new Set(); // Track farms currently shutting down

  constructor() {
    super();
    this.setupSignalHandlers();
  }

  /**
   * Setup SIGINT/SIGTERM handlers for graceful shutdown (like orchestrator.py)
   */
  private setupSignalHandlers(): void {
    const handleSignal = (signal: string) => {
      if (this.isShuttingDown) return;
      
      logger.info(`[ShutdownCoordinator] ${signal} received - initiating graceful shutdown`);
      this.isShuttingDown = true;
      
      // Trigger graceful shutdown for all active farms
      this.activeShutdowns.forEach((timer, farmId) => {
        clearTimeout(timer);
        this.executeGracefulShutdown({
          mode: 'farm',
          farmId,
          userId: 'system',
          reason: 'user_request'
        });
      });
    };

    // Handle CTRL+C like orchestrator.py
    process.once('SIGINT', () => handleSignal('SIGINT'));
    process.once('SIGTERM', () => handleSignal('SIGTERM'));
  }

  /**
   * Schedule a graceful shutdown for a farm/task
   * This sets up the timer to trigger shutdown 30s before the ultimate timeout
   */
  async scheduleShutdown(config: ShutdownConfig): Promise<void> {
    const { mode, farmId, userId, timeout } = config;

    // Implement mutex lock to prevent race conditions
    if (this.shutdownLocks.has(farmId)) {
      logger.warn(`[ShutdownCoordinator] Waiting for existing shutdown operation to complete for farm ${farmId}`);
      await this.shutdownLocks.get(farmId);
    }

    // Create a new lock for this operation
    const lockPromise = this._scheduleShutdownWithLock(config);
    this.shutdownLocks.set(farmId, lockPromise);

    try {
      await lockPromise;
    } finally {
      // Clean up the lock after operation completes
      this.shutdownLocks.delete(farmId);
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
      if (!timeout) {
        logger.error(`[ShutdownCoordinator] No timeout provided for ${mode} mode`);
        return;
      }

      // FIXED: Always expect milliseconds from all callers
      // This eliminates ambiguity and prevents timeout bugs
      totalTimeoutMs = timeout;

      // CRITICAL: Cap timeout to prevent 32-bit overflow in setTimeout (max ~24.8 days)
      const MAX_TIMEOUT_MS = 2147483647; // Maximum 32-bit signed integer
      if (totalTimeoutMs > MAX_TIMEOUT_MS) {
        logger.warn(`[ShutdownCoordinator] Timeout ${totalTimeoutMs}ms exceeds maximum, capping to ${MAX_TIMEOUT_MS}ms (${Math.round(MAX_TIMEOUT_MS / 1000 / 60 / 60)} hours)`);
        totalTimeoutMs = MAX_TIMEOUT_MS;
      }

      logger.info(`[ShutdownCoordinator] Timeout set to ${totalTimeoutMs}ms (${Math.round(totalTimeoutMs / 1000)}s) for ${mode} mode`);

      // UPDATED: Start shutdown AT the timeout mark, not 30s before
      gracefulShutdownTime = totalTimeoutMs; // Give agents full time, then shutdown
    }

    // Ensure gracefulShutdownTime is positive
    if (gracefulShutdownTime <= 0) {
      logger.warn(`[ShutdownCoordinator] Graceful shutdown time is non-positive (${gracefulShutdownTime}ms), using minimum delay of 10s`);
      gracefulShutdownTime = 10000; // Use 10 second minimum
    }
    
    // CRITICAL DEBUG: Log exact timer values
    console.log(`\n🔍 SHUTDOWN TIMER DEBUG 🔍`);
    console.log(`Mode: ${mode}`);
    console.log(`Farm ID: ${farmId}`);
    console.log(`Timeout provided: ${timeout} milliseconds`);
    console.log(`Total timeout (ms): ${totalTimeoutMs}ms`);
    console.log(`Graceful shutdown delay (ms): ${gracefulShutdownTime}ms`);
    console.log(`Timer will fire in: ${gracefulShutdownTime / 1000} seconds from now`);
    console.log(`Current time: ${new Date().toISOString()}`);
    console.log(`Timer will fire at: ${new Date(Date.now() + gracefulShutdownTime).toISOString()}\n`);
    
    logger.info(`[ShutdownCoordinator] CRITICAL: Scheduling ${mode} shutdown for ${farmId}:`, {
      totalTimeout: `${totalTimeoutMs / 1000}s`,
      shutdownStartsAt: `${gracefulShutdownTime / 1000}s`,
      gracePeriodAfter: `${GRACEFUL_SHUTDOWN_PERIOD / 1000}s`,
      scheduledAt: new Date().toISOString(),
      farmId: farmId
    });
    
    // CRITICAL: Log that this farm should NOT be cleaned up until timeout
    console.log(`\n🚨 FARM PROTECTION ACTIVATED 🚨`);
    console.log(`Farm ID: ${farmId}`);
    console.log(`Session Name: farm-${farmId.substring(0, 8)}`);
    console.log(`Protected Until: ${new Date(Date.now() + totalTimeoutMs).toISOString()}`);
    console.log(`Graceful Shutdown Starts: ${new Date(Date.now() + gracefulShutdownTime).toISOString()}`);
    console.log(`DO NOT KILL THIS SESSION BEFORE TIMEOUT!\n`);
    
    // Set timer for graceful shutdown (30s before timeout)
    const shutdownTimer = setTimeout(async () => {
      logger.info(`[ShutdownCoordinator] TIMEOUT REACHED: Initiating graceful shutdown for ${farmId} (${mode})`);
      console.log(`\n⏰ TIMEOUT TRIGGERED FOR FARM ${farmId} ⏰`);
      console.log(`Expected timeout time: ${new Date().toISOString()}`);
      console.log(`Mode: ${mode}, Reason: timeout`);
      console.log(`Beginning graceful shutdown process...\n`);
      
      await this.executeGracefulShutdown({
        ...config,
        reason: 'timeout'
      });
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

    // Mark this farm as shutting down
    this.shutdownInProgress.add(farmId);
    const { mode, userId, reason, harvestId, agentIds } = config;
    
    // CRITICAL DEBUG: Log who called this
    console.log(`\n🚨 EXECUTE GRACEFUL SHUTDOWN CALLED 🚨`);
    console.log(`Farm ID: ${farmId}`);
    console.log(`Mode: ${mode}`);
    console.log(`Reason: ${reason}`);
    console.log(`Called at: ${startTime.toISOString()}`);
    console.log(`Stack trace:`);
    console.trace();
    
    logger.info(`[ShutdownCoordinator] Starting graceful shutdown for ${farmId}`, {
      mode,
      reason,
      harvestId
    });
    
    // Cancel any scheduled shutdown since we're doing it now
    this.cancelShutdown(farmId);
    
    const errors: string[] = [];
    let filesCollected = false;
    let barnStored = false;
    
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
        const fileCollection = await this.collectFiles(farmId, harvestId, mode);
        filesCollected = fileCollection.success;
        if (!fileCollection.success) {
          errors.push(`File collection failed: ${fileCollection.error}`);
        }
      } catch (error) {
        logger.error(`[ShutdownCoordinator] File collection failed for ${farmId}:`, error);
        errors.push(`File collection error: ${error}`);
      }
      
      // Step 4: Store in Barn
      try {
        const barnResult = await this.storeInBarn(farmId, harvestId, mode);
        barnStored = barnResult.success;
        if (!barnResult.success) {
          errors.push(`Barn storage failed: ${barnResult.error}`);
        }
      } catch (error) {
        logger.error(`[ShutdownCoordinator] Barn storage failed for ${farmId}:`, error);
        errors.push(`Barn storage error: ${error}`);
      }
      
      // Step 5: Update farm/task status
      await this.updateStatus(farmId, mode, reason);
      
      // Step 6: Clean up resources
      await this.cleanupResources(farmId, mode);
      
    } catch (error) {
      logger.error(`[ShutdownCoordinator] Shutdown failed for ${farmId}:`, error);
      errors.push(`General shutdown error: ${error}`);
    }
    
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    
    // Emit completion event
    const result: ShutdownResult = {
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
      barnStored
    });

    // Clean up shutdown tracking to allow future shutdowns
    this.shutdownInProgress.delete(farmId);

    return result;
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
   * Check if shutdown is scheduled for a farm
   */
  isShutdownScheduled(farmId: string): boolean {
    return this.activeShutdowns.has(farmId);
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
   * Collect files from agents
   */
  private async collectFiles(
    farmId: string, 
    harvestId?: string,
    mode: ShutdownMode
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!harvestId) {
        logger.warn(`[ShutdownCoordinator] No harvestId for ${farmId}, skipping file collection`);
        return { success: false, error: 'No harvest ID provided' };
      }
      
      // Use timeout for file collection
      const collectionPromise = harvestService.collectFiles(
        farmId,
        harvestId
      );
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('File collection timeout')), FILE_COLLECTION_TIMEOUT);
      });
      
      await Promise.race([collectionPromise, timeoutPromise]);
      
      return { success: true };
    } catch (error) {
      logger.error(`[ShutdownCoordinator] File collection failed:`, error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Store collected files in Barn
   */
  private async storeInBarn(
    farmId: string,
    harvestId?: string,
    mode: ShutdownMode
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!harvestId) {
        return { success: false, error: 'No harvest ID for barn storage' };
      }

      const { barnService } = await import('./unified/barnService');

      const harvest = harvestService.getHarvestById(harvestId);
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
      
      await db.query(
        'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [status, farmId]
      );
      
      logger.info(`[ShutdownCoordinator] Updated ${farmId} status to ${status}`);
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
      
      console.log(`\n✅ FARM CLEANUP COMPLETED ✅`);
      console.log(`Farm ID: ${farmId}`);
      console.log(`Session: ${sessionName} killed`);
      console.log(`Cleanup time: ${new Date().toISOString()}\n`);
      
      logger.info(`[ShutdownCoordinator] Successfully cleaned up resources for ${farmId}`);
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
}

export const shutdownCoordinator = new ShutdownCoordinator();
