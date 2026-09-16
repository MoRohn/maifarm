/**
 * System Health API - Database/Tmux Synchronization Monitoring
 *
 * Provides endpoints for checking system-wide health including:
 * - Tmux session / Database synchronization
 * - Orphaned sessions detection
 * - Zombie farms detection
 * - Overall system consistency
 */

import { Router } from 'express';
import { spawn } from 'child_process';
import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { verifyToken, requirePermission, Permission } from '../middleware/enhancedRBAC';

const router = Router();
const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

// Apply authentication to all system health routes
router.use(verifyToken);

interface TmuxSession {
  sessionName: string;
  farmId: string;
  paneCount: number;
  created: Date;
}

interface DatabaseFarm {
  id: string;
  sessionName: string;
  status: string;
  agentCount: number;
  createdAt: Date;
}

interface OrphanedSession {
  sessionName: string;
  farmId: string;
  paneCount: number;
  hasDatabase: boolean;
  sessionAge: number; // seconds
}

interface ZombieFarm {
  farmId: string;
  sessionName: string;
  status: string;
  hasTmux: boolean;
  farmAge: number; // seconds
}

interface SyncHealthResponse {
  timestamp: Date;
  inSync: boolean;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  summary: {
    totalTmuxSessions: number;
    totalDatabaseFarms: number;
    orphanedSessions: number;
    zombieFarms: number;
    syncedPairs: number;
  };
  orphaned: OrphanedSession[];
  zombies: ZombieFarm[];
  details: {
    tmuxSessions: TmuxSession[];
    databaseFarms: DatabaseFarm[];
  };
}

/**
 * List all active tmux sessions with farm prefix
 */
async function listTmuxSessions(): Promise<TmuxSession[]> {
  return new Promise((resolve) => {
    const proc = spawn('tmux', ['list-sessions', '-F', '#{session_name}:#{session_created}:#{session_windows}'], {
      env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
    });

    let output = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        if (stderr.includes('no server running')) {
          logger.debug(LogCategory.SYSTEM, 'No tmux server running');
          resolve([]);
        } else {
          logger.warn(LogCategory.SYSTEM, `tmux list-sessions failed with code ${code}: ${stderr}`);
          resolve([]);
        }
        return;
      }

      const sessions: TmuxSession[] = [];
      const lines = output.trim().split('\n');

      for (const line of lines) {
        if (!line) continue;

        const [sessionName, createdTimestamp, windowCount] = line.split(':');

        // Only include farm sessions
        if (sessionName.startsWith('farm-')) {
          const farmId = sessionName.replace('farm-', '');

          sessions.push({
            sessionName,
            farmId,
            paneCount: parseInt(windowCount) || 0,
            created: new Date(parseInt(createdTimestamp) * 1000)
          });
        }
      }

      resolve(sessions);
    });

    proc.on('error', (error) => {
      logger.error(LogCategory.SYSTEM, `Error listing tmux sessions:`, error);
      resolve([]);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      proc.kill('SIGTERM');
      logger.warn(LogCategory.SYSTEM, 'tmux list-sessions timed out');
      resolve([]);
    }, 5000);
  });
}

/**
 * Get all farms from database
 */
async function listDatabaseFarms(): Promise<DatabaseFarm[]> {
  try {
    const result = await db.query(`
      SELECT
        f.id,
        f.session_name,
        f.status,
        f.created_at,
        COUNT(a.id) as agent_count
      FROM farms f
      LEFT JOIN agents a ON f.id = a.farm_id
      WHERE f.status IN ('active', 'launching', 'running')
      GROUP BY f.id, f.session_name, f.status, f.created_at
      ORDER BY f.created_at DESC
    `);

    return result.rows.map(row => ({
      id: row.id,
      sessionName: row.session_name,
      status: row.status,
      agentCount: parseInt(row.agent_count) || 0,
      createdAt: new Date(row.created_at)
    }));
  } catch (error) {
    logger.error(LogCategory.DATABASE, `Error listing database farms:`, error);
    return [];
  }
}

/**
 * Check if a tmux session exists
 */
async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('tmux', ['has-session', '-t', sessionName], {
      env: { ...process.env, TMUX_TMPDIR: tmuxTmpDir }
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });

    setTimeout(() => {
      proc.kill('SIGTERM');
      resolve(false);
    }, 2000);
  });
}

/**
 * GET /api/system-health/sync
 * Check tmux/database synchronization
 */
router.get('/sync', requirePermission(Permission.SYSTEM_MONITOR), async (req, res) => {
  try {
    const timestamp = new Date();

    // Get all tmux sessions and database farms
    const [tmuxSessions, dbFarms] = await Promise.all([
      listTmuxSessions(),
      listDatabaseFarms()
    ]);

    // Find orphaned sessions (tmux exists, DB missing)
    const orphaned: OrphanedSession[] = [];
    for (const session of tmuxSessions) {
      const hasDb = dbFarms.some(farm =>
        farm.sessionName === session.sessionName ||
        farm.id.startsWith(session.farmId)
      );

      if (!hasDb) {
        const ageSeconds = Math.floor((timestamp.getTime() - session.created.getTime()) / 1000);
        orphaned.push({
          sessionName: session.sessionName,
          farmId: session.farmId,
          paneCount: session.paneCount,
          hasDatabase: false,
          sessionAge: ageSeconds
        });
      }
    }

    // Find zombie farms (DB exists, tmux missing)
    const zombies: ZombieFarm[] = [];
    for (const farm of dbFarms) {
      if (!farm.sessionName) continue;

      const hasTmux = tmuxSessions.some(session =>
        session.sessionName === farm.sessionName
      );

      if (!hasTmux) {
        const ageSeconds = Math.floor((timestamp.getTime() - farm.createdAt.getTime()) / 1000);
        zombies.push({
          farmId: farm.id,
          sessionName: farm.sessionName,
          status: farm.status,
          hasTmux: false,
          farmAge: ageSeconds
        });
      }
    }

    // Calculate synced pairs
    const syncedCount = tmuxSessions.filter(session =>
      dbFarms.some(farm => farm.sessionName === session.sessionName)
    ).length;

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (orphaned.length === 0 && zombies.length === 0) {
      overall = 'healthy';
    } else if (orphaned.length + zombies.length <= 2) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    const response: SyncHealthResponse = {
      timestamp,
      inSync: orphaned.length === 0 && zombies.length === 0,
      overall,
      summary: {
        totalTmuxSessions: tmuxSessions.length,
        totalDatabaseFarms: dbFarms.length,
        orphanedSessions: orphaned.length,
        zombieFarms: zombies.length,
        syncedPairs: syncedCount
      },
      orphaned,
      zombies,
      details: {
        tmuxSessions,
        databaseFarms: dbFarms
      }
    };

    // Log warnings for issues
    if (orphaned.length > 0) {
      logger.warn(LogCategory.SYSTEM,
        `Found ${orphaned.length} orphaned tmux sessions: ${orphaned.map(o => o.sessionName).join(', ')}`);
    }

    if (zombies.length > 0) {
      logger.warn(LogCategory.SYSTEM,
        `Found ${zombies.length} zombie farms: ${zombies.map(z => z.farmId).join(', ')}`);
    }

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    logger.error(LogCategory.API, 'Error checking system sync health:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to check system sync health'
      }
    });
  }
});

/**
 * GET /api/system-health/sync/summary
 * Quick sync health summary (no detailed lists)
 */
router.get('/sync/summary', requirePermission(Permission.SYSTEM_MONITOR), async (req, res) => {
  try {
    const [tmuxSessions, dbFarms] = await Promise.all([
      listTmuxSessions(),
      listDatabaseFarms()
    ]);

    // Count orphaned and zombies without building full lists
    let orphanedCount = 0;
    for (const session of tmuxSessions) {
      const hasDb = dbFarms.some(farm =>
        farm.sessionName === session.sessionName ||
        farm.id.startsWith(session.farmId)
      );
      if (!hasDb) orphanedCount++;
    }

    let zombieCount = 0;
    for (const farm of dbFarms) {
      if (!farm.sessionName) continue;
      const hasTmux = tmuxSessions.some(session =>
        session.sessionName === farm.sessionName
      );
      if (!hasTmux) zombieCount++;
    }

    const syncedCount = tmuxSessions.length - orphanedCount;

    res.json({
      success: true,
      data: {
        inSync: orphanedCount === 0 && zombieCount === 0,
        totalTmuxSessions: tmuxSessions.length,
        totalDatabaseFarms: dbFarms.length,
        orphanedSessions: orphanedCount,
        zombieFarms: zombieCount,
        syncedPairs: syncedCount,
        timestamp: new Date()
      }
    });

  } catch (error) {
    logger.error(LogCategory.API, 'Error checking sync summary:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to check sync summary'
      }
    });
  }
});

/**
 * POST /api/system-health/sync/fix
 * Trigger recovery for all orphaned sessions and zombie farms
 */
router.post('/sync/fix', requirePermission(Permission.SYSTEM_ADMIN), async (req, res) => {
  try {
    logger.info(LogCategory.SYSTEM, 'Manual sync fix triggered');

    // Trigger orphaned session recovery
    const { orphanedSessionRecoveryService } = await import('../services/OrphanedSessionRecoveryService');
    const recoveryPromise = orphanedSessionRecoveryService.scanAndRecover();

    // Trigger zombie farm cleanup
    const { zombieFarmCleanupService } = await import('../services/zombieFarmCleanup');
    const cleanupPromise = zombieFarmCleanupService.cleanupSpecificFarm('*'); // Clean all zombies

    // Wait for both operations
    await Promise.all([
      recoveryPromise.catch(err => logger.error(LogCategory.SYSTEM, 'Recovery failed:', err)),
      cleanupPromise.catch(err => logger.error(LogCategory.SYSTEM, 'Cleanup failed:', err))
    ]);

    // Get updated sync status
    const [tmuxSessions, dbFarms] = await Promise.all([
      listTmuxSessions(),
      listDatabaseFarms()
    ]);

    let orphanedCount = 0;
    for (const session of tmuxSessions) {
      const hasDb = dbFarms.some(farm =>
        farm.sessionName === session.sessionName ||
        farm.id.startsWith(session.farmId)
      );
      if (!hasDb) orphanedCount++;
    }

    res.json({
      success: true,
      message: 'Sync fix completed',
      data: {
        remainingOrphans: orphanedCount,
        totalSessions: tmuxSessions.length,
        totalFarms: dbFarms.length
      }
    });

  } catch (error) {
    logger.error(LogCategory.API, 'Error fixing sync issues:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fix sync issues'
      }
    });
  }
});

export default router;
