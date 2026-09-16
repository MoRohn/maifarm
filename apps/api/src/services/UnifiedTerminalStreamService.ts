/**
 * Unified Terminal Stream Service
 *
 * Production-grade terminal streaming service that consolidates all terminal
 * output capture, processing, and delivery functionality.
 *
 * Features:
 * - Robust tmux pipe-pane integration with health monitoring
 * - Real-time WebSocket streaming with zero batching delays
 * - Automatic error recovery with circuit breaker
 * - Session lifecycle management with atomic operations
 * - Performance metrics and monitoring
 * - Redis-based distributed state management
 */

import { EventEmitter } from 'events';
import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { FSWatcher, watch } from 'chokidar';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { cleanTerminalOutput } from '../utils/terminalCleaner';
import { agentActivityHeartbeatService } from './AgentActivityHeartbeatService';
import { eventOutboxService } from './EventOutboxService';
import { activityParser, ParsedActivity } from './activityParser';
import { yieldDetectionService } from './YieldDetectionService';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface TerminalStream {
  farmId: string;
  agentId: string;
  agentIndex: number;
  agentName: string;
  sessionName: string;
  paneIndex: number;
  windowTarget: string;
  paneRef: string;
  outputPath: string;
  watcher?: FSWatcher;
  lastPosition: number;
  lastActivity: number;
  isActive: boolean;
  retryCount: number;
  errorCount: number;
  bytesTransferred: number;
  startTime: number;

  // Dual-mode capture
  pollInterval?: NodeJS.Timeout;
  lastPollContent: string;
  pollFailures: number;
  lastWatcherEvent: number;

  // Content deduplication
  contentHash: Set<string>;

  // Race condition prevention: lock to prevent file watcher and polling from processing simultaneously
  isProcessing: boolean;

  // Watcher retry timeout tracking to prevent duplicate retry attempts
  retryTimeout?: NodeJS.Timeout;

  // Heartbeat rate limiting - only update DB once per 30 seconds to prevent overload
  lastHeartbeatUpdate: number;

  // CIRCUIT BREAKER: Prevents cascading failures and CPU waste on dead sessions
  // Opens after 3 consecutive failures, closes after 5 minutes
  circuitBreakerOpen: boolean;
  circuitBreakerOpenedAt: number;
  consecutiveFailures: number;
}

interface StreamHealth {
  isHealthy: boolean;
  lastCheck: number;
  errorRate: number;
  latency: number;
  throughput: number;
}

interface StreamMetrics {
  totalStreams: number;
  activeStreams: number;
  totalBytesTransferred: number;
  averageLatency: number;
  errorRate: number;
  healthyStreams: number;
  unhealthyStreams: number;
  startTime: Date;
  successfulWrites: number;
  failedWrites: number;
  bytesTransferred: number;
  pollFallbacks: number;
}

interface FarmContext {
  farmId: string;
  sessionName: string;
  agentCount: number;
  agentNames: string[];
  streams: Set<string>; // Stream keys
  startTime: Date;
  status: 'initializing' | 'active' | 'degraded' | 'failed';
}

interface CoordinatorStats {
  totalAgents: number;
  activeStreams: number;
  failedStreams: number;
  avgLatency: number;
  totalBytesStreamed: number;
  errorsRecovered: number;
}

interface StreamConfig {
  maxRetries: number;
  retryDelay: number;
  healthCheckInterval: number;
  inactivityTimeout: number;
  circuitBreakerThreshold: number;
  maxOutputFileSize: number;
  flushInterval: number;
  pollIdleThreshold: number;
}

// ============================================================================
// Circuit Breaker for Error Handling
// ============================================================================

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        logger.info(LogCategory.TERMINAL, 'Circuit breaker entering half-open state');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      if (this.state === 'half-open') {
        this.reset();
      }
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      logger.error(LogCategory.TERMINAL, `Circuit breaker opened after ${this.failures} failures`);
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'closed';
    logger.info(LogCategory.TERMINAL, 'Circuit breaker reset to closed state');
  }

  getState(): string {
    return this.state;
  }
}

// ============================================================================
// Unified Terminal Stream Service
// ============================================================================

export class UnifiedTerminalStreamService extends EventEmitter {
  private static instance: UnifiedTerminalStreamService;

  // Stream management
  private readonly streams = new Map<string, TerminalStream>();
  private readonly streamHealth = new Map<string, StreamHealth>();
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  // Farm-level coordination
  private readonly farms = new Map<string, FarmContext>();

  // Session tracking
  private readonly pendingSessions = new Map<string, {
    farmId: string;
    agentCount: number;
    windowTarget: string;
    timestamp: number;
  }>();

  // Health monitoring
  private healthCheckInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  // Metrics tracking
  private readonly serviceStartTime = new Date();
  private successfulWrites = 0;
  private failedWrites = 0;
  private errorsRecovered = 0;
  private pollFallbackActivations = 0;

  // Configuration
  private readonly config: StreamConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    healthCheckInterval: 30000, // 30 seconds
    inactivityTimeout: 300000, // 5 minutes
    circuitBreakerThreshold: 5,
    maxOutputFileSize: 100 * 1024 * 1024, // 100MB
    flushInterval: 10, // 10ms for sub-frame delivery (~100fps)
    pollIdleThreshold: 500 // Poll tmux capture-pane after 500ms of file watcher silence (supports Claude Code)
  };

  private readonly POLL_INTERVAL = 500; // 500ms for tmux polling
  private readonly DEDUPE_WINDOW_SIZE = 5000; // Keep last 5000 hashes (increased for high-volume terminals)

  private readonly tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');
  private readonly terminalsDir = pathConfig.getPath('TERMINALS_DIR');

  private constructor() {
    super();
    this.setupCleanupHandlers();
    this.startHealthMonitoring();
    this.startMetricsCollection();
    // Discover existing sessions on startup (async, don't block)
    this.discoverExistingSessions().catch(err => {
      logger.warn(LogCategory.TERMINAL, 'Failed to discover existing sessions:', err);
    });
  }

  static getInstance(): UnifiedTerminalStreamService {
    if (!UnifiedTerminalStreamService.instance) {
      UnifiedTerminalStreamService.instance = new UnifiedTerminalStreamService();
    }
    return UnifiedTerminalStreamService.instance;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Register a farm session before agents start
   */
  registerFarmSession(
    farmId: string,
    sessionName: string,
    agentCount: number,
    windowTarget: string = 'agents'
  ): void {
    const normalizedSession = this.normalizeSessionName(sessionName);
    this.pendingSessions.set(normalizedSession, {
      farmId,
      agentCount,
      windowTarget,
      timestamp: Date.now()
    });

    logger.info(LogCategory.TERMINAL,
      `Registered farm session: ${normalizedSession} with ${agentCount} agents`);
  }

  /**
   * Start streaming for a single agent
   */
  async startStream(
    farmId: string,
    agentId: string,
    agentIndex: number,
    sessionName: string
  ): Promise<void> {
    const streamKey = this.getStreamKey(farmId, agentId);

    // Prevent duplicate streams
    if (this.streams.has(streamKey)) {
      logger.warn(LogCategory.TERMINAL, `Stream already active: ${streamKey}`);
      return;
    }

    const normalizedSession = this.normalizeSessionName(sessionName);
    const pendingInfo = this.pendingSessions.get(normalizedSession);

    if (!pendingInfo) {
      logger.warn(LogCategory.TERMINAL,
        `No pending session info for ${normalizedSession}, using defaults`);
    }

    const windowTarget = pendingInfo?.windowTarget || 'agents';

    try {
      // Wait for tmux session to be ready
      await this.waitForSessionReady(normalizedSession, agentIndex, windowTarget);

      // Create stream object
      const stream: TerminalStream = {
        farmId,
        agentId,
        agentIndex,
        agentName: `Agent ${agentIndex + 1}`, // Default name
        sessionName: normalizedSession,
        paneIndex: agentIndex,
        windowTarget,
        paneRef: `${normalizedSession}:${windowTarget}.${agentIndex}`,
        outputPath: join(this.terminalsDir, farmId, `agent-${agentIndex}.log`),
        lastPosition: 0,
        lastActivity: Date.now(),
        isActive: true,
        retryCount: 0,
        errorCount: 0,
        bytesTransferred: 0,
        startTime: Date.now(),

        // Dual-mode capture
        lastPollContent: '',
        pollFailures: 0,
        lastWatcherEvent: Date.now(),

        // Content deduplication
        contentHash: new Set<string>(),

        // Race condition prevention
        isProcessing: false,

        // Heartbeat rate limiting
        lastHeartbeatUpdate: 0,

        // Circuit breaker state (inline, complements the CircuitBreaker class)
        circuitBreakerOpen: false,
        circuitBreakerOpenedAt: 0,
        consecutiveFailures: 0
      };

      // Initialize circuit breaker
      this.circuitBreakers.set(streamKey, new CircuitBreaker(
        this.config.circuitBreakerThreshold
      ));

      // Setup pipe-pane with retry logic
      await this.setupPipePaneWithRetry(stream);

      // Start file watching
      await this.startFileWatching(stream);

      // Store stream
      this.streams.set(streamKey, stream);

      // Initialize health metrics
      this.streamHealth.set(streamKey, {
        isHealthy: true,
        lastCheck: Date.now(),
        errorRate: 0,
        latency: 0,
        throughput: 0
      });

      logger.info(LogCategory.TERMINAL, `Stream started: ${streamKey} (${stream.paneRef})`);

      // Emit event
      this.emit('stream:started', { farmId, agentId, agentIndex });

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to start stream ${streamKey}:`, error);
      throw error;
    }
  }

  /**
   * Start streaming for all agents in a farm
   */
  async startFarmStreaming(
    farmId: string,
    sessionName: string,
    agentCount: number
  ): Promise<void> {
    logger.info(LogCategory.TERMINAL,
      `Starting farm streaming: ${farmId} with ${agentCount} agents`);

    const promises: Promise<void>[] = [];

    for (let i = 0; i < agentCount; i++) {
      promises.push(
        this.startStream(farmId, `agent-${i}`, i, sessionName)
          .catch(error => {
            logger.error(LogCategory.TERMINAL,
              `Failed to start stream for agent ${i}:`, error);
          })
      );
    }

    await Promise.allSettled(promises);

    // Clean up pending session
    const normalizedSession = this.normalizeSessionName(sessionName);
    this.pendingSessions.delete(normalizedSession);
  }

  /**
   * Start streaming for a single agent with custom name (used by registerFarm)
   */
  private async startStreamWithName(
    farmId: string,
    agentId: string,
    agentIndex: number,
    agentName: string,
    sessionName: string
  ): Promise<void> {
    const streamKey = this.getStreamKey(farmId, agentId);

    // Prevent duplicate streams
    if (this.streams.has(streamKey)) {
      logger.warn(LogCategory.TERMINAL, `Stream already active: ${streamKey}`);
      return;
    }

    const normalizedSession = this.normalizeSessionName(sessionName);
    const pendingInfo = this.pendingSessions.get(normalizedSession);

    if (!pendingInfo) {
      logger.warn(LogCategory.TERMINAL,
        `No pending session info for ${normalizedSession}, using defaults`);
    }

    const windowTarget = pendingInfo?.windowTarget || 'agents';

    try {
      // Wait for tmux session to be ready
      await this.waitForSessionReady(normalizedSession, agentIndex, windowTarget);

      // Create stream object with custom agent name
      const stream: TerminalStream = {
        farmId,
        agentId,
        agentIndex,
        agentName, // Use provided name instead of default
        sessionName: normalizedSession,
        paneIndex: agentIndex,
        windowTarget,
        paneRef: `${normalizedSession}:${windowTarget}.${agentIndex}`,
        outputPath: join(this.terminalsDir, farmId, `agent-${agentIndex}.log`),
        lastPosition: 0,
        lastActivity: Date.now(),
        isActive: true,
        retryCount: 0,
        errorCount: 0,
        bytesTransferred: 0,
        startTime: Date.now(),

        // Dual-mode capture
        lastPollContent: '',
        pollFailures: 0,
        lastWatcherEvent: Date.now(),

        // Content deduplication
        contentHash: new Set<string>(),

        // Race condition prevention
        isProcessing: false,

        // Heartbeat rate limiting
        lastHeartbeatUpdate: 0,

        // Circuit breaker state (inline, complements the CircuitBreaker class)
        circuitBreakerOpen: false,
        circuitBreakerOpenedAt: 0,
        consecutiveFailures: 0
      };

      // Initialize circuit breaker
      this.circuitBreakers.set(streamKey, new CircuitBreaker(
        this.config.circuitBreakerThreshold
      ));

      // Setup pipe-pane with retry logic
      await this.setupPipePaneWithRetry(stream);

      // Start file watching
      await this.startFileWatching(stream);

      // Start dual-mode polling (fallback to tmux capture-pane)
      this.startDualModePolling(stream);

      // Store stream
      this.streams.set(streamKey, stream);

      // Initialize health metrics
      this.streamHealth.set(streamKey, {
        isHealthy: true,
        lastCheck: Date.now(),
        errorRate: 0,
        latency: 0,
        throughput: 0
      });

      logger.info(LogCategory.TERMINAL,
        `Stream started: ${streamKey} (${stream.paneRef}) - ${agentName}`);

      // Emit event
      this.emit('stream:started', { farmId, agentId, agentIndex, agentName });

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to start stream ${streamKey}:`, error);
      throw error;
    }
  }

  /**
   * Stop streaming for a single agent
   */
  async stopStream(farmId: string, agentId: string): Promise<void> {
    const streamKey = this.getStreamKey(farmId, agentId);
    const stream = this.streams.get(streamKey);

    if (!stream) {
      logger.debug(LogCategory.TERMINAL, `Stream not found: ${streamKey}`);
      return;
    }

    logger.info(LogCategory.TERMINAL, `Stopping stream: ${streamKey}`);

    // Mark as inactive
    stream.isActive = false;

    // Stop dual-mode polling
    this.stopDualModePolling(stream);

    // FIX: Clear any pending retry timeout
    if (stream.retryTimeout) {
      clearTimeout(stream.retryTimeout);
      stream.retryTimeout = undefined;
    }

    // Close file watcher
    if (stream.watcher) {
      try {
        await stream.watcher.close();
      } catch (error) {
        logger.warn(LogCategory.TERMINAL, `Error closing watcher for ${streamKey}:`, error);
      }
    }

    // Disable pipe-pane
    try {
      await this.disablePipePane(stream);
    } catch (error) {
      logger.warn(LogCategory.TERMINAL, `Error disabling pipe-pane for ${streamKey}:`, error);
    }

    // Clean up
    this.streams.delete(streamKey);
    this.streamHealth.delete(streamKey);
    this.circuitBreakers.delete(streamKey);

    // Emit event
    this.emit('stream:stopped', { farmId, agentId });
  }

  /**
   * Stop all streams for a farm
   */
  async stopFarmStreaming(farmId: string): Promise<void> {
    logger.info(LogCategory.TERMINAL, `Stopping all streams for farm: ${farmId}`);

    const promises: Promise<void>[] = [];

    for (const [key, stream] of this.streams.entries()) {
      if (stream.farmId === farmId) {
        promises.push(this.stopStream(farmId, stream.agentId));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Alias for stopFarmStreaming - used by cleanup services for coordination
   * This ensures watchers are closed BEFORE files are deleted
   */
  async stopAllStreamsByFarmId(farmId: string): Promise<void> {
    return this.stopFarmStreaming(farmId);
  }

  /**
   * Get streaming metrics
   */
  getMetrics(): StreamMetrics {
    const streams = Array.from(this.streams.values());
    const healthChecks = Array.from(this.streamHealth.values());
    const totalBytes = streams.reduce((sum, s) => sum + s.bytesTransferred, 0);

    return {
      totalStreams: this.streams.size,
      activeStreams: streams.filter(s => s.isActive).length,
      totalBytesTransferred: totalBytes,
      averageLatency: healthChecks.reduce((sum, h) => sum + h.latency, 0) / (healthChecks.length || 1),
      errorRate: healthChecks.reduce((sum, h) => sum + h.errorRate, 0) / (healthChecks.length || 1),
      healthyStreams: healthChecks.filter(h => h.isHealthy).length,
      unhealthyStreams: healthChecks.filter(h => !h.isHealthy).length,
      startTime: this.serviceStartTime,
      successfulWrites: this.successfulWrites,
      failedWrites: this.failedWrites,
      bytesTransferred: totalBytes,
      pollFallbacks: this.pollFallbackActivations
    };
  }

  /**
   * Get stream health status
   */
  getStreamHealth(farmId: string, agentId: string): StreamHealth | null {
    const streamKey = this.getStreamKey(farmId, agentId);
    return this.streamHealth.get(streamKey) || null;
  }

  /**
   * Register a farm with all agents (farm-level coordination)
   * Replaces need to call registerFarmSession + startFarmStreaming separately
   */
  async registerFarm(
    farmId: string,
    sessionName: string,
    agentCount: number,
    agentNames: string[]
  ): Promise<void> {
    logger.info(LogCategory.TERMINAL,
      `Registering farm ${farmId} with ${agentCount} agents`);

    const normalizedSession = this.normalizeSessionName(sessionName);

    // Create farm context
    const farmContext: FarmContext = {
      farmId,
      sessionName: normalizedSession,
      agentCount,
      agentNames,
      streams: new Set(),
      startTime: new Date(),
      status: 'initializing'
    };

    this.farms.set(farmId, farmContext);

    // Register pending session
    this.registerFarmSession(farmId, sessionName, agentCount);

    // Start streaming for all agents
    const promises: Promise<void>[] = [];

    for (let i = 0; i < agentCount; i++) {
      const agentName = agentNames[i] || `Agent ${i + 1}`;
      const agentId = `agent-${i}`;

      promises.push(
        this.startStreamWithName(farmId, agentId, i, agentName, sessionName)
          .then(() => {
            const streamKey = this.getStreamKey(farmId, agentId);
            farmContext.streams.add(streamKey);
          })
          .catch(error => {
            logger.error(LogCategory.TERMINAL,
              `Failed to start stream for ${agentName}:`, error);
          })
      );
    }

    await Promise.allSettled(promises);

    // Update farm status
    farmContext.status = 'active';

    // Broadcast farm agent states to frontend
    await this.broadcastFarmAgentStates(farmId);

    logger.info(LogCategory.TERMINAL,
      `Farm ${farmId} registered successfully with ${farmContext.streams.size}/${agentCount} streams`);
  }

  /**
   * Stop a farm and all its streams
   */
  async stopFarm(farmId: string): Promise<void> {
    const farm = this.farms.get(farmId);
    if (!farm) {
      logger.debug(LogCategory.TERMINAL, `Farm not found: ${farmId}`);
      return;
    }

    logger.info(LogCategory.TERMINAL, `Stopping farm ${farmId}`);

    // Stop all agent streams
    // Create a copy of the stream keys to prevent modification during iteration
    const streamKeys = Array.from(farm.streams);
    const promises: Promise<void>[] = [];
    for (const streamKey of streamKeys) {
      const [, agentId] = streamKey.split(':');
      promises.push(this.stopStream(farmId, agentId));
    }

    await Promise.allSettled(promises);

    // Remove farm
    this.farms.delete(farmId);

    logger.info(LogCategory.TERMINAL, `Farm ${farmId} stopped`);
  }

  /**
   * Get farm-specific statistics
   */
  getStats(): CoordinatorStats {
    const allStreams = Array.from(this.streams.values());
    const allHealth = Array.from(this.streamHealth.values());

    const activeCount = allStreams.filter(s => s.isActive).length;
    const failedCount = allStreams.filter(s => !s.isActive).length;
    const totalBytes = allStreams.reduce((sum, s) => sum + s.bytesTransferred, 0);
    const avgLatency = allHealth.reduce((sum, h) => sum + h.latency, 0) / (allHealth.length || 1);

    return {
      totalAgents: this.streams.size,
      activeStreams: activeCount,
      failedStreams: failedCount,
      avgLatency,
      totalBytesStreamed: totalBytes,
      errorsRecovered: this.errorsRecovered
    };
  }

  /**
   * Get farm-specific status
   */
  getFarmStatus(farmId: string): any {
    const farm = this.farms.get(farmId);
    if (!farm) return null;

    const agents = [];
    for (const streamKey of farm.streams) {
      const stream = this.streams.get(streamKey);
      const health = this.streamHealth.get(streamKey);

      if (stream) {
        agents.push({
          agentId: stream.agentId,
          agentIndex: stream.agentIndex,
          agentName: stream.agentName,
          isActive: stream.isActive,
          isStreaming: stream.isActive && (health?.isHealthy ?? false),
          lastActivity: new Date(stream.lastActivity),
          errorCount: stream.errorCount,
          bytesTransferred: stream.bytesTransferred
        });
      }
    }

    return {
      farmId: farm.farmId,
      sessionName: farm.sessionName,
      agentCount: farm.agentCount,
      status: farm.status,
      agents,
      activeStreams: agents.filter(a => a.isActive).length,
      startTime: farm.startTime
    };
  }

  /**
   * Get all farm statuses (for recovery/monitoring services)
   * Returns: { farmId: { agents: { agentId: isActive } } }
   */
  getAllFarmStatuses(): Record<string, Record<string, boolean>> {
    const result: Record<string, Record<string, boolean>> = {};

    for (const [farmId, farm] of this.farms.entries()) {
      result[farmId] = {};

      for (const streamKey of farm.streams) {
        const stream = this.streams.get(streamKey);
        if (stream) {
          result[farmId][stream.agentId] = stream.isActive;
        }
      }
    }

    return result;
  }

  /**
   * Get session name for a farm (for legacy compatibility)
   */
  getSessionName(farmId: string): string | null {
    const farm = this.farms.get(farmId);
    return farm ? farm.sessionName : null;
  }

  /**
   * Get session names for a farm (returns array for compatibility)
   */
  getSessionNamesForFarm(farmId: string): string[] {
    const sessionName = this.getSessionName(farmId);
    return sessionName ? [sessionName] : [];
  }

  /**
   * Get farm agent states (for frontend synchronization)
   */
  getFarmAgentStates(farmId: string): any[] {
    const farm = this.farms.get(farmId);
    if (!farm) return [];

    const agents = [];
    for (const streamKey of farm.streams) {
      const stream = this.streams.get(streamKey);
      const health = this.streamHealth.get(streamKey);

      if (stream) {
        agents.push({
          agentId: stream.agentId,
          agentIndex: stream.agentIndex,
          agentName: stream.agentName,
          isActive: stream.isActive,
          isStreaming: stream.isActive && (health?.isHealthy ?? false),
          lastActivity: new Date(stream.lastActivity),
          errorCount: stream.errorCount,
          outputPath: stream.outputPath
        });
      }
    }

    return agents;
  }

  /**
   * Broadcast farm agent states to frontend for synchronization
   */
  private async broadcastFarmAgentStates(farmId: string): Promise<void> {
    const agentStates = this.getFarmAgentStates(farmId);

    if (agentStates.length === 0) {
      logger.warn(LogCategory.TERMINAL,
        `No agent states to broadcast for farm ${farmId}`);
      return;
    }

    try {
      // Use eventOutboxService for guaranteed delivery
      await eventOutboxService.publishIdempotent(
        'terminal:agents:ready',
        {
          farmId,
          agents: agentStates,
          timestamp: new Date().toISOString()
        },
        {
          aggregateId: farmId,
          aggregateType: 'farm',
          priority: 1, // High priority for initial registration
          targetRoom: `farm:${farmId}`
        }
      );

      logger.info(LogCategory.TERMINAL,
        `Broadcast agent states for farm ${farmId}: ${agentStates.length} agents`);

    } catch (error) {
      logger.error(LogCategory.TERMINAL,
        `Failed to broadcast farm agent states for ${farmId}:`, error);
      // Fallback to direct broadcast
      websocketManager.sendToRoom(`farm:${farmId}`, 'terminal:agents:ready', {
        farmId,
        agents: agentStates,
        timestamp: new Date().toISOString()
      });
    }
  }

  // ============================================================================
  // Private Methods - Tmux Integration
  // ============================================================================

  private async waitForSessionReady(
    sessionName: string,
    paneIndex: number,
    windowTarget: string,
    maxWaitMs: number = 10000
  ): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 200;

    logger.debug(LogCategory.TERMINAL,
      `Waiting for session ${sessionName}:${windowTarget}.${paneIndex} to be ready`);

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const paneRef = `${sessionName}:${windowTarget}.${paneIndex}`;
        const exists = await this.checkPaneExists(paneRef);

        if (exists) {
          logger.debug(LogCategory.TERMINAL, `Pane ready: ${paneRef}`);
          return;
        }
      } catch (error) {
        // Continue checking
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    logger.warn(LogCategory.TERMINAL,
      `Timeout waiting for pane ${sessionName}:${windowTarget}.${paneIndex}`);
  }

  private async checkPaneExists(paneRef: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(
        `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux list-panes -t "${paneRef}" -F '#{pane_id}' 2>/dev/null`,
        (error, stdout) => {
          resolve(!error && stdout.trim().length > 0);
        }
      );
    });
  }

  private async setupPipePaneWithRetry(stream: TerminalStream): Promise<void> {
    const circuitBreaker = this.circuitBreakers.get(
      this.getStreamKey(stream.farmId, stream.agentId)
    );

    if (!circuitBreaker) {
      throw new Error('Circuit breaker not initialized');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await circuitBreaker.execute(async () => {
          await this.setupPipePane(stream);
        });

        logger.info(LogCategory.TERMINAL,
          `Pipe-pane setup successful for ${stream.paneRef}`);
        return;

      } catch (error) {
        lastError = error as Error;
        logger.warn(LogCategory.TERMINAL,
          `Pipe-pane setup attempt ${attempt + 1}/${this.config.maxRetries} failed: ${stream.paneRef}`);

        if (attempt < this.config.maxRetries - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Pipe-pane setup failed after ${this.config.maxRetries} attempts: ${lastError?.message}`);
  }

  private async setupPipePane(stream: TerminalStream): Promise<void> {
    // Ensure output directory exists
    await fs.mkdir(dirname(stream.outputPath), { recursive: true });

    // Create empty log file
    await fs.writeFile(stream.outputPath, '', { flag: 'a' });

    return new Promise((resolve, reject) => {
      const cmd = `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux pipe-pane -t "${stream.paneRef}" -o "cat >> ${stream.outputPath}"`;

      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Pipe-pane setup failed: ${stderr || error.message}`));
        } else {
          // Send test message to verify pipe-pane is working
          const testCmd = `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux send-keys -t "${stream.paneRef}" "echo '[Terminal] Stream connected at $(date)'" Enter`;
          exec(testCmd, () => {
            resolve();
          });
        }
      });
    });
  }

  private async disablePipePane(stream: TerminalStream): Promise<void> {
    return new Promise((resolve) => {
      exec(
        `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux pipe-pane -t "${stream.paneRef}"`,
        () => {
          resolve();
        }
      );
    });
  }

  // ============================================================================
  // Private Methods - Dual-Mode Capture (File Watching + Polling Fallback)
  // ============================================================================

  /**
   * Start dual-mode polling as fallback to file watching
   * Polls tmux capture-pane every 500ms for content
   */
  private startDualModePolling(stream: TerminalStream): void {
    stream.pollInterval = setInterval(async () => {
      if (!stream.isActive) return;

      const now = Date.now();
      const idleFor = now - stream.lastWatcherEvent;
      if (idleFor < this.config.pollIdleThreshold) {
        return;
      }

      // Record that we're activating the fallback so observability reflects load
      this.pollFallbackActivations++;

      logger.debug(LogCategory.TERMINAL,
        `Polling tmux fallback for ${stream.paneRef} after ${idleFor}ms of watcher silence`);

      try {
        await this.pollTmuxPane(stream);
        // NOTE: Do NOT reset lastWatcherEvent here - that would delay the next poll by pollIdleThreshold
        // The watcher event time should only be updated when the FILE WATCHER fires, not when polling succeeds
        // This ensures continuous 500ms polling for Claude Code and other agents that don't write to stdout
      } catch (error) {
        logger.debug(LogCategory.TERMINAL,
          `Poll error for ${stream.paneRef} (${stream.pollFailures} failures):`, error);
      }
    }, this.POLL_INTERVAL);

    logger.debug(LogCategory.TERMINAL,
      `Dual-mode polling started for ${stream.paneRef}`);
  }

  /**
   * Stop dual-mode polling
   */
  private stopDualModePolling(stream: TerminalStream): void {
    if (stream.pollInterval) {
      clearInterval(stream.pollInterval);
      stream.pollInterval = undefined;
    }
  }

  /**
   * Poll tmux pane for content (fallback when file watching fails)
   */
  private async pollTmuxPane(stream: TerminalStream): Promise<void> {
    // RACE CONDITION FIX: Skip if file watcher is already processing
    if (stream.isProcessing) {
      logger.debug(LogCategory.TERMINAL,
        `Skipping poll for ${stream.paneRef} - file watcher is processing`);
      return;
    }

    try {
      stream.isProcessing = true;
      const paneTarget = `${stream.sessionName}:${stream.windowTarget}.${stream.agentIndex}`;
      const command = `TMUX_TMPDIR="${this.tmuxTmpDir}" tmux capture-pane -t ${paneTarget} -p -S -50`;

      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`capture-pane failed: ${stderr || error.message}`));
          } else {
            resolve({ stdout });
          }
        });
      });

      // Check if content has changed
      if (stdout && stdout !== stream.lastPollContent) {
        const newContent = this.extractNewLines(stream.lastPollContent, stdout);
        stream.lastPollContent = stdout;

        if (newContent && newContent.trim().length > 0) {
          // Clean and deduplicate before processing
          const cleaned = this.cleanOutput(newContent);
          const deduplicated = this.deduplicateContent(stream, cleaned);

          if (deduplicated && deduplicated.length > 0) {
            // Parse activities from the cleaned output
            const activities = activityParser.parseTerminalOutput(
              stream.sessionName,
              stream.agentIndex,
              stream.agentName,
              deduplicated
            );

            // Detect yield items from activities
            if (activities.length > 0) {
              await yieldDetectionService.analyzeActivities(
                stream.farmId,
                stream.agentIndex,
                activities
              );
            }

            // Stream to WebSocket
            await this.streamToWebSocket(stream, deduplicated, activities);

            // Update activity
            stream.lastActivity = Date.now();
            stream.pollFailures = 0;
            this.errorsRecovered++;

            logger.debug(LogCategory.TERMINAL,
              `Polled ${deduplicated.split('\n').length} new lines from ${stream.paneRef}`);
          }
        }
      }

    } catch (error) {
      stream.pollFailures++;

      if (stream.pollFailures > 10) {
        logger.warn(LogCategory.TERMINAL,
          `Tmux polling failing repeatedly for ${stream.paneRef} (${stream.pollFailures} failures)`);
        // Don't stop polling - it might recover
      }
    } finally {
      // Always release the processing lock
      stream.isProcessing = false;
    }
  }

  /**
   * Extract new lines by comparing old and new content
   */
  private extractNewLines(oldContent: string, newContent: string): string {
    if (!oldContent) return newContent;

    // Split into lines
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    // Find where they diverge
    let divergeIndex = 0;
    for (let i = 0; i < Math.min(oldLines.length, newLines.length); i++) {
      if (oldLines[i] !== newLines[i]) {
        divergeIndex = i;
        break;
      }
      divergeIndex = i + 1;
    }

    // Return only new lines
    const extractedLines = newLines.slice(divergeIndex);
    return extractedLines.join('\n');
  }

  /**
   * Deduplicate content using hash-based tracking
   * Keeps last 1000 line hashes in rolling window
   */
  private deduplicateContent(stream: TerminalStream, content: string): string {
    if (!content || content.trim().length === 0) return '';

    const lines = content.split('\n');
    const uniqueLines: string[] = [];

    for (const line of lines) {
      if (!line.trim()) {
        // Keep empty lines for formatting
        uniqueLines.push(line);
        continue;
      }

      const hash = this.hashLine(line);

      // Check if we've seen this line recently
      if (!stream.contentHash.has(hash)) {
        stream.contentHash.add(hash);
        uniqueLines.push(line);

        // FIX: More efficient rolling window maintenance
        // Only cleanup when significantly over limit to avoid O(n) operations every line
        if (stream.contentHash.size > this.DEDUPE_WINDOW_SIZE * 1.5) {
          // Remove oldest entries (first half of excess)
          const excess = stream.contentHash.size - this.DEDUPE_WINDOW_SIZE;
          let removed = 0;
          for (const oldHash of stream.contentHash) {
            if (removed >= excess) break;
            stream.contentHash.delete(oldHash);
            removed++;
          }
        }
      }
    }

    return uniqueLines.join('\n');
  }

  /**
   * Hash a line of text for deduplication
   * Simple hash function for performance
   */
  private hashLine(line: string): string {
    let hash = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  // ============================================================================
  // Private Methods - File Watching
  // ============================================================================

  private async startFileWatching(stream: TerminalStream): Promise<void> {
    // MEMORY LEAK FIX: Close any existing watcher before creating a new one
    // This prevents duplicate listeners accumulating when retrying or restarting
    if (stream.watcher) {
      try {
        stream.watcher.removeAllListeners(); // Remove all event listeners first
        await stream.watcher.close();
        logger.debug(LogCategory.TERMINAL, `Closed existing watcher for ${stream.paneRef} before creating new one`);
      } catch (closeError) {
        logger.warn(LogCategory.TERMINAL, `Error closing existing watcher for ${stream.paneRef}:`, closeError);
      }
      stream.watcher = undefined;
    }

    // Ensure file exists
    await fs.writeFile(stream.outputPath, '', { flag: 'a' });

    // Setup file watcher
    stream.watcher = watch(stream.outputPath, {
      persistent: true,
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10
      }
    });

    stream.watcher.on('change', async () => {
      if (!stream.isActive) return;

      try {
        stream.lastWatcherEvent = Date.now();
        await this.processNewOutput(stream);
      } catch (error) {
        logger.error(LogCategory.TERMINAL,
          `Error processing output for ${stream.paneRef}:`, error);
        stream.errorCount++;
      }
    });

    stream.watcher.on('error', (error) => {
      logger.error(LogCategory.TERMINAL,
        `Watcher error for ${stream.paneRef}:`, error);
      stream.errorCount++;
      this.handleWatcherError(stream);
    });
  }

  private async processNewOutput(stream: TerminalStream): Promise<void> {
    // RACE CONDITION FIX: Skip if polling is already processing
    if (stream.isProcessing) {
      logger.debug(LogCategory.TERMINAL,
        `Skipping file watcher for ${stream.paneRef} - polling is processing`);
      return;
    }

    const startTime = Date.now();

    try {
      stream.isProcessing = true;
      // Check file size
      const stats = await fs.stat(stream.outputPath);

      if (stats.size > this.config.maxOutputFileSize) {
        logger.warn(LogCategory.TERMINAL,
          `Output file exceeds maximum size: ${stream.outputPath}`);
        await this.rotateOutputFile(stream);
        return;
      }

      if (stats.size <= stream.lastPosition) {
        return;
      }

      // Read new content with chunked reading to prevent memory overflow
      // MAX_READ_CHUNK_SIZE limits memory allocation even for large files
      const MAX_READ_CHUNK_SIZE = 65536; // 64KB max per read
      const bytesToRead = Math.min(stats.size - stream.lastPosition, MAX_READ_CHUNK_SIZE);
      const buffer = Buffer.alloc(bytesToRead);
      const fd = await fs.open(stream.outputPath, 'r');

      try {
        await fd.read(buffer, 0, buffer.length, stream.lastPosition);
      } finally {
        await fd.close();
      }

      stream.lastPosition += bytesToRead; // Increment by actual bytes read, not total file size
      stream.lastActivity = Date.now();
      stream.lastWatcherEvent = stream.lastActivity;

      const content = buffer.toString('utf-8');
      stream.bytesTransferred += buffer.length;

      // Clean and deduplicate output to prevent duplicate lines in WebSocket stream
      const cleanedContent = this.cleanOutput(content);
      const deduplicatedContent = this.deduplicateContent(stream, cleanedContent);

      // Count lines for activity tracking
      const lineCount = deduplicatedContent.split('\n').filter(line => line.trim()).length;

      // Update agent activity heartbeat
      if (lineCount > 0) {
        agentActivityHeartbeatService.recordTerminalOutput(
          stream.farmId,
          stream.agentIndex,
          lineCount
        );

        // FIX: Update database heartbeat on terminal output to prevent false orphan detection
        // This is critical - farms were being marked orphaned during AI thinking pauses
        // because in-memory lastActivity wasn't synced to database last_heartbeat
        // RATE LIMITING: Only update once per 30 seconds to prevent database overload
        const HEARTBEAT_UPDATE_INTERVAL = 30000; // 30 seconds
        const now = Date.now();
        if (now - stream.lastHeartbeatUpdate >= HEARTBEAT_UPDATE_INTERVAL) {
          stream.lastHeartbeatUpdate = now;
          try {
            const { db } = await import('../database/connection');
            await db.query(
              'UPDATE farms SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = $1',
              [stream.farmId]
            );
          } catch (heartbeatError) {
            logger.warn(LogCategory.TERMINAL, `Failed to update heartbeat for farm ${stream.farmId}:`, heartbeatError);
            // Don't fail the stream if heartbeat update fails
          }
        }
      }

      // Parse activities from the cleaned output
      const activities = activityParser.parseTerminalOutput(
        stream.sessionName,
        stream.agentIndex,
        stream.agentName,
        deduplicatedContent
      );

      // Detect yield items from activities
      if (activities.length > 0) {
        await yieldDetectionService.analyzeActivities(
          stream.farmId,
          stream.agentIndex,
          activities
        );
      }

      // Stream immediately to WebSocket (zero delay)
      await this.streamToWebSocket(stream, deduplicatedContent, activities);

      // Update health metrics
      const latency = Date.now() - startTime;
      this.updateStreamHealth(stream, latency);

    } catch (error) {
      logger.error(LogCategory.TERMINAL,
        `Error reading output for ${stream.paneRef}:`, error);
      throw error;
    } finally {
      // Always release the processing lock
      stream.isProcessing = false;
    }
  }

  private async rotateOutputFile(stream: TerminalStream): Promise<void> {
    const rotatedPath = `${stream.outputPath}.${Date.now()}.old`;
    await fs.rename(stream.outputPath, rotatedPath);
    await fs.writeFile(stream.outputPath, '', { flag: 'w' });
    stream.lastPosition = 0;

    logger.info(LogCategory.TERMINAL,
      `Rotated output file: ${stream.outputPath} -> ${rotatedPath}`);

    // Schedule cleanup of old rotated files (async, non-blocking)
    this.cleanupOldRotatedFiles(stream.farmId).catch(err => {
      logger.warn(LogCategory.TERMINAL, `Failed to cleanup old rotated files:`, err);
    });
  }

  /**
   * Clean up old rotated terminal log files to prevent disk space exhaustion
   * Keeps the 5 most recent rotated files per agent, deletes older ones
   */
  private async cleanupOldRotatedFiles(farmId: string): Promise<void> {
    const MAX_ROTATED_FILES_PER_AGENT = 5;
    const farmTerminalDir = join(this.terminalsDir, farmId);

    try {
      const files = await fs.readdir(farmTerminalDir);
      const oldFiles = files.filter(f => f.endsWith('.old'));

      if (oldFiles.length <= MAX_ROTATED_FILES_PER_AGENT) {
        return; // Nothing to clean up
      }

      // Group by agent (e.g., agent-0.log.*.old, agent-1.log.*.old)
      const filesByAgent = new Map<string, string[]>();
      for (const file of oldFiles) {
        // Extract agent prefix (e.g., "agent-0" from "agent-0.log.1234567890.old")
        const match = file.match(/^(agent-\d+\.log)\.\d+\.old$/);
        if (match) {
          const agentPrefix = match[1];
          if (!filesByAgent.has(agentPrefix)) {
            filesByAgent.set(agentPrefix, []);
          }
          filesByAgent.get(agentPrefix)!.push(file);
        }
      }

      // For each agent, keep only the most recent N files
      for (const [agentPrefix, agentFiles] of filesByAgent) {
        if (agentFiles.length <= MAX_ROTATED_FILES_PER_AGENT) {
          continue;
        }

        // Sort by timestamp (extracted from filename) - newer first
        agentFiles.sort((a, b) => {
          const tsA = parseInt(a.match(/\.(\d+)\.old$/)?.[1] || '0', 10);
          const tsB = parseInt(b.match(/\.(\d+)\.old$/)?.[1] || '0', 10);
          return tsB - tsA; // Descending (newest first)
        });

        // Delete files beyond the max count
        const filesToDelete = agentFiles.slice(MAX_ROTATED_FILES_PER_AGENT);
        for (const file of filesToDelete) {
          const fullPath = join(farmTerminalDir, file);
          try {
            await fs.unlink(fullPath);
            logger.debug(LogCategory.TERMINAL, `Deleted old rotated file: ${fullPath}`);
          } catch (err) {
            logger.warn(LogCategory.TERMINAL, `Failed to delete old rotated file ${fullPath}:`, err);
          }
        }

        if (filesToDelete.length > 0) {
          logger.info(LogCategory.TERMINAL,
            `Cleaned up ${filesToDelete.length} old rotated files for ${agentPrefix} in farm ${farmId}`);
        }
      }
    } catch (err) {
      // Directory may not exist yet or be inaccessible
      logger.debug(LogCategory.TERMINAL, `Cleanup skipped for ${farmTerminalDir}:`, err);
    }
  }

  private handleWatcherError(stream: TerminalStream): void {
    stream.retryCount++;
    stream.consecutiveFailures++;
    stream.lastWatcherEvent = 0;

    // CIRCUIT BREAKER: After 3 consecutive failures, open the circuit for 5 minutes
    // This prevents cascading failures and CPU waste on dead tmux sessions
    const CIRCUIT_BREAKER_THRESHOLD = 3;
    const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000; // 5 minutes

    // Check if circuit breaker should open
    if (stream.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !stream.circuitBreakerOpen) {
      stream.circuitBreakerOpen = true;
      stream.circuitBreakerOpenedAt = Date.now();
      logger.warn(LogCategory.TERMINAL,
        `Circuit breaker OPENED for ${stream.paneRef} after ${stream.consecutiveFailures} consecutive failures. Will retry in 5 minutes.`);
    }

    // If circuit breaker is open, check if it's time to attempt recovery
    if (stream.circuitBreakerOpen) {
      const timeSinceOpen = Date.now() - stream.circuitBreakerOpenedAt;
      if (timeSinceOpen < CIRCUIT_BREAKER_RESET_MS) {
        // Circuit is still open, skip retry
        logger.debug(LogCategory.TERMINAL,
          `Circuit breaker open for ${stream.paneRef}, skipping retry. Remaining: ${Math.ceil((CIRCUIT_BREAKER_RESET_MS - timeSinceOpen) / 1000)}s`);
        return;
      }
      // Time to attempt recovery
      logger.info(LogCategory.TERMINAL,
        `Circuit breaker attempting recovery for ${stream.paneRef} after ${CIRCUIT_BREAKER_RESET_MS / 1000}s cooldown`);
      stream.circuitBreakerOpen = false;
      stream.consecutiveFailures = 0;
      stream.retryCount = 0;
    }

    if (stream.retryCount > this.config.maxRetries) {
      logger.error(LogCategory.TERMINAL,
        `Max retries exceeded for ${stream.paneRef}, stopping stream`);
      this.stopStream(stream.farmId, stream.agentId);
      return;
    }

    // FIX: Clear any existing retry timeout to prevent duplicate retry attempts
    if (stream.retryTimeout) {
      clearTimeout(stream.retryTimeout);
      stream.retryTimeout = undefined;
    }

    const delay = this.config.retryDelay * Math.pow(2, stream.retryCount - 1);

    // FIX: Track the retry timeout so it can be cleared on subsequent errors or cleanup
    stream.retryTimeout = setTimeout(async () => {
      stream.retryTimeout = undefined; // Clear reference after execution
      try {
        if (stream.watcher) {
          await stream.watcher.close();
          stream.watcher = undefined;
        }
        await this.startFileWatching(stream);
        // Success! Reset consecutive failures
        stream.retryCount = 0;
        stream.consecutiveFailures = 0;
        logger.debug(LogCategory.TERMINAL, `Watcher recovered for ${stream.paneRef}`);
      } catch (error) {
        logger.error(LogCategory.TERMINAL,
          `Failed to restart watcher for ${stream.paneRef}:`, error);
      }
    }, delay);
  }

  // ============================================================================
  // Private Methods - Output Processing & Streaming
  // ============================================================================

  /**
   * Clean terminal output using comprehensive cleaning utility
   * Handles ANSI codes, duplicate keystrokes, control chars, and UI chrome
   */
  private cleanOutput(content: string): string {
    try {
      // Apply comprehensive terminal cleaning
      let cleaned = cleanTerminalOutput(content, {
        preserveColor: false,           // Remove all color codes
        normalizeLineEndings: true,     // Normalize to \n
        trimEmpty: false                // Keep empty lines for formatting
      });

      // Additional orchestrator/system message filtering
      cleaned = this.filterSystemMessages(cleaned);

      return cleaned;
    } catch (error) {
      logger.error(LogCategory.TERMINAL, 'Error cleaning terminal output:', error);
      // Fallback to basic cleaning
      return content
        .replace(/\x1B\[[0-9;]*[JKmsu]/g, '')
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    }
  }

  /**
   * Filter out orchestrator debug messages and startup noise
   */
  private filterSystemMessages(content: string): string {
    if (!content) return '';

    return content
      // Remove orchestrator launch messages
      .replace(/\[Farm.*?\] (Launching|Starting|Created).*?\n/g, '')
      // Remove Python orchestrator debug output
      .replace(/\[DEBUG\].*?\n/g, '')
      .replace(/INFO:.*?orchestrator.*?\n/gi, '')
      // Remove tmux system messages
      .replace(/\[tmux\].*?\n/g, '')
      .replace(/sessions should be nested with care.*?\n/gi, '')
      // Remove empty repeated connection messages
      .replace(/(\nconnected to .*?\n)+/g, '\nconnected\n')
      // Remove agent initialization spam (keep first occurrence only)
      .replace(/(Agent \d+ initialized.*?\n){2,}/g, '$1')
      // Trim excessive newlines (max 2 consecutive)
      .replace(/\n{3,}/g, '\n\n');
  }

  private async streamToWebSocket(
    stream: TerminalStream,
    content: string,
    activities?: ParsedActivity[]
  ): Promise<void> {
    if (!content || content.length === 0) return;

    const payload = {
      farmId: stream.farmId,
      agentId: stream.agentId,
      agentIndex: stream.agentIndex,
      sessionName: stream.sessionName,
      content,
      timestamp: new Date().toISOString()
    };

    // Use Event Outbox for guaranteed delivery of critical outputs
    // (first 10 lines or lines containing 'error', 'failed', 'exception')
    const isCritical = stream.bytesTransferred < 10240 || // First 10KB
                      content.toLowerCase().match(/(error|fail|exception|critical)/);

    if (isCritical) {
      try {
        await eventOutboxService.publishIdempotent(
          'terminal:output',
          payload,
          {
            aggregateId: `${stream.farmId}:${stream.agentIndex}`,
            aggregateType: 'terminal',
            priority: 2,
            targetRoom: `farm:${stream.farmId}`
          }
        );

        logger.debug(LogCategory.TERMINAL,
          `Critical terminal output queued for guaranteed delivery: ${stream.paneRef}`);
      } catch (error) {
        logger.error(LogCategory.TERMINAL,
          `Failed to queue critical terminal output, falling back to direct broadcast: ${error}`);
        // Fallback to direct broadcast
        websocketManager.sendToRoom(`farm:${stream.farmId}`, 'terminal:output', payload);
      }
    } else {
      // Direct broadcast for non-critical output (majority of traffic)
      websocketManager.sendToRoom(`farm:${stream.farmId}`, 'terminal:output', payload);
    }

    // Stream parsed activities if available
    if (activities && activities.length > 0) {
      const activitiesPayload = {
        farmId: stream.farmId,
        agentId: stream.agentId,
        agentIndex: stream.agentIndex,
        agentName: stream.agentName,
        activities,
        timestamp: new Date().toISOString()
      };

      // Broadcast activities as a separate event for UI consumption
      websocketManager.sendToRoom(`farm:${stream.farmId}`, 'terminal:activities', activitiesPayload);

      logger.debug(LogCategory.TERMINAL,
        `Streamed ${activities.length} activities for ${stream.agentName} (${stream.paneRef})`);
    }

    // Emit local event
    this.emit('output', {
      farmId: stream.farmId,
      agentId: stream.agentId,
      agentIndex: stream.agentIndex,
      content
    });

    this.successfulWrites++;
  }

  // ============================================================================
  // Private Methods - Health Monitoring
  // ============================================================================

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    for (const [key, stream] of this.streams.entries()) {
      try {
        const health = this.streamHealth.get(key);
        if (!health) continue;

        // Check for inactivity
        const inactiveTime = Date.now() - stream.lastActivity;
        if (inactiveTime > this.config.inactivityTimeout) {
          logger.warn(LogCategory.TERMINAL,
            `Stream ${key} inactive for ${Math.floor(inactiveTime / 1000)}s`);
          health.isHealthy = false;
        }

        // Check error rate
        const errorRate = stream.errorCount / Math.max(1, stream.bytesTransferred / 1024);
        if (errorRate > 0.1) {
          logger.warn(LogCategory.TERMINAL,
            `High error rate for stream ${key}: ${(errorRate * 100).toFixed(2)}%`);
          health.isHealthy = false;
        }

        // Check pipe-pane health
        const paneExists = await this.checkPaneExists(stream.paneRef);
        if (!paneExists) {
          logger.error(LogCategory.TERMINAL,
            `Pane no longer exists for stream ${key}`);
          health.isHealthy = false;
          await this.stopStream(stream.farmId, stream.agentId);
        }

        health.lastCheck = Date.now();

      } catch (error) {
        logger.error(LogCategory.TERMINAL,
          `Health check failed for ${key}:`, error);
      }
    }
  }

  private updateStreamHealth(stream: TerminalStream, latency: number): void {
    const key = this.getStreamKey(stream.farmId, stream.agentId);
    const health = this.streamHealth.get(key);

    if (health) {
      health.latency = latency;
      health.throughput = stream.bytesTransferred / Math.max(1, (Date.now() - stream.startTime) / 1000);
      health.errorRate = stream.errorCount / Math.max(1, stream.bytesTransferred / 1024);
      health.lastCheck = Date.now();
    }
  }

  // ============================================================================
  // Private Methods - Metrics & Monitoring
  // ============================================================================

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 60000); // Every minute
  }

  private collectMetrics(): void {
    const metrics = this.getMetrics();

    logger.info(LogCategory.TERMINAL, 'Terminal Stream Metrics:', {
      totalStreams: metrics.totalStreams,
      activeStreams: metrics.activeStreams,
      healthyStreams: metrics.healthyStreams,
      avgLatency: `${metrics.averageLatency.toFixed(2)}ms`,
      errorRate: `${(metrics.errorRate * 100).toFixed(2)}%`,
      totalBytes: `${(metrics.totalBytesTransferred / 1024 / 1024).toFixed(2)}MB`,
      pollFallbacks: metrics.pollFallbacks
    });

    // Emit metrics event
    this.emit('metrics', metrics);
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private getStreamKey(farmId: string, agentId: string): string {
    return `${farmId}:${agentId}`;
  }

  private normalizeSessionName(sessionName: string): string {
    if (!sessionName) return sessionName;

    return sessionName
      .replace(/^farm_/, 'farm-')
      .replace(/^quick_/, 'quick-')
      .replace(/^wild_/, 'wild-')
      .replace(/^gowild_/, 'gowild-')
      .trim();
  }

  private setupCleanupHandlers(): void {
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  private async cleanup(): Promise<void> {
    logger.info(LogCategory.TERMINAL, 'Cleaning up terminal streams');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Stop all streams
    const promises: Promise<void>[] = [];
    for (const stream of this.streams.values()) {
      promises.push(this.stopStream(stream.farmId, stream.agentId));
    }

    await Promise.allSettled(promises);

    // Clear maps
    this.streams.clear();
    this.streamHealth.clear();
    this.circuitBreakers.clear();
    this.pendingSessions.clear();
  }

  /**
   * Discover and attach to existing tmux sessions on startup
   */
  private async discoverExistingSessions(): Promise<void> {
    try {
      const listCommand = `TMUX_TMPDIR=${this.tmuxTmpDir} tmux list-sessions -F "#{session_name}" 2>/dev/null`;
      const SESSION_DISCOVERY_TIMEOUT = 5000; // 5 second timeout for session discovery

      const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const process = exec(listCommand, { timeout: SESSION_DISCOVERY_TIMEOUT }, (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        });

        // Safety timeout in case exec timeout doesn't work as expected
        const safetyTimeout = setTimeout(() => {
          process.kill('SIGKILL');
          reject(new Error('Session discovery timed out'));
        }, SESSION_DISCOVERY_TIMEOUT + 1000);

        // Clear safety timeout on process exit
        process.on('exit', () => clearTimeout(safetyTimeout));
        process.on('error', () => clearTimeout(safetyTimeout));
      });

      const sessionNames = stdout.split('\n').filter(name => name.startsWith('farm-'));

      if (sessionNames.length === 0) {
        logger.info(LogCategory.TERMINAL, 'No existing farm sessions found');
        return;
      }

      logger.info(LogCategory.TERMINAL, `Discovered ${sessionNames.length} existing farm sessions`);

      // For each session, count panes and start streaming
      for (const sessionName of sessionNames) {
        const farmId = sessionName.replace('farm-', '');

        try {
          const paneCount = await this.countPanes(sessionName);
          const windowTarget = await this.detectWindowTarget(sessionName);

          logger.info(LogCategory.TERMINAL,
            `Attaching to existing farm ${farmId}: ${paneCount} agents, window: ${windowTarget}`);

          // Register and start streaming
          this.registerFarmSession(farmId, sessionName, paneCount, windowTarget);
          await this.startFarmStreaming(farmId, sessionName, paneCount);

        } catch (error) {
          logger.error(LogCategory.TERMINAL,
            `Failed to attach to session ${sessionName}:`, error);
        }
      }

    } catch (error) {
      // No sessions found or tmux not running
      logger.info(LogCategory.TERMINAL, 'No existing tmux sessions found');
    }
  }

  /**
   * Count panes in a tmux session
   */
  private async countPanes(sessionName: string): Promise<number> {
    const PANE_COUNT_TIMEOUT = 3000; // 3 second timeout
    try {
      const countCommand = `TMUX_TMPDIR=${this.tmuxTmpDir} tmux list-panes -t ${sessionName} -a | wc -l`;
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        exec(countCommand, { timeout: PANE_COUNT_TIMEOUT }, (error, stdout) => {
          if (error) reject(error);
          else resolve({ stdout });
        });
      });
      return parseInt(stdout.trim()) || 1;
    } catch {
      return 1;
    }
  }

  /**
   * Detect if session uses 'agents' window (XenoSync) or '0' window (standard)
   */
  private async detectWindowTarget(sessionName: string): Promise<string> {
    const WINDOW_DETECT_TIMEOUT = 3000; // 3 second timeout
    try {
      const windowCommand = `TMUX_TMPDIR=${this.tmuxTmpDir} tmux list-windows -t ${sessionName} -F "#{window_name}"`;
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        exec(windowCommand, { timeout: WINDOW_DETECT_TIMEOUT }, (error, stdout) => {
          if (error) reject(error);
          else resolve({ stdout });
        });
      });

      const windows = stdout.split('\n').filter(w => w);
      return windows.includes('agents') ? 'agents' : '0';
    } catch {
      return '0'; // Default to window 0
    }
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const unifiedTerminalStreamService = UnifiedTerminalStreamService.getInstance();
