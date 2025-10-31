import { logger, LogCategory } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TmuxSessionHealth {
  sessionName: string;
  exists: boolean;
  windowCount: number;
  paneCount: number;
  lastChecked: Date;
}

class TmuxHealthManager {
  private static instance: TmuxHealthManager;
  private healthCache = new Map<string, TmuxSessionHealth>();

  private constructor() {}

  static getInstance(): TmuxHealthManager {
    if (!this.instance) {
      this.instance = new TmuxHealthManager();
    }
    return this.instance;
  }

  async checkSessionHealth(sessionName: string): Promise<TmuxSessionHealth> {
    try {
      logger.info(LogCategory.TMUX, `Checking health of tmux session: ${sessionName}`);

      // Check if session exists
      const { stdout: sessionList } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null || echo ""`
      );

      const exists = sessionList.includes(sessionName);

      if (!exists) {
        const health: TmuxSessionHealth = {
          sessionName,
          exists: false,
          windowCount: 0,
          paneCount: 0,
          lastChecked: new Date()
        };
        this.healthCache.set(sessionName, health);
        return health;
      }

      // Get window count
      const { stdout: windowOutput } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-windows -t ${sessionName} 2>/dev/null | wc -l`
      );
      const windowCount = parseInt(windowOutput.trim()) || 0;

      // Get pane count
      const { stdout: paneOutput } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName} 2>/dev/null | wc -l`
      );
      const paneCount = parseInt(paneOutput.trim()) || 0;

      const health: TmuxSessionHealth = {
        sessionName,
        exists: true,
        windowCount,
        paneCount,
        lastChecked: new Date()
      };

      this.healthCache.set(sessionName, health);
      return health;
    } catch (error) {
      logger.error(LogCategory.TMUX, `Error checking health for session ${sessionName}:`, error);
      return {
        sessionName,
        exists: false,
        windowCount: 0,
        paneCount: 0,
        lastChecked: new Date()
      };
    }
  }

  async checkAllSessions(): Promise<Map<string, TmuxSessionHealth>> {
    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""`
      );

      const sessions = stdout.trim().split('\n').filter(s => s);
      const healthMap = new Map<string, TmuxSessionHealth>();

      for (const session of sessions) {
        const health = await this.checkSessionHealth(session);
        healthMap.set(session, health);
      }

      return healthMap;
    } catch (error) {
      logger.error(LogCategory.TMUX, 'Error checking all sessions:', error);
      return new Map();
    }
  }

  async repairSession(sessionName: string): Promise<boolean> {
    try {
      logger.info(LogCategory.TMUX, `Attempting to repair session: ${sessionName}`);

      // First check if it exists
      const health = await this.checkSessionHealth(sessionName);

      if (!health.exists) {
        // Try to recreate the session
        await execAsync(
          `TMUX_TMPDIR=/tmp tmux new-session -d -s ${sessionName}`
        );
        logger.info(LogCategory.TMUX, `Recreated session: ${sessionName}`);
        return true;
      }

      // Session exists, check if it needs repair
      if (health.windowCount === 0) {
        // Create a default window
        await execAsync(
          `TMUX_TMPDIR=/tmp tmux new-window -t ${sessionName}:0`
        );
        logger.info(LogCategory.TMUX, `Added default window to session: ${sessionName}`);
      }

      return true;
    } catch (error) {
      logger.error(LogCategory.TMUX, `Failed to repair session ${sessionName}:`, error);
      return false;
    }
  }

  getHealthCache(): Map<string, TmuxSessionHealth> {
    return new Map(this.healthCache);
  }

  clearHealthCache(): void {
    this.healthCache.clear();
  }
}

export const tmuxHealthManager = TmuxHealthManager.getInstance();
export { TmuxHealthManager, TmuxSessionHealth };