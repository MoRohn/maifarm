/**
 * Terminal Stream Recovery Service
 * Provides automatic recovery and retry mechanisms for terminal streaming failures
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Session validation and repair
 * - Stream health monitoring
 * - Graceful degradation strategies
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, LogCategory } from '../utils/logger';
import { terminalStreamService } from './terminalStreamService';
import { websocketManager } from '../websocket/websocketManager';

const execAsync = promisify(exec);

interface RecoveryAttempt {
  farmId: string;
  agentId: string;
  attemptCount: number;
  lastAttempt: Date;
  nextRetryTime: Date;
  errorHistory: Error[];
}

interface StreamHealthStatus {
  farmId: string;
  agentId: string;
  healthy: boolean;
  lastHealthCheck: Date;
  consecutiveFailures: number;
  recoveryInProgress: boolean;
}

export class TerminalStreamRecovery extends EventEmitter {
  private static instance: TerminalStreamRecovery;
  private recoveryAttempts: Map<string, RecoveryAttempt> = new Map();
  private streamHealth: Map<string, StreamHealthStatus> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly BASE_RETRY_DELAY = 1000; // 1 second
  private readonly MAX_RETRY_DELAY = 30000; // 30 seconds
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  private constructor() {
    super();
    this.startHealthMonitoring();
  }

  static getInstance(): TerminalStreamRecovery {
    if (!TerminalStreamRecovery.instance) {
      TerminalStreamRecovery.instance = new TerminalStreamRecovery();
    }
    return TerminalStreamRecovery.instance;
  }

  /**
   * Start health monitoring for all active streams
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.checkAllStreamHealth().catch(error => {
        logger.error(LogCategory.TERMINAL, 'Error during health check:', error);
      });
    }, this.HEALTH_CHECK_INTERVAL);

    logger.info(LogCategory.TERMINAL, 'Terminal stream health monitoring started');
  }

  /**
   * Check health of all active streams
   */
  private async checkAllStreamHealth(): Promise<void> {
    const streamingStatus = terminalStreamService.getAllStreamingStatus();

    for (const [farmId, agents] of Object.entries(streamingStatus)) {
      for (const [agentId, isActive] of Object.entries(agents)) {
        const healthKey = `${farmId}:${agentId}`;

        if (!isActive) {
          await this.handleUnhealthyStream(farmId, agentId);
        } else {
          // Reset failure count for healthy streams
          const health = this.streamHealth.get(healthKey);
          if (health) {
            health.consecutiveFailures = 0;
            health.healthy = true;
            health.lastHealthCheck = new Date();
          }
        }
      }
    }
  }

  /**
   * Handle an unhealthy stream
   */
  private async handleUnhealthyStream(farmId: string, agentId: string): Promise<void> {
    const healthKey = `${farmId}:${agentId}`;
    let health = this.streamHealth.get(healthKey);

    if (!health) {
      health = {
        farmId,
        agentId,
        healthy: false,
        lastHealthCheck: new Date(),
        consecutiveFailures: 1,
        recoveryInProgress: false
      };
      this.streamHealth.set(healthKey, health);
    } else {
      health.consecutiveFailures++;
      health.lastHealthCheck = new Date();
      health.healthy = false;
    }

    // Only attempt recovery after consecutive failures
    if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && !health.recoveryInProgress) {
      logger.warn(LogCategory.TERMINAL, `Stream ${healthKey} has ${health.consecutiveFailures} consecutive failures, initiating recovery`);
      health.recoveryInProgress = true;
      await this.attemptRecovery(farmId, agentId);
      health.recoveryInProgress = false;
    }
  }

  /**
   * Attempt to recover a failed stream
   */
  async attemptRecovery(farmId: string, agentId: string, error?: Error): Promise<boolean> {
    const recoveryKey = `${farmId}:${agentId}`;
    let attempt = this.recoveryAttempts.get(recoveryKey);

    // Initialize recovery attempt tracking
    if (!attempt) {
      attempt = {
        farmId,
        agentId,
        attemptCount: 0,
        lastAttempt: new Date(),
        nextRetryTime: new Date(),
        errorHistory: []
      };
      this.recoveryAttempts.set(recoveryKey, attempt);
    }

    // Check if we've exceeded max attempts
    if (attempt.attemptCount >= this.MAX_RETRY_ATTEMPTS) {
      logger.error(LogCategory.TERMINAL, `Max recovery attempts exceeded for ${recoveryKey}`);
      this.emit('recovery:failed', { farmId, agentId, attempts: attempt.attemptCount });
      return false;
    }

    // Check if we should wait before retrying
    if (new Date() < attempt.nextRetryTime) {
      const waitTime = attempt.nextRetryTime.getTime() - Date.now();
      logger.debug(LogCategory.TERMINAL, `Waiting ${waitTime}ms before retry for ${recoveryKey}`);
      return false;
    }

    // Add error to history if provided
    if (error) {
      attempt.errorHistory.push(error);
    }

    attempt.attemptCount++;
    attempt.lastAttempt = new Date();

    // Calculate next retry time with exponential backoff
    const delay = Math.min(
      this.BASE_RETRY_DELAY * Math.pow(2, attempt.attemptCount - 1),
      this.MAX_RETRY_DELAY
    );
    attempt.nextRetryTime = new Date(Date.now() + delay);

    logger.info(LogCategory.TERMINAL, `Attempting recovery for ${recoveryKey} (attempt ${attempt.attemptCount}/${this.MAX_RETRY_ATTEMPTS})`);

    try {
      // Step 1: Validate tmux session exists
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      const sessionValid = await this.validateTmuxSession(sessionName, agentId);

      if (!sessionValid) {
        logger.warn(LogCategory.TERMINAL, `Tmux session ${sessionName} not valid, attempting repair`);
        await this.repairTmuxSession(sessionName, farmId, agentId);
      }

      // Step 2: Stop existing stream if any
      try {
        await terminalStreamService.stopStream(farmId, agentId);
      } catch (stopError) {
        logger.debug(LogCategory.TERMINAL, `Error stopping stream during recovery:`, stopError);
      }

      // Step 3: Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 4: Restart the stream
      const paneId = agentId.replace('agent-', '');
      await terminalStreamService.startStream(farmId, agentId, sessionName, paneId, {
        maxRetries: 2,
        retryDelay: 1000
      });

      // Step 5: Verify stream is working
      await new Promise(resolve => setTimeout(resolve, 2000));
      const status = terminalStreamService.getStreamingStatus(farmId);

      if (status[agentId]) {
        logger.info(LogCategory.TERMINAL, `Successfully recovered stream ${recoveryKey}`);

        // Reset recovery attempts on success
        this.recoveryAttempts.delete(recoveryKey);

        // Reset health status
        const healthKey = `${farmId}:${agentId}`;
        const health = this.streamHealth.get(healthKey);
        if (health) {
          health.consecutiveFailures = 0;
          health.healthy = true;
        }

        // Emit recovery success event
        this.emit('recovery:success', { farmId, agentId, attempts: attempt.attemptCount });

        // Notify clients
        websocketManager.broadcast('terminal:recovered', {
          farmId,
          agentId,
          sessionName,
          timestamp: new Date()
        });

        return true;
      } else {
        throw new Error('Stream verification failed after restart');
      }

    } catch (recoveryError) {
      logger.error(LogCategory.TERMINAL, `Recovery failed for ${recoveryKey}:`, recoveryError);

      // Schedule next retry if attempts remain
      if (attempt.attemptCount < this.MAX_RETRY_ATTEMPTS) {
        logger.info(LogCategory.TERMINAL, `Scheduling retry for ${recoveryKey} in ${delay}ms`);
        setTimeout(() => {
          this.attemptRecovery(farmId, agentId, recoveryError as Error);
        }, delay);
      }

      return false;
    }
  }

  /**
   * Validate that a tmux session and pane exist
   */
  private async validateTmuxSession(sessionName: string, agentId: string): Promise<boolean> {
    try {
      const paneIndex = parseInt(agentId.replace('agent-', ''));

      // Check session exists
      const { stdout: sessions } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""`);
      if (!sessions.includes(sessionName)) {
        return false;
      }

      // Check pane exists
      const { stdout: panes } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName} -F "#{pane_index}" 2>/dev/null || echo ""`);
      const paneNumbers = panes.trim().split('\n').map(p => parseInt(p));

      return paneNumbers.includes(paneIndex);
    } catch (error) {
      logger.debug(LogCategory.TERMINAL, `Session validation failed for ${sessionName}:`, error);
      return false;
    }
  }

  /**
   * Attempt to repair a broken tmux session
   */
  private async repairTmuxSession(sessionName: string, farmId: string, agentId: string): Promise<void> {
    const paneIndex = parseInt(agentId.replace('agent-', ''));

    try {
      // Check if session exists at all
      const { stdout: sessions } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" 2>/dev/null || echo ""`);

      if (!sessions.includes(sessionName)) {
        // Session doesn't exist - can't repair
        logger.error(LogCategory.TERMINAL, `Cannot repair non-existent session ${sessionName}`);
        throw new Error(`Session ${sessionName} does not exist`);
      }

      // Check if we need to create the pane
      const { stdout: panes } = await execAsync(`TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName} -F "#{pane_index}" 2>/dev/null || echo ""`);
      const paneNumbers = panes.trim().split('\n').map(p => parseInt(p));

      if (!paneNumbers.includes(paneIndex)) {
        // Try to create missing pane
        logger.info(LogCategory.TERMINAL, `Creating missing pane ${paneIndex} in session ${sessionName}`);

        // This is complex - would need to know the original command
        // For now, just log that repair isn't possible
        logger.warn(LogCategory.TERMINAL, `Cannot create missing pane ${paneIndex} - session structure damaged`);
      }

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to repair session ${sessionName}:`, error);
      throw error;
    }
  }

  /**
   * Clear recovery attempts for a farm
   */
  clearRecoveryAttempts(farmId: string): void {
    for (const [key, attempt] of this.recoveryAttempts) {
      if (attempt.farmId === farmId) {
        this.recoveryAttempts.delete(key);
      }
    }

    for (const [key, health] of this.streamHealth) {
      if (health.farmId === farmId) {
        this.streamHealth.delete(key);
      }
    }
  }

  /**
   * Get recovery status for monitoring
   */
  getRecoveryStatus(): {
    activeRecoveries: RecoveryAttempt[];
    unhealthyStreams: StreamHealthStatus[];
  } {
    return {
      activeRecoveries: Array.from(this.recoveryAttempts.values()),
      unhealthyStreams: Array.from(this.streamHealth.values()).filter(h => !h.healthy)
    };
  }

  /**
   * Stop the recovery service
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.recoveryAttempts.clear();
    this.streamHealth.clear();

    logger.info(LogCategory.TERMINAL, 'Terminal stream recovery service stopped');
  }
}

// Export singleton instance
export const terminalStreamRecovery = TerminalStreamRecovery.getInstance();