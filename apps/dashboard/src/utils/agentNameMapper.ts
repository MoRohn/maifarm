/**
 * Agent Name Mapper Utility
 * Maps agent IDs/UIDs to human-readable farm agent names
 */

import { Farm, Agent } from '@/types/index';
import { getAgentsFromFarm } from './farmHelpers';

const NAME_FIELDS = ['displayName', 'name', 'agentName', 'title', 'label'] as const;
const EMOJI_FIELDS = ['emoji', 'icon', 'avatar', 'symbol'] as const;
const ANIMAL_FIELDS = ['animal', 'species'] as const;
const NESTED_FIELDS = ['profile', 'metadata', 'info', 'details', 'character', 'agent', 'config'] as const;

interface ParsedAgentName {
  name?: string;
  emoji?: string;
  animal?: string;
}

const MAX_PARSE_DEPTH = 3;

const mergeParsedValues = (target: ParsedAgentName, source: ParsedAgentName) => {
  if (!source) return;
  if (!target.name && source.name) target.name = source.name;
  if (!target.emoji && source.emoji) target.emoji = source.emoji;
  if (!target.animal && source.animal) target.animal = source.animal;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const unwrapSerializedValue = (value: string): unknown => {
  let current: unknown = value;

  for (let i = 0; i < MAX_PARSE_DEPTH; i += 1) {
    if (typeof current !== 'string') break;

    const trimmed = current.trim();
    if (!trimmed) {
      current = '';
      break;
    }

    try {
      current = JSON.parse(trimmed);
      continue;
    } catch (error) {
      // If the string is wrapped in quotes, strip them and retry
      const firstChar = trimmed[0];
      const lastChar = trimmed[trimmed.length - 1];
      if ((firstChar === '"' && lastChar === '"') || (firstChar === '\'' && lastChar === '\'')) {
        current = trimmed.slice(1, -1);
        continue;
      }
    }

    current = trimmed;
    break;
  }

  return current;
};

const parseAgentString = (raw: string, depth: number): ParsedAgentName => {
  const result: ParsedAgentName = {};
  const unwrapped = unwrapSerializedValue(raw);

  if (typeof unwrapped === 'string') {
    const cleaned = unwrapped.trim();
    if (cleaned) {
      result.name = cleaned;
    }
    return result;
  }

  if (isRecord(unwrapped) && depth < MAX_PARSE_DEPTH) {
    return extractFromObject(unwrapped, depth + 1);
  }

  return result;
};

const extractFieldFromObject = (source: Record<string, unknown>, field: string): string | undefined => {
  const value = source[field];
  if (typeof value === 'string') {
    return value.trim();
  }
  return undefined;
};

const extractFromObject = (source: Record<string, unknown>, depth: number): ParsedAgentName => {
  const parsed: ParsedAgentName = {};

  const consider = (value: unknown) => {
    if (typeof value === 'string') {
      mergeParsedValues(parsed, parseAgentString(value, depth + 1));
    } else if (isRecord(value) && depth < MAX_PARSE_DEPTH) {
      mergeParsedValues(parsed, extractFromObject(value, depth + 1));
    }
  };

  NAME_FIELDS.forEach(field => {
    if (!parsed.name) {
      const fieldValue = extractFieldFromObject(source, field);
      if (fieldValue) {
        mergeParsedValues(parsed, parseAgentString(fieldValue, depth + 1));
      }
    }
  });

  EMOJI_FIELDS.forEach(field => {
    if (!parsed.emoji) {
      const value = extractFieldFromObject(source, field);
      if (value) {
        parsed.emoji = value;
      }
    }
  });

  ANIMAL_FIELDS.forEach(field => {
    if (!parsed.animal) {
      const value = extractFieldFromObject(source, field);
      if (value) {
        parsed.animal = value;
      }
    }
  });

  NESTED_FIELDS.forEach(field => {
    const nested = source[field];
    if (!nested) return;

    if (Array.isArray(nested) && depth < MAX_PARSE_DEPTH) {
      for (const item of nested) {
        if (!item) continue;
        if (typeof item === 'string') {
          mergeParsedValues(parsed, parseAgentString(item, depth + 1));
        } else if (isRecord(item)) {
          mergeParsedValues(parsed, extractFromObject(item, depth + 1));
        }
        if (parsed.name && parsed.emoji) break;
      }
    } else if (typeof nested === 'string') {
      mergeParsedValues(parsed, parseAgentString(nested, depth + 1));
    } else if (isRecord(nested) && depth < MAX_PARSE_DEPTH) {
      mergeParsedValues(parsed, extractFromObject(nested, depth + 1));
    }
  });

  return parsed;
};

export const resolveAgentDisplayName = (agent: unknown, fallback: string): string => {
  let parsed: ParsedAgentName = {};

  if (typeof agent === 'string') {
    parsed = parseAgentString(agent, 0);
  } else if (isRecord(agent)) {
    parsed = extractFromObject(agent, 0);

    const agentNameValue = agent['name'];
    if (typeof agentNameValue === 'string') {
      mergeParsedValues(parsed, parseAgentString(agentNameValue, 0));
    }
  }

  let displayName = parsed.name?.trim() || '';

  if (!displayName) {
    displayName = fallback;
  }

  if (parsed.animal && !displayName.toLowerCase().includes(parsed.animal.toLowerCase())) {
    displayName = `${displayName} the ${parsed.animal}`.trim();
  }

  if (parsed.emoji && !displayName.includes(parsed.emoji)) {
    displayName = `${displayName} ${parsed.emoji}`.trim();
  }

  return displayName || fallback;
};

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
  const agents = getAgentsFromFarm(farm);
  agents.forEach((agent: Agent, index: number) => {
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
    return fallback || `Agent ${typeof agentId === 'number' ? agentId + 1 : agentId}`;
  }
  
  const agentIdStr = agentId.toString();
  
  // First try direct lookup by index or ID
  const mapped = mapping.get(agentIdStr);
  if (mapped) {
    return mapped.agentName;
  }
  
  // For numeric indices, also try as array index
  if (typeof agentId === 'number') {
    // Try to get from mapping entries by order (for index-based lookups)
    const entries = Array.from(mapping.entries());
    if (entries.length > agentId) {
      // Get the entry at this index position
      const entryAtIndex = entries.find(([key]) => {
        // Look for numeric keys that match the index
        const numKey = parseInt(key);
        return !isNaN(numKey) && numKey === agentId;
      });
      if (entryAtIndex) {
        return entryAtIndex[1].agentName;
      }
    }
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
  
  // Better fallback with proper Agent numbering (starting from 1)
  const agentNumber = typeof agentId === 'number' ? agentId + 1 : agentId;
  return fallback || `Agent ${agentNumber}`;
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
