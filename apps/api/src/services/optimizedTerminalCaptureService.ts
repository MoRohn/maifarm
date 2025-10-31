/**
 * Optimized Terminal Output Capture Service
 * Reduces multiple capture attempts and improves terminal streaming efficiency
 * Addresses performance issues with redundant tmux operations
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/structuredLogger';
import { broadcastDeduplicationService } from './broadcastDeduplicationService';

const execAsync = promisify(exec);

interface CaptureSession {
  sessionId: string;
  farmId: string;
  agentCount: number;
  windowTarget: string; // 'agents' or '0'
  status: 'initializing' | 'active' | 'paused' | 'stopped';
  lastCaptureTime: number;
  captureInterval: NodeJS.Timeout | null;
  agents: Map<number, AgentCaptureState>;
  errorCount: number;
  successCount: number;
  avgCaptureTime: number;
}

interface AgentCaptureState {
  agentIndex: number;
  lastContentHash: string;
  lastContentLength: number;
  lastSuccessfulCapture: number;
  consecutiveFailures: number;
  captureBuffer: string;
  paused: boolean;
}

interface CaptureResult {
  success: boolean;
  content: string;
  lines: string[];
  contentHash: string;
  captureTime: number;
  newContent: boolean;
  error?: string;
}

interface CaptureMetrics {
  totalCaptures: number;
  successfulCaptures: number;
  failedCaptures: number;
  avgCaptureTime: number;
  deduplicatedCaptures: number;
  contentChangeRate: number;
}

export class OptimizedTerminalCaptureService extends EventEmitter {
  private static instance: OptimizedTerminalCaptureService;
  private activeSessions: Map<string, CaptureSession> = new Map();
  private captureCache: Map<string, { content: string; hash: string; timestamp: number }> = new Map();
  private metrics: CaptureMetrics = {
    totalCaptures: 0,
    successfulCaptures: 0,
    failedCaptures: 0,
    avgCaptureTime: 0,
    deduplicatedCaptures: 0,
    contentChangeRate: 0
  };
  
  // Optimization settings
  private readonly DEFAULT_CAPTURE_INTERVAL = 1500; // 1.5 seconds (less aggressive)
  private readonly FAST_CAPTURE_INTERVAL = 800; // 800ms for active sessions
  private readonly SLOW_CAPTURE_INTERVAL = 3000; // 3 seconds for idle sessions
  private readonly CACHE_TTL = 5000; // 5 seconds cache TTL
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private readonly CONTENT_HASH_CACHE_SIZE = 1000;
  private readonly CAPTURE_TIMEOUT = 3000; // 3 second timeout for tmux commands
  private readonly ADAPTIVE_INTERVAL_ENABLED = true;
  
  // Content change detection
  private readonly MIN_CONTENT_CHANGE_THRESHOLD = 10; // Minimum characters for change detection
  private readonly HASH_COMPARISON_ENABLED = true;
  
  private cleanupInterval: NodeJS.Timeout;
  
  private constructor() {
    super();
    this.startCleanupInterval();
  }
  
  static getInstance(): OptimizedTerminalCaptureService {
    if (!OptimizedTerminalCaptureService.instance) {
      OptimizedTerminalCaptureService.instance = new OptimizedTerminalCaptureService();
    }
    return OptimizedTerminalCaptureService.instance;
  }
  
  /**
   * Start optimized capturing for a session
   */
  async startCapturing(sessionId: string, farmId: string, agentCount: number): Promise<boolean> {
    if (this.activeSessions.has(sessionId)) {
      logger.debug(LogCategory.TERMINAL, `Session ${sessionId} already being captured`);
      return true;
    }
    
    logger.info(LogCategory.TERMINAL, `Starting optimized capture for session ${sessionId}`);
    
    try {
      // Detect window target efficiently
      const windowTarget = await this.detectWindowTarget(sessionId);
      
      // Initialize session
      const session: CaptureSession = {
        sessionId,
        farmId,
        agentCount,
        windowTarget,
        status: 'initializing',
        lastCaptureTime: 0,
        captureInterval: null,
        agents: new Map(),
        errorCount: 0,
        successCount: 0,
        avgCaptureTime: 0
      };
      
      // Initialize agent states
      for (let i = 0; i < agentCount; i++) {
        session.agents.set(i, {
          agentIndex: i,
          lastContentHash: '',
          lastContentLength: 0,
          lastSuccessfulCapture: 0,
          consecutiveFailures: 0,
          captureBuffer: '',
          paused: false
        });
      }
      
      this.activeSessions.set(sessionId, session);
      
      // Wait for session to be ready before starting capture
      const sessionReady = await this.waitForSessionReady(sessionId, 30000);
      if (!sessionReady) {
        logger.warn(LogCategory.TERMINAL, `Session ${sessionId} not ready, starting capture anyway`);
      }
      
      // Start capturing
      session.status = 'active';
      this.startCaptureLoop(sessionId);
      
      this.emit('capture:started', { sessionId, farmId, agentCount });
      
      return true;
    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to start capture for ${sessionId}: ${error}`);
      this.activeSessions.delete(sessionId);
      return false;
    }
  }
  
  /**
   * Stop capturing for a session
   */
  stopCapturing(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    logger.info(LogCategory.TERMINAL, `Stopping capture for session ${sessionId}`);
    
    session.status = 'stopped';
    
    if (session.captureInterval) {
      clearInterval(session.captureInterval);
      session.captureInterval = null;
    }
    
    // Clean up cache entries for this session
    const keysToDelete: string[] = [];
    for (const [key] of this.captureCache) {
      if (key.startsWith(sessionId)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.captureCache.delete(key);
    }
    
    this.activeSessions.delete(sessionId);
    
    this.emit('capture:stopped', { sessionId });
  }
  
  /**
   * Wait for session to be ready
   */
  private async waitForSessionReady(sessionId: string, maxWaitMs: number): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const exists = await this.checkSessionExists(sessionId);
        if (exists) {
          // Additional check for panes
          const session = this.activeSessions.get(sessionId)!;
          const paneCount = await this.getPaneCount(sessionId, session.windowTarget);
          
          if (paneCount > 0) {
            logger.debug(LogCategory.TERMINAL, 
              `Session ${sessionId} ready with ${paneCount} panes`);
            return true;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return false;
  }
  
  /**
   * Start the optimized capture loop
   */
  private startCaptureLoop(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    const captureInterval = this.calculateOptimalInterval(session);
    
    session.captureInterval = setInterval(async () => {
      await this.performOptimizedCapture(sessionId);
    }, captureInterval);
    
    logger.debug(LogCategory.TERMINAL, 
      `Started capture loop for ${sessionId} with ${captureInterval}ms interval`);
  }
  
  /**
   * Calculate optimal capture interval based on session activity
   */
  private calculateOptimalInterval(session: CaptureSession): number {
    if (!this.ADAPTIVE_INTERVAL_ENABLED) {
      return this.DEFAULT_CAPTURE_INTERVAL;
    }
    
    const now = Date.now();
    const timeSinceLastCapture = now - session.lastCaptureTime;
    
    // Fast interval for new or recently active sessions
    if (session.successCount < 5 || timeSinceLastCapture < 10000) {
      return this.FAST_CAPTURE_INTERVAL;
    }
    
    // Calculate activity rate based on successful captures with content changes
    const activityRate = session.successCount / Math.max(1, session.errorCount + session.successCount);
    
    if (activityRate > 0.8) {
      return this.FAST_CAPTURE_INTERVAL;
    } else if (activityRate > 0.5) {
      return this.DEFAULT_CAPTURE_INTERVAL;
    } else {
      return this.SLOW_CAPTURE_INTERVAL;
    }
  }
  
  /**
   * Perform optimized capture for all agents in a session
   */
  private async performOptimizedCapture(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') return;
    
    const startTime = Date.now();
    
    // Check if session still exists before capturing
    const sessionExists = await this.checkSessionExists(sessionId);
    if (!sessionExists) {
      logger.info(LogCategory.TERMINAL, 
        `Session ${sessionId} no longer exists, stopping capture`);
      this.stopCapturing(sessionId);
      return;
    }
    
    // Capture all agents in parallel for better performance
    const capturePromises: Promise<void>[] = [];
    
    for (const [agentIndex, agentState] of session.agents) {
      if (!agentState.paused) {
        capturePromises.push(this.captureAgent(session, agentIndex));
      }
    }
    
    try {
      await Promise.allSettled(capturePromises);
      
      session.lastCaptureTime = Date.now();
      session.successCount++;
      
      // Update average capture time
      const captureTime = Date.now() - startTime;
      session.avgCaptureTime = 
        (session.avgCaptureTime * (session.successCount - 1) + captureTime) / session.successCount;
      
      // Adaptive interval adjustment
      if (this.ADAPTIVE_INTERVAL_ENABLED && session.captureInterval) {
        const newInterval = this.calculateOptimalInterval(session);
        const currentInterval = session.captureInterval._idleTimeout || this.DEFAULT_CAPTURE_INTERVAL;
        
        // Only restart interval if significantly different
        if (Math.abs(newInterval - currentInterval) > 500) {
          clearInterval(session.captureInterval);
          this.startCaptureLoop(sessionId);
          
          logger.debug(LogCategory.TERMINAL, 
            `Adjusted capture interval for ${sessionId}: ${currentInterval}ms -> ${newInterval}ms`);
        }
      }
      
    } catch (error) {
      session.errorCount++;
      logger.error(LogCategory.TERMINAL, 
        `Capture error for session ${sessionId}: ${error}`);
      
      // Pause session if too many errors
      if (session.errorCount > this.MAX_CONSECUTIVE_FAILURES) {
        session.status = 'paused';
        logger.warn(LogCategory.TERMINAL, 
          `Paused capture for ${sessionId} due to excessive errors`);
        
        // Retry after a delay
        setTimeout(() => {
          if (session.status === 'paused') {
            session.status = 'active';
            session.errorCount = 0;
            logger.info(LogCategory.TERMINAL, 
              `Resumed capture for ${sessionId}`);
          }
        }, 30000); // 30 second pause
      }
    }
  }
  
  /**
   * Capture output for a specific agent
   */
  private async captureAgent(session: CaptureSession, agentIndex: number): Promise<void> {
    const agentState = session.agents.get(agentIndex)!;
    const paneTarget = `${session.sessionId}:${session.windowTarget}.${agentIndex}`;
    const cacheKey = `${session.sessionId}:${agentIndex}`;
    
    this.metrics.totalCaptures++;
    
    try {
      // Check cache first
      const cached = this.captureCache.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
        // Use cached content if recent
        this.metrics.deduplicatedCaptures++;
        return;
      }
      
      const result = await this.executeCaptureCommand(paneTarget, agentState);
      
      if (!result.success) {
        agentState.consecutiveFailures++;
        this.metrics.failedCaptures++;
        
        // Pause agent if too many failures
        if (agentState.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          agentState.paused = true;
          logger.warn(LogCategory.TERMINAL, 
            `Paused agent ${agentIndex} in ${session.sessionId} due to failures`);
        }
        return;
      }
      
      // Reset failure counter on success
      agentState.consecutiveFailures = 0;
      if (agentState.paused) {
        agentState.paused = false;
        logger.info(LogCategory.TERMINAL, 
          `Resumed agent ${agentIndex} in ${session.sessionId}`);
      }
      
      // Check for content changes
      if (result.newContent && result.lines.length > 0) {
        // Update agent state
        agentState.lastContentHash = result.contentHash;
        agentState.lastContentLength = result.content.length;
        agentState.lastSuccessfulCapture = now;
        
        // Update cache
        this.captureCache.set(cacheKey, {
          content: result.content,
          hash: result.contentHash,
          timestamp: now
        });
        
        // Broadcast new content using deduplication service
        const success = broadcastDeduplicationService.processBroadcast(
          'terminal:output',
          {
            sessionId: session.sessionId,
            sessionName: session.sessionId,
            farmId: session.farmId,
            agentId: agentIndex,
            agentIndex: agentIndex,
            lines: result.lines,
            output: result.lines.join('\n'),
            timestamp: new Date().toISOString()
          },
          session.sessionId
        );
        
        if (success) {
          this.metrics.successfulCaptures++;
          this.metrics.contentChangeRate = 
            (this.metrics.contentChangeRate + 1) / 2;
        }
        
        this.emit('content:captured', {
          sessionId: session.sessionId,
          agentIndex,
          lines: result.lines,
          captureTime: result.captureTime
        });
      } else {
        // No new content
        this.metrics.successfulCaptures++;
        this.metrics.contentChangeRate = 
          this.metrics.contentChangeRate * 0.95; // Decay rate
      }
      
    } catch (error) {
      agentState.consecutiveFailures++;
      this.metrics.failedCaptures++;
      
      logger.debug(LogCategory.TERMINAL, 
        `Capture failed for agent ${agentIndex} in ${session.sessionId}: ${error}`);
    }
  }
  
  /**
   * Execute the actual capture command with optimization
   */
  private async executeCaptureCommand(paneTarget: string, agentState: AgentCaptureState): Promise<CaptureResult> {
    const startTime = Date.now();
    
    try {
      // Use efficient capture command
      const command = `TMUX_TMPDIR=/tmp timeout ${this.CAPTURE_TIMEOUT / 1000}s tmux capture-pane -t "${paneTarget}" -p -S -500 2>/dev/null || echo ""`;
      
      const { stdout } = await execAsync(command);
      const content = stdout || '';
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      
      // Generate content hash for comparison
      const contentHash = this.generateContentHash(content);
      
      // Check if content has changed
      const hasChanged = this.hasContentChanged(agentState, content, contentHash);
      
      const result: CaptureResult = {
        success: true,
        content,
        lines,
        contentHash,
        captureTime: Date.now() - startTime,
        newContent: hasChanged
      };
      
      // Update metrics
      this.metrics.avgCaptureTime = 
        (this.metrics.avgCaptureTime * this.metrics.totalCaptures + result.captureTime) / 
        (this.metrics.totalCaptures + 1);
      
      return result;
      
    } catch (error) {
      return {
        success: false,
        content: '',
        lines: [],
        contentHash: '',
        captureTime: Date.now() - startTime,
        newContent: false,
        error: error.message
      };
    }
  }
  
  /**
   * Check if content has meaningfully changed
   */
  private hasContentChanged(agentState: AgentCaptureState, content: string, contentHash: string): boolean {
    if (!this.HASH_COMPARISON_ENABLED) {
      // Fallback to length-based comparison
      return Math.abs(content.length - agentState.lastContentLength) > this.MIN_CONTENT_CHANGE_THRESHOLD;
    }
    
    // Hash-based comparison is more accurate
    if (contentHash !== agentState.lastContentHash) {
      // Additional check: ensure meaningful change, not just whitespace
      const contentLines = content.split('\n').filter(line => line.trim().length > 0);
      const lastLength = agentState.lastContentLength;
      
      if (contentLines.length === 0 && lastLength === 0) {
        return false; // Both empty
      }
      
      if (Math.abs(content.length - lastLength) < 5) {
        // Small change, check if it's meaningful
        const trimmedContent = content.replace(/\s+/g, ' ').trim();
        const expectedLength = Math.max(lastLength - 10, 0);
        
        return trimmedContent.length > expectedLength;
      }
      
      return true; // Significant change
    }
    
    return false;
  }
  
  /**
   * Generate content hash for comparison
   */
  private generateContentHash(content: string): string {
    // Use a fast hash function
    let hash = 0;
    const normalizedContent = content.replace(/\s+/g, ' ').trim(); // Normalize whitespace
    
    for (let i = 0; i < normalizedContent.length; i++) {
      const char = normalizedContent.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Detect window target for session
   */
  private async detectWindowTarget(sessionId: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-windows -t ${sessionId} -F '#{window_name}' 2>/dev/null || echo ""`
      );
      
      const windows = stdout.trim().split('\n').filter(Boolean);
      const windowTarget = windows.includes('agents') ? 'agents' : '0';
      
      logger.debug(LogCategory.TERMINAL, 
        `Detected window target for ${sessionId}: ${windowTarget}`);
      
      return windowTarget;
    } catch {
      return '0'; // Default fallback
    }
  }
  
  /**
   * Check if session exists
   */
  private async checkSessionExists(sessionId: string): Promise<boolean> {
    try {
      await execAsync(`TMUX_TMPDIR=/tmp tmux has-session -t "${sessionId}" 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get pane count for session
   */
  private async getPaneCount(sessionId: string, windowTarget: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-panes -t "${sessionId}:${windowTarget}" -F '#{pane_index}' 2>/dev/null || echo ""`
      );
      return stdout.trim().split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }
  
  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60000); // Clean every minute
  }
  
  /**
   * Perform cleanup of old cache entries and inactive sessions
   */
  private performCleanup(): void {
    const now = Date.now();
    let cleanedCache = 0;
    let pausedSessions = 0;
    
    // Clean up old cache entries
    for (const [key, entry] of this.captureCache) {
      if ((now - entry.timestamp) > (this.CACHE_TTL * 3)) {
        this.captureCache.delete(key);
        cleanedCache++;
      }
    }
    
    // Check for sessions that should be paused
    for (const [sessionId, session] of this.activeSessions) {
      const timeSinceLastCapture = now - session.lastCaptureTime;
      
      if (timeSinceLastCapture > 300000 && session.status === 'active') { // 5 minutes
        session.status = 'paused';
        pausedSessions++;
        
        logger.info(LogCategory.TERMINAL, 
          `Paused inactive capture session: ${sessionId}`);
      }
    }
    
    // Limit cache size
    if (this.captureCache.size > this.CONTENT_HASH_CACHE_SIZE) {
      const oldestEntries = Array.from(this.captureCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)
        .slice(0, this.captureCache.size - this.CONTENT_HASH_CACHE_SIZE);
      
      for (const [key] of oldestEntries) {
        this.captureCache.delete(key);
        cleanedCache++;
      }
    }
    
    if (cleanedCache > 0 || pausedSessions > 0) {
      logger.debug(LogCategory.TERMINAL, 
        `Cleanup: ${cleanedCache} cache entries, ${pausedSessions} sessions paused`);
    }
  }
  
  /**
   * Get capture metrics
   */
  getMetrics(): CaptureMetrics & {
    activeSessions: number;
    cacheSize: number;
    pausedAgents: number;
  } {
    let pausedAgents = 0;
    
    for (const session of this.activeSessions.values()) {
      for (const agent of session.agents.values()) {
        if (agent.paused) pausedAgents++;
      }
    }
    
    return {
      ...this.metrics,
      activeSessions: this.activeSessions.size,
      cacheSize: this.captureCache.size,
      pausedAgents
    };
  }
  
  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalCaptures: 0,
      successfulCaptures: 0,
      failedCaptures: 0,
      avgCaptureTime: 0,
      deduplicatedCaptures: 0,
      contentChangeRate: 0
    };
  }
  
  /**
   * Get session status
   */
  getSessionStatus(sessionId: string): CaptureSession | null {
    return this.activeSessions.get(sessionId) || null;
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    // Stop all capture sessions
    for (const sessionId of this.activeSessions.keys()) {
      this.stopCapturing(sessionId);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.captureCache.clear();
    this.activeSessions.clear();
    
    logger.info(LogCategory.TERMINAL, 'Optimized terminal capture service destroyed');
  }
}

// Export singleton instance
export const optimizedTerminalCaptureService = OptimizedTerminalCaptureService.getInstance();