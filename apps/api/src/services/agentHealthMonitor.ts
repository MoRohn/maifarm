/**
 * Agent Health Monitor Service
 *
 * Monitors the health of all active agents in farms by:
 * - Checking tmux pane activity
 * - Detecting stuck or frozen agents
 * - Coordinating with recovery service for automatic restarts
 * - Integrating with shutdown coordinator for graceful termination
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';
import { shutdownCoordinator } from './shutdownCoordinator';
import {
  tmuxSessionExists,
  getTmuxPaneRef,
  sendTmuxCommand,
  TMUX_TMPDIR
} from '../utils/tmuxHelpers';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

export interface AgentHealthStatus {
  agentId: string;
  farmId: string;
  sessionName: string;
  paneIndex: number;
  status: 'healthy' | 'unhealthy' | 'stuck' | 'recovering' | 'dead';
  lastActivity: Date;
  lastHeartbeat: Date;
  outputSize: number;
  hasRecentOutput: boolean;
  recoveryAttempts: number;
  correlationId?: string;
}

interface MonitoredAgent {
  agentId: string;
  farmId: string;
  sessionName: string;
  paneIndex: number;
  lastOutputHash: string;
  lastOutputSize: number;
  lastActivityTime: Date;
  lastHeartbeatTime: Date;
  stuckCounter: number;
  recoveryAttempts: number;
  isRecovering: boolean;
  correlationId: string;
}

interface HealthCheckConfig {
  heartbeatInterval: number;  // How often to check (default: 30s)
  heartbeatTimeout: number;   // When to consider unhealthy (default: 120s)
  stuckThreshold: number;     // No output for this long = stuck (default: 300s)
  maxRecoveryAttempts: number; // Max recovery attempts per agent (default: 3)
  activityCheckLines: number;  // How many lines to check for activity (default: 100)
}

class AgentHealthMonitor extends EventEmitter {
  private static instance: AgentHealthMonitor;
  private monitoredAgents: Map<string, MonitoredAgent> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;
  private isMonitoring: boolean = false;

  private readonly config: HealthCheckConfig = {
    heartbeatInterval: 30000,     // 30 seconds
    heartbeatTimeout: 120000,      // 2 minutes
    stuckThreshold: 300000,        // 5 minutes
    maxRecoveryAttempts: 3,
    activityCheckLines: 100
  };

  private constructor() {
    super();
    this.setupShutdownHandlers();
  }

  static getInstance(): AgentHealthMonitor {
    if (!AgentHealthMonitor.instance) {
      AgentHealthMonitor.instance = new AgentHealthMonitor();
    }
    return AgentHealthMonitor.instance;
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    process.on('SIGINT', () => this.stopMonitoring());
    process.on('SIGTERM', () => this.stopMonitoring());
  }

  /**
   * Start monitoring agents for a farm
   */
  async startMonitoringFarm(
    farmId: string,
    sessionName: string,
    agentIds: string[],
    correlationId?: string
  ): Promise<void> {
    logger.info(LogCategory.MONITORING,
      `Starting health monitoring for farm ${farmId} with ${agentIds.length} agents`);

    // Check if session exists
    const sessionExists = await tmuxSessionExists(sessionName);
    if (!sessionExists) {
      logger.error(LogCategory.MONITORING,
        `Cannot monitor farm ${farmId}: session ${sessionName} does not exist`);
      return;
    }

    // Add agents to monitoring
    for (let i = 0; i < agentIds.length; i++) {
      const agentKey = `${farmId}:${agentIds[i]}`;
      const agent: MonitoredAgent = {
        agentId: agentIds[i],
        farmId,
        sessionName,
        paneIndex: i,
        lastOutputHash: '',
        lastOutputSize: 0,
        lastActivityTime: new Date(),
        lastHeartbeatTime: new Date(),
        stuckCounter: 0,
        recoveryAttempts: 0,
        isRecovering: false,
        correlationId: correlationId || uuidv4()
      };

      this.monitoredAgents.set(agentKey, agent);

      // Update database
      await this.updateAgentHealthInDB(agent, 'healthy');
    }

    // Start monitoring if not already running
    if (!this.isMonitoring) {
      this.startHealthCheckLoop();
    }

    // Emit event
    websocketManager.emitToFarm(farmId, 'health:monitoring:started', {
      farmId,
      sessionName,
      agentCount: agentIds.length,
      correlationId
    });
  }

  /**
   * Stop monitoring agents for a farm
   */
  async stopMonitoringFarm(farmId: string): Promise<void> {
    logger.info(LogCategory.MONITORING, `Stopping health monitoring for farm ${farmId}`);

    // Remove agents from monitoring
    const agentsToRemove: string[] = [];
    for (const [key, agent] of this.monitoredAgents) {
      if (agent.farmId === farmId) {
        agentsToRemove.push(key);
      }
    }

    for (const key of agentsToRemove) {
      this.monitoredAgents.delete(key);
    }

    // Stop monitoring if no agents left
    if (this.monitoredAgents.size === 0) {
      this.stopMonitoring();
    }

    // Emit event
    websocketManager.emitToFarm(farmId, 'health:monitoring:stopped', { farmId });
  }

  /**
   * Start the health check loop
   */
  private startHealthCheckLoop(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    logger.info(LogCategory.MONITORING, 'Starting health check loop');

    // Run health checks at configured interval
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.heartbeatInterval);

    // Perform initial check
    this.performHealthChecks();
  }

  /**
   * Stop all monitoring
   */
  private stopMonitoring(): void {
    if (!this.isMonitoring) return;

    logger.info(LogCategory.MONITORING, 'Stopping health check loop');

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.isMonitoring = false;
  }

  /**
   * Perform health checks for all monitored agents
   */
  private async performHealthChecks(): Promise<void> {
    const checkPromises: Promise<void>[] = [];

    for (const [key, agent] of this.monitoredAgents) {
      // Skip if agent is recovering
      if (agent.isRecovering) continue;

      checkPromises.push(this.checkAgentHealth(key, agent));
    }

    await Promise.allSettled(checkPromises);
  }

  /**
   * Check health of a single agent
   */
  private async checkAgentHealth(key: string, agent: MonitoredAgent): Promise<void> {
    try {
      // Get pane reference
      const paneRef = await getTmuxPaneRef(agent.sessionName, agent.paneIndex);

      // Capture recent pane content
      const captureCmd = `TMUX_TMPDIR=${TMUX_TMPDIR} tmux capture-pane -t ${paneRef} -p -S -${this.config.activityCheckLines}`;
      const { stdout } = await execAsync(captureCmd);

      // Calculate output hash to detect changes
      const outputHash = this.hashString(stdout);
      const outputSize = stdout.length;

      // Check for activity
      const hasActivity = outputHash !== agent.lastOutputHash || outputSize > agent.lastOutputSize;

      if (hasActivity) {
        // Agent is active
        agent.lastActivityTime = new Date();
        agent.lastHeartbeatTime = new Date();
        agent.lastOutputHash = outputHash;
        agent.lastOutputSize = outputSize;
        agent.stuckCounter = 0;

        await this.updateAgentHealthInDB(agent, 'healthy');

        // Write health file for Python orchestrator coordination
        await this.writeHealthFile(agent, 'healthy', outputSize, true);

      } else {
        // No new activity detected
        const timeSinceActivity = Date.now() - agent.lastActivityTime.getTime();
        const timeSinceHeartbeat = Date.now() - agent.lastHeartbeatTime.getTime();

        if (timeSinceActivity > this.config.stuckThreshold) {
          // Agent is stuck
          agent.stuckCounter++;

          logger.warn(LogCategory.MONITORING,
            `Agent ${agent.agentId} in farm ${agent.farmId} is stuck (no activity for ${timeSinceActivity}ms)`);

          await this.updateAgentHealthInDB(agent, 'stuck');
          await this.writeHealthFile(agent, 'stuck', outputSize, false);

          // Trigger recovery if not exceeded max attempts
          if (agent.recoveryAttempts < this.config.maxRecoveryAttempts) {
            await this.triggerAgentRecovery(agent);
          } else {
            // Mark as dead if recovery failed
            await this.updateAgentHealthInDB(agent, 'dead');
            await this.writeHealthFile(agent, 'dead', outputSize, false);

            logger.error(LogCategory.MONITORING,
              `Agent ${agent.agentId} in farm ${agent.farmId} marked as dead after ${agent.recoveryAttempts} recovery attempts`);
          }

        } else if (timeSinceHeartbeat > this.config.heartbeatTimeout) {
          // Agent is unhealthy but not stuck yet
          await this.updateAgentHealthInDB(agent, 'unhealthy');
          await this.writeHealthFile(agent, 'unhealthy', outputSize, false);

          logger.warn(LogCategory.MONITORING,
            `Agent ${agent.agentId} in farm ${agent.farmId} is unhealthy (no heartbeat for ${timeSinceHeartbeat}ms)`);

        } else {
          // Still healthy, just quiet
          agent.lastHeartbeatTime = new Date();
          await this.writeHealthFile(agent, 'healthy', outputSize, false);
        }
      }

      // Emit status update
      this.emitHealthStatus(agent);

    } catch (error) {
      logger.error(LogCategory.MONITORING,
        `Error checking health for agent ${agent.agentId}:`, error);
    }
  }

  /**
   * Trigger recovery for a stuck agent
   */
  private async triggerAgentRecovery(agent: MonitoredAgent): Promise<void> {
    if (agent.isRecovering) return;

    agent.isRecovering = true;
    agent.recoveryAttempts++;

    logger.info(LogCategory.MONITORING,
      `Triggering recovery for agent ${agent.agentId} (attempt ${agent.recoveryAttempts}/${this.config.maxRecoveryAttempts})`);

    try {
      // Update status
      await this.updateAgentHealthInDB(agent, 'recovering');

      // Send Ctrl+C to interrupt stuck process
      await sendTmuxCommand(agent.sessionName, agent.paneIndex, '\x03');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Clear the pane
      await sendTmuxCommand(agent.sessionName, agent.paneIndex, 'clear');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Restart the agent with the original prompt
      const promptFile = join(
        pathConfig.getCoordinationPath(),
        `agent_${agent.paneIndex}_prompt.txt`
      );

      const promptExists = await fs.access(promptFile).then(() => true).catch(() => false);
      if (promptExists) {
        const prompt = await fs.readFile(promptFile, 'utf-8');

        // Re-launch Claude
        await sendTmuxCommand(agent.sessionName, agent.paneIndex,
          'claude --dangerously-skip-permissions');
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Send prompt
        const lines = prompt.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            await sendTmuxCommand(agent.sessionName, agent.paneIndex, line);
          }
        }
      }

      // Reset agent state after recovery
      agent.isRecovering = false;
      agent.lastActivityTime = new Date();
      agent.lastHeartbeatTime = new Date();
      agent.stuckCounter = 0;

      logger.info(LogCategory.MONITORING,
        `Recovery completed for agent ${agent.agentId}`);

      // Emit recovery event
      websocketManager.emitToFarm(agent.farmId, 'agent:recovered', {
        agentId: agent.agentId,
        farmId: agent.farmId,
        recoveryAttempt: agent.recoveryAttempts,
        correlationId: agent.correlationId
      });

    } catch (error) {
      logger.error(LogCategory.MONITORING,
        `Recovery failed for agent ${agent.agentId}:`, error);
      agent.isRecovering = false;
    }
  }

  /**
   * Update agent health status in database
   */
  private async updateAgentHealthInDB(
    agent: MonitoredAgent,
    status: string
  ): Promise<void> {
    try {
      await db.query(
        `UPDATE agents
         SET health_status = $1,
             last_activity = $2,
             recovery_attempts = $3,
             correlation_id = $4
         WHERE farm_id = $5 AND id = $6`,
        [
          status,
          agent.lastActivityTime,
          agent.recoveryAttempts,
          agent.correlationId,
          agent.farmId,
          agent.agentId
        ]
      );
    } catch (error) {
      logger.error(LogCategory.MONITORING,
        `Failed to update agent health in DB:`, error);
    }
  }

  /**
   * Write health file for coordination with Python orchestrator
   */
  private async writeHealthFile(
    agent: MonitoredAgent,
    status: string,
    outputSize: number,
    hasOutput: boolean
  ): Promise<void> {
    try {
      const healthFile = join(
        pathConfig.getCoordinationPath(),
        `agent_${agent.paneIndex}_health.json`
      );

      const healthData = {
        agent_id: agent.paneIndex,
        farm_id: agent.farmId,
        status,
        last_activity: agent.lastActivityTime.toISOString(),
        last_heartbeat: agent.lastHeartbeatTime.toISOString(),
        output_size: outputSize,
        has_output: hasOutput,
        stuck_counter: agent.stuckCounter,
        recovery_attempts: agent.recoveryAttempts,
        is_recovering: agent.isRecovering,
        correlation_id: agent.correlationId
      };

      await fs.writeFile(healthFile, JSON.stringify(healthData, null, 2));
    } catch (error) {
      logger.error(LogCategory.MONITORING,
        `Failed to write health file:`, error);
    }
  }

  /**
   * Emit health status update
   */
  private emitHealthStatus(agent: MonitoredAgent): void {
    const status: AgentHealthStatus = {
      agentId: agent.agentId,
      farmId: agent.farmId,
      sessionName: agent.sessionName,
      paneIndex: agent.paneIndex,
      status: this.getHealthStatus(agent),
      lastActivity: agent.lastActivityTime,
      lastHeartbeat: agent.lastHeartbeatTime,
      outputSize: agent.lastOutputSize,
      hasRecentOutput: agent.stuckCounter === 0,
      recoveryAttempts: agent.recoveryAttempts,
      correlationId: agent.correlationId
    };

    // Emit to local listeners
    this.emit('health:status', status);

    // Emit via WebSocket
    websocketManager.emitToFarm(agent.farmId, 'agent:health:status', status);
  }

  /**
   * Get health status for an agent
   */
  private getHealthStatus(agent: MonitoredAgent): AgentHealthStatus['status'] {
    if (agent.isRecovering) return 'recovering';
    if (agent.recoveryAttempts >= this.config.maxRecoveryAttempts) return 'dead';
    if (agent.stuckCounter > 0) return 'stuck';

    const timeSinceHeartbeat = Date.now() - agent.lastHeartbeatTime.getTime();
    if (timeSinceHeartbeat > this.config.heartbeatTimeout) return 'unhealthy';

    return 'healthy';
  }

  /**
   * Hash a string for change detection
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get current health status for all agents in a farm
   */
  async getFarmHealthStatus(farmId: string): Promise<AgentHealthStatus[]> {
    const statuses: AgentHealthStatus[] = [];

    for (const [key, agent] of this.monitoredAgents) {
      if (agent.farmId === farmId) {
        statuses.push({
          agentId: agent.agentId,
          farmId: agent.farmId,
          sessionName: agent.sessionName,
          paneIndex: agent.paneIndex,
          status: this.getHealthStatus(agent),
          lastActivity: agent.lastActivityTime,
          lastHeartbeat: agent.lastHeartbeatTime,
          outputSize: agent.lastOutputSize,
          hasRecentOutput: agent.stuckCounter === 0,
          recoveryAttempts: agent.recoveryAttempts,
          correlationId: agent.correlationId
        });
      }
    }

    return statuses;
  }

  /**
   * Check if farm has any unhealthy agents
   */
  hasFarmHealthIssues(farmId: string): boolean {
    for (const [key, agent] of this.monitoredAgents) {
      if (agent.farmId === farmId) {
        const status = this.getHealthStatus(agent);
        if (status !== 'healthy') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Force recovery for all stuck agents in a farm
   */
  async forceRecoverFarm(farmId: string): Promise<void> {
    logger.info(LogCategory.MONITORING, `Force recovering all stuck agents in farm ${farmId}`);

    const recoveryPromises: Promise<void>[] = [];

    for (const [key, agent] of this.monitoredAgents) {
      if (agent.farmId === farmId && this.getHealthStatus(agent) === 'stuck') {
        recoveryPromises.push(this.triggerAgentRecovery(agent));
      }
    }

    await Promise.allSettled(recoveryPromises);
  }
}

// Export singleton instance
export const agentHealthMonitor = AgentHealthMonitor.getInstance();