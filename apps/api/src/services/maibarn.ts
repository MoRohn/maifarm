/**
 * MaiBarn - Unified Terminal Session Management Service
 * 
 * This service consolidates all tmux session management logic from various parts of the application,
 * providing a single source of truth for session patterns, detection, and management.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { getTmuxPaneRef } from '../utils/tmuxHelpers';

const execAsync = promisify(exec);

/**
 * Session patterns that identify MaiFarm-managed sessions
 * These are the standard patterns we look for, but we can also detect all sessions
 */
export const MAIFARM_SESSION_PATTERNS = [
  'farm-',
  'farm_', 
  'quick-',
  'quick_',
  'gowild-',
  'gowild_',
  'goWild-',
  'claude_agents'
];

/**
 * Session cleanup age thresholds (in minutes)
 */
export const SESSION_AGE_THRESHOLDS = {
  QUICK_TASK: 10,    // Quick task sessions older than 10 minutes
  GENERAL: 120       // Any session older than 2 hours
};

export interface SessionInfo {
  name: string;
  sessionName: string;  // For backward compatibility
  createdTime: number;
  age: number;
  ageMinutes: number;
}

export interface SessionDetails {
  id: string;
  sessionName: string;
  farmId?: string;
  paneCount: number;
  windowName: string;
  active: boolean;
  status: string;
  createdAt: string;
  agents?: Array<{
    id: number;
    sessionId: string;
    paneId: string;
    status: string;
    commandHistory?: any[];
  }>;
  metadata?: {
    type: 'farm' | 'quicktask' | 'gowild' | 'general';
    isQuickTask: boolean;
    isFarm: boolean;
    isGoWild: boolean;
    created: number;
    taskId?: string;
  };
}

/**
 * MaiBarn Service - Unified terminal session management
 */
export class MaiBarn {
  /**
   * Check if a tmux session is valid/active
   */
  static async isSessionValid(sessionName: string): Promise<boolean> {
    try {
      // Simply check if the session exists by listing its windows
      const { stdout } = await execAsync(`tmux list-windows -t ${sessionName} -F "#{window_name}" 2>/dev/null`);
      // If we get any output, the session exists
      return stdout.trim().length > 0;
    } catch {
      // Session doesn't exist
      return false;
    }
  }

  /**
   * Get all tmux sessions with metadata
   */
  static async getAllSessions(): Promise<SessionInfo[]> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}:#{session_created}" 2>/dev/null || echo ""');
      
      if (!stdout.trim()) {
        return [];
      }
      
      return stdout.trim().split('\n').map(line => {
        const [name, created] = line.split(':');
        const createdTime = parseInt(created) * 1000;
        const age = Date.now() - createdTime;
        
        return {
          name,
          sessionName: name,
          createdTime,
          age,
          ageMinutes: age / (1000 * 60)
        };
      });
    } catch (error) {
      logger.error('[MaiBarn] Error getting sessions:', error);
      return [];
    }
  }

  /**
   * Filter sessions to MaiFarm-managed ones
   * @param sessions - List of all sessions
   * @param includeAll - If true, returns all sessions regardless of pattern
   */
  static filterRelevantSessions(sessions: SessionInfo[], includeAll: boolean = false): SessionInfo[] {
    if (includeAll) {
      return sessions;
    }
    
    // Filter to sessions matching our patterns
    return sessions.filter(s => 
      MAIFARM_SESSION_PATTERNS.some(pattern => s.name.startsWith(pattern))
    );
  }

  /**
   * Check if a session should be cleaned up
   */
  static shouldCleanSession(session: SessionInfo): boolean {
    // Clean up based on age and type
    if (session.name.includes('quick') && session.ageMinutes > SESSION_AGE_THRESHOLDS.QUICK_TASK) {
      // Quick task sessions older than threshold
      return true;
    }
    
    if (session.ageMinutes > SESSION_AGE_THRESHOLDS.GENERAL) {
      // Any session older than general threshold
      return true;
    }
    
    return false;
  }

  // PERFORMANCE FIX: Cache farmManager import and add session cleanup throttling
  private static farmManagerCache: any = null;
  private static lastCleanupTime = 0;
  private static readonly CLEANUP_THROTTLE_MS = 60000; // Only run cleanup once per minute

  /**
   * Clean up stale/orphaned tmux sessions (with caching and throttling)
   */
  static async cleanupStaleSessions(includeAll: boolean = false): Promise<string[]> {
    // PERFORMANCE FIX: Throttle cleanup calls to prevent excessive overhead
    const now = Date.now();
    if (now - this.lastCleanupTime < this.CLEANUP_THROTTLE_MS) {
      logger.debug(`[MaiBarn] Cleanup throttled, last run ${Math.ceil((now - this.lastCleanupTime) / 1000)}s ago`);
      return [];
    }
    this.lastCleanupTime = now;

    const cleanedSessions: string[] = [];
    
    try {
      const allSessions = await this.getAllSessions();
      const relevantSessions = this.filterRelevantSessions(allSessions, includeAll);
      
      // PERFORMANCE FIX: Cache farmManager import to avoid dynamic import overhead
      if (!this.farmManagerCache) {
        const { farmManager } = await import('./farmManager');
        this.farmManagerCache = farmManager;
      }
      
      const allFarms = await this.farmManagerCache.getAllFarms();
      const activeFarms = allFarms.filter(f => 
        f.status === 'active' || f.status === 'running' || f.status === 'launching'
      );
      const activeFarmIds = new Set(activeFarms.map(f => f.id));
      
      for (const session of relevantSessions) {
        // Check if this session belongs to an active farm
        const farmIdMatch = session.name.match(/(?:farm[-_]|quick_)([a-f0-9-]+)/);
        if (farmIdMatch) {
          const sessionFarmId = farmIdMatch[1];
          // Check if this session ID matches any active farm (including partial matches)
          const belongsToActiveFarm = Array.from(activeFarmIds).some(farmId => 
            farmId.startsWith(sessionFarmId) || sessionFarmId.startsWith(farmId.substring(0, 8))
          );
          
          if (belongsToActiveFarm) {
            logger.debug(`[MaiBarn] Skipping cleanup for active farm session: ${session.name}`);
            continue; // Skip cleanup for active farm sessions
          }
        }
        
        let shouldClean = this.shouldCleanSession(session);
        
        // Also check if session is actually active
        if (!shouldClean) {
          const isValid = await this.isSessionValid(session.name);
          if (!isValid) {
            shouldClean = true;
            logger.info(`[MaiBarn] Session ${session.name} has no active panes, marking for cleanup`);
          }
        }
        
        if (shouldClean) {
          try {
            await execAsync(`tmux kill-session -t ${session.name}`);
            cleanedSessions.push(session.name);
            logger.info(`[MaiBarn] Cleaned up session: ${session.name} (age: ${session.ageMinutes.toFixed(1)} minutes)`);
          } catch (err) {
            logger.error(`[MaiBarn] Failed to clean session ${session.name}:`, err);
          }
        }
      }
      
      if (cleanedSessions.length > 0) {
        logger.info(`[MaiBarn] Cleaned up ${cleanedSessions.length} stale sessions`);
      }
    } catch (error) {
      logger.error('[MaiBarn] Error during session cleanup:', error);
    }
    
    return cleanedSessions;
  }

  /**
   * Get detailed information about sessions
   */
  static async getSessionDetails(
    sessions: SessionInfo[],
    farmId?: string
  ): Promise<SessionDetails[]> {
    const detailsPromises = sessions.map(async ({ name: sessionName, createdTime }) => {
      try {
        // Validate session is still active
        const isValid = await this.isSessionValid(sessionName);
        if (!isValid) {
          logger.debug(`[MaiBarn] Skipping invalid session: ${sessionName}`);
          return null;
        }
        
        // Get pane count for the session
        const paneCount = await this.getPaneCount(sessionName);
        if (paneCount === 0) {
          logger.debug(`[MaiBarn] Skipping session with no panes: ${sessionName}`);
          return null;
        }
        
        // Extract farmId and determine session type
        const extractedFarmId = this.extractFarmId(sessionName);
        const sessionType = this.getSessionType(sessionName);
        
        const metadata: SessionDetails['metadata'] = {
          type: sessionType,
          isQuickTask: sessionType === 'quicktask',
          isFarm: sessionType === 'farm',
          isGoWild: sessionType === 'gowild',
          created: createdTime
        };
        
        // Extract task ID for quick tasks
        if (metadata.isQuickTask) {
          metadata.taskId = sessionName.replace(/^quick[_-]/, '');
        }
        
        return {
          id: sessionName,
          sessionName,
          farmId: extractedFarmId,
          paneCount,
          windowName: metadata.isQuickTask ? 'quicktask' : 'agents',
          active: true,
          status: 'running',
          createdAt: new Date(createdTime).toISOString(),
          agents: Array.from({ length: paneCount }, (_, i) => ({
            id: i,
            sessionId: sessionName,
            paneId: `${sessionName}:${i}`,
            status: 'ready',
            commandHistory: []
          })),
          metadata
        };
      } catch (error) {
        logger.error(`[MaiBarn] Error getting details for session ${sessionName}:`, error);
        return null;
      }
    });
    
    const results = await Promise.all(detailsPromises);
    return results.filter((s): s is SessionDetails => s !== null);
  }

  /**
   * Get pane count for a session
   */
  static async getPaneCount(sessionName: string): Promise<number> {
    return new Promise<number>((resolve) => {
      const countPanes = spawn('tmux', ['list-panes', '-t', `${sessionName}:0`, '-F', '#{pane_index}']);
      let paneOutput = '';
      
      countPanes.stdout?.on('data', (data: Buffer) => { 
        paneOutput += data.toString(); 
      });
      
      countPanes.on('exit', (code) => {
        if (code === 0) {
          const count = paneOutput.trim().split('\n').filter(Boolean).length;
          resolve(count);
        } else {
          resolve(0);
        }
      });
      
      countPanes.on('error', () => resolve(0));
    });
  }

  /**
   * Extract farm ID from session name
   */
  static extractFarmId(sessionName: string): string | undefined {
    // Pattern 1: farm-<id> or farm_<id>
    const farmIdMatch = sessionName.match(/farm[_-]([a-zA-Z0-9-]+)/);
    if (farmIdMatch) {
      return farmIdMatch[1];
    }
    
    // Pattern 2: claude_agents_<timestamp>_<farmId>
    if (sessionName.includes('claude_agents')) {
      const claudeMatch = sessionName.match(/claude_agents_\d+_([a-zA-Z0-9-]+)/);
      if (claudeMatch) {
        return claudeMatch[1];
      }
    }
    
    // Pattern 3: Direct UUID in session name
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(sessionName)) {
      return sessionName;
    }
    
    // Pattern 4: Contains a UUID anywhere in the name
    const uuidMatch = sessionName.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (uuidMatch) {
      return uuidMatch[1];
    }
    
    return undefined;
  }

  /**
   * Determine the type of session
   */
  static getSessionType(sessionName: string): 'farm' | 'quicktask' | 'gowild' | 'general' {
    if (sessionName.startsWith('quick_') || sessionName.startsWith('quick-')) {
      return 'quicktask';
    }
    if (sessionName.startsWith('farm_') || sessionName.startsWith('farm-')) {
      return 'farm';
    }
    if (sessionName.startsWith('gowild_') || sessionName.startsWith('gowild-') || sessionName.startsWith('goWild-')) {
      return 'gowild';
    }
    return 'general';
  }

  /**
   * Filter sessions by farm ID
   */
  static filterSessionsByFarmId(sessions: SessionDetails[], farmId: string): SessionDetails[] {
    const shortFarmId = farmId.substring(0, 8);
    const isQuickTask = farmId.startsWith('quick-task-');
    
    return sessions.filter((session) => {
      if (isQuickTask) {
        // Handle Quick Task sessions
        const taskIdPart = farmId.replace('quick-task-', '').substring(0, 8);
        return (
          (session.sessionName.startsWith('quick_') || session.sessionName.startsWith('quick-')) &&
          session.sessionName.includes(taskIdPart)
        );
      } else {
        // Check if session matches farm pattern
        return (
          session.farmId === farmId ||
          session.farmId === shortFarmId ||
          (session.farmId && farmId.startsWith(session.farmId)) ||
          session.sessionName.includes(shortFarmId) ||
          session.sessionName === `farm_${shortFarmId}` ||
          session.sessionName === `farm-${shortFarmId}` ||
          session.sessionName.startsWith(`farm_${shortFarmId}`) ||
          session.sessionName.startsWith(`farm-${shortFarmId}`)
        );
      }
    });
  }

  /**
   * Get terminal output for a specific agent
   */
  static async getAgentOutput(sessionName: string, agentId: number, lines: number = 100): Promise<{
    sessionId: string;
    agentId: number;
    lines: string[];
    terminal: string[];
    timestamp: Date;
    type: string;
  }> {
    let paneRef: string;

    try {
      paneRef = await getTmuxPaneRef(sessionName, agentId);
    } catch (error) {
      throw new Error(`Failed to resolve terminal pane for ${sessionName} agent ${agentId}: ${(error as Error).message}`);
    }

    return new Promise((resolve, reject) => {
      const captureProcess = spawn('tmux', [
        'capture-pane',
        '-t', paneRef,
        '-p',
        '-S', `-${lines}`
      ], {
        env: { ...process.env, TMUX_TMPDIR: '/tmp' }
      });

      let output = '';
      let errorOutput = '';

      captureProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      captureProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      captureProcess.on('exit', (code) => {
        if (code === 0) {
          const linesArray = output.split('\n');
          while (linesArray.length > 0 && linesArray[linesArray.length - 1].trim() === '') {
            linesArray.pop();
          }

          resolve({
            sessionId: sessionName,
            agentId,
            lines: linesArray,
            terminal: linesArray,
            timestamp: new Date(),
            type: 'stdout'
          });
        } else {
          reject(new Error(`Failed to capture output: ${errorOutput || `exit code ${code}`}`));
        }
      });

      captureProcess.on('error', (err) => {
        reject(new Error(`Failed to capture output: ${(err as Error).message}`));
      });
    });
  }

  /**
   * Send command to a specific agent terminal
   */
  static async sendCommand(sessionName: string, agentId: number, command: string): Promise<boolean> {
    let paneRef: string;

    try {
      paneRef = await getTmuxPaneRef(sessionName, agentId);
    } catch (error) {
      logger.debug(`[MaiBarn] Failed to resolve pane for command (${sessionName}, ${agentId}):`, error);
      return false;
    }

    return new Promise((resolve) => {
      const sendProcess = spawn('tmux', [
        'send-keys',
        '-t', paneRef,
        command.trim(),
        'C-m'
      ], {
        env: { ...process.env, TMUX_TMPDIR: '/tmp' }
      });
      
      sendProcess.on('exit', (code) => {
        resolve(code === 0);
      });

      sendProcess.on('error', () => resolve(false));
    });
  }

  /**
   * Backwards-compatible alias used by older endpoints
   */
  static async sendAgentCommand(sessionName: string, agentId: number, command: string): Promise<boolean> {
    return this.sendCommand(sessionName, agentId, command);
  }
}

// Export as default for convenience
export default MaiBarn;
