/**
 * Agent utility functions for safe property access
 */

import { Agent, AgentInstance, AgentResources } from '@/types/agent';

/**
 * Get CPU usage from agent resources safely
 * @param agent - Agent or AgentInstance
 * @returns CPU usage percentage or 0 if not available
 */
export function getAgentCpuUsage(agent: Agent | AgentInstance | undefined): number {
  if (!agent?.resources) return 0;
  // Handle both flat number and nested object
  if (typeof agent.resources.cpu === 'number') {
    return agent.resources.cpu;
  }
  return (agent.resources.cpu as any)?.usage ?? 0;
}

/**
 * Get memory usage from agent resources safely
 * @param agent - Agent or AgentInstance
 * @returns Memory usage percentage or 0 if not available
 */
export function getAgentMemoryUsage(agent: Agent | AgentInstance | undefined): number {
  if (!agent?.resources) return 0;
  // Handle both flat number and nested object
  if (typeof agent.resources.memory === 'number') {
    return agent.resources.memory;
  }
  return (agent.resources.memory as any)?.usage ?? 0;
}

/**
 * Get agent health status safely
 * @param agent - Agent or AgentInstance
 * @returns Health status or 'unknown' if not available
 */
export function getAgentHealthStatus(agent: Agent | AgentInstance | undefined): string {
  if (!agent) return 'unknown';
  if ('health' in agent && agent.health) {
    // Handle both string and object health
    if (typeof agent.health === 'string') {
      return agent.health;
    }
    return (agent.health as any).status ?? 'unknown';
  }
  return agent?.lifecycle?.health?.status ?? 'unknown';
}

/**
 * Check if agent is healthy
 * @param agent - Agent or AgentInstance
 * @returns True if agent is healthy
 */
export function isAgentHealthy(agent: Agent | AgentInstance | undefined): boolean {
  const status = getAgentHealthStatus(agent);
  return status === 'healthy';
}

/**
 * Get agent task count safely
 * @param agent - Agent or AgentInstance
 * @returns Number of tasks or 0 if not available
 */
export function getAgentTaskCount(agent: Agent | AgentInstance | undefined): number {
  if (!agent) return 0;
  if ('assignedTasks' in agent && agent.assignedTasks) {
    return agent.assignedTasks.length;
  }
  return agent?.tasks?.length ?? 0;
}

/**
 * Ensure agent resources have required properties
 * @param resources - Partial agent resources
 * @returns Complete agent resources with defaults
 */
export function ensureAgentResources(resources?: Partial<AgentResources>): AgentResources {
  return {
    cpu: {
      cores: resources?.cpu?.cores ?? 1,
      usage: resources?.cpu?.usage ?? 0,
      allocated: resources?.cpu?.allocated ?? 0,
      used: resources?.cpu?.used ?? 0,
      limit: resources?.cpu?.limit ?? 100
    },
    memory: {
      total: resources?.memory?.total ?? '1Gi',
      used: resources?.memory?.used ?? '0Mi',
      usage: resources?.memory?.usage ?? 0,
      allocated: resources?.memory?.allocated ?? 0,
      limit: resources?.memory?.limit ?? 100
    },
    network: {
      inbound: resources?.network?.inbound ?? '0 B/s',
      outbound: resources?.network?.outbound ?? '0 B/s'
    },
    // Legacy flat properties for backward compatibility
    cpuUsage: resources?.cpuUsage ?? resources?.cpu?.usage ?? 0,
    memoryUsage: resources?.memoryUsage ?? resources?.memory?.usage ?? 0,
    networkUsage: resources?.networkUsage ?? 0,
    // Legacy nested structure support
    allocated: resources?.allocated ?? {
      cpu: resources?.cpu?.allocated ?? 0,
      memory: resources?.memory?.allocated ?? 0,
      disk: 0
    },
    used: resources?.used ?? {
      cpu: resources?.cpu?.used ?? 0,
      memory: resources?.memory?.usage ?? 0,
      disk: 0
    },
    limits: resources?.limits ?? {
      cpu: resources?.cpu?.limit ?? 100,
      memory: resources?.memory?.limit ?? 100,
      disk: 100
    }
  };
}