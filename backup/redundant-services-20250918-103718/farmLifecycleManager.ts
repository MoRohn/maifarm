import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { db } from '../database/connection';
import { getRedisClient, isRedisConnected } from '../database/redis';
import { websocketManager } from '../websocket/websocketManager';
import { agentCleanupService } from './agentCleanupService';
import { farmService as farmManager } from './unified/farmService';
import { workspaceManager } from './workspaceManager';
import { pathConfig } from '../config/paths';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface SessionMetadata {
  sessionName: string;
  farmId: string;
  ownerPid: number;
  instanceId: string;
  createdAt: Date;
  lastHeartbeat: Date;
  agentCount: number;
  status: 'active' | 'paused' | 'orphaned' | 'dead';
  persistInBackground: boolean;
}

interface HeartbeatData {
  farmId: string;
  sessionName: string;
  timestamp: Date;
  agentCount: number;
  status: string;
}

interface ReconciliationResult {
  orphanedSessions: string[];
  restoredFarms: string[];
  killedSessions: string[];
  errors: string[];
}

/**
 * FarmLifecycleManager - Centralized service for managing farm and agent lifecycles
 * Ensures no orphaned sessions persist and maintains consistency between database and tmux
 */
class FarmLifecycleManager extends EventEmitter {
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly HEARTBEAT_TTL = 60; // 60 seconds in Redis
  private readonly ORPHAN_THRESHOLD = 600000; // 10 minutes without heartbeat (was 90 seconds)
  private readonly CLEANUP_INTERVAL = 1800000; // 30 minutes (was 5 minutes)
  private readonly INSTANCE_ID = uuidv4();
  
  private sessions: Map<string, SessionMetadata> = new Map();
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor() {
    super();
    this.setupShutdownHandlers();
  }

  /**
   * Initialize the lifecycle manager
   */
  async initialize(): Promise<void> {
    logger.info('[FarmLifecycleManager] Initializing lifecycle management system');
    
    // Perform startup reconciliation
    await this.reconcileOnStartup();
    
    // Start periodic cleanup
    this.startPeriodicCleanup();
    
    // Subscribe to farm events
    this.subscribeToFarmEvents();
    
    logger.info('[FarmLifecycleManager] Lifecycle manager initialized', {
      instanceId: this.INSTANCE_ID,
      pid: process.pid
    });
  }

  /**
   * Reconcile database state with actual tmux sessions on startup
   */
  private async reconcileOnStartup(): Promise<ReconciliationResult> {
    logger.info('[FarmLifecycleManager] Starting reconciliation process');
    
    const result: ReconciliationResult = {
      orphanedSessions: [],
      restoredFarms: [],
      killedSessions: [],
      errors: []
    };

    try {
      // Get all tmux sessions
      const tmuxSessions = await this.getAllTmuxSessions();
      
      // Get all active farms from database
      const dbFarms = await this.getActiveFarmsFromDB();
      const dbFarmIds = new Set(dbFarms.map(f => f.id));
      const dbSessionNames = new Set(dbFarms.map(f => this.getSessionNameFromFarmId(f.id)));
      
      // Get preserved sessions from database (if method exists)
      let preservedSessions: string[] = [];
      try {
        if (typeof farmManager.getPreservedSessions === 'function') {
          preservedSessions = await farmManager.getPreservedSessions();
        }
      } catch (error) {
        // Method doesn't exist in unified service, use empty array
        preservedSessions = [];
      }
      logger.info('[FarmLifecycleManager] Found preserved sessions:', preservedSessions);
      
      // Check each tmux session
      for (const session of tmuxSessions) {
        const farmId = this.getFarmIdFromSessionName(session);
        
        if (!farmId) {
          // Unrecognized session pattern - kill it
          result.orphanedSessions.push(session);
          await this.killTmuxSession(session, 'Unrecognized session pattern');
          result.killedSessions.push(session);
          continue;
        }
        
        // Check if this session is preserved in database
        const isPreserved = preservedSessions.includes(session) || 
                           await farmManager.isSessionPreserved(session);
        
        if (isPreserved) {
          logger.info(`[FarmLifecycleManager] Preserving session ${session} - marked as preserved in database`);
          await this.registerSession(farmId, session);
          continue;
        }
        
        // Check if farm exists in database
        if (!dbFarmIds.has(farmId)) {
          // Session exists but not in database - could be a new session or orphaned
          
          // Check session age first - give new sessions time to register
          const sessionAge = await this.getSessionAge(session);
          if (sessionAge < 60000) { // Less than 1 minute old
            logger.info('[FarmLifecycleManager] Found new session, giving it time to register', {
              sessionName: session,
              ageMs: sessionAge
            });
            // Register it anyway to track it
            await this.registerSession(farmId, session);
            continue;
          }
          
          // Older session not in database - check if it should be preserved
          const metadata = await this.getSessionMetadata(session);
          
          if (metadata?.persistInBackground) {
            // Try to restore farm in database
            const restored = await this.restoreFarmInDB(farmId, session);
            if (restored) {
              result.restoredFarms.push(farmId);
            } else {
              result.orphanedSessions.push(session);
              await this.killTmuxSession(session, 'Failed to restore farm');
              result.killedSessions.push(session);
            }
          } else {
            // Old non-persistent orphaned session
            result.orphanedSessions.push(session);
            await this.killTmuxSession(session, 'Orphaned non-persistent session');
            result.killedSessions.push(session);
          }
        } else {
          // Session matches database farm - register it
          await this.registerSession(farmId, session);
        }
      }
      
      // Update database farm statuses based on actual sessions
      for (const farm of dbFarms) {
        const sessionName = this.getSessionNameFromFarmId(farm.id);
        const hasSession = tmuxSessions.includes(sessionName);
        
        if (!hasSession && ['active', 'launching', 'running'].includes(farm.status)) {
          // Check farm age before marking as failed - give 5 minute grace period for launching
          const farmAge = Date.now() - new Date(farm.created_at).getTime();
          const gracePeriodMs = 5 * 60 * 1000; // 5 minutes
          
          if (farmAge > gracePeriodMs) {
            // Database shows active but no session exists after grace period
            await this.updateFarmStatus(farm.id, 'failed', 'No tmux session found after grace period');
            logger.info(`[FarmLifecycleManager] Marked farm ${farm.id} as failed - no session after ${Math.round(farmAge / 60000)} minutes`);
          } else {
            logger.info(`[FarmLifecycleManager] Farm ${farm.id} in grace period (${Math.round(farmAge / 1000)}s old) - keeping status ${farm.status}`);
          }
        }
      }
      
      // Clean up orphaned workspaces
      await this.cleanupOrphanedWorkspaces(result.killedSessions);
      
    } catch (error) {
      logger.error('[FarmLifecycleManager] Reconciliation error:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
    
    logger.info('[FarmLifecycleManager] Reconciliation complete', result);
    return result;
  }

  /**
   * Register a new farm session
   */
  async registerSession(farmId: string, sessionName: string, persistInBackground = true): Promise<void> {
    const metadata: SessionMetadata = {
      sessionName,
      farmId,
      ownerPid: process.pid,
      instanceId: this.INSTANCE_ID,
      createdAt: new Date(),
      lastHeartbeat: new Date(),
      agentCount: await this.getSessionPaneCount(sessionName),
      status: 'active',
      persistInBackground
    };
    
    // Store in memory
    this.sessions.set(sessionName, metadata);
    
    // Store in Redis with TTL
    await this.storeHeartbeat(metadata);
    
    // Set tmux environment variables for ownership
    await this.setSessionOwnership(sessionName, metadata);
    
    // Start heartbeat monitoring
    this.startHeartbeat(sessionName);
    
    logger.info('[FarmLifecycleManager] Session registered', {
      farmId,
      sessionName,
      ownerPid: metadata.ownerPid
    });
    
    this.emit('session:registered', { farmId, sessionName });
  }

  /**
   * Start heartbeat monitoring for a session
   */
  private startHeartbeat(sessionName: string): void {
    // Clear any existing timer
    this.stopHeartbeat(sessionName);
    
    const timer = setInterval(async () => {
      const metadata = this.sessions.get(sessionName);
      if (!metadata) {
        this.stopHeartbeat(sessionName);
        return;
      }
      
      // Check if session still exists
      const exists = await this.sessionExists(sessionName);
      if (!exists) {
        logger.warn('[FarmLifecycleManager] Session no longer exists, stopping heartbeat', { sessionName });
        this.unregisterSession(sessionName);
        return;
      }
      
      // Update heartbeat
      metadata.lastHeartbeat = new Date();
      await this.storeHeartbeat(metadata);
      
      // Emit heartbeat event
      this.emit('session:heartbeat', {
        farmId: metadata.farmId,
        sessionName,
        timestamp: metadata.lastHeartbeat
      });
      
    }, this.HEARTBEAT_INTERVAL);
    
    this.heartbeatTimers.set(sessionName, timer);
  }

  /**
   * Stop heartbeat monitoring for a session
   */
  private stopHeartbeat(sessionName: string): void {
    const timer = this.heartbeatTimers.get(sessionName);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(sessionName);
    }
  }

  /**
   * Unregister a session
   */
  async unregisterSession(sessionName: string): Promise<void> {
    const metadata = this.sessions.get(sessionName);
    if (!metadata) return;
    
    // Stop heartbeat
    this.stopHeartbeat(sessionName);
    
    // Remove from memory
    this.sessions.delete(sessionName);
    
    // Remove from Redis
    await this.removeHeartbeat(metadata.farmId);
    
    // Kill session if not persistent and app is shutting down
    if (!metadata.persistInBackground || this.isShuttingDown) {
      await this.killTmuxSession(sessionName, 'Session unregistered');
    }
    
    logger.info('[FarmLifecycleManager] Session unregistered', {
      farmId: metadata.farmId,
      sessionName
    });
    
    this.emit('session:unregistered', { farmId: metadata.farmId, sessionName });
  }

  /**
   * Check for orphaned sessions and clean them up
   */
  private async checkForOrphanedSessions(): Promise<void> {
    const now = Date.now();
    const orphaned: string[] = [];
    
    // Check all registered sessions
    for (const [sessionName, metadata] of this.sessions) {
      const heartbeatAge = now - metadata.lastHeartbeat.getTime();
      
      if (heartbeatAge > this.ORPHAN_THRESHOLD) {
        // Check if owner process is still alive
        const ownerAlive = await this.isProcessAlive(metadata.ownerPid);
        
        if (!ownerAlive) {
          logger.warn('[FarmLifecycleManager] Orphaned session detected', {
            sessionName,
            farmId: metadata.farmId,
            heartbeatAge,
            ownerPid: metadata.ownerPid
          });
          
          orphaned.push(sessionName);
          metadata.status = 'orphaned';
          
          // Emit warning before killing
          this.emit('session:orphaned', {
            farmId: metadata.farmId,
            sessionName,
            willKill: !metadata.persistInBackground
          });
        }
      }
    }
    
    // Clean up orphaned sessions
    for (const sessionName of orphaned) {
      const metadata = this.sessions.get(sessionName);
      if (!metadata) continue;
      
      if (!metadata.persistInBackground) {
        await this.killTmuxSession(sessionName, 'Orphaned session cleanup');
        await this.unregisterSession(sessionName);
      } else {
        // Mark as orphaned but keep running
        await this.updateFarmStatus(metadata.farmId, 'orphaned', 'Owner process dead');
      }
    }
  }

  /**
   * Kill a tmux session
   */
  private async killTmuxSession(sessionName: string, reason: string): Promise<boolean> {
    try {
      logger.info('[FarmLifecycleManager] Killing tmux session', { sessionName, reason });
      
      // Send SIGTERM to all panes first (graceful shutdown)
      await execAsync(`tmux list-panes -t ${sessionName} -F "#{pane_pid}" | xargs -I {} kill -TERM {} 2>/dev/null || true`);
      
      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Kill the session
      await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);
      
      logger.info('[FarmLifecycleManager] Session killed successfully', { sessionName });
      return true;
      
    } catch (error) {
      logger.error('[FarmLifecycleManager] Failed to kill session', { sessionName, error });
      return false;
    }
  }

  /**
   * Get all tmux sessions matching MaiFarm patterns
   */
  private async getAllTmuxSessions(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""');
      if (!stdout.trim()) return [];
      
      const sessions = stdout.trim().split('\n');
      
      // Filter to MaiFarm patterns
      const patterns = ['farm-', 'farm_', 'quick_', 'quick-', 'goWild', 'gowild'];
      return sessions.filter(s => patterns.some(p => s.startsWith(p)));
      
    } catch (error) {
      logger.error('[FarmLifecycleManager] Failed to get tmux sessions:', error);
      return [];
    }
  }

  /**
   * Check if a tmux session exists
   */
  private async sessionExists(sessionName: string): Promise<boolean> {
    try {
      await execAsync(`tmux has-session -t ${sessionName} 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get pane count for a session
   */
  private async getSessionPaneCount(sessionName: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`tmux list-panes -t ${sessionName} | wc -l`);
      return parseInt(stdout.trim()) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Set ownership metadata on tmux session
   */
  private async setSessionOwnership(sessionName: string, metadata: SessionMetadata): Promise<void> {
    try {
      // First check if session exists
      const sessionExists = await this.sessionExists(sessionName);
      if (!sessionExists) {
        logger.warn(`[FarmLifecycleManager] Cannot set ownership on non-existent session: ${sessionName}`);
        return;
      }
      
      // Set environment variables with individual error handling
      const envVars = [
        ['MAIFARM_OWNER_PID', metadata.ownerPid.toString()],
        ['MAIFARM_INSTANCE_ID', metadata.instanceId],
        ['MAIFARM_FARM_ID', metadata.farmId],
        ['MAIFARM_CREATED_AT', metadata.createdAt.toISOString()],
        ['MAIFARM_PERSIST', metadata.persistInBackground.toString()]
      ];
      
      for (const [key, value] of envVars) {
        try {
          await execAsync(`tmux set-environment -t ${sessionName} ${key} ${value}`);
        } catch (error) {
          // Check if session still exists before reporting error
          if (await this.sessionExists(sessionName)) {
            logger.warn(`[FarmLifecycleManager] Failed to set ${key} on session ${sessionName}:`, error.message);
          } else {
            logger.debug(`[FarmLifecycleManager] Session ${sessionName} was killed during ownership setup`);
            return; // Exit early if session was killed
          }
        }
      }
    } catch (error) {
      logger.error('[FarmLifecycleManager] Failed to set session ownership:', {
        sessionName,
        farmId: metadata.farmId,
        error: error.message
      });
    }
  }

  /**
   * Check if tmux session exists
   */
  private async sessionExists(sessionName: string): Promise<boolean> {
    try {
      await execAsync(`tmux has-session -t ${sessionName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get session metadata from tmux environment
   */
  private async getSessionMetadata(sessionName: string): Promise<SessionMetadata | null> {
    try {
      const { stdout } = await execAsync(`tmux show-environment -t ${sessionName} | grep MAIFARM_`);
      const lines = stdout.trim().split('\n');
      const env: Record<string, string> = {};
      
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key && value) {
          env[key] = value;
        }
      }
      
      if (!env.MAIFARM_FARM_ID) return null;
      
      return {
        sessionName,
        farmId: env.MAIFARM_FARM_ID,
        ownerPid: parseInt(env.MAIFARM_OWNER_PID) || 0,
        instanceId: env.MAIFARM_INSTANCE_ID || '',
        createdAt: new Date(env.MAIFARM_CREATED_AT || Date.now()),
        lastHeartbeat: new Date(),
        agentCount: await this.getSessionPaneCount(sessionName),
        status: 'active',
        persistInBackground: env.MAIFARM_PERSIST === 'true'
      };
      
    } catch {
      return null;
    }
  }

  /**
   * Store heartbeat in Redis
   */
  private async storeHeartbeat(metadata: SessionMetadata): Promise<void> {
    const key = `maifarm:heartbeat:${metadata.farmId}`;
    const data: HeartbeatData = {
      farmId: metadata.farmId,
      sessionName: metadata.sessionName,
      timestamp: metadata.lastHeartbeat,
      agentCount: metadata.agentCount,
      status: metadata.status
    };
    
    try {
      const redis = getRedisClient();
      if (redis && isRedisConnected()) {
        await redis.setEx(key, this.HEARTBEAT_TTL, JSON.stringify(data));
      } else {
        // Fallback: Store in memory or database if Redis not available
        logger.debug('[FarmLifecycleManager] Redis not available, heartbeat stored in memory');
      }
    } catch (error) {
      logger.error('[FarmLifecycleManager] Failed to store heartbeat:', error);
    }
  }

  /**
   * Remove heartbeat from Redis
   */
  private async removeHeartbeat(farmId: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (redis && isRedisConnected()) {
        await redis.del(`maifarm:heartbeat:${farmId}`);
      }
    } catch (error) {
      logger.error('[FarmLifecycleManager] Failed to remove heartbeat:', error);
    }
  }

  /**
   * Check if a process is alive
   */
  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get farm ID from session name
   */
  private getFarmIdFromSessionName(sessionName: string): string | null {
    // Handle different patterns: farm-XXXXXXXX, quick_XXXXXXXX, goWild-XXXXXXXX
    const patterns = [
      /^farm[_-]([a-f0-9]{8})/,
      /^quick[_-]([a-f0-9]{8})/,
      /^goWild[_-]([a-f0-9]{8})/
    ];
    
    for (const pattern of patterns) {
      const match = sessionName.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  /**
   * Get session name from farm ID
   */
  private getSessionNameFromFarmId(farmId: string): string {
    // Check if farmId is valid before using substring
    if (!farmId || typeof farmId !== 'string') {
      console.warn('[FarmLifecycleManager] Invalid farmId provided:', farmId);
      return 'farm-unknown';
    }
    // Default to farm-XXXXXXXX pattern
    return `farm-${farmId.substring(0, 8)}`;
  }

  /**
   * Get active farms from database
   */
  private async getActiveFarmsFromDB(): Promise<any[]> {
    try {
      const result = await db.query(
        `SELECT id, name, status, config FROM farms 
         WHERE status IN ('active', 'launching', 'running', 'paused')
         AND deleted_at IS NULL`
      );
      return result.rows;
    } catch (error) {
      logger.error('[FarmLifecycleManager] Failed to get farms from DB:', error);
      return [];
    }
  }

  /**
   * Update farm status in database
   */
  private async updateFarmStatus(farmId: string, status: string, reason?: string): Promise<void> {
    try {
      await db.query(
        `UPDATE farms SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, farmId]
      );
      
      if (reason) {
        logger.info('[FarmLifecycleManager] Farm status updated', { farmId, status, reason });
      }
      
      // Emit status change event
      websocketManager.broadcast('farm:status', { farmId, status, reason });
      
    } catch (error) {
      logger.error('[FarmLifecycleManager] Failed to update farm status:', error);
    }
  }

  /**
   * Get the age of a tmux session in milliseconds
   */
  private async getSessionAge(sessionName: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `tmux list-sessions -F "#{session_name}:#{session_created}" | grep "^${sessionName}:"`
      );
      
      const parts = stdout.trim().split(':');
      if (parts.length > 1) {
        const createdTimestamp = parseInt(parts[1]);
        const nowTimestamp = Math.floor(Date.now() / 1000);
        return (nowTimestamp - createdTimestamp) * 1000;
      }
      
      return 0;
    } catch (error) {
      // Session might not exist
      return 0;
    }
  }

  /**
   * Restore a farm in the database
   */
  private async restoreFarmInDB(farmId: string, sessionName: string): Promise<boolean> {
    try {
      // Check if farm exists but is marked as deleted
      // farmId is just the first 8 chars, need to find matching UUID
      const result = await db.query(
        `UPDATE farms SET deleted_at = NULL, status = 'recovered', updated_at = NOW()
         WHERE CAST(id AS TEXT) LIKE $1 AND deleted_at IS NOT NULL
         RETURNING id`,
        [farmId + '%']
      );
      
      if (result.rows.length > 0) {
        logger.info('[FarmLifecycleManager] Restored deleted farm', { farmId });
        return true;
      }
      
      // Farm doesn't exist at all - cannot restore without more info
      logger.warn('[FarmLifecycleManager] Cannot restore farm - not found in database', { farmId });
      return false;
      
    } catch (error) {
      logger.error('[FarmLifecycleManager] Failed to restore farm:', error);
      return false;
    }
  }

  /**
   * Clean up orphaned workspaces
   */
  private async cleanupOrphanedWorkspaces(sessionNames: string[]): Promise<void> {
    for (const sessionName of sessionNames) {
      const farmId = this.getFarmIdFromSessionName(sessionName);
      if (farmId) {
        try {
          await workspaceManager.archiveWorkspace(farmId);
          logger.info('[FarmLifecycleManager] Archived workspace for orphaned farm', { farmId });
        } catch (error) {
          logger.error('[FarmLifecycleManager] Failed to archive workspace:', { farmId, error });
        }
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.checkForOrphanedSessions().catch(error => {
        logger.error('[FarmLifecycleManager] Periodic cleanup error:', error);
      });
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Subscribe to farm events
   */
  private subscribeToFarmEvents(): void {
    // Listen for farm creation
    farmManager.on('farm:created', ({ farmId }) => {
      logger.info('[FarmLifecycleManager] Farm created event received', { farmId });
    });
    
    // Listen for farm deletion
    farmManager.on('farm:deleted', async ({ farmId }) => {
      const sessionName = this.getSessionNameFromFarmId(farmId);
      await this.unregisterSession(sessionName);
    });
    
    // Listen for farm completion
    farmManager.on('farm:completed', async ({ farmId }) => {
      const sessionName = this.getSessionNameFromFarmId(farmId);
      const metadata = this.sessions.get(sessionName);
      
      if (metadata && !metadata.persistInBackground) {
        // Kill non-persistent farms on completion
        await this.killTmuxSession(sessionName, 'Farm completed - non-persistent');
        await this.unregisterSession(sessionName);
      }
    });

    // Subscribe to TmuxHealthMonitor events
    this.subscribeToHealthMonitorEvents();
  }

  /**
   * Subscribe to health monitor events for crashed sessions
   */
  private subscribeToHealthMonitorEvents(): void {
    // Import health monitor
    import('./tmuxHealthMonitor').then(({ tmuxHealthMonitor }) => {
      // Handle crashed sessions
      tmuxHealthMonitor.on('session:crashed', async ({ farmId, sessionName, crashCount }) => {
        logger.error(`[FarmLifecycleManager] Session crashed detected for farm ${farmId}`, {
          sessionName,
          crashCount
        });
        
        // Unregister the dead session
        await this.unregisterSession(sessionName);
        
        // Clean up any resources
        await this.cleanupCrashedFarm(farmId, sessionName);
        
        // Emit lifecycle event
        this.emit('farm:crashed', { farmId, sessionName, crashCount });
      });

      // Handle degraded sessions
      tmuxHealthMonitor.on('session:degraded', ({ farmId, sessionName, paneCount, expectedPaneCount }) => {
        logger.warn(`[FarmLifecycleManager] Session degraded for farm ${farmId}`, {
          sessionName,
          paneCount,
          expectedPaneCount
        });
        
        // Update farm metadata
        const metadata = this.sessions.get(sessionName);
        if (metadata) {
          metadata.isHealthy = false;
          metadata.degradedAt = new Date();
        }
        
        this.emit('farm:degraded', { farmId, sessionName, paneCount, expectedPaneCount });
      });

      // Handle healthy sessions
      tmuxHealthMonitor.on('session:healthy', ({ farmId, sessionName }) => {
        const metadata = this.sessions.get(sessionName);
        if (metadata && !metadata.isHealthy) {
          metadata.isHealthy = true;
          metadata.degradedAt = undefined;
          logger.info(`[FarmLifecycleManager] Session recovered for farm ${farmId}`, { sessionName });
          this.emit('farm:recovered', { farmId, sessionName });
        }
      });
    }).catch(error => {
      logger.error('[FarmLifecycleManager] Failed to subscribe to health monitor events:', error);
    });
  }

  /**
   * Clean up resources for a crashed farm
   */
  private async cleanupCrashedFarm(farmId: string, sessionName: string): Promise<void> {
    try {
      // Stop any active terminal streaming
      const { terminalStreamService } = await import('./terminalStreamService');
      await terminalStreamService.stopStreaming(sessionName);
      
      // Clean up workspace files if needed
      const cleanupPath = pathConfig.getPath('FARM_WORKSPACE', farmId);
      if (cleanupPath && await fs.promises.access(cleanupPath).then(() => true).catch(() => false)) {
        // Mark workspace as crashed but don't delete (preserve for debugging)
        const crashMarker = path.join(cleanupPath, '.crashed');
        await fs.promises.writeFile(crashMarker, JSON.stringify({
          crashedAt: new Date(),
          sessionName,
          farmId
        }));
      }
      
      logger.info(`[FarmLifecycleManager] Cleaned up crashed farm ${farmId}`);
    } catch (error) {
      logger.error(`[FarmLifecycleManager] Error cleaning up crashed farm ${farmId}:`, error);
    }
  }

  /**
   * Setup shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      
      logger.info(`[FarmLifecycleManager] ${signal} received - cleaning up all sessions`);
      this.isShuttingDown = true;
      
      // Stop periodic cleanup
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }
      
      // Kill all non-persistent sessions
      const killPromises: Promise<void>[] = [];
      
      for (const [sessionName, metadata] of this.sessions) {
        if (!metadata.persistInBackground) {
          killPromises.push(
            this.killTmuxSession(sessionName, 'App shutdown - non-persistent')
              .then(() => this.unregisterSession(sessionName))
          );
        } else {
          // Just unregister persistent sessions
          killPromises.push(this.unregisterSession(sessionName));
        }
      }
      
      await Promise.all(killPromises);
      
      logger.info('[FarmLifecycleManager] Cleanup complete');
      this.emit('shutdown:complete');
    };
    
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * Emergency cleanup - kill all orphaned sessions
   */
  async emergencyCleanup(): Promise<ReconciliationResult> {
    logger.warn('[FarmLifecycleManager] EMERGENCY CLEANUP INITIATED');
    
    const result: ReconciliationResult = {
      orphanedSessions: [],
      restoredFarms: [],
      killedSessions: [],
      errors: []
    };
    
    try {
      // Get all tmux sessions
      const allSessions = await this.getAllTmuxSessions();
      
      // Get active farms from DB
      const dbFarms = await this.getActiveFarmsFromDB();
      const validSessions = new Set(dbFarms.map(f => this.getSessionNameFromFarmId(f.id)));
      
      // Kill everything not in the valid list
      for (const session of allSessions) {
        if (!validSessions.has(session)) {
          result.orphanedSessions.push(session);
          const killed = await this.killTmuxSession(session, 'Emergency cleanup');
          if (killed) {
            result.killedSessions.push(session);
          }
        }
      }
      
      // Clean up workspaces
      await this.cleanupOrphanedWorkspaces(result.killedSessions);
      
    } catch (error) {
      logger.error('[FarmLifecycleManager] Emergency cleanup error:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
    
    logger.warn('[FarmLifecycleManager] Emergency cleanup complete', result);
    return result;
  }
}

// Export singleton instance
export const farmLifecycleManager = new FarmLifecycleManager();