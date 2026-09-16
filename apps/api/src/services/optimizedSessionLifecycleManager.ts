/**
 * Optimized Session Lifecycle Manager
 * Prevents premature session cleanup and manages session state transitions efficiently
 * Addresses the "Session no longer exists" issue in Quick Task launches
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/structuredLogger';
import { pathConfig } from '../config/paths';

const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

const execAsync = promisify(exec);

interface SessionState {
  sessionId: string;
  farmId: string;
  status: 'initializing' | 'launching' | 'active' | 'stabilizing' | 'stopping' | 'stopped';
  startTime: Date;
  lastActivity: Date;
  agentCount: number;
  expectedPanes: number;
  actualPanes: number;
  stabilizationAttempts: number;
  cleanupScheduled: boolean;
  protectionLevel: 'none' | 'basic' | 'extended' | 'permanent';
  metadata: Record<string, any>;
}

interface SessionTransition {
  fromStatus: SessionState['status'];
  toStatus: SessionState['status'];
  timestamp: Date;
  reason: string;
  automatic: boolean;
}

interface SessionProtectionRule {
  sessionPattern: RegExp;
  protectionLevel: SessionState['protectionLevel'];
  minLifetime: number; // milliseconds
  stabilizationTime: number; // milliseconds
  maxStabilizationAttempts: number;
}

export class OptimizedSessionLifecycleManager extends EventEmitter {
  private static instance: OptimizedSessionLifecycleManager;
  private sessions: Map<string, SessionState> = new Map();
  private transitionHistory: Map<string, SessionTransition[]> = new Map();
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private protectionRules: SessionProtectionRule[] = [];
  
  // Performance optimization settings
  private readonly MONITORING_INTERVAL = 5000; // 5 seconds
  private readonly QUICK_TASK_MIN_LIFETIME = 30000; // 30 seconds minimum for Quick Tasks
  private readonly QUICK_TASK_STABILIZATION_TIME = 10000; // 10 seconds to stabilize
  private readonly MAX_STABILIZATION_ATTEMPTS = 5;
  private readonly SESSION_EXISTENCE_CACHE_TTL = 2000; // 2 seconds cache
  
  // Session existence cache to reduce tmux calls
  private sessionExistenceCache: Map<string, { exists: boolean; timestamp: number }> = new Map();
  
  private constructor() {
    super();
    this.initializeProtectionRules();
    this.startMonitoring();
  }
  
  static getInstance(): OptimizedSessionLifecycleManager {
    if (!OptimizedSessionLifecycleManager.instance) {
      OptimizedSessionLifecycleManager.instance = new OptimizedSessionLifecycleManager();
    }
    return OptimizedSessionLifecycleManager.instance;
  }
  
  /**
   * Initialize protection rules for different session types
   */
  private initializeProtectionRules(): void {
    this.protectionRules = [
      {
        sessionPattern: /^quick_[a-f0-9]{8}$/i,
        protectionLevel: 'extended',
        minLifetime: this.QUICK_TASK_MIN_LIFETIME,
        stabilizationTime: this.QUICK_TASK_STABILIZATION_TIME,
        maxStabilizationAttempts: this.MAX_STABILIZATION_ATTEMPTS
      },
      {
        sessionPattern: /^farm-[a-f0-9]{8}$/i,
        protectionLevel: 'basic',
        minLifetime: 20000, // 20 seconds
        stabilizationTime: 8000, // 8 seconds
        maxStabilizationAttempts: 3
      },
      {
        sessionPattern: /^goWild-[a-f0-9]{8}$/i,
        protectionLevel: 'extended',
        minLifetime: 45000, // 45 seconds
        stabilizationTime: 15000, // 15 seconds
        maxStabilizationAttempts: this.MAX_STABILIZATION_ATTEMPTS
      }
    ];
  }
  
  /**
   * Register a new session for lifecycle management
   */
  registerSession(sessionId: string, farmId: string, agentCount: number, metadata: Record<string, any> = {}): void {
    const protectionRule = this.getProtectionRule(sessionId);
    
    const sessionState: SessionState = {
      sessionId,
      farmId,
      status: 'initializing',
      startTime: new Date(),
      lastActivity: new Date(),
      agentCount,
      expectedPanes: agentCount,
      actualPanes: 0,
      stabilizationAttempts: 0,
      cleanupScheduled: false,
      protectionLevel: protectionRule?.protectionLevel || 'basic',
      metadata
    };
    
    this.sessions.set(sessionId, sessionState);
    this.transitionHistory.set(sessionId, []);
    
    logger.info(LogCategory.TERMINAL, 
      `Registered session ${sessionId} with ${protectionRule?.protectionLevel || 'basic'} protection`);
    
    // Schedule stabilization check
    this.scheduleStabilizationCheck(sessionId, protectionRule?.stabilizationTime || 8000);
    
    this.emit('session:registered', { sessionId, farmId, protectionLevel: sessionState.protectionLevel });
  }
  
  /**
   * Update session status with transition tracking
   */
  updateSessionStatus(sessionId: string, newStatus: SessionState['status'], reason: string = 'manual'): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(LogCategory.TERMINAL, `Cannot update status for unknown session: ${sessionId}`);
      return false;
    }
    
    const oldStatus = session.status;
    
    // Validate transition
    if (!this.isValidTransition(oldStatus, newStatus)) {
      logger.warn(LogCategory.TERMINAL, 
        `Invalid status transition for ${sessionId}: ${oldStatus} -> ${newStatus}`);
      return false;
    }
    
    // Check if session is protected from this transition
    if (this.isSessionProtected(sessionId, newStatus)) {
      logger.info(LogCategory.TERMINAL, 
        `Session ${sessionId} protected from transition to ${newStatus} (${session.protectionLevel} protection)`);
      return false;
    }
    
    // Perform transition
    session.status = newStatus;
    session.lastActivity = new Date();
    
    // Record transition
    const transition: SessionTransition = {
      fromStatus: oldStatus,
      toStatus: newStatus,
      timestamp: new Date(),
      reason,
      automatic: reason.includes('auto') || reason.includes('monitor')
    };
    
    this.transitionHistory.get(sessionId)!.push(transition);
    
    logger.info(LogCategory.TERMINAL, 
      `Session ${sessionId} transitioned: ${oldStatus} -> ${newStatus} (${reason})`);
    
    // Handle status-specific actions
    this.handleStatusChange(sessionId, newStatus, oldStatus);
    
    this.emit('session:status_changed', { sessionId, oldStatus, newStatus, reason });
    
    return true;
  }
  
  /**
   * Check if a status transition is valid
   */
  private isValidTransition(from: SessionState['status'], to: SessionState['status']): boolean {
    const validTransitions: Record<SessionState['status'], SessionState['status'][]> = {
      'initializing': ['launching', 'stopped'],
      'launching': ['active', 'stabilizing', 'stopping', 'stopped'],
      'active': ['stabilizing', 'stopping', 'stopped'],
      'stabilizing': ['active', 'launching', 'stopping', 'stopped'],
      'stopping': ['stopped'],
      'stopped': [] // Terminal state
    };
    
    return validTransitions[from]?.includes(to) || false;
  }
  
  /**
   * Check if session is protected from a specific transition
   */
  private isSessionProtected(sessionId: string, targetStatus: SessionState['status']): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    const protectionRule = this.getProtectionRule(sessionId);
    if (!protectionRule) return false;
    
    const sessionAge = Date.now() - session.startTime.getTime();
    
    // Protect from premature stopping
    if (targetStatus === 'stopping' || targetStatus === 'stopped') {
      if (sessionAge < protectionRule.minLifetime) {
        logger.debug(LogCategory.TERMINAL, 
          `Session ${sessionId} protected: age ${sessionAge}ms < min ${protectionRule.minLifetime}ms`);
        return true;
      }
      
      // Extended protection during stabilization
      if (session.status === 'stabilizing' && session.stabilizationAttempts < protectionRule.maxStabilizationAttempts) {
        logger.debug(LogCategory.TERMINAL, 
          `Session ${sessionId} protected: still stabilizing (attempt ${session.stabilizationAttempts}/${protectionRule.maxStabilizationAttempts})`);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Handle status change side effects
   */
  private handleStatusChange(sessionId: string, newStatus: SessionState['status'], oldStatus: SessionState['status']): void {
    const session = this.sessions.get(sessionId)!;
    
    switch (newStatus) {
      case 'launching':
        this.scheduleStabilizationCheck(sessionId, 15000); // Extended time for launching
        break;
        
      case 'stabilizing':
        this.performStabilizationCheck(sessionId);
        break;
        
      case 'active':
        this.clearScheduledCleanup(sessionId);
        break;
        
      case 'stopping':
        this.scheduleCleanup(sessionId, 30000); // 30 seconds to complete stop
        break;
        
      case 'stopped':
        this.performCleanup(sessionId);
        break;
    }
  }
  
  /**
   * Schedule a stabilization check for a session
   */
  private scheduleStabilizationCheck(sessionId: string, delay: number): void {
    setTimeout(async () => {
      const session = this.sessions.get(sessionId);
      if (!session || session.status === 'stopped') return;
      
      await this.performStabilizationCheck(sessionId);
    }, delay);
  }
  
  /**
   * Perform stabilization check for a session
   */
  private async performStabilizationCheck(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.stabilizationAttempts++;
    
    try {
      // Check if session exists and has expected panes
      const sessionExists = await this.checkSessionExists(sessionId);
      
      if (!sessionExists) {
        logger.warn(LogCategory.TERMINAL, 
          `Session ${sessionId} does not exist during stabilization check`);
        
        // Don't immediately mark as stopped - might still be launching
        if (session.status !== 'stopped' && session.stabilizationAttempts < this.MAX_STABILIZATION_ATTEMPTS) {
          logger.info(LogCategory.TERMINAL, 
            `Retrying stabilization for ${sessionId} (attempt ${session.stabilizationAttempts})`);
          
          this.scheduleStabilizationCheck(sessionId, 3000); // Retry in 3 seconds
          return;
        } else {
          this.updateSessionStatus(sessionId, 'stopped', 'stabilization_failed');
          return;
        }
      }
      
      // Check pane count
      const paneCount = await this.getPaneCount(sessionId);
      session.actualPanes = paneCount;
      
      if (paneCount >= session.expectedPanes) {
        logger.info(LogCategory.TERMINAL, 
          `Session ${sessionId} stabilized with ${paneCount}/${session.expectedPanes} panes`);
        this.updateSessionStatus(sessionId, 'active', 'stabilization_complete');
      } else if (session.stabilizationAttempts < this.MAX_STABILIZATION_ATTEMPTS) {
        logger.debug(LogCategory.TERMINAL, 
          `Session ${sessionId} has ${paneCount}/${session.expectedPanes} panes, retrying stabilization`);
        
        // Schedule another check
        const protectionRule = this.getProtectionRule(sessionId);
        const delay = Math.min(2000 * session.stabilizationAttempts, 10000); // Exponential backoff
        this.scheduleStabilizationCheck(sessionId, delay);
      } else {
        logger.warn(LogCategory.TERMINAL, 
          `Session ${sessionId} failed to stabilize after ${session.stabilizationAttempts} attempts`);
        
        // Still mark as active if we have any panes - partial success
        if (paneCount > 0) {
          this.updateSessionStatus(sessionId, 'active', 'partial_stabilization');
        } else {
          this.updateSessionStatus(sessionId, 'stopped', 'stabilization_failed');
        }
      }
      
    } catch (error) {
      logger.error(LogCategory.TERMINAL, 
        `Stabilization check failed for ${sessionId}: ${error}`);
      
      if (session.stabilizationAttempts < this.MAX_STABILIZATION_ATTEMPTS) {
        this.scheduleStabilizationCheck(sessionId, 5000);
      } else {
        this.updateSessionStatus(sessionId, 'stopped', 'stabilization_error');
      }
    }
  }
  
  /**
   * Check if a tmux session exists (with caching)
   */
  private async checkSessionExists(sessionId: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.sessionExistenceCache.get(sessionId);
    
    if (cached && (now - cached.timestamp) < this.SESSION_EXISTENCE_CACHE_TTL) {
      return cached.exists;
    }
    
    try {
      await execAsync(`TMUX_TMPDIR="${tmuxTmpDir}" tmux has-session -t "${sessionId}" 2>/dev/null`);
      this.sessionExistenceCache.set(sessionId, { exists: true, timestamp: now });
      return true;
    } catch {
      this.sessionExistenceCache.set(sessionId, { exists: false, timestamp: now });
      return false;
    }
  }
  
  /**
   * Get pane count for a session
   */
  private async getPaneCount(sessionId: string): Promise<number> {
    try {
      // Try both window targets for compatibility
      const windowTargets = ['agents', '0'];
      
      for (const window of windowTargets) {
        try {
          const result = await execAsync(
            `TMUX_TMPDIR="${tmuxTmpDir}" tmux list-panes -t "${sessionId}:${window}" -F '#{pane_index}' 2>/dev/null`
          );
          const panes = result.stdout.trim().split('\n').filter(Boolean);
          if (panes.length > 0) {
            return panes.length;
          }
        } catch {
          continue;
        }
      }
      
      return 0;
    } catch {
      return 0;
    }
  }
  
  /**
   * Get protection rule for a session
   */
  private getProtectionRule(sessionId: string): SessionProtectionRule | null {
    return this.protectionRules.find(rule => rule.sessionPattern.test(sessionId)) || null;
  }
  
  /**
   * Schedule cleanup for a session
   */
  private scheduleCleanup(sessionId: string, delay: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    if (session.cleanupScheduled) {
      logger.debug(LogCategory.TERMINAL, `Cleanup already scheduled for ${sessionId}`);
      return;
    }
    
    session.cleanupScheduled = true;
    
    const timer = setTimeout(() => {
      this.performCleanup(sessionId);
    }, delay);
    
    this.cleanupTimers.set(sessionId, timer);
    
    logger.debug(LogCategory.TERMINAL, `Scheduled cleanup for ${sessionId} in ${delay}ms`);
  }
  
  /**
   * Clear scheduled cleanup for a session
   */
  private clearScheduledCleanup(sessionId: string): void {
    const timer = this.cleanupTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(sessionId);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.cleanupScheduled = false;
      }
      
      logger.debug(LogCategory.TERMINAL, `Cleared scheduled cleanup for ${sessionId}`);
    }
  }
  
  /**
   * Perform cleanup for a session
   */
  private performCleanup(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    logger.info(LogCategory.TERMINAL, `Performing cleanup for session ${sessionId}`);
    
    // Clear timers
    this.clearScheduledCleanup(sessionId);
    
    // Remove from tracking
    this.sessions.delete(sessionId);
    this.transitionHistory.delete(sessionId);
    this.sessionExistenceCache.delete(sessionId);
    
    this.emit('session:cleaned_up', { sessionId, farmId: session.farmId });
  }
  
  /**
   * Start monitoring loop
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.performMonitoringCheck();
    }, this.MONITORING_INTERVAL);
    
    logger.info(LogCategory.TERMINAL, 'Session lifecycle monitoring started');
  }
  
  /**
   * Perform periodic monitoring check
   */
  private async performMonitoringCheck(): Promise<void> {
    const sessionsToCheck = Array.from(this.sessions.keys());
    
    for (const sessionId of sessionsToCheck) {
      const session = this.sessions.get(sessionId);
      if (!session || session.status === 'stopped') continue;
      
      // Check if session still exists
      const exists = await this.checkSessionExists(sessionId);
      
      if (!exists && session.status !== 'initializing') {
        // Session disappeared unexpectedly
        logger.warn(LogCategory.TERMINAL, 
          `Session ${sessionId} disappeared unexpectedly (status: ${session.status})`);
        
        // Don't immediately mark as stopped if it's protected or recently started
        const protectionRule = this.getProtectionRule(sessionId);
        const sessionAge = Date.now() - session.startTime.getTime();
        
        if (protectionRule && sessionAge < protectionRule.minLifetime) {
          logger.info(LogCategory.TERMINAL, 
            `Session ${sessionId} protected from premature cleanup (age: ${sessionAge}ms)`);
          continue;
        }
        
        this.updateSessionStatus(sessionId, 'stopped', 'monitor_session_missing');
      }
    }
    
    // Clean up old cache entries
    this.cleanupSessionCache();
  }
  
  /**
   * Clean up old session cache entries
   */
  private cleanupSessionCache(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    
    for (const [sessionId, entry] of this.sessionExistenceCache) {
      if ((now - entry.timestamp) > (this.SESSION_EXISTENCE_CACHE_TTL * 5)) {
        entriesToDelete.push(sessionId);
      }
    }
    
    for (const sessionId of entriesToDelete) {
      this.sessionExistenceCache.delete(sessionId);
    }
  }
  
  /**
   * Force a session to remain active (emergency protection)
   */
  protectSession(sessionId: string, duration: number = 60000): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.protectionLevel = 'permanent';
    session.lastActivity = new Date();
    
    // Schedule protection removal
    setTimeout(() => {
      const currentSession = this.sessions.get(sessionId);
      if (currentSession && currentSession.protectionLevel === 'permanent') {
        const rule = this.getProtectionRule(sessionId);
        currentSession.protectionLevel = rule?.protectionLevel || 'basic';
        logger.info(LogCategory.TERMINAL, 
          `Removed emergency protection from session ${sessionId}`);
      }
    }, duration);
    
    logger.info(LogCategory.TERMINAL, 
      `Applied emergency protection to session ${sessionId} for ${duration}ms`);
  }
  
  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    sessionsByStatus: Record<SessionState['status'], number>;
    protectionLevels: Record<SessionState['protectionLevel'], number>;
    avgSessionAge: number;
    stabilizationStats: {
      totalAttempts: number;
      successRate: number;
    };
  } {
    const stats = {
      totalSessions: this.sessions.size,
      sessionsByStatus: {} as Record<SessionState['status'], number>,
      protectionLevels: {} as Record<SessionState['protectionLevel'], number>,
      avgSessionAge: 0,
      stabilizationStats: {
        totalAttempts: 0,
        successRate: 0
      }
    };
    
    let totalAge = 0;
    let totalStabilizationAttempts = 0;
    let successfulStabilizations = 0;
    
    for (const session of this.sessions.values()) {
      // Count by status
      stats.sessionsByStatus[session.status] = 
        (stats.sessionsByStatus[session.status] || 0) + 1;
      
      // Count by protection level
      stats.protectionLevels[session.protectionLevel] = 
        (stats.protectionLevels[session.protectionLevel] || 0) + 1;
      
      // Calculate age
      totalAge += Date.now() - session.startTime.getTime();
      
      // Stabilization stats
      totalStabilizationAttempts += session.stabilizationAttempts;
      if (session.status === 'active' && session.stabilizationAttempts > 0) {
        successfulStabilizations++;
      }
    }
    
    if (this.sessions.size > 0) {
      stats.avgSessionAge = totalAge / this.sessions.size;
      
      if (totalStabilizationAttempts > 0) {
        stats.stabilizationStats.totalAttempts = totalStabilizationAttempts;
        stats.stabilizationStats.successRate = 
          (successfulStabilizations / totalStabilizationAttempts) * 100;
      }
    }
    
    return stats;
  }
  
  /**
   * Get detailed session info
   */
  getSessionInfo(sessionId: string): SessionState & { transitionHistory: SessionTransition[] } | null {
    const session = this.sessions.get(sessionId);
    const history = this.transitionHistory.get(sessionId) || [];
    
    if (!session) return null;
    
    return {
      ...session,
      transitionHistory: history
    };
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Clear all timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    
    this.sessions.clear();
    this.transitionHistory.clear();
    this.cleanupTimers.clear();
    this.sessionExistenceCache.clear();
    
    logger.info(LogCategory.TERMINAL, 'Session lifecycle manager destroyed');
  }
}

// Export singleton instance
export const optimizedSessionLifecycleManager = OptimizedSessionLifecycleManager.getInstance();
