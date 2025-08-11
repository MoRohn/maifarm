/**
 * Agent Name Mapper Utility
 * Maps agent IDs/UIDs to human-readable farm agent names
 */

import { Farm, Agent } from '../types/index';

export interface AgentNameMapping {
  agentId: string;
  agentName: string;
  role?: string;
  type?: string;
}

/**
 * Create a mapping from agent ID to farm agent name based on farm configuration
 */
export function createAgentNameMapping(farm: Farm): Map<string, AgentNameMapping> {
  const mapping = new Map<string, AgentNameMapping>();
  
  // Map each agent in the farm configuration
  farm.agents.forEach((agent: Agent, index: number) => {
    // Map by agent ID
    mapping.set(agent.id, {
      agentId: agent.id,
      agentName: agent.name,
      role: agent.type,
      type: agent.type
    });
    
    // Also map by index (for coordination file agent_id)
    mapping.set(index.toString(), {
      agentId: index.toString(),
      agentName: agent.name,
      role: agent.type,
      type: agent.type
    });
  });
  
  return mapping;
}

/**
 * Enhance agent mapping with coordination data from active_agents.json
 */
export function enhanceAgentMappingWithCoordination(
  mapping: Map<string, AgentNameMapping>,
  coordinationData: Record<string, any>
): Map<string, AgentNameMapping> {
  const enhancedMapping = new Map(mapping);
  
  // Process coordination data to map UIDs to agent indices
  Object.entries(coordinationData).forEach(([agentUid, agentInfo]) => {
    if (agentInfo.agent_id !== undefined) {
      const agentIndex = agentInfo.agent_id.toString();
      const existingMapping = mapping.get(agentIndex);
      
      if (existingMapping) {
        // Map the coordination UID to the same agent name
        enhancedMapping.set(agentUid, {
          ...existingMapping,
          agentId: agentUid
        });
        
        // Also create a coordination key
        enhancedMapping.set(`coord_${agentUid}`, {
          ...existingMapping,
          agentId: `coord_${agentUid}`
        });
      }
    }
  });
  
  return enhancedMapping;
}

/**
 * Get agent name by ID with fallback to generic name
 */
export function getAgentName(
  agentId: string | number, 
  mapping?: Map<string, AgentNameMapping>,
  fallback?: string
): string {
  if (!mapping) {
    return fallback || `Agent-${agentId}`;
  }
  
  const agentIdStr = agentId.toString();
  const mapped = mapping.get(agentIdStr);
  
  if (mapped) {
    return mapped.agentName;
  }
  
  // If not found directly, try to extract numeric ID from coordination UID
  // Pattern: agent_20250806_115135_0753 -> Look up using coordination data
  if (typeof agentId === 'string' && agentId.includes('_')) {
    // Try to find by coordination UID patterns
    for (const [key, value] of mapping.entries()) {
      // Check if this key matches the coordination pattern
      if (key.includes(agentIdStr) || agentIdStr.includes(key)) {
        return value.agentName;
      }
    }
    
    // Check if there's coordination data in the mapping keys
    for (const [key, value] of mapping.entries()) {
      // Look for keys that might contain this agent UID
      if (key.startsWith('coord_') && key.includes(agentIdStr)) {
        return value.agentName;
      }
    }
  }
  
  return fallback || `Agent-${agentId}`;
}

/**
 * Map agent name in harvest result or insight
 */
export function mapAgentNameInResult(
  result: any,
  mapping?: Map<string, AgentNameMapping>
): any {
  if (!result || !mapping) {
    return result;
  }
  
  // Clone the result to avoid mutation
  const mappedResult = { ...result };
  
  // Map agentName if agentId exists
  if (result.agentId) {
    const mapped = getAgentName(result.agentId, mapping);
    if (mapped !== `Agent-${result.agentId}`) {
      mappedResult.agentName = mapped;
    }
  }
  
  // Map source agent name in insights
  if (result.source?.agentId) {
    const mapped = getAgentName(result.source.agentId, mapping);
    if (mapped !== `Agent-${result.source.agentId}`) {
      mappedResult.source = {
        ...result.source,
        agentName: mapped
      };
    }
  }
  
  // Map createdBy agent name in yield items
  if (result.createdBy?.agentId) {
    const mapped = getAgentName(result.createdBy.agentId, mapping);
    if (mapped !== `Agent-${result.createdBy.agentId}`) {
      mappedResult.createdBy = {
        ...result.createdBy,
        agentName: mapped
      };
    }
  }
  
  return mappedResult;
}

/**
 * Map agent names in an entire harvest object
 */
export function mapAgentNamesInHarvest(
  harvest: any,
  farm?: Farm
): any {
  if (!harvest || !farm) {
    return harvest;
  }
  
  const mapping = createAgentNameMapping(farm);
  
  return {
    ...harvest,
    results: harvest.results?.map((result: any) => 
      mapAgentNameInResult(result, mapping)
    ) || [],
    insights: harvest.insights?.map((insight: any) => 
      mapAgentNameInResult(insight, mapping)
    ) || [],
    yield: harvest.yield?.map((yieldItem: any) => 
      mapAgentNameInResult(yieldItem, mapping)
    ) || []
  };
}

/**
 * Enhanced mapping function that tries to fetch coordination data
 */
export async function mapAgentNamesInHarvestWithCoordination(
  harvest: any,
  farm?: Farm
): Promise<any> {
  if (!harvest || !farm) {
    return harvest;
  }
  
  let mapping = createAgentNameMapping(farm);
  
  // Try to enhance with coordination data
  try {
    const coordinationResponse = await fetch('/api/harvest/coordination/agents');
    if (coordinationResponse.ok) {
      const coordinationData = await coordinationResponse.json();
      if (coordinationData.success && coordinationData.data) {
        // Convert array to object keyed by agent UID
        const coordByUid: Record<string, any> = {};
        coordinationData.data.forEach((agent: any) => {
          if (agent.uid) {
            coordByUid[agent.uid] = agent;
          }
        });
        mapping = enhanceAgentMappingWithCoordination(mapping, coordByUid);
      }
    }
  } catch (error) {
    console.warn('Could not fetch coordination data for agent mapping:', error);
  }
  
  return {
    ...harvest,
    results: harvest.results?.map((result: any) => 
      mapAgentNameInResult(result, mapping)
    ) || [],
    insights: harvest.insights?.map((insight: any) => 
      mapAgentNameInResult(insight, mapping)
    ) || [],
    yield: harvest.yield?.map((yieldItem: any) => 
      mapAgentNameInResult(yieldItem, mapping)
    ) || []
  };
}

export default {
  createAgentNameMapping,
  enhanceAgentMappingWithCoordination,
  getAgentName,
  mapAgentNameInResult,
  mapAgentNamesInHarvest,
  mapAgentNamesInHarvestWithCoordination
};