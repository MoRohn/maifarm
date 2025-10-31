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
import { coordinationService } from '../coordinationService';
import { getFarmAgentName, formatFarmAgentName } from '../../utils/farmAgentNames';
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
  private static handlersRegistered = false;
  private sessions: Map<string, TerminalSession> = new Map();
  private watchers: Map<string, FSWatcher> = new Map();
  private outputBuffers: Map<string, string[]> = new Map();
  private paneMonitorIntervals: Map<string, NodeJS.Timer> = new Map();
  private healthCheckInterval: NodeJS.Timer | null = null;
  private readonly TMUX_TMPDIR = pathConfig.getPath('TMUX_TMP_DIR');
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly BUFFER_LIMIT = 1000; // lines per session
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly SESSION_TIMEOUT = 600000; // 10 minutes - increased from 2min to prevent premature orphaning
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
   * Register a pending session that will be created by XenoSync
   */
  public async registerPendingSession(config: {
    sessionName: string;
    farmId: string;
    expectedAgents: number;
    windowTarget?: string;
  }): Promise<void> {
    const { sessionName, farmId, expectedAgents, windowTarget = 'agents' } = config;

    logger.info(`Registering pending session ${sessionName} with ${expectedAgents} agents`);

    // Add to sessions map as pending
    const session: TerminalSession = {
      sessionName,
      farmId,
      windowCount: 1,
      paneCount: expectedAgents,
      status: 'active',  // Mark as active since XenoSync is creating it
      createdAt: new Date(),
      lastHeartbeat: new Date()
    };

    this.sessions.set(sessionName, session);

    // Pre-cache session info
    await this.cacheSessionInfo(sessionName, farmId);

    logger.info(`Pending session ${sessionName} registered, waiting for creation`);
  }

  /**
   * Create and start a new tmux session for a farm
   */
  public async createSession(farmId: string, agentCount: number): Promise<string> {
    const sessionName = `farm-${farmId.substring(0, 8)}`;

    try {
      // Check if session already exists
      const exists = await this.sessionExists(sessionName);
      if (exists) {
        logger.warn(`Session ${sessionName} already exists, reusing`);
        return sessionName;
      }

      // Create new tmux session
      const createCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux new-session -d -s ${sessionName}`;
      await execAsync(createCommand);

      // Verify the session was actually created
      const sessionCreated = await this.sessionExists(sessionName);
      if (!sessionCreated) {
        throw new Error(`Failed to create tmux session ${sessionName}`);
      }

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
   * Start streaming for a farm (wrapper for compatibility)
   */
  public async startStreamingForFarm(
    farmId: string,
    sessionName: string,
    agentCount: number,
    windowTarget: string = 'agents'
  ): Promise<boolean> {
    try {
      await this.startStreaming({
        sessionName,
        farmId,
        agentCount,
        windowTarget
      });
      return true;
    } catch (error) {
      logger.error(`Failed to start streaming for farm ${farmId}:`, error);
      return false;
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

      // Wait for panes and capture actual indices
      const paneIndices = await this.waitForPanes(sessionName, actualWindow, agentCount);
      const activePaneIndices = paneIndices.length > 0 ? paneIndices : [0];

      const knownPaneIndices = new Set<number>();

      for (const paneIndex of activePaneIndices) {
        knownPaneIndices.add(paneIndex);
        await this.setupPipePane(sessionName, actualWindow, paneIndex, farmId);
      }

      // Cache session info
      await this.cacheSessionInfo(sessionName, farmId);

      // Broadcast roster to clients for immediate UI hydration
      await this.broadcastAgentRoster(farmId, sessionName, activePaneIndices.length, activePaneIndices);

      this.startPaneMonitor(sessionName, actualWindow, farmId, knownPaneIndices);

      logger.info(`Started streaming for session ${sessionName} with ${activePaneIndices.length} panes`);

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

    // First verify the pane exists
    const checkPaneCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux list-panes -t ${sessionName}:${window} -F "#{pane_index}" 2>/dev/null`;
    try {
      const { stdout: paneList } = await execAsync(checkPaneCommand);
      const panes = paneList.trim().split('\n').map(p => parseInt(p.trim()));

      if (!panes.includes(paneIndex)) {
        logger.warn(`Pane ${sessionName}:${window}.${paneIndex} does not exist (available panes: ${panes.join(', ')}), using capture fallback`);
        // Start fallback capture instead
        this.startCapturePaneFallback(sessionName, window, paneIndex);
        return;
      }
    } catch (error) {
      logger.warn(`Could not verify pane ${sessionName}:${window}.${paneIndex}, attempting pipe-pane anyway`);
    }

    // Setup pipe-pane command
    const pipeCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux pipe-pane -t ${sessionName}:${window}.${paneIndex} -o 'cat >> ${outputPath}'`;

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
        const cleanedContent = this.cleanTerminalOutput(content);
        const lines = cleanedContent
          .split(/\r?\n/)
          .map(line => line.trimEnd())
          .filter(line => line.length > 0);

        if (cleanedContent.length === 0 && lines.length === 0) {
          return;
        }

        websocketManager.broadcast('terminal:output', {
          sessionName,
          agentId,
          content: cleanedContent,
          lines,
          timestamp: new Date()
        });

        this.updateOutputBuffer(sessionName, lines);

      } catch (error) {
        logger.error(`Failed to read output from ${filePath}:`, error);
      }
    });

    this.watchers.set(`${sessionName}-${agentId}`, watcher);

    // Emit initial backlog so UI populates immediately
    this.emitInitialOutput(sessionName, agentId, filePath).catch(error => {
      logger.warn(`Failed to emit initial output for ${sessionName}:${agentId}`, error);
    });
  }

  /**
   * Capture pane content directly (fallback method)
   */
  public async capturePane(
    sessionName: string,
    window: string = '0',
    paneIndex: number = 0
  ): Promise<string> {
    const captureCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux capture-pane -t ${sessionName}:${window}.${paneIndex} -p`;

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
      const killCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux kill-session -t ${sessionName}`;
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
    const now = Date.now();

    for (const session of this.sessions.values()) {
      const exists = await this.sessionExists(session.sessionName);

      if (exists) {
        if (session.status !== 'active') {
          logger.info(`[UnifiedTerminalService] Session ${session.sessionName} recovered and is now active`);
        }
        session.status = 'active';
        session.lastHeartbeat = new Date();
        continue;
      }

      const sessionAge = now - session.createdAt.getTime();

      if (sessionAge < this.SESSION_TIMEOUT) {
        logger.debug(`[UnifiedTerminalService] Session ${session.sessionName} not yet detected but within grace period (${Math.floor(sessionAge / 1000)}s)`);
        continue;
      }

      if (session.status !== 'orphaned') {
        logger.warn(`[UnifiedTerminalService] Marking session ${session.sessionName} as orphaned (age ${Math.floor(sessionAge / 1000)}s)`);
      }

      session.status = 'orphaned';
      errors.push(`Session ${session.sessionName} not found (age ${Math.floor(sessionAge / 1000)}s)`);
    }

    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'active');
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
      const listCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux list-windows -t ${sessionName} -F "#{window_index}:#{window_name}"`;
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
   * Wait for panes to be ready
   */
  private async waitForPanes(
    sessionName: string,
    window: string,
    expectedCount: number,
    maxAttempts: number = 100
  ): Promise<number[]> {
    logger.info(`Waiting for ${expectedCount} panes in ${sessionName}:${window}`);

    await new Promise(resolve => setTimeout(resolve, 3000));

    let lastPaneIndices: number[] = [];

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const paneIndices = await this.listPaneIndices(sessionName, window);
        lastPaneIndices = paneIndices;

        if (i % 10 === 0) {
          logger.debug(`Attempt ${i + 1}/${maxAttempts}: Found ${paneIndices.length}/${expectedCount} panes in ${sessionName}`);
        }

        if (paneIndices.length >= expectedCount) {
          logger.info(`Session ${sessionName} has ${paneIndices.length} panes ready`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return paneIndices;
        }
      } catch (error) {
        if (i % 10 === 0) {
          logger.debug(`Session check failed on attempt ${i + 1}`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (lastPaneIndices.length > 0) {
      logger.warn(`Session ${sessionName} panes capped at ${lastPaneIndices.length}; expected ${expectedCount}. Proceeding.`);
      return lastPaneIndices;
    }

    logger.warn(`No panes discovered for ${sessionName}; defaulting to pane 0`);
    return [];
  }

  private async listPaneIndices(sessionName: string, window: string): Promise<number[]> {
    const listCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux list-panes -t ${sessionName}:${window} -F "#{pane_index}"`;
    const { stdout } = await execAsync(listCommand);
    return stdout
      .trim()
      .split('\n')
      .map(line => parseInt(line.trim(), 10))
      .filter(value => !Number.isNaN(value));
  }

  /**
   * Check if session exists
   */
  private async sessionExists(sessionName: string): Promise<boolean> {
    try {
      const checkCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux has-session -t ${sessionName} 2>/dev/null`;
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
      const listCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux list-sessions -F "#{session_name}" 2>/dev/null`;
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
      const countCommand = `TMUX_TMPDIR="${this.TMUX_TMPDIR}" tmux list-panes -t ${sessionName} | wc -l`;
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
    // Use setEx (camelCase) for modern Redis client
    await redis.setEx(key, this.CACHE_TTL, JSON.stringify(data));
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
  private updateOutputBuffer(sessionName: string, lines: string[]): void {
    if (!lines.length) {
      return;
    }

    if (!this.outputBuffers.has(sessionName)) {
      this.outputBuffers.set(sessionName, []);
    }

    const buffer = this.outputBuffers.get(sessionName)!;
    buffer.push(...lines);

    while (buffer.length > this.BUFFER_LIMIT) {
      buffer.shift();
    }
  }

  private async emitInitialOutput(sessionName: string, agentId: number, filePath: string): Promise<void> {
    try {
      const content = await this.readTailOfFile(filePath, 200);
      const cleanedContent = this.cleanTerminalOutput(content);
      const lines = cleanedContent
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(line => line.length > 0);

      if (cleanedContent.length === 0 && lines.length === 0) {
        return;
      }

      websocketManager.broadcast('terminal:output', {
        sessionName,
        agentId,
        content: cleanedContent,
        lines,
        timestamp: new Date()
      });

      this.updateOutputBuffer(sessionName, lines);

    } catch (error) {
      logger.warn(`emitInitialOutput failed for ${sessionName}:${agentId}`, error);
    }
  }

  private extractPaneIndexFromCoordination(agent: any): number | undefined {
    if (!agent) {
      return undefined;
    }

    const numericCandidates = [agent.paneIndex, agent.pane_id, agent.paneId, agent.agent_index, agent.agentIndex];
    for (const candidate of numericCandidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
    }

    const tryParse = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const match = value.match(/(\d+)/g);
        if (match && match.length > 0) {
          const parsed = parseInt(match[match.length - 1], 10);
          if (!Number.isNaN(parsed)) {
            return parsed;
          }
        }
      }
      return undefined;
    };

    return (
      tryParse(agent.pane) ??
      tryParse(agent.id) ??
      tryParse(agent.uid) ??
      tryParse(agent.agent_id) ??
      tryParse(agent.agentId)
    );
  }

  private extractAgentNumberFromCoordination(agent: any): number | undefined {
    if (!agent) {
      return undefined;
    }

    if (typeof agent.agentNumber === 'number' && Number.isFinite(agent.agentNumber)) {
      return agent.agentNumber;
    }

    const paneIndex = this.extractPaneIndexFromCoordination(agent);
    if (typeof paneIndex === 'number') {
      return paneIndex + 1;
    }

    const tryParse = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const numeric = parseInt(value.replace(/[^0-9]/g, ''), 10);
        if (!Number.isNaN(numeric)) {
          return numeric;
        }
      }
      return undefined;
    };

    return tryParse(agent.number) ?? tryParse(agent.index);
  }

  private normalizeAgentStatus(rawStatus: any): string {
    if (typeof rawStatus !== 'string') {
      return 'active';
    }

    const status = rawStatus.toLowerCase();
    if (['active', 'working', 'busy', 'processing'].includes(status)) {
      return 'active';
    }
    if (['error', 'failed', 'crashed'].includes(status)) {
      return 'error';
    }
    if (['completed', 'done', 'finished'].includes(status)) {
      return 'completed';
    }
    if (['initializing', 'starting', 'launching'].includes(status)) {
      return 'initializing';
    }
    if (['idle', 'waiting', 'paused'].includes(status)) {
      return 'idle';
    }
    return status || 'active';
  }

  private async broadcastAgentRoster(
    farmId: string,
    sessionName: string,
    agentCount: number,
    paneIndices?: number[]
  ): Promise<void> {
    try {
      const coordinationAgents = await coordinationService.getActiveAgents(farmId);
      const agents: Array<{ id: number; paneId: number; agentNumber: number; name: string; status: string }> = [];

      const indexSource = paneIndices && paneIndices.length > 0 ? paneIndices : Array.from({ length: agentCount }, (_, i) => i);

      for (let position = 0; position < indexSource.length; position++) {
        const index = indexSource[position];
        const coordinationMatch = Array.isArray(coordinationAgents)
          ? coordinationAgents.find(agent => {
              const paneIndex = this.extractPaneIndexFromCoordination(agent);
              if (paneIndex !== undefined) {
                return paneIndex === index;
              }
              const agentNumber = this.extractAgentNumberFromCoordination(agent);
              if (agentNumber !== undefined) {
                return agentNumber - 1 === index;
              }
              return false;
            })
          : undefined;

        const fallbackName = formatFarmAgentName(getFarmAgentName('general', index));
        const coordinationName = coordinationMatch?.displayName || coordinationMatch?.name;
        const displayName = coordinationName?.toString().trim() || fallbackName;

        const paneId = this.extractPaneIndexFromCoordination(coordinationMatch) ?? index;
        const agentNumber = this.extractAgentNumberFromCoordination(coordinationMatch) ?? (position + 1);
        const status = this.normalizeAgentStatus(coordinationMatch?.status);
        const workspacePath = path.join(this.paths.MAIBARN_ROOT, 'xenosync-sessions', sessionName, 'workspace', `agent-${index}`);

        await coordinationService.updateAgentState(farmId, index, {
          displayName,
          name: displayName,
          agentNumber,
          paneIndex: paneId,
          paneId,
          status,
          workspacePath
        }).catch(error => {
          logger.warn(`Failed to persist agent state for farm ${farmId}`, {
            agentIndex: index,
            error: error?.message
          });
        });

        agents.push({
          id: paneId,
          paneId,
          agentNumber,
          name: displayName,
          status
        });
      }

      const payload = {
        farmId,
        sessionName,
        agents
      };

      websocketManager.broadcast('farm:agents:info', payload);
      websocketManager.broadcastToFarm(farmId, 'farm:agents:info', payload);
      websocketManager.broadcastToRoom(`terminal:${farmId}`, 'terminal:agents:info', payload);

    } catch (error) {
      logger.warn(`Failed to broadcast agent roster for farm ${farmId}:`, error);
    }
  }

  private startPaneMonitor(
    sessionName: string,
    window: string,
    farmId: string,
    knownPanes: Set<number>
  ): void {
    const key = `${sessionName}:${window}`;
    if (this.paneMonitorIntervals.has(key)) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const paneIndices = await this.listPaneIndices(sessionName, window);
        const sorted = paneIndices.sort((a, b) => a - b);
        let broadcastNeeded = false;

        for (const paneIndex of sorted) {
          if (!knownPanes.has(paneIndex)) {
            knownPanes.add(paneIndex);
            await this.setupPipePane(sessionName, window, paneIndex, farmId);
            broadcastNeeded = true;
          }
        }

        if (broadcastNeeded) {
          await this.broadcastAgentRoster(
            farmId,
            sessionName,
            knownPanes.size,
            Array.from(knownPanes).sort((a, b) => a - b)
          );
        }
      } catch (error) {
        logger.debug(`Pane monitor check failed for ${sessionName}:${window}`, error);
      }
    }, 5000);

    this.paneMonitorIntervals.set(key, interval);
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
      if (!content) {
        return;
      }

      const cleanedContent = this.cleanTerminalOutput(content);
      const lines = cleanedContent
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(line => line.length > 0);

      if (cleanedContent.length === 0 && lines.length === 0) {
        return;
      }

      websocketManager.broadcast('terminal:output', {
        sessionName,
        agentId: paneIndex,
        content: cleanedContent,
        lines,
        timestamp: new Date()
      });

      this.updateOutputBuffer(sessionName, lines);
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

    for (const [key, interval] of this.paneMonitorIntervals.entries()) {
      if (key.startsWith(sessionName)) {
        clearInterval(interval);
        this.paneMonitorIntervals.delete(key);
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
    if (UnifiedTerminalService.handlersRegistered) {
      return;
    }
    // Handle process exit
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    UnifiedTerminalService.handlersRegistered = true;

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
   * Stop streaming for a specific session
   * This method stops watching terminal output for a given session
   */
  public async stopStreaming(sessionName: string): Promise<void> {
    try {
      // Stop file watchers for this session
      const watcher = this.watchers.get(sessionName);
      if (watcher) {
        await watcher.close();
        this.watchers.delete(sessionName);
        logger.info(`Stopped streaming for session ${sessionName}`);
      }

      // Clear output buffer
      this.outputBuffers.delete(sessionName);

      // Update session status if it exists
      const session = this.sessions.get(sessionName);
      if (session) {
        session.status = 'stopped';
      }

      // Emit event
      this.emit('streaming:stopped', { sessionName });
    } catch (error) {
      logger.error(`Error stopping streaming for ${sessionName}:`, error);
    }
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
