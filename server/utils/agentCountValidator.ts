/**
 * Agent Count Validator
 * Enforces constraints for different farm modes
 */

import { structuredLogger as logger, LogCategory } from './structuredLogger';

export enum FarmMode {
  QUICK_TASK = 'quick-task',
  FARM = 'farm',
  GO_WILD = 'gowild'
}

export interface AgentCountConstraints {
  min: number;
  max: number;
  default: number;
}

export class AgentCountValidator {
  private static readonly CONSTRAINTS: Record<FarmMode, AgentCountConstraints> = {
    [FarmMode.QUICK_TASK]: {
      min: 2,
      max: 2,
      default: 2
    },
    [FarmMode.FARM]: {
      min: 2,
      max: 10,
      default: 2
    },
    [FarmMode.GO_WILD]: {
      min: 2,
      max: 10,
      default: 3
    }
  };

  /**
   * Validate and normalize agent count for a given mode
   */
  static validateAgentCount(mode: FarmMode | string, requestedCount?: number): number {
    const farmMode = this.normalizeMode(mode);
    const constraints = this.CONSTRAINTS[farmMode];
    
    if (!constraints) {
      logger.warn(LogCategory.FARM, `Unknown farm mode: ${mode}, using default constraints`);
      return 2; // Default safe value
    }

    // If no count specified, use default
    if (requestedCount === undefined || requestedCount === null) {
      logger.info(LogCategory.FARM, `No agent count specified for ${mode}, using default: ${constraints.default}`);
      return constraints.default;
    }

    // Enforce minimum
    if (requestedCount < constraints.min) {
      logger.warn(LogCategory.FARM, `Agent count ${requestedCount} below minimum ${constraints.min} for ${mode}, using minimum`);
      return constraints.min;
    }

    // Enforce maximum
    if (requestedCount > constraints.max) {
      logger.warn(LogCategory.FARM, `Agent count ${requestedCount} exceeds maximum ${constraints.max} for ${mode}, using maximum`);
      return constraints.max;
    }

    return requestedCount;
  }

  /**
   * Get constraints for a mode
   */
  static getConstraints(mode: FarmMode | string): AgentCountConstraints {
    const farmMode = this.normalizeMode(mode);
    return this.CONSTRAINTS[farmMode] || this.CONSTRAINTS[FarmMode.FARM];
  }

  /**
   * Check if agent count is valid for mode
   */
  static isValidCount(mode: FarmMode | string, count: number): boolean {
    const farmMode = this.normalizeMode(mode);
    const constraints = this.CONSTRAINTS[farmMode];
    
    if (!constraints) return false;
    
    return count >= constraints.min && count <= constraints.max;
  }

  /**
   * Normalize mode string to FarmMode enum
   */
  private static normalizeMode(mode: string): FarmMode {
    const normalized = mode.toLowerCase().replace(/[_-]/g, '');
    
    if (normalized.includes('quick') || normalized.includes('task')) {
      return FarmMode.QUICK_TASK;
    }
    
    if (normalized.includes('wild') || normalized.includes('gowild')) {
      return FarmMode.GO_WILD;
    }
    
    return FarmMode.FARM;
  }

  /**
   * Get error message for invalid count
   */
  static getErrorMessage(mode: FarmMode | string, requestedCount: number): string {
    const farmMode = this.normalizeMode(mode);
    const constraints = this.CONSTRAINTS[farmMode];
    
    if (!constraints) {
      return `Unknown farm mode: ${mode}`;
    }
    
    if (requestedCount < constraints.min) {
      return `${mode} requires at least ${constraints.min} agents (requested: ${requestedCount})`;
    }
    
    if (requestedCount > constraints.max) {
      return `${mode} allows maximum ${constraints.max} agents (requested: ${requestedCount})`;
    }
    
    return '';
  }
}

// Export for convenience
export const validateAgentCount = AgentCountValidator.validateAgentCount.bind(AgentCountValidator);
export const getAgentConstraints = AgentCountValidator.getConstraints.bind(AgentCountValidator);
export const isValidAgentCount = AgentCountValidator.isValidCount.bind(AgentCountValidator);