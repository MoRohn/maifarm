import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Agent, AgentStatus } from '../types/farm';

interface AgentCreateInput {
  name: string;
  type: string;
  capabilities: string[];
  farmId: string;
  config: any;
}

class AgentManager extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private agentTasks: Map<string, Set<string>> = new Map();

  async createAgent(input: AgentCreateInput): Promise<Agent> {
    const agentId = uuidv4();

    const agent: Agent = {
      id: agentId,
      name: input.name,
      type: input.type,
      status: 'idle',
      capabilities: input.capabilities,
      farmId: input.farmId,
      config: input.config,
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageResponseTime: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.agents.set(agentId, agent);
    this.agentTasks.set(agentId, new Set());

    this.emit('agent:created', agent);

    return agent;
  }

  async startAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    if (agent.status === 'running') return true;

    agent.status = 'running';
    agent.updatedAt = new Date();
    agent.metrics!.lastActiveAt = new Date();

    this.emit('agent:statusChanged', agentId, 'running');

    // Simulate agent initialization
    setTimeout(() => {
      this.emit('agent:initialized', agentId);
    }, 100);

    return true;
  }

  async stopAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    if (agent.status === 'idle') return true;

    agent.status = 'idle';
    agent.updatedAt = new Date();

    // Clear any running tasks
    const tasks = this.agentTasks.get(agentId);
    if (tasks) {
      tasks.clear();
    }

    this.emit('agent:statusChanged', agentId, 'idle');

    return true;
  }

  async assignTask(agentId: string, taskId: string, task: any): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== 'running') return false;

    const tasks = this.agentTasks.get(agentId);
    if (!tasks) return false;

    tasks.add(taskId);
    agent.metrics!.lastActiveAt = new Date();

    this.emit('agent:taskAssigned', agentId, taskId, task);

    // Simulate task processing
    this.simulateTaskProcessing(agentId, taskId);

    return true;
  }

  private async simulateTaskProcessing(agentId: string, taskId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const processingTime = Math.random() * 5000 + 1000; // 1-6 seconds

    setTimeout(() => {
      const tasks = this.agentTasks.get(agentId);
      if (!tasks || !tasks.has(taskId)) return;

      tasks.delete(taskId);

      // Update metrics
      const success = Math.random() > 0.1; // 90% success rate
      if (success) {
        agent.metrics!.tasksCompleted++;
      } else {
        agent.metrics!.tasksFailed++;
      }

      // Update average response time
      const currentAvg = agent.metrics!.averageResponseTime;
      const totalTasks = agent.metrics!.tasksCompleted + agent.metrics!.tasksFailed;
      agent.metrics!.averageResponseTime = 
        (currentAvg * (totalTasks - 1) + processingTime) / totalTasks;

      agent.updatedAt = new Date();

      this.emit('agent:taskCompleted', agentId, taskId, {
        success,
        duration: processingTime
      });
    }, processingTime);
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgentsByFarm(farmId: string): Agent[] {
    const farmAgents: Agent[] = [];
    for (const agent of this.agents.values()) {
      if (agent.farmId === farmId) {
        farmAgents.push(agent);
      }
    }
    return farmAgents;
  }

  getAgentMetrics(agentId: string): any {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    const activeTasks = this.agentTasks.get(agentId)?.size || 0;

    return {
      ...agent.metrics,
      activeTasks,
      status: agent.status,
      uptime: Date.now() - agent.createdAt.getTime()
    };
  }

  async removeAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    // Stop the agent first
    await this.stopAgent(agentId);

    // Remove from maps
    this.agents.delete(agentId);
    this.agentTasks.delete(agentId);

    this.emit('agent:removed', agentId, agent.farmId);
    return true;
  }

  async removeAgentsByFarmId(farmId: string): Promise<number> {
    let removedCount = 0;
    const agentsToRemove: string[] = [];

    // Find all agents belonging to this farm
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.farmId === farmId) {
        agentsToRemove.push(agentId);
      }
    }

    // Remove each agent
    for (const agentId of agentsToRemove) {
      if (await this.removeAgent(agentId)) {
        removedCount++;
      }
    }

    console.log(`[AgentManager] Removed ${removedCount} agents from farm ${farmId}`);
    this.emit('farm:agents:cleared', { farmId, removedCount, agentIds: agentsToRemove });
    this.emit('agents:removed', farmId, removedCount);
    return removedCount;
  }

  /**
   * Synchronize agents with database state
   */
  async syncWithDatabase(): Promise<void> {
    try {
      const { db } = require('../database/connection');
      
      // Get all agents from database
      const dbAgents = await db.query('SELECT id, farm_id, name, status FROM agents');
      const dbAgentIds = new Set(dbAgents.rows.map(row => row.id));
      
      // Remove agents from memory that no longer exist in database
      const memoryAgentIds = Array.from(this.agents.keys());
      for (const agentId of memoryAgentIds) {
        if (!dbAgentIds.has(agentId)) {
          console.log(`[AgentManager] Removing orphaned agent from memory: ${agentId}`);
          this.agents.delete(agentId);
          this.agentTasks.delete(agentId);
          this.emit('agent:orphaned', agentId);
        }
      }
      
      // Update agent statuses based on database
      for (const dbAgent of dbAgents.rows) {
        const memoryAgent = this.agents.get(dbAgent.id);
        if (memoryAgent && memoryAgent.status !== dbAgent.status) {
          console.log(`[AgentManager] Syncing agent ${dbAgent.id} status: ${memoryAgent.status} -> ${dbAgent.status}`);
          memoryAgent.status = dbAgent.status;
          memoryAgent.updatedAt = new Date();
          this.emit('agent:statusChanged', dbAgent.id, dbAgent.status);
        }
      }
      
      console.log(`[AgentManager] Synchronized ${dbAgents.rows.length} agents with database`);
    } catch (error) {
      console.error('[AgentManager] Failed to sync with database:', error);
    }
  }

  /**
   * Get mapping of farms to their agents
   */
  getFarmAgentMapping(): Map<string, string[]> {
    const mapping = new Map<string, string[]>();
    
    for (const agent of this.agents.values()) {
      if (!mapping.has(agent.farmId)) {
        mapping.set(agent.farmId, []);
      }
      mapping.get(agent.farmId)!.push(agent.id);
    }
    
    return mapping;
  }

  /**
   * Validate farm-agent relationships
   */
  async validateFarmAgentRelationships(): Promise<{ orphanedAgents: string[], invalidFarms: string[] }> {
    try {
      const { db } = require('../database/connection');
      
      // Get all valid farm IDs
      const validFarms = await db.query('SELECT id FROM farms');
      const validFarmIds = new Set(validFarms.rows.map(row => row.id));
      
      const orphanedAgents: string[] = [];
      const invalidFarms: string[] = [];
      
      // Check each agent's farm association
      for (const agent of this.agents.values()) {
        if (!validFarmIds.has(agent.farmId)) {
          orphanedAgents.push(agent.id);
          if (!invalidFarms.includes(agent.farmId)) {
            invalidFarms.push(agent.farmId);
          }
        }
      }
      
      if (orphanedAgents.length > 0) {
        console.warn(`[AgentManager] Found ${orphanedAgents.length} orphaned agents with invalid farm IDs`);
        this.emit('validation:orphaned_agents', { orphanedAgents, invalidFarms });
      }
      
      return { orphanedAgents, invalidFarms };
    } catch (error) {
      console.error('[AgentManager] Failed to validate farm-agent relationships:', error);
      return { orphanedAgents: [], invalidFarms: [] };
    }
  }

  // Utility method for testing
  async clearAllAgents(): Promise<void> {
    this.agents.clear();
    this.agentTasks.clear();
  }
}

export const agentManager = new AgentManager();