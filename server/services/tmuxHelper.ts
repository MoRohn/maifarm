import { spawn } from 'child_process';
import { logger } from '../utils/logger';

interface TmuxSession {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

interface TmuxPane {
  sessionName: string;
  windowIndex: number;
  paneIndex: number;
  active: boolean;
}

export class TmuxHelper {
  /**
   * Create a new tmux session
   */
  static async createSession(sessionName: string, windowName: string = 'main'): Promise<boolean> {
    return new Promise((resolve) => {
      const createProcess = spawn('tmux', [
        'new-session',
        '-d',
        '-s', sessionName,
        '-n', windowName
      ]);

      createProcess.on('exit', (code) => {
        if (code === 0) {
          logger.info(`[TmuxHelper] Created session: ${sessionName}`);
          resolve(true);
        } else {
          logger.error(`[TmuxHelper] Failed to create session: ${sessionName}`);
          resolve(false);
        }
      });
    });
  }

  /**
   * Kill a tmux session
   */
  static async killSession(sessionName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const killProcess = spawn('tmux', ['kill-session', '-t', sessionName]);
      
      killProcess.on('exit', (code) => {
        if (code === 0) {
          logger.info(`[TmuxHelper] Killed session: ${sessionName}`);
          resolve(true);
        } else {
          // Session might not exist, which is fine
          resolve(false);
        }
      });
    });
  }

  /**
   * Check if a session exists
   */
  static async sessionExists(sessionName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn('tmux', ['has-session', '-t', sessionName]);
      checkProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * List all tmux sessions
   */
  static async listSessions(): Promise<TmuxSession[]> {
    return new Promise((resolve) => {
      const listProcess = spawn('tmux', [
        'list-sessions',
        '-F',
        '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}'
      ]);

      let output = '';
      listProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      listProcess.on('exit', (code) => {
        if (code !== 0) {
          resolve([]);
          return;
        }

        const sessions = output
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const [name, windows, created, attached] = line.split('|');
            return {
              name,
              windows: parseInt(windows) || 0,
              created,
              attached: attached === '1'
            };
          });

        resolve(sessions);
      });
    });
  }

  /**
   * Send a command to a tmux pane
   */
  static async sendCommand(
    sessionName: string, 
    command: string, 
    paneIndex: number = 0
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const sendProcess = spawn('tmux', [
        'send-keys',
        '-t', `${sessionName}:0.${paneIndex}`,
        command,
        'Enter'
      ]);

      sendProcess.on('exit', (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Send text without Enter key
   */
  static async sendText(
    sessionName: string, 
    text: string, 
    paneIndex: number = 0
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const sendProcess = spawn('tmux', [
        'send-keys',
        '-t', `${sessionName}:0.${paneIndex}`,
        text
      ]);

      sendProcess.on('exit', (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Capture output from a tmux pane
   */
  static async capturePane(
    sessionName: string, 
    lines: number = 100, 
    paneIndex: number = 0
  ): Promise<string> {
    return new Promise((resolve) => {
      const captureProcess = spawn('tmux', [
        'capture-pane',
        '-t', `${sessionName}:0.${paneIndex}`,
        '-p',
        '-S', `-${lines}`
      ]);

      let output = '';
      captureProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      captureProcess.on('exit', () => {
        resolve(output);
      });

      // Timeout fallback
      setTimeout(() => resolve(output), 2000);
    });
  }

  /**
   * Create a new window in a session
   */
  static async createWindow(sessionName: string, windowName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const createProcess = spawn('tmux', [
        'new-window',
        '-t', sessionName,
        '-n', windowName
      ]);

      createProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * Split a pane horizontally
   */
  static async splitPaneHorizontal(sessionName: string, paneIndex: number = 0): Promise<boolean> {
    return new Promise((resolve) => {
      const splitProcess = spawn('tmux', [
        'split-window',
        '-h',
        '-t', `${sessionName}:0.${paneIndex}`
      ]);

      splitProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * Split a pane vertically
   */
  static async splitPaneVertical(sessionName: string, paneIndex: number = 0): Promise<boolean> {
    return new Promise((resolve) => {
      const splitProcess = spawn('tmux', [
        'split-window',
        '-v',
        '-t', `${sessionName}:0.${paneIndex}`
      ]);

      splitProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * List panes in a session
   */
  static async listPanes(sessionName: string): Promise<TmuxPane[]> {
    return new Promise((resolve) => {
      const listProcess = spawn('tmux', [
        'list-panes',
        '-t', sessionName,
        '-F',
        '#{session_name}|#{window_index}|#{pane_index}|#{pane_active}'
      ]);

      let output = '';
      listProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      listProcess.on('exit', (code) => {
        if (code !== 0) {
          resolve([]);
          return;
        }

        const panes = output
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const [session, windowIdx, paneIdx, active] = line.split('|');
            return {
              sessionName: session,
              windowIndex: parseInt(windowIdx) || 0,
              paneIndex: parseInt(paneIdx) || 0,
              active: active === '1'
            };
          });

        resolve(panes);
      });
    });
  }

  /**
   * Rename a session
   */
  static async renameSession(oldName: string, newName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const renameProcess = spawn('tmux', [
        'rename-session',
        '-t', oldName,
        newName
      ]);

      renameProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * Set a pane title
   */
  static async setPaneTitle(sessionName: string, title: string, paneIndex: number = 0): Promise<boolean> {
    return new Promise((resolve) => {
      const titleProcess = spawn('tmux', [
        'select-pane',
        '-t', `${sessionName}:0.${paneIndex}`,
        '-T', title
      ]);

      titleProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * Clear a pane
   */
  static async clearPane(sessionName: string, paneIndex: number = 0): Promise<boolean> {
    return new Promise((resolve) => {
      const clearProcess = spawn('tmux', [
        'send-keys',
        '-t', `${sessionName}:0.${paneIndex}`,
        'C-l'
      ]);

      clearProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * Get the number of panes in a session
   */
  static async getPaneCount(sessionName: string): Promise<number> {
    const panes = await this.listPanes(sessionName);
    return panes.length;
  }

  /**
   * Check if tmux is installed and available
   */
  static async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkProcess = spawn('which', ['tmux']);
      checkProcess.on('exit', (code) => resolve(code === 0));
    });
  }

  /**
   * Get tmux version
   */
  static async getVersion(): Promise<string> {
    return new Promise((resolve) => {
      const versionProcess = spawn('tmux', ['-V']);
      
      let output = '';
      versionProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      versionProcess.on('exit', () => {
        resolve(output.trim());
      });

      setTimeout(() => resolve('unknown'), 1000);
    });
  }
}

export default TmuxHelper;