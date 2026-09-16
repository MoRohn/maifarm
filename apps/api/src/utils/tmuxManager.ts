/**
 * TMUX Manager - Ensures TMUX server is running and sessions are created properly
 */

import { spawn, execSync } from 'child_process';
import { logger, LogCategory } from './logger';
import { pathConfig } from '../config/paths';

export class TmuxManager {
  private static instance: TmuxManager;
  private readonly tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

  static getInstance(): TmuxManager {
    if (!TmuxManager.instance) {
      TmuxManager.instance = new TmuxManager();
    }
    return TmuxManager.instance;
  }

  /**
   * Ensure TMUX server is running
   */
  async ensureServerRunning(): Promise<boolean> {
    try {
      // Start server (harmless if already running)
      execSync('tmux start-server 2>/dev/null', {
        env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
        stdio: 'ignore'
      });

      // Verify it's running by checking if we can communicate with it
      // Use 'tmux list-commands' instead of 'list-sessions' since it doesn't fail when no sessions exist
      execSync('tmux list-commands >/dev/null 2>&1', {
        env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
        stdio: 'ignore'
      });

      return true;
    } catch (error) {
      // If we can't even list commands, server is in a bad state
      logger.error(LogCategory.APP, 'TMUX server is not accessible:', error);

      // Try one more time with explicit server start
      try {
        execSync('tmux -L default start-server', {
          env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
          stdio: 'ignore'
        });

        // Verify again
        execSync('tmux list-commands >/dev/null 2>&1', {
          env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
          stdio: 'ignore'
        });

        logger.info(LogCategory.APP, 'TMUX server started successfully on retry');
        return true;
      } catch (retryError) {
        logger.error(LogCategory.APP, 'Failed to start TMUX server after retry:', retryError);
        return false;
      }
    }
  }

  /**
   * Create a new TMUX session
   */
  async createSession(sessionName: string, windowName: string = 'main'): Promise<boolean> {
    try {
      // Ensure server is running first
      await this.ensureServerRunning();

      // Check if session already exists
      try {
        execSync(`tmux has-session -t ${sessionName} 2>/dev/null`, {
          env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
          stdio: 'ignore'
        });
        logger.debug(LogCategory.APP, `TMUX session ${sessionName} already exists`);
        return true;
      } catch {
        // Session doesn't exist, create it
      }

      // Create new session detached
      execSync(`tmux new-session -d -s ${sessionName} -n ${windowName}`, {
        env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
        stdio: 'ignore'
      });

      logger.info(LogCategory.APP, `Created TMUX session: ${sessionName}`);
      return true;
    } catch (error) {
      logger.error(LogCategory.APP, `Failed to create TMUX session ${sessionName}:`, error);
      return false;
    }
  }

  /**
   * Kill a TMUX session
   */
  async killSession(sessionName: string): Promise<void> {
    try {
      execSync(`tmux kill-session -t ${sessionName} 2>/dev/null`, {
        env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
        stdio: 'ignore'
      });
      logger.info(LogCategory.APP, `Killed TMUX session: ${sessionName}`);
    } catch {
      // Session might not exist, which is fine
    }
  }

  /**
   * List all TMUX sessions
   */
  async listSessions(): Promise<string[]> {
    try {
      const output = execSync('tmux list-sessions -F "#{session_name}"', {
        env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
        encoding: 'utf-8'
      });
      return output.split('\n').filter(s => s.trim());
    } catch {
      return [];
    }
  }

  /**
   * Create multiple panes in a window
   */
  async createPanes(sessionName: string, windowName: string, count: number): Promise<boolean> {
    try {
      logger.info(LogCategory.APP, `Creating ${count-1} additional panes in ${sessionName}:${windowName} (total will be ${count})`);

      // Special handling for 3 panes - create 2 additional panes
      if (count === 3) {
        // Create first additional pane (horizontal split)
        try {
          const cmd1 = `tmux split-window -t ${sessionName}:${windowName}.0 -h`;
          logger.debug(LogCategory.APP, `Executing: ${cmd1}`);
          execSync(cmd1, {
            env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
            stdio: 'pipe'
          });
          logger.info(LogCategory.APP, `Created first split (horizontal) - now have 2 panes`);
        } catch (e: any) {
          logger.error(LogCategory.APP, `Failed horizontal split: ${e.message}`);
          throw e; // Re-throw to ensure we know it failed
        }

        // Small delay to ensure split completes
        await new Promise(resolve => setTimeout(resolve, 200));

        // Create second additional pane (vertical split on right pane)
        try {
          const cmd2 = `tmux split-window -t ${sessionName}:${windowName}.1 -v`;
          logger.debug(LogCategory.APP, `Executing: ${cmd2}`);
          execSync(cmd2, {
            env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
            stdio: 'pipe'
          });
          logger.info(LogCategory.APP, `Created second split (vertical) - now have 3 panes`);
        } catch (e: any) {
          logger.error(LogCategory.APP, `Failed vertical split: ${e.message}`);
          // Don't re-throw here, we might have 2 panes which is still workable
        }

        // Balance the layout for better visibility
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
          execSync(`tmux select-layout -t ${sessionName}:${windowName} even-horizontal`, {
            env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
            stdio: 'ignore'
          });
          logger.debug(LogCategory.APP, `Applied even-horizontal layout`);
        } catch (layoutError) {
          logger.warn(LogCategory.APP, `Failed to balance layout:`, layoutError);
        }
      } else {
        // Original logic for other counts
        for (let i = 1; i < count; i++) {
          logger.debug(LogCategory.APP, `Creating pane ${i} of ${count-1} additional panes`);

          try {
            const result = execSync(`tmux split-window -t ${sessionName}:${windowName} -h 2>&1`, {
              env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
              encoding: 'utf-8'
            });

            if (result) {
              logger.debug(LogCategory.APP, `Split result: ${result}`);
            }
          } catch (splitError: any) {
            logger.error(LogCategory.APP, `Failed to create pane ${i}:`, splitError.message || splitError);
            // Try to continue with next pane
          }

          // Balance panes after each split
          try {
            execSync(`tmux select-layout -t ${sessionName}:${windowName} tiled`, {
              env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
              stdio: 'ignore'
            });
          } catch (layoutError) {
            logger.warn(LogCategory.APP, `Failed to balance layout after pane ${i}:`, layoutError);
          }
        }
      }

      // Verify actual pane count
      try {
        const actualPanes = execSync(`tmux list-panes -t ${sessionName}:${windowName} | wc -l`, {
          env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
          encoding: 'utf-8'
        }).trim();

        logger.info(LogCategory.APP, `Created panes in ${sessionName}:${windowName} - expected: ${count}, actual: ${actualPanes}`);

        if (parseInt(actualPanes) !== count) {
          logger.warn(LogCategory.APP, `Pane count mismatch! Expected ${count} but got ${actualPanes}`);
        }
      } catch (verifyError) {
        logger.warn(LogCategory.APP, `Could not verify pane count:`, verifyError);
      }

      return true;
    } catch (error) {
      logger.error(LogCategory.APP, `Failed to create panes:`, error);
      return false;
    }
  }

  /**
   * Send command to a specific pane
   */
  async sendCommand(sessionName: string, windowName: string, paneIndex: number, command: string): Promise<void> {
    try {
      const target = `${sessionName}:${windowName}.${paneIndex}`;
      execSync(`tmux send-keys -t ${target} "${command}" C-m`, {
        env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
        stdio: 'ignore'
      });
      logger.debug(LogCategory.APP, `Sent command to ${target}: ${command}`);
    } catch (error) {
      logger.error(LogCategory.APP, `Failed to send command to pane:`, error);
    }
  }

  /**
   * Wait for session to be ready
   */
  async waitForSession(sessionName: string, maxWait: number = 10000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        execSync(`tmux has-session -t ${sessionName} 2>/dev/null`, {
          env: { ...process.env, TMUX_TMPDIR: this.tmuxTmpDir },
          stdio: 'ignore'
        });
        return true;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return false;
  }
}

export const tmuxManager = TmuxManager.getInstance();
