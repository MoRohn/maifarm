/**
 * Utility for consistent agent ID normalization across the application
 * Ensures agent IDs are always treated as numbers for consistency
 */

export class AgentIdNormalizer {
  /**
   * Normalize an agent ID to a number
   * Handles various input formats safely
   */
  static normalize(agentId: any): number {
    // Handle null/undefined
    if (agentId == null) {
      return 0;
    }

    // Already a number
    if (typeof agentId === 'number') {
      return Math.floor(agentId);
    }

    // String that can be converted
    if (typeof agentId === 'string') {
      const parsed = parseInt(agentId, 10);
      return isNaN(parsed) ? 0 : parsed;
    }

    // Object with id property
    if (typeof agentId === 'object' && agentId.id != null) {
      return this.normalize(agentId.id);
    }

    // Default fallback
    return 0;
  }

  /**
   * Normalize an array of agent IDs
   */
  static normalizeArray(agentIds: any[]): number[] {
    if (!Array.isArray(agentIds)) {
      return [];
    }
    return agentIds.map(id => this.normalize(id));
  }

  /**
   * Check if two agent IDs are equal after normalization
   */
  static equals(id1: any, id2: any): boolean {
    return this.normalize(id1) === this.normalize(id2);
  }

  /**
   * Create a normalized key for agent-based mappings
   */
  static toKey(agentId: any): string {
    return `agent-${this.normalize(agentId)}`;
  }

  /**
   * Parse an agent key back to a normalized ID
   */
  static fromKey(key: string): number {
    const match = key.match(/^agent-(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Validate that an agent ID is valid
   */
  static isValid(agentId: any): boolean {
    const normalized = this.normalize(agentId);
    return normalized >= 0 && Number.isFinite(normalized);
  }
}

// Export convenience functions
export const normalizeAgentId = AgentIdNormalizer.normalize;
export const normalizeAgentIds = AgentIdNormalizer.normalizeArray;
export const agentIdsEqual = AgentIdNormalizer.equals;
export const agentIdToKey = AgentIdNormalizer.toKey;
export const keyToAgentId = AgentIdNormalizer.fromKey;
export const isValidAgentId = AgentIdNormalizer.isValid;