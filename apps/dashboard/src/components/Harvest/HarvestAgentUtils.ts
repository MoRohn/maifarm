/**
 * HarvestAgentUtils - Utility functions for agent data normalization
 * Handles the complex agent data transformations and normalization logic
 */

import { Agent } from '@/types/agent';

/**
 * Normalize agents to ensure consistent data structure
 * Handles both array and object formats from different sources
 */
export const normalizeAgents = (
  agents: any,
  farmId: string,
  farmName: string = 'Unknown Farm'
): Agent[] => {
  if (!agents) return [];

  // Handle array format
  if (Array.isArray(agents)) {
    return agents.map((agent, index) => {
      // If agent is already an object with required fields
      if (typeof agent === 'object' && agent !== null) {
        return {
          id: agent.id || `${farmId}-agent-${index}`,
          agentId: agent.agentId ?? index,
          name: agent.name || `Agent ${index + 1}`,
          status: agent.status || 'idle',
          farm_id: agent.farm_id || farmId,
          farmName: agent.farmName || farmName,
          created_at: agent.created_at || new Date().toISOString(),
          updated_at: agent.updated_at || new Date().toISOString(),
          last_activity: agent.last_activity || null,
          terminal_session_id: agent.terminal_session_id || null,
          workspace_path: agent.workspace_path || null,
          orchestrator_type: agent.orchestrator_type || 'standard'
        };
      }

      // If agent is a string (name only)
      if (typeof agent === 'string') {
        return {
          id: `${farmId}-agent-${index}`,
          agentId: index,
          name: agent,
          status: 'idle',
          farm_id: farmId,
          farmName: farmName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_activity: null,
          terminal_session_id: null,
          workspace_path: null,
          orchestrator_type: 'standard'
        };
      }

      // Default case
      return {
        id: `${farmId}-agent-${index}`,
        agentId: index,
        name: `Agent ${index + 1}`,
        status: 'idle',
        farm_id: farmId,
        farmName: farmName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_activity: null,
        terminal_session_id: null,
        workspace_path: null,
        orchestrator_type: 'standard'
      };
    });
  }

  // Handle object format (keyed by agent ID)
  if (typeof agents === 'object') {
    return Object.entries(agents).map(([key, agent]: [string, any]) => {
      const agentId = parseInt(key, 10);

      if (typeof agent === 'object' && agent !== null) {
        return {
          id: agent.id || `${farmId}-agent-${agentId}`,
          agentId: agent.agentId ?? agentId,
          name: agent.name || `Agent ${agentId + 1}`,
          status: agent.status || 'idle',
          farm_id: agent.farm_id || farmId,
          farmName: agent.farmName || farmName,
          created_at: agent.created_at || new Date().toISOString(),
          updated_at: agent.updated_at || new Date().toISOString(),
          last_activity: agent.last_activity || null,
          terminal_session_id: agent.terminal_session_id || null,
          workspace_path: agent.workspace_path || null,
          orchestrator_type: agent.orchestrator_type || 'standard'
        };
      }

      // If agent is a string
      if (typeof agent === 'string') {
        return {
          id: `${farmId}-agent-${agentId}`,
          agentId: agentId,
          name: agent,
          status: 'idle',
          farm_id: farmId,
          farmName: farmName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_activity: null,
          terminal_session_id: null,
          workspace_path: null,
          orchestrator_type: 'standard'
        };
      }

      // Default case
      return {
        id: `${farmId}-agent-${agentId}`,
        agentId: agentId,
        name: `Agent ${agentId + 1}`,
        status: 'idle',
        farm_id: farmId,
        farmName: farmName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_activity: null,
        terminal_session_id: null,
        workspace_path: null,
        orchestrator_type: 'standard'
      };
    });
  }

  return [];
};

/**
 * Get active agent count from farm data
 */
export const getActiveAgentCount = (agents: Agent[]): number => {
  return agents.filter(agent =>
    agent.status === 'active' ||
    agent.status === 'running' ||
    agent.status === 'working'
  ).length;
};

/**
 * Sort agents by their ID for consistent display order
 */
export const sortAgents = (agents: Agent[]): Agent[] => {
  return [...agents].sort((a, b) => {
    const aId = typeof a.agentId === 'number' ? a.agentId : parseInt(String(a.agentId), 10) || 0;
    const bId = typeof b.agentId === 'number' ? b.agentId : parseInt(String(b.agentId), 10) || 0;
    return aId - bId;
  });
};

/**
 * Find agent by ID
 */
export const findAgentById = (agents: Agent[], agentId: number | string): Agent | undefined => {
  const targetId = typeof agentId === 'string' ? parseInt(agentId, 10) : agentId;
  return agents.find(agent => agent.agentId === targetId);
};

/**
 * Check if all agents are in terminal state (completed/failed)
 */
export const areAllAgentsComplete = (agents: Agent[]): boolean => {
  if (agents.length === 0) return false;
  return agents.every(agent =>
    agent.status === 'completed' ||
    agent.status === 'failed' ||
    agent.status === 'stopped'
  );
};

/**
 * Get agent status color for UI display
 */
export const getAgentStatusColor = (status: string): string => {
  switch (status) {
    case 'active':
    case 'running':
    case 'working':
      return 'text-green-600 dark:text-green-400';
    case 'idle':
    case 'waiting':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'completed':
      return 'text-blue-600 dark:text-blue-400';
    case 'failed':
    case 'error':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
};

/**
 * Format agent name for display
 */
export const formatAgentName = (agent: Agent): string => {
  if (agent.name && agent.name !== `Agent ${agent.agentId + 1}`) {
    return agent.name;
  }
  return `Agent ${agent.agentId + 1}`;
};