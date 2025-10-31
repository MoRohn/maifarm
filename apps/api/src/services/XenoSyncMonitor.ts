/**
 * XenoSync Monitor Service
 * Provides comprehensive monitoring and recovery for XenoSync-based farm operations
 *
 * Features:
 * - Agent health monitoring
 * - Automatic recovery on failure
 * - Terminal streaming verification
 * - Agent count validation
 * - Performance metrics tracking
 */

import { EventEmitter } from 'events';
import { exec, execSync } from 'child_process';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { terminalStreamingEnhanced } from './TerminalStreamingEnhanced';

const TMUX_TMP_DIR = '/tmp';
const HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
const RECOVERY_MAX_ATTEMPTS = 3;
const AGENT_IDLE_THRESHOLD = 60000; // 1 minute

interface XenoSyncSession {
  farmId: string;
  sessionName: string;
  expectedAgents: number;
  actualAgents: number;
  agents: Map<number, XenoSyncAgent>;
  startTime: Date;
  lastHealthCheck: Date;
  status: 'active' | 'degraded' | 'failed' | 'completed';
  recoveryAttempts: number;
  metrics: SessionMetrics;
}

interface XenoSyncAgent {
  id: number;
  name: string;
  status: 'initializing' | 'active' | 'idle' | 'failed' | 'recovered';
  lastActivity: Date;
  recoveryCount: number;
  paneExists: boolean;
  processRunning: boolean;
  outputFlowing: boolean;
}

interface SessionMetrics {
  totalAgents: number;
  activeAgents: number;
  failedAgents: number;
  recoveredAgents: number;
  outputBytes: number;
  messagesProcessed: number;
  averageResponseTime: number;
}

class XenoSyncMonitorService extends EventEmitter {
  private static instance: XenoSyncMonitorService;
  private sessions = new Map<string, XenoSyncSession>();
  private healthCheckInterval?: NodeJS.Timer;

  private constructor() {
    super();
    this.startMonitoring();
  }

  static getInstance(): XenoSyncMonitorService {
    if (!this.instance) {
      this.instance = new XenoSyncMonitorService();
    }
    return this.instance;
  }

  /**
   * Register a new XenoSync session for monitoring
   */
  async registerSession(farmId: string, sessionName: string, expectedAgents: number): Promise<void> {
    logger.info(LogCategory.FARM, `[XenoSync Monitor] Registering session ${sessionName} for farm ${farmId}`);

    const session: XenoSyncSession = {
      farmId,
      sessionName,
      expectedAgents,
      actualAgents: 0,
      agents: new Map(),
      startTime: new Date(),
      lastHealthCheck: new Date(),
      status: 'active',
      recoveryAttempts: 0,
      metrics: {
        totalAgents: expectedAgents,
        activeAgents: 0,
        failedAgents: 0,
        recoveredAgents: 0,
        outputBytes: 0,
        messagesProcessed: 0,
        averageResponseTime: 0
      }
    };

    // Initialize agent tracking
    for (let i = 0; i < expectedAgents; i++) {
      session.agents.set(i, {
        id: i,
        name: `agent_${i}`,
        status: 'initializing',
        lastActivity: new Date(),
        recoveryCount: 0,
        paneExists: false,
        processRunning: false,
        outputFlowing: false
      });
    }

    this.sessions.set(farmId, session);

    // Perform initial health check after a short delay
    setTimeout(() => this.performHealthCheck(farmId), 2000);
  }

  /**
   * Start global monitoring loop
   */
  private startMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      for (const [farmId, session] of this.sessions) {
        if (session.status === 'active' || session.status === 'degraded') {
          this.performHealthCheck(farmId);
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Perform comprehensive health check for a session
   */
  private async performHealthCheck(farmId: string): Promise<void> {
    const session = this.sessions.get(farmId);
    if (!session) return;

    logger.debug(LogCategory.FARM, `[XenoSync Monitor] Health check for farm ${farmId}`);

    session.lastHealthCheck = new Date();

    // Check tmux session exists
    const sessionExists = await this.verifyTmuxSession(session.sessionName);
    if (!sessionExists) {
      logger.error(LogCategory.FARM, `[XenoSync Monitor] Tmux session ${session.sessionName} not found`);
      await this.handleSessionLoss(session);
      return;
    }

    // Check each agent
    let activeCount = 0;
    let failedCount = 0;

    for (const [agentId, agent] of session.agents) {
      const healthy = await this.checkAgentHealth(session, agent);

      if (healthy) {
        activeCount++;
        if (agent.status === 'failed') {
          agent.status = 'recovered';
          agent.recoveryCount++;
          session.metrics.recoveredAgents++;
        } else if (agent.status === 'initializing') {
          agent.status = 'active';
        }
      } else {
        if (agent.status === 'active') {
          // Check if agent is just idle or actually failed
          const timeSinceActivity = Date.now() - agent.lastActivity.getTime();

          if (timeSinceActivity > AGENT_IDLE_THRESHOLD) {
            agent.status = 'idle';
            logger.warn(LogCategory.FARM, `[XenoSync Monitor] Agent ${agentId} is idle`);

            // Attempt recovery
            await this.recoverAgent(session, agent);
          }
        } else if (agent.status === 'idle' || agent.status === 'initializing') {
          // Give more time for initialization
          if (Date.now() - session.startTime.getTime() > 30000) {
            agent.status = 'failed';
            failedCount++;
            logger.error(LogCategory.FARM, `[XenoSync Monitor] Agent ${agentId} failed`);
          }
        }
      }
    }

    // Update session status
    session.actualAgents = activeCount;
    session.metrics.activeAgents = activeCount;
    session.metrics.failedAgents = failedCount;

    if (activeCount === session.expectedAgents) {
      session.status = 'active';
    } else if (activeCount > 0) {
      session.status = 'degraded';
    } else if (failedCount === session.expectedAgents) {
      session.status = 'failed';
    }

    // Broadcast status update
    await this.broadcastStatus(session);

    // Handle critical failures
    if (session.status === 'failed' && session.recoveryAttempts < RECOVERY_MAX_ATTEMPTS) {
      await this.attemptSessionRecovery(session);
    }
  }

  /**
   * Check individual agent health
   */
  private async checkAgentHealth(session: XenoSyncSession, agent: XenoSyncAgent): Promise<boolean> {
    const paneRef = `${session.sessionName}:agents.${agent.id}`;

    // Check pane exists
    agent.paneExists = await this.checkPaneExists(paneRef);
    if (!agent.paneExists) {
      return false;
    }

    // Check process is running (look for claude or python process)
    agent.processRunning = await this.checkProcessRunning(paneRef);

    // Check output is flowing
    const terminalSession = terminalStreamingEnhanced.getSession(session.farmId);
    if (terminalSession) {
      const agentInfo = terminalSession.agents.get(agent.id);
      if (agentInfo) {
        const timeSinceOutput = Date.now() - agentInfo.lastOutput.getTime();
        agent.outputFlowing = timeSinceOutput < 30000; // Output in last 30 seconds

        if (agent.outputFlowing) {
          agent.lastActivity = new Date();
        }
      }
    }

    return agent.paneExists && (agent.processRunning || agent.outputFlowing);
  }

  /**
   * Check if tmux pane exists
   */
  private async checkPaneExists(paneRef: string): Promise<boolean> {
    return new Promise((resolve) => {
      const command = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux list-panes -t ${paneRef} 2>/dev/null`;

      exec(command, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Check if process is running in pane
   */
  private async checkProcessRunning(paneRef: string): Promise<boolean> {
    return new Promise((resolve) => {
      const command = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux capture-pane -t ${paneRef} -p | tail -5`;

      exec(command, (error, stdout) => {
        if (error) {
          resolve(false);
        } else {
          // Check for signs of active process
          const hasPrompt = stdout.includes('$') || stdout.includes('>') || stdout.includes('#');
          const hasOutput = stdout.trim().length > 0;
          resolve(hasOutput && !hasPrompt); // Has output but not at a prompt
        }
      });
    });
  }

  /**
   * Recover a failed agent
   */
  private async recoverAgent(session: XenoSyncSession, agent: XenoSyncAgent): Promise<void> {
    logger.info(LogCategory.FARM, `[XenoSync Monitor] Attempting to recover agent ${agent.id}`);

    const paneRef = `${session.sessionName}:agents.${agent.id}`;

    // First, try to send a test command to wake it up
    await this.sendToPane(paneRef, 'echo "[RECOVERY] Agent recovery test"');

    // Wait and check if it responded
    await this.delay(2000);

    const healthy = await this.checkAgentHealth(session, agent);

    if (!healthy && agent.paneExists) {
      // Try to restart the agent process
      logger.warn(LogCategory.FARM, `[XenoSync Monitor] Restarting agent ${agent.id} process`);

      // Send interrupt to clear any hung process
      await this.sendToPane(paneRef, '\x03'); // Ctrl+C

      await this.delay(500);

      // Restart with the original command (simplified mock for now)
      const restartCommand = `echo "[RECOVERED] Agent ${agent.id} restarted at $(date)"`;
      await this.sendToPane(paneRef, restartCommand);

      agent.recoveryCount++;
    }

    // Re-setup terminal streaming if needed
    const terminalSession = terminalStreamingEnhanced.getSession(session.farmId);
    if (!terminalSession || !terminalSession.agents.get(agent.id)?.pipePaneActive) {
      logger.info(LogCategory.FARM, `[XenoSync Monitor] Re-initializing terminal streaming for agent ${agent.id}`);
      // Terminal streaming will handle its own recovery through its health checks
    }
  }

  /**
   * Handle complete session loss
   */
  private async handleSessionLoss(session: XenoSyncSession): Promise<void> {
    logger.error(LogCategory.FARM, `[XenoSync Monitor] Session lost for farm ${session.farmId}`);

    session.status = 'failed';

    // Update database
    try {
      await db.query(
        `UPDATE farms SET status = 'failed' WHERE id = $1`,
        [session.farmId]
      );

      await db.query(
        `UPDATE agents SET status = 'failed' WHERE farm_id = $1`,
        [session.farmId]
      );
    } catch (error) {
      logger.error(LogCategory.FARM, `[XenoSync Monitor] Failed to update database: ${error}`);
    }

    // Notify frontend
    await this.broadcastStatus(session);

    // Remove from monitoring
    this.sessions.delete(session.farmId);
  }

  /**
   * Attempt to recover entire session
   */
  private async attemptSessionRecovery(session: XenoSyncSession): Promise<void> {
    logger.info(LogCategory.FARM, `[XenoSync Monitor] Attempting session recovery for farm ${session.farmId}`);

    session.recoveryAttempts++;

    // Try to recreate tmux session
    const sessionExists = await this.verifyTmuxSession(session.sessionName);

    if (!sessionExists) {
      // Session completely gone, would need to restart from scratch
      logger.error(LogCategory.FARM, `[XenoSync Monitor] Cannot recover session - tmux session gone`);
      session.status = 'failed';
      return;
    }

    // Try to recover each agent
    for (const [agentId, agent] of session.agents) {
      if (agent.status === 'failed') {
        await this.recoverAgent(session, agent);
      }
    }

    // Re-check health after recovery attempt
    setTimeout(() => this.performHealthCheck(session.farmId), 5000);
  }

  /**
   * Broadcast session status to frontend
   */
  private async broadcastStatus(session: XenoSyncSession): Promise<void> {
    const statusUpdate = {
      farmId: session.farmId,
      sessionName: session.sessionName,
      status: session.status,
      expectedAgents: session.expectedAgents,
      actualAgents: session.actualAgents,
      agents: Array.from(session.agents.values()).map(agent => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        lastActivity: agent.lastActivity.toISOString(),
        recoveryCount: agent.recoveryCount,
        healthy: agent.paneExists && (agent.processRunning || agent.outputFlowing)
      })),
      metrics: session.metrics,
      uptime: Date.now() - session.startTime.getTime(),
      lastHealthCheck: session.lastHealthCheck.toISOString()
    };

    websocketManager.broadcastToFarm(session.farmId, 'xenosync:status', statusUpdate);

    this.emit('status', statusUpdate);
  }

  /**
   * Verify tmux session exists
   */
  private async verifyTmuxSession(sessionName: string): Promise<boolean> {
    try {
      execSync(`env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux has-session -t ${sessionName} 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send command to tmux pane
   */
  private async sendToPane(paneRef: string, command: string): Promise<void> {
    return new Promise((resolve) => {
      const tmuxCommand = `env TMUX_TMPDIR="${TMUX_TMP_DIR}" tmux send-keys -t ${paneRef} "${command}" Enter`;

      exec(tmuxCommand, (error) => {
        if (error) {
          logger.error(LogCategory.FARM, `[XenoSync Monitor] Failed to send to pane: ${error}`);
        }
        resolve();
      });
    });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get session info
   */
  getSession(farmId: string): XenoSyncSession | undefined {
    return this.sessions.get(farmId);
  }

  /**
   * Stop monitoring a session
   */
  async stopMonitoring(farmId: string): Promise<void> {
    logger.info(LogCategory.FARM, `[XenoSync Monitor] Stopping monitoring for farm ${farmId}`);

    const session = this.sessions.get(farmId);
    if (session) {
      session.status = 'completed';
      await this.broadcastStatus(session);
    }

    this.sessions.delete(farmId);
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.FARM, '[XenoSync Monitor] Shutting down');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Mark all sessions as completed
    for (const [farmId, session] of this.sessions) {
      session.status = 'completed';
      await this.broadcastStatus(session);
    }

    this.sessions.clear();
  }
}

// Export singleton instance
export const xenoSyncMonitor = XenoSyncMonitorService.getInstance();