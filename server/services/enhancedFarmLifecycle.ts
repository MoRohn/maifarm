/**
 * Enhanced Farm Lifecycle Manager
 * Manages farm lifecycle with proper state transitions, recovery, and monitoring
 */

import { EventEmitter } from 'events';
import UnifiedRedisStateManager, { FarmStatus, FarmState, AgentState } from './unifiedRedisStateManager';
import { redis } from '../database/connection';
import { db } from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface FarmConfig {
  name: string;
  description: string;
  prompt: string;
  agentCount: number;
  timeout: number;
  provider: 'claude' | 'qwen' | 'ollama';
  goWildMode?: boolean;
  autoScale?: boolean;
  maxAgents?: number;
}

export interface FarmLaunchResult {
  success: boolean;
  farmId: string;
  state?: FarmState;
  error?: string;
}

export class EnhancedFarmLifecycle extends EventEmitter {
  private stateManager: UnifiedRedisStateManager;
  private recoveryInterval: NodeJS.Timeout | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000;
  private readonly HEALTH_CHECK_INTERVAL = 10000;
  private readonly STUCK_THRESHOLD = 300000; // 5 minutes

  constructor() {
    super();
    this.stateManager = new UnifiedRedisStateManager(redis);
    this.initialize();
  }

  private async initialize() {
    // Listen to state manager events
    this.stateManager.on('farms', (event) => {
      this.handleFarmEvent(event);
    });

    this.stateManager.on('agents', (event) => {
      this.handleAgentEvent(event);
    });

    this.stateManager.on('health:check', (health) => {
      this.handleHealthCheck(health);
    });

    // Start recovery and monitoring
    this.startRecoveryMonitoring();
    this.startFarmMonitoring();

    console.log('[EnhancedFarmLifecycle] Initialized');
  }

  /**
   * Launch a new farm with proper state management
   */
  async launchFarm(config: FarmConfig): Promise<FarmLaunchResult> {
    const farmId = uuidv4();
    const processId = uuidv4();
    const sessionId = `farm-${farmId.slice(0, 8)}`;
    const harvestId = uuidv4();

    try {
      // Create farm in Redis with initializing state
      const farmState = await this.stateManager.createFarm({
        name: config.name,
        status: FarmStatus.INITIALIZING,
        agents: [],
        processId,
        sessionId,
        harvestId,
        config: {
          ...config,
          retryCount: 0,
          launchAttempt: 1
        }
      });

      // Transition to launching
      await this.stateManager.updateFarmStatus(farmId, FarmStatus.LAUNCHING);

      // Create tmux session
      const tmuxCreated = await this.createTmuxSession(sessionId);
      if (!tmuxCreated) {
        throw new Error('Failed to create tmux session');
      }

      // Launch agents
      const agentIds = await this.launchAgents(farmId, sessionId, config);
      
      if (agentIds.length === 0) {
        throw new Error('No agents could be launched');
      }

      // Update farm with agent IDs
      farmState.agents = agentIds;
      
      // Transition to running
      await this.stateManager.updateFarmStatus(farmId, FarmStatus.RUNNING);

      // Save to database
      await this.saveFarmToDatabase(farmId, farmState, config);

      // Start heartbeat monitoring
      this.startFarmHeartbeat(farmId);

      this.emit('farm:launched', { farmId, state: farmState });

      return {
        success: true,
        farmId,
        state: farmState
      };
    } catch (error) {
      console.error(`[EnhancedFarmLifecycle] Failed to launch farm:`, error);
      
      // Update state to error
      await this.stateManager.updateFarmStatus(farmId, FarmStatus.ERROR, error.message);
      
      // Attempt recovery
      const recovered = await this.attemptFarmRecovery(farmId, config);
      
      if (recovered) {
        const state = await this.stateManager.getFarmState(farmId);
        return {
          success: true,
          farmId,
          state
        };
      }

      return {
        success: false,
        farmId,
        error: error.message
      };
    }
  }

  /**
   * Stop a farm gracefully
   */
  async stopFarm(farmId: string): Promise<boolean> {
    try {
      const farmState = await this.stateManager.getFarmState(farmId);
      if (!farmState) {
        console.error(`[EnhancedFarmLifecycle] Farm ${farmId} not found`);
        return false;
      }

      // Transition to stopping
      await this.stateManager.updateFarmStatus(farmId, FarmStatus.STOPPING);

      // Stop all agents
      const agents = await this.stateManager.getFarmAgents(farmId);
      for (const agent of agents) {
        await this.stopAgent(agent.id);
      }

      // Kill tmux session
      if (farmState.sessionId) {
        await this.killTmuxSession(farmState.sessionId);
      }

      // Update database
      await this.updateFarmInDatabase(farmId, 'stopped');

      // Transition to stopped
      await this.stateManager.updateFarmStatus(farmId, FarmStatus.STOPPED);

      this.emit('farm:stopped', { farmId });

      return true;
    } catch (error) {
      console.error(`[EnhancedFarmLifecycle] Failed to stop farm ${farmId}:`, error);
      return false;
    }
  }

  /**
   * Recover a stuck or failed farm
   */
  async recoverFarm(farmId: string): Promise<boolean> {
    try {
      const farmState = await this.stateManager.getFarmState(farmId);
      if (!farmState) {
        console.error(`[EnhancedFarmLifecycle] Farm ${farmId} not found`);
        return false;
      }

      console.log(`[EnhancedFarmLifecycle] Attempting to recover farm ${farmId}`);

      // Check if tmux session exists
      const sessionExists = await this.checkTmuxSession(farmState.sessionId);
      
      if (!sessionExists) {
        // Recreate tmux session
        await this.createTmuxSession(farmState.sessionId);
      }

      // Check and recover agents
      const agents = await this.stateManager.getFarmAgents(farmId);
      let recoveredAgents = 0;

      for (const agent of agents) {
        const recovered = await this.recoverAgent(agent, farmState.sessionId);
        if (recovered) recoveredAgents++;
      }

      if (recoveredAgents > 0) {
        // Update farm status
        await this.stateManager.updateFarmStatus(farmId, FarmStatus.RUNNING);
        
        // Increment reconnect count
        farmState.config.reconnectCount = (farmState.config.reconnectCount || 0) + 1;
        
        this.emit('farm:recovered', { farmId, recoveredAgents });
        return true;
      }

      return false;
    } catch (error) {
      console.error(`[EnhancedFarmLifecycle] Failed to recover farm ${farmId}:`, error);
      return false;
    }
  }

  /**
   * Private helper methods
   */

  private async createTmuxSession(sessionId: string): Promise<boolean> {
    try {
      // Check if session already exists
      const { stdout } = await execAsync(`tmux has-session -t ${sessionId} 2>/dev/null || echo "not found"`);
      
      if (!stdout.includes('not found')) {
        console.log(`[EnhancedFarmLifecycle] Tmux session ${sessionId} already exists`);
        return true;
      }

      // Create new session
      await execAsync(`tmux new-session -d -s ${sessionId}`);
      console.log(`[EnhancedFarmLifecycle] Created tmux session ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`[EnhancedFarmLifecycle] Failed to create tmux session:`, error);
      return false;
    }
  }

  private async checkTmuxSession(sessionId: string): Promise<boolean> {
    try {
      await execAsync(`tmux has-session -t ${sessionId} 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  private async killTmuxSession(sessionId: string): Promise<void> {
    try {
      await execAsync(`tmux kill-session -t ${sessionId} 2>/dev/null`);
      console.log(`[EnhancedFarmLifecycle] Killed tmux session ${sessionId}`);
    } catch (error) {
      // Session might not exist, which is fine
      console.log(`[EnhancedFarmLifecycle] Tmux session ${sessionId} not found or already killed`);
    }
  }

  private async launchAgents(farmId: string, sessionId: string, config: FarmConfig): Promise<string[]> {
    const agentIds: string[] = [];
    
    for (let i = 0; i < config.agentCount; i++) {
      try {
        const agent = await this.stateManager.createAgent({
          farmId,
          name: `Agent-${i + 1}`,
          status: 'initializing',
          tmuxPane: `${sessionId}:0.${i}`
        });

        // Create tmux pane for agent
        if (i > 0) {
          await execAsync(`tmux split-window -t ${sessionId}:0 -h`);
        }

        // Launch agent process (simplified - actual implementation would start the agent)
        await execAsync(`tmux send-keys -t ${sessionId}:0.${i} "echo 'Agent ${agent.id} started'" Enter`);

        // Update agent status
        await this.stateManager.updateAgentStatus(agent.id, 'ready');
        
        agentIds.push(agent.id);
      } catch (error) {
        console.error(`[EnhancedFarmLifecycle] Failed to launch agent ${i}:`, error);
      }
    }

    return agentIds;
  }

  private async stopAgent(agentId: string): Promise<void> {
    try {
      await this.stateManager.updateAgentStatus(agentId, 'stopped');
      // Additional cleanup if needed
    } catch (error) {
      console.error(`[EnhancedFarmLifecycle] Failed to stop agent ${agentId}:`, error);
    }
  }

  private async recoverAgent(agent: AgentState, sessionId: string): Promise<boolean> {
    try {
      // Check if pane exists
      const paneExists = await this.checkTmuxPane(agent.tmuxPane);
      
      if (!paneExists) {
        // Recreate pane
        await execAsync(`tmux split-window -t ${sessionId}:0 -h`);
      }

      // Restart agent process
      await execAsync(`tmux send-keys -t ${agent.tmuxPane} "echo 'Agent ${agent.id} recovered'" Enter`);
      
      // Update agent status
      await this.stateManager.updateAgentStatus(agent.id, 'ready');
      
      return true;
    } catch (error) {
      console.error(`[EnhancedFarmLifecycle] Failed to recover agent ${agent.id}:`, error);
      return false;
    }
  }

  private async checkTmuxPane(pane: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`tmux list-panes -t ${pane} 2>/dev/null`);
      return stdout.length > 0;
    } catch {
      return false;
    }
  }

  private async attemptFarmRecovery(farmId: string, config: FarmConfig): Promise<boolean> {
    const maxRetries = this.MAX_RETRIES;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      console.log(`[EnhancedFarmLifecycle] Recovery attempt ${attempt}/${maxRetries} for farm ${farmId}`);
      
      await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      
      const recovered = await this.recoverFarm(farmId);
      if (recovered) {
        return true;
      }
    }

    return false;
  }

  private startFarmHeartbeat(farmId: string) {
    const interval = setInterval(async () => {
      try {
        const farmState = await this.stateManager.getFarmState(farmId);
        if (!farmState || farmState.status === FarmStatus.STOPPED) {
          clearInterval(interval);
          return;
        }

        await this.stateManager.recordFarmHeartbeat(farmId);
      } catch (error) {
        console.error(`[EnhancedFarmLifecycle] Heartbeat error for farm ${farmId}:`, error);
      }
    }, 30000); // Every 30 seconds
  }

  private async saveFarmToDatabase(farmId: string, state: FarmState, config: FarmConfig) {
    try {
      await db.query(
        `INSERT INTO farms (id, name, description, status, config, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [farmId, config.name, config.description, 'running', JSON.stringify(config), 'system']
      );
    } catch (error) {
      console.error(`[EnhancedFarmLifecycle] Failed to save farm to database:`, error);
    }
  }

  private async updateFarmInDatabase(farmId: string, status: string) {
    try {
      await db.query(
        `UPDATE farms SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, farmId]
      );
    } catch (error) {
      console.error(`[EnhancedFarmLifecycle] Failed to update farm in database:`, error);
    }
  }

  /**
   * Monitoring and recovery loops
   */

  private startRecoveryMonitoring() {
    this.recoveryInterval = setInterval(async () => {
      try {
        const activeFarms = await this.stateManager.getActiveFarms();
        
        for (const farm of activeFarms) {
          if (farm.status === FarmStatus.ERROR || farm.status === FarmStatus.TIMEOUT) {
            console.log(`[EnhancedFarmLifecycle] Found failed farm ${farm.id}, attempting recovery`);
            await this.recoverFarm(farm.id);
          }
        }
      } catch (error) {
        console.error('[EnhancedFarmLifecycle] Recovery monitoring error:', error);
      }
    }, 60000); // Every minute
  }

  private startFarmMonitoring() {
    this.monitoringInterval = setInterval(async () => {
      try {
        const activeFarms = await this.stateManager.getActiveFarms();
        const now = Date.now();
        
        for (const farm of activeFarms) {
          // Check for stuck farms
          if (farm.metrics.heartbeatTime) {
            const lastHeartbeat = new Date(farm.metrics.heartbeatTime).getTime();
            const timeSinceHeartbeat = now - lastHeartbeat;
            
            if (timeSinceHeartbeat > this.STUCK_THRESHOLD) {
              console.log(`[EnhancedFarmLifecycle] Farm ${farm.id} appears stuck (no heartbeat for ${timeSinceHeartbeat}ms)`);
              
              // Attempt recovery
              const recovered = await this.recoverFarm(farm.id);
              
              if (!recovered) {
                // Mark as timeout if recovery fails
                await this.stateManager.updateFarmStatus(farm.id, FarmStatus.TIMEOUT);
              }
            }
          }
          
          // Check timeout
          if (farm.config.timeout) {
            const runtime = now - new Date(farm.metrics.startTime).getTime();
            if (runtime > farm.config.timeout * 1000) {
              console.log(`[EnhancedFarmLifecycle] Farm ${farm.id} exceeded timeout`);
              await this.stopFarm(farm.id);
            }
          }
        }
      } catch (error) {
        console.error('[EnhancedFarmLifecycle] Monitoring error:', error);
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private handleFarmEvent(event: any) {
    switch (event.type) {
      case 'farm:created':
        console.log(`[EnhancedFarmLifecycle] Farm created: ${event.farmId}`);
        break;
      case 'farm:status:changed':
        console.log(`[EnhancedFarmLifecycle] Farm ${event.farmId} status changed: ${event.oldStatus} -> ${event.newStatus}`);
        break;
      case 'health:alert':
        console.warn('[EnhancedFarmLifecycle] Health alert:', event.health);
        break;
    }
  }

  private handleAgentEvent(event: any) {
    switch (event.type) {
      case 'agent:created':
        console.log(`[EnhancedFarmLifecycle] Agent created: ${event.agentId} for farm ${event.farmId}`);
        break;
      case 'agent:status:changed':
        console.log(`[EnhancedFarmLifecycle] Agent ${event.agentId} status changed to ${event.status}`);
        break;
    }
  }

  private handleHealthCheck(health: any) {
    if (health.farms.stuck > 0) {
      console.warn(`[EnhancedFarmLifecycle] ${health.farms.stuck} farms are stuck`);
    }
    if (health.farms.errors > 0) {
      console.warn(`[EnhancedFarmLifecycle] ${health.farms.errors} farms have errors`);
    }
    if (health.connections.degraded > 0) {
      console.warn(`[EnhancedFarmLifecycle] ${health.connections.degraded} connections are degraded`);
    }
  }

  /**
   * Cleanup
   */

  async destroy() {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
    }
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    await this.stateManager.destroy();
    this.removeAllListeners();
    
    console.log('[EnhancedFarmLifecycle] Destroyed');
  }
}

// Export singleton instance
export const enhancedFarmLifecycle = new EnhancedFarmLifecycle();