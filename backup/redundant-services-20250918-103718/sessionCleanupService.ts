/**
 * Session Cleanup Service
 * Detects and cleans up orphaned tmux sessions
 */

import { spawn } from 'child_process';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { getTmuxSessionName, getFarmIdFromSessionName } from '../utils/sessionNaming';

class SessionCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly SESSION_ORPHAN_THRESHOLD = 10 * 60 * 1000; // 10 minutes
  
  /**
   * Start the cleanup service
   */
  start(): void {
    if (this.cleanupInterval) {
      return;
    }
    
    // Run cleanup immediately
    this.cleanupOrphanedSessions();
    
    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupOrphanedSessions();
    }, this.CLEANUP_INTERVAL);
    
    logger.info('[SessionCleanup] Service started');
  }
  
  /**
   * Stop the cleanup service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[SessionCleanup] Service stopped');
    }
  }
  
  /**
   * Get list of all tmux sessions
   */
  private async getTmuxSessions(): Promise<string[]> {
    return new Promise((resolve) => {
      const sessions: string[] = [];
      const listProcess = spawn('tmux', ['list-sessions', '-F', '#{session_name}']);
      
      listProcess.stdout.on('data', (data) => {
        const sessionNames = data.toString().trim().split('\n').filter(Boolean);
        sessions.push(...sessionNames);
      });
      
      listProcess.on('error', (error) => {
        logger.error('[SessionCleanup] Failed to list tmux sessions:', error);
        resolve([]);
      });
      
      listProcess.on('close', () => {
        resolve(sessions);
      });
    });
  }
  
  /**
   * Kill a tmux session
   */
  private async killTmuxSession(sessionName: string): Promise<void> {
    return new Promise((resolve) => {
      const killProcess = spawn('tmux', ['kill-session', '-t', sessionName]);
      
      killProcess.on('error', (error) => {
        logger.error(`[SessionCleanup] Failed to kill session ${sessionName}:`, error);
        resolve();
      });
      
      killProcess.on('close', (code) => {
        if (code === 0) {
          logger.info(`[SessionCleanup] Killed orphaned session: ${sessionName}`);
        }
        resolve();
      });
    });
  }
  
  /**
   * Clean up orphaned sessions
   */
  private async cleanupOrphanedSessions(): Promise<void> {
    try {
      // Get all tmux sessions
      const tmuxSessions = await this.getTmuxSessions();
      
      // Get all active farms from database
      const activeFarmsResult = await db.query(`
        SELECT id, status, tmux_session, updated_at
        FROM farms
        WHERE status IN ('launching', 'running', 'active', 'harvesting')
      `);
      
      const activeFarms = activeFarmsResult.rows;
      const activeFarmIds = new Set(activeFarms.map(f => f.id));
      const activeSessionNames = new Set(activeFarms.map(f => f.tmux_session || getTmuxSessionName(f.id)));
      
      // Check each tmux session
      for (const sessionName of tmuxSessions) {
        // Skip non-farm sessions
        if (!sessionName.startsWith('farm-') && 
            !sessionName.startsWith('quick-') && 
            !sessionName.startsWith('gowild-')) {
          continue;
        }
        
        // Extract farm ID from session name
        const farmId = getFarmIdFromSessionName(sessionName);
        
        if (!farmId) {
          // Can't determine farm ID, check if it matches any active session names
          if (!activeSessionNames.has(sessionName)) {
            logger.warn(`[SessionCleanup] Found orphaned session with unknown format: ${sessionName}`);
            await this.killTmuxSession(sessionName);
          }
          continue;
        }
        
        // Check if farm exists and is active
        if (!activeFarmIds.has(farmId)) {
          // Farm doesn't exist or is not active, check database
          const farmResult = await db.query(
            'SELECT id, status, updated_at FROM farms WHERE id = $1',
            [farmId]
          );
          
          if (farmResult.rows.length === 0) {
            // Farm doesn't exist at all
            logger.warn(`[SessionCleanup] Found session for non-existent farm: ${sessionName}`);
            await this.killTmuxSession(sessionName);
          } else {
            const farm = farmResult.rows[0];
            const lastUpdate = new Date(farm.updated_at).getTime();
            const timeSinceUpdate = Date.now() - lastUpdate;
            
            // If farm is completed/failed and hasn't been updated recently
            if (['completed', 'failed', 'stopped'].includes(farm.status) && 
                timeSinceUpdate > this.SESSION_ORPHAN_THRESHOLD) {
              logger.warn(`[SessionCleanup] Found orphaned session for ${farm.status} farm: ${sessionName}`);
              await this.killTmuxSession(sessionName);
            }
          }
        }
      }
      
      // Also clean up database records for farms that have been stuck in launching state
      const stuckFarmsResult = await db.query(`
        SELECT id, name, status, updated_at
        FROM farms
        WHERE status = 'launching'
        AND updated_at < NOW() - INTERVAL '10 minutes'
      `);
      
      for (const farm of stuckFarmsResult.rows) {
        logger.warn(`[SessionCleanup] Marking stuck farm as failed: ${farm.id} (${farm.name})`);
        await db.query(
          'UPDATE farms SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['failed', farm.id]
        );
        
        // Kill any associated session
        const sessionName = getTmuxSessionName(farm.id);
        const sessions = await this.getTmuxSessions();
        if (sessions.includes(sessionName)) {
          await this.killTmuxSession(sessionName);
        }
      }
      
      logger.debug(`[SessionCleanup] Cleanup completed. Checked ${tmuxSessions.length} sessions`);
      
    } catch (error) {
      logger.error('[SessionCleanup] Error during cleanup:', error);
    }
  }
  
  /**
   * Force cleanup a specific farm's session
   */
  async cleanupFarmSession(farmId: string): Promise<void> {
    const sessionName = getTmuxSessionName(farmId);
    const sessions = await this.getTmuxSessions();
    
    if (sessions.includes(sessionName)) {
      await this.killTmuxSession(sessionName);
    }
    
    // Also check for legacy session names
    const legacyNames = [
      `farm-${farmId.substring(0, 8)}`,
      `farm_${farmId.substring(0, 8)}`,
      `quick_${farmId.replace('quick-task-', '').substring(0, 8)}`
    ];
    
    for (const name of legacyNames) {
      if (sessions.includes(name)) {
        await this.killTmuxSession(name);
      }
    }
  }
}

export const sessionCleanupService = new SessionCleanupService();