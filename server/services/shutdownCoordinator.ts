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
import { HarvestFileCollector } from './harvestFileCollector';
import { websocketManager } from '../websocket/websocketManager';

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
  private harvestCollector: HarvestFileCollector;
  private isShuttingDown: boolean = false;

  constructor() {
    super();
    this.harvestCollector = new HarvestFileCollector();
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
  scheduleShutdown(config: ShutdownConfig): void {
    const { mode, farmId, userId, timeout } = config;
    
    // Clear any existing shutdown for this farm
    this.cancelShutdown(farmId);
    
    // SIMPLIFIED: Calculate when to trigger graceful shutdown (always 30s before timeout)
    let totalTimeoutMs: number;
    let gracefulShutdownTime: number;
    
    if (mode === 'quick-task') {
      // Quick Task always uses fixed 5-minute timeout
      totalTimeoutMs = QUICK_TASK_TIMEOUT;
      gracefulShutdownTime = totalTimeoutMs - GRACEFUL_SHUTDOWN_PERIOD; // 4:30
    } else {
      // Farm and GoWild use configurable timeout from settings
      if (!timeout) {
        logger.error(`[ShutdownCoordinator] No timeout provided for ${mode} mode`);
        return;
      }
      totalTimeoutMs = timeout * 1000; // Convert seconds to ms
      gracefulShutdownTime = totalTimeoutMs - GRACEFUL_SHUTDOWN_PERIOD; // Always 30s before
    }
    
    logger.info(`[ShutdownCoordinator] Scheduling ${mode} shutdown for ${farmId}:`, {
      totalTimeout: `${totalTimeoutMs / 1000}s`,
      gracefulShutdownAt: `${gracefulShutdownTime / 1000}s`,
      gracePeriod: `${(totalTimeoutMs - gracefulShutdownTime) / 1000}s`
    });
    
    // Set timer for graceful shutdown (30s before timeout)
    const shutdownTimer = setTimeout(async () => {
      logger.info(`[ShutdownCoordinator] Initiating graceful shutdown for ${farmId} (${mode})`);
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
    const { mode, farmId, userId, reason, harvestId, agentIds } = config;
    
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
        await this.sendClosingPrompts(farmId, mode, reason, agentIds);
        
        // Wait for agents to process closing prompt
        await new Promise(resolve => setTimeout(resolve, AGENT_CLOSING_PROMPT_TIMEOUT));
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
   * Send closing prompts to agents
   */
  private async sendClosingPrompts(
    farmId: string, 
    mode: ShutdownMode, 
    reason: ShutdownReason,
    agentIds?: string[]
  ): Promise<void> {
    const closingPrompt = this.generateClosingPrompt(mode, reason);
    
    try {
      // Import services dynamically to avoid circular dependencies
      const { orchestratorService } = await import('./orchestratorService');
      
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
      logger.error(`[ShutdownCoordinator] Failed to send closing prompts:`, error);
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
      const collectionPromise = this.harvestCollector.collectHarvestFiles(
        harvestId,
        farmId,
        `${mode} Farm`,
        [] // Agent IDs will be determined internally
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
      
      const { barnService } = await import('./barnService');
      
      // Skip barn storage for timeout shutdowns - these are handled in farmManager
      // We don't want to store empty graceful shutdown items
      console.log(`[ShutdownCoordinator] Skipping barn storage for ${mode} harvest ${harvestId} - handled by mode-specific service`);
      
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
      
      const status = reason === 'timeout' ? 'timeout' : 
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
      // Stop tmux sessions
      const { TmuxHelper } = await import('./tmuxHelper');
      await TmuxHelper.stopSession(farmId);
      
      // Clean up any remaining timers
      this.cancelShutdown(farmId);
      
      logger.info(`[ShutdownCoordinator] Cleaned up resources for ${farmId}`);
    } catch (error) {
      logger.error(`[ShutdownCoordinator] Resource cleanup failed:`, error);
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