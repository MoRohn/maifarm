/**
 * Terminal Stream Service - Manages terminal output streaming
 *
 * Handles:
 * - Tmux pipe-pane setup for real-time output capture
 * - Terminal output file watching
 * - WebSocket streaming to clients
 * - Error recovery and retry logic
 */

import { EventEmitter } from 'events';
import { exec, spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import path from 'path';
import { FSWatcher, watch } from 'chokidar';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import {
  ensureTmuxTmpDir,
  detectWindowTarget,
  getTmuxPaneRef,
  tmuxSessionExists,
  setupTmuxPipePane
} from '../utils/tmuxHelpers';

interface TerminalStream {
  farmId: string;
  agentId: string;
  sessionName: string;
  paneId: string;
  windowTarget: string;
  paneRef: string;
  paneIndex: number;
  outputPath: string;
  watcher?: FSWatcher;
  lastPosition: number;
  isActive: boolean;
  retryCount: number;
}

interface StreamOptions {
  bufferSize?: number;
  flushInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
  windowTarget?: string;
}

class TerminalStreamService extends EventEmitter {
  private static instance: TerminalStreamService;
  private activeStreams: Map<string, TerminalStream> = new Map();
  private outputBuffers: Map<string, string[]> = new Map();
  private flushTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingSessions: Map<string, { farmId: string; agentCount: number; windowTarget: string }> = new Map();
  private readonly tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

  private readonly DEFAULT_OPTIONS: StreamOptions = {
    bufferSize: 100,
    flushInterval: 100,
    maxRetries: 3,
    retryDelay: 1000
  };

  private constructor() {
    super();
    this.setupCleanupHandlers();
  }

  static getInstance(): TerminalStreamService {
    if (!TerminalStreamService.instance) {
      TerminalStreamService.instance = new TerminalStreamService();
    }
    return TerminalStreamService.instance;
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  private setupCleanupHandlers(): void {
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  /**
   * Start streaming terminal output for an agent
   * Enhanced with session readiness checks and improved retry logic
   */
  async startStream(
    farmId: string,
    agentId: string,
    sessionName: string,
    paneId: string,
    options: StreamOptions = {}
  ): Promise<void> {
    const streamKey = `${farmId}:${agentId}`;
    const normalizedSessionName = this.normalizeSessionName(sessionName);

    // Check if already streaming
    if (this.activeStreams.has(streamKey)) {
      logger.warn(LogCategory.TERMINAL, `Stream already active for ${streamKey}`);
      return;
    }

    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const windowTarget = options.windowTarget || this.getWindowTargetFromPending(normalizedSessionName);

    try {
      // Wait for session to be ready (critical for XenoSync)
      const { paneRef, windowTarget: resolvedWindow } = await this.waitForSessionReady(
        normalizedSessionName,
        paneId,
        windowTarget
      );

      // Setup output path - handle both formats (with or without agent- prefix)
      const agentFileName = agentId.startsWith('agent-')
        ? `${agentId}.log`
        : `agent-${agentId}.log`;
      const outputPath = join(
        pathConfig.getPath('TERMINALS_DIR'),
        farmId,
        agentFileName
      );

      // Ensure directory exists
      await fs.mkdir(join(pathConfig.getPath('TERMINALS_DIR'), farmId), { recursive: true });

      // Create stream object
      const stream: TerminalStream = {
        farmId,
        agentId,
        sessionName: normalizedSessionName,
        paneId,
        windowTarget: resolvedWindow,
        paneRef,
        outputPath,
        lastPosition: 0,
        isActive: true,
        retryCount: 0
      };

      // Setup tmux pipe-pane with retry logic
      await this.setupPipePaneWithRetry(stream, opts);

      // Start file watching
      await this.startFileWatching(stream, opts);

      // Store stream
      this.activeStreams.set(streamKey, stream);

      logger.info(LogCategory.TERMINAL, `Started streaming for ${streamKey}`);

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to start stream for ${streamKey}:`, error);

      // Retry if needed with exponential backoff
      if (opts.maxRetries && opts.maxRetries > 0) {
        const retryDelay = opts.retryDelay! * Math.pow(2, (this.DEFAULT_OPTIONS.maxRetries || 3) - opts.maxRetries);
        logger.info(LogCategory.TERMINAL, `Retrying stream setup for ${streamKey} in ${retryDelay}ms (${opts.maxRetries - 1} retries left)`);
        setTimeout(() => {
          this.startStream(farmId, agentId, normalizedSessionName, paneId, {
            ...options,
            maxRetries: opts.maxRetries! - 1,
            windowTarget
          });
        }, retryDelay);
      }
    }
  }

  /**
   * Wait for tmux session and pane to be ready (simplified)
   */
  private async waitForSessionReady(
    sessionName: string,
    paneId: string,
    windowTarget?: string,
    maxWaitTime: number = 5000
  ): Promise<{ paneRef: string; windowTarget: string }> {
    const startTime = Date.now();
    const checkInterval = 200; // Check less frequently to reduce load
    const normalizedSessionName = this.normalizeSessionName(sessionName);
    const targetIndex = Number.isNaN(Number(paneId)) ? 0 : parseInt(paneId, 10);

    logger.debug(LogCategory.TERMINAL, `Waiting for session ${normalizedSessionName} pane ${targetIndex} to be ready`);

    while (Date.now() - startTime < maxWaitTime) {
      // Simple direct check - use expected window name 'agents'
      const paneRef = `${normalizedSessionName}:agents.${targetIndex}`;
      const checkPaneCmd = `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux list-panes -t ${paneRef} -F '#{pane_id}' 2>/dev/null`;

      try {
        const paneExists = await new Promise<boolean>((resolve) => {
          exec(checkPaneCmd, (error, stdout) => {
            resolve(!error && stdout.trim().length > 0);
          });
        });

        if (paneExists) {
          logger.debug(LogCategory.TERMINAL, `Session ${normalizedSessionName} pane ${targetIndex} ready`);
          return {
            paneRef,
            windowTarget: 'agents'
          };
        }
      } catch {
        // Continue checking
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // Simple fallback - just use the expected pane reference
    // The orchestrator should have created it by now
    logger.warn(
      LogCategory.TERMINAL,
      `Timeout waiting for pane ${targetIndex} after ${maxWaitTime}ms - proceeding with expected reference`
    );

    return {
      paneRef: `${normalizedSessionName}:agents.${targetIndex}`,
      windowTarget: 'agents'
    };
  }

  private async listSessionPanes(sessionName: string): Promise<Array<{ windowIndex: string; paneIndex: string }>> {
    return new Promise(resolve => {
      exec(
        `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux list-panes -a -F '#{session_name} #{window_index} #{pane_index}' | grep '^${sessionName} ' || true`,
        (error, stdout) => {
          if (error || !stdout.trim()) {
            resolve([]);
            return;
          }

          const panes = stdout
            .trim()
            .split('\n')
            .map(line => {
              const [session, windowIndex, paneIndex] = line.split(' ');
              return { session, windowIndex, paneIndex };
            })
            .filter(entry => entry.session === sessionName)
            .map(entry => ({ windowIndex: entry.windowIndex, paneIndex: entry.paneIndex }))
            .sort((a, b) => {
              const aKey = `${a.windowIndex}-${a.paneIndex}`;
              const bKey = `${b.windowIndex}-${b.paneIndex}`;
              return aKey.localeCompare(bKey, undefined, { numeric: true });
            });

          resolve(panes);
        }
      );
    });
  }

  /**
   * Setup tmux pipe-pane with retry logic
   */
  private async setupPipePaneWithRetry(
    stream: TerminalStream,
    options: StreamOptions
  ): Promise<void> {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.setupPipePane(stream);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        logger.warn(LogCategory.TERMINAL,
          `Pipe-pane setup attempt ${attempt}/${maxAttempts} failed for ${stream.sessionName}:${stream.paneId}`);

        if (attempt < maxAttempts) {
          // Wait with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All attempts failed, try fallback
    logger.info(LogCategory.TERMINAL, `All pipe-pane attempts failed, using fallback for ${stream.sessionName}:${stream.paneId}`);
    await this.fallbackToCapture(stream);
  }

  /**
   * Setup tmux pipe-pane for terminal output capture
   */
  private async setupPipePane(stream: TerminalStream): Promise<void> {
    // Get proper pane reference using tmux helpers
    const paneRef = stream.paneRef || `${stream.sessionName}:${stream.windowTarget}.${stream.paneId}`;

    // Ensure the output file exists before setting up pipe-pane
    try {
      await fs.mkdir(path.dirname(stream.outputPath), { recursive: true });
      await fs.writeFile(stream.outputPath, '', { flag: 'a' }); // Create file if doesn't exist
      logger.debug(LogCategory.TERMINAL, `Ensured output file exists: ${stream.outputPath}`);
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to create output file: ${stream.outputPath}`, error);
      throw error;
    }

    return new Promise((resolve, reject) => {
      const tmuxCmd = `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux pipe-pane -t ${paneRef} -o "cat >> ${stream.outputPath}"`;

      exec(tmuxCmd, (error, stdout, stderr) => {
        if (error) {
          logger.error(LogCategory.TERMINAL, `Pipe-pane error: ${stderr || error.message}`);
          reject(error);
        } else {
          logger.debug(LogCategory.TERMINAL, `Pipe-pane setup successful for ${paneRef}`);

          // Send a test message to generate initial output
          const testCmd = `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux send-keys -t ${paneRef} "echo '[Terminal] Stream connected at $(date)'" Enter`;
          exec(testCmd, (testError) => {
            if (testError) {
              logger.warn(LogCategory.TERMINAL, `Failed to send test message to ${paneRef}`);
            }
          });

          resolve();
        }
      });
    });
  }

  /**
   * Fallback to capture-pane method if pipe-pane fails
   */
  private async fallbackToCapture(stream: TerminalStream): Promise<void> {
    logger.info(LogCategory.TERMINAL, `Using capture-pane fallback for ${stream.sessionName}:${stream.paneId}`);

    const captureInterval = setInterval(async () => {
      if (!stream.isActive) {
        clearInterval(captureInterval);
        return;
      }

      try {
        const tmuxCmd = `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux capture-pane -t ${stream.sessionName}:${stream.paneId} -p`;

        exec(tmuxCmd, async (error, stdout) => {
          if (!error && stdout) {
            await fs.appendFile(stream.outputPath, stdout);
          }
        });
      } catch (error) {
        logger.error(LogCategory.TERMINAL, 'Capture-pane error:', error);
      }
    }, 1000); // Capture every second

    // Store interval for cleanup
    this.flushTimers.set(`capture:${stream.farmId}:${stream.agentId}`, captureInterval);
  }

  /**
   * Start watching terminal output file for changes
   */
  private async startFileWatching(stream: TerminalStream, options: StreamOptions): Promise<void> {
    const streamKey = `${stream.farmId}:${stream.agentId}`;

    // Create file if it doesn't exist
    await fs.writeFile(stream.outputPath, '', { flag: 'a' });

    // Setup file watcher
    stream.watcher = watch(stream.outputPath, {
      persistent: true,
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10
      }
    });

    stream.watcher.on('change', async () => {
      if (!stream.isActive) return;

      try {
        const content = await this.readNewContent(stream);
        if (content) {
          this.bufferOutput(streamKey, content, options);
        }
      } catch (error) {
        logger.error(LogCategory.TERMINAL, `Error reading terminal output for ${streamKey}:`, error);
      }
    });

    stream.watcher.on('error', (error) => {
      logger.error(LogCategory.TERMINAL, `Watcher error for ${streamKey}:`, error);
      this.handleWatcherError(stream, options);
    });
  }

  /**
   * Read new content from terminal output file
   */
  private async readNewContent(stream: TerminalStream): Promise<string | null> {
    try {
      const stats = await fs.stat(stream.outputPath);
      const fileSize = stats.size;

      if (fileSize <= stream.lastPosition) {
        return null;
      }

      const buffer = Buffer.alloc(fileSize - stream.lastPosition);
      const fd = await fs.open(stream.outputPath, 'r');

      await fd.read(buffer, 0, buffer.length, stream.lastPosition);
      await fd.close();

      stream.lastPosition = fileSize;

      return buffer.toString('utf-8');

    } catch (error) {
      logger.error(LogCategory.TERMINAL, 'Error reading terminal file:', error);
      return null;
    }
  }

  /**
   * Buffer output before sending to reduce WebSocket traffic
   */
  private bufferOutput(streamKey: string, content: string, options: StreamOptions): void {
    // Get or create buffer
    let buffer = this.outputBuffers.get(streamKey) || [];
    buffer.push(content);
    this.outputBuffers.set(streamKey, buffer);

    // Clear existing timer
    const existingTimer = this.flushTimers.get(streamKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Flush if buffer is full or set timer to flush
    if (buffer.length >= (options.bufferSize || 100)) {
      this.flushBuffer(streamKey);
    } else {
      const timer = setTimeout(() => {
        this.flushBuffer(streamKey);
      }, options.flushInterval || 100);
      this.flushTimers.set(streamKey, timer);
    }
  }

  /**
   * Flush buffered output to WebSocket clients
   */
  private flushBuffer(streamKey: string): void {
    const buffer = this.outputBuffers.get(streamKey);
    if (!buffer || buffer.length === 0) return;

    const [farmId, agentId] = streamKey.split(':');
    const content = buffer.join('');
    const stream = this.activeStreams.get(streamKey);
    const sessionName = stream?.sessionName;
    const agentIndex = Number(agentId);
    const parsedAgentIndex = Number.isNaN(agentIndex)
      ? parseInt(String(agentId).replace(/[^0-9]/g, ''), 10)
      : agentIndex;
    const resolvedAgentIndex = Number.isNaN(parsedAgentIndex)
      ? stream?.paneIndex
      : parsedAgentIndex;

    // Clear buffer
    this.outputBuffers.set(streamKey, []);

    // Clean the output (remove control characters)
    const cleanedContent = this.cleanTerminalOutput(content);

    // Send via WebSocket
    websocketManager.sendToRoom(`farm:${farmId}`, 'terminal:output', {
      farmId,
      agentId,
      sessionName,
      agentIndex: resolvedAgentIndex,
      content: cleanedContent,
      timestamp: new Date().toISOString()
    });

    // Emit local event
    this.emit('output', {
      farmId,
      agentId,
      sessionName,
      agentIndex: resolvedAgentIndex,
      content: cleanedContent
    });
  }

  /**
   * Clean terminal output by removing control characters
   */
  private cleanTerminalOutput(content: string): string {
    // Remove ANSI escape codes
    let cleaned = content.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');

    // Remove other control characters except newline and tab
    cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    // Remove box drawing characters
    cleaned = cleaned.replace(/[╭─╮│╰╯⏵◆✻✽·]/g, '');

    return cleaned;
  }

  /**
   * Handle watcher errors with retry logic
   */
  private async handleWatcherError(stream: TerminalStream, options: StreamOptions): Promise<void> {
    stream.retryCount++;

    if (stream.retryCount > (options.maxRetries || 3)) {
      logger.error(LogCategory.TERMINAL, `Max retries exceeded for ${stream.farmId}:${stream.agentId}`);
      await this.stopStream(stream.farmId, stream.agentId);
      return;
    }

    logger.info(LogCategory.TERMINAL, `Retrying watcher for ${stream.farmId}:${stream.agentId} (attempt ${stream.retryCount})`);

    // Wait before retry with exponential backoff
    const retryDelay = (options.retryDelay || 1000) * Math.pow(2, stream.retryCount - 1);
    await new Promise(resolve => setTimeout(resolve, retryDelay));

    // Close existing watcher properly
    if (stream.watcher) {
      try {
        await stream.watcher.close();
        stream.watcher = undefined;
      } catch (error) {
        logger.warn(LogCategory.TERMINAL, `Error closing watcher: ${error}`);
      }
    }

    // Restart watching
    await this.startFileWatching(stream, options);
  }

  /**
   * Stop streaming for an agent
   */
  async stopStream(farmId: string, agentId: string): Promise<void> {
    const streamKey = `${farmId}:${agentId}`;
    const stream = this.activeStreams.get(streamKey);

    if (!stream) return;

    logger.info(LogCategory.TERMINAL, `Stopping stream for ${streamKey}`);

    // Mark as inactive
    stream.isActive = false;

    // Flush any remaining buffer
    this.flushBuffer(streamKey);

    // Stop file watcher safely
    if (stream.watcher) {
      try {
        await stream.watcher.close();
      } catch (error) {
        logger.warn(LogCategory.TERMINAL, `Error closing watcher for ${streamKey}: ${error}`);
      }
    }

    // Clear timers
    const flushTimer = this.flushTimers.get(streamKey);
    if (flushTimer) {
      clearTimeout(flushTimer);
      this.flushTimers.delete(streamKey);
    }

    const captureTimer = this.flushTimers.get(`capture:${streamKey}`);
    if (captureTimer) {
      clearInterval(captureTimer);
      this.flushTimers.delete(`capture:${streamKey}`);
    }

    // Remove from active streams
    this.activeStreams.delete(streamKey);
    this.outputBuffers.delete(streamKey);

    // Disable pipe-pane using proper pane reference
    try {
      const paneIndex = parseInt(stream.paneId);
      const paneRef = await getTmuxPaneRef(stream.sessionName, paneIndex);
      exec(`TMUX_TMPDIR="${this.tmuxTmpDir}" tmux pipe-pane -t ${paneRef}`, (error) => {
        if (error) {
          logger.debug(LogCategory.TERMINAL, 'Error disabling pipe-pane (may already be disabled)');
        }
      });
    } catch (error) {
      logger.debug(LogCategory.TERMINAL, `Error getting pane reference for cleanup: ${error}`);
    }
  }

  /**
   * Stop all streams for a farm
   */
  async stopFarmStreams(farmId: string): Promise<void> {
    const streamsToStop: string[] = [];

    for (const [key, stream] of this.activeStreams) {
      if (stream.farmId === farmId) {
        streamsToStop.push(key);
      }
    }

    await Promise.all(
      streamsToStop.map(key => {
        const [farmId, agentId] = key.split(':');
        return this.stopStream(farmId, agentId);
      })
    );
  }

  /**
   * Get stream status
   */
  getStreamStatus(farmId: string, agentId: string): boolean {
    return this.activeStreams.has(`${farmId}:${agentId}`);
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): Array<{ farmId: string; agentId: string }> {
    return Array.from(this.activeStreams.keys()).map(key => {
      const [farmId, agentId] = key.split(':');
      return { farmId, agentId };
    });
  }

  /**
   * Get streaming status for a farm's agents
   */
  getStreamingStatus(farmId: string): { [key: string]: boolean } {
    const status: { [key: string]: boolean } = {};

    for (const [key, stream] of this.activeStreams) {
      if (stream.farmId === farmId) {
        status[stream.agentId] = stream.isActive;
      }
    }

    return status;
  }

  /**
   * Get all active streaming status for health monitoring
   */
  getAllStreamingStatus(): { [farmId: string]: { [agentId: string]: boolean } } {
    const allStatus: { [farmId: string]: { [agentId: string]: boolean } } = {};

    for (const [key, stream] of this.activeStreams) {
      if (!allStatus[stream.farmId]) {
        allStatus[stream.farmId] = {};
      }
      allStatus[stream.farmId][stream.agentId] = stream.isActive;
    }

    return allStatus;
  }

  /**
   * Register a pending session from XenoSync
   */
  registerPendingSession(
    farmId: string,
    agentCount: number,
    windowTarget: string = 'agents',
    sessionName?: string
  ): void {
    const normalizedSessionName = this.normalizeSessionName(
      sessionName || `farm-${farmId.substring(0, 8)}`
    );

    this.pendingSessions.set(normalizedSessionName, {
      farmId,
      agentCount,
      windowTarget
    });

    logger.info(
      LogCategory.TERMINAL,
      `Registered pending session ${normalizedSessionName} for farm ${farmId} with ${agentCount} agents`
    );
  }

  /**
   * Get pending session info
   */
  getPendingSessionInfo(sessionName: string): { farmId: string; agentCount: number; windowTarget: string } | undefined {
    return this.pendingSessions.get(sessionName);
  }

  private getWindowTargetFromPending(sessionName: string): string {
    const pending = this.pendingSessions.get(sessionName);
    if (pending?.windowTarget) {
      return pending.windowTarget;
    }
    if (sessionName.startsWith('quick-')) return '0';
    if (sessionName.startsWith('farm-')) return 'agents';
    return '0';
  }

  /**
   * Start streaming for multiple agents in a farm
   * Enhanced with session isolation and pending session support
   */
  async startStreaming(
    farmId: string,
    sessionName: string,
    agents?: Array<{ agentId: string; paneId: string; windowTarget?: string }>,
    options?: StreamOptions
  ): Promise<void> {
    // Clean up farm ID to prevent cross-contamination
    const cleanFarmId = farmId.replace(/^(farm-)?/, '').substring(0, 36);
    const normalizedSessionName = this.normalizeSessionName(sessionName);

    // Check for pending session info to get accurate agent count
    const pendingInfo = this.getPendingSessionInfo(normalizedSessionName);
    const windowTarget = pendingInfo?.windowTarget || options?.windowTarget;

    // If no agents provided, build from pending session or actual panes
    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      let agentCount = pendingInfo?.agentCount;

      // If no pending info, check actual panes in tmux session
      if (!agentCount) {
        try {
          const { stdout } = await new Promise<{stdout: string}>((resolve, reject) => {
            exec(`TMUX_TMPDIR="${this.tmuxTmpDir}" tmux list-panes -t ${normalizedSessionName} 2>/dev/null | wc -l`, (error, stdout) => {
              if (error) reject(error);
              else resolve({ stdout });
            });
          });
          const actualPaneCount = parseInt(stdout.trim()) || 0;
          if (actualPaneCount > 0) {
            agentCount = actualPaneCount;
            logger.info(LogCategory.TERMINAL, `Detected ${actualPaneCount} actual panes in session ${normalizedSessionName}`);
          } else {
            // Default based on session type if no panes found yet
            if (normalizedSessionName.includes('quick')) {
              agentCount = 2; // Quick tasks use 2 agents
            } else {
              agentCount = 1; // Safe default
            }
            logger.info(LogCategory.TERMINAL, `No panes found yet, using default agent count: ${agentCount}`);
          }
        } catch (error) {
          // Session doesn't exist yet, use safe default
          agentCount = 1;
          logger.debug(LogCategory.TERMINAL, `Session ${normalizedSessionName} not found, using default agent count: ${agentCount}`);
        }
      }

      agents = [];
      for (let i = 0; i < agentCount; i++) {
        agents.push({
          agentId: `agent-${i}`,
          paneId: `${i}`,
          windowTarget
        });
      }

      logger.info(LogCategory.TERMINAL, `Built agent list for farm ${cleanFarmId}: ${agentCount} agents`);
    }

    logger.info(LogCategory.TERMINAL, `Starting streaming for farm ${cleanFarmId} (session: ${normalizedSessionName}) with ${agents.length} agents`);

    // Start streams with proper isolation
    const promises = agents.map(agent =>
      this.startStream(
        cleanFarmId,
        agent.agentId,
        normalizedSessionName,
        agent.paneId,
        { ...options, windowTarget: windowTarget || agent.windowTarget }
      ).catch(error => {
        logger.error(LogCategory.TERMINAL, `Failed to start stream for ${cleanFarmId}:${agent.agentId}:`, error);
        // Don't fail entire operation if one agent fails
      })
    );

    await Promise.all(promises);

    // Clean up pending session after successful start
    if (pendingInfo) {
      this.pendingSessions.delete(normalizedSessionName);
    }
  }

  getSessionNamesForFarm(farmId: string): string[] {
    const names = new Set<string>();
    for (const stream of this.activeStreams.values()) {
      if (stream.farmId === farmId) {
        names.add(stream.sessionName);
      }
    }
    return Array.from(names);
  }

  private normalizeSessionName(sessionName: string): string {
    if (!sessionName) return sessionName;
    let normalized = sessionName.trim();

    const replacements: Array<[RegExp, string]> = [
      [/^farm_/, 'farm-'],
      [/^quick_/, 'quick-'],
      [/^wild_/, 'wild-'],
      [/^gowild_/, 'gowild-']
    ];

    for (const [pattern, replacement] of replacements) {
      if (pattern.test(normalized)) {
        normalized = normalized.replace(pattern, replacement);
        break;
      }
    }

    return normalized;
  }

  /**
   * Monitor stream health and restart failed pipe-panes
   */
  async monitorStreamHealth(farmId: string): Promise<void> {
    const streams = Array.from(this.activeStreams.values()).filter(s => s.farmId === farmId);

    for (const stream of streams) {
      try {
        // Check if pipe-pane is still active
        const paneRef = stream.paneRef || `${stream.sessionName}:${stream.windowTarget}.${stream.paneId}`;
        const checkCmd = `TMUX_TMPDIR=${this.tmuxTmpDir} tmux list-panes -t "${paneRef}" -F "#{pane_id}" 2>/dev/null`;

        const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          exec(checkCmd, (error, stdout, stderr) => {
            if (error) {
              resolve({ stdout: '', stderr: stderr || error.message });
            } else {
              resolve({ stdout, stderr });
            }
          });
        });

        if (!stdout.trim()) {
          logger.warn(LogCategory.TERMINAL,
            `Pane ${paneRef} not found, stream may be dead`);

          // Mark stream as inactive but don't restart (pane is gone)
          stream.isActive = false;
          continue;
        }

        // Check if output file is being written to (has recent modifications)
        try {
          const stats = await fs.stat(stream.outputPath);
          const fileAge = Date.now() - stats.mtimeMs;

          // If file hasn't been modified in 60 seconds but stream should be active
          if (fileAge > 60000 && stream.isActive) {
            logger.warn(LogCategory.TERMINAL,
              `Output file for ${paneRef} hasn't been updated in ${Math.floor(fileAge / 1000)}s, attempting pipe-pane restart`);

            // Try to restart pipe-pane
            if (stream.retryCount < 3) {
              stream.retryCount++;
              await this.setupPipePaneWithRetry(stream, this.DEFAULT_OPTIONS);
              logger.info(LogCategory.TERMINAL, `Restarted pipe-pane for ${paneRef} (retry ${stream.retryCount}/3)`);
            } else {
              logger.error(LogCategory.TERMINAL, `Max retries reached for ${paneRef}, giving up`);
              stream.isActive = false;
            }
          }
        } catch (statError) {
          logger.debug(LogCategory.TERMINAL, `Could not stat output file ${stream.outputPath}:`, statError);
        }

      } catch (error) {
        logger.error(LogCategory.TERMINAL, `Error monitoring stream ${stream.farmId}:${stream.agentId}:`, error);
      }
    }
  }

  /**
   * Cleanup all streams
   */
  async cleanup(): Promise<void> {
    logger.info(LogCategory.TERMINAL, 'Cleaning up all terminal streams');

    // Stop all streams
    const promises: Promise<void>[] = [];
    for (const [key] of this.activeStreams) {
      const [farmId, agentId] = key.split(':');
      promises.push(this.stopStream(farmId, agentId));
    }

    await Promise.all(promises);

    // Clear all maps
    this.activeStreams.clear();
    this.outputBuffers.clear();
    this.flushTimers.clear();
  }
}

// Export singleton instance
export const terminalStreamService = TerminalStreamService.getInstance();
export type { StreamOptions };
