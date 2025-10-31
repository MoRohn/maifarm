import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger, LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { Farm } from '@shared/types';
import { db } from '../database/connection';

const execAsync = promisify(exec);

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastCheck: Date;
  details?: Record<string, any>;
  error?: string;
}

export interface FarmHealth {
  farmId: string;
  overall: 'healthy' | 'degraded' | 'failed';
  components: ComponentHealth[];
  lastUpdate: Date;
  recoveryAttempts: number;
  startTime: Date;  // CRITICAL FIX: Track when monitoring started
}

export class FarmHealthMonitor extends EventEmitter {
  private healthChecks: Map<string, FarmHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 10000; // 10 seconds
  private readonly MAX_RECOVERY_ATTEMPTS = 3;
  private readonly INITIALIZATION_GRACE_PERIOD = 45000; // CRITICAL FIX: 45 seconds grace period for orchestrator initialization

  async startMonitoring(farmId: string): Promise<void> {
    logger.info(LogCategory.ORCHESTRATOR, `Starting health monitoring for farm ${farmId}`);

    const startTime = new Date();

    // Initialize health tracking
    this.healthChecks.set(farmId, {
      farmId,
      overall: 'healthy',
      components: [],
      lastUpdate: startTime,
      recoveryAttempts: 0,
      startTime  // CRITICAL FIX: Store start time for grace period
    });

    logger.info(LogCategory.ORCHESTRATOR,
      `Farm ${farmId} has ${this.INITIALIZATION_GRACE_PERIOD / 1000}s grace period before first health check`);

    // Start periodic health checks
    if (!this.checkInterval) {
      this.checkInterval = setInterval(() => this.runHealthChecks(), this.CHECK_INTERVAL);
    }
  }

  async stopMonitoring(farmId: string): Promise<void> {
    logger.info(LogCategory.ORCHESTRATOR, `Stopping health monitoring for farm ${farmId}`);
    this.healthChecks.delete(farmId);

    // Stop interval if no farms are being monitored
    if (this.healthChecks.size === 0 && this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async runHealthChecks(): Promise<void> {
    for (const [farmId, health] of this.healthChecks) {
      try {
        // CRITICAL FIX: Skip health checks during initialization grace period
        const timeSinceStart = Date.now() - health.startTime.getTime();
        if (timeSinceStart < this.INITIALIZATION_GRACE_PERIOD) {
          logger.debug(LogCategory.ORCHESTRATOR,
            `Skipping health check for farm ${farmId} (${Math.floor(timeSinceStart / 1000)}s / ${this.INITIALIZATION_GRACE_PERIOD / 1000}s grace period)`);
          continue;
        }

        const components = await this.checkAllComponents(farmId);
        const overall = this.calculateOverallHealth(components);

        const newHealth: FarmHealth = {
          ...health,
          components,
          overall,
          lastUpdate: new Date()
        };

        this.healthChecks.set(farmId, newHealth);

        // Emit health update event
        this.emit('health-update', { farmId, health: newHealth });

        // Trigger recovery if needed
        if (overall === 'failed' && health.recoveryAttempts < this.MAX_RECOVERY_ATTEMPTS) {
          await this.attemptRecovery(farmId);
        }
      } catch (error) {
        logger.error(LogCategory.ORCHESTRATOR, `Health check failed for farm ${farmId}:`, error);
      }
    }
  }

  private async checkAllComponents(farmId: string): Promise<ComponentHealth[]> {
    const components: ComponentHealth[] = [];

    // Check tmux session
    components.push(await this.checkTmuxSession(farmId));

    // Check orchestrator process
    components.push(await this.checkOrchestratorProcess(farmId));

    // Check terminal streaming
    components.push(await this.checkTerminalStreaming(farmId));

    // Check file watcher
    components.push(await this.checkFileWatcher(farmId));

    // Check WebSocket connection
    components.push(await this.checkWebSocketHealth(farmId));

    // Check agent panes
    const agentCount = await this.getAgentCount(farmId);
    for (let i = 0; i < agentCount; i++) {
      components.push(await this.checkAgentPane(farmId, i));
    }

    return components;
  }

  private async checkTmuxSession(farmId: string): Promise<ComponentHealth> {
    try {
      // Get the actual session name from the database or active farms
      const sessionName = await this.getSessionName(farmId);
      if (!sessionName) {
        return {
          name: 'tmux-session',
          status: 'failed',
          lastCheck: new Date(),
          error: 'Session name not found in database'
        };
      }

      const { stdout } = await execAsync(`TMUX_TMPDIR=/tmp tmux has-session -t ${sessionName} 2>/dev/null`);

      return {
        name: 'tmux-session',
        status: 'healthy',
        lastCheck: new Date(),
        details: { sessionName }
      };
    } catch (error) {
      return {
        name: 'tmux-session',
        status: 'failed',
        lastCheck: new Date(),
        error: 'Session not found'
      };
    }
  }

  private async checkOrchestratorProcess(farmId: string): Promise<ComponentHealth> {
    try {
      // Check heartbeat file
      const heartbeatPath = path.join(pathConfig.getTerminalDir(farmId), 'orchestrator.heartbeat');
      const stat = await fs.stat(heartbeatPath);
      const ageMs = Date.now() - stat.mtime.getTime();

      // Heartbeat should be updated every 5 seconds, consider unhealthy after 15 seconds
      if (ageMs > 15000) {
        return {
          name: 'orchestrator',
          status: 'degraded',
          lastCheck: new Date(),
          details: { lastHeartbeat: stat.mtime, ageMs }
        };
      }

      return {
        name: 'orchestrator',
        status: 'healthy',
        lastCheck: new Date(),
        details: { lastHeartbeat: stat.mtime }
      };
    } catch (error) {
      return {
        name: 'orchestrator',
        status: 'failed',
        lastCheck: new Date(),
        error: 'Heartbeat file not found'
      };
    }
  }

  private async checkTerminalStreaming(farmId: string): Promise<ComponentHealth> {
    try {
      const terminalDir = pathConfig.getTerminalDir(farmId);
      const files = await fs.readdir(terminalDir);
      const logFiles = files.filter(f => f.match(/agent-\d+\.log/));

      if (logFiles.length === 0) {
        return {
          name: 'terminal-streaming',
          status: 'failed',
          lastCheck: new Date(),
          error: 'No log files found'
        };
      }

      // Check if logs are being written to
      let activeFiles = 0;
      for (const file of logFiles) {
        const stat = await fs.stat(path.join(terminalDir, file));
        if (Date.now() - stat.mtime.getTime() < 60000) { // Active in last minute
          activeFiles++;
        }
      }

      return {
        name: 'terminal-streaming',
        status: activeFiles > 0 ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        details: { totalFiles: logFiles.length, activeFiles }
      };
    } catch (error) {
      return {
        name: 'terminal-streaming',
        status: 'failed',
        lastCheck: new Date(),
        error: 'Cannot access terminal directory'
      };
    }
  }

  private async checkFileWatcher(farmId: string): Promise<ComponentHealth> {
    // Check if file watcher is registered and active
    // This would integrate with terminalFileWatcherService
    try {
      const terminalFileWatcher = require('./terminalFileWatcherService').terminalFileWatcherService;
      const isWatching = terminalFileWatcher.isWatching(farmId);

      return {
        name: 'file-watcher',
        status: isWatching ? 'healthy' : 'failed',
        lastCheck: new Date(),
        details: { isWatching }
      };
    } catch (error) {
      return {
        name: 'file-watcher',
        status: 'failed',
        lastCheck: new Date(),
        error: 'File watcher service unavailable'
      };
    }
  }

  private async checkWebSocketHealth(farmId: string): Promise<ComponentHealth> {
    // Check WebSocket connection health
    // This would integrate with websocket service
    try {
      const io = require('../websocket/websocketManager').io;
      const room = `farm:${farmId}`;
      const sockets = await io.in(room).fetchSockets();

      return {
        name: 'websocket',
        status: sockets.length > 0 ? 'healthy' : 'degraded',
        lastCheck: new Date(),
        details: { connectedClients: sockets.length }
      };
    } catch (error) {
      return {
        name: 'websocket',
        status: 'failed',
        lastCheck: new Date(),
        error: 'WebSocket service unavailable'
      };
    }
  }

  private async checkAgentPane(farmId: string, agentIndex: number): Promise<ComponentHealth> {
    try {
      const sessionName = await this.getSessionName(farmId);
      if (!sessionName) {
        return {
          name: `agent-${agentIndex}`,
          status: 'failed',
          lastCheck: new Date(),
          error: 'Session name not found'
        };
      }

      const { stdout } = await execAsync(
        `TMUX_TMPDIR=/tmp tmux list-panes -t ${sessionName}:agents -F "#{pane_index}"`
      );

      const panes = stdout.trim().split('\n').map(p => parseInt(p));
      const paneExists = panes.includes(agentIndex);

      return {
        name: `agent-${agentIndex}`,
        status: paneExists ? 'healthy' : 'failed',
        lastCheck: new Date(),
        details: { paneIndex: agentIndex, paneExists }
      };
    } catch (error) {
      return {
        name: `agent-${agentIndex}`,
        status: 'failed',
        lastCheck: new Date(),
        error: 'Cannot check pane status'
      };
    }
  }

  private calculateOverallHealth(components: ComponentHealth[]): 'healthy' | 'degraded' | 'failed' {
    const failedCount = components.filter(c => c.status === 'failed').length;
    const degradedCount = components.filter(c => c.status === 'degraded').length;

    if (failedCount > 0) {
      return 'failed';
    } else if (degradedCount > 0) {
      return 'degraded';
    }
    return 'healthy';
  }

  private async attemptRecovery(farmId: string): Promise<void> {
    const health = this.healthChecks.get(farmId);
    if (!health) return;

    logger.warn(LogCategory.ORCHESTRATOR, `Attempting recovery for farm ${farmId} (attempt ${health.recoveryAttempts + 1})`);

    health.recoveryAttempts++;
    this.healthChecks.set(farmId, health);

    // Emit recovery event
    this.emit('recovery-attempt', { farmId, attempt: health.recoveryAttempts });

    // Recovery strategies based on failed components
    for (const component of health.components) {
      if (component.status === 'failed') {
        await this.recoverComponent(farmId, component);
      }
    }
  }

  private async recoverComponent(farmId: string, component: ComponentHealth): Promise<void> {
    logger.info(LogCategory.ORCHESTRATOR, `Recovering component ${component.name} for farm ${farmId}`);

    try {
      switch (component.name) {
        case 'tmux-session':
          await this.recoverTmuxSession(farmId);
          break;
        case 'orchestrator':
          await this.recoverOrchestrator(farmId);
          break;
        case 'terminal-streaming':
          await this.recoverTerminalStreaming(farmId);
          break;
        case 'file-watcher':
          await this.recoverFileWatcher(farmId);
          break;
        case 'websocket':
          await this.recoverWebSocket(farmId);
          break;
        default:
          if (component.name.startsWith('agent-')) {
            const agentIndex = parseInt(component.name.split('-')[1]);
            await this.recoverAgentPane(farmId, agentIndex);
          }
      }
    } catch (error) {
      logger.error(LogCategory.ORCHESTRATOR, `Failed to recover ${component.name}:`, error);
    }
  }

  private async recoverTmuxSession(farmId: string): Promise<void> {
    const sessionName = await this.getSessionName(farmId);
    if (!sessionName) {
      throw new Error(`Cannot recover session - no session name found for farm ${farmId}`);
    }

    logger.info(LogCategory.ORCHESTRATOR, `Recreating tmux session ${sessionName}`);

    // Recreate the tmux session
    await execAsync(`TMUX_TMPDIR=/tmp tmux new-session -d -s ${sessionName} -n agents`);

    // Recreate the panes
    const agentCount = await this.getAgentCount(farmId);
    for (let i = 1; i < agentCount; i++) {
      if (i === 1) {
        await execAsync(`TMUX_TMPDIR=/tmp tmux split-window -t ${sessionName}:agents -h`);
      } else {
        await execAsync(`TMUX_TMPDIR=/tmp tmux split-window -t ${sessionName}:agents.${i-1} -v`);
      }
    }
  }

  private async recoverOrchestrator(farmId: string): Promise<void> {
    logger.info(LogCategory.ORCHESTRATOR, `Restarting orchestrator for farm ${farmId}`);

    // Restart the orchestrator process
    // This would need to coordinate with UnifiedFarmLaunchOrchestrator
    const orchestratorService = require('./UnifiedFarmLaunchOrchestrator').unifiedFarmLaunchOrchestrator;

    // Signal orchestrator to restart
    this.emit('orchestrator-restart-needed', { farmId });
  }

  private async recoverTerminalStreaming(farmId: string): Promise<void> {
    logger.info(LogCategory.ORCHESTRATOR, `Restarting terminal streaming for farm ${farmId}`);

    const sessionName = await this.getSessionName(farmId);
    if (!sessionName) {
      throw new Error(`Cannot recover terminal streaming - no session name found for farm ${farmId}`);
    }

    const terminalDir = pathConfig.getTerminalDir(farmId);
    const agentCount = await this.getAgentCount(farmId);

    // Re-setup pipe-pane for each agent
    for (let i = 0; i < agentCount; i++) {
      const logFile = path.join(terminalDir, `agent-${i}.log`);
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux pipe-pane -t ${sessionName}:agents.${i} -o "cat >> ${logFile}"`
      );
    }
  }

  private async recoverFileWatcher(farmId: string): Promise<void> {
    logger.info(LogCategory.ORCHESTRATOR, `Restarting file watcher for farm ${farmId}`);

    const terminalFileWatcher = require('./terminalFileWatcherService').terminalFileWatcherService;
    await terminalFileWatcher.stopWatching(farmId);
    await terminalFileWatcher.startWatching(farmId);
  }

  private async recoverWebSocket(farmId: string): Promise<void> {
    logger.info(LogCategory.ORCHESTRATOR, `Broadcasting reconnection request for farm ${farmId}`);

    const io = require('../websocket/websocketManager').io;
    io.to(`farm:${farmId}`).emit('reconnect-required', { farmId });
  }

  private async recoverAgentPane(farmId: string, agentIndex: number): Promise<void> {
    logger.info(LogCategory.ORCHESTRATOR, `Recreating agent pane ${agentIndex} for farm ${farmId}`);

    const sessionName = await this.getSessionName(farmId);
    if (!sessionName) {
      throw new Error(`Cannot recover agent pane - no session name found for farm ${farmId}`);
    }

    // Create the missing pane
    if (agentIndex === 0) {
      // Can't recreate pane 0, need to recreate entire session
      await this.recoverTmuxSession(farmId);
    } else {
      // Split from previous pane
      const splitFrom = agentIndex === 1 ? '0' : `${agentIndex - 1}`;
      const splitType = agentIndex === 1 ? '-h' : '-v';

      await execAsync(
        `TMUX_TMPDIR=/tmp tmux split-window -t ${sessionName}:agents.${splitFrom} ${splitType}`
      );

      // Re-setup pipe-pane
      const terminalDir = pathConfig.getTerminalDir(farmId);
      const logFile = path.join(terminalDir, `agent-${agentIndex}.log`);
      await execAsync(
        `TMUX_TMPDIR=/tmp tmux pipe-pane -t ${sessionName}:agents.${agentIndex} -o "cat >> ${logFile}"`
      );
    }
  }

  private async getAgentCount(farmId: string): Promise<number> {
    // Get agent count from farm metadata or default
    try {
      const farmManager = require('./farmManager').farmManager;
      const farm = await farmManager.getFarm(farmId);
      return farm?.agentCount || 3;
    } catch {
      return 3; // Default
    }
  }

  private async getSessionName(farmId: string): Promise<string | null> {
    try {
      // First check the database for the session name
      const result = await db.query(
        'SELECT session_name FROM farms WHERE id = $1',
        [farmId]
      );

      if (result.rows.length > 0 && result.rows[0].session_name) {
        return result.rows[0].session_name;
      }

      // Fallback: try to find any tmux session that matches the farm ID pattern
      // This handles quick-, farm-, and wild- prefixes
      const { stdout } = await execAsync('TMUX_TMPDIR=/tmp tmux list-sessions -F "#{session_name}" 2>/dev/null || true');
      const sessions = stdout.trim().split('\n').filter(Boolean);
      const farmIdShort = farmId.substring(0, 8);

      for (const session of sessions) {
        if (session.includes(farmIdShort)) {
          // Update the database with the found session name
          await db.query(
            'UPDATE farms SET session_name = $1 WHERE id = $2',
            [session, farmId]
          );
          return session;
        }
      }

      return null;
    } catch (error) {
      logger.error(LogCategory.ORCHESTRATOR, `Failed to get session name for farm ${farmId}:`, error);
      return null;
    }
  }

  public getHealth(farmId: string): FarmHealth | undefined {
    return this.healthChecks.get(farmId);
  }

  public getAllHealth(): Map<string, FarmHealth> {
    return new Map(this.healthChecks);
  }
}

export const farmHealthMonitor = new FarmHealthMonitor();