import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { logThrottling } from '../utils/logThrottling';

interface CachedTerminalOutput {
  sessionId: string;
  agentId: number;
  output: string;
  timestamp: Date;
  lines: string[];
}

interface SessionCache {
  sessionId: string;
  outputs: Map<number, CachedTerminalOutput[]>; // agentId -> outputs
  lastActivity: Date;
  clientCount: number;
}

/**
 * Cache terminal output for sessions with no connected clients
 * Delivers cached output when clients reconnect
 */
export class TerminalOutputCache extends EventEmitter {
  private static instance: TerminalOutputCache;
  private cache = new Map<string, SessionCache>();
  private readonly MAX_CACHE_SIZE = 50; // Max sessions to cache
  private readonly MAX_OUTPUTS_PER_AGENT = 100; // Max outputs per agent
  private readonly CACHE_TTL = 1800000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    super();
    this.startCleanup();
  }

  static getInstance(): TerminalOutputCache {
    if (!TerminalOutputCache.instance) {
      TerminalOutputCache.instance = new TerminalOutputCache();
    }
    return TerminalOutputCache.instance;
  }

  /**
   * Start periodic cleanup of expired cache entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  /**
   * Add terminal output to cache
   */
  addOutput(sessionId: string, agentId: number, output: string, lines: string[]): void {
    // Always cache output for late-joining clients
    // Even if clients are connected, new clients joining later need the history

    // Get or create session cache
    let cache = this.cache.get(sessionId);
    if (!cache) {
      cache = {
        sessionId,
        outputs: new Map(),
        lastActivity: new Date(),
        clientCount: 0
      };
      this.cache.set(sessionId, cache);
    }

    // Get or create agent output array
    let agentOutputs = cache.outputs.get(agentId);
    if (!agentOutputs) {
      agentOutputs = [];
      cache.outputs.set(agentId, agentOutputs);
    }

    // Add new output
    const cachedOutput: CachedTerminalOutput = {
      sessionId,
      agentId,
      output,
      timestamp: new Date(),
      lines
    };

    agentOutputs.push(cachedOutput);

    // Limit cache size per agent
    if (agentOutputs.length > this.MAX_OUTPUTS_PER_AGENT) {
      agentOutputs.shift(); // Remove oldest
    }

    // Update activity timestamp
    cache.lastActivity = new Date();

    logThrottling.debug(`cache-add-${sessionId}-${agentId}`, `Cached terminal output (${lines.length} lines)`);
  }

  /**
   * Set client count for a session
   */
  setClientCount(sessionId: string, count: number): void {
    const cache = this.cache.get(sessionId);
    if (cache) {
      cache.clientCount = count;
      cache.lastActivity = new Date();
      
      // DON'T clear cache when clients connect - let the handler deliver cached messages first
      // The cache will be cleared by clearSession() after successful delivery
      if (count > 0 && cache.outputs.size > 0) {
        logThrottling.debug(`cache-clients-connected-${sessionId}`, `${count} clients connected - cache has ${cache.outputs.size} agents with output`);
      }
    }
  }

  /**
   * Get cached output for a session and agent when client connects
   */
  getCachedOutput(sessionId: string, agentId?: number): Array<{ agentId: number; outputs: CachedTerminalOutput[] }> {
    const cache = this.cache.get(sessionId);
    if (!cache) {
      return [];
    }

    const results: Array<{ agentId: number; outputs: CachedTerminalOutput[] }> = [];

    if (agentId !== undefined) {
      // Get specific agent output
      const outputs = cache.outputs.get(agentId);
      if (outputs && outputs.length > 0) {
        results.push({ agentId, outputs });
      }
    } else {
      // Get all cached outputs
      for (const [id, outputs] of cache.outputs.entries()) {
        if (outputs.length > 0) {
          results.push({ agentId: id, outputs });
        }
      }
    }

    // Update activity and clear cache after retrieval
    cache.lastActivity = new Date();
    
    logThrottling.debug(`cache-retrieve-${sessionId}`, `Retrieved cached output for ${results.length} agents`);

    return results;
  }

  /**
   * Clear cache for a specific session
   */
  clearSession(sessionId: string): void {
    const cache = this.cache.get(sessionId);
    if (cache) {
      cache.outputs.clear();
      logThrottling.debug(`cache-clear-${sessionId}`, 'Cleared session cache');
    }
  }

  /**
   * Remove a session from cache entirely
   */
  removeSession(sessionId: string): void {
    if (this.cache.delete(sessionId)) {
      logThrottling.debug(`cache-remove-${sessionId}`, 'Removed session from cache');
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalSessions: number;
    totalOutputs: number;
    sessionsWithClients: number;
    oldestEntry: Date | null;
    memoryUsage: {
      estimated: number;
      unit: string;
    };
  } {
    let totalOutputs = 0;
    let sessionsWithClients = 0;
    let oldestEntry: Date | null = null;
    let estimatedMemory = 0;

    for (const cache of this.cache.values()) {
      if (cache.clientCount > 0) {
        sessionsWithClients++;
      }

      for (const outputs of cache.outputs.values()) {
        totalOutputs += outputs.length;
        
        // Estimate memory usage (rough calculation)
        for (const output of outputs) {
          estimatedMemory += output.output.length * 2; // 2 bytes per char (UTF-16)
          estimatedMemory += output.lines.join('').length * 2;
        }
      }

      if (!oldestEntry || cache.lastActivity < oldestEntry) {
        oldestEntry = cache.lastActivity;
      }
    }

    // Convert to appropriate unit
    let memoryValue = estimatedMemory;
    let unit = 'bytes';

    if (memoryValue > 1024 * 1024) {
      memoryValue = Math.round(memoryValue / (1024 * 1024) * 100) / 100;
      unit = 'MB';
    } else if (memoryValue > 1024) {
      memoryValue = Math.round(memoryValue / 1024 * 100) / 100;
      unit = 'KB';
    }

    return {
      totalSessions: this.cache.size,
      totalOutputs,
      sessionsWithClients,
      oldestEntry,
      memoryUsage: {
        estimated: memoryValue,
        unit
      }
    };
  }

  /**
   * Check if session has cached output
   */
  hasCachedOutput(sessionId: string, agentId?: number): boolean {
    const cache = this.cache.get(sessionId);
    if (!cache) return false;

    if (agentId !== undefined) {
      const outputs = cache.outputs.get(agentId);
      return outputs ? outputs.length > 0 : false;
    }

    // Check if any agent has cached output
    for (const outputs of cache.outputs.values()) {
      if (outputs.length > 0) return true;
    }

    return false;
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanup(): void {
    const now = Date.now();
    const sessionsToRemove: string[] = [];

    // Find expired sessions
    for (const [sessionId, cache] of this.cache.entries()) {
      const age = now - cache.lastActivity.getTime();
      
      if (age > this.CACHE_TTL) {
        sessionsToRemove.push(sessionId);
      }
    }

    // Remove expired sessions
    sessionsToRemove.forEach(sessionId => {
      this.cache.delete(sessionId);
    });

    // If still too large, remove oldest sessions
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const sortedSessions = Array.from(this.cache.entries())
        .sort(([,a], [,b]) => a.lastActivity.getTime() - b.lastActivity.getTime());

      const toRemove = sortedSessions.slice(0, sortedSessions.length - this.MAX_CACHE_SIZE);
      toRemove.forEach(([sessionId]) => {
        this.cache.delete(sessionId);
      });

      sessionsToRemove.push(...toRemove.map(([sessionId]) => sessionId));
    }

    if (sessionsToRemove.length > 0) {
      logThrottling.debug('cache-cleanup', `Cleaned up ${sessionsToRemove.length} expired cache entries`);
    }
  }

  /**
   * Force cleanup of all cache entries
   */
  clear(): void {
    this.cache.clear();
    logThrottling.info('cache-clear-all', 'Cleared all terminal output cache');
  }

  /**
   * Destroy the cache and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
    this.removeAllListeners();
    logger.debug(LogCategory.TERMINAL, 'Cache destroyed');
  }
}

export const terminalOutputCache = TerminalOutputCache.getInstance();