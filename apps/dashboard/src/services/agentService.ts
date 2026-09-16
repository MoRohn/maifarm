import { Agent } from '@/types';
import { AgentInstance, AgentState, AgentHealth } from '@/types/agent';

export interface CreateAgentParams {
  name: string;
  type: Agent['type'];
  capabilities: string[];
}

export interface UpdateAgentParams {
  name?: string;
  status?: Agent['status'];
  currentTask?: string;
  progress?: number;
}

export interface AgentMetrics {
  tasksCompleted: number;
  avgTaskTime: number;
  successRate: number;
  resourceEfficiency: number;
  collaborationScore: number;
}

class AgentService {
  private baseUrl = '/api/agents';

  async getAgents(): Promise<AgentInstance[]> {
    // Mock implementation for now
    const mockAgents: AgentInstance[] = [
      {
        id: '1',
        instanceId: 'instance-1',
        poolId: 'pool-1',
        farmId: 'pool-1',
        agentNumber: 1,
        createdAt: new Date(Date.now() - 3600000),
        updatedAt: new Date(),
        name: 'Code Builder Alpha',
        type: 'builder',
        status: 'working',
        progress: 65,
        currentTask: 'Implementing user authentication module',
        memory: 45,
        cpu: 72,
        lastActive: new Date(),
        capabilities: ['React', 'TypeScript', 'Node.js', 'Authentication'],
        state: {
          current: 'busy',
          transitionTime: new Date()
        },
        health: {
          status: 'healthy',
          checks: [],
          lastCheck: new Date(),
          consecutiveFailures: 0
        },
        resources: {
          cpu: { allocated: 2, used: 1.44, limit: 4 },
          memory: { allocated: 2048, used: '922MB', limit: 4096 },
        },
        assignedTasks: ['task-1'],
        startTime: new Date(Date.now() - 3600000),
        lastHealthCheck: new Date(),
        restartCount: 0,
        metadata: {}
      },
      {
        id: '2',
        instanceId: 'instance-2',
        poolId: 'pool-1',
        farmId: 'pool-1',
        agentNumber: 2,
        createdAt: new Date(Date.now() - 7200000),
        updatedAt: new Date(),
        name: 'Test Runner Beta',
        type: 'tester',
        status: 'idle',
        progress: 100,
        memory: 32,
        cpu: 15,
        lastActive: new Date(Date.now() - 5 * 60 * 1000),
        capabilities: ['Jest', 'Cypress', 'Unit Testing', 'E2E Testing'],
        state: {
          current: 'idle',
          transitionTime: new Date()
        },
        health: {
          status: 'healthy',
          checks: [],
          lastCheck: new Date(),
          consecutiveFailures: 0
        },
        resources: {
          cpu: { allocated: 2, used: 0.3, limit: 4 },
          memory: { allocated: 2048, used: '655MB', limit: 4096 },
        },
        assignedTasks: [],
        startTime: new Date(Date.now() - 7200000),
        lastHealthCheck: new Date(),
        restartCount: 0,
        metadata: {}
      },
      {
        id: '3',
        instanceId: 'instance-3',
        poolId: 'pool-1',
        farmId: 'pool-1',
        agentNumber: 3,
        createdAt: new Date(Date.now() - 5400000),
        updatedAt: new Date(),
        name: 'Code Reviewer Gamma',
        type: 'reviewer',
        status: 'working',
        progress: 40,
        currentTask: 'Reviewing PR #125: Add payment processing',
        memory: 28,
        cpu: 35,
        lastActive: new Date(),
        capabilities: ['Code Review', 'Best Practices', 'Security Analysis'],
        state: {
          current: 'busy',
          transitionTime: new Date()
        },
        health: {
          status: 'healthy',
          checks: [],
          lastCheck: new Date(),
          consecutiveFailures: 0
        },
        resources: {
          cpu: { cores: 2, usage: 35, allocated: 2, used: 0.7, limit: 4 },
          memory: { total: '4096MB', used: '573MB', usage: 14, allocated: 2048, limit: 4096 },
          network: { inbound: '100MB', outbound: '50MB' },
          cpuUsage: 35,
          memoryUsage: 14,
          allocated: { cpu: 2, memory: 2048 },
          used: { cpu: 0.7, memory: 573.44 },
          limits: { cpu: 4, memory: 4096 }
        },
        assignedTasks: ['task-2'],
        startTime: new Date(Date.now() - 5400000),
        lastHealthCheck: new Date(),
        restartCount: 0,
        metadata: {}
      }
    ];
    return mockAgents;
  }

  async getAgent(id: string): Promise<AgentInstance | null> {
    const agents = await this.getAgents();
    return agents.find(agent => agent.id === id) || null;
  }

  async createAgent(params: CreateAgentParams): Promise<AgentInstance> {
    // Mock implementation
    const newAgent: AgentInstance = {
      id: Date.now().toString(),
      instanceId: `instance-${Date.now().toString()}`,
      poolId: 'pool-1',
      farmId: 'pool-1',
      agentNumber: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: params.name,
      type: params.type,
      status: 'idle',
      progress: 0,
      memory: 0,
      cpu: 0,
      lastActive: new Date(),
      capabilities: params.capabilities,
      state: {
        current: 'initializing',
        transitionTime: new Date()
      },
      health: {
        status: 'healthy',
        checks: [],
        lastCheck: new Date(),
        consecutiveFailures: 0
      },
      resources: {
        cpu: { cores: 2, usage: 0, allocated: 2, used: 0, limit: 4 },
        memory: { total: '4096MB', used: '0MB', usage: 0, allocated: 2048, limit: 4096 },
        network: { inbound: '0MB', outbound: '0MB' },
        cpuUsage: 0,
        memoryUsage: 0,
        allocated: { cpu: 2, memory: 2048 },
        used: { cpu: 0, memory: 0 },
        limits: { cpu: 4, memory: 4096 }
      },
      assignedTasks: [],
      startTime: new Date(),
      lastHealthCheck: new Date(),
      restartCount: 0,
      metadata: {}
    };

    // In real implementation, this would make an API call
    console.log('Creating agent:', newAgent);
    return newAgent;
  }

  async updateAgent(id: string, params: UpdateAgentParams): Promise<AgentInstance> {
    const agent = await this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} not found`);
    }

    const updatedAgent = {
      ...agent,
      ...params,
      lastActive: new Date()
    };

    // In real implementation, this would make an API call
    console.log('Updating agent:', updatedAgent);
    return updatedAgent;
  }

  async deleteAgent(id: string): Promise<void> {
    // In real implementation, this would make an API call
    console.log('Deleting agent:', id);
  }

  async assignTask(agentId: string, task: string): Promise<AgentInstance> {
    return this.updateAgent(agentId, {
      status: 'working',
      currentTask: task,
      progress: 0
    });
  }

  async getAgentMetrics(id: string): Promise<AgentMetrics> {
    // Mock implementation
    return {
      tasksCompleted: Math.floor(Math.random() * 100),
      avgTaskTime: 45 + Math.random() * 30,
      successRate: 85 + Math.random() * 10,
      resourceEfficiency: 70 + Math.random() * 20,
      collaborationScore: 75 + Math.random() * 15
    };
  }

  async pauseAgent(id: string): Promise<AgentInstance> {
    return this.updateAgent(id, { status: 'paused' });
  }

  async resumeAgent(id: string): Promise<AgentInstance> {
    return this.updateAgent(id, { status: 'working' });
  }

  async restartAgent(id: string): Promise<AgentInstance> {
    const agent = await this.getAgent(id);
    if (!agent) {
      throw new Error(`Agent ${id} not found`);
    }

    // Reset agent state
    return this.updateAgent(id, {
      status: 'idle',
      progress: 0,
      currentTask: undefined
    });
  }

  subscribeToAgentUpdates(callback: (agent: AgentInstance) => void): () => void {
    // Mock implementation with simulated updates
    const interval = setInterval(() => {
      this.getAgents().then(agents => {
        const randomAgent = agents[Math.floor(Math.random() * agents.length)];
        if (randomAgent.status === 'working' && randomAgent.progress < 100) {
          randomAgent.progress = Math.min(100, randomAgent.progress + Math.random() * 10);
          randomAgent.cpu = 30 + Math.random() * 50;
          randomAgent.memory = 20 + Math.random() * 40;
          randomAgent.lastActive = new Date();
          
          if (randomAgent.progress >= 100) {
            randomAgent.status = 'completed';
            randomAgent.currentTask = undefined;
          }
          
          callback(randomAgent);
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }
}

export const agentService = new AgentService();