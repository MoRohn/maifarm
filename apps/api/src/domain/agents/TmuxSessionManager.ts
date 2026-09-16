import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import { pathConfig } from '../../config/paths';

interface TmuxSession {
  name: string;
  farmId: string;
  created: Date;
  paneCount: number;
  isActive: boolean;
  lastHealthCheck?: Date;
  process?: ChildProcess;
}

interface SessionCleanupResult {
  sessionName: string;
  success: boolean;
  error?: string;
}

/**
 * Unified Tmux Session Manager - Handles all tmux operations with proper cleanup
 * Fixes orphaned sessions, zombie processes, and resource leaks
 */
export class TmuxSessionManager extends EventEmitter {
  private static instance: TmuxSessionManager;
  private activeSessions: Map<string, TmuxSession> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly SESSION_TIMEOUT = 3600000; // 1 hour
  private readonly MAX_RETRIES = 3;

  private constructor() {
    super();
    this.startHealthMonitoring();
    this.setupShutdownHandlers();
  }

  static getInstance(): TmuxSessionManager {
    if (!TmuxSessionManager.instance) {
      TmuxSessionManager.instance = new TmuxSessionManager();
    }
    return TmuxSessionManager.instance;
  }

  /**
   * Create a new tmux session for a farm
   */
  async createSession(farmId: string, agentCount: number): Promise<string> {
    const sessionName = `farm-${farmId.substring(0, 8)}`;

    try {
      // Check if session already exists
      if (await this.sessionExists(sessionName)) {
        logger.warn(`[TmuxManager] Session ${sessionName} already exists, cleaning up...`);
        await this.killSession(sessionName);
      }

      // Create new session
      await this.executeCommand(['new-session', '-d', '-s', sessionName, '-n', 'agents']);

      // Create panes for agents
      for (let i = 1; i < agentCount; i++) {
        await this.executeCommand(['split-window', '-t', `${sessionName}:agents`, '-h']);
      }

      // Balance panes
      await this.executeCommand(['select-layout', '-t', `${sessionName}:agents`, 'tiled']);

      // Set up pipe-pane for terminal output capture
      await this.setupPipePaneForAllAgents(sessionName, farmId, agentCount);

      // Track session
      const session: TmuxSession = {
        name: sessionName,
        farmId,
        created: new Date(),
        paneCount: agentCount,
        isActive: true,
        lastHealthCheck: new Date()
      };
      this.activeSessions.set(sessionName, session);

      logger.info(`[TmuxManager] Created session ${sessionName} with ${agentCount} panes`);
      this.emit('session:created', { sessionName, farmId, agentCount });

      return sessionName;

    } catch (error) {
      logger.error(`[TmuxManager] Failed to create session ${sessionName}:`, error);
      throw error;
    }
  }

  /**
   * Send command to a specific pane
   */
  async sendCommand(sessionName: string, paneIndex: number, command: string): Promise<void> {
    try {
      const paneId = `${sessionName}:agents.${paneIndex}`;
      await this.executeCommand(['send-keys', '-t', paneId, command, 'Enter']);
      logger.debug(`[TmuxManager] Sent command to ${paneId}`);
    } catch (error) {
      logger.error(`[TmuxManager] Failed to send command to pane:`, error);
      throw error;
    }
  }

  /**
   * Kill a tmux session with cleanup
   */
  async killSession(sessionName: string, graceful: boolean = true): Promise<SessionCleanupResult> {
    const result: SessionCleanupResult = {
      sessionName,
      success: false
    };

    try {
      // Check if session exists
      if (!(await this.sessionExists(sessionName))) {
        logger.info(`[TmuxManager] Session ${sessionName} does not exist`);
        this.activeSessions.delete(sessionName);
        result.success = true;
        return result;
      }

      if (graceful) {
        // Send exit commands to all panes first
        const session = this.activeSessions.get(sessionName);
        if (session) {
          for (let i = 0; i < session.paneCount; i++) {
            try {
              await this.sendCommand(sessionName, i, 'exit');
            } catch {
              // Pane might already be gone
            }
          }
          // Wait a bit for graceful exit
          await this.delay(2000);
        }
      }

      // Force kill the session
      await this.executeCommand(['kill-session', '-t', sessionName]);
      
      // Remove from tracking
      this.activeSessions.delete(sessionName);
      
      logger.info(`[TmuxManager] Killed session ${sessionName}`);
      this.emit('session:killed', { sessionName });
      
      result.success = true;
      return result;

    } catch (error) {
      result.error = `Failed to kill session: ${error}`;
      logger.error(`[TmuxManager] ${result.error}`);
      
      // Try force cleanup
      try {
        await this.forceCleanup(sessionName);
        result.success = true;
      } catch (forceError) {
        result.error += ` Force cleanup also failed: ${forceError}`;
      }
      
      return result;
    }
  }

  /**
   * Set up pipe-pane for all agents to capture terminal output
   */
  private async setupPipePaneForAllAgents(sessionName: string, farmId: string, agentCount: number): Promise<void> {
    const terminalDir = pathConfig.getTerminalDir(farmId);

    // Create terminal directory
    await fs.mkdir(terminalDir, { recursive: true });
    logger.info(`[TmuxManager] Created terminal directory: ${terminalDir}`);

    // Set up pipe-pane for each agent
    for (let i = 0; i < agentCount; i++) {
      const outputFile = path.join(terminalDir, `agent-${i}.log`);

      // Create empty file first
      await fs.writeFile(outputFile, '');

      // Set up pipe-pane to capture output
      const pipeCmd = ['pipe-pane', '-t', `${sessionName}:agents.${i}`, '-o', `cat >> ${outputFile}`];
      await this.executeCommand(pipeCmd);

      logger.info(`[TmuxManager] Set up pipe-pane for agent-${i} -> ${outputFile}`);
    }
  }

  /**
   * Check if a session exists
   */
  async sessionExists(sessionName: string): Promise<boolean> {
    try {
      await this.executeCommand(['has-session', '-t', sessionName]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all tmux sessions (including orphaned ones)
   */
  async getAllSessions(): Promise<string[]> {
    try {
      const output = await this.executeCommand(['list-sessions', '-F', '#{session_name}']);
      return output.split('\n').filter(s => s.trim());
    } catch {
      return [];
    }
  }

  /**
   * Clean up orphaned sessions
   */
  async cleanupOrphanedSessions(): Promise<number> {
    let cleanedCount = 0;
    
    try {
      const allSessions = await this.getAllSessions();
      const farmSessions = allSessions.filter(s => s.startsWith('farm-'));
      
      for (const sessionName of farmSessions) {
        // Check if we're tracking this session
        if (!this.activeSessions.has(sessionName)) {
          logger.warn(`[TmuxManager] Found orphaned session: ${sessionName}`);
          
          // Check if it's an old session (created more than 1 hour ago)
          const sessionInfo = await this.getSessionInfo(sessionName);
          if (sessionInfo && this.isOldSession(sessionInfo)) {
            const result = await this.killSession(sessionName, false);
            if (result.success) {
              cleanedCount++;
              logger.info(`[TmuxManager] Cleaned up orphaned session: ${sessionName}`);
            }
          }
        }
      }
      
      if (cleanedCount > 0) {
        this.emit('orphans:cleaned', { count: cleanedCount });
      }
      
    } catch (error) {
      logger.error('[TmuxManager] Error during orphan cleanup:', error);
    }
    
    return cleanedCount;
  }

  /**
   * Health monitoring for active sessions
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [sessionName, session] of this.activeSessions.entries()) {
        try {
          const exists = await this.sessionExists(sessionName);
          
          if (!exists) {
            logger.warn(`[TmuxManager] Session ${sessionName} no longer exists`);
            this.activeSessions.delete(sessionName);
            this.emit('session:lost', { sessionName, farmId: session.farmId });
          } else {
            session.lastHealthCheck = new Date();
            
            // Check for zombie panes
            const paneCount = await this.getPaneCount(sessionName);
            if (paneCount !== session.paneCount) {
              logger.warn(`[TmuxManager] Pane count mismatch for ${sessionName}: expected ${session.paneCount}, got ${paneCount}`);
              session.paneCount = paneCount;
              this.emit('session:degraded', { sessionName, expectedPanes: session.paneCount, actualPanes: paneCount });
            }
          }
        } catch (error) {
          logger.error(`[TmuxManager] Health check failed for ${sessionName}:`, error);
        }
      }
      
      // Clean up orphaned sessions
      await this.cleanupOrphanedSessions();
      
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Setup shutdown handlers for cleanup
   */
  private setupShutdownHandlers(): void {
    const cleanup = async () => {
      logger.info('[TmuxManager] Shutting down, cleaning up sessions...');
      
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      
      // Kill all tracked sessions
      const sessions = Array.from(this.activeSessions.keys());
      for (const sessionName of sessions) {
        await this.killSession(sessionName, true);
      }
      
      logger.info('[TmuxManager] Cleanup completed');
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('exit', cleanup);
  }

  /**
   * Execute tmux command
   */
  private executeCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('tmux', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Force cleanup a session using system commands
   */
  private async forceCleanup(sessionName: string): Promise<void> {
    try {
      // Try to find and kill processes
      const findProc = spawn('pgrep', ['-f', sessionName]);
      
      findProc.stdout.on('data', (data) => {
        const pids = data.toString().trim().split('\n');
        for (const pid of pids) {
          if (pid) {
            spawn('kill', ['-9', pid]);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      this.activeSessions.delete(sessionName);
      
    } catch (error) {
      logger.error(`[TmuxManager] Force cleanup failed for ${sessionName}:`, error);
      throw error;
    }
  }

  /**
   * Get session info
   */
  private async getSessionInfo(sessionName: string): Promise<any> {
    try {
      const output = await this.executeCommand([
        'list-sessions', 
        '-t', sessionName, 
        '-F', '#{session_created}:#{session_attached}:#{session_windows}'
      ]);
      const [created, attached, windows] = output.split(':');
      return { created: parseInt(created) * 1000, attached, windows };
    } catch {
      return null;
    }
  }

  /**
   * Check if session is old
   */
  private isOldSession(sessionInfo: any): boolean {
    if (!sessionInfo || !sessionInfo.created) return true;
    const age = Date.now() - sessionInfo.created;
    return age > this.SESSION_TIMEOUT;
  }

  /**
   * Get pane count for a session
   */
  private async getPaneCount(sessionName: string): Promise<number> {
    try {
      const output = await this.executeCommand([
        'list-panes',
        '-t', sessionName,
        '-F', '#{pane_id}'
      ]);
      return output.split('\n').filter(s => s.trim()).length;
    } catch {
      return 0;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionName: string): TmuxSession | undefined {
    return this.activeSessions.get(sessionName);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): TmuxSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Cleanup all sessions for a farm
   */
  async cleanupFarmSessions(farmId: string): Promise<void> {
    const sessions = Array.from(this.activeSessions.values())
      .filter(s => s.farmId === farmId);
    
    for (const session of sessions) {
      await this.killSession(session.name, true);
    }
  }

  /**
   * Shutdown the manager
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Kill all sessions
    const sessions = Array.from(this.activeSessions.keys());
    for (const sessionName of sessions) {
      await this.killSession(sessionName, true);
    }

    this.activeSessions.clear();
    this.removeAllListeners();
  }
}

// Export singleton instance
export const tmuxSessionManager = TmuxSessionManager.getInstance();