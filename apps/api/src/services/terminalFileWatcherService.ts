/**
 * Terminal File Watcher Service
 * Watches terminal output files and emits WebSocket events when they change
 */

import { watch, FSWatcher } from 'chokidar';
import { readFile, stat, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig, getPath } from '../config/paths';
import { cleanTerminalOutput } from '../utils/terminalCleaner';

interface WatchedFile {
  farmId: string;
  agentId: string;
  filePath: string;
  watcher: FSWatcher;
  lastSize: number;
  lastEmit: number;
}

class TerminalFileWatcherService {
  private static instance: TerminalFileWatcherService;
  private watchers: Map<string, WatchedFile> = new Map();
  private emitBuffer: Map<string, string[]> = new Map();
  private emitTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly EMIT_INTERVAL = 50; // ms - OPTIMIZED: Reduced from 100ms for faster updates
  private readonly BUFFER_SIZE = 50; // lines

  private constructor() {
    logger.info(LogCategory.TERMINAL, 'Terminal File Watcher Service initialized');
  }

  static getInstance(): TerminalFileWatcherService {
    if (!this.instance) {
      this.instance = new TerminalFileWatcherService();
    }
    return this.instance;
  }

  /**
   * Start watching a farm's terminal output directory
   */
  async watchFarm(farmId: string, sessionName: string): Promise<void> {
    // Get the terminals directory path
    // CRITICAL FIX: Use MAIBARN_ROOT instead of non-existent MAIBARN_DIR
    const terminalsBasePath = getPath('TERMINALS_DIR') || path.join(pathConfig.getPath('MAIBARN_ROOT'), 'terminals');

    logger.info(LogCategory.TERMINAL, `watchFarm called with farmId: "${farmId}", sessionName: "${sessionName}"`);
    logger.info(LogCategory.TERMINAL, `terminalsBasePath: ${terminalsBasePath}`);

    // CRITICAL: The orchestrator ALWAYS creates logs in full farm ID directory
    // Only use the full farm ID path - no fallbacks needed
    const terminalDir = path.join(terminalsBasePath, farmId); // Always use full farm ID
    let foundFiles: string[] = [];

    // Check if the terminal directory exists
    logger.info(LogCategory.TERMINAL, `Checking directory: ${terminalDir}`);

    if (existsSync(terminalDir)) {
      logger.info(LogCategory.TERMINAL, `Directory exists: ${terminalDir}`);
      foundFiles = await this.findLogFiles(terminalDir);

      if (foundFiles.length > 0) {
        logger.info(LogCategory.TERMINAL, `Found ${foundFiles.length} log files in ${terminalDir}`);
      }
    } else {
      logger.info(LogCategory.TERMINAL, `Terminal directory does not exist, creating: ${terminalDir}`);

      try {
        await mkdir(terminalDir, { recursive: true });
        logger.info(LogCategory.TERMINAL, `Created terminal directory: ${terminalDir}`);
      } catch (error) {
        logger.error(LogCategory.TERMINAL, `Failed to create terminal directory: ${terminalDir}`, error);
        return;
      }

      // Wait a bit for terminal files to be created
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check again for files
      foundFiles = await this.findLogFiles(terminalDir);
    }

    logger.info(LogCategory.TERMINAL, `Starting to watch terminal files for farm ${farmId}`);
    logger.info(LogCategory.TERMINAL, `Using directory: ${terminalDir}`);
    logger.info(LogCategory.TERMINAL, `Found ${foundFiles.length} log files: ${JSON.stringify(foundFiles)}`);

    // Watch each file
    for (const file of foundFiles) {
      const agentId = this.extractAgentId(file);
      logger.info(LogCategory.TERMINAL, `Processing file: ${file}, extracted agentId: ${agentId}`);
      await this.watchFile(farmId, agentId, file, sessionName);
    }

    // Also watch for new files
    this.watchDirectory(farmId, terminalDir, sessionName);

    // ENHANCED: Aggressive polling for the first 30 seconds to catch newly created files
    // This is critical for farms that take time to spawn tmux panes
    logger.info(LogCategory.TERMINAL, `Setting up aggressive polling for terminal files (30 seconds)...`);

    const startTime = Date.now();
    const maxPollTime = 30000; // 30 seconds
    const pollInterval = 500; // Check every 500ms (more aggressive)
    let filesFound = foundFiles.length;

    const checkInterval = setInterval(async () => {
      const elapsed = Date.now() - startTime;

      // Check for new files
      const currentFiles = await this.findLogFiles(terminalDir);

      // If we found new files, start watching them
      if (currentFiles.length > filesFound) {
        logger.info(LogCategory.TERMINAL,
          `Detected ${currentFiles.length - filesFound} new terminal files in ${terminalDir}`);

        const newFiles = currentFiles.slice(filesFound);
        for (const file of newFiles) {
          const agentId = this.extractAgentId(file);
          logger.info(LogCategory.TERMINAL, `Starting to watch new file: ${file} for agent ${agentId}`);
          await this.watchFile(farmId, agentId, file, sessionName);

          // Emit a test event to verify streaming is working
          websocketManager.broadcastToFarm(farmId, 'terminal:file:detected', {
            farmId,
            agentId,
            filePath: file,
            timestamp: new Date()
          });
        }

        filesFound = currentFiles.length;
      }

      // Stop polling after max time or when all expected files are found
      if (elapsed >= maxPollTime) {
        logger.info(LogCategory.TERMINAL,
          `Stopping aggressive polling for ${farmId} after ${elapsed}ms (found ${filesFound} files)`);
        clearInterval(checkInterval);
      }
    }, pollInterval);

    // Also watch for new files continuously via directory watcher
    // This provides redundancy beyond the polling window
  }

  /**
   * Watch a specific terminal output file
   */
  private async watchFile(farmId: string, agentId: string, filePath: string, sessionName: string): Promise<void> {
    const key = `${farmId}:${agentId}`;

    // Skip if already watching
    if (this.watchers.has(key)) {
      return;
    }

    try {
      const stats = await stat(filePath);

      const watcher = watch(filePath, {
        persistent: true,
        usePolling: true, // Use polling for reliability
        interval: 100,
        binaryInterval: 300,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 10
        }
      });

      watcher.on('change', async () => {
        await this.handleFileChange(farmId, agentId, filePath, sessionName);
      });

      this.watchers.set(key, {
        farmId,
        agentId,
        filePath,
        watcher,
        lastSize: stats.size,
        lastEmit: Date.now()
      });

      logger.info(LogCategory.TERMINAL, `Watching terminal file: ${filePath} for agent ${agentId}`);

      // Emit initial content
      await this.handleFileChange(farmId, agentId, filePath, sessionName);

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to watch file ${filePath}:`, error);
    }
  }

  /**
   * Handle file change event
   */
  private async handleFileChange(farmId: string, agentId: string, filePath: string, sessionName: string): Promise<void> {
    const key = `${farmId}:${agentId}`;
    const watchedFile = this.watchers.get(key);

    if (!watchedFile) return;

    try {
      const stats = await stat(filePath);

      // ENHANCED: Log file changes for debugging
      logger.debug(LogCategory.TERMINAL,
        `File change detected: ${filePath} (${stats.size} bytes, was ${watchedFile.lastSize})`);

      // Only read new content
      if (stats.size > watchedFile.lastSize) {
        const newContent = await this.readNewContent(filePath, watchedFile.lastSize, stats.size);

        if (newContent) {
          logger.debug(LogCategory.TERMINAL,
            `New content detected for agent ${agentId}: ${newContent.length} chars`);

          watchedFile.lastSize = stats.size;
          watchedFile.lastEmit = Date.now();

          // CRITICAL: Emit immediately, don't just buffer
          this.bufferAndEmit(farmId, agentId, newContent, sessionName);

          // Also emit directly to ensure delivery
          this.emitTerminalOutput(farmId, agentId, newContent, sessionName);
        }
      } else if (stats.size === 0 && watchedFile.lastSize > 0) {
        // File was truncated - reset tracking
        logger.warn(LogCategory.TERMINAL, `Terminal file truncated: ${filePath}`);
        watchedFile.lastSize = 0;
      }
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Error handling file change:`, error);
    }
  }

  /**
   * Read new content from file
   */
  private async readNewContent(filePath: string, startPos: number, endPos: number): Promise<string> {
    try {
      const content = await readFile(filePath, 'utf8');
      return content.substring(startPos);
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Error reading file:`, error);
      return '';
    }
  }

  /**
   * Buffer and emit terminal output
   */
  private bufferAndEmit(farmId: string, agentId: string, content: string, sessionName: string): void {
    const key = `${farmId}:${agentId}`;

    // CRITICAL: Clean ANSI escape codes from terminal output
    const cleanedContent = cleanTerminalOutput(content, {
      preserveColor: false,
      normalizeLineEndings: true,
      trimEmpty: true
    });

    // Get or create buffer
    let buffer = this.emitBuffer.get(key) || [];
    const lines = cleanedContent.split('\n').filter(line => line.trim());
    buffer.push(...lines);
    this.emitBuffer.set(key, buffer);

    // Clear existing timer
    const timer = this.emitTimers.get(key);
    if (timer) {
      clearTimeout(timer);
    }

    // Emit if buffer is full or set timer
    if (buffer.length >= this.BUFFER_SIZE) {
      this.flushBuffer(farmId, agentId, sessionName);
    } else {
      const newTimer = setTimeout(() => {
        this.flushBuffer(farmId, agentId, sessionName);
      }, this.EMIT_INTERVAL);
      this.emitTimers.set(key, newTimer);
    }
  }

  /**
   * IMMEDIATE emit without buffering - used for critical updates
   */
  private emitTerminalOutput(farmId: string, agentId: string, content: string, sessionName: string): void {
    const normalizedAgentId = typeof agentId === 'string'
      ? parseInt(agentId.replace(/\D/g, ''), 10) || 0
      : agentId;

    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return;

    const eventData = {
      sessionName,
      sessionId: sessionName,
      farmId,
      agentId: normalizedAgentId,
      agentIndex: normalizedAgentId,
      output: content,
      lines,
      timestamp: new Date(),
      immediate: true  // Mark as immediate emission
    };

    // Emit to all possible room variations
    const rooms = [
      `terminal:${sessionName}`,
      `terminal:${farmId}`,
      `farm:${farmId}`,
      `harvest:${farmId}`,
      `farm-${farmId.substring(0, 8)}`
    ];

    for (const room of rooms) {
      websocketManager.sendToRoom(room, 'terminal:output', eventData);
    }

    logger.debug(LogCategory.TERMINAL, `Immediate emit for agent ${normalizedAgentId}: ${lines.length} lines`);
  }

  /**
   * Flush buffer and emit WebSocket event
   */
  private flushBuffer(farmId: string, agentId: string, sessionName: string): void {
    const key = `${farmId}:${agentId}`;
    const buffer = this.emitBuffer.get(key);

    if (!buffer || buffer.length === 0) return;

    // Take last N lines to avoid overwhelming the client
    const linesToSend = buffer.slice(-100);
    const output = linesToSend.join('\n');

    // Clear buffer
    this.emitBuffer.set(key, []);

    // Emit via WebSocket
    const normalizedAgentId = typeof agentId === 'string'
      ? parseInt(agentId.replace(/\D/g, ''), 10) || 0
      : agentId;

    const eventData = {
      sessionName,
      sessionId: sessionName,
      farmId,
      agentId: normalizedAgentId,
      agentIndex: normalizedAgentId, // Some clients use agentIndex
      output,
      lines: linesToSend,
      timestamp: new Date()
    };

    // CRITICAL: Emit to all possible room variations to ensure delivery
    // The frontend may join different room formats
    const rooms = [
      `terminal:${sessionName}`,
      `terminal:${farmId}`,
      `farm:${farmId}`,
      `harvest:${farmId}`,
      `farm-${farmId.substring(0, 8)}` // Short ID room
    ];

    for (const room of rooms) {
      websocketManager.sendToRoom(room, 'terminal:output', eventData);
    }

    // Also broadcast globally to ensure no client misses it
    websocketManager.broadcast('terminal:output', eventData);

    logger.info(LogCategory.TERMINAL, `Emitted terminal output for agent ${normalizedAgentId} to ${rooms.length} rooms: ${linesToSend.length} lines`);
  }

  /**
   * Watch directory for new files
   */
  private watchDirectory(farmId: string, dirPath: string, sessionName: string): void {
    const watcher = watch(dirPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 0
    });

    watcher.on('add', async (filePath) => {
      if (filePath.endsWith('.log')) {
        const agentId = this.extractAgentId(filePath);
        await this.watchFile(farmId, agentId, filePath, sessionName);
      }
    });
  }

  /**
   * Find all log files in directory
   */
  private async findLogFiles(dirPath: string): Promise<string[]> {
    const { readdir } = await import('fs/promises');
    try {
      logger.info(LogCategory.TERMINAL, `Reading directory: ${dirPath}`);
      const files = await readdir(dirPath);
      logger.info(LogCategory.TERMINAL, `All files in directory: ${JSON.stringify(files)}`);

      const logFiles = files
        .filter(file => file.endsWith('.log'))
        .map(file => path.join(dirPath, file));

      logger.info(LogCategory.TERMINAL, `Filtered log files: ${JSON.stringify(logFiles)}`);
      return logFiles;
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Error reading directory ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Extract agent ID from filename
   */
  private extractAgentId(filePath: string): string {
    const filename = path.basename(filePath);
    const match = filename.match(/agent[-_]?(\d+|agent[-_]\d+)/i);
    return match ? match[0] : 'agent-0';
  }

  /**
   * Stop watching a farm
   */
  stopWatching(farmId: string): void {
    // Close all watchers for this farm
    for (const [key, watchedFile] of this.watchers.entries()) {
      if (watchedFile.farmId === farmId) {
        watchedFile.watcher.close();
        this.watchers.delete(key);

        // Clear buffers and timers
        const timer = this.emitTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.emitTimers.delete(key);
        }
        this.emitBuffer.delete(key);
      }
    }

    logger.info(LogCategory.TERMINAL, `Stopped watching terminal files for farm ${farmId}`);
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const [key, watchedFile] of this.watchers.entries()) {
      watchedFile.watcher.close();
    }

    for (const timer of this.emitTimers.values()) {
      clearTimeout(timer);
    }

    this.watchers.clear();
    this.emitTimers.clear();
    this.emitBuffer.clear();

    logger.info(LogCategory.TERMINAL, 'Stopped all terminal file watchers');
  }

  /**
   * Get list of farms being watched
   */
  getWatchedFarms(): string[] {
    const farms = new Set<string>();
    for (const watchedFile of this.watchers.values()) {
      farms.add(watchedFile.farmId);
    }
    return Array.from(farms);
  }

  /**
   * Check if a farm is being watched
   */
  isWatching(farmId: string): boolean {
    for (const watchedFile of this.watchers.values()) {
      if (watchedFile.farmId === farmId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Force check for updates for a specific farm
   * This triggers the watcher to read the latest content immediately
   */
  async checkForUpdates(farmId: string): Promise<void> {
    // Find all watchers for this farm and trigger their update handlers
    for (const [filePath, watchedFile] of this.watchers.entries()) {
      if (watchedFile.farmId === farmId) {
        // Emit a change event to trigger processing
        this.emit('file:check', { farmId, filePath });
      }
    }
  }
}

export const terminalFileWatcherService = TerminalFileWatcherService.getInstance();