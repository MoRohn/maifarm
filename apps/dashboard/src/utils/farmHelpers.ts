import type { Farm, Agent } from '@/types';

/**
 * Type guard to check if an array contains Agent objects or string IDs
 */
export function isAgentArray(agents: Agent[] | string[]): agents is Agent[] {
  if (!Array.isArray(agents) || agents.length === 0) {
    return false;
  }
  // Check the first element to determine the type
  return typeof agents[0] === 'object' && agents[0] !== null && 'id' in agents[0];
}

/**
 * Safely extract Agent objects from a farm's agents property
 * Returns empty array if agents are string IDs
 */
export function getAgentsFromFarm(farm: Farm): Agent[] {
  if (!farm.agents || !Array.isArray(farm.agents)) {
    return [];
  }
  
  if (isAgentArray(farm.agents)) {
    return farm.agents;
  }
  
  // If agents are string IDs, return empty array
  // In a real implementation, you might want to fetch the actual Agent objects
  return [];
}

/**
 * Safely extract all Agent objects from multiple farms
 */
export function getAllAgentsFromFarms(farms: Farm[]): Agent[] {
  return farms.flatMap(farm => getAgentsFromFarm(farm));
}

/**
 * Get agent count from a farm regardless of whether agents are objects or IDs
 */
export function getAgentCount(farm: Farm): number {
  if (!farm.agents || !Array.isArray(farm.agents)) {
    return farm.agentCount || 0;
  }
  return farm.agents.length;
}