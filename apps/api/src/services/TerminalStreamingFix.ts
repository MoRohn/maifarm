/**
 * Terminal Streaming Fix Service
 * Fixes terminal output streaming and agent name display issues
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as chokidar from 'chokidar';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';

const TMUX_TMP_DIR = '/tmp';

interface StreamingSession {
  farmId: string;
  sessionName: string;
  agentCount: number;
  agents: Map<number, AgentInfo>;
  watchers: Map<number, chokidar.FSWatcher>;
  captureIntervals: Map<number, NodeJS.Timer>;
  isActive: boolean;
}

interface AgentInfo {
  id: number;
  name: string;
  displayName: string;
  logPath: string;
  lastPosition: number;
  outputBuffer: string[];
}

// Fun farm-themed agent names
const AGENT_NAMES = [
  'Billy the Goat',
  'Bessie the Cow',
  'Wilbur the Pig',
  'Charlotte the Spider',
  'Henrietta the Hen'
];

class TerminalStreamingFixService extends EventEmitter {
  private static instance: TerminalStreamingFixService;
  private sessions = new Map<string, StreamingSession>();

  private constructor() {
    super();
    this.startCleanupInterval();
  }

  static getInstance(): TerminalStreamingFixService {
    if (!this.instance) {
      this.instance = new TerminalStreamingFixService();
    }
    return this.instance;
  }

  /**
   * Initialize streaming for a farm with proper agent names
   */
  async initializeStreaming(farmId: string, sessionName: string, agentCount: number): Promise<void> {
    logger.info(LogCategory.TERMINAL, `Initializing streaming fix for farm ${farmId}`);

    // Create session object
    const session: StreamingSession = {
      farmId,
      sessionName,
      agentCount,
      agents: new Map(),
      watchers: new Map(),
      captureIntervals: new Map(),
      isActive: true
    };

    // Initialize agents with proper names
    for (let i = 0; i < agentCount; i++) {
      const displayName = AGENT_NAMES[i % AGENT_NAMES.length];
      const agent: AgentInfo = {
        id: i,
        name: `agent-${i}`,
        displayName,
        logPath: join(pathConfig.getPath('TERMINALS_DIR'), farmId, `agent-${i}.log`),
        lastPosition: 0,
        outputBuffer: []
      };
      session.agents.set(i, agent);
    }

    this.sessions.set(farmId, session);

    // Send initial agent info to frontend
    this.broadcastAgentInfo(session);

    // Setup terminal capture for each agent
    await this.setupTerminalCapture(session);

    // Start monitoring output
    await this.startOutputMonitoring(session);
  }

  /**
   * Setup terminal capture using both pipe-pane and capture-pane fallback
   */
  private async setupTerminalCapture(session: StreamingSession): Promise<void> {
    const { sessionName, agents } = session;

    // Ensure terminal directory exists
    const terminalDir = join(pathConfig.getPath('TERMINALS_DIR'), session.farmId);
    await fs.mkdir(terminalDir, { recursive: true });

    for (const [agentId, agent] of agents) {
      // Create empty log file
      await fs.writeFile(agent.logPath, '', { flag: 'w' });

      // Try to setup pipe-pane first
      const paneRef = `${sessionName}:agents.${agentId}`;
      const pipePaneSuccess = await this.setupPipePane(paneRef, agent.logPath);

      if (!pipePaneSuccess) {
        // Fallback to capture-pane polling
        logger.warn(LogCategory.TERMINAL, `Pipe-pane failed for ${paneRef}, using capture-pane fallback`);
        this.setupCapturePanePolling(session, agentId);
      }
    }
  }

  /**
   * Setup pipe-pane for a specific pane
   */
  private async setupPipePane(paneRef: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const command = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux pipe-pane -t ${paneRef} -o 'cat >> ${outputPath}'`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          logger.error(LogCategory.TERMINAL, `Pipe-pane setup failed: ${stderr || error.message}`);
          resolve(false);
        } else {
          logger.info(LogCategory.TERMINAL, `Pipe-pane setup successful for ${paneRef}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Setup capture-pane polling as fallback
   */
  private setupCapturePanePolling(session: StreamingSession, agentId: number): void {
    const agent = session.agents.get(agentId);
    if (!agent) return;

    const interval = setInterval(async () => {
      if (!session.isActive) {
        clearInterval(interval);
        return;
      }

      const paneRef = `${session.sessionName}:agents.${agentId}`;
      const command = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux capture-pane -t ${paneRef} -p -S -`;

      exec(command, async (error, stdout) => {
        if (!error && stdout) {
          // Append new content to file
          const newContent = stdout.trimEnd() + '\n';
          await fs.appendFile(agent.logPath, newContent).catch(() => {});
        }
      });
    }, 1000); // Capture every second

    session.captureIntervals.set(agentId, interval);
  }

  /**
   * Start monitoring output files for changes
   */
  private async startOutputMonitoring(session: StreamingSession): Promise<void> {
    for (const [agentId, agent] of session.agents) {
      // Setup file watcher
      const watcher = chokidar.watch(agent.logPath, {
        persistent: true,
        usePolling: true, // Use polling for reliability
        interval: 100,
        binaryInterval: 100,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 10
        }
      });

      watcher.on('change', () => this.handleFileChange(session, agentId));
      watcher.on('add', () => this.handleFileChange(session, agentId));

      session.watchers.set(agentId, watcher);

      // Initial read
      this.handleFileChange(session, agentId);
    }
  }

  /**
   * Handle file change event
   */
  private async handleFileChange(session: StreamingSession, agentId: number): Promise<void> {
    const agent = session.agents.get(agentId);
    if (!agent || !session.isActive) return;

    try {
      const stats = await fs.stat(agent.logPath);
      const fileSize = stats.size;

      if (fileSize > agent.lastPosition) {
        // Read new content
        const buffer = Buffer.alloc(fileSize - agent.lastPosition);
        const fd = await fs.open(agent.logPath, 'r');

        await fd.read(buffer, 0, buffer.length, agent.lastPosition);
        await fd.close();

        const newContent = buffer.toString('utf-8');
        agent.lastPosition = fileSize;

        if (newContent.trim()) {
          // Process and send the output
          this.processAndSendOutput(session, agentId, newContent);
        }
      }
    } catch (error) {
      // File might not exist yet or be temporarily locked
      logger.debug(LogCategory.TERMINAL, `Error reading file for agent ${agentId}: ${error}`);
    }
  }

  /**
   * Process and send output to frontend
   */
  private processAndSendOutput(session: StreamingSession, agentId: number, content: string): void {
    const agent = session.agents.get(agentId);
    if (!agent) return;

    // Clean the content (remove control characters)
    const cleanedContent = this.cleanTerminalOutput(content);

    // Buffer the output
    agent.outputBuffer.push(cleanedContent);

    // Limit buffer size
    if (agent.outputBuffer.length > 1000) {
      agent.outputBuffer = agent.outputBuffer.slice(-1000);
    }

    // Send to WebSocket
    const payload = {
      farmId: session.farmId,
      agentId: agentId,
      agentName: agent.displayName,
      content: cleanedContent,
      timestamp: new Date()
    };

    // Broadcast to farm room
    websocketManager.sendToRoom(`farm:${session.farmId}`, 'terminal:output', payload);

    // Also broadcast to terminal-specific room
    websocketManager.sendToRoom(`terminal:${session.farmId}`, 'terminal:output', payload);

    // Log for debugging
    logger.debug(LogCategory.TERMINAL,
      `Sent output for ${agent.displayName} (${cleanedContent.length} chars)`);
  }

  /**
   * Clean terminal output
   */
  private cleanTerminalOutput(content: string): string {
    return content
      // Remove ANSI escape sequences
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\x1b\[?[0-9;]*[A-Za-z]/g, '')
      // Remove other control characters
      .replace(/\x1b/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove box drawing characters if needed
      .replace(/[⏵◆✻✽·╭─╮│╰╯]/g, '');
  }

  /**
   * Broadcast agent info to frontend
   */
  private broadcastAgentInfo(session: StreamingSession): void {
    const agentInfo = Array.from(session.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.displayName,
      status: 'active'
    }));

    const payload = {
      farmId: session.farmId,
      agents: agentInfo
    };

    websocketManager.broadcast('farm:agents:info', payload);
    websocketManager.sendToRoom(`farm:${session.farmId}`, 'farm:agents:info', payload);
  }

  /**
   * Get session by farm ID
   */
  getSession(farmId: string): StreamingSession | undefined {
    return this.sessions.get(farmId);
  }

  /**
   * Stop streaming for a farm
   */
  async stopStreaming(farmId: string): Promise<void> {
    const session = this.sessions.get(farmId);
    if (!session) return;

    session.isActive = false;

    // Stop file watchers
    for (const watcher of session.watchers.values()) {
      await watcher.close();
    }

    // Clear capture intervals
    for (const interval of session.captureIntervals.values()) {
      clearInterval(interval);
    }

    // Remove session
    this.sessions.delete(farmId);

    logger.info(LogCategory.TERMINAL, `Stopped streaming for farm ${farmId}`);
  }

  /**
   * Force capture for all agents (manual trigger)
   */
  async forceCaptureAll(farmId: string): Promise<void> {
    const session = this.sessions.get(farmId);
    if (!session) return;

    for (const agentId of session.agents.keys()) {
      await this.forceCapture(session, agentId);
    }
  }

  /**
   * Force capture for a specific agent
   */
  private async forceCapture(session: StreamingSession, agentId: number): Promise<void> {
    const agent = session.agents.get(agentId);
    if (!agent) return;

    const paneRef = `${session.sessionName}:agents.${agentId}`;
    const command = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux capture-pane -t ${paneRef} -p -S -`;

    return new Promise((resolve) => {
      exec(command, async (error, stdout) => {
        if (!error && stdout) {
          const content = stdout.trimEnd();
          if (content) {
            // Write to file
            await fs.writeFile(agent.logPath, content + '\n');
            // Process immediately
            this.processAndSendOutput(session, agentId, content);
          }
        }
        resolve();
      });
    });
  }

  /**
   * Cleanup inactive sessions periodically
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      for (const [farmId, session] of this.sessions) {
        if (!session.isActive) {
          this.stopStreaming(farmId).catch(() => {});
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Get agent display names for a farm
   */
  getAgentNames(farmId: string): Map<number, string> {
    const session = this.sessions.get(farmId);
    if (!session) return new Map();

    const names = new Map<number, string>();
    for (const [id, agent] of session.agents) {
      names.set(id, agent.displayName);
    }
    return names;
  }
}

export const terminalStreamingFix = TerminalStreamingFixService.getInstance();