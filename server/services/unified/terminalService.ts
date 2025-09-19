/**
 * Unified Terminal Service
 * Consolidates all terminal streaming, tmux session management, and output handling
 * Replaces: terminalStreamService, terminalStreamUnified, terminalStreamEnhanced,
 *           terminalOutputWatcher, terminalOutputCache, tmuxHelper, etc.
 */

import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FSWatcher, watch } from 'chokidar';
import { websocketManager } from '../../websocket/websocketManager';
import { logger } from '../../utils/logger';
import { redis } from '../../database/connection';
import {
  MaiFarmError,
  TmuxError,
  ErrorCode,
  ErrorSeverity,
  ErrorContext
} from '../../types/errors';
import { pathConfig } from '../../config/paths';

const execAsync = promisify(exec);

interface TerminalSession {
  sessionName: string;
  farmId: string;
  windowCount: number;
  paneCount: number;
  status: 'active' | 'stopped' | 'orphaned';
  createdAt: Date;
  lastHeartbeat: Date;
}

interface TerminalOutput {
  sessionName: string;
  agentId: number;
  content: string;
  timestamp: Date;
  type: 'stdout' | 'stderr' | 'command';
}

interface StreamConfig {
  sessionName: string;
  farmId: string;
  agentCount: number;
  windowTarget?: string;
  outputPath?: string;
}

interface HealthStatus {
  healthy: boolean;
  lastCheck: Date;
  errors: string[];
  metrics: {
    activeSessions: number;
    totalPanes: number;
    outputRate: number;
  };
}

export class UnifiedTerminalService extends EventEmitter {
  private static instance: UnifiedTerminalService;
  private sessions: Map<string, TerminalSession> = new Map();
  private watchers: Map<string, FSWatcher> = new Map();
  private outputBuffers: Map<string, string[]> = new Map();
  private healthCheckInterval: NodeJS.Timer | null = null;
  private readonly TMUX_TMPDIR = '/tmp';
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly BUFFER_LIMIT = 1000; // lines per session
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly SESSION_TIMEOUT = 120000; // 2 minutes
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  private recoveryAttempts: Map<string, number> = new Map();
  private paths: any;

  private constructor() {
    super();
    // Ensure paths are properly initialized with fallbacks
    try {
      this.paths = pathConfig.getPaths();
      if (!this.paths || !this.paths.TERMINALS_DIR) {
        // Fallback to default paths if not properly initialized
        this.paths = {
          TERMINALS_DIR: path.join(process.cwd(), 'data', 'storage', 'maibarn', 'terminals')
        };
      }
    } catch (error) {
      // Use fallback paths if pathConfig fails
      this.paths = {
        TERMINALS_DIR: path.join(process.cwd(), 'data', 'storage', 'maibarn', 'terminals')
      };
      logger.warn('Using fallback terminal paths due to pathConfig initialization error');
    }
    this.initialize();
  }

  public static getInstance(): UnifiedTerminalService {
    if (!UnifiedTerminalService.instance) {
      UnifiedTerminalService.instance = new UnifiedTerminalService();
    }
    return UnifiedTerminalService.instance;
  }

  private async initialize(): Promise<void> {
    // Start health monitoring
    this.startHealthMonitoring();

    // Load existing sessions
    await this.discoverExistingSessions();

    // Setup event handlers
    this.setupEventHandlers();

    logger.info('UnifiedTerminalService initialized', {
      activeSessions: this.sessions.size
    });
  }

  /**
   * Create and start a new tmux session for a farm
   */
  public async createSession(farmId: string, agentCount: number): Promise<string> {
    const sessionName = `farm-${farmId}`;

    try {
      // Check if session already exists
      const exists = await this.sessionExists(sessionName);
      if (exists) {
        logger.warn(`Session ${sessionName} already exists, reusing`);
        return sessionName;
      }

      // Create new tmux session
      const createCommand = `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux new-session -d -s ${sessionName}`;
      await execAsync(createCommand);

      // Add session to tracking
      const session: TerminalSession = {
        sessionName,
        farmId,
        windowCount: 1,
        paneCount: 1,
        status: 'active',
        createdAt: new Date(),
        lastHeartbeat: new Date()
      };

      this.sessions.set(sessionName, session);

      // Setup streaming for this session
      await this.startStreaming({
        sessionName,
        farmId,
        agentCount
      });

      // Broadcast session creation
      websocketManager.broadcast('terminal:session:created', {
        sessionName,
        farmId,
        timestamp: new Date()
      });

      logger.info(`Created tmux session ${sessionName} for farm ${farmId}`);
      return sessionName;

    } catch (error) {
      throw new TmuxError(
        ErrorCode.TMUX_LAUNCH_FAILED,
        `Failed to create tmux session: ${error.message}`,
        { farmId, sessionName }
      );
    }
  }

  /**
   * Start streaming terminal output for a session
   */
  public async startStreaming(config: StreamConfig): Promise<void> {
    const { sessionName, farmId, agentCount, windowTarget = '0' } = config;

    try {
      // Wait for session to be ready
      await this.waitForSession(sessionName);

      // Detect window target (for XenoSync compatibility)
      const actualWindow = await this.detectWindowTarget(sessionName);

      // Setup pipe-pane for each agent
      for (let i = 0; i < agentCount; i++) {
        await this.setupPipePane(sessionName, actualWindow, i, farmId);
      }

      // Cache session info
      await this.cacheSessionInfo(sessionName, farmId);

      logger.info(`Started streaming for session ${sessionName} with ${agentCount} agents`);

    } catch (error) {
      logger.error(`Failed to start streaming for ${sessionName}:`, error);
      throw new TmuxError(
        ErrorCode.TERMINAL_STREAM_FAILED,
        `Stream setup failed: ${error.message}`,
        { sessionName, farmId }
      );
    }
  }

  /**
   * Setup pipe-pane for a specific pane
   */
  private async setupPipePane(
    sessionName: string,
    window: string,
    paneIndex: number,
    farmId: string
  ): Promise<void> {
    const outputPath = path.join(this.paths.TERMINALS_DIR, farmId, `agent-${paneIndex}.log`);

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Setup pipe-pane command
    const pipeCommand = `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux pipe-pane -t ${sessionName}:${window}.${paneIndex} -o 'cat >> ${outputPath}'`;

    try {
      await execAsync(pipeCommand);

      // Start watching the output file
      this.watchOutputFile(outputPath, sessionName, paneIndex);

      logger.info(`Pipe-pane setup for ${sessionName}:${window}.${paneIndex}`);

    } catch (error) {
      logger.error(`Pipe-pane failed for ${sessionName}:${window}.${paneIndex}, using fallback`);
      // Fallback to capture-pane
      this.startCapturePaneFallback(sessionName, window, paneIndex);
    }
  }

  /**
   * Watch output file for changes and broadcast
   */
  private watchOutputFile(filePath: string, sessionName: string, agentId: number): void {
    const watcher = watch(filePath, {
      persistent: true,
      ignoreInitial: true
    });

    watcher.on('change', async () => {
      try {
        const content = await this.readTailOfFile(filePath, 100);

        // Broadcast terminal output
        websocketManager.broadcast('terminal:output', {
          sessionName,
          agentId,
          content,
          timestamp: new Date()
        });

        // Cache recent output
        this.updateOutputBuffer(sessionName, content);

      } catch (error) {
        logger.error(`Failed to read output from ${filePath}:`, error);
      }
    });

    this.watchers.set(`${sessionName}-${agentId}`, watcher);
  }

  /**
   * Capture pane content directly (fallback method)
   */
  public async capturePane(
    sessionName: string,
    window: string = '0',
    paneIndex: number = 0
  ): Promise<string> {
    const captureCommand = `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux capture-pane -t ${sessionName}:${window}.${paneIndex} -p`;

    try {
      const { stdout } = await execAsync(captureCommand);
      return this.cleanTerminalOutput(stdout);
    } catch (error) {
      logger.error(`Failed to capture pane ${sessionName}:${window}.${paneIndex}:`, error);
      return '';
    }
  }

  /**
   * Stop a tmux session
   */
  public async stopSession(sessionName: string): Promise<void> {
    try {
      // Stop watchers
      this.stopWatchers(sessionName);

      // Kill tmux session
      const killCommand = `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux kill-session -t ${sessionName}`;
      await execAsync(killCommand);

      // Update session status
      const session = this.sessions.get(sessionName);
      if (session) {
        session.status = 'stopped';
      }

      // Clear cache
      await this.clearSessionCache(sessionName);

      logger.info(`Stopped session ${sessionName}`);

    } catch (error) {
      logger.error(`Failed to stop session ${sessionName}:`, error);
    }
  }

  /**
   * Get session health status
   */
  public async getHealthStatus(): Promise<HealthStatus> {
    const errors: string[] = [];
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active');

    // Check each active session
    for (const session of activeSessions) {
      const exists = await this.sessionExists(session.sessionName);
      if (!exists) {
        errors.push(`Session ${session.sessionName} not found`);
        session.status = 'orphaned';
      }
    }

    // Calculate metrics
    const totalPanes = activeSessions.reduce((sum, s) => sum + s.paneCount, 0);
    const outputRate = this.calculateOutputRate();

    return {
      healthy: errors.length === 0,
      lastCheck: new Date(),
      errors,
      metrics: {
        activeSessions: activeSessions.length,
        totalPanes,
        outputRate
      }
    };
  }

  /**
   * Detect window target (for XenoSync compatibility)
   */
  private async detectWindowTarget(sessionName: string): Promise<string> {
    try {
      const listCommand = `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux list-windows -t ${sessionName} -F "#{window_index}:#{window_name}"`;
      const { stdout } = await execAsync(listCommand);

      // Check for 'agents' window (XenoSync uses this)
      if (stdout.includes(':agents')) {
        return 'agents';
      }

      return '0'; // Default window
    } catch (error) {
      return '0';
    }
  }

  /**
   * Wait for session to be ready
   */
  private async waitForSession(sessionName: string, maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.sessionExists(sessionName)) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new TmuxError(
      ErrorCode.TMUX_SESSION_NOT_FOUND,
      `Session ${sessionName} not ready after ${maxAttempts} attempts`,
      { sessionName }
    );
  }

  /**
   * Check if session exists
   */
  private async sessionExists(sessionName: string): Promise<boolean> {
    try {
      const checkCommand = `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux has-session -t ${sessionName} 2>/dev/null`;
      await execAsync(checkCommand);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Discover existing tmux sessions
   */
  private async discoverExistingSessions(): Promise<void> {
    try {
      const listCommand = `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux list-sessions -F "#{session_name}" 2>/dev/null`;
      const { stdout } = await execAsync(listCommand);

      const sessionNames = stdout.split('\n').filter(name => name.startsWith('farm-'));

      for (const sessionName of sessionNames) {
        const farmId = sessionName.replace('farm-', '');
        const session: TerminalSession = {
          sessionName,
          farmId,
          windowCount: 1,
          paneCount: await this.countPanes(sessionName),
          status: 'active',
          createdAt: new Date(),
          lastHeartbeat: new Date()
        };
        this.sessions.set(sessionName, session);
      }

      logger.info(`Discovered ${sessionNames.length} existing sessions`);

    } catch (error) {
      logger.warn('No existing tmux sessions found');
    }
  }

  /**
   * Count panes in a session
   */
  private async countPanes(sessionName: string): Promise<number> {
    try {
      const countCommand = `TMUX_TMPDIR=${this.TMUX_TMPDIR} tmux list-panes -t ${sessionName} | wc -l`;
      const { stdout } = await execAsync(countCommand);
      return parseInt(stdout.trim()) || 1;
    } catch {
      return 1;
    }
  }

  /**
   * Clean terminal output (remove control characters)
   */
  private cleanTerminalOutput(output: string): string {
    return output
      .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/[⏵◆✻✽·╭─╮│╰╯]/g, '') // Remove box drawing characters
      .trim();
  }

  /**
   * Cache session information in Redis
   */
  private async cacheSessionInfo(sessionName: string, farmId: string): Promise<void> {
    const key = `terminal:session:${sessionName}`;
    const data = {
      farmId,
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    await redis.setex(key, this.CACHE_TTL, JSON.stringify(data));
  }

  /**
   * Clear session cache
   */
  private async clearSessionCache(sessionName: string): Promise<void> {
    await redis.del(`terminal:session:${sessionName}`);
  }

  /**
   * Update output buffer
   */
  private updateOutputBuffer(sessionName: string, content: string): void {
    if (!this.outputBuffers.has(sessionName)) {
      this.outputBuffers.set(sessionName, []);
    }

    const buffer = this.outputBuffers.get(sessionName)!;
    buffer.push(content);

    // Limit buffer size
    if (buffer.length > this.BUFFER_LIMIT) {
      buffer.shift();
    }
  }

  /**
   * Read tail of file
   */
  private async readTailOfFile(filePath: string, lines: number = 100): Promise<string> {
    try {
      const { stdout } = await execAsync(`tail -n ${lines} ${filePath}`);
      return stdout;
    } catch {
      return '';
    }
  }

  /**
   * Start capture-pane fallback
   */
  private startCapturePaneFallback(
    sessionName: string,
    window: string,
    paneIndex: number
  ): void {
    setInterval(async () => {
      const content = await this.capturePane(sessionName, window, paneIndex);
      if (content) {
        websocketManager.broadcast('terminal:output', {
          sessionName,
          agentId: paneIndex,
          content,
          timestamp: new Date()
        });
      }
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Stop watchers for a session
   */
  private stopWatchers(sessionName: string): void {
    for (const [key, watcher] of this.watchers.entries()) {
      if (key.startsWith(sessionName)) {
        watcher.close();
        this.watchers.delete(key);
      }
    }
  }

  /**
   * Calculate output rate
   */
  private calculateOutputRate(): number {
    let totalLines = 0;
    for (const buffer of this.outputBuffers.values()) {
      totalLines += buffer.length;
    }
    return totalLines / this.outputBuffers.size || 0;
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.getHealthStatus();

      if (!health.healthy) {
        logger.warn('Terminal service health check failed', health.errors);

        // Attempt recovery for orphaned sessions
        for (const session of this.sessions.values()) {
          if (session.status === 'orphaned') {
            await this.attemptSessionRecovery(session);
          }
        }
      }

      // Broadcast health status
      websocketManager.broadcast('terminal:health', health);

    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Attempt to recover an orphaned session
   */
  private async attemptSessionRecovery(session: TerminalSession): Promise<void> {
    const attempts = this.recoveryAttempts.get(session.sessionName) || 0;

    if (attempts >= this.MAX_RECOVERY_ATTEMPTS) {
      logger.error(`Max recovery attempts reached for ${session.sessionName}`);
      this.sessions.delete(session.sessionName);
      return;
    }

    try {
      await this.createSession(session.farmId, session.paneCount);
      session.status = 'active';
      session.lastHeartbeat = new Date();
      this.recoveryAttempts.delete(session.sessionName);
      logger.info(`Recovered session ${session.sessionName}`);
    } catch (error) {
      this.recoveryAttempts.set(session.sessionName, attempts + 1);
      logger.error(`Recovery failed for ${session.sessionName}:`, error);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle process exit
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    // Handle WebSocket events (disabled for now - websocketManager is not an EventEmitter)
    // TODO: Implement proper WebSocket event handling
    // websocketManager.on('terminal:request', async (data) => {
    //   const { sessionName, agentId } = data;
    //   const content = await this.capturePane(sessionName, '0', agentId);
    //   websocketManager.emit('terminal:response', {
    //     sessionName,
    //     agentId,
    //     content
    //   });
    // });
  }

  /**
   * Shutdown service gracefully
   */
  private async shutdown(): Promise<void> {
    logger.info('Shutting down UnifiedTerminalService');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    // Stop all sessions
    for (const session of this.sessions.values()) {
      await this.stopSession(session.sessionName);
    }

    logger.info('UnifiedTerminalService shutdown complete');
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  /**
   * Get session by farm ID
   */
  public getSessionByFarmId(farmId: string): TerminalSession | undefined {
    return Array.from(this.sessions.values()).find(s => s.farmId === farmId);
  }
}

// Export singleton instance
export const terminalService = UnifiedTerminalService.getInstance();