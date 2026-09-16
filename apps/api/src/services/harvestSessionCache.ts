import { logger } from '../utils/logger';
import { spawn } from 'child_process';
import type { RedisClientType } from 'redis';
import { pathConfig } from '../config/paths';

const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

// Ensure consistent tmux environment for session visibility
const TMUX_ENV = {
  ...process.env,
  TMUX_TMPDIR: tmuxTmpDir
};

export interface CachedSession {
  sessionName: string;
  farmId?: string;
  paneCount: number;
  createdAt: Date;
  lastSeen: Date;
  status: 'active' | 'inactive';
}

export interface SessionMapping {
  farmId: string;
  sessionName: string;
  createdAt: Date;
}

/**
 * High-performance session cache for Harvest API
 * Eliminates redundant tmux operations and provides fast lookups
 */
export class HarvestSessionCache {
  private redis: RedisClientType | null = null;
  private fallbackCache = new Map<string, CachedSession>();
  private sessionMapping = new Map<string, string>(); // farmId -> sessionName
  private lastTmuxScan = 0;
  private scanCooldown = 5000; // 5 seconds between tmux scans
  private cacheTTL = 300; // 5 minutes cache TTL for active sessions
  private inactiveCacheTTL = 30; // 30 seconds for inactive sessions
  private sessionHealthStatus = new Map<string, { verified: boolean, lastCheck: number }>(); // Track session health
  
  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      // Import Redis client from Redis config
      const { getRedisClient } = await import('../config/redis');
      this.redis = getRedisClient();
      
      if (this.redis) {
        logger.info('[HarvestSessionCache] Redis cache enabled');
        
        // Load existing session mappings from Redis on startup
        await this.loadSessionMappings();
      } else {
        logger.warn('[HarvestSessionCache] Redis not available, using in-memory fallback');
      }
    } catch (error) {
      logger.warn('[HarvestSessionCache] Redis initialization failed, using in-memory fallback:', error);
    }
  }

  private async loadSessionMappings(): Promise<void> {
    if (!this.redis) return;
    
    try {
      const mappings = await this.redis.hGetAll('harvest:session:mappings');
      for (const [farmId, sessionName] of Object.entries(mappings || {})) {
        this.sessionMapping.set(farmId, sessionName);
      }
      logger.debug(`[HarvestSessionCache] Loaded ${this.sessionMapping.size} session mappings from Redis`);
    } catch (error) {
      logger.error('[HarvestSessionCache] Failed to load session mappings:', error);
    }
  }

  /**
   * Get all cached sessions, refreshing from tmux if needed
   */
  async getAllSessions(forceRefresh = false): Promise<CachedSession[]> {
    const now = Date.now();
    const needsScan = forceRefresh || (now - this.lastTmuxScan > this.scanCooldown);
    
    if (needsScan) {
      await this.refreshFromTmux();
      this.lastTmuxScan = now;
    }
    
    return this.getCachedSessions();
  }

  /**
   * Get sessions for a specific farm ID using direct mapping
   */
  async getSessionsForFarm(farmId: string): Promise<CachedSession[]> {
    // Try direct mapping first
    const sessionName = this.sessionMapping.get(farmId);
    if (sessionName) {
      // Verify session still exists before returning
      const session = await this.getSessionByName(sessionName);
      if (session) {
        // Quick verification that session is still valid
        const isValid = await this.verifySessionHealth(sessionName);
        if (isValid) {
          return [session];
        } else {
          // Session is stale, invalidate it
          await this.invalidateSession(sessionName);
          await this.unmapFarmSession(farmId);
        }
      }
    }

    // Fallback to scanning all sessions if no mapping found
    const allSessions = await this.getAllSessions(true); // Force refresh when mapping is missing
    return this.filterSessionsByFarmId(allSessions, farmId);
  }

  /**
   * Get a specific session by name from cache
   */
  async getSessionByName(sessionName: string): Promise<CachedSession | null> {
    const cacheKey = `harvest:session:${sessionName}`;
    
    try {
      if (this.redis) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const cachedStr = typeof cached === 'string' ? cached : cached.toString();
          const session = this.deserializeSession(JSON.parse(cachedStr));
          // Check if cache entry is still valid based on TTL and status
          if (this.isValidCacheEntry(session)) {
            return session;
          } else {
            // Cache expired, trigger background refresh
            this.refreshSession(sessionName).catch(err => 
              logger.debug('[HarvestSessionCache] Background refresh failed:', err)
            );
          }
        }
      } else {
        const cached = this.fallbackCache.get(sessionName);
        if (cached && this.isValidCacheEntry(cached)) {
          return cached;
        }
      }
    } catch (error) {
      logger.error('[HarvestSessionCache] Failed to get cached session:', error);
    }
    
    // Cache miss - try to fetch directly from tmux
    const freshSession = await this.fetchSessionDirectly(sessionName);
    if (freshSession) {
      await this.updateSingleSession(freshSession);
      return freshSession;
    }
    
    return null;
  }

  /**
   * Add or update farm-to-session mapping with retry logic
   */
  async mapFarmToSession(farmId: string, sessionName: string): Promise<void> {
    // Immediately set in memory for fast access
    this.sessionMapping.set(farmId, sessionName);
    
    // Try to verify session exists with retries before mapping
    const sessionExists = await this.verifySessionWithRetry(sessionName, 3, 1000);
    
    if (!sessionExists) {
      logger.warn(`[HarvestSessionCache] Session ${sessionName} not found after retries, creating placeholder`);
      // Create a placeholder that will be refreshed when session actually exists
      await this.createSessionEntry(sessionName, {
        farmId,
        paneCount: 5, // Default assumption
        status: 'launching',
        createdAt: new Date()
      });
    }
    
    try {
      if (this.redis) {
        await this.redis.hSet('harvest:session:mappings', farmId, sessionName);
        logger.debug(`[HarvestSessionCache] Mapped farm ${farmId} to session ${sessionName}`);
      }
    } catch (error) {
      logger.error('[HarvestSessionCache] Failed to store session mapping:', error);
    }
  }
  
  /**
   * Verify session exists with retry logic
   */
  private async verifySessionWithRetry(sessionName: string, maxRetries: number = 3, retryDelay: number = 1000): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const exists = await this.quickSessionCheck(sessionName);
      
      if (exists) {
        logger.debug(`[HarvestSessionCache] Session ${sessionName} found on attempt ${attempt}`);
        return true;
      }
      
      if (attempt < maxRetries) {
        logger.debug(`[HarvestSessionCache] Session ${sessionName} not found, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    return false;
  }

  /**
   * Create a placeholder session entry for immediate UI availability
   */
  async createSessionEntry(sessionName: string, data: {
    farmId: string;
    paneCount: number;
    status: 'launching' | 'active';
    createdAt: Date;
  }): Promise<void> {
    const session: CachedSession = {
      sessionName,
      farmId: data.farmId,
      paneCount: data.paneCount,
      createdAt: data.createdAt,
      lastSeen: new Date(),
      status: data.status === 'launching' ? 'inactive' : 'active'
    };
    
    try {
      // Store in cache
      if (this.redis) {
        const cacheKey = `harvest:session:${sessionName}`;
        // Use setEx (capital E) for Redis v4+
        await this.redis.setEx(
          cacheKey,
          this.cacheTTL,
          JSON.stringify(session)
        );
        logger.debug(`[HarvestSessionCache] Created placeholder session entry for ${sessionName}`);
      } else {
        this.fallbackCache.set(sessionName, session);
      }
    } catch (error) {
      logger.error('[HarvestSessionCache] Failed to create session entry:', error);
      // Fallback to memory cache
      this.fallbackCache.set(sessionName, session);
    }
  }

  /**
   * Remove farm-to-session mapping
   */
  async unmapFarmSession(farmId: string): Promise<void> {
    this.sessionMapping.delete(farmId);
    
    try {
      if (this.redis) {
        await this.redis.hDel('harvest:session:mappings', farmId);
        logger.debug(`[HarvestSessionCache] Unmapped farm ${farmId}`);
      }
    } catch (error) {
      logger.error('[HarvestSessionCache] Failed to remove session mapping:', error);
    }
  }

  /**
   * Invalidate cache for a specific session
   */
  async invalidateSession(sessionName: string): Promise<void> {
    const cacheKey = `harvest:session:${sessionName}`;
    
    try {
      if (this.redis) {
        await this.redis.del(cacheKey);
      } else {
        this.fallbackCache.delete(sessionName);
      }
    } catch (error) {
      logger.error('[HarvestSessionCache] Failed to invalidate session cache:', error);
    }
  }

  /**
   * Check if a session exists without triggering expensive operations
   * Simplified version using direct tmux check as primary method
   */
  async sessionExists(sessionName: string): Promise<boolean> {
    // Direct tmux check is the most reliable
    const exists = await this.quickSessionCheck(sessionName);
    
    if (exists) {
      // Update health status
      const now = Date.now();
      this.sessionHealthStatus.set(sessionName, { verified: true, lastCheck: now });
      
      // If not in cache, fetch and add it
      const cached = await this.getSessionByName(sessionName);
      if (!cached) {
        const session = await this.fetchSessionDirectly(sessionName);
        if (session) {
          await this.updateSingleSession(session);
        }
      }
    } else {
      // Session doesn't exist, update health status
      this.sessionHealthStatus.set(sessionName, { verified: false, lastCheck: Date.now() });
    }
    
    return exists;
  }

  /**
   * Refresh session cache from tmux
   */
  private async refreshFromTmux(): Promise<void> {
    try {
      const sessions = await this.scanTmuxSessions();
      await this.updateCache(sessions);
    } catch (error) {
      logger.error('[HarvestSessionCache] Failed to refresh from tmux:', error);
    }
  }

  /**
   * Scan tmux for all sessions
   */
  private async scanTmuxSessions(): Promise<CachedSession[]> {
    return new Promise((resolve, reject) => {
      const listSessions = spawn('tmux', ['list-sessions', '-F', '#{session_name}:#{session_created}'], {
        env: TMUX_ENV
      });
      let output = '';
      let errorOutput = '';
      
      listSessions.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      listSessions.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      listSessions.on('exit', async (code) => {
        if (code !== 0) {
          if (errorOutput.includes('no server running') || 
              errorOutput.includes('No such file or directory') ||
              errorOutput.includes('error connecting to')) {
            // No tmux server is running or socket doesn't exist
            // Silenced to prevent log spam during development
            // console.log('[HarvestSessionCache] No tmux server running, returning empty sessions');
            resolve([]);
          } else {
            reject(new Error(`tmux list-sessions failed: ${errorOutput}`));
          }
          return;
        }
        
        const sessionLines = output.trim().split('\n').filter(Boolean);
        const sessions: CachedSession[] = [];
        
        for (const line of sessionLines) {
          const [name, created] = line.split(':');
          if (name === 'maifarm-keepalive') continue; // Skip keepalive session
          
          try {
            // Get pane count for this session
            const paneCount = await this.getSessionPaneCount(name);
            
            sessions.push({
              sessionName: name,
              farmId: this.getFarmIdFromSessionName(name),
              paneCount,
              createdAt: new Date(parseInt(created) * 1000),
              lastSeen: new Date(),
              status: 'active'
            });
          } catch (error) {
            // Session might have been destroyed between list and pane check
            logger.debug(`[HarvestSessionCache] Failed to get details for session ${name}:`, error);
          }
        }
        
        resolve(sessions);
      });
      
      listSessions.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get pane count for a session
   */
  private async getSessionPaneCount(sessionName: string): Promise<number> {
    return new Promise((resolve) => {
      const listPanes = spawn('tmux', ['list-panes', '-t', sessionName, '-F', '#{pane_index}'], {
        env: TMUX_ENV
      });
      let output = '';
      
      listPanes.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      listPanes.on('exit', () => {
        const paneCount = output.trim().split('\n').filter(Boolean).length || 1;
        resolve(paneCount);
      });
      
      listPanes.on('error', () => {
        resolve(1); // Fallback to 1 pane
      });
    });
  }

  /**
   * Quick session existence check without full scan
   */
  private async quickSessionCheck(sessionName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const checkSession = spawn('tmux', ['has-session', '-t', sessionName], {
        env: TMUX_ENV
      });
      
      checkSession.on('exit', (code) => {
        resolve(code === 0);
      });
      
      checkSession.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Update cache with fresh session data
   */
  private async updateCache(sessions: CachedSession[]): Promise<void> {
    try {
      for (const session of sessions) {
        await this.updateSingleSession(session);
      }
    } catch (error) {
      logger.error('[HarvestSessionCache] Failed to update cache:', error);
    }
  }
  
  private async updateSingleSession(session: CachedSession): Promise<void> {
    const cacheKey = `harvest:session:${session.sessionName}`;
    const serialized = JSON.stringify(session);
    const ttl = session.status === 'active' ? this.cacheTTL : this.inactiveCacheTTL;
    
    try {
      if (this.redis) {
        // Use setEx (capital E) for Redis v4+
        await this.redis.setEx(cacheKey, ttl, serialized);
      } else {
        this.fallbackCache.set(session.sessionName, session);
      }
      
      // Update health status
      this.sessionHealthStatus.set(session.sessionName, {
        verified: session.status === 'active',
        lastCheck: Date.now()
      });
    } catch (error) {
      logger.error(`[HarvestSessionCache] Failed to update session ${session.sessionName}:`, error);
      // Fallback to memory cache on error
      this.fallbackCache.set(session.sessionName, session);
    }
  }
  
  /**
   * Fetch a single session directly from tmux
   */
  private async fetchSessionDirectly(sessionName: string): Promise<CachedSession | null> {
    try {
      const exists = await this.quickSessionCheck(sessionName);
      if (!exists) return null;
      
      const paneCount = await this.getSessionPaneCount(sessionName);
      const farmId = this.getFarmIdFromSessionName(sessionName);
      
      return {
        sessionName,
        farmId,
        paneCount,
        createdAt: new Date(), // We don't have the exact creation time
        lastSeen: new Date(),
        status: 'active'
      };
    } catch (error) {
      logger.error(`[HarvestSessionCache] Failed to fetch session ${sessionName}:`, error);
      return null;
    }
  }
  
  /**
   * Refresh a specific session in the background
   */
  private async refreshSession(sessionName: string): Promise<void> {
    const session = await this.fetchSessionDirectly(sessionName);
    if (session) {
      await this.updateSingleSession(session);
    } else {
      await this.invalidateSession(sessionName);
    }
  }
  

  /**
   * Get all cached sessions from storage
   */
  private async getCachedSessions(): Promise<CachedSession[]> {
    const sessions: CachedSession[] = [];
    
    try {
      if (this.redis) {
        const keys = await this.redis.keys('harvest:session:*');
        
        // Filter out non-session keys (like harvest:session:mappings which is a hash)
        const sessionKeys = keys.filter(key => 
          !key.endsWith(':mappings') && 
          !key.includes(':mapping')
        );
        
        // Fetch sessions one by one to avoid WRONGTYPE errors from mixed key types
        for (const key of sessionKeys) {
          try {
            const value = await this.redis.get(key);
            if (value && typeof value === 'string') {
              const parsed = JSON.parse(value);
              sessions.push(this.deserializeSession(parsed));
            }
          } catch (err) {
            // Skip invalid entries - might be from other data structures
            logger.debug(`[HarvestSessionCache] Skipping invalid cache entry ${key}:`, err);
          }
        }
      } else {
        // Use in-memory fallback
        for (const session of this.fallbackCache.values()) {
          if (this.isValidCacheEntry(session)) {
            sessions.push(session);
          }
        }
      }
    } catch (error) {
      logger.error('[HarvestSessionCache] Failed to get cached sessions:', error);
    }
    
    return sessions;
  }

  /**
   * Check if cache entry is still valid (for in-memory fallback)
   */
  private isValidCacheEntry(session: CachedSession): boolean {
    const now = Date.now();
    // Ensure lastSeen is a Date object
    const lastSeen = session.lastSeen instanceof Date ? session.lastSeen : new Date(session.lastSeen);
    const age = now - lastSeen.getTime();
    return age < (this.cacheTTL * 1000);
  }
  
  /**
   * Deserialize session from Redis storage (converts date strings to Date objects)
   */
  private deserializeSession(data: any): CachedSession {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      lastSeen: new Date(data.lastSeen)
    };
  }

  /**
   * Verify session health by checking if tmux session still exists
   */
  private async verifySessionHealth(sessionName: string): Promise<boolean> {
    try {
      // Check if session exists in tmux
      const exists = await this.quickSessionCheck(sessionName);
      
      // Update health status
      this.sessionHealthStatus.set(sessionName, {
        verified: exists,
        lastCheck: Date.now()
      });
      
      return exists;
    } catch (error) {
      logger.error(`[HarvestSessionCache] Failed to verify session health for ${sessionName}:`, error);
      return false;
    }
  }

  /**
   * Extract farm ID from session name
   */
  private getFarmIdFromSessionName(sessionName: string): string | undefined {
    // Try to extract farm ID from session name patterns
    
    // Handle Quick Task sessions: quick_{shortId}
    if (sessionName.startsWith('quick_')) {
      const shortId = sessionName.substring(6); // Remove 'quick_' prefix
      
      // Find the reverse mapping
      for (const [farmId, mappedSession] of this.sessionMapping.entries()) {
        if (mappedSession === sessionName) {
          return farmId;
        }
      }
      
      // Try to find a farmId that starts with this shortId
      for (const farmId of this.sessionMapping.keys()) {
        if (farmId.startsWith(shortId)) {
          return farmId;
        }
      }
    }
    
    // Handle regular farm sessions: farm-{farmId} or farm_{farmId}
    if (sessionName.startsWith('farm-') || sessionName.startsWith('farm_')) {
      const separator = sessionName.startsWith('farm-') ? 'farm-' : 'farm_';
      const farmPart = sessionName.substring(separator.length); // Remove prefix
      
      // Find the reverse mapping
      for (const [farmId, mappedSession] of this.sessionMapping.entries()) {
        if (mappedSession === sessionName) {
          return farmId;
        }
      }
      
      // Direct match - the farmPart might be the full farmId
      if (farmPart.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)) {
        return farmPart;
      }
      
      // Fallback: try to find farm ID that starts with this session part
      for (const farmId of this.sessionMapping.keys()) {
        if (farmId.startsWith(farmPart)) {
          return farmId;
        }
      }
    }
    
    // Handle legacy claude_agents session
    if (sessionName === 'claude_agents') {
      return 'default';
    }
    
    return undefined;
  }

  /**
   * Filter sessions by farm ID with improved matching
   */
  private filterSessionsByFarmId(sessions: CachedSession[], farmId: string): CachedSession[] {
    const shortFarmId = farmId.substring(0, 8);
    const isQuickTask = farmId.startsWith('quick-task-');
    
    return sessions.filter(session => {
      // Direct farm ID match
      if (session.farmId === farmId) return true;
      
      if (isQuickTask) {
        const taskIdPart = farmId.replace('quick-task-', '').substring(0, 8);
        return (
          (session.sessionName.startsWith('quick_') || session.sessionName.startsWith('quick-')) &&
          session.sessionName.includes(taskIdPart)
        );
      } else {
        // Farm session pattern matching
        return (
          session.sessionName === `farm-${shortFarmId}` ||
          session.sessionName.includes(shortFarmId)
        );
      }
    });
  }
}

// Singleton instance
export const harvestSessionCache = new HarvestSessionCache();
