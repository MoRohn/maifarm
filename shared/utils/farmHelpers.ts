/**
 * Type guards and helper functions for Farm types
 * Handles the union type issues with Farm.agents (Agent[] | string[])
 */

import type { Farm, Agent } from '../types/unified';

/**
 * Type guard to check if agents array contains Agent objects or just IDs
 */
export function isAgentArray(agents: Agent[] | string[]): agents is Agent[] {
  if (!agents || agents.length === 0) {
    // Empty array - treat as Agent[] for consistency
    return true;
  }
  
  // Check the first element to determine type
  const firstElement = agents[0];
  return typeof firstElement === 'object' && firstElement !== null;
}

/**
 * Type guard to check if agents array contains string IDs
 */
export function isAgentIdArray(agents: Agent[] | string[]): agents is string[] {
  if (!agents || agents.length === 0) {
    return false;
  }
  
  const firstElement = agents[0];
  return typeof firstElement === 'string';
}

/**
 * Safely get agent count from a farm
 */
export function getAgentCount(farm: Farm): number {
  // Prefer explicit agentCount if available
  if (typeof farm.agentCount === 'number') {
    return farm.agentCount;
  }
  
  // Otherwise count the agents array
  if (Array.isArray(farm.agents)) {
    return farm.agents.length;
  }
  
  return 0;
}

/**
 * Get agent IDs from a farm's agents array
 */
export function getAgentIds(farm: Farm): string[] {
  if (!farm.agents || !Array.isArray(farm.agents)) {
    return [];
  }
  
  if (isAgentArray(farm.agents)) {
    // Extract IDs from Agent objects
    return farm.agents.map(agent => agent.id);
  } else {
    // Already string IDs
    return farm.agents;
  }
}

/**
 * Get agent names from a farm's agents array
 */
export function getAgentNames(farm: Farm): string[] {
  if (!farm.agents || !Array.isArray(farm.agents)) {
    return [];
  }
  
  if (isAgentArray(farm.agents)) {
    // Extract names from Agent objects
    return farm.agents.map(agent => agent.name || `Agent ${agent.id}`);
  } else {
    // Only have IDs, generate default names
    return farm.agents.map((id, index) => `Agent ${index + 1}`);
  }
}

/**
 * Safely get agents from a farm as full Agent objects
 * Note: This only works if agents are already Agent objects
 * For string IDs, you'll need to fetch from database
 */
export function getAgentsFromFarm(farm: Farm): Agent[] | null {
  if (!farm.agents || !Array.isArray(farm.agents)) {
    return [];
  }
  
  if (isAgentArray(farm.agents)) {
    return farm.agents;
  }
  
  // Can't convert string IDs to full objects without database access
  // Return null to indicate conversion needed
  return null;
}

/**
 * Normalize a farm's agents to a consistent format
 * This is useful for API responses where we always want full objects or always want IDs
 */
export function normalizeFarmAgents<T extends 'objects' | 'ids'>(
  farm: Farm, 
  format: T
): T extends 'objects' ? (Agent[] | null) : string[] {
  if (format === 'ids') {
    return getAgentIds(farm) as any;
  }
  
  // For 'objects' format
  if (isAgentArray(farm.agents)) {
    return farm.agents as any;
  }
  
  // Can't convert IDs to objects without database
  return null as any;
}

/**
 * Create a type-safe farm with normalized agents
 */
export function createSafeFarm(farm: Partial<Farm>): Farm {
  const safeFarm: Farm = {
    id: farm.id || '',
    name: farm.name || 'Unnamed Farm',
    status: farm.status || 'idle',
    agents: farm.agents || [],
    config: farm.config || {},
    ...farm
  };
  
  // Ensure agentCount is consistent
  safeFarm.agentCount = getAgentCount(safeFarm);
  
  return safeFarm;
}

/**
 * Check if a farm has active agents
 */
export function hasActiveAgents(farm: Farm): boolean {
  if (!farm.agents || !Array.isArray(farm.agents)) {
    return false;
  }
  
  if (isAgentArray(farm.agents)) {
    return farm.agents.some(agent => 
      agent.status === 'active' || 
      agent.status === 'running' || 
      agent.status === 'working'
    );
  }
  
  // Can't check status with just IDs
  // Assume they're active if the farm is running
  return farm.status === 'running' || farm.status === 'active';
}

/**
 * Get a specific agent from farm by index or ID
 */
export function getAgentFromFarm(
  farm: Farm, 
  identifier: number | string
): Agent | string | undefined {
  if (!farm.agents || !Array.isArray(farm.agents)) {
    return undefined;
  }
  
  if (typeof identifier === 'number') {
    // Get by index
    return farm.agents[identifier];
  }
  
  // Get by ID
  if (isAgentArray(farm.agents)) {
    return farm.agents.find(agent => agent.id === identifier);
  } else {
    return farm.agents.find(id => id === identifier);
  }
}

/**
 * Type guard for checking if a value is a valid Farm
 */
export function isFarm(value: any): value is Farm {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.status === 'string' &&
    Array.isArray(value.agents)
  );
}

/**
 * Get farm display information for UI
 */
export function getFarmDisplayInfo(farm: Farm): {
  id: string;
  name: string;
  status: string;
  agentCount: number;
  hasAgentDetails: boolean;
} {
  return {
    id: farm.id,
    name: farm.name,
    status: farm.status,
    agentCount: getAgentCount(farm),
    hasAgentDetails: isAgentArray(farm.agents)
  };
}