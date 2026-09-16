/**
 * Orphaned Session Recovery Service
 * 
 * Detects and recovers tmux sessions that exist without corresponding database records.
 * This prevents the terminal streaming issue where farms are running but invisible to the frontend.
 * 
 * Features:
 * - Periodic scanning for orphaned tmux sessions
 * - Auto-creates missing database records
 * - Alerts on detected mismatches
 * - Dry-run mode for safety
 * - Comprehensive logging and metrics
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { pathConfig } from '../config/paths';
import { v4 as uuidv4 } from 'uuid';

interface OrphanedSession {
  sessionName: string;
  farmId: string;
  agentCount: number;
  windowName: string;
  terminalFilesExist: boolean;
  createdAt: Date | null;
  panes: PaneInfo[];
}

interface PaneInfo {
  index: number;
  pid: number;
  command: string;
}

interface RecoveryStats {
  totalScans: number;
  orphansDetected: number;
  orphansRecovered: number;
  recoveriesFailed: number;
  lastScanAt: Date | null;
}

export class OrphanedSessionRecoveryService extends EventEmitter {
  private static instance: OrphanedSessionRecoveryService;
  
  private scanInterval?: NodeJS.Timeout;
  private readonly SCAN_INTERVAL = 120000; // 2 minutes
  private readonly tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');
  private readonly terminalsDir = pathConfig.getPath('TERMINALS_DIR');
  
  private stats: RecoveryStats = {
    totalScans: 0,
    orphansDetected: 0,
    orphansRecovered: 0,
    recoveriesFailed: 0,
    lastScanAt: null
  };

  private scanInProgress = false;
  private dryRunMode = false; // Set to true to detect without fixing

  private constructor() {
    super();
    this.startPeriodicScanning();
  }

  static getInstance(): OrphanedSessionRecoveryService {
    if (!OrphanedSessionRecoveryService.instance) {
      OrphanedSessionRecoveryService.instance = new OrphanedSessionRecoveryService();
    }
    return OrphanedSessionRecoveryService.instance;
  }

  /**
   * Start periodic scanning for orphaned sessions
   */
  private startPeriodicScanning(): void {
    this.scanInterval = setInterval(async () => {
      if (!this.scanInProgress) {
        await this.scanAndRecover();
      }
    }, this.SCAN_INTERVAL);

    logger.info(LogCategory.SYSTEM, 
      `Orphaned session recovery service started (interval: ${this.SCAN_INTERVAL / 1000}s)`);
  }

  /**
   * Main scan and recovery workflow
   */
  async scanAndRecover(): Promise<void> {
    if (this.scanInProgress) {
      logger.debug(LogCategory.SYSTEM, 'Scan already in progress, skipping');
      return;
    }

    this.scanInProgress = true;
    this.stats.totalScans++;
    this.stats.lastScanAt = new Date();

    try {
      logger.debug(LogCategory.SYSTEM, 'Starting orphaned session scan');

      // Step 1: Get all active tmux sessions
      const tmuxSessions = await this.getAllTmuxSessions();
      
      if (tmuxSessions.length === 0) {
        logger.debug(LogCategory.SYSTEM, 'No tmux sessions found');
        return;
      }

      logger.debug(LogCategory.SYSTEM, `Found ${tmuxSessions.length} tmux sessions`);

      // Step 2: Check which sessions have database records
      const orphanedSessions = await this.identifyOrphanedSessions(tmuxSessions);

      if (orphanedSessions.length === 0) {
        logger.debug(LogCategory.SYSTEM, 'No orphaned sessions detected');
        return;
      }

      this.stats.orphansDetected += orphanedSessions.length;
      
      logger.warn(LogCategory.SYSTEM, 
        `Detected ${orphanedSessions.length} orphaned sessions: ${orphanedSessions.map(s => s.sessionName).join(', ')}`);

      // Step 3: Attempt recovery for each orphaned session
      for (const orphan of orphanedSessions) {
        try {
          await this.recoverOrphanedSession(orphan);
          this.stats.orphansRecovered++;
        } catch (error) {
          this.stats.recoveriesFailed++;
          logger.error(LogCategory.SYSTEM, 
            `Failed to recover orphaned session ${orphan.sessionName}:`, error);
          
          this.emit('recovery:failed', {
            sessionName: orphan.sessionName,
            farmId: orphan.farmId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Error during orphaned session scan:', error);
    } finally {
      this.scanInProgress = false;
    }
  }

  /**
   * Get all active tmux sessions that look like farm sessions
   */
  private async getAllTmuxSessions(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const cmd = spawn('tmux', ['list-sessions', '-F', '#{session_name}'], {
        env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir }
      });

      let stdout = '';
      let stderr = '';

      cmd.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      cmd.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      cmd.on('close', (code) => {
        if (code === 0) {
          const sessions = stdout
            .split('\n')
            .filter(line => line.trim())
            .filter(name => name.startsWith('farm-') || name.startsWith('quick-') || name.startsWith('gowild-'));
          
          resolve(sessions);
        } else if (stderr.includes('no server running')) {
          // No tmux server running - this is fine
          resolve([]);
        } else {
          reject(new Error(`tmux list-sessions failed (code ${code}): ${stderr}`));
        }
      });

      cmd.on('error', reject);
    });
  }

  /**
   * Identify which tmux sessions don't have database records
   */
  private async identifyOrphanedSessions(sessionNames: string[]): Promise<OrphanedSession[]> {
    const orphaned: OrphanedSession[] = [];

    for (const sessionName of sessionNames) {
      try {
        // Extract farm ID from session name (e.g., "farm-50f5c3ef" -> "50f5c3ef")
        const farmIdShort = sessionName.replace(/^(farm|quick|gowild)-/, '');
        
        // Check if farm exists in database (match on session_name OR id starts with short ID)
        const result = await db.query(`
          SELECT id, name, status, created_at
          FROM farms
          WHERE session_name = $1 
             OR CAST(id AS TEXT) LIKE $2
          LIMIT 1
        `, [sessionName, `${farmIdShort}%`]);

        if (result.rows.length === 0) {
          // No database record found - this is an orphan
          const details = await this.getSessionDetails(sessionName);
          
          if (details) {
            orphaned.push({
              sessionName,
              farmId: farmIdShort,
              agentCount: details.agentCount,
              windowName: details.windowName,
              terminalFilesExist: details.terminalFilesExist,
              createdAt: details.createdAt,
              panes: details.panes
            });

            logger.warn(LogCategory.SYSTEM, 
              `Orphaned session detected: ${sessionName} (${details.agentCount} agents, terminal files: ${details.terminalFilesExist})`);
          }
        }
      } catch (error) {
        logger.error(LogCategory.SYSTEM, 
          `Error checking session ${sessionName}:`, error);
      }
    }

    return orphaned;
  }

  /**
   * Get detailed information about a tmux session
   */
  private async getSessionDetails(sessionName: string): Promise<{
    agentCount: number;
    windowName: string;
    terminalFilesExist: boolean;
    createdAt: Date | null;
    panes: PaneInfo[];
  } | null> {
    try {
      // Get pane information
      const panes = await this.getSessionPanes(sessionName);
      
      // Detect window name (check if 'agents' window exists, else use '0')
      const windowName = await this.detectWindowName(sessionName);
      
      // Check if terminal output files exist
      const farmIdShort = sessionName.replace(/^(farm|quick|gowild)-/, '');
      const terminalFilesExist = await this.checkTerminalFiles(farmIdShort);
      
      // Try to estimate creation time from terminal files
      const createdAt = terminalFilesExist 
        ? await this.getTerminalFileCreationTime(farmIdShort)
        : null;

      return {
        agentCount: panes.length,
        windowName,
        terminalFilesExist,
        createdAt,
        panes
      };
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 
        `Error getting details for session ${sessionName}:`, error);
      return null;
    }
  }

  /**
   * Get pane information from a tmux session
   */
  private async getSessionPanes(sessionName: string): Promise<PaneInfo[]> {
    return new Promise((resolve, reject) => {
      const cmd = spawn('tmux', [
        'list-panes',
        '-t', sessionName,
        '-a',
        '-F', '#{pane_index}|#{pane_pid}|#{pane_current_command}'
      ], {
        env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir }
      });

      let stdout = '';

      cmd.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      cmd.on('close', (code) => {
        if (code === 0) {
          const panes = stdout
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
              const [index, pid, command] = line.split('|');
              return {
                index: parseInt(index, 10),
                pid: parseInt(pid, 10),
                command
              };
            });
          
          resolve(panes);
        } else {
          resolve([]); // No panes found
        }
      });

      cmd.on('error', reject);
    });
  }

  /**
   * Detect window name (agents or 0)
   */
  private async detectWindowName(sessionName: string): Promise<string> {
    return new Promise((resolve) => {
      const cmd = spawn('tmux', [
        'list-windows',
        '-t', sessionName,
        '-F', '#{window_name}'
      ], {
        env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir }
      });

      let stdout = '';

      cmd.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      cmd.on('close', () => {
        const windows = stdout.split('\n').filter(w => w.trim());
        resolve(windows.includes('agents') ? 'agents' : '0');
      });

      cmd.on('error', () => resolve('0'));
    });
  }

  /**
   * Check if terminal output files exist for a farm
   */
  private async checkTerminalFiles(farmIdShort: string): Promise<boolean> {
    try {
      // Try to find terminal directory with matching ID prefix
      const terminalsBase = this.terminalsDir;
      const entries = await fs.readdir(terminalsBase);
      
      const matchingDir = entries.find(entry => entry.startsWith(farmIdShort));
      
      if (!matchingDir) return false;

      const terminalDir = join(terminalsBase, matchingDir);
      const files = await fs.readdir(terminalDir);
      
      return files.some(f => f.startsWith('agent-') && f.endsWith('.log'));
    } catch {
      return false;
    }
  }

  /**
   * Get creation time from terminal files
   */
  private async getTerminalFileCreationTime(farmIdShort: string): Promise<Date | null> {
    try {
      const terminalsBase = this.terminalsDir;
      const entries = await fs.readdir(terminalsBase);
      const matchingDir = entries.find(entry => entry.startsWith(farmIdShort));
      
      if (!matchingDir) return null;

      const terminalDir = join(terminalsBase, matchingDir);
      const files = await fs.readdir(terminalDir);
      const agentFile = files.find(f => f === 'agent-0.log');
      
      if (!agentFile) return null;

      const stats = await fs.stat(join(terminalDir, agentFile));
      return stats.birthtime;
    } catch {
      return null;
    }
  }

  /**
   * Recover an orphaned session by creating database records
   */
  private async recoverOrphanedSession(orphan: OrphanedSession): Promise<void> {
    if (this.dryRunMode) {
      logger.info(LogCategory.SYSTEM, 
        `[DRY RUN] Would recover orphaned session: ${orphan.sessionName}`);
      return;
    }

    logger.info(LogCategory.SYSTEM, 
      `Recovering orphaned session: ${orphan.sessionName} with ${orphan.agentCount} agents`);

    try {
      // Find full farm ID if possible from terminal directory
      const fullFarmId = await this.findFullFarmId(orphan.farmId);

      await db.transaction(async (client) => {
        // Insert farm record
        const farmId = fullFarmId || uuidv4();
        const farmName = `Recovered: ${orphan.sessionName}`;
        
        await client.query(`
          INSERT INTO farms (
            id, name, status, session_name, mode, config, 
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            session_name = EXCLUDED.session_name,
            updated_at = NOW()
        `, [
          farmId,
          farmName,
          'active',
          orphan.sessionName,
          'harvest', // Default to harvest mode
          JSON.stringify({ agentCount: orphan.agentCount, recovered: true }),
          orphan.createdAt || new Date(),
          new Date()
        ]);

        // Insert agent records
        for (let i = 0; i < orphan.agentCount; i++) {
          const agentId = uuidv4();
          const agentName = `Agent ${i}`;
          const agentType = i === 0 ? 'primary' : 'secondary';

          await client.query(`
            INSERT INTO agents (
              id, farm_id, name, type, status, session_name, pane_index,
              created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO NOTHING
          `, [
            agentId,
            farmId,
            agentName,
            agentType,
            'active',
            orphan.sessionName,
            i,
            orphan.createdAt || new Date(),
            new Date()
          ]);
        }

        logger.info(LogCategory.SYSTEM, 
          `Successfully recovered orphaned session ${orphan.sessionName}: created farm ${farmId} with ${orphan.agentCount} agents`);
      });

      // Emit recovery event
      this.emit('recovery:success', {
        sessionName: orphan.sessionName,
        farmId: fullFarmId || orphan.farmId,
        agentCount: orphan.agentCount
      });

    } catch (error) {
      logger.error(LogCategory.SYSTEM, 
        `Failed to recover session ${orphan.sessionName}:`, error);
      throw error;
    }
  }

  /**
   * Find full farm ID from terminal directory name
   */
  private async findFullFarmId(farmIdShort: string): Promise<string | null> {
    try {
      const terminalsBase = this.terminalsDir;
      const entries = await fs.readdir(terminalsBase);
      const matchingDir = entries.find(entry => entry.startsWith(farmIdShort));
      
      // Check if it looks like a full UUID
      if (matchingDir && matchingDir.includes('-') && matchingDir.length > 20) {
        return matchingDir;
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Manually trigger recovery for a specific session
   */
  async recoverSession(sessionName: string): Promise<boolean> {
    try {
      const details = await this.getSessionDetails(sessionName);
      
      if (!details) {
        logger.warn(LogCategory.SYSTEM, `Session ${sessionName} not found or invalid`);
        return false;
      }

      const farmIdShort = sessionName.replace(/^(farm|quick|gowild)-/, '');
      
      const orphan: OrphanedSession = {
        sessionName,
        farmId: farmIdShort,
        agentCount: details.agentCount,
        windowName: details.windowName,
        terminalFilesExist: details.terminalFilesExist,
        createdAt: details.createdAt,
        panes: details.panes
      };

      await this.recoverOrphanedSession(orphan);
      return true;
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Manual recovery failed for ${sessionName}:`, error);
      return false;
    }
  }

  /**
   * Get recovery statistics
   */
  getStats(): RecoveryStats {
    return { ...this.stats };
  }

  /**
   * Enable/disable dry run mode
   */
  setDryRunMode(enabled: boolean): void {
    this.dryRunMode = enabled;
    logger.info(LogCategory.SYSTEM, 
      `Orphaned session recovery dry run mode: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Stop the recovery service
   */
  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }
    logger.info(LogCategory.SYSTEM, 'Orphaned session recovery service stopped');
  }
}

export const orphanedSessionRecoveryService = OrphanedSessionRecoveryService.getInstance();
