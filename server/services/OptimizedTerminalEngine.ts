/**
 * OptimizedTerminalEngine - High-performance terminal streaming service
 * 
 * Features:
 * - Event-driven terminal capture using tmux control mode
 * - Diff-based updates to minimize bandwidth
 * - Worker thread processing for activity parsing
 * - Binary protocol for efficient data transmission
 * - Automatic session recovery
 */

import { Worker } from 'worker_threads';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import { logger } from '../utils/logger';
import { redis } from '../database/connection';
import { unifiedConnectionHub } from './UnifiedConnectionHub';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

interface TerminalSession {
  sessionId: string;
  farmId: string;
  agentCount: number;
  tmuxProcess?: ChildProcess;
  agents: Map<number, AgentTerminal>;
  status: 'initializing' | 'active' | 'paused' | 'stopped';
  startTime: Date;
  lastActivity: Date;
  statistics: SessionStatistics;
}

interface AgentTerminal {
  agentId: number;
  paneId: string;
  buffer: string[];
  lastOutput: string;
  lastSequence: number;
  parseWorker?: Worker;
  status: 'active' | 'idle' | 'error';
  metrics: AgentMetrics;
}

interface SessionStatistics {
  totalOutput: number;
  outputRate: number; // lines per second
  compressionRatio: number;
  bandwidth: number; // bytes per second
  parseTime: number; // avg ms
}

interface AgentMetrics {
  linesProcessed: number;
  bytesTransmitted: number;
  activitiesDetected: number;
  errorCount: number;
  lastError?: string;
}

interface TmuxControlEvent {
  type: 'output' | 'layout-change' | 'pane-mode-changed' | 'window-add' | 'window-close';
  sessionId: string;
  paneId?: string;
  data?: string;
  timestamp: number;
}

export class OptimizedTerminalEngine extends EventEmitter {
  private static instance: OptimizedTerminalEngine;
  private sessions: Map<string, TerminalSession> = new Map();
  private controlProcesses: Map<string, ChildProcess> = new Map();
  private parseWorkers: Worker[] = [];
  private workerPool: Worker[] = [];
  private readonly WORKER_POOL_SIZE = 4;
  private readonly BUFFER_SIZE = 1000; // lines
  private readonly OUTPUT_BATCH_INTERVAL = 100; // ms
  private outputBatchTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingOutputs: Map<string, any[]> = new Map();
  private monitoringInterval?: NodeJS.Timeout;

  private constructor() {
    super();
    this.initialize();
  }

  static getInstance(): OptimizedTerminalEngine {
    if (!OptimizedTerminalEngine.instance) {
      OptimizedTerminalEngine.instance = new OptimizedTerminalEngine();
    }
    return OptimizedTerminalEngine.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Create worker pool for parsing
      await this.createWorkerPool();
      
      // Start monitoring
      this.startMonitoring();
      
      // Setup Redis subscriptions
      await this.setupRedisSubscriptions();
      
      logger.info('[OptimizedTerminalEngine] Initialized with worker pool');
    } catch (error) {
      logger.error('[OptimizedTerminalEngine] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create worker thread pool for activity parsing
   */
  private async createWorkerPool(): Promise<void> {
    const workerPath = path.join(__dirname, 'workers', 'terminalParserWorker.js');
    
    for (let i = 0; i < this.WORKER_POOL_SIZE; i++) {
      const worker = new Worker(workerPath);
      
      worker.on('message', (result) => {
        this.handleWorkerResult(result);
      });
      
      worker.on('error', (error) => {
        logger.error('[OptimizedTerminalEngine] Worker error:', error);
        // Replace failed worker
        this.replaceWorker(worker);
      });
      
      this.workerPool.push(worker);
    }
  }

  /**
   * Start terminal streaming for a session using tmux control mode
   */
  public async startSession(
    sessionName: string,
    farmId: string,
    agentCount: number
  ): Promise<void> {
    // Check if session already exists
    if (this.sessions.has(sessionName)) {
      logger.warn(`[OptimizedTerminalEngine] Session already active: ${sessionName}`);
      return;
    }
    
    logger.info(`[OptimizedTerminalEngine] Starting session: ${sessionName} with ${agentCount} agents`);
    
    // Create session object
    const session: TerminalSession = {
      sessionId: sessionName,
      farmId,
      agentCount,
      agents: new Map(),
      status: 'initializing',
      startTime: new Date(),
      lastActivity: new Date(),
      statistics: {
        totalOutput: 0,
        outputRate: 0,
        compressionRatio: 1,
        bandwidth: 0,
        parseTime: 0
      }
    };
    
    // Initialize agents
    for (let i = 0; i < agentCount; i++) {
      session.agents.set(i, {
        agentId: i,
        paneId: `${sessionName}:0.${i}`,
        buffer: [],
        lastOutput: '',
        lastSequence: 0,
        status: 'active',
        metrics: {
          linesProcessed: 0,
          bytesTransmitted: 0,
          activitiesDetected: 0,
          errorCount: 0
        }
      });
    }
    
    this.sessions.set(sessionName, session);
    
    // Start tmux control mode
    await this.startTmuxControl(sessionName, session);
    
    // Initialize output batching
    this.pendingOutputs.set(sessionName, []);
    
    session.status = 'active';
    
    // Emit session started event
    this.emit('session:started', {
      sessionId: sessionName,
      farmId,
      agentCount,
      timestamp: new Date()
    });
  }

  /**
   * Start tmux in control mode for efficient event capture
   */
  private async startTmuxControl(sessionName: string, session: TerminalSession): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use tmux control mode for efficient event-driven capture
      const tmuxProcess = spawn('tmux', [
        '-C',  // Control mode
        'attach-session',
        '-t', sessionName
      ]);
      
      let initTimeout = setTimeout(() => {
        reject(new Error(`Tmux control mode initialization timeout for ${sessionName}`));
      }, 5000);
      
      tmuxProcess.stdout?.on('data', (data: Buffer) => {
        clearTimeout(initTimeout);
        this.processTmuxControlOutput(sessionName, data.toString());
      });
      
      tmuxProcess.stderr?.on('data', (data: Buffer) => {
        logger.error(`[OptimizedTerminalEngine] Tmux error for ${sessionName}:`, data.toString());
      });
      
      tmuxProcess.on('error', (error) => {
        logger.error(`[OptimizedTerminalEngine] Tmux process error for ${sessionName}:`, error);
        this.handleSessionError(sessionName, error);
        reject(error);
      });
      
      tmuxProcess.on('exit', (code) => {
        logger.info(`[OptimizedTerminalEngine] Tmux process exited for ${sessionName} with code ${code}`);
        this.handleSessionExit(sessionName, code);
      });
      
      // Send initial commands to capture pane output
      tmuxProcess.stdin?.write('%output %0\n'); // Monitor window 0
      tmuxProcess.stdin?.write('%layout-change\n'); // Monitor layout changes
      
      this.controlProcesses.set(sessionName, tmuxProcess);
      session.tmuxProcess = tmuxProcess;
      
      // Set up continuous capture for each pane
      for (let i = 0; i < session.agentCount; i++) {
        // Request continuous output from each pane
        tmuxProcess.stdin?.write(`%capture-pane -t ${sessionName}:0.${i} -p -S - -E -\n`);
      }
      
      resolve();
    });
  }

  /**
   * Process tmux control mode output
   */
  private processTmuxControlOutput(sessionName: string, output: string): void {
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Parse control mode events
      if (line.startsWith('%')) {
        this.handleControlEvent(sessionName, line);
      } else {
        // Regular output from panes
        this.handlePaneOutput(sessionName, line);
      }
    }
    
    session.lastActivity = new Date();
  }

  /**
   * Handle tmux control mode events
   */
  private handleControlEvent(sessionName: string, event: string): void {
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    // Parse control event
    const parts = event.split(' ');
    const eventType = parts[0];
    
    switch (eventType) {
      case '%output':
        // Pane output event
        const paneId = parts[1];
        const outputData = parts.slice(2).join(' ');
        this.processPaneOutput(sessionName, paneId, outputData);
        break;
        
      case '%layout-change':
        // Layout changed
        logger.debug(`[OptimizedTerminalEngine] Layout changed for ${sessionName}`);
        break;
        
      case '%pane-mode-changed':
        // Pane mode changed
        const pane = parts[1];
        const mode = parts[2];
        logger.debug(`[OptimizedTerminalEngine] Pane ${pane} mode changed to ${mode}`);
        break;
        
      case '%exit':
        // Pane or window exited
        logger.info(`[OptimizedTerminalEngine] Exit event for ${sessionName}`);
        break;
    }
  }

  /**
   * Handle regular pane output
   */
  private handlePaneOutput(sessionName: string, output: string): void {
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    // Extract pane ID from output format (if available)
    const match = output.match(/^(\d+): (.*)$/);
    if (match) {
      const paneIndex = parseInt(match[1]);
      const content = match[2];
      
      const agent = session.agents.get(paneIndex);
      if (agent) {
        this.processPaneOutput(sessionName, agent.paneId, content);
      }
    }
  }

  /**
   * Process output from a specific pane
   */
  private processPaneOutput(sessionName: string, paneId: string, output: string): void {
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    // Find agent by pane ID
    let agent: AgentTerminal | undefined;
    for (const [agentId, agentData] of session.agents) {
      if (agentData.paneId === paneId) {
        agent = agentData;
        break;
      }
    }
    
    if (!agent) return;
    
    // Add to buffer
    agent.buffer.push(output);
    if (agent.buffer.length > this.BUFFER_SIZE) {
      agent.buffer.shift(); // Remove oldest
    }
    
    // Update metrics
    agent.metrics.linesProcessed++;
    agent.metrics.bytesTransmitted += output.length;
    session.statistics.totalOutput++;
    
    // Calculate diff
    const diff = this.calculateDiff(agent.lastOutput, output);
    
    if (diff.hasChanges) {
      agent.lastOutput = output;
      agent.lastSequence++;
      
      // Queue for batched transmission
      this.queueOutput(sessionName, {
        agentId: agent.agentId,
        paneId: agent.paneId,
        diff: diff.delta,
        sequence: agent.lastSequence,
        timestamp: Date.now()
      });
      
      // Send to worker for parsing (non-blocking)
      this.sendToWorker({
        sessionId: sessionName,
        agentId: agent.agentId,
        output: output,
        sequence: agent.lastSequence
      });
    }
  }

  /**
   * Calculate diff between old and new output
   */
  private calculateDiff(oldOutput: string, newOutput: string): { hasChanges: boolean; delta: string } {
    if (!oldOutput) {
      return { hasChanges: true, delta: newOutput };
    }
    
    // Simple diff: find new content
    if (newOutput.startsWith(oldOutput)) {
      const delta = newOutput.substring(oldOutput.length);
      return { hasChanges: delta.length > 0, delta };
    }
    
    // Full replacement if not incremental
    return { hasChanges: true, delta: newOutput };
  }

  /**
   * Queue output for batched transmission
   */
  private queueOutput(sessionName: string, output: any): void {
    const pending = this.pendingOutputs.get(sessionName);
    if (!pending) return;
    
    pending.push(output);
    
    // Set up batch timer if not already set
    if (!this.outputBatchTimers.has(sessionName)) {
      const timer = setTimeout(() => {
        this.flushOutputBatch(sessionName);
      }, this.OUTPUT_BATCH_INTERVAL);
      
      this.outputBatchTimers.set(sessionName, timer);
    }
  }

  /**
   * Flush batched outputs
   */
  private async flushOutputBatch(sessionName: string): Promise<void> {
    const pending = this.pendingOutputs.get(sessionName);
    if (!pending || pending.length === 0) return;
    
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    // Clear timer
    const timer = this.outputBatchTimers.get(sessionName);
    if (timer) {
      clearTimeout(timer);
      this.outputBatchTimers.delete(sessionName);
    }
    
    // Prepare batch payload
    const batch = [...pending];
    pending.length = 0; // Clear array
    
    // Compress if beneficial
    const payload: any = {
      sessionId: sessionName,
      farmId: session.farmId,
      batch,
      timestamp: Date.now()
    };
    
    // Calculate size
    const jsonStr = JSON.stringify(batch);
    const originalSize = Buffer.byteLength(jsonStr);
    
    if (originalSize > 1024) {
      // Compress large batches
      const compressed = await gzip(Buffer.from(jsonStr));
      const compressedSize = compressed.length;
      
      payload.data = compressed.toString('base64');
      payload.compressed = true;
      payload.originalSize = originalSize;
      payload.compressedSize = compressedSize;
      
      // Update compression ratio
      session.statistics.compressionRatio = originalSize / compressedSize;
    } else {
      payload.data = batch;
      payload.compressed = false;
    }
    
    // Update bandwidth metrics
    const now = Date.now();
    const timeDelta = now - session.startTime.getTime();
    session.statistics.bandwidth = session.statistics.totalOutput / (timeDelta / 1000);
    
    // Broadcast via UnifiedConnectionHub
    await unifiedConnectionHub.broadcastToFarm(session.farmId, 'terminal:batch', payload);
    
    // Also publish to Redis for other services
    await redis.publish('terminal:output', JSON.stringify(payload));
  }

  /**
   * Send output to worker for parsing
   */
  private sendToWorker(data: any): void {
    // Get next available worker (round-robin)
    const worker = this.workerPool[Math.floor(Math.random() * this.workerPool.length)];
    
    if (worker) {
      const startTime = Date.now();
      
      worker.postMessage({
        type: 'parse',
        data,
        timestamp: startTime
      });
    }
  }

  /**
   * Handle worker parsing results
   */
  private handleWorkerResult(result: any): void {
    const { sessionId, agentId, activities, error, parseTime } = result;
    
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const agent = session.agents.get(agentId);
    if (!agent) return;
    
    if (error) {
      agent.metrics.errorCount++;
      agent.metrics.lastError = error;
      logger.error(`[OptimizedTerminalEngine] Parse error for ${sessionId}:${agentId}:`, error);
      return;
    }
    
    // Update metrics
    agent.metrics.activitiesDetected += activities.length;
    session.statistics.parseTime = (session.statistics.parseTime + parseTime) / 2; // Running average
    
    // Emit parsed activities
    if (activities.length > 0) {
      this.emit('activities:detected', {
        sessionId,
        agentId,
        activities,
        timestamp: new Date()
      });
      
      // Broadcast via UnifiedConnectionHub
      unifiedConnectionHub.broadcastToFarm(session.farmId, 'agent:activities', {
        sessionId,
        agentId,
        activities
      });
    }
  }

  /**
   * Replace failed worker
   */
  private replaceWorker(failedWorker: Worker): void {
    const index = this.workerPool.indexOf(failedWorker);
    if (index !== -1) {
      // Terminate failed worker
      failedWorker.terminate();
      
      // Create new worker
      const workerPath = path.join(__dirname, 'workers', 'terminalParserWorker.js');
      const newWorker = new Worker(workerPath);
      
      newWorker.on('message', (result) => {
        this.handleWorkerResult(result);
      });
      
      newWorker.on('error', (error) => {
        logger.error('[OptimizedTerminalEngine] Replacement worker error:', error);
      });
      
      this.workerPool[index] = newWorker;
      
      logger.info('[OptimizedTerminalEngine] Replaced failed worker');
    }
  }

  /**
   * Stop terminal streaming for a session
   */
  public async stopSession(sessionName: string): Promise<void> {
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    logger.info(`[OptimizedTerminalEngine] Stopping session: ${sessionName}`);
    
    session.status = 'stopped';
    
    // Flush any pending outputs
    await this.flushOutputBatch(sessionName);
    
    // Stop tmux control process
    const tmuxProcess = this.controlProcesses.get(sessionName);
    if (tmuxProcess) {
      tmuxProcess.stdin?.write('detach\n');
      tmuxProcess.kill('SIGTERM');
      this.controlProcesses.delete(sessionName);
    }
    
    // Clear timers
    const timer = this.outputBatchTimers.get(sessionName);
    if (timer) {
      clearTimeout(timer);
      this.outputBatchTimers.delete(sessionName);
    }
    
    // Clean up session data
    this.sessions.delete(sessionName);
    this.pendingOutputs.delete(sessionName);
    
    // Emit session stopped event
    this.emit('session:stopped', {
      sessionId: sessionName,
      farmId: session.farmId,
      statistics: session.statistics,
      timestamp: new Date()
    });
  }

  /**
   * Handle session error
   */
  private handleSessionError(sessionName: string, error: Error): void {
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    logger.error(`[OptimizedTerminalEngine] Session error for ${sessionName}:`, error);
    
    session.status = 'error' as any;
    
    // Attempt recovery
    this.attemptSessionRecovery(sessionName);
  }

  /**
   * Handle session exit
   */
  private handleSessionExit(sessionName: string, code: number | null): void {
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    if (code !== 0 && session.status === 'active') {
      // Unexpected exit, attempt recovery
      logger.warn(`[OptimizedTerminalEngine] Unexpected exit for ${sessionName}, attempting recovery`);
      this.attemptSessionRecovery(sessionName);
    } else {
      // Normal exit
      this.stopSession(sessionName);
    }
  }

  /**
   * Attempt to recover a failed session
   */
  private async attemptSessionRecovery(sessionName: string, attempt: number = 1): Promise<void> {
    const maxAttempts = 3;
    
    if (attempt > maxAttempts) {
      logger.error(`[OptimizedTerminalEngine] Failed to recover session ${sessionName} after ${maxAttempts} attempts`);
      this.stopSession(sessionName);
      return;
    }
    
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    logger.info(`[OptimizedTerminalEngine] Attempting to recover session ${sessionName} (attempt ${attempt})`);
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    
    try {
      // Restart tmux control
      await this.startTmuxControl(sessionName, session);
      
      session.status = 'active';
      
      logger.info(`[OptimizedTerminalEngine] Successfully recovered session ${sessionName}`);
      
      // Emit recovery event
      this.emit('session:recovered', {
        sessionId: sessionName,
        farmId: session.farmId,
        attempt,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error(`[OptimizedTerminalEngine] Recovery attempt ${attempt} failed for ${sessionName}:`, error);
      // Retry
      this.attemptSessionRecovery(sessionName, attempt + 1);
    }
  }

  /**
   * Setup Redis subscriptions for coordination
   */
  private async setupRedisSubscriptions(): Promise<void> {
    const subscriber = redis.duplicate();
    
    await subscriber.subscribe('terminal:control');
    
    subscriber.on('message', async (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);
        
        if (channel === 'terminal:control') {
          await this.handleControlCommand(data);
        }
      } catch (error) {
        logger.error('[OptimizedTerminalEngine] Error handling Redis message:', error);
      }
    });
  }

  /**
   * Handle control commands from Redis
   */
  private async handleControlCommand(command: any): Promise<void> {
    const { type, sessionId, data } = command;
    
    switch (type) {
      case 'pause':
        this.pauseSession(sessionId);
        break;
      case 'resume':
        this.resumeSession(sessionId);
        break;
      case 'restart':
        await this.restartSession(sessionId);
        break;
    }
  }

  /**
   * Pause output streaming for a session
   */
  private pauseSession(sessionName: string): void {
    const session = this.sessions.get(sessionName);
    if (session && session.status === 'active') {
      session.status = 'paused';
      logger.info(`[OptimizedTerminalEngine] Paused session: ${sessionName}`);
    }
  }

  /**
   * Resume output streaming for a session
   */
  private resumeSession(sessionName: string): void {
    const session = this.sessions.get(sessionName);
    if (session && session.status === 'paused') {
      session.status = 'active';
      logger.info(`[OptimizedTerminalEngine] Resumed session: ${sessionName}`);
    }
  }

  /**
   * Restart a session
   */
  private async restartSession(sessionName: string): Promise<void> {
    const session = this.sessions.get(sessionName);
    if (!session) return;
    
    const { farmId, agentCount } = session;
    
    await this.stopSession(sessionName);
    await this.startSession(sessionName, farmId, agentCount);
  }

  /**
   * Start monitoring for health and metrics
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 10000); // Every 10 seconds
  }

  /**
   * Collect and emit metrics
   */
  private collectMetrics(): void {
    const metrics = {
      sessions: {
        total: this.sessions.size,
        active: 0,
        paused: 0,
        error: 0
      },
      performance: {
        averageOutputRate: 0,
        averageParseTime: 0,
        averageCompressionRatio: 0,
        totalBandwidth: 0
      },
      health: {
        workerPoolSize: this.workerPool.length,
        controlProcesses: this.controlProcesses.size
      }
    };
    
    let totalOutputRate = 0;
    let totalParseTime = 0;
    let totalCompressionRatio = 0;
    let totalBandwidth = 0;
    
    for (const session of this.sessions.values()) {
      // Count by status
      switch (session.status) {
        case 'active':
          metrics.sessions.active++;
          break;
        case 'paused':
          metrics.sessions.paused++;
          break;
        case 'stopped':
          metrics.sessions.error++;
          break;
      }
      
      // Aggregate performance metrics
      totalOutputRate += session.statistics.outputRate;
      totalParseTime += session.statistics.parseTime;
      totalCompressionRatio += session.statistics.compressionRatio;
      totalBandwidth += session.statistics.bandwidth;
    }
    
    // Calculate averages
    if (this.sessions.size > 0) {
      metrics.performance.averageOutputRate = totalOutputRate / this.sessions.size;
      metrics.performance.averageParseTime = totalParseTime / this.sessions.size;
      metrics.performance.averageCompressionRatio = totalCompressionRatio / this.sessions.size;
      metrics.performance.totalBandwidth = totalBandwidth;
    }
    
    // Emit metrics
    this.emit('metrics', metrics);
    
    // Publish to Redis
    redis.publish('terminal:metrics', JSON.stringify(metrics));
  }

  /**
   * Clean up resources
   */
  public async shutdown(): Promise<void> {
    logger.info('[OptimizedTerminalEngine] Shutting down...');
    
    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // Stop all sessions
    for (const sessionName of this.sessions.keys()) {
      await this.stopSession(sessionName);
    }
    
    // Terminate workers
    for (const worker of this.workerPool) {
      await worker.terminate();
    }
    
    logger.info('[OptimizedTerminalEngine] Shutdown complete');
  }

  /**
   * Get session statistics
   */
  public getSessionStatistics(sessionName: string): SessionStatistics | null {
    const session = this.sessions.get(sessionName);
    return session ? session.statistics : null;
  }

  /**
   * Get all active sessions
   */
  public getActiveSessions(): string[] {
    return Array.from(this.sessions.keys()).filter(
      sessionName => this.sessions.get(sessionName)?.status === 'active'
    );
  }
}

// Export singleton instance
export const optimizedTerminalEngine = OptimizedTerminalEngine.getInstance();