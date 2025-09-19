/**
 * Coordination File Watcher
 * Watches coordination files for multi-agent updates with better reliability
 */

import { EventEmitter } from 'events';
import { watch, FSWatcher, existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import * as path from 'path';

interface WatchedFile {
  path: string;
  watcher: FSWatcher | null;
  lastContent: string | null;
  lastModified: number;
  retryCount: number;
  eventName: string;
}

export class CoordinationFileWatcher extends EventEmitter {
  private watchedFiles: Map<string, WatchedFile> = new Map();
  private watchedDirectories: Map<string, FSWatcher> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly MAX_RETRY_COUNT = 5;
  private readonly RETRY_DELAY = 2000;
  private readonly CHECK_INTERVAL = 3000;
  private readonly DEBOUNCE_TIME = 100;
  private readonly MAX_WATCHERS = 10; // Limit individual file watchers
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.startPeriodicCheck();
  }

  /**
   * Watch a file for changes
   */
  public watchFile(filePath: string, eventName: string) {
    // Don't re-watch if already watching
    if (this.watchedFiles.has(filePath)) {
      return;
    }

    // If we have too many individual file watchers, use directory watching instead
    if (this.watchedFiles.size >= this.MAX_WATCHERS) {
      this.watchDirectory(path.dirname(filePath), eventName);
      return;
    }

    const watchedFile: WatchedFile = {
      path: filePath,
      watcher: null,
      lastContent: null,
      lastModified: 0,
      retryCount: 0,
      eventName
    };

    this.watchedFiles.set(filePath, watchedFile);
    
    // Use async setup to prevent blocking startup
    setImmediate(() => {
      this.setupWatcher(watchedFile);
      this.readFileContent(watchedFile);
    });
  }

  /**
   * Watch a directory for file changes (more efficient for many files)
   */
  public watchDirectory(dirPath: string, eventName: string) {
    if (this.watchedDirectories.has(dirPath)) {
      return;
    }

    try {
      if (!existsSync(dirPath)) {
        // Directory doesn't exist yet - this is normal during initialization
        return;
      }

      const watcher = watch(dirPath, { persistent: false }, (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
          const filePath = path.join(dirPath, filename);
          // Debounce directory changes
          this.debounceDirectoryChange(filePath, eventName, eventType);
        }
      });

      watcher.on('error', (error) => {
        console.error(`[FileWatcher] Directory watch error for ${dirPath}:`, error);
        this.watchedDirectories.delete(dirPath);
      });

      this.watchedDirectories.set(dirPath, watcher);
      // Successfully watching directory
    } catch (error) {
      console.error(`[FileWatcher] Failed to watch directory ${dirPath}:`, error);
    }
  }

  /**
   * Debounce directory change events
   */
  private debounceDirectoryChange(filePath: string, eventName: string, eventType: string) {
    const debounceKey = `dir:${filePath}`;
    
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(debounceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      if (eventType !== 'rename' && existsSync(filePath)) {
        try {
          const content = await readFile(filePath, 'utf-8');
          const parsedContent = JSON.parse(content);
          this.emit(eventName, parsedContent);
          this.emit('file:changed', {
            path: filePath,
            eventName,
            data: parsedContent
          });
        } catch (error) {
          console.warn(`[FileWatcher] Failed to process directory change for ${filePath}:`, error);
        }
      }
      this.debounceTimers.delete(debounceKey);
    }, this.DEBOUNCE_TIME);

    this.debounceTimers.set(debounceKey, timer);
  }

  /**
   * Stop watching a file
   */
  public unwatchFile(filePath: string) {
    const watchedFile = this.watchedFiles.get(filePath);
    if (watchedFile) {
      if (watchedFile.watcher) {
        watchedFile.watcher.close();
      }
      this.watchedFiles.delete(filePath);
      
      // Clear any pending debounce timer
      const timer = this.debounceTimers.get(filePath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(filePath);
      }
    }
  }

  /**
   * Setup file watcher with error handling
   */
  private setupWatcher(watchedFile: WatchedFile) {
    try {
      // Check if file exists
      if (!existsSync(watchedFile.path)) {
        // File doesn't exist yet - will retry in periodic check (no need to log repeatedly)
        return;
      }

      // Close existing watcher if any
      if (watchedFile.watcher) {
        watchedFile.watcher.close();
      }

      // Create new watcher
      watchedFile.watcher = watch(watchedFile.path, { persistent: false }, (eventType) => {
        // Debounce file change events
        this.debounceFileChange(watchedFile, eventType);
      });

      watchedFile.watcher.on('error', (error) => {
        console.error(`[FileWatcher] Error watching ${watchedFile.path}:`, error);
        this.handleWatcherError(watchedFile);
      });

      // Reset retry count on successful setup
      watchedFile.retryCount = 0;
      
      // Temporarily disable file watching logs to prevent startup hang
      // console.log(`[FileWatcher] Now watching: ${watchedFile.path}`);
    } catch (error) {
      console.error(`[FileWatcher] Failed to setup watcher for ${watchedFile.path}:`, error);
      this.handleWatcherError(watchedFile);
    }
  }

  /**
   * Debounce file change events
   */
  private debounceFileChange(watchedFile: WatchedFile, eventType: string) {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(watchedFile.path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.handleFileChange(watchedFile, eventType);
      this.debounceTimers.delete(watchedFile.path);
    }, this.DEBOUNCE_TIME);

    this.debounceTimers.set(watchedFile.path, timer);
  }

  /**
   * Handle file change event
   */
  private async handleFileChange(watchedFile: WatchedFile, eventType: string) {
    if (eventType === 'rename') {
      // File was deleted or renamed
      console.log(`[FileWatcher] File renamed/deleted: ${watchedFile.path}`);
      this.handleWatcherError(watchedFile);
      return;
    }

    await this.readFileContent(watchedFile);
  }

  /**
   * Read and process file content
   */
  private async readFileContent(watchedFile: WatchedFile) {
    try {
      // Get file stats
      const stats = await stat(watchedFile.path);
      const modifiedTime = stats.mtimeMs;

      // Skip if file hasn't been modified
      if (modifiedTime <= watchedFile.lastModified) {
        return;
      }

      // Read file content
      const content = await readFile(watchedFile.path, 'utf-8');
      
      // Skip if content hasn't changed
      if (content === watchedFile.lastContent) {
        watchedFile.lastModified = modifiedTime;
        return;
      }

      // Parse JSON content
      let parsedContent: any = null;
      try {
        parsedContent = JSON.parse(content);
      } catch (parseError) {
        // File might be partially written, will retry
        console.warn(`[FileWatcher] Failed to parse JSON from ${watchedFile.path}, will retry`);
        return;
      }

      // Update tracked state
      watchedFile.lastContent = content;
      watchedFile.lastModified = modifiedTime;
      watchedFile.retryCount = 0;

      // Emit change event
      this.emit(watchedFile.eventName, parsedContent);
      
      // Also emit generic file changed event
      this.emit('file:changed', {
        path: watchedFile.path,
        eventName: watchedFile.eventName,
        data: parsedContent
      });

    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist
        // File not found - this is expected for new files
        watchedFile.lastContent = null;
        watchedFile.lastModified = 0;
      } else {
        console.error(`[FileWatcher] Error reading ${watchedFile.path}:`, error);
      }
    }
  }

  /**
   * Handle watcher errors with retry logic
   */
  private handleWatcherError(watchedFile: WatchedFile) {
    // Close the failed watcher
    if (watchedFile.watcher) {
      watchedFile.watcher.close();
      watchedFile.watcher = null;
    }

    // Increment retry count
    watchedFile.retryCount++;

    if (watchedFile.retryCount <= this.MAX_RETRY_COUNT) {
      // Schedule retry
      setTimeout(() => {
        if (this.watchedFiles.has(watchedFile.path)) {
          console.log(`[FileWatcher] Retrying watch for ${watchedFile.path} (attempt ${watchedFile.retryCount})`);
          this.setupWatcher(watchedFile);
        }
      }, this.RETRY_DELAY * watchedFile.retryCount);
    } else {
      console.error(`[FileWatcher] Max retries exceeded for ${watchedFile.path}`);
      this.emit('watch:error', {
        filePath: watchedFile.path,
        message: 'Max retry count exceeded'
      });
    }
  }

  /**
   * Periodic check for file changes (backup mechanism)
   */
  private startPeriodicCheck() {
    this.checkInterval = setInterval(async () => {
      for (const watchedFile of this.watchedFiles.values()) {
        // Setup watcher if it doesn't exist
        if (!watchedFile.watcher && watchedFile.retryCount <= this.MAX_RETRY_COUNT) {
          this.setupWatcher(watchedFile);
        }
        
        // Also do a manual check as backup
        await this.readFileContent(watchedFile);
      }
    }, this.CHECK_INTERVAL);
  }

  /**
   * Get statistics about watched files
   */
  public getStats() {
    const stats = {
      totalWatched: this.watchedFiles.size,
      activeWatchers: 0,
      failedWatchers: 0,
      files: [] as any[]
    };

    for (const [filePath, watchedFile] of this.watchedFiles) {
      if (watchedFile.watcher) {
        stats.activeWatchers++;
      } else {
        stats.failedWatchers++;
      }

      stats.files.push({
        path: filePath,
        hasWatcher: !!watchedFile.watcher,
        retryCount: watchedFile.retryCount,
        lastModified: watchedFile.lastModified,
        hasContent: !!watchedFile.lastContent
      });
    }

    return stats;
  }

  /**
   * Clean up resources
   */
  public destroy() {
    // Stop periodic check
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }

    // Close directory watchers
    for (const watcher of this.watchedDirectories.values()) {
      watcher.close();
    }
    this.watchedDirectories.clear();
    this.debounceTimers.clear();

    // Close all watchers
    for (const watchedFile of this.watchedFiles.values()) {
      if (watchedFile.watcher) {
        watchedFile.watcher.close();
      }
    }
    this.watchedFiles.clear();

    this.removeAllListeners();
    console.log('[FileWatcher] Destroyed');
  }
}

// Export singleton instance
export const fileWatcher = new CoordinationFileWatcher();