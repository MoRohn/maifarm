import { create } from 'zustand';
import { Agent } from '@/types';
import { AgentInstance } from '@/types/agent';
import { agentService, CreateAgentParams, UpdateAgentParams, AgentMetrics } from '@/services/agentService';

interface AgentStore {
  agents: AgentInstance[];
  selectedAgent: AgentInstance | null;
  agentMetrics: Record<string, AgentMetrics>;
  loading: boolean;
  error: string | null;

  // Actions
  fetchAgents: () => Promise<void>;
  selectAgent: (agent: AgentInstance | null) => void;
  createAgent: (params: CreateAgentParams) => Promise<AgentInstance>;
  updateAgent: (instanceId: string, updates: Partial<AgentInstance>) => void;
  addAgent: (agent: AgentInstance) => void;
  removeAgent: (instanceId: string) => void;
  deleteAgent: (id: string) => Promise<void>;
  assignTask: (agentId: string, task: string) => Promise<void>;
  pauseAgent: (id: string) => Promise<void>;
  resumeAgent: (id: string) => Promise<void>;
  restartAgent: (id: string) => Promise<void>;
  fetchAgentMetrics: (id: string) => Promise<void>;
  updateAgentFromWebSocket: (agent: Partial<AgentInstance>) => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  selectedAgent: null,
  agentMetrics: {},
  loading: false,
  error: null,

  fetchAgents: async () => {
    set({ loading: true, error: null });
    try {
      const agents = await agentService.getAgents();
      set({ agents, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  selectAgent: (agent) => {
    set({ selectedAgent: agent });
    if (agent) {
      get().fetchAgentMetrics(agent.id);
    }
  },

  createAgent: async (params) => {
    set({ loading: true, error: null });
    try {
      const newAgent = await agentService.createAgent(params);
      set(state => ({
        agents: [...state.agents, newAgent],
        loading: false
      }));
      return newAgent;
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  updateAgent: (instanceId, updates) => {
    set(state => ({
      agents: state.agents.map(agent =>
        agent.instanceId === instanceId ? { ...agent, ...updates } : agent
      ),
      // FIX: Ensure selectedAgent is non-null before spreading
      selectedAgent: state.selectedAgent && state.selectedAgent.instanceId === instanceId
        ? { ...state.selectedAgent, ...updates }
        : state.selectedAgent
    }));
  },

  addAgent: (agent) => {
    set(state => ({
      agents: [...state.agents, agent]
    }));
  },

  removeAgent: (instanceId) => {
    set(state => ({
      agents: state.agents.filter(agent => agent.instanceId !== instanceId),
      selectedAgent: state.selectedAgent?.instanceId === instanceId ? null : state.selectedAgent
    }));
  },

  deleteAgent: async (id) => {
    try {
      await agentService.deleteAgent(id);
      set(state => ({
        agents: state.agents.filter(agent => agent.id !== id),
        selectedAgent: state.selectedAgent?.id === id ? null : state.selectedAgent
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  assignTask: async (agentId, task) => {
    try {
      const updatedAgent = await agentService.assignTask(agentId, task);
      set(state => ({
        agents: state.agents.map(agent => 
          agent.id === agentId ? updatedAgent : agent
        )
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  pauseAgent: async (id) => {
    try {
      const updatedAgent = await agentService.pauseAgent(id);
      set(state => ({
        agents: state.agents.map(agent => 
          agent.id === id ? updatedAgent : agent
        )
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  resumeAgent: async (id) => {
    try {
      const updatedAgent = await agentService.resumeAgent(id);
      set(state => ({
        agents: state.agents.map(agent => 
          agent.id === id ? updatedAgent : agent
        )
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  restartAgent: async (id) => {
    try {
      const updatedAgent = await agentService.restartAgent(id);
      set(state => ({
        agents: state.agents.map(agent => 
          agent.id === id ? updatedAgent : agent
        )
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  fetchAgentMetrics: async (id) => {
    try {
      const metrics = await agentService.getAgentMetrics(id);
      set(state => ({
        agentMetrics: {
          ...state.agentMetrics,
          [id]: metrics
        }
      }));
    } catch (error) {
      console.error('Failed to fetch agent metrics:', error);
    }
  },

  updateAgentFromWebSocket: (agent) => {
    set(state => ({
      agents: state.agents.map(a => 
        a.id === agent.id ? { ...a, ...agent } as AgentInstance : a
      ),
      selectedAgent: state.selectedAgent?.id === agent.id 
        ? { ...state.selectedAgent, ...agent } as AgentInstance 
        : state.selectedAgent
    }));
  }
}));