import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';

const execAsync = promisify(exec);

interface SessionHealth {
  sessionName: string;
  farmId: string;
  exists: boolean;
  paneCount: number;
  expectedPaneCount: number;
  lastCheck: Date;
  pid?: number;
  windowName?: string;
}

interface FarmSession {
  farmId: string;
  sessionName: string;
  expectedAgents: number;
  lastHealthCheck: Date | null;
  crashCount: number;
}

/**
 * TmuxHealthMonitor - Monitors tmux session health and detects crashes
 * Ensures database state matches actual tmux session state
 */
export class TmuxHealthMonitor extends EventEmitter {
  private static instance: TmuxHealthMonitor;
  private monitorInterval: NodeJS.Timeout | null = null;
  private activeFarms: Map<string, FarmSession> = new Map();
  private farmStartupTimes: Map<string, Date> = new Map(); // Track when farms were added
  private consecutiveFailures: Map<string, number> = new Map(); // Track consecutive failures
  private healthCheckInProgress: boolean = false; // Mutex for health checks
  private readonly CHECK_INTERVAL = 60000; // 60 seconds - less aggressive checking
  private readonly STARTUP_DELAY = 10000; // 10 seconds startup delay
  private readonly STARTUP_GRACE_PERIOD = 60000; // 60 seconds grace period for new farms
  private readonly MAX_CONSECUTIVE_FAILURES = 5; // Require 5 failures before marking as crashed
  private isMonitoring = false;
  private crashColumnsEnsured = false;

  private constructor() {
    super();
    logger.info('[TmuxHealthMonitor] Health monitoring service initialized');
  }

  static getInstance(): TmuxHealthMonitor {
    if (!TmuxHealthMonitor.instance) {
      TmuxHealthMonitor.instance = new TmuxHealthMonitor();
    }
    return TmuxHealthMonitor.instance;
  }

  /**
   * Start monitoring all active farms
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('[TmuxHealthMonitor] Already monitoring');
      return;
    }

    this.isMonitoring = true;
    logger.info('[TmuxHealthMonitor] Starting health monitoring');

    await this.ensureCrashTrackingColumns();

    // Load active farms from database
    await this.loadActiveFarms();

    // Do initial check after startup delay
    setTimeout(() => {
      this.performHealthCheck();
    }, this.STARTUP_DELAY);

    // Setup periodic monitoring
    this.monitorInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.CHECK_INTERVAL);
  }

  private async ensureCrashTrackingColumns(): Promise<void> {
    if (this.crashColumnsEnsured) {
      return;
    }

    try {
      await db.query(`
        ALTER TABLE farms
        ADD COLUMN IF NOT EXISTS crash_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_crash_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_recovery_at TIMESTAMP
      `);

      this.crashColumnsEnsured = true;
      logger.info('[TmuxHealthMonitor] Verified crash tracking columns on farms table');
    } catch (error) {
      logger.error('[TmuxHealthMonitor] Failed to ensure crash tracking columns:', error);
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    logger.info('[TmuxHealthMonitor] Stopped health monitoring');
  }

  /**
   * Load active farms from database
   */
  private async loadActiveFarms(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT 
          id as farm_id,
          tmux_session as session_name,
          (config->>'numberOfAgents')::int as expected_agents,
          last_health_check,
          COALESCE(crash_count, 0) as crash_count
        FROM farms
        WHERE status IN ('active', 'running', 'launching')
          AND tmux_session IS NOT NULL
      `);

      this.activeFarms.clear();
      
      for (const row of result.rows) {
        this.activeFarms.set(row.farm_id, {
          farmId: row.farm_id,
          sessionName: row.session_name,
          expectedAgents: row.expected_agents || 1,
          lastHealthCheck: row.last_health_check,
          crashCount: row.crash_count
        });
      }

      logger.info(`[TmuxHealthMonitor] Loaded ${this.activeFarms.size} active farms for monitoring`);
    } catch (error) {
      logger.error('[TmuxHealthMonitor] Failed to load active farms:', error);
    }
  }

  /**
   * Add a farm to monitoring
   */
  addFarm(farmId: string, sessionName: string, expectedAgents: number = 1): void {
    this.activeFarms.set(farmId, {
      farmId,
      sessionName,
      expectedAgents,
      lastHealthCheck: null,
      crashCount: 0
    });
    
    // Track startup time for grace period
    this.farmStartupTimes.set(farmId, new Date());
    this.consecutiveFailures.set(farmId, 0);

    logger.info(`[TmuxHealthMonitor] Added farm ${farmId} (session: ${sessionName}) to monitoring with ${this.STARTUP_GRACE_PERIOD/1000}s grace period`);
  }

  /**
   * Remove a farm from monitoring
   */
  removeFarm(farmId: string): void {
    this.activeFarms.delete(farmId);
    logger.info(`[TmuxHealthMonitor] Removed farm ${farmId} from monitoring`);
  }

  /**
   * Perform health check on all monitored farms
   */
  private async performHealthCheck(): Promise<void> {
    if (this.activeFarms.size === 0) {
      return;
    }
    
    // Prevent concurrent health checks
    if (this.healthCheckInProgress) {
      logger.debug('[TmuxHealthMonitor] Health check already in progress, skipping');
      return;
    }
    
    this.healthCheckInProgress = true;

    try {
      logger.debug(`[TmuxHealthMonitor] Performing health check on ${this.activeFarms.size} farms`);

      // Get all tmux sessions
      const existingSessions = await this.getTmuxSessions();
      
      // Check each farm
      for (const [farmId, farm] of this.activeFarms) {
        const health = await this.checkSessionHealth(farm, existingSessions);
        
        // Update last health check time
        await this.updateHealthCheckTime(farmId);
        
        // Handle unhealthy sessions
        if (!health.exists) {
          await this.handleDeadSession(farm, health);
        } else if (health.paneCount < health.expectedPaneCount) {
          await this.handlePartialFailure(farm, health);
        } else {
          // Session is healthy
          await this.handleHealthySession(farm, health);
        }
      }
    } finally {
      this.healthCheckInProgress = false;
    }
  }

  /**
   * Check health of a specific session
   */
  private async checkSessionHealth(
    farm: FarmSession,
    existingSessions: Map<string, any>
  ): Promise<SessionHealth> {
    // Try both full session name and shortened version
    let sessionData = existingSessions.get(farm.sessionName);

    // If not found, try with shortened farm ID (first 8 chars)
    if (!sessionData && farm.sessionName.includes('-')) {
      const parts = farm.sessionName.split('-');
      if (parts.length >= 2 && parts[1].length > 8) {
        const shortSessionName = `${parts[0]}-${parts[1].substring(0, 8)}`;
        sessionData = existingSessions.get(shortSessionName);
        if (sessionData) {
          logger.debug(`[TmuxHealthMonitor] Found session with shortened name: ${shortSessionName} for farm ${farm.farmId}`);
        }
      }
    }

    if (!sessionData) {
      // Session doesn't exist
      return {
        sessionName: farm.sessionName,
        farmId: farm.farmId,
        exists: false,
        paneCount: 0,
        expectedPaneCount: farm.expectedAgents,
        lastCheck: new Date()
      };
    }

    // Get pane count - use the actual session name that was found
    const actualSessionName = sessionData ?
      (farm.sessionName.includes('-') && farm.sessionName.split('-')[1].length > 8 ?
        `${farm.sessionName.split('-')[0]}-${farm.sessionName.split('-')[1].substring(0, 8)}` :
        farm.sessionName) :
      farm.sessionName;
    const paneCount = await this.getSessionPaneCount(actualSessionName);

    return {
      sessionName: farm.sessionName,
      farmId: farm.farmId,
      exists: true,
      paneCount,
      expectedPaneCount: farm.expectedAgents,
      lastCheck: new Date(),
      pid: sessionData.pid,
      windowName: sessionData.window_name
    };
  }

  /**
   * Get all tmux sessions
   */
  private async getTmuxSessions(): Promise<Map<string, any>> {
    const sessions = new Map();
    
    try {
      const { stdout } = await execAsync(
        'TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}:#{session_id}:#{session_windows}:#{session_created}" 2>/dev/null || echo ""'
      );
      
      if (stdout.trim()) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const [name, id, windows, created] = line.split(':');
          sessions.set(name, { 
            id, 
            windows: parseInt(windows), 
            created: new Date(parseInt(created) * 1000) 
          });
        }
      }
    } catch (error) {
      logger.debug('[TmuxHealthMonitor] No tmux sessions found or tmux not available');
    }
    
    return sessions;
  }

  /**
   * Get pane count for a session
   */
  private async getSessionPaneCount(sessionName: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-panes -t "${sessionName}:0" -F "#{pane_index}" 2>/dev/null | wc -l`
      );
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check if a farm is still in grace period
   */
  private isInGracePeriod(farmId: string): boolean {
    const startupTime = this.farmStartupTimes.get(farmId);
    if (!startupTime) {
      return false;
    }

    const elapsed = Date.now() - startupTime.getTime();
    return elapsed < this.STARTUP_GRACE_PERIOD;
  }

  /**
   * Handle a dead session
   */
  private async handleDeadSession(farm: FarmSession, health: SessionHealth): Promise<void> {
    // Check if farm is still in grace period
    if (this.isInGracePeriod(farm.farmId)) {
      logger.info(`[TmuxHealthMonitor] Farm ${farm.farmId} session not found but still in grace period (${this.STARTUP_GRACE_PERIOD/1000}s)`);
      return;
    }

    // Track consecutive failures
    const failures = (this.consecutiveFailures.get(farm.farmId) || 0) + 1;
    this.consecutiveFailures.set(farm.farmId, failures);

    // Only mark as crashed after MAX_CONSECUTIVE_FAILURES
    if (failures < this.MAX_CONSECUTIVE_FAILURES) {
      logger.warn(`[TmuxHealthMonitor] Session ${farm.sessionName} for farm ${farm.farmId} not found (failure ${failures}/${this.MAX_CONSECUTIVE_FAILURES})`);
      return;
    }

    logger.error(`[TmuxHealthMonitor] CRITICAL: Session ${farm.sessionName} for farm ${farm.farmId} is DEAD after ${failures} consecutive failures`);

    // Update farm status to crashed
    try {
      await this.ensureCrashTrackingColumns();

      try {
        await db.query(`
          UPDATE farms 
          SET 
            status = 'crashed',
            crash_count = COALESCE(crash_count, 0) + 1,
            last_crash_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `, [farm.farmId]);
      } catch (error: any) {
        if (error?.code === '23514' || `${error?.message}`.includes('farms_status_check')) {
          logger.warn('[TmuxHealthMonitor] Unable to set status="crashed" due to constraint; falling back to status="failed"');
          await db.query(`
            UPDATE farms 
            SET 
              status = 'failed',
              crash_count = COALESCE(crash_count, 0) + 1,
              last_crash_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
          `, [farm.farmId]);
        } else {
          throw error;
        }
      }
      
      // Emit crash event
      this.emit('session:crashed', {
        farmId: farm.farmId,
        sessionName: farm.sessionName,
        crashCount: farm.crashCount + 1,
        timestamp: new Date()
      });
      
      // Broadcast WebSocket event
      websocketManager.broadcast('farm:crashed', {
        farmId: farm.farmId,
        sessionName: farm.sessionName,
        message: 'Tmux session has crashed',
        timestamp: new Date()
      });
      
      // Remove from active monitoring
      this.activeFarms.delete(farm.farmId);
      
      logger.info(`[TmuxHealthMonitor] Farm ${farm.farmId} marked as crashed`);
    } catch (error) {
      logger.error(`[TmuxHealthMonitor] Failed to update crashed farm ${farm.farmId}:`, error);
    }
  }

  /**
   * Handle partial failure (some panes missing)
   */
  private async handlePartialFailure(farm: FarmSession, health: SessionHealth): Promise<void> {
    logger.warn(
      `[TmuxHealthMonitor] Partial failure: Farm ${farm.farmId} has ${health.paneCount}/${health.expectedPaneCount} panes`
    );
    
    // Emit warning event
    this.emit('session:degraded', {
      farmId: farm.farmId,
      sessionName: farm.sessionName,
      paneCount: health.paneCount,
      expectedPaneCount: health.expectedPaneCount,
      timestamp: new Date()
    });
    
    // Broadcast WebSocket warning
    websocketManager.broadcast('farm:health:warning', {
      farmId: farm.farmId,
      sessionName: farm.sessionName,
      message: `Only ${health.paneCount} of ${health.expectedPaneCount} agents are running`,
      severity: 'warning',
      timestamp: new Date()
    });
  }

  /**
   * Handle healthy session
   */
  private async handleHealthySession(farm: FarmSession, health: SessionHealth): Promise<void> {
    // Reset consecutive failures on healthy check
    this.consecutiveFailures.set(farm.farmId, 0);

    // CRITICAL: Update heartbeat for healthy sessions to prevent orphaning
    try {
      await db.query(`
        UPDATE farms
        SET last_heartbeat = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND status IN ('active', 'launching', 'running')
      `, [farm.farmId]);

      logger.debug(`[TmuxHealthMonitor] Heartbeat updated for farm ${farm.farmId}`);
    } catch (error) {
      logger.error(`[TmuxHealthMonitor] Failed to update heartbeat for farm ${farm.farmId}:`, error);
    }

    // Emit healthy event periodically (every 10 checks)
    const checkCount = Math.floor((Date.now() - (farm.lastHealthCheck?.getTime() || 0)) / this.CHECK_INTERVAL);
    if (checkCount % 10 === 0) {
      logger.debug(`[TmuxHealthMonitor] Farm ${farm.farmId} is healthy`);

      this.emit('session:healthy', {
        farmId: farm.farmId,
        sessionName: farm.sessionName,
        paneCount: health.paneCount,
        timestamp: new Date()
      });
    }
  }

  /**
   * Update last health check time
   */
  private async updateHealthCheckTime(farmId: string): Promise<void> {
    try {
      await db.query(`
        UPDATE farms 
        SET last_health_check = NOW() 
        WHERE id = $1
      `, [farmId]);
      
      const farm = this.activeFarms.get(farmId);
      if (farm) {
        farm.lastHealthCheck = new Date();
      }
    } catch (error) {
      logger.error(`[TmuxHealthMonitor] Failed to update health check time for ${farmId}:`, error);
    }
  }

  /**
   * Manually trigger a health check
   */
  async checkFarmHealth(farmId: string): Promise<SessionHealth | null> {
    const farm = this.activeFarms.get(farmId);
    if (!farm) {
      logger.warn(`[TmuxHealthMonitor] Farm ${farmId} not found in monitoring`);
      return null;
    }

    const existingSessions = await this.getTmuxSessions();
    return await this.checkSessionHealth(farm, existingSessions);
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isMonitoring: boolean;
    farmsMonitored: number;
    checkInterval: number;
    farms: Array<{ farmId: string; sessionName: string; lastCheck: Date | null }>;
  } {
    return {
      isMonitoring: this.isMonitoring,
      farmsMonitored: this.activeFarms.size,
      checkInterval: this.CHECK_INTERVAL,
      farms: Array.from(this.activeFarms.values()).map(f => ({
        farmId: f.farmId,
        sessionName: f.sessionName,
        lastCheck: f.lastHealthCheck
      }))
    };
  }
}

// Export singleton instance
export const tmuxHealthMonitor = TmuxHealthMonitor.getInstance();
