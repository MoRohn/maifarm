/**
 * UnifiedOrchestratorService - Standardized backend orchestration for all modes
 * Provides a unified interface for Quick Task, Go Wild, and New Farm modes
 * Always uses XenoSync when enabled for consistent behavior
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { WebSocketManager } from '../websocket/websocketManager';
import { xenoSyncService } from './XenoSyncService';
// import { orchestratorService } from './OrchestratorService';
import { quickTaskExecutor } from './quickTaskExecutor';
import { goWildManager } from './goWildManager';
import { farmService as farmManager } from './unified/farmService';
import { shutdownCoordinator } from './shutdownCoordinator';
import { terminalStreamService } from './terminalStreamService';
import { db } from '../database/connection';
import { QUICK_TASK_TIMEOUT } from '../constants/timing';

export type OrchestratorMode = 'quick-task' | 'go-wild' | 'new-farm';

export interface LaunchOptions {
  mode: OrchestratorMode;
  farmId?: string;
  name: string;
  description: string;
  prompt?: string;
  numberOfAgents?: number;
  timeout?: number; // in seconds for consistency
  provider?: string;
  useXenoSync?: boolean;
  metadata?: Record<string, any>;
  yamlContent?: string;
  debug?: boolean;
}

export interface OrchestratorStatus {
  farmId: string;
  sessionName: string;
  status: 'launching' | 'running' | 'completed' | 'failed' | 'timeout';
  agentCount: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
  harvestId?: string;
}

export class UnifiedOrchestratorService extends EventEmitter {
  private activeSessions: Map<string, OrchestratorStatus> = new Map();
  private correlationIds: Map<string, string> = new Map();

  /**
   * Launch a farm with unified orchestration
   */
  async launch(options: LaunchOptions): Promise<string> {
    const startTime = Date.now();
    const farmId = options.farmId || uuidv4();
    const correlationId = this.generateCorrelationId(farmId);
    
    logger.info(LogCategory.ORCHESTRATOR, `Launching ${options.mode} mode`, {
      correlationId,
      farmId,
      mode: options.mode,
      provider: options.provider,
      agentCount: options.numberOfAgents,
      useXenoSync: options.useXenoSync
    });

    try {
      // Validate and normalize options
      const normalizedOptions = this.normalizeOptions(options);
      
      // Store correlation ID for tracing
      this.correlationIds.set(farmId, correlationId);
      
      // Create initial status
      const status: OrchestratorStatus = {
        farmId,
        sessionName: this.generateSessionName(farmId, options.mode),
        status: 'launching',
        agentCount: normalizedOptions.numberOfAgents,
        startTime: new Date()
      };
      
      this.activeSessions.set(farmId, status);
      
      // Emit launch started event
      this.emit('launch:started', { farmId, correlationId, options: normalizedOptions });
      
      // Launch based on mode
      let result: string;
      switch (options.mode) {
        case 'quick-task':
          result = await this.launchQuickTask(farmId, normalizedOptions, correlationId);
          break;
        case 'go-wild':
          result = await this.launchGoWild(farmId, normalizedOptions, correlationId);
          break;
        case 'new-farm':
          result = await this.launchNewFarm(farmId, normalizedOptions, correlationId);
          break;
        default:
          throw new Error(`Unknown orchestrator mode: ${options.mode}`);
      }
      
      // Update status
      status.status = 'running';
      status.sessionName = result;
      
      // Setup monitoring
      this.setupMonitoring(farmId, normalizedOptions.timeout, correlationId);
      
      // Setup terminal streaming
      await this.setupTerminalStreaming(farmId, result, normalizedOptions.numberOfAgents);
      
      const launchTime = Date.now() - startTime;
      logger.info(LogCategory.ORCHESTRATOR, `Launch completed in ${launchTime}ms`, {
        correlationId,
        farmId,
        sessionName: result,
        launchTime
      });
      
      // Emit launch completed event
      this.emit('launch:completed', { 
        farmId, 
        correlationId, 
        sessionName: result,
        launchTime 
      });
      
      return farmId;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(LogCategory.ORCHESTRATOR, 'Launch failed', {
        correlationId,
        farmId,
        error: errorMessage
      });
      
      // Update status
      const status = this.activeSessions.get(farmId);
      if (status) {
        status.status = 'failed';
        status.error = errorMessage;
        status.endTime = new Date();
      }
      
      // Emit launch failed event
      this.emit('launch:failed', { farmId, correlationId, error: errorMessage });
      
      throw error;
    }
  }

  /**
   * Monitor orchestrator status
   */
  monitor(farmId: string): OrchestratorStatus | undefined {
    return this.activeSessions.get(farmId);
  }

  /**
   * Terminate an orchestrator session
   */
  async terminate(farmId: string): Promise<void> {
    const correlationId = this.correlationIds.get(farmId);
    
    logger.info(LogCategory.ORCHESTRATOR, 'Terminating session', {
      correlationId,
      farmId
    });
    
    const status = this.activeSessions.get(farmId);
    if (!status) {
      logger.warn(LogCategory.ORCHESTRATOR, 'Session not found for termination', {
        correlationId,
        farmId
      });
      return;
    }
    
    try {
      // Trigger graceful shutdown
      await shutdownCoordinator.initiateShutdown(farmId, 'user-requested');
      
      // Update status
      status.status = 'completed';
      status.endTime = new Date();
      
      // Cleanup
      this.activeSessions.delete(farmId);
      this.correlationIds.delete(farmId);
      
      // Emit terminated event
      this.emit('terminated', { farmId, correlationId });
      
    } catch (error) {
      logger.error(LogCategory.ORCHESTRATOR, 'Termination failed', {
        correlationId,
        farmId,
        error
      });
      throw error;
    }
  }

  /**
   * Normalize launch options based on mode
   */
  private normalizeOptions(options: LaunchOptions): Required<LaunchOptions> {
    const defaults = this.getDefaultsForMode(options.mode);
    
    return {
      mode: options.mode,
      farmId: options.farmId || uuidv4(),
      name: options.name,
      description: options.description,
      prompt: options.prompt || options.description,
      numberOfAgents: Math.max(2, options.numberOfAgents || defaults.numberOfAgents), // Minimum 2 for XenoSync
      timeout: options.timeout || defaults.timeout,
      provider: options.provider || process.env.AI_PROVIDER || 'claude',
      useXenoSync: options.useXenoSync !== false, // Default to true
      metadata: options.metadata || {},
      yamlContent: options.yamlContent || '',
      debug: options.debug || false
    };
  }

  /**
   * Get default configuration for each mode
   */
  private getDefaultsForMode(mode: OrchestratorMode): { numberOfAgents: number; timeout: number } {
    switch (mode) {
      case 'quick-task':
        return { numberOfAgents: 2, timeout: 300 }; // 5 minutes, minimum 2 agents
      case 'go-wild':
        return { numberOfAgents: 3, timeout: 1800 }; // 30 minutes
      case 'new-farm':
        return { numberOfAgents: 3, timeout: 3600 }; // 1 hour
      default:
        return { numberOfAgents: 2, timeout: 600 }; // 10 minutes default
    }
  }

  /**
   * Launch Quick Task mode
   */
  private async launchQuickTask(farmId: string, options: Required<LaunchOptions>, correlationId: string): Promise<string> {
    logger.info(LogCategory.ORCHESTRATOR, 'Launching Quick Task with XenoSync', { correlationId, farmId });
    
    // Always use XenoSync for Quick Tasks
    const launchOptions = {
      farmId,
      name: options.name,
      description: options.description,
      numberOfAgents: 2, // Fixed at 2 for Quick Tasks
      prompt: options.prompt,
      mode: 'parallel' as const,
      timeout: QUICK_TASK_TIMEOUT / 1000, // Convert to seconds
      debug: options.debug
    };
    
    const processId = await xenoSyncService.launchFarm(launchOptions);
    const sessionName = `farm-${farmId.substring(0, 8)}`;
    
    // Update database
    await this.recordLaunch(farmId, 'quick-task', sessionName, correlationId);
    
    return sessionName;
  }

  /**
   * Launch Go Wild mode
   */
  private async launchGoWild(farmId: string, options: Required<LaunchOptions>, correlationId: string): Promise<string> {
    logger.info(LogCategory.ORCHESTRATOR, 'Launching Go Wild mode', { correlationId, farmId });
    
    if (options.useXenoSync) {
      // Use XenoSync for Go Wild
      const launchOptions = {
        farmId,
        name: options.name,
        description: options.description,
        numberOfAgents: options.numberOfAgents,
        prompt: options.prompt,
        mode: 'autonomous' as const,
        timeout: options.timeout,
        debug: options.debug
      };
      
      const processId = await xenoSyncService.launchFarm(launchOptions);
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      
      await this.recordLaunch(farmId, 'go-wild', sessionName, correlationId);
      return sessionName;
    } else {
      // Fallback to standard Go Wild manager
      await goWildManager.launchGoWildMode({
        farmId,
        prompt: options.prompt,
        boundaries: [],
        creativityLevel: 0.8,
        numberOfAgents: options.numberOfAgents,
        timeout: options.timeout * 1000 // Convert to milliseconds
      });
      
      const sessionName = `goWild-${farmId.substring(0, 8)}`;
      await this.recordLaunch(farmId, 'go-wild', sessionName, correlationId);
      return sessionName;
    }
  }

  /**
   * Launch New Farm mode
   */
  private async launchNewFarm(farmId: string, options: Required<LaunchOptions>, correlationId: string): Promise<string> {
    logger.info(LogCategory.ORCHESTRATOR, 'Launching New Farm', { correlationId, farmId });
    
    if (options.useXenoSync) {
      // Use XenoSync for New Farm
      const launchOptions = {
        farmId,
        name: options.name,
        description: options.description,
        numberOfAgents: options.numberOfAgents,
        prompt: options.prompt,
        mode: 'collaborative' as const,
        timeout: options.timeout,
        yamlContent: options.yamlContent,
        debug: options.debug
      };
      
      const processId = await xenoSyncService.launchFarm(launchOptions);
      const sessionName = `farm-${farmId.substring(0, 8)}`;
      
      await this.recordLaunch(farmId, 'new-farm', sessionName, correlationId);
      return sessionName;
    } else {
      // Fallback to standard farm manager
      const result = await farmManager.launchFarm({
        farmId,
        name: options.name,
        description: options.description,
        numberOfAgents: options.numberOfAgents,
        prompt: options.prompt,
        yamlContent: options.yamlContent,
        timeout: options.timeout * 1000, // Convert to milliseconds
        provider: options.provider
      });
      
      const sessionName = result.tmuxSession || `farm-${farmId.substring(0, 8)}`;
      await this.recordLaunch(farmId, 'new-farm', sessionName, correlationId);
      return sessionName;
    }
  }

  /**
   * Setup monitoring for a launched session
   */
  private setupMonitoring(farmId: string, timeoutSeconds: number, correlationId: string): void {
    const timeoutMs = timeoutSeconds * 1000;
    
    // Set timeout handler
    setTimeout(async () => {
      const status = this.activeSessions.get(farmId);
      if (status && status.status === 'running') {
        logger.info(LogCategory.ORCHESTRATOR, 'Session timeout reached', {
          correlationId,
          farmId,
          timeout: timeoutSeconds
        });
        
        // Trigger graceful shutdown
        await shutdownCoordinator.initiateShutdown(farmId, 'timeout');
        
        // Update status
        status.status = 'timeout';
        status.endTime = new Date();
        
        // Emit timeout event
        this.emit('timeout', { farmId, correlationId });
      }
    }, timeoutMs);
  }

  /**
   * Setup terminal streaming for the session
   */
  private async setupTerminalStreaming(farmId: string, sessionName: string, agentCount: number): Promise<void> {
    try {
      await terminalStreamService.startStreaming(sessionName, farmId, agentCount);
      
      logger.info(LogCategory.TERMINAL, 'Terminal streaming started', {
        farmId,
        sessionName,
        agentCount
      });
    } catch (error) {
      logger.error(LogCategory.TERMINAL, 'Failed to setup terminal streaming', {
        farmId,
        sessionName,
        error
      });
      // Non-fatal error - continue execution
    }
  }

  /**
   * Generate session name based on mode
   */
  private generateSessionName(farmId: string, mode: OrchestratorMode): string {
    const shortId = farmId.substring(0, 8);
    
    switch (mode) {
      case 'quick-task':
        return `quick_${shortId}`;
      case 'go-wild':
        return `goWild-${shortId}`;
      case 'new-farm':
      default:
        return `farm-${shortId}`;
    }
  }

  /**
   * Generate correlation ID for request tracing
   */
  private generateCorrelationId(farmId: string): string {
    return `xeno-${farmId.substring(0, 8)}-${Date.now()}`;
  }

  /**
   * Record launch in database
   */
  private async recordLaunch(farmId: string, mode: string, sessionName: string, correlationId: string): Promise<void> {
    try {
      await db.query(
        `INSERT INTO farm_lifecycle_events (farm_id, event_type, metadata, created_at)
         VALUES ($1, $2, $3, $4)`,
        [
          farmId,
          'launch',
          JSON.stringify({ mode, sessionName, correlationId }),
          new Date()
        ]
      );
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Failed to record launch', {
        farmId,
        error
      });
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Map<string, OrchestratorStatus> {
    return new Map(this.activeSessions);
  }

  /**
   * Get correlation ID for a farm
   */
  getCorrelationId(farmId: string): string | undefined {
    return this.correlationIds.get(farmId);
  }
}

// Export singleton instance
export const unifiedOrchestratorService = new UnifiedOrchestratorService();