import { TmuxHelper } from './tmuxHelper';
import { logger } from '../utils/logger';
import { Server as SocketIOServer } from 'socket.io';

interface WatchedSession {
  sessionName: string;
  farmId?: string;
  paneCount: number;
  lastOutputs: Map<number, string[]>;
  intervalId?: NodeJS.Timeout;
}

export class TerminalOutputWatcher {
  private static instance: TerminalOutputWatcher;
  private watchedSessions: Map<string, WatchedSession> = new Map();
  private wsServer: SocketIOServer | null = null;
  private checkInterval = 250; // Check every 250ms for more responsive updates
  private batchedUpdates: Map<string, Array<{pane: number, lines: string[]}>> = new Map();
  private batchFlushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_FLUSH_DELAY = 100; // Flush batched updates every 100ms
  private readonly MAX_BATCH_SIZE = 50; // Max lines per batch
  
  private constructor() {
    // Start batch flush interval
    this.startBatchFlushInterval();
  }
  
  static getInstance(): TerminalOutputWatcher {
    if (!TerminalOutputWatcher.instance) {
      TerminalOutputWatcher.instance = new TerminalOutputWatcher();
    }
    return TerminalOutputWatcher.instance;
  }
  
  setWebSocketServer(wsServer: SocketIOServer) {
    this.wsServer = wsServer;
    logger.info('[TerminalOutputWatcher] WebSocket server set');
  }
  
  /**
   * Start watching a tmux session for output changes
   */
  async startWatching(sessionName: string, farmId?: string, paneCount: number = 5) {
    // Check if already watching
    if (this.watchedSessions.has(sessionName)) {
      logger.debug(`[TerminalOutputWatcher] Already watching session: ${sessionName}`);
      return;
    }
    
    logger.info(`[TerminalOutputWatcher] Starting to watch session: ${sessionName} with ${paneCount} panes`);
    
    // Initialize watched session
    const watchedSession: WatchedSession = {
      sessionName,
      farmId,
      paneCount,
      lastOutputs: new Map()
    };
    
    // Get initial output for each pane
    for (let i = 0; i < paneCount; i++) {
      try {
        const output = await TmuxHelper.capturePane(sessionName, 500, i);
        const lines = output.split('\n').filter(line => line.trim());
        watchedSession.lastOutputs.set(i, lines);
      } catch (error) {
        logger.error(`[TerminalOutputWatcher] Error getting initial output for pane ${i}:`, error);
        watchedSession.lastOutputs.set(i, []);
      }
    }
    
    // Set up interval to check for changes
    watchedSession.intervalId = setInterval(async () => {
      await this.checkForChanges(watchedSession);
    }, this.checkInterval);
    
    this.watchedSessions.set(sessionName, watchedSession);
    logger.info(`[TerminalOutputWatcher] Now watching ${this.watchedSessions.size} sessions`);
  }
  
  /**
   * Stop watching a tmux session
   */
  stopWatching(sessionName: string) {
    const watchedSession = this.watchedSessions.get(sessionName);
    if (watchedSession) {
      if (watchedSession.intervalId) {
        clearInterval(watchedSession.intervalId);
      }
      this.watchedSessions.delete(sessionName);
      logger.info(`[TerminalOutputWatcher] Stopped watching session: ${sessionName}`);
    }
  }
  
  /**
   * Check for output changes in a watched session
   */
  private async checkForChanges(watchedSession: WatchedSession) {
    for (let i = 0; i < watchedSession.paneCount; i++) {
      try {
        // Capture current output
        const currentOutput = await TmuxHelper.capturePane(watchedSession.sessionName, 500, i);
        const currentLines = currentOutput.split('\n').filter(line => line.trim());
        
        // Get last known output
        const lastLines = watchedSession.lastOutputs.get(i) || [];
        
        // Check if output has changed
        const hasChanged = this.hasOutputChanged(lastLines, currentLines);
        
        if (hasChanged) {
          // Get only the new lines
          const newLines = this.getNewLines(lastLines, currentLines);
          
          if (newLines.length > 0) {
            // Add to batched updates instead of emitting immediately
            this.addToBatch(watchedSession.sessionName, i, newLines);
            
            // Update last known output
            watchedSession.lastOutputs.set(i, currentLines);
          }
        }
      } catch (error) {
        // Don't log errors for every check, as sessions might be gone
        // Only log if this is the first error for this pane
        if (watchedSession.lastOutputs.has(i)) {
          logger.debug(`[TerminalOutputWatcher] Error checking pane ${i} of session ${watchedSession.sessionName}:`, error);
        }
      }
    }
  }
  
  /**
   * Check if output has changed
   */
  private hasOutputChanged(lastLines: string[], currentLines: string[]): boolean {
    // Simple check: different lengths or last line is different
    if (lastLines.length !== currentLines.length) {
      return true;
    }
    
    // Check if the last few lines are different
    const checkCount = Math.min(5, lastLines.length);
    for (let i = 0; i < checkCount; i++) {
      const lastIdx = lastLines.length - 1 - i;
      const currIdx = currentLines.length - 1 - i;
      if (lastIdx >= 0 && currIdx >= 0) {
        if (lastLines[lastIdx] !== currentLines[currIdx]) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Get only the new lines that were added
   */
  private getNewLines(lastLines: string[], currentLines: string[]): string[] {
    // Find the point where the arrays diverge
    let matchIndex = -1;
    
    // Start from the end of lastLines and look for a match in currentLines
    for (let i = lastLines.length - 1; i >= Math.max(0, lastLines.length - 20); i--) {
      const searchLine = lastLines[i];
      const foundIndex = currentLines.lastIndexOf(searchLine);
      if (foundIndex !== -1) {
        matchIndex = foundIndex;
        break;
      }
    }
    
    // If we found a match, return everything after it
    if (matchIndex !== -1) {
      return currentLines.slice(matchIndex + 1);
    }
    
    // If no match, return the difference in length (new lines added)
    if (currentLines.length > lastLines.length) {
      return currentLines.slice(lastLines.length);
    }
    
    // If complete replacement, return last 10 lines as new
    return currentLines.slice(-10);
  }
  
  /**
   * Emit terminal update via WebSocket
   */
  private emitTerminalUpdate(
    sessionName: string,
    farmId: string | undefined,
    agentId: number,
    newLines: string[],
    fullOutput: string[]
  ) {
    if (!this.wsServer) {
      return;
    }
    
    const updateData = {
      sessionName,
      farmId,
      agentId,
      content: newLines.join('\n'),
      newLines,
      fullOutput: fullOutput.slice(-100), // Send last 100 lines of full output
      timestamp: new Date().toISOString()
    };
    
    // Emit multiple event types for compatibility
    this.wsServer.emit('harvest:terminal:update', updateData);
    this.wsServer.emit('terminal:update', updateData);
    this.wsServer.emit('agent:terminal', updateData);
    
    // Log only significant updates (more than just a prompt change)
    if (newLines.length > 1 || (newLines.length === 1 && newLines[0].length > 50)) {
      logger.debug(`[TerminalOutputWatcher] Emitted update for ${sessionName} agent ${agentId}: ${newLines.length} new lines`);
    }
  }
  
  /**
   * Clean up all watchers
   */
  cleanup() {
    logger.info(`[TerminalOutputWatcher] Cleaning up ${this.watchedSessions.size} watchers`);
    for (const [sessionName, watchedSession] of this.watchedSessions) {
      if (watchedSession.intervalId) {
        clearInterval(watchedSession.intervalId);
      }
    }
    this.watchedSessions.clear();
  }
  
  /**
   * Get list of watched sessions
   */
  getWatchedSessions(): string[] {
    return Array.from(this.watchedSessions.keys());
  }
  
  /**
   * Check if a session is being watched
   */
  isWatching(sessionName: string): boolean {
    return this.watchedSessions.has(sessionName);
  }
  
  /**
   * Simple hash function for quick comparison
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
  
  /**
   * Add terminal update to batch
   */
  private addToBatch(sessionName: string, paneId: number, lines: string[]) {
    const key = `${sessionName}:${paneId}`;
    
    if (!this.batchedUpdates.has(key)) {
      this.batchedUpdates.set(key, []);
    }
    
    const batch = this.batchedUpdates.get(key)!;
    
    // If batch is getting too large, flush immediately
    if (batch.length > 0 && batch[0].lines.length + lines.length > this.MAX_BATCH_SIZE) {
      this.flushBatch(sessionName, paneId);
    }
    
    // Add to batch
    const existingBatch = batch.find(b => b.pane === paneId);
    if (existingBatch) {
      existingBatch.lines.push(...lines);
    } else {
      batch.push({ pane: paneId, lines });
    }
  }
  
  /**
   * Flush a specific batch
   */
  private flushBatch(sessionName: string, paneId: number) {
    const key = `${sessionName}:${paneId}`;
    const batch = this.batchedUpdates.get(key);
    
    if (!batch || batch.length === 0) return;
    
    // Find the watched session
    const watchedSession = this.watchedSessions.get(sessionName);
    if (!watchedSession) return;
    
    // Emit consolidated update for each pane in the batch
    for (const update of batch) {
      if (update.lines.length > 0) {
        this.emitTerminalUpdate(
          sessionName,
          watchedSession.farmId,
          update.pane,
          update.lines,
          [] // We don't need full output for batched updates
        );
      }
    }
    
    // Clear the batch
    this.batchedUpdates.delete(key);
  }
  
  /**
   * Start interval to flush batched updates
   */
  private startBatchFlushInterval() {
    if (this.batchFlushInterval) {
      clearInterval(this.batchFlushInterval);
    }
    
    this.batchFlushInterval = setInterval(() => {
      // Flush all batches
      for (const [key] of this.batchedUpdates) {
        const [sessionName, paneId] = key.split(':');
        this.flushBatch(sessionName, parseInt(paneId, 10));
      }
    }, this.BATCH_FLUSH_DELAY);
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    // Stop all watching
    for (const [sessionName] of this.watchedSessions) {
      this.stopWatching(sessionName);
    }
    
    // Clear batch flush interval
    if (this.batchFlushInterval) {
      clearInterval(this.batchFlushInterval);
      this.batchFlushInterval = null;
    }
    
    // Clear batched updates
    this.batchedUpdates.clear();
  }
}

export const terminalOutputWatcher = TerminalOutputWatcher.getInstance();