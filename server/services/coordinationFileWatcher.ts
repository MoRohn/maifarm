/**
 * Coordination File Watcher
 * Watches coordination files for changes and broadcasts events
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { FSWatcher } from 'fs';
import { debounce } from 'lodash';

interface FileWatcherOptions {
  debounceMs?: number;
  pollInterval?: number;
  maxRetries?: number;
}

export class CoordinationFileWatcher extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private fileCache: Map<string, string> = new Map();
  private pollTimers: Map<string, NodeJS.Timeout> = new Map();
  private retryCount: Map<string, number> = new Map();
  private options: Required<FileWatcherOptions>;
  
  constructor(options: FileWatcherOptions = {}) {
    super();
    this.options = {
      debounceMs: options.debounceMs || 500,
      pollInterval: options.pollInterval || 2000,
      maxRetries: options.maxRetries || 5
    };
  }
  
  /**
   * Start watching a file for changes
   */
  public watchFile(filePath: string, eventName: string): void {
    // Stop any existing watcher for this file
    this.unwatchFile(filePath);
    
    // Initialize retry count
    this.retryCount.set(filePath, 0);
    
    // Try to watch the file
    this.attemptWatch(filePath, eventName);
    
    // Also set up polling as a fallback
    this.setupPolling(filePath, eventName);
  }
  
  /**
   * Attempt to set up file watching with retry logic
   */
  private attemptWatch(filePath: string, eventName: string): void {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log(`[FileWatcher] File does not exist yet: ${filePath}`);
        // Retry after a delay
        this.scheduleRetry(filePath, eventName);
        return;
      }
      
      // Create debounced handler
      const handler = debounce(() => {
        this.handleFileChange(filePath, eventName);
      }, this.options.debounceMs);
      
      // Set up file watcher
      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          handler();
        }
      });
      
      // Handle watcher errors
      watcher.on('error', (error) => {
        console.error(`[FileWatcher] Error watching ${filePath}:`, error);
        this.handleWatchError(filePath, eventName);
      });
      
      // Store the watcher
      this.watchers.set(filePath, watcher);
      
      // Read initial content
      this.readFileContent(filePath, eventName);
      
      console.log(`[FileWatcher] Watching file: ${filePath}`);
      
      // Reset retry count on success
      this.retryCount.set(filePath, 0);
      
    } catch (error) {
      console.error(`[FileWatcher] Failed to watch ${filePath}:`, error);
      this.handleWatchError(filePath, eventName);
    }
  }
  
  /**
   * Handle watch errors with retry logic
   */
  private handleWatchError(filePath: string, eventName: string): void {
    const retries = this.retryCount.get(filePath) || 0;
    
    if (retries < this.options.maxRetries) {
      this.scheduleRetry(filePath, eventName);
    } else {
      console.error(`[FileWatcher] Max retries reached for ${filePath}`);
      this.emit('watch:error', { filePath, eventName, error: 'Max retries exceeded' });
    }
  }
  
  /**
   * Schedule a retry attempt
   */
  private scheduleRetry(filePath: string, eventName: string): void {
    const retries = this.retryCount.get(filePath) || 0;
    this.retryCount.set(filePath, retries + 1);
    
    const delay = Math.min(1000 * Math.pow(2, retries), 30000); // Exponential backoff, max 30s
    
    setTimeout(() => {
      console.log(`[FileWatcher] Retrying watch for ${filePath} (attempt ${retries + 1})`);
      this.attemptWatch(filePath, eventName);
    }, delay);
  }
  
  /**
   * Set up polling as a fallback mechanism
   */
  private setupPolling(filePath: string, eventName: string): void {
    // Clear any existing poll timer
    const existingTimer = this.pollTimers.get(filePath);
    if (existingTimer) {
      clearInterval(existingTimer);
    }
    
    // Set up new poll timer
    const timer = setInterval(() => {
      this.pollFile(filePath, eventName);
    }, this.options.pollInterval);
    
    this.pollTimers.set(filePath, timer);
  }
  
  /**
   * Poll a file for changes
   */
  private pollFile(filePath: string, eventName: string): void {
    try {
      if (!fs.existsSync(filePath)) {
        // File doesn't exist yet, keep polling
        return;
      }
      
      // If we don't have a watcher, try to set one up
      if (!this.watchers.has(filePath)) {
        this.attemptWatch(filePath, eventName);
      }
      
      // Read and compare content
      this.readFileContent(filePath, eventName);
      
    } catch (error) {
      // Silently continue polling
    }
  }
  
  /**
   * Handle file change event
   */
  private handleFileChange(filePath: string, eventName: string): void {
    this.readFileContent(filePath, eventName);
  }
  
  /**
   * Read file content and emit if changed
   */
  private readFileContent(filePath: string, eventName: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const cachedContent = this.fileCache.get(filePath);
      
      // Check if content has changed
      if (content !== cachedContent) {
        this.fileCache.set(filePath, content);
        
        try {
          const data = JSON.parse(content);
          this.emit(eventName, data);
          this.emit('file:changed', { filePath, eventName, data });
        } catch (parseError) {
          console.error(`[FileWatcher] Failed to parse ${filePath}:`, parseError);
          this.emit('parse:error', { filePath, eventName, error: parseError });
        }
      }
    } catch (error) {
      // File might have been deleted or is temporarily inaccessible
      if (error.code !== 'ENOENT') {
        console.error(`[FileWatcher] Failed to read ${filePath}:`, error);
      }
    }
  }
  
  /**
   * Stop watching a file
   */
  public unwatchFile(filePath: string): void {
    // Close watcher
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
    }
    
    // Clear poll timer
    const timer = this.pollTimers.get(filePath);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(filePath);
    }
    
    // Clear cache
    this.fileCache.delete(filePath);
    this.retryCount.delete(filePath);
  }
  
  /**
   * Stop all watchers
   */
  public destroy(): void {
    // Close all watchers
    for (const [filePath] of this.watchers) {
      this.unwatchFile(filePath);
    }
    
    // Remove all listeners
    this.removeAllListeners();
    
    console.log('[FileWatcher] Destroyed');
  }
  
  /**
   * Get watcher statistics
   */
  public getStats(): any {
    return {
      watchedFiles: Array.from(this.watchers.keys()),
      polledFiles: Array.from(this.pollTimers.keys()),
      cachedFiles: Array.from(this.fileCache.keys()),
      retryStats: Array.from(this.retryCount.entries()).map(([file, count]) => ({ file, retries: count }))
    };
  }
}

// Export singleton instance
export const fileWatcher = new CoordinationFileWatcher();