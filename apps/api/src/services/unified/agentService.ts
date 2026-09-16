/**
 * Unified Agent Service
 * Consolidates agent management, lifecycle, and health monitoring
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger, LogCategory } from '../../utils/logger';
import { UnifiedDatabaseService } from './databaseService';
import { UnifiedMonitoringService } from './monitoringService';
import { UnifiedWebSocketHub } from './websocketHub';
import { BaseService, Agent, AgentStatus, AgentMetrics } from './types';
import { getSimpleAgentName } from '../../utils/farmAgentNames';

export class UnifiedAgentService extends EventEmitter implements BaseService {
  private agents: Map<string, Agent> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timer> = new Map();

  constructor(
    private db: UnifiedDatabaseService,
    private monitoring: UnifiedMonitoringService,
    private websocket: UnifiedWebSocketHub
  ) {
    super();
  }

  async initialize(): Promise<void> {
    logger.info(LogCategory.AGENT, 'Initializing Agent Service');
  }

  async shutdown(): Promise<void> {
    // Clear all health check intervals
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }
    this.healthCheckIntervals.clear();
    this.removeAllListeners();
    logger.info(LogCategory.AGENT, 'Agent Service shut down');
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const activeAgents = this.getActiveAgents();
    return {
      healthy: true,
      message: `${activeAgents.length} active agents`
    };
  }

  getStats(): Record<string, any> {
    const agents = Array.from(this.agents.values());
    return {
      total: agents.length,
      active: agents.filter(a => a.status === 'working').length,
      ready: agents.filter(a => a.status === 'ready').length,
      failed: agents.filter(a => a.status === 'failed').length
    };
  }

  /**
   * Create agents for a farm
   */
  async createAgents(farmId: string, count: number, sessionName: string): Promise<Agent[]> {
    const agents: Agent[] = [];

    for (let i = 0; i < count; i++) {
      const agent: Agent = {
        id: uuidv4(),
        farmId,
        name: getSimpleAgentName(i),  // Fixed: Use simple string name, not JSON object
        type: i === 0 ? 'primary' : 'secondary',  // Fixed: Match database constraint and UnifiedFarmLaunchOrchestrator
        status: 'idle',
        sessionName,
        paneIndex: i,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.db.saveAgent(agent);
      this.agents.set(agent.id, agent);
      agents.push(agent);

      // Start health monitoring
      this.startHealthMonitoring(agent.id);

      logger.debug(LogCategory.AGENT, `Created agent ${i}: ${agent.name} (${agent.type}) for farm ${farmId}`);
    }

    logger.info(LogCategory.AGENT, `Created ${count} agents for farm ${farmId}`);
    return agents;
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = status;
    agent.updatedAt = new Date();
    agent.lastHeartbeat = new Date();

    // Broadcast status update
    this.websocket.broadcast('agent:status', {
      agentId,
      status,
      timestamp: new Date()
    });

    this.emit('agent:status:changed', { agentId, status });
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agents by farm ID
   */
  async getAgentsByFarmId(farmId: string): Promise<Agent[]> {
    const agents = await this.db.getAgentsByFarmId(farmId);
    // Update cache
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }
    return agents;
  }

  /**
   * Stop all agents for a farm
   */
  async stopAllAgents(farmId: string): Promise<void> {
    const agents = await this.getAgentsByFarmId(farmId);

    for (const agent of agents) {
      await this.stopAgent(agent.id);
    }

    logger.info(LogCategory.AGENT, `Stopped all agents for farm ${farmId}`);
  }

  /**
   * Stop a single agent
   */
  async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Stop health monitoring
    this.stopHealthMonitoring(agentId);

    // Update status
    await this.updateAgentStatus(agentId, 'terminated');

    logger.debug(LogCategory.AGENT, `Agent ${agentId} stopped`);
  }

  /**
   * Update agent metrics
   */
  async updateAgentMetrics(agentId: string, metrics: Partial<AgentMetrics>): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.metrics = {
      ...agent.metrics,
      ...metrics
    } as AgentMetrics;

    agent.updatedAt = new Date();

    // Update monitoring metrics
    this.monitoring.updateMetric(`agent.${agentId}.tasks`, metrics.tasksCompleted || 0);
  }

  /**
   * Get active agents
   */
  getActiveAgents(): Agent[] {
    return Array.from(this.agents.values()).filter(
      agent => agent.status === 'working' || agent.status === 'ready'
    );
  }

  // Private methods

  private startHealthMonitoring(agentId: string): void {
    const interval = setInterval(async () => {
      await this.checkAgentHealth(agentId);
    }, 30000); // 30 second intervals

    this.healthCheckIntervals.set(agentId, interval);
  }

  private stopHealthMonitoring(agentId: string): void {
    const interval = this.healthCheckIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(agentId);
    }
  }

  private async checkAgentHealth(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const now = new Date();
    const lastHeartbeat = agent.lastHeartbeat || agent.createdAt;
    const timeSinceHeartbeat = now.getTime() - lastHeartbeat.getTime();

    // If no heartbeat for 2 minutes, mark as failed
    if (timeSinceHeartbeat > 120000) {
      logger.warn(LogCategory.AGENT, `Agent ${agentId} health check failed`);
      await this.updateAgentStatus(agentId, 'failed');
      this.emit('agent:health:failed', { agentId });
    }
  }
}
