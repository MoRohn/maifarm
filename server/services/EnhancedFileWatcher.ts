/**
 * Enhanced File Watcher with Barn Collection Integration
 * Provides advanced file monitoring with automatic collection capabilities
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import chokidar, { FSWatcher } from 'chokidar';
import { logger } from '../utils/logger';
import { barnService as barnCollectionService } from './unified/barnService';

interface FileMetadata {
  path: string;
  size: number;
  hash: string;
  modified: Date;
  created: Date;
  type: string;
  encoding?: string;
}

interface WatchSession {
  id: string;
  rootPath: string;
  watcher: FSWatcher;
  options: WatchOptions;
  statistics: WatchStatistics;
  fileCache: Map<string, FileMetadata>;
  changeBuffer: ChangeEvent[];
  lastFlush: Date;
}

interface WatchOptions {
  depth?: number;
  ignored?: string[];
  followSymlinks?: boolean;
  awaitWriteFinish?: boolean;
  persistent?: boolean;
  usePolling?: boolean;
  interval?: number;
  binaryInterval?: number;
  alwaysStat?: boolean;
  enableBarnCollection?: boolean;
  barnCollectionPolicy?: any;
}

interface WatchStatistics {
  filesWatched: number;
  directoriesWatched: number;
  totalChanges: number;
  changesByType: Record<string, number>;
  errors: number;
  startTime: Date;
  lastActivity: Date;
}

interface ChangeEvent {
  sessionId: string;
  path: string;
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  timestamp: Date;
  metadata?: FileMetadata;
  previousMetadata?: FileMetadata;
  delta?: {
    sizeDiff: number;
    timeDiff: number;
  };
}

export class EnhancedFileWatcher extends EventEmitter {
  private sessions: Map<string, WatchSession> = new Map();
  private globalChangeBuffer: ChangeEvent[] = [];
  private flushInterval?: NodeJS.Timeout;
  private hashCache: Map<string, { hash: string; mtime: number }> = new Map();
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds
  private readonly MAX_BUFFER_SIZE = 1000;
  private readonly HASH_ALGORITHM = 'sha256';

  constructor() {
    super();
    this.initialize();
  }

  private initialize(): void {
    // Start flush interval for buffered changes
    this.flushInterval = setInterval(() => {
      this.flushChangeBuffers();
    }, this.FLUSH_INTERVAL);

    logger.info('EnhancedFileWatcher initialized');
  }

  /**
   * Create a new watch session
   */
  public async createWatchSession(
    rootPath: string,
    options: WatchOptions = {},
    sessionId?: string
  ): Promise<string> {
    try {
      const id = sessionId || `watch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Check if session already exists
      if (this.sessions.has(id)) {
        throw new Error(`Watch session ${id} already exists`);
      }

      // Verify path exists
      const stats = await fs.stat(rootPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path ${rootPath} is not a directory`);
      }

      // Default options
      const finalOptions: WatchOptions = {
        depth: 10,
        ignored: ['**/node_modules/**', '**/.git/**', '**/tmp/**', '**/*.log'],
        followSymlinks: false,
        awaitWriteFinish: true,
        persistent: true,
        usePolling: false,
        interval: 100,
        binaryInterval: 300,
        alwaysStat: true,
        enableBarnCollection: false,
        ...options
      };

      // Create chokidar watcher
      const watcher = chokidar.watch(rootPath, {
        persistent: finalOptions.persistent,
        ignored: finalOptions.ignored,
        ignoreInitial: false,
        followSymlinks: finalOptions.followSymlinks,
        usePolling: finalOptions.usePolling,
        interval: finalOptions.interval,
        binaryInterval: finalOptions.binaryInterval,
        alwaysStat: finalOptions.alwaysStat,
        depth: finalOptions.depth,
        awaitWriteFinish: finalOptions.awaitWriteFinish ? {
          stabilityThreshold: 500,
          pollInterval: 100
        } : false
      });

      // Create session
      const session: WatchSession = {
        id,
        rootPath,
        watcher,
        options: finalOptions,
        statistics: {
          filesWatched: 0,
          directoriesWatched: 0,
          totalChanges: 0,
          changesByType: {},
          errors: 0,
          startTime: new Date(),
          lastActivity: new Date()
        },
        fileCache: new Map(),
        changeBuffer: [],
        lastFlush: new Date()
      };

      // Setup event handlers
      this.setupWatcherEvents(session);

      // Store session
      this.sessions.set(id, session);

      // If barn collection is enabled, start collection
      if (finalOptions.enableBarnCollection && barnCollectionService) {
        const farmId = options.barnCollectionPolicy?.farmId || 'unknown';
        const agentId = options.barnCollectionPolicy?.agentId;
        
        // Use startCollection instead of startSurveillance
        await barnCollectionService.startCollection(
          rootPath,  // workspaceId is the path
          {
            farmId,
            agentId,
            ...options.barnCollectionPolicy
          }
        );
      }

      logger.info(`Created watch session ${id} for path: ${rootPath}`);
      
      this.emit('session:created', { sessionId: id, rootPath, options: finalOptions });

      return id;

    } catch (error) {
      logger.error(`Failed to create watch session for ${rootPath}:`, error);
      throw error;
    }
  }

  /**
   * Setup watcher event handlers
   */
  private setupWatcherEvents(session: WatchSession): void {
    const { watcher, id } = session;

    // File/Directory added
    watcher.on('add', async (filePath, stats) => {
      await this.handleFileEvent(session, 'add', filePath, stats);
    });

    // File changed
    watcher.on('change', async (filePath, stats) => {
      await this.handleFileEvent(session, 'change', filePath, stats);
    });

    // File removed
    watcher.on('unlink', async filePath => {
      await this.handleFileEvent(session, 'unlink', filePath);
    });

    // Directory added
    watcher.on('addDir', async (dirPath, stats) => {
      session.statistics.directoriesWatched++;
      await this.handleFileEvent(session, 'addDir', dirPath, stats);
    });

    // Directory removed
    watcher.on('unlinkDir', async dirPath => {
      session.statistics.directoriesWatched--;
      await this.handleFileEvent(session, 'unlinkDir', dirPath);
    });

    // Ready event
    watcher.on('ready', () => {
      logger.info(`Watch session ${id} ready. Watching ${session.statistics.filesWatched} files and ${session.statistics.directoriesWatched} directories`);
      this.emit('session:ready', { sessionId: id, statistics: session.statistics });
    });

    // Error event
    watcher.on('error', error => {
      session.statistics.errors++;
      logger.error(`Watch session ${id} error:`, error);
      this.emit('session:error', { sessionId: id, error });
    });
  }

  /**
   * Handle file events
   */
  private async handleFileEvent(
    session: WatchSession,
    eventType: ChangeEvent['type'],
    filePath: string,
    stats?: any
  ): Promise<void> {
    try {
      // Update statistics
      session.statistics.totalChanges++;
      session.statistics.changesByType[eventType] = (session.statistics.changesByType[eventType] || 0) + 1;
      session.statistics.lastActivity = new Date();

      // Get previous metadata if exists
      const previousMetadata = session.fileCache.get(filePath);

      // Create new metadata if file exists
      let metadata: FileMetadata | undefined;
      let delta: ChangeEvent['delta'];

      if (eventType !== 'unlink' && eventType !== 'unlinkDir') {
        metadata = await this.getFileMetadata(filePath, stats);
        
        // Calculate delta if previous metadata exists
        if (previousMetadata && metadata) {
          delta = {
            sizeDiff: metadata.size - previousMetadata.size,
            timeDiff: metadata.modified.getTime() - previousMetadata.modified.getTime()
          };
        }

        // Update cache
        session.fileCache.set(filePath, metadata);

        // Update file count
        if (eventType === 'add') {
          session.statistics.filesWatched++;
        }
      } else {
        // Remove from cache
        session.fileCache.delete(filePath);
        
        // Update file count
        if (eventType === 'unlink') {
          session.statistics.filesWatched--;
        }
      }

      // Create change event
      const changeEvent: ChangeEvent = {
        sessionId: session.id,
        path: filePath,
        type: eventType,
        timestamp: new Date(),
        metadata,
        previousMetadata,
        delta
      };

      // Add to buffers
      session.changeBuffer.push(changeEvent);
      this.globalChangeBuffer.push(changeEvent);

      // Emit immediate event for important changes
      if (this.isImportantChange(changeEvent)) {
        this.emit('change:important', changeEvent);
      }

      // Check if buffer should be flushed
      if (session.changeBuffer.length >= this.MAX_BUFFER_SIZE ||
          Date.now() - session.lastFlush.getTime() >= this.FLUSH_INTERVAL) {
        this.flushSessionBuffer(session);
      }

    } catch (error) {
      logger.error(`Error handling file event for ${filePath}:`, error);
      session.statistics.errors++;
    }
  }

  /**
   * Get file metadata
   */
  private async getFileMetadata(filePath: string, stats?: any): Promise<FileMetadata> {
    try {
      // Get stats if not provided
      if (!stats) {
        stats = await fs.stat(filePath);
      }

      // Get file hash (cached)
      const hash = await this.getFileHash(filePath, stats.mtimeMs);

      // Detect file type
      const ext = path.extname(filePath).toLowerCase();
      const type = this.detectFileType(ext);

      return {
        path: filePath,
        size: stats.size,
        hash,
        modified: new Date(stats.mtime),
        created: new Date(stats.birthtime),
        type,
        encoding: this.detectEncoding(ext)
      };

    } catch (error) {
      logger.warn(`Failed to get metadata for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Get file hash with caching
   */
  private async getFileHash(filePath: string, mtime: number): Promise<string> {
    // Check cache
    const cached = this.hashCache.get(filePath);
    if (cached && cached.mtime === mtime) {
      return cached.hash;
    }

    try {
      // Calculate hash
      const content = await fs.readFile(filePath);
      const hash = crypto
        .createHash(this.HASH_ALGORITHM)
        .update(content)
        .digest('hex');

      // Update cache
      this.hashCache.set(filePath, { hash, mtime });

      return hash;

    } catch (error) {
      // Return empty hash on error
      return '';
    }
  }

  /**
   * Detect file type based on extension
   */
  private detectFileType(ext: string): string {
    const typeMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript-react',
      '.js': 'javascript',
      '.jsx': 'javascript-react',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.go': 'go',
      '.rs': 'rust',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.md': 'markdown',
      '.txt': 'text',
      '.log': 'log',
      '.sh': 'shell',
      '.bat': 'batch',
      '.dockerfile': 'dockerfile',
      '.sql': 'sql'
    };

    return typeMap[ext] || 'unknown';
  }

  /**
   * Detect file encoding
   */
  private detectEncoding(ext: string): string {
    const binaryExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
      '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
      '.exe', '.dll', '.so', '.dylib',
      '.mp3', '.mp4', '.avi', '.mov',
      '.doc', '.docx', '.xls', '.xlsx'
    ];

    return binaryExtensions.includes(ext) ? 'binary' : 'utf-8';
  }

  /**
   * Check if a change is important
   */
  private isImportantChange(change: ChangeEvent): boolean {
    // Important file types
    const importantTypes = ['typescript', 'javascript', 'python', 'java', 'go', 'rust'];
    
    // Important events
    const importantEvents = ['add', 'unlink'];

    // Check conditions
    return (
      importantTypes.includes(change.metadata?.type || '') ||
      importantEvents.includes(change.type) ||
      (change.delta && Math.abs(change.delta.sizeDiff) > 10000) // Significant size change
    );
  }

  /**
   * Flush change buffers
   */
  private flushChangeBuffers(): void {
    // Flush each session buffer
    for (const session of this.sessions.values()) {
      if (session.changeBuffer.length > 0) {
        this.flushSessionBuffer(session);
      }
    }

    // Flush global buffer
    if (this.globalChangeBuffer.length > 0) {
      this.emit('changes:batch', this.globalChangeBuffer);
      this.globalChangeBuffer = [];
    }
  }

  /**
   * Flush session buffer
   */
  private flushSessionBuffer(session: WatchSession): void {
    if (session.changeBuffer.length === 0) return;

    // Emit batch event
    this.emit('session:changes', {
      sessionId: session.id,
      changes: session.changeBuffer,
      statistics: session.statistics
    });

    // Clear buffer
    session.changeBuffer = [];
    session.lastFlush = new Date();
  }

  /**
   * Get session statistics
   */
  public getSessionStatistics(sessionId: string): WatchStatistics | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session.statistics } : null;
  }

  /**
   * Get all sessions
   */
  public getAllSessions(): Array<{
    id: string;
    rootPath: string;
    statistics: WatchStatistics;
    options: WatchOptions;
  }> {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      rootPath: session.rootPath,
      statistics: { ...session.statistics },
      options: { ...session.options }
    }));
  }

  /**
   * Get file cache for a session
   */
  public getFileCache(sessionId: string): Map<string, FileMetadata> | null {
    const session = this.sessions.get(sessionId);
    return session ? new Map(session.fileCache) : null;
  }

  /**
   * Stop a watch session
   */
  public async stopWatchSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Watch session ${sessionId} not found`);
    }

    try {
      // Flush any pending changes
      this.flushSessionBuffer(session);

      // Stop barn collection if enabled
      if (session.options.enableBarnCollection && barnCollectionService) {
        await barnCollectionService.stopSurveillance(sessionId);
      }

      // Close watcher
      await session.watcher.close();

      // Remove session
      this.sessions.delete(sessionId);

      // Clear file cache
      for (const filePath of session.fileCache.keys()) {
        this.hashCache.delete(filePath);
      }

      logger.info(`Stopped watch session ${sessionId}`);
      
      this.emit('session:stopped', { sessionId, statistics: session.statistics });

    } catch (error) {
      logger.error(`Failed to stop watch session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Stop all watch sessions
   */
  public async stopAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    
    for (const sessionId of sessionIds) {
      await this.stopWatchSession(sessionId);
    }
  }

  /**
   * Perform deep scan of a directory
   */
  public async deepScan(
    rootPath: string,
    options: {
      includeContent?: boolean;
      maxDepth?: number;
      ignored?: string[];
    } = {}
  ): Promise<Map<string, FileMetadata>> {
    const results = new Map<string, FileMetadata>();
    const { includeContent = false, maxDepth = 10, ignored = [] } = options;

    const scanDir = async (dirPath: string, depth: number = 0): Promise<void> => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          // Check if should be ignored
          const shouldIgnore = ignored.some(pattern => {
            return fullPath.includes(pattern.replace('**/', ''));
          });
          
          if (shouldIgnore) continue;

          if (entry.isDirectory()) {
            await scanDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            try {
              const metadata = await this.getFileMetadata(fullPath);
              results.set(fullPath, metadata);
            } catch (error) {
              logger.warn(`Failed to scan file ${fullPath}:`, error);
            }
          }
        }
      } catch (error) {
        logger.warn(`Failed to scan directory ${dirPath}:`, error);
      }
    };

    await scanDir(rootPath);
    return results;
  }

  /**
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Stop all sessions
    await this.stopAllSessions();

    // Clear caches
    this.hashCache.clear();
    this.globalChangeBuffer = [];

    logger.info('EnhancedFileWatcher shut down');
  }
}

// Export singleton instance
export const enhancedFileWatcher = new EnhancedFileWatcher();