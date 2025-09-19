import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { logThrottling } from '../utils/logThrottling';
import { db } from '../database/connection';
import { spawn } from 'child_process';
import { websocketManager } from '../websocket/websocketManager';
import { harvestSessionCache } from './harvestSessionCache';
import { terminalOutputWatcher } from './terminalOutputWatcher';
import { tmuxHealthManager } from './tmuxHealthManager';

interface RecoveryTask {
  farmId: string;
  sessionName: string;
  issue: 'stuck_launching' | 'dead_session' | 'unresponsive_agents' | 'no_output';
  attempts: number;
  lastAttempt: Date;
  status: 'pending' | 'recovering' | 'recovered' | 'failed';
  nextRetryAt: Date;
  exponentialBackoffMs: number;
}

interface FarmHealthStatus {
  farmId: string;
  sessionName: string;
  status: 'healthy' | 'degraded' | 'critical' | 'dead';
  responsiveAgents: number;
  totalAgents: number;
  lastCheck: Date;
  issues: string[];
}

/**
 * Automated recovery service for Harvest Terminal issues
 * Handles stuck farms, dead sessions, and unresponsive agents
 */
export class HarvestRecoveryService extends EventEmitter {
  private static instance: HarvestRecoveryService;
  private recoveryQueue: Map<string, RecoveryTask> = new Map();
  private healthStatuses: Map<string, FarmHealthStatus> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MAX_RECOVERY_ATTEMPTS = 2; // Reduced from 3 to 2
  private readonly RECOVERY_RETRY_DELAY = 5000; // 5 seconds base delay
  private readonly STUCK_LAUNCHING_THRESHOLD = 60000; // 60 seconds - give farms more time to launch
  private readonly MONITORING_INTERVAL = 30000; // Increased from 10s to 30s
  private readonly HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
  // Blacklist for permanently dead sessions
  private deadSessionBlacklist: Set<string> = new Set();
  private readonly BLACKLIST_CLEANUP_INTERVAL = 3600000; // 1 hour
  private readonly MAX_BLACKLIST_SIZE = 100;
  
  private constructor() {
    super();
    this.startMonitoring();
    this.setupEventHandlers();
    this.startBlacklistCleanup();
  }
  
  static getInstance(): HarvestRecoveryService {
    if (!HarvestRecoveryService.instance) {
      HarvestRecoveryService.instance = new HarvestRecoveryService();
    }
    return HarvestRecoveryService.instance;
  }
  
  /**
   * Start monitoring all active farms for issues
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllFarms();
    }, this.MONITORING_INTERVAL);
    
    logThrottling.info('harvest-recovery-start', '[HarvestRecovery] Started monitoring service');
  }
  
  /**
   * Setup event handlers for external recovery triggers
   */
  private setupEventHandlers(): void {
    // Listen for orchestrator events
    if (global.orchestratorService) {
      global.orchestratorService.on('farm:stuck', (data: any) => {
        this.queueRecovery(data.farmId, data.sessionName, 'stuck_launching');
      });
    }
    
    // Listen for health manager events
    tmuxHealthManager.on('session:critical', (data: any) => {
      this.queueRecovery(data.farmId, data.sessionName, 'dead_session');
    });
  }
  
  /**
   * Start periodic cleanup of blacklisted sessions
   */
  private startBlacklistCleanup(): void {
    setInterval(() => {
      if (this.deadSessionBlacklist.size > this.MAX_BLACKLIST_SIZE) {
        // Clear oldest entries (simple approach - clear half)
        const toRemove = Array.from(this.deadSessionBlacklist).slice(0, this.deadSessionBlacklist.size / 2);
        toRemove.forEach(sessionName => {
          this.deadSessionBlacklist.delete(sessionName);
        });
        logger.debug(`[HarvestRecovery] Cleaned up ${toRemove.length} blacklisted sessions`);
      }
    }, this.BLACKLIST_CLEANUP_INTERVAL);
  }

  /**
   * Check all active farms for issues
   */
  private async checkAllFarms(): Promise<void> {
    try {
      // Get all active farms from database (excluding quick tasks)
      const result = await db.query(
        `SELECT id, name, status, created_at, config 
         FROM farms 
         WHERE status IN ('launching', 'active', 'running') 
         AND created_at > NOW() - INTERVAL '24 hours'
         AND CAST(id AS TEXT) NOT LIKE 'quick_%'
         AND CAST(id AS TEXT) NOT LIKE 'quicktask%'
         AND CAST(id AS TEXT) NOT LIKE 'qt_%'
         AND LENGTH(CAST(id AS TEXT)) > 20`  // Quick task IDs are typically shorter
      );
      
      for (const farm of result.rows) {
        await this.checkFarmHealth(farm);
      }
    } catch (error) {
      logger.error('[HarvestRecovery] Error checking farms:', error);
    }
  }
  
  /**
   * Check health of a specific farm
   */
  private async checkFarmHealth(farm: any): Promise<void> {
    const farmId = farm.id;
    const sessionName = `farm-${farmId.substring(0, 8)}`;
    // XenoSync now uses the same session naming convention as MaiFarm
    
    // CRITICAL FIX: Skip blacklisted sessions immediately
    if (this.deadSessionBlacklist.has(sessionName)) {
      logThrottling.debug(`blacklist-skip-${sessionName}`, `[HarvestRecovery] Skipping blacklisted session ${sessionName}`);
      return;
    }
    
    // CRITICAL FIX: Skip quick task sessions - they are not farms
    // Quick tasks use various patterns: quick_*, quicktask*, qt_*, etc.
    // Also check metadata for quick task flag
    if (sessionName.startsWith('quick_') || 
        sessionName.startsWith('quicktask') || 
        sessionName.startsWith('qt_') ||
        farmId.startsWith('quick_') ||
        farmId.startsWith('quicktask') ||
        farmId.startsWith('qt_') ||
        farmId.includes('quick') && farmId.length < 20 ||
        farm.metadata?.isQuickTask ||
        farm.name?.includes('Quick Task')) { // Quick task IDs are shorter
      logThrottling.debug(`quick-task-skip-${sessionName}`, `[HarvestRecovery] Skipping quick task session ${sessionName}`);
      return;
    }
    
    try {
      // Check if farm is stuck in launching state
      if (farm.status === 'launching') {
        const launchTime = new Date(farm.created_at).getTime();
        const now = Date.now();
        const launchDuration = now - launchTime;
        
        // Only consider it stuck if it's been launching for too long
        // AND the session doesn't exist or has no panes
        if (launchDuration > this.STUCK_LAUNCHING_THRESHOLD) {
          // Check if tmux session exists
          const sessionExists = await this.checkTmuxSession(sessionName);
          
          if (!sessionExists) {
            logger.warn(`[HarvestRecovery] Farm ${farmId} stuck in launching for ${launchDuration / 1000}s with no session`);
            this.queueRecovery(farmId, sessionName, 'stuck_launching');
            return;
          } else {
            // Session exists, check if it has panes
            const paneCount = await this.getTmuxPaneCount(sessionName);
            if (paneCount === 0) {
              logger.warn(`[HarvestRecovery] Farm ${farmId} stuck in launching for ${launchDuration / 1000}s with empty session`);
              this.queueRecovery(farmId, sessionName, 'stuck_launching');
              return;
            }
            // Session exists with panes, it's probably working fine
            logger.debug(`[HarvestRecovery] Farm ${farmId} still launching but has active session ${sessionName} with ${paneCount} panes`);
          }
        }
      }
      
      // Check if tmux session exists for active/running farms
      let sessionExists = false;
      
      if (farm.status === 'active' || farm.status === 'running') {
        sessionExists = await this.checkTmuxSession(sessionName);
        
        if (!sessionExists) {
          // Double-check the farm status from database in case it was just updated
          const freshResult = await db.query(
            'SELECT status FROM farms WHERE id = $1',
            [farmId]
          );
          
          if (freshResult.rows[0] && 
              (freshResult.rows[0].status === 'completed' || 
               freshResult.rows[0].status === 'failed')) {
            // Farm already completed/failed, no recovery needed
            logger.debug(`[HarvestRecovery] Farm ${farmId} already ${freshResult.rows[0].status}, skipping recovery`);
            return;
          }
          
          logger.warn(`[HarvestRecovery] Session ${sessionName} not found for active farm ${farmId}`);
          this.queueRecovery(farmId, sessionName, 'dead_session');
          return;
        }
      } else {
        // For non-active farms, still check if session exists
        sessionExists = await this.checkTmuxSession(sessionName);
      }
      
      // Check agent responsiveness
      const health = await this.checkSessionHealth(sessionName, farm.config?.maxAgents || 5);
      this.healthStatuses.set(farmId, health);
      
      if (health.status === 'critical' || health.status === 'dead') {
        logger.warn(`[HarvestRecovery] Farm ${farmId} health is ${health.status}`);
        this.queueRecovery(farmId, sessionName, 
          health.status === 'dead' ? 'dead_session' : 'unresponsive_agents'
        );
      } else if (health.status === 'degraded') {
        logger.info(`[HarvestRecovery] Farm ${farmId} is degraded but recoverable`);
        // Attempt light recovery for degraded sessions
        await this.attemptLightRecovery(farmId, sessionName, health);
      }
      
      // Broadcast health status
      this.broadcastHealthStatus(farmId, health);
      
    } catch (error) {
      logger.error(`[HarvestRecovery] Error checking health for farm ${farmId}:`, error);
    }
  }
  
  /**
   * Queue a farm for recovery
   */
  queueRecovery(farmId: string, sessionName: string, issue: RecoveryTask['issue']): void {
    // CRITICAL FIX: Check blacklist first
    if (this.deadSessionBlacklist.has(sessionName)) {
      logger.debug(`[HarvestRecovery] Refusing to queue blacklisted session ${sessionName}`);
      return;
    }
    
    const existing = this.recoveryQueue.get(farmId);
    
    if (existing && existing.status === 'recovering') {
      logger.debug(`[HarvestRecovery] Farm ${farmId} already in recovery`);
      return;
    }
    
    // Calculate exponential backoff
    const baseDelayMs = this.RECOVERY_RETRY_DELAY;
    const attempts = existing?.attempts || 0;
    const exponentialBackoffMs = baseDelayMs * Math.pow(2, attempts); // 5s, 10s, 20s...
    const nextRetryAt = new Date(Date.now() + exponentialBackoffMs);
    
    const task: RecoveryTask = {
      farmId,
      sessionName,
      issue,
      attempts,
      lastAttempt: new Date(),
      status: 'pending',
      nextRetryAt,
      exponentialBackoffMs
    };
    
    this.recoveryQueue.set(farmId, task);
    logThrottling.debug(`recovery-queued-${farmId}`, `[HarvestRecovery] Queued recovery for farm ${farmId}: ${issue} (retry in ${exponentialBackoffMs}ms)`);
    
    // Start recovery process
    this.processRecoveryQueue();
  }
  
  /**
   * Process the recovery queue
   */
  private async processRecoveryQueue(): Promise<void> {
    for (const [farmId, task] of this.recoveryQueue) {
      // CRITICAL FIX: Check if it's time to retry (exponential backoff)
      if (task.status === 'pending' && Date.now() < task.nextRetryAt.getTime()) {
        continue; // Not time to retry yet
      }
      
      if (task.status === 'pending' && task.attempts < this.MAX_RECOVERY_ATTEMPTS) {
        // Check if farm is still in a recoverable state before attempting
        const farmResult = await db.query(
          'SELECT status FROM farms WHERE id = $1',
          [farmId]
        );
        
        if (farmResult.rows[0]) {
          const currentStatus = farmResult.rows[0].status;
          // Only remove from queue if actually completed/failed AND has been that way for a while
          if (currentStatus === 'completed' || currentStatus === 'failed') {
            // Double-check by looking at tmux session
            const sessionExists = await this.checkTmuxSession(task.sessionName);
            if (!sessionExists) {
              logger.info(`[HarvestRecovery] Farm ${farmId} is ${currentStatus} and session doesn't exist, removing from recovery queue`);
              this.recoveryQueue.delete(farmId);
              continue;
            } else {
              logger.warn(`[HarvestRecovery] Farm ${farmId} marked as ${currentStatus} but session still exists, attempting recovery`);
              // Continue with recovery attempt
            }
          }
        }
        
        await this.attemptRecovery(task);
      } else if (task.attempts >= this.MAX_RECOVERY_ATTEMPTS) {
        logger.error(`[HarvestRecovery] Max recovery attempts reached for farm ${farmId} (issue: ${task.issue}), blacklisting session`);
        task.status = 'failed';
        
        // CRITICAL FIX: Add to blacklist to prevent infinite loops
        this.deadSessionBlacklist.add(task.sessionName);
        
        // Mark farm as failed in database
        try {
          await db.query(
            'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status NOT IN ($3, $4)',
            ['failed', farmId, 'completed', 'failed']
          );
          logger.debug(`[HarvestRecovery] Marked farm ${farmId} as failed in database`);
        } catch (dbError) {
          logger.error(`[HarvestRecovery] Failed to update farm status to failed:`, dbError);
        }
        
        this.emit('recovery:failed', { farmId, issue: task.issue });
        // Clean the queue and stop trying
        this.recoveryQueue.delete(farmId);
        
        // Also stop any terminal monitoring for this farm's session
        try {
          const { terminalStreamService } = await import('./terminalStreamService');
          const { terminalOutputWatcher } = await import('./terminalOutputWatcher');
          
          await terminalStreamService.stopStreaming(task.sessionName);
          terminalOutputWatcher.stopWatching(task.sessionName);
          
          // Also try quick task session format
          const quickSessionName = task.sessionName.replace('farm-', 'quick_');
          await terminalStreamService.stopStreaming(quickSessionName);
          terminalOutputWatcher.stopWatching(quickSessionName);
        } catch (cleanupError) {
          logger.debug(`[HarvestRecovery] Error cleaning up monitoring for ${task.sessionName}:`, cleanupError);
        }
      }
    }
  }
  
  /**
   * Attempt to recover a farm
   */
  private async attemptRecovery(task: RecoveryTask): Promise<void> {
    task.status = 'recovering';
    task.attempts++;
    task.lastAttempt = new Date();
    
    // Update next retry time with exponential backoff
    const exponentialBackoffMs = this.RECOVERY_RETRY_DELAY * Math.pow(2, task.attempts);
    task.nextRetryAt = new Date(Date.now() + exponentialBackoffMs);
    task.exponentialBackoffMs = exponentialBackoffMs;
    
    logThrottling.info(`recovery-attempt-${task.farmId}`, `[HarvestRecovery] Attempting recovery for ${task.farmId} (attempt ${task.attempts}): ${task.issue}`);
    
    try {
      let recovered = false;
      
      switch (task.issue) {
        case 'stuck_launching':
          recovered = await this.recoverStuckLaunching(task.farmId, task.sessionName);
          break;
        case 'dead_session':
          recovered = await this.recoverDeadSession(task.farmId, task.sessionName);
          break;
        case 'unresponsive_agents':
          recovered = await this.recoverUnresponsiveAgents(task.farmId, task.sessionName);
          break;
        case 'no_output':
          recovered = await this.recoverNoOutput(task.farmId, task.sessionName);
          break;
      }
      
      if (recovered) {
        task.status = 'recovered';
        logger.info(`[HarvestRecovery] Successfully recovered farm ${task.farmId}`);
        this.emit('recovery:success', { farmId: task.farmId, issue: task.issue });
        
        // Remove from queue after successful recovery
        this.recoveryQueue.delete(task.farmId);
        
        // Invalidate cache to force refresh
        await harvestSessionCache.invalidateSession(task.sessionName);
        
        // Broadcast recovery
        websocketManager.broadcast('farm:recovered', {
          farmId: task.farmId,
          sessionName: task.sessionName,
          issue: task.issue,
          timestamp: new Date()
        });
      } else {
        // If recovery failed and we've hit max attempts, blacklist and remove from queue
        if (task.attempts >= this.MAX_RECOVERY_ATTEMPTS) {
          logger.warn(`[HarvestRecovery] Cannot recover session ${task.sessionName} after ${task.attempts} attempts, blacklisting`);
          task.status = 'failed';
          this.deadSessionBlacklist.add(task.sessionName);
          
          // Mark farm as failed in database
          try {
            await db.query(
              'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status NOT IN ($3, $4)',
              ['failed', task.farmId, 'completed', 'failed']
            );
          } catch (dbError) {
            logger.error(`[HarvestRecovery] Failed to update farm status:`, dbError);
          }
          
          this.recoveryQueue.delete(task.farmId);
          return;
        }
        task.status = 'pending';
        // The exponential backoff delay is already set in nextRetryAt
      }
    } catch (error) {
      logger.error(`[HarvestRecovery] Recovery failed for ${task.farmId}:`, error);
      task.status = 'pending';
    }
  }
  
  /**
   * Recover a farm stuck in launching state
   */
  private async recoverStuckLaunching(farmId: string, sessionName: string): Promise<boolean> {
    try {
      // Check if session actually exists
      const sessionExists = await this.checkTmuxSession(sessionName);
      
      if (sessionExists) {
        // Session exists, just update the status
        logger.info(`[HarvestRecovery] Session ${sessionName} exists, updating farm status`);
        
        // Update database status
        await db.query(
          'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['active', farmId]
        );
        
        // Get pane count
        const paneCount = await this.getTmuxPaneCount(sessionName);
        
        // Start monitoring
        await terminalOutputWatcher.startWatching(sessionName, farmId, paneCount);
        await tmuxHealthManager.startMonitoring(sessionName, paneCount);
        
        // Update cache with the actual session name
        await harvestSessionCache.createSessionEntry(sessionName, {
          farmId,
          paneCount,
          status: 'active',
          createdAt: new Date()
        });
        
        return true;
      } else {
        // Session doesn't exist, mark farm as failed
        logger.warn(`[HarvestRecovery] No session found for stuck farm ${farmId}`);
        
        await db.query(
          'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['failed', farmId]
        );
        
        return false;
      }
    } catch (error) {
      logger.error(`[HarvestRecovery] Error recovering stuck launching farm:`, error);
      return false;
    }
  }
  
  /**
   * Recover a dead tmux session
   */
  private async recoverDeadSession(farmId: string, sessionName: string): Promise<boolean> {
    try {
      // Try to resurrect the session
      logger.info(`[HarvestRecovery] Attempting to resurrect session ${sessionName}`);
      
      // First check if the session actually exists - it might have been temporarily unavailable
      const sessionExists = await this.checkTmuxSession(sessionName);
      if (sessionExists) {
        logger.info(`[HarvestRecovery] Session ${sessionName} exists, false alarm`);
        return true;
      }
      
      // Check if we can access saved session state
      const canRecover = await this.canRecoverSession(sessionName);
      
      if (!canRecover) {
        // Can't recover - but DON'T mark as completed, let the farm timeout naturally
        logger.warn(`[HarvestRecovery] Cannot recover session ${sessionName}, will retry or let timeout handle it`);
        
        // However, if we've tried multiple times, blacklist and remove from queue to prevent infinite loops
        const task = this.recoveryQueue.get(farmId);
        if (task && task.attempts >= this.MAX_RECOVERY_ATTEMPTS) {
          logger.info(`[HarvestRecovery] Blacklisting unrecoverable session ${sessionName} after ${task.attempts} attempts`);
          this.deadSessionBlacklist.add(sessionName);
          this.recoveryQueue.delete(farmId);
          
          // Mark farm as failed
          try {
            await db.query(
              'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status NOT IN ($3, $4)',
              ['failed', farmId, 'completed', 'failed']
            );
          } catch (dbError) {
            logger.error(`[HarvestRecovery] Failed to update farm status:`, dbError);
          }
        }
        
        return false;
      }
      
      // Create new session with same name
      const created = await this.createTmuxSession(sessionName, 5); // Default to 5 agents
      
      if (created) {
        // Update farm status
        await db.query(
          'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['active', farmId]
        );
        
        // Restart monitoring
        await terminalOutputWatcher.startWatching(sessionName, farmId, 5);
        await tmuxHealthManager.startMonitoring(sessionName, 5);
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`[HarvestRecovery] Error recovering dead session:`, error);
      return false;
    }
  }
  
  /**
   * Recover unresponsive agents in a session
   */
  private async recoverUnresponsiveAgents(farmId: string, sessionName: string): Promise<boolean> {
    try {
      const health = this.healthStatuses.get(farmId);
      if (!health) return false;
      
      logger.info(`[HarvestRecovery] Attempting to revive unresponsive agents in ${sessionName}`);
      
      // Send interrupt signal to stuck panes
      for (let i = 0; i < health.totalAgents; i++) {
        await this.sendTmuxCommand(sessionName, i, 'C-c'); // Send Ctrl+C
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.sendTmuxCommand(sessionName, i, 'echo "Agent recovered"');
      }
      
      // Wait and recheck health
      await new Promise(resolve => setTimeout(resolve, 2000));
      const newHealth = await this.checkSessionHealth(sessionName, health.totalAgents);
      
      if (newHealth.status === 'healthy' || newHealth.status === 'degraded') {
        logger.info(`[HarvestRecovery] Successfully revived agents in ${sessionName}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`[HarvestRecovery] Error recovering unresponsive agents:`, error);
      return false;
    }
  }
  
  /**
   * Recover terminal with no output
   */
  private async recoverNoOutput(farmId: string, sessionName: string): Promise<boolean> {
    try {
      logger.info(`[HarvestRecovery] Attempting to restart output capture for ${sessionName}`);
      
      // Stop and restart terminal watcher
      terminalOutputWatcher.stopWatching(sessionName);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const paneCount = await this.getTmuxPaneCount(sessionName);
      await terminalOutputWatcher.startWatching(sessionName, farmId, paneCount);
      
      // Force cache refresh
      await harvestSessionCache.invalidateSession(sessionName);
      
      return true;
    } catch (error) {
      logger.error(`[HarvestRecovery] Error recovering no output:`, error);
      return false;
    }
  }
  
  /**
   * Attempt light recovery for degraded sessions
   */
  private async attemptLightRecovery(farmId: string, sessionName: string, health: FarmHealthStatus): Promise<void> {
    try {
      // Just refresh the terminal watcher
      const paneCount = await this.getTmuxPaneCount(sessionName);
      await terminalOutputWatcher.startWatching(sessionName, farmId, paneCount);
      
      logger.info(`[HarvestRecovery] Light recovery completed for ${farmId}`);
    } catch (error) {
      logger.error(`[HarvestRecovery] Light recovery failed:`, error);
    }
  }
  
  /**
   * Check if a tmux session exists
   */
  private async checkTmuxSession(sessionName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn('tmux', ['has-session', '-t', sessionName]);
      checkProcess.on('exit', (code) => resolve(code === 0));
      setTimeout(() => {
        checkProcess.kill();
        resolve(false);
      }, this.HEALTH_CHECK_TIMEOUT);
    });
  }
  
  /**
   * Get tmux pane count
   */
  private async getTmuxPaneCount(sessionName: string): Promise<number> {
    return new Promise((resolve) => {
      const listPanes = spawn('tmux', ['list-panes', '-t', sessionName, '-F', '#{pane_index}']);
      let output = '';
      
      listPanes.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      listPanes.on('exit', () => {
        const count = output.trim().split('\n').filter(Boolean).length;
        resolve(count || 0);
      });
      
      setTimeout(() => {
        listPanes.kill();
        resolve(0);
      }, this.HEALTH_CHECK_TIMEOUT);
    });
  }
  
  /**
   * Check session health
   */
  private async checkSessionHealth(sessionName: string, expectedAgents: number): Promise<FarmHealthStatus> {
    const farmId = sessionName.replace('farm-', '');
    const issues: string[] = [];
    let responsiveAgents = 0;
    
    try {
      const paneCount = await this.getTmuxPaneCount(sessionName);
      
      if (paneCount === 0) {
        return {
          farmId,
          sessionName,
          status: 'dead',
          responsiveAgents: 0,
          totalAgents: expectedAgents,
          lastCheck: new Date(),
          issues: ['Session not found']
        };
      }
      
      if (paneCount < expectedAgents) {
        issues.push(`Missing agents: expected ${expectedAgents}, found ${paneCount}`);
      }
      
      // Check each pane responsiveness
      for (let i = 0; i < paneCount; i++) {
        const isResponsive = await this.checkPaneResponsive(sessionName, i);
        if (isResponsive) {
          responsiveAgents++;
        } else {
          issues.push(`Pane ${i} unresponsive`);
        }
      }
      
      // Determine health status
      let status: FarmHealthStatus['status'] = 'healthy';
      if (responsiveAgents === 0) {
        status = 'dead';
      } else if (responsiveAgents < paneCount * 0.5) {
        status = 'critical';
      } else if (responsiveAgents < paneCount) {
        status = 'degraded';
      }
      
      return {
        farmId,
        sessionName,
        status,
        responsiveAgents,
        totalAgents: paneCount,
        lastCheck: new Date(),
        issues
      };
    } catch (error) {
      logger.error(`[HarvestRecovery] Error checking session health:`, error);
      return {
        farmId,
        sessionName,
        status: 'critical',
        responsiveAgents: 0,
        totalAgents: expectedAgents,
        lastCheck: new Date(),
        issues: [`Health check failed: ${error.message}`]
      };
    }
  }
  
  /**
   * Check if a pane is responsive
   */
  private async checkPaneResponsive(sessionName: string, paneIndex: number): Promise<boolean> {
    return new Promise((resolve) => {
      const capturePane = spawn('tmux', [
        'capture-pane',
        '-t', `${sessionName}:0.${paneIndex}`,
        '-p',
        '-S', '-10'
      ]);
      
      let output = '';
      capturePane.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      capturePane.on('exit', (code) => {
        // Pane is responsive if we can capture output and it's not empty
        resolve(code === 0 && output.trim().length > 0);
      });
      
      setTimeout(() => {
        capturePane.kill();
        resolve(false);
      }, 2000);
    });
  }
  
  /**
   * Send command to tmux pane
   */
  private async sendTmuxCommand(sessionName: string, paneIndex: number, command: string): Promise<void> {
    return new Promise((resolve) => {
      const sendKeys = spawn('tmux', [
        'send-keys',
        '-t', `${sessionName}:0.${paneIndex}`,
        command,
        'Enter'
      ]);
      
      sendKeys.on('exit', () => resolve());
      setTimeout(() => {
        sendKeys.kill();
        resolve();
      }, 1000);
    });
  }
  
  /**
   * Check if session can be recovered
   */
  private async canRecoverSession(sessionName: string): Promise<boolean> {
    // Check if we have any saved state or artifacts for this session
    // This is a placeholder - implement based on your recovery strategy
    return false;
  }
  
  /**
   * Create a new tmux session
   */
  private async createTmuxSession(sessionName: string, paneCount: number): Promise<boolean> {
    // This is a placeholder - implement based on your session creation strategy
    return false;
  }
  
  /**
   * Broadcast health status
   */
  private broadcastHealthStatus(farmId: string, health: FarmHealthStatus): void {
    websocketManager.broadcast('farm:health', {
      farmId,
      ...health,
      timestamp: new Date()
    });
  }
  
  /**
   * Get current recovery status
   */
  getRecoveryStatus(): Map<string, RecoveryTask> {
    return new Map(this.recoveryQueue);
  }
  
  /**
   * Get health statuses
   */
  getHealthStatuses(): Map<string, FarmHealthStatus> {
    return new Map(this.healthStatuses);
  }
  
  /**
   * Stop the recovery service
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    logThrottling.info('harvest-recovery-stop', '[HarvestRecovery] Stopped recovery service');
  }
}

// Export singleton instance
export const harvestRecoveryService = HarvestRecoveryService.getInstance();