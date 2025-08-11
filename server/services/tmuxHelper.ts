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

  /**
   * Create a Go Wild exploration session with multiple agent panes
   */
  static async createGoWildSession(
    sessionId: string,
    agentCount: number = 5
  ): Promise<boolean> {
    try {
      const sessionName = `goWild-${sessionId.slice(0, 8)}`;
      
      // Create main session
      const created = await this.createSession(sessionName, 'coordinator');
      if (!created) return false;

      // Send initial coordinator message
      await this.sendCommand(sessionName, `echo "Go Wild Exploration Session: ${sessionId}"`);
      await this.sendCommand(sessionName, `echo "Initializing ${agentCount} exploration agents..."`);

      // Create panes for each agent
      for (let i = 0; i < agentCount; i++) {
        if (i > 0) {
          // Split panes for additional agents
          const splitSuccess = i % 2 === 0 
            ? await this.splitPaneHorizontal(sessionName, 0)
            : await this.splitPaneVertical(sessionName, Math.floor(i / 2));
          
          if (!splitSuccess) {
            logger.warn(`Failed to create pane for agent ${i}`);
            continue;
          }
        }

        // Set pane title
        await this.setPaneTitle(sessionName, `Agent-${i}`, i);
        
        // Initialize agent in pane
        await this.sendCommand(
          sessionName, 
          `echo "Explorer Agent ${i} - Ready for exploration"`,
          i
        );
      }

      logger.info(`Created Go Wild tmux session: ${sessionName} with ${agentCount} agents`);
      return true;
    } catch (error) {
      logger.error('Failed to create Go Wild tmux session:', error);
      return false;
    }
  }

  /**
   * Send exploration task to a specific agent pane
   */
  static async sendExplorationTask(
    sessionId: string,
    agentIndex: number,
    task: {
      type: string;
      label: string;
      category: string;
    }
  ): Promise<boolean> {
    const sessionName = `goWild-${sessionId.slice(0, 8)}`;
    
    const command = `echo "[Agent ${agentIndex}] Exploring: ${task.label} (${task.category})"`;
    const success = await this.sendCommand(sessionName, command, agentIndex);
    
    if (success) {
      // Simulate some exploration work
      await this.sendCommand(
        sessionName,
        `echo "  → Analyzing ${task.type}..."`,
        agentIndex
      );
      await this.sendCommand(
        sessionName,
        `echo "  → Generating insights..."`,
        agentIndex
      );
    }
    
    return success;
  }

  /**
   * Capture exploration results from agent pane
   */
  static async captureExplorationResults(
    sessionId: string,
    agentIndex: number
  ): Promise<string> {
    const sessionName = `goWild-${sessionId.slice(0, 8)}`;
    return await this.capturePane(sessionName, 50, agentIndex);
  }

  /**
   * Monitor all Go Wild agent panes
   */
  static async monitorGoWildAgents(sessionId: string): Promise<Map<number, string>> {
    const sessionName = `goWild-${sessionId.slice(0, 8)}`;
    const panes = await this.listPanes(sessionName);
    const results = new Map<number, string>();

    for (const pane of panes) {
      const output = await this.capturePane(sessionName, 20, pane.paneIndex);
      results.set(pane.paneIndex, output);
    }

    return results;
  }

  /**
   * Clean up Go Wild session
   */
  static async cleanupGoWildSession(sessionId: string): Promise<boolean> {
    const sessionName = `goWild-${sessionId.slice(0, 8)}`;
    
    // Send completion message to all panes
    const panes = await this.listPanes(sessionName);
    for (const pane of panes) {
      await this.sendCommand(
        sessionName,
        `echo "Exploration complete. Cleaning up..."`,
        pane.paneIndex
      );
    }

    // Kill the session after a short delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.killSession(sessionName);
  }

  /**
   * Create a visual layout for Go Wild monitoring
   */
  static async createGoWildLayout(sessionId: string): Promise<boolean> {
    const sessionName = `goWild-${sessionId.slice(0, 8)}`;
    
    try {
      // Create session with specific layout
      const created = await this.createSession(sessionName, 'monitor');
      if (!created) return false;

      // Create monitoring dashboard layout
      // Top pane: Overall status
      await this.sendCommand(sessionName, 'echo "═══ Go Wild Exploration Monitor ═══"');
      await this.sendCommand(sessionName, `echo "Session: ${sessionId}"`);
      
      // Split for agent status
      await this.splitPaneHorizontal(sessionName, 0);
      await this.setPaneTitle(sessionName, 'Agents', 1);
      await this.sendCommand(sessionName, 'echo "Agent Status:"', 1);
      
      // Split for discoveries
      await this.splitPaneVertical(sessionName, 0);
      await this.setPaneTitle(sessionName, 'Discoveries', 2);
      await this.sendCommand(sessionName, 'echo "Discoveries:"', 2);
      
      // Split for metrics
      await this.splitPaneVertical(sessionName, 1);
      await this.setPaneTitle(sessionName, 'Metrics', 3);
      await this.sendCommand(sessionName, 'echo "Exploration Metrics:"', 3);

      logger.info(`Created Go Wild monitoring layout: ${sessionName}`);
      return true;
    } catch (error) {
      logger.error('Failed to create Go Wild layout:', error);
      return false;
    }
  }
}

export default TmuxHelper;