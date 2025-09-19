import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';

interface TerminalSession {
  sessionId: string;
  farmId: string;
  agentId: string | number;
  paneId: string;
  output: string[];
  active: boolean;
}

class TerminalStreamService extends EventEmitter {
  private static instance: TerminalStreamService;
  private sessions = new Map<string, TerminalSession>();
  private streamIntervals = new Map<string, NodeJS.Timeout>();

  private constructor() {
    super();
  }

  static getInstance(): TerminalStreamService {
    if (!this.instance) {
      this.instance = new TerminalStreamService();
    }
    return this.instance;
  }

  async startStreaming(sessionId: string, farmId: string, agentId: string | number, paneId: string): Promise<void> {
    logger.info(LogCategory.TERMINAL, `Starting terminal stream for session ${sessionId}, pane ${paneId}`);

    const session: TerminalSession = {
      sessionId,
      farmId,
      agentId,
      paneId,
      output: [],
      active: true
    };

    this.sessions.set(sessionId, session);

    // Set up periodic capture
    const interval = setInterval(async () => {
      if (!session.active) {
        return;
      }

      try {
        const output = await this.capturePane(paneId);
        if (output && output !== session.output[session.output.length - 1]) {
          session.output.push(output);

          // Emit to WebSocket
          websocketManager.emitToFarm(farmId, 'terminal:output', {
            farmId,
            agentId,
            sessionId,
            output,
            timestamp: new Date()
          });

          this.emit('output', { sessionId, output });
        }
      } catch (error) {
        logger.error(LogCategory.TERMINAL, `Error capturing pane ${paneId}:`, error);
      }
    }, 1000); // Capture every second

    this.streamIntervals.set(sessionId, interval);
  }

  async stopStreaming(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.active = false;

    const interval = this.streamIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.streamIntervals.delete(sessionId);
    }

    logger.info(LogCategory.TERMINAL, `Stopped terminal stream for session ${sessionId}`);
  }

  private async capturePane(paneId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const tmuxCmd = spawn('tmux', [
        'capture-pane',
        '-t', paneId,
        '-p'
      ], {
        env: { ...process.env, TMUX_TMPDIR: '/tmp' }
      });

      let output = '';
      let error = '';

      tmuxCmd.stdout.on('data', (data) => {
        output += data.toString();
      });

      tmuxCmd.stderr.on('data', (data) => {
        error += data.toString();
      });

      tmuxCmd.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`tmux capture-pane failed: ${error}`));
        }
      });
    });
  }

  async setupPipePane(sessionName: string, windowIndex: number, paneIndex: number, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const paneTarget = `${sessionName}:${windowIndex}.${paneIndex}`;
      const tmuxCmd = spawn('tmux', [
        'pipe-pane',
        '-t', paneTarget,
        `cat >> ${outputFile}`
      ], {
        env: { ...process.env, TMUX_TMPDIR: '/tmp' }
      });

      tmuxCmd.on('close', (code) => {
        if (code === 0) {
          logger.info(LogCategory.TERMINAL, `Set up pipe-pane for ${paneTarget} to ${outputFile}`);
          resolve();
        } else {
          reject(new Error(`Failed to set up pipe-pane for ${paneTarget}`));
        }
      });
    });
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  getSessionsByFarm(farmId: string): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(s => s.farmId === farmId);
  }

  clearSession(sessionId: string): void {
    this.stopStreaming(sessionId);
    this.sessions.delete(sessionId);
  }

  async stopAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());

    for (const sessionId of sessionIds) {
      await this.stopStreaming(sessionId);
    }

    this.sessions.clear();
    logger.info(LogCategory.TERMINAL, 'Stopped all terminal streams');
  }
}

export const terminalStreamService = TerminalStreamService.getInstance();
export { TerminalStreamService, TerminalSession };