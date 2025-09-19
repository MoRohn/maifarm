/**
 * Session Controller
 * Centralized tmux session management to prevent conflicts and race conditions
 * Provides atomic session operations with unique naming and lifecycle management
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';

export interface TmuxSession {
  id: string;
  farmId: string;
  sessionName: string;
  agentCount: number;
  status: 'creating' | 'active' | 'stopping' | 'stopped' | 'error';
  createdAt: Date;
  lastActivity: Date;
  panes: TmuxPane[];
  config: SessionConfig;
}

export interface TmuxPane {
  index: number;
  id: string;
  agentId: string;
  status: 'starting' | 'ready' | 'active' | 'idle' | 'error';
  lastOutput: string;
  lastActivity: Date;
}

export interface SessionConfig {
  windowName: string;
  layout: 'tiled' | 'even-horizontal' | 'even-vertical' | 'main-horizontal' | 'main-vertical';
  mouseSupport: boolean;
  aggressiveResize: boolean;
  statusBar: boolean;
  prefix?: string;
}

export interface SessionCreateOptions {
  farmId: string;
  agentCount: number;
  config?: Partial<SessionConfig>;
  timeout?: number; // Creation timeout in ms
}

/**
 * Centralized session controller to prevent conflicts
 */
export class SessionController extends EventEmitter {
  private redis: Redis;
  private sessions: Map<string, TmuxSession> = new Map();
  private readonly keyPrefix = 'maifarm:sessions:';
  private readonly lockPrefix = 'maifarm:session-lock:';
  private readonly defaultConfig: SessionConfig = {
    windowName: 'agents',
    layout: 'tiled',
    mouseSupport: true,
    aggressiveResize: true,
    statusBar: true
  };

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.setupCleanupMonitoring();
  }

  /**
   * Create a new tmux session with atomic locking
   */
  async createSession(options: SessionCreateOptions): Promise<TmuxSession> {
    const sessionId = uuidv4();
    const sessionName = this.generateUniqueSessionName(options.farmId);
    const timeout = options.timeout || 60000; // 60 second default timeout
    
    // Acquire distributed lock
    const lockKey = `${this.lockPrefix}${sessionName}`;
    const lockValue = uuidv4();
    const lockTTL = Math.floor(timeout / 1000) + 30; // Lock TTL is timeout + 30s buffer
    
    const lockAcquired = await this.redis.set(lockKey, lockValue, 'PX', timeout, 'NX');
    if (!lockAcquired) {
      throw new Error(`Session name ${sessionName} is already being created`);
    }

    try {
      // Check if session already exists in tmux
      const existingSession = await this.checkTmuxSessionExists(sessionName);
      if (existingSession) {
        throw new Error(`Session ${sessionName} already exists in tmux`);
      }

      const session: TmuxSession = {
        id: sessionId,
        farmId: options.farmId,
        sessionName,
        agentCount: options.agentCount,
        status: 'creating',
        createdAt: new Date(),
        lastActivity: new Date(),
        panes: [],
        config: { ...this.defaultConfig, ...options.config }
      };

      // Store session state in Redis
      await this.storeSession(session);
      this.sessions.set(sessionId, session);

      // Create actual tmux session
      await this.createTmuxSession(session);

      // Initialize panes for agents
      await this.initializePanes(session);

      // Update status to active
      session.status = 'active';
      session.lastActivity = new Date();
      await this.storeSession(session);

      // Release lock
      await this.releaseLock(lockKey, lockValue);

      // Emit success event
      this.emit('session:created', {
        sessionId,
        farmId: options.farmId,
        sessionName,
        agentCount: options.agentCount,
        timestamp: new Date()
      });

      console.log(`[SessionController] Created session ${sessionName} with ${options.agentCount} agents`);
      return session;

    } catch (error) {
      // Release lock on error
      await this.releaseLock(lockKey, lockValue);
      
      // Clean up any partial state
      await this.cleanupFailedSession(sessionId, sessionName);
      
      console.error(`[SessionController] Failed to create session ${sessionName}:`, error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<TmuxSession | null> {
    // Try in-memory cache first
    let session = this.sessions.get(sessionId);
    if (session) return session;

    // Try Redis
    session = await this.loadSession(sessionId);
    if (session) {
      this.sessions.set(sessionId, session);
      return session;
    }

    return null;
  }

  /**
   * Get session by farm ID
   */
  async getSessionByFarm(farmId: string): Promise<TmuxSession | null> {
    // Check in-memory sessions
    for (const session of this.sessions.values()) {
      if (session.farmId === farmId) {
        return session;
      }
    }

    // Search Redis
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      const sessionData = await this.redis.hGetAll(key);
      if (sessionData.farmId === farmId) {
        const session = this.deserializeSession(sessionData);
        this.sessions.set(session.id, session);
        return session;
      }
    }

    return null;
  }

  /**
   * Send command to specific pane
   */
  async sendCommand(sessionId: string, paneIndex: number, command: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session || session.status !== 'active') {
      throw new Error(`Session ${sessionId} is not active`);
    }

    const pane = session.panes[paneIndex];
    if (!pane) {
      throw new Error(`Pane ${paneIndex} not found in session ${sessionId}`);
    }

    await this.executeTmuxCommand('send-keys', [
      '-t', `${session.sessionName}:${session.config.windowName}.${paneIndex}`,
      command,
      'C-m'
    ]);

    // Update pane activity
    pane.lastActivity = new Date();
    pane.status = 'active';
    session.lastActivity = new Date();
    
    await this.storeSession(session);

    this.emit('pane:command', {
      sessionId,
      paneIndex,
      agentId: pane.agentId,
      command,
      timestamp: new Date()
    });
  }

  /**
   * Capture pane output
   */
  async capturePane(sessionId: string, paneIndex: number, lines: number = 50): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const output = await this.executeTmuxCommand('capture-pane', [
      '-t', `${session.sessionName}:${session.config.windowName}.${paneIndex}`,
      '-p',
      '-S', `-${lines}`
    ]);

    // Update pane with latest output
    const pane = session.panes[paneIndex];
    if (pane) {
      pane.lastOutput = output.slice(-1000); // Keep last 1000 chars
      pane.lastActivity = new Date();
    }

    return output;
  }

  /**
   * Stop and clean up session
   */
  async stopSession(sessionId: string, force: boolean = false): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = 'stopping';
    await this.storeSession(session);

    try {
      if (!force) {
        // Graceful shutdown - send exit commands to all panes
        for (let i = 0; i < session.panes.length; i++) {
          try {
            await this.sendCommand(sessionId, i, '/exit');
          } catch (error) {
            console.warn(`[SessionController] Failed to send exit to pane ${i}:`, error);
          }
        }

        // Wait a bit for graceful exit
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Kill tmux session
      await this.executeTmuxCommand('kill-session', ['-t', session.sessionName]);

    } catch (error) {
      console.error(`[SessionController] Error stopping session ${sessionId}:`, error);
    }

    // Clean up state
    session.status = 'stopped';
    await this.storeSession(session);
    this.sessions.delete(sessionId);

    // Remove from Redis after delay
    setTimeout(async () => {
      await this.redis.del(this.getSessionKey(sessionId));
    }, 300000); // Keep for 5 minutes for debugging

    this.emit('session:stopped', {
      sessionId,
      farmId: session.farmId,
      sessionName: session.sessionName,
      timestamp: new Date()
    });

    console.log(`[SessionController] Stopped session ${session.sessionName}`);
  }

  /**
   * Get session health status
   */
  async getSessionHealth(sessionId: string): Promise<{
    session: TmuxSession;
    tmuxExists: boolean;
    paneCount: number;
    activeAgents: number;
    issues: string[];
  }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const issues: string[] = [];
    
    // Check if tmux session exists
    const tmuxExists = await this.checkTmuxSessionExists(session.sessionName);
    if (!tmuxExists && session.status === 'active') {
      issues.push('Tmux session missing but marked as active');
    }

    // Get actual pane count
    let actualPaneCount = 0;
    if (tmuxExists) {
      try {
        actualPaneCount = await this.getTmuxPaneCount(session.sessionName);
      } catch (error) {
        issues.push(`Failed to get pane count: ${error.message}`);
      }
    }

    if (actualPaneCount !== session.agentCount) {
      issues.push(`Expected ${session.agentCount} panes, found ${actualPaneCount}`);
    }

    // Count active agents
    const activeAgents = session.panes.filter(p => 
      p.status === 'active' || p.status === 'ready'
    ).length;

    // Check for stale panes
    const now = Date.now();
    const staleThreshold = 300000; // 5 minutes
    
    for (const pane of session.panes) {
      const timeSinceActivity = now - pane.lastActivity.getTime();
      if (timeSinceActivity > staleThreshold && pane.status !== 'error') {
        issues.push(`Pane ${pane.index} has been inactive for ${Math.round(timeSinceActivity / 1000)}s`);
      }
    }

    return {
      session,
      tmuxExists,
      paneCount: actualPaneCount,
      activeAgents,
      issues
    };
  }

  /**
   * List all active sessions
   */
  async listSessions(): Promise<TmuxSession[]> {
    const sessions: TmuxSession[] = [];
    
    // Get from in-memory cache
    sessions.push(...this.sessions.values());
    
    // Get additional from Redis
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      const sessionId = key.replace(this.keyPrefix, '');
      if (!this.sessions.has(sessionId)) {
        const session = await this.loadSession(sessionId);
        if (session) {
          sessions.push(session);
        }
      }
    }

    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Private helper methods
   */

  private generateUniqueSessionName(farmId: string): string {
    const timestamp = Date.now();
    const farmPrefix = farmId.substring(0, 8);
    return `maifarm_${farmPrefix}_${timestamp}`;
  }

  private async createTmuxSession(session: TmuxSession): Promise<void> {
    const { sessionName, config } = session;

    // Create new session
    await this.executeTmuxCommand('new-session', [
      '-d',
      '-s', sessionName,
      '-n', config.windowName
    ]);

    // Configure session options
    const configCommands = [
      ['set-option', '-t', sessionName, '-g', 'aggressive-resize', config.aggressiveResize ? 'on' : 'off'],
      ['set-option', '-t', sessionName, '-g', 'mouse', config.mouseSupport ? 'on' : 'off'],
      ['set-option', '-t', sessionName, '-g', 'pane-border-style', 'fg=colour240'],
      ['set-option', '-t', sessionName, '-g', 'pane-active-border-style', 'fg=colour250'],
    ];

    if (config.statusBar) {
      configCommands.push(
        ['set-option', '-t', sessionName, '-g', 'pane-border-status', 'top'],
        ['set-option', '-t', sessionName, '-g', 'pane-border-format', ' Agent #{pane_index} ']
      );
    }

    // Apply all configuration
    for (const command of configCommands) {
      try {
        await this.executeTmuxCommand(command[0], command.slice(1));
      } catch (error) {
        console.warn(`[SessionController] Config command failed:`, command, error);
      }
    }
  }

  private async initializePanes(session: TmuxSession): Promise<void> {
    const { sessionName, agentCount, config } = session;

    // Create additional panes (first pane already exists)
    for (let i = 1; i < agentCount; i++) {
      await this.executeTmuxCommand('split-window', [
        '-t', `${sessionName}:${config.windowName}`
      ]);
      
      // Apply layout after each split
      await this.executeTmuxCommand('select-layout', [
        '-t', `${sessionName}:${config.windowName}`,
        config.layout
      ]);
    }

    // Initialize pane objects
    for (let i = 0; i < agentCount; i++) {
      const pane: TmuxPane = {
        index: i,
        id: `${sessionName}:${config.windowName}.${i}`,
        agentId: `${session.farmId}-agent-${i}`,
        status: 'starting',
        lastOutput: '',
        lastActivity: new Date()
      };
      session.panes.push(pane);
    }
  }

  private async executeTmuxCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn('tmux', [command, ...args]);
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('exit', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`tmux ${command} failed (code ${code}): ${stderr}`));
        }
      });

      // 10 second timeout for tmux commands
      setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`tmux ${command} timed out`));
      }, 10000);
    });
  }

  private async checkTmuxSessionExists(sessionName: string): Promise<boolean> {
    try {
      await this.executeTmuxCommand('has-session', ['-t', sessionName]);
      return true;
    } catch {
      return false;
    }
  }

  private async getTmuxPaneCount(sessionName: string): Promise<number> {
    try {
      const output = await this.executeTmuxCommand('list-panes', [
        '-t', `${sessionName}:agents`,
        '-F', '#{pane_index}'
      ]);
      return output.trim().split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  private async cleanupFailedSession(sessionId: string, sessionName: string): Promise<void> {
    try {
      // Try to kill tmux session
      await this.executeTmuxCommand('kill-session', ['-t', sessionName]);
    } catch {
      // Ignore errors - session might not exist
    }

    // Clean up Redis state
    await this.redis.del(this.getSessionKey(sessionId));
    this.sessions.delete(sessionId);
  }

  private async releaseLock(lockKey: string, lockValue: string): Promise<void> {
    // Use Lua script for atomic lock release
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    try {
      await this.redis.eval(script, 1, lockKey, lockValue);
    } catch (error) {
      console.warn(`[SessionController] Failed to release lock ${lockKey}:`, error);
    }
  }

  private getSessionKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  private async storeSession(session: TmuxSession): Promise<void> {
    const key = this.getSessionKey(session.id);
    const serialized = this.serializeSession(session);
    
    await this.redis.hSet(key, serialized);
    await this.redis.expire(key, 7200); // 2 hour TTL
  }

  private async loadSession(sessionId: string): Promise<TmuxSession | null> {
    const key = this.getSessionKey(sessionId);
    const data = await this.redis.hGetAll(key);
    
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserializeSession(data);
  }

  private serializeSession(session: TmuxSession): Record<string, string> {
    return {
      id: session.id,
      farmId: session.farmId,
      sessionName: session.sessionName,
      agentCount: String(session.agentCount),
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      panes: JSON.stringify(session.panes),
      config: JSON.stringify(session.config)
    };
  }

  private deserializeSession(data: Record<string, string>): TmuxSession {
    return {
      id: data.id,
      farmId: data.farmId,
      sessionName: data.sessionName,
      agentCount: parseInt(data.agentCount),
      status: data.status as any,
      createdAt: new Date(data.createdAt),
      lastActivity: new Date(data.lastActivity),
      panes: JSON.parse(data.panes),
      config: JSON.parse(data.config)
    };
  }

  private setupCleanupMonitoring(): void {
    // Monitor for orphaned sessions every 5 minutes
    setInterval(async () => {
      try {
        const sessions = await this.listSessions();
        const now = Date.now();
        const staleThreshold = 3600000; // 1 hour

        for (const session of sessions) {
          const timeSinceActivity = now - session.lastActivity.getTime();
          
          if (timeSinceActivity > staleThreshold && session.status === 'active') {
            console.warn(`[SessionController] Session ${session.sessionName} is stale, checking health...`);
            
            const health = await this.getSessionHealth(session.id);
            if (!health.tmuxExists) {
              console.log(`[SessionController] Cleaning up orphaned session ${session.sessionName}`);
              await this.stopSession(session.id, true);
            }
          }
        }
      } catch (error) {
        console.error('[SessionController] Cleanup monitoring error:', error);
      }
    }, 300000); // 5 minutes
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    // Stop all active sessions
    const sessions = Array.from(this.sessions.values());
    for (const session of sessions) {
      if (session.status === 'active') {
        try {
          await this.stopSession(session.id, true);
        } catch (error) {
          console.error(`[SessionController] Error stopping session ${session.id}:`, error);
        }
      }
    }

    this.sessions.clear();
    this.removeAllListeners();
    
    console.log('[SessionController] Destroyed');
  }
}