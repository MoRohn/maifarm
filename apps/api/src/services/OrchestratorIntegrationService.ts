/**
 * Orchestrator Integration Service
 *
 * Bridges the Python orchestrator with the unified terminal streaming service.
 * Handles:
 * - Farm launch coordination
 * - Session registration
 * - Status monitoring
 * - Automatic terminal streaming setup
 * - Error recovery and cleanup
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger, LogCategory } from '../utils/logger';
import { unifiedTerminalStreamService } from './UnifiedTerminalStreamService';
import { websocketManager } from '../websocket/websocketManager';
import { pathConfig } from '../config/paths';

const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

// ============================================================================
// Types & Interfaces
// ============================================================================

interface FarmLaunchConfig {
  farmId: string;
  farmName: string;
  agentCount: number;
  prompt: string;
  provider: string;
  mode: 'farm' | 'quick' | 'gowild';
  timeout?: number;
  contextFiles?: string[];
}

interface OrchestratorStatus {
  status: 'initializing' | 'creating_session' | 'launching_agents' | 'running' | 'completed' | 'failed';
  sessionName: string;
  farmId: string;
  panesCreated: number;
  panesReady: number[];
  timestamp: string;
  orchestratorPid?: number;
  error?: string;
}

interface FarmSession {
  farmId: string;
  sessionName: string;
  agentCount: number;
  orchestratorProcess?: ChildProcess;
  orchestratorPid?: number;
  status: 'launching' | 'running' | 'completed' | 'failed';
  startTime: number;
  error?: string;
}

// ============================================================================
// Orchestrator Integration Service
// ============================================================================

export class OrchestratorIntegrationService extends EventEmitter {
  private static instance: OrchestratorIntegrationService;

  private readonly sessions = new Map<string, FarmSession>();
  private readonly statusWatchers = new Map<string, NodeJS.Timeout>();

  private readonly coordinationDir: string;
  private readonly orchestratorScript: string;

  private constructor() {
    super();

    this.coordinationDir = join(
      pathConfig.getPath('MAIBARN_ROOT'),
      'coordination'
    );

    this.orchestratorScript = join(
      process.cwd(),
      'scripts',
      'python',
      'orchestrator.py'
    );

    this.setupCleanupHandlers();
  }

  static getInstance(): OrchestratorIntegrationService {
    if (!OrchestratorIntegrationService.instance) {
      OrchestratorIntegrationService.instance = new OrchestratorIntegrationService();
    }
    return OrchestratorIntegrationService.instance;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Launch a new farm with agents
   */
  async launchFarm(config: FarmLaunchConfig): Promise<{
    success: boolean;
    sessionName: string;
    error?: string;
  }> {
    const { farmId, farmName, agentCount, prompt, provider, mode, timeout, contextFiles } = config;

    logger.info(LogCategory.TERMINAL,
      `Launching farm: ${farmId} with ${agentCount} agents`);

    try {
      // Generate session name
      const sessionName = this.generateSessionName(farmId, mode);

      // Register session with unified terminal service
      unifiedTerminalStreamService.registerFarmSession(
        farmId,
        sessionName,
        agentCount,
        'agents'
      );

      // Create farm session tracking
      const session: FarmSession = {
        farmId,
        sessionName,
        agentCount,
        status: 'launching',
        startTime: Date.now()
      };

      this.sessions.set(farmId, session);

      // Build orchestrator arguments
      const args = [
        this.orchestratorScript,
        '-n', String(agentCount),
        '-p', prompt,
        '--session-name', sessionName,
        '--farm-id', farmId,
        '--provider', provider
      ];

      if (timeout) {
        args.push('--max-runtime', String(timeout));
      }

      if (contextFiles && contextFiles.length > 0) {
        args.push('--context-files', ...contextFiles);
      }

      // Launch orchestrator process
      const orchestratorProcess = spawn('python3', args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          TMUX_TMPDIR: tmuxTmpDir
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      session.orchestratorProcess = orchestratorProcess;
      session.orchestratorPid = orchestratorProcess.pid;

      // Setup output handlers
      this.setupProcessHandlers(farmId, orchestratorProcess);

      // Start monitoring orchestrator status
      this.startStatusMonitoring(farmId, sessionName);

      // Broadcast launch event
      websocketManager.sendToRoom(`farm:${farmId}`, 'farm:launching', {
        farmId,
        sessionName,
        agentCount,
        timestamp: new Date().toISOString()
      });

      logger.info(LogCategory.TERMINAL,
        `Farm launched: ${farmId}, session: ${sessionName}, PID: ${orchestratorProcess.pid}`);

      return {
        success: true,
        sessionName
      };

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Failed to launch farm ${farmId}:`, error);

      return {
        success: false,
        sessionName: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Stop a farm and cleanup resources
   */
  async stopFarm(farmId: string): Promise<void> {
    logger.info(LogCategory.TERMINAL, `Stopping farm: ${farmId}`);

    const session = this.sessions.get(farmId);
    if (!session) {
      logger.warn(LogCategory.TERMINAL, `Farm session not found: ${farmId}`);
      return;
    }

    try {
      // Stop orchestrator process
      if (session.orchestratorProcess && session.orchestratorPid) {
        try {
          process.kill(session.orchestratorPid, 'SIGTERM');
          logger.info(LogCategory.TERMINAL,
            `Sent SIGTERM to orchestrator PID: ${session.orchestratorPid}`);
        } catch (error) {
          logger.warn(LogCategory.TERMINAL,
            `Failed to kill orchestrator process: ${error}`);
        }
      }

      // Stop terminal streaming
      await unifiedTerminalStreamService.stopFarmStreaming(farmId);

      // Stop status monitoring
      this.stopStatusMonitoring(farmId);

      // Update session status
      session.status = 'completed';

      // Cleanup session
      this.sessions.delete(farmId);

      // Broadcast stop event
      websocketManager.sendToRoom(`farm:${farmId}`, 'farm:stopped', {
        farmId,
        timestamp: new Date().toISOString()
      });

      logger.info(LogCategory.TERMINAL, `Farm stopped: ${farmId}`);

    } catch (error) {
      logger.error(LogCategory.TERMINAL, `Error stopping farm ${farmId}:`, error);
    }
  }

  /**
   * Get farm session info
   */
  getFarmSession(farmId: string): FarmSession | undefined {
    return this.sessions.get(farmId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): FarmSession[] {
    return Array.from(this.sessions.values());
  }

  // ============================================================================
  // Private Methods - Process Management
  // ============================================================================

  private setupProcessHandlers(farmId: string, process: ChildProcess): void {
    // Capture stdout
    if (process.stdout) {
      process.stdout.on('data', (data) => {
        const output = data.toString();
        logger.debug(LogCategory.TERMINAL,
          `[Orchestrator ${farmId}] ${output.trim()}`);

        // Broadcast to WebSocket
        websocketManager.sendToRoom(`farm:${farmId}`, 'orchestrator:output', {
          farmId,
          output: output.trim(),
          timestamp: new Date().toISOString()
        });
      });
    }

    // Capture stderr
    if (process.stderr) {
      process.stderr.on('data', (data) => {
        const error = data.toString();
        logger.error(LogCategory.TERMINAL,
          `[Orchestrator ${farmId}] ERROR: ${error.trim()}`);

        // Broadcast error
        websocketManager.sendToRoom(`farm:${farmId}`, 'orchestrator:error', {
          farmId,
          error: error.trim(),
          timestamp: new Date().toISOString()
        });
      });
    }

    // Handle process exit
    process.on('exit', (code, signal) => {
      logger.info(LogCategory.TERMINAL,
        `Orchestrator exited: farm=${farmId}, code=${code}, signal=${signal}`);

      const session = this.sessions.get(farmId);
      if (session) {
        session.status = code === 0 ? 'completed' : 'failed';
        if (code !== 0) {
          session.error = `Orchestrator exited with code ${code}`;
        }
      }

      // Broadcast exit event
      websocketManager.sendToRoom(`farm:${farmId}`, 'orchestrator:exit', {
        farmId,
        code,
        signal,
        timestamp: new Date().toISOString()
      });

      // Cleanup after a delay
      setTimeout(() => {
        this.stopStatusMonitoring(farmId);
      }, 5000);
    });

    // Handle process errors
    process.on('error', (error) => {
      logger.error(LogCategory.TERMINAL,
        `Orchestrator process error: farm=${farmId}`, error);

      const session = this.sessions.get(farmId);
      if (session) {
        session.status = 'failed';
        session.error = error.message;
      }

      // Broadcast error event
      websocketManager.sendToRoom(`farm:${farmId}`, 'orchestrator:process_error', {
        farmId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    });
  }

  // ============================================================================
  // Private Methods - Status Monitoring
  // ============================================================================

  private startStatusMonitoring(farmId: string, sessionName: string): void {
    const statusFile = join(this.coordinationDir, `orchestrator_status_${farmId}.json`);

    // Poll status file every second
    const watcher = setInterval(async () => {
      try {
        const content = await fs.readFile(statusFile, 'utf-8');
        const status: OrchestratorStatus = JSON.parse(content);

        await this.handleStatusUpdate(farmId, sessionName, status);

      } catch (error) {
        // File might not exist yet or be being written
        logger.debug(LogCategory.TERMINAL,
          `Status file not available yet: ${statusFile}`);
      }
    }, 1000);

    this.statusWatchers.set(farmId, watcher);

    logger.debug(LogCategory.TERMINAL,
      `Started status monitoring for farm: ${farmId}`);
  }

  private stopStatusMonitoring(farmId: string): void {
    const watcher = this.statusWatchers.get(farmId);
    if (watcher) {
      clearInterval(watcher);
      this.statusWatchers.delete(farmId);

      logger.debug(LogCategory.TERMINAL,
        `Stopped status monitoring for farm: ${farmId}`);
    }
  }

  private async handleStatusUpdate(
    farmId: string,
    sessionName: string,
    status: OrchestratorStatus
  ): Promise<void> {
    const session = this.sessions.get(farmId);
    if (!session) return;

    // Broadcast status update
    websocketManager.sendToRoom(`farm:${farmId}`, 'orchestrator:status', {
      farmId,
      status: status.status,
      panesCreated: status.panesCreated,
      panesReady: status.panesReady,
      timestamp: status.timestamp
    });

    // Handle status-specific actions
    switch (status.status) {
      case 'creating_session':
        logger.info(LogCategory.TERMINAL,
          `Creating tmux session: ${sessionName}`);
        break;

      case 'launching_agents':
        logger.info(LogCategory.TERMINAL,
          `Launching ${status.panesCreated} agents for farm: ${farmId}`);
        break;

      case 'running':
        // All agents launched - start terminal streaming
        if (status.panesReady.length === session.agentCount) {
          logger.info(LogCategory.TERMINAL,
            `All ${session.agentCount} agents ready, starting terminal streaming`);

          session.status = 'running';

          // Start streaming for all agents
          await unifiedTerminalStreamService.startFarmStreaming(
            farmId,
            sessionName,
            session.agentCount
          );

          // Broadcast ready event
          websocketManager.sendToRoom(`farm:${farmId}`, 'farm:ready', {
            farmId,
            sessionName,
            agentCount: session.agentCount,
            timestamp: new Date().toISOString()
          });
        }
        break;

      case 'completed':
        logger.info(LogCategory.TERMINAL, `Farm completed: ${farmId}`);
        session.status = 'completed';
        this.stopStatusMonitoring(farmId);
        break;

      case 'failed':
        logger.error(LogCategory.TERMINAL,
          `Farm failed: ${farmId}, error: ${status.error}`);
        session.status = 'failed';
        session.error = status.error;
        this.stopStatusMonitoring(farmId);
        break;
    }
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private generateSessionName(farmId: string, mode: string): string {
    const shortId = farmId.substring(0, 8);

    switch (mode) {
      case 'quick':
        return `quick-${shortId}`;
      case 'gowild':
        return `gowild-${shortId}`;
      default:
        return `farm-${shortId}`;
    }
  }

  private setupCleanupHandlers(): void {
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  private async cleanup(): Promise<void> {
    logger.info(LogCategory.TERMINAL, 'Cleaning up orchestrator integrations');

    // Stop all status watchers
    for (const farmId of this.statusWatchers.keys()) {
      this.stopStatusMonitoring(farmId);
    }

    // Stop all farm sessions
    const promises: Promise<void>[] = [];
    for (const farmId of this.sessions.keys()) {
      promises.push(this.stopFarm(farmId));
    }

    await Promise.allSettled(promises);
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const orchestratorIntegrationService = OrchestratorIntegrationService.getInstance();
