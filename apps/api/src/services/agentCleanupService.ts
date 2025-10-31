import { logger, LogCategory } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class AgentCleanupService {
  private static instance: AgentCleanupService;
  private cleanupInProgress = new Set<string>();

  private constructor() {}

  static getInstance(): AgentCleanupService {
    if (!this.instance) {
      this.instance = new AgentCleanupService();
    }
    return this.instance;
  }

  async cleanupFarmAgents(farmId: string): Promise<void> {
    if (this.cleanupInProgress.has(farmId)) {
      logger.warn(LogCategory.CLEANUP, `Cleanup already in progress for farm ${farmId}`);
      return;
    }

    this.cleanupInProgress.add(farmId);

    try {
      logger.info(LogCategory.CLEANUP, `Starting cleanup for farm ${farmId} agents`);

      // Kill any tmux sessions related to this farm
      const sessionName = `farm-${farmId}`;
      try {
        await execAsync(`TMUX_TMPDIR=/tmp tmux kill-session -t ${sessionName} 2>/dev/null || true`);
        logger.info(LogCategory.CLEANUP, `Killed tmux session for farm ${farmId}`);
      } catch (error) {
        // Ignore errors - session might not exist
      }

      logger.info(LogCategory.CLEANUP, `Cleanup completed for farm ${farmId}`);
    } catch (error) {
      logger.error(LogCategory.CLEANUP, `Error during cleanup for farm ${farmId}:`, error);
    } finally {
      this.cleanupInProgress.delete(farmId);
    }
  }

  async cleanupAllAgents(): Promise<void> {
    logger.info(LogCategory.CLEANUP, 'Starting cleanup of all agents');

    try {
      // Kill all farm-related tmux sessions
      await execAsync(`TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null | grep "^farm-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {} 2>/dev/null || true`);
      logger.info(LogCategory.CLEANUP, 'Cleaned up all farm tmux sessions');
    } catch (error) {
      logger.error(LogCategory.CLEANUP, 'Error during global cleanup:', error);
    }
  }

  async isCleanupInProgress(farmId: string): Promise<boolean> {
    return this.cleanupInProgress.has(farmId);
  }
}

export const agentCleanupService = AgentCleanupService.getInstance();
export { AgentCleanupService };