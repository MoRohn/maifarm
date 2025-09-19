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
}

class TerminalStreamService extends EventEmitter {
  private static instance: TerminalStreamService;
  private activeStreams: Map<string, TerminalStream> = new Map();
  private outputBuffers: Map<string, string[]> = new Map();
  private flushTimers: Map<string, NodeJS.Timeout> = new Map();

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
   */
  async startStream(
    farmId: string,
    agentId: string,
    sessionName: string,
    paneId: string,
    options: StreamOptions = {}
  ): Promise<void> {
    const streamKey = `${farmId}:${agentId}`;

    // Check if already streaming
    if (this.activeStreams.has(streamKey)) {
      logger.warn(LogCategory.TERMINAL, `Stream already active for ${streamKey}`);
      return;
    }

    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      // Setup output path
      const outputPath = join(
        pathConfig.getTerminalsPath(),
        farmId,
        `agent-${agentId}.log`
      );

      // Ensure directory exists
      await fs.mkdir(join(pathConfig.getTerminalsPath(), farmId), { recursive: true });

      // Create stream object
      const stream: TerminalStream = {
        farmId,
        agentId,
        sessionName,
        paneId,
        outputPath,
        lastPosition: 0,
        isActive: true,
        retryCount: 0
      };

      // Setup tmux pipe-pane
      await this.setupPipePane(stream);

      // Start file watching
      await this.startFileWatching(stream, opts);

      // Store stream
      this.activeStreams.set(streamKey, stream);

      logger.info(LogCategory.TERMINAL, `Started streaming for ${streamKey}`);

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to start stream for ${streamKey}:`, error);

      // Retry if needed
      if (options.maxRetries && options.maxRetries > 0) {
        setTimeout(() => {
          this.startStream(farmId, agentId, sessionName, paneId, {
            ...options,
            maxRetries: options.maxRetries! - 1
          });
        }, opts.retryDelay);
      }
    }
  }

  /**
   * Setup tmux pipe-pane for terminal output capture
   */
  private async setupPipePane(stream: TerminalStream): Promise<void> {
    return new Promise((resolve, reject) => {
      const tmuxCmd = `TMUX_TMPDIR=/tmp tmux pipe-pane -t ${stream.sessionName}:${stream.paneId} -o "cat >> ${stream.outputPath}"`;

      exec(tmuxCmd, (error) => {
        if (error) {
          // Fallback to capture-pane if pipe-pane fails
          this.fallbackToCapture(stream)
            .then(resolve)
            .catch(reject);
        } else {
          logger.debug(LogCategory.TERMINAL, `Pipe-pane setup for ${stream.sessionName}:${stream.paneId}`);
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
        const tmuxCmd = `TMUX_TMPDIR=/tmp tmux capture-pane -t ${stream.sessionName}:${stream.paneId} -p`;

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

    // Clear buffer
    this.outputBuffers.set(streamKey, []);

    // Clean the output (remove control characters)
    const cleanedContent = this.cleanTerminalOutput(content);

    // Send via WebSocket
    websocketManager.sendToRoom(`farm:${farmId}`, 'terminal:output', {
      farmId,
      agentId,
      content: cleanedContent,
      timestamp: new Date().toISOString()
    });

    // Emit local event
    this.emit('output', {
      farmId,
      agentId,
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

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, options.retryDelay || 1000));

    // Restart watching
    if (stream.watcher) {
      await stream.watcher.close();
    }

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

    // Stop file watcher
    if (stream.watcher) {
      await stream.watcher.close();
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

    // Disable pipe-pane
    exec(`TMUX_TMPDIR=/tmp tmux pipe-pane -t ${stream.sessionName}:${stream.paneId}`, (error) => {
      if (error) {
        logger.debug(LogCategory.TERMINAL, 'Error disabling pipe-pane (may already be disabled)');
      }
    });
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