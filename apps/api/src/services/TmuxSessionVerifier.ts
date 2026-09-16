/**
 * Tmux Session Verifier and Recovery Service
 * Ensures tmux sessions are properly created and recovers from failures
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';

const execAsync = promisify(exec);
const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

export interface SessionVerificationResult {
  exists: boolean;
  accessible: boolean;
  paneCount: number;
  windowName?: string;
  error?: string;
}

export interface RecoveryOptions {
  maxAttempts?: number;
  retryDelay?: number;
  recreateOnFailure?: boolean;
}

export class TmuxSessionVerifier {
  private static instance: TmuxSessionVerifier;

  static getInstance(): TmuxSessionVerifier {
    if (!TmuxSessionVerifier.instance) {
      TmuxSessionVerifier.instance = new TmuxSessionVerifier();
    }
    return TmuxSessionVerifier.instance;
  }

  /**
   * Comprehensive session verification
   */
  async verifySession(sessionName: string): Promise<SessionVerificationResult> {
    const result: SessionVerificationResult = {
      exists: false,
      accessible: false,
      paneCount: 0
    };

    try {
      // Check if session exists
      const { stdout: sessionCheck } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux has-session -t ${sessionName} 2>&1`,
        { timeout: 5000 }
      );

      result.exists = true;

      // Get session details
      const { stdout: sessionInfo } = await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-windows -t ${sessionName} -F "#{window_name}" 2>&1`,
        { timeout: 5000 }
      );

      const windows = sessionInfo.trim().split('\n').filter(w => w);
      if (windows.length > 0) {
        result.windowName = windows[0];
        result.accessible = true;

        // Count panes in the first window
        const { stdout: paneInfo } = await execAsync(
          `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-panes -t ${sessionName}:${result.windowName} 2>&1 | wc -l`,
          { timeout: 5000 }
        );

        result.paneCount = parseInt(paneInfo.trim()) || 0;
      }

      logger.info(LogCategory.TERMINAL, `Session ${sessionName} verification:`, result);
      return result;

    } catch (error: any) {
      if (error.message?.includes('no server running')) {
        result.error = 'Tmux server not running';
      } else if (error.message?.includes("can't find session")) {
        result.error = 'Session does not exist';
      } else {
        result.error = error.message;
      }

      logger.debug(LogCategory.TERMINAL, `Session ${sessionName} verification failed:`, result.error);
      return result;
    }
  }

  /**
   * Verify and recover session if needed
   */
  async verifyAndRecover(
    sessionName: string,
    expectedPanes: number,
    options: RecoveryOptions = {}
  ): Promise<boolean> {
    const opts = {
      maxAttempts: 5,  // Increased attempts
      retryDelay: 2000, // Increased delay
      recreateOnFailure: true,
      ...options
    };

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      logger.info(LogCategory.TERMINAL,
        `Verifying session ${sessionName} (attempt ${attempt}/${opts.maxAttempts})`);

      const verification = await this.verifySession(sessionName);

      // Check if session meets requirements
      if (verification.exists && verification.accessible) {
        if (verification.paneCount >= expectedPanes) {
          logger.info(LogCategory.TERMINAL,
            `Session ${sessionName} verified successfully with ${verification.paneCount} panes`);
          return true;
        }

        // Session exists but doesn't have enough panes
        logger.warn(LogCategory.TERMINAL,
          `Session ${sessionName} has ${verification.paneCount} panes but needs ${expectedPanes}`);

        if (opts.recreateOnFailure && attempt < opts.maxAttempts) {
          await this.recreateSession(sessionName, expectedPanes);
        }
      } else {
        // Session doesn't exist or is not accessible
        logger.warn(LogCategory.TERMINAL,
          `Session ${sessionName} ${verification.error || 'not accessible'}`);

        if (opts.recreateOnFailure && attempt < opts.maxAttempts) {
          await this.createSessionWithPanes(sessionName, expectedPanes);
        }
      }

      // Wait before retry
      if (attempt < opts.maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, opts.retryDelay));
      }
    }

    logger.error(LogCategory.TERMINAL,
      `Failed to verify/recover session ${sessionName} after ${opts.maxAttempts} attempts`);
    return false;
  }

  /**
   * Create a new session with the specified number of panes
   */
  private async createSessionWithPanes(
    sessionName: string,
    paneCount: number
  ): Promise<void> {
    try {
      logger.info(LogCategory.TERMINAL,
        `Creating new session ${sessionName} with ${paneCount} panes`);

      // Kill existing session if it exists
      try {
        await execAsync(
          `TMUX_TMPDIR="${tmuxTmpDir}" tmux kill-session -t ${sessionName} 2>/dev/null`
        );
      } catch {
        // Ignore error if session doesn't exist
      }

      // Create new session with first pane
      await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux new-session -d -s ${sessionName} -n agents -x 200 -y 50`
      );

      // Create additional panes with proper verification
      for (let i = 1; i < paneCount; i++) {
        // Alternate split direction for better layout
        const direction = i % 2 === 0 ? '-v' : '-h';
        const targetPane = i === 1 ? `${sessionName}:agents.0` : `${sessionName}:agents`;

        await execAsync(
          `TMUX_TMPDIR="${tmuxTmpDir}" tmux split-window ${direction} -t ${targetPane}`
        );

        // Wait and verify pane was created
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify pane count
        const { stdout } = await execAsync(
          `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-panes -t ${sessionName}:agents 2>&1 | wc -l`
        );
        const currentPanes = parseInt(stdout.trim()) || 0;

        if (currentPanes !== i + 1) {
          logger.warn(LogCategory.TERMINAL,
            `Expected ${i + 1} panes but found ${currentPanes} after split`);
        }
      }

      // Apply tiled layout
      await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux select-layout -t ${sessionName}:agents tiled`
      );

      logger.info(LogCategory.TERMINAL,
        `Successfully created session ${sessionName} with ${paneCount} panes`);

    } catch (error) {
      logger.error(LogCategory.TERMINAL,
        `Failed to create session ${sessionName}:`, error);
      throw error;
    }
  }

  /**
   * Recreate a session (kill and create new)
   */
  private async recreateSession(
    sessionName: string,
    paneCount: number
  ): Promise<void> {
    logger.info(LogCategory.TERMINAL,
      `Recreating session ${sessionName} with ${paneCount} panes`);

    try {
      // Kill existing session
      await execAsync(
        `TMUX_TMPDIR="${tmuxTmpDir}" tmux kill-session -t ${sessionName} 2>/dev/null`
      );
    } catch {
      // Ignore if session doesn't exist
    }

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create new session
    await this.createSessionWithPanes(sessionName, paneCount);
  }

  /**
   * Monitor session health
   */
  async monitorSession(
    sessionName: string,
    callback: (healthy: boolean) => void,
    interval: number = 5000
  ): Promise<NodeJS.Timer> {
    const checkHealth = async () => {
      const verification = await this.verifySession(sessionName);
      const healthy = verification.exists && verification.accessible;
      callback(healthy);
    };

    // Initial check
    await checkHealth();

    // Set up interval
    return setInterval(checkHealth, interval);
  }

  /**
   * Ensure tmux server is running
   */
  async ensureServerRunning(): Promise<boolean> {
    try {
      // Start server if not running
      await execAsync(`TMUX_TMPDIR="${tmuxTmpDir}" tmux start-server 2>/dev/null`);

      // Verify server is responsive
      await execAsync(`TMUX_TMPDIR="${tmuxTmpDir}" tmux list-commands >/dev/null 2>&1`);

      return true;
    } catch (error) {
      logger.error(LogCategory.TERMINAL, 'Failed to ensure tmux server is running:', error);
      return false;
    }
  }
}

export const tmuxSessionVerifier = TmuxSessionVerifier.getInstance();
