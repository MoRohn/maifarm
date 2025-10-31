import { useState, useEffect, useCallback } from 'react';
import { Agent, AgentStatus, AgentLifecycle, Task } from '@/types/orchestration';
import { AgentInstance, AgentHealth } from '@/types/agent';
import { agentLifecycle } from '@/services/agentLifecycle';
import { websocketService } from '@/services/websocket';
import { useAgentStore } from '@/store/agentStore';

interface UseAgentLifecycleReturn {
  agents: Agent[];
  agentsByFarm: Map<string, Agent[]>;
  isProvisioning: boolean;
  isTerminating: boolean;
  error: string | null;
  provisionAgent: (farmId: string, type: string, count?: number) => Promise<Agent[]>;
  terminateAgent: (agentId: string) => Promise<void>;
  scaleAgents: (farmId: string, delta: number) => Promise<Agent[]>;
  assignTask: (agentId: string, task: Partial<Task>) => Promise<Task>;
  getAgentHealth: (agentId: string) => Promise<AgentHealth>;
  getAgentMetrics: (agentId: string) => AgentMetrics | null;
}

interface AgentMetrics {
  taskThroughput: number;
  successRate: number;
  avgResponseTime: number;
  resourceEfficiency: number;
}

export function useAgentLifecycle(): UseAgentLifecycleReturn {
  const { agents } = useAgentStore();
  const [agentsByFarm, setAgentsByFarm] = useState<Map<string, Agent[]>>(new Map());
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentMetrics, setAgentMetrics] = useState<Map<string, AgentMetrics>>(new Map());

  useEffect(() => {
    // Group agents by farm
    const grouped = new Map<string, Agent[]>();
    agents.forEach(agent => {
      if ('farmId' in agent && agent.farmId) {
        const farmAgents = grouped.get(agent.farmId) || [];
        farmAgents.push(agent as Agent);
        grouped.set(agent.farmId, farmAgents);
      }
    });
    setAgentsByFarm(grouped);
  }, [agents]);

  useEffect(() => {
    // Subscribe to WebSocket events
    websocketService.on('agent:provisioned', handleAgentProvisioned);
    websocketService.on('agent:terminated', handleAgentTerminated);
    websocketService.on('agent:status_changed', handleAgentStatusChanged);
    websocketService.on('task:completed', handleTaskCompleted);
    websocketService.on('task:failed', handleTaskFailed);

    return () => {
      // Unsubscribe from WebSocket events
      websocketService.off('agent:provisioned', handleAgentProvisioned);
      websocketService.off('agent:terminated', handleAgentTerminated);
      websocketService.off('agent:status_changed', handleAgentStatusChanged);
      websocketService.off('task:completed', handleTaskCompleted);
      websocketService.off('task:failed', handleTaskFailed);
    };
  }, []);

  const handleAgentProvisioned = (data: any) => {
    const agentStore = useAgentStore.getState();
    // Agent already added by the service
    setIsProvisioning(false);
  };

  const handleAgentTerminated = (data: any) => {
    const agentStore = useAgentStore.getState();
    // Agent already removed by the service
    setIsTerminating(false);
  };

  const handleAgentStatusChanged = (data: any) => {
    const agentStore = useAgentStore.getState();
    const agent = agentStore.agents.find(a => a.id === data.agentId);
    if (agent) {
      // Update agent status in store
      agentStore.updateAgent(agent.id, { status: data.status });
    }
  };

  const handleTaskCompleted = (data: any) => {
    updateAgentMetrics(data.agentId, { success: true, duration: data.duration });
  };

  const handleTaskFailed = (data: any) => {
    updateAgentMetrics(data.agentId, { success: false });
  };

  const updateAgentMetrics = (agentId: string, taskResult: any) => {
    setAgentMetrics(prev => {
      const current = prev.get(agentId) || {
        taskThroughput: 0,
        successRate: 100,
        avgResponseTime: 0,
        resourceEfficiency: 100
      };

      const updated = { ...current };
      
      // Update throughput (tasks per minute)
      updated.taskThroughput = (updated.taskThroughput * 0.9) + (taskResult.success ? 0.1 : 0);
      
      // Update success rate
      if (taskResult.success !== undefined) {
        updated.successRate = (updated.successRate * 0.95) + (taskResult.success ? 5 : 0);
      }
      
      // Update response time
      if (taskResult.duration) {
        updated.avgResponseTime = (updated.avgResponseTime * 0.9) + (taskResult.duration * 0.1);
      }

      const next = new Map(prev);
      next.set(agentId, updated);
      return next;
    });
  };

  const provisionAgent = useCallback(async (
    farmId: string,
    type: string,
    count: number = 1
  ): Promise<Agent[]> => {
    setIsProvisioning(true);
    setError(null);

    try {
      const agents: Agent[] = [];
      
      const instances = await agentLifecycle.provisionAgent({
        poolId: farmId, // Using farmId as poolId for now
        count: count,
        agentType: type as Agent['type'],
        capabilities: getCapabilitiesForType(type),
        resources: getResourcesForType(type)
      });
      
      // Convert AgentInstances to Agents
      instances.forEach(instance => {
        agents.push({
          ...instance,
          cpu: instance.resources?.cpu?.allocated || 2,
          memory: instance.resources?.memory?.allocated || 4,
          progress: 0,
          lastActive: instance.lastHealthCheck || new Date()
        } as Agent);
      });

      return agents;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to provision agent');
      throw err;
    } finally {
      setIsProvisioning(false);
    }
  }, []);

  const terminateAgent = useCallback(async (agentId: string): Promise<void> => {
    setIsTerminating(true);
    setError(null);

    try {
      await agentLifecycle.terminateAgent(agentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to terminate agent');
      throw err;
    } finally {
      setIsTerminating(false);
    }
  }, []);

  const scaleAgents = useCallback(async (
    farmId: string,
    delta: number
  ): Promise<Agent[]> => {
    setError(null);

    try {
      return await agentLifecycle.scaleAgents(farmId, delta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scale agents');
      throw err;
    }
  }, []);

  const assignTask = useCallback(async (
    agentId: string,
    task: Partial<Task>
  ): Promise<Task> => {
    setError(null);

    try {
      const agentTask = await agentLifecycle.assignTask(agentId, {
        type: (task.type as 'custom' | 'build' | 'test' | 'deploy' | 'analyze') || 'custom',
        priority: task.priority || 'medium',
        payload: task.payload || {}
      });
      
      // Convert AgentTask to Task
      return {
        ...agentTask,
        retries: agentTask.retryCount,
        workflowId: task.workflowId
      } as Task;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign task');
      throw err;
    }
  }, []);

  const getAgentHealth = useCallback(async (
    agentId: string
  ): Promise<AgentHealth> => {
    try {
      return await agentLifecycle.getAgentHealth(agentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get agent health');
      throw err;
    }
  }, []);

  const getAgentMetrics = useCallback((agentId: string): AgentMetrics | null => {
    return agentMetrics.get(agentId) || null;
  }, [agentMetrics]);

  return {
    agents,
    agentsByFarm,
    isProvisioning,
    isTerminating,
    error,
    provisionAgent,
    terminateAgent,
    scaleAgents,
    assignTask,
    getAgentHealth,
    getAgentMetrics
  };
}

// Helper functions
function getCapabilitiesForType(type: string): string[] {
  const capabilityMap: Record<string, string[]> = {
    general: ['task_execution', 'code_generation', 'analysis'],
    builder: ['code_generation', 'compilation', 'testing'],
    tester: ['testing', 'validation', 'quality_assurance'],
    analyzer: ['data_analysis', 'reporting', 'visualization'],
    coordinator: ['planning', 'orchestration', 'monitoring']
  };

  return capabilityMap[type] || capabilityMap.general;
}

function getResourcesForType(type: string): any {
  const resourceMap: Record<string, any> = {
    general: { cpu: 1, memory: 2048, storage: 5120 },
    builder: { cpu: 2, memory: 4096, storage: 10240 },
    tester: { cpu: 1, memory: 2048, storage: 5120 },
    analyzer: { cpu: 2, memory: 8192, storage: 20480 },
    coordinator: { cpu: 1, memory: 1024, storage: 2048 }
  };

  return resourceMap[type] || resourceMap.general;
}