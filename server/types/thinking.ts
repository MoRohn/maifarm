/**
 * Thinking Strategy Types for Enhanced Agent Problem-Solving
 * 
 * This module defines the thinking levels and configurations that enable
 * Claude agents to engage in deeper reasoning for complex tasks.
 */

/**
 * Thinking levels mapped to Claude's internal processing modes
 * Each level allocates progressively more computational budget
 */
export enum ThinkingLevel {
  NONE = 'none',           // No explicit thinking trigger
  BASIC = 'basic',         // "think" - Standard reasoning
  MODERATE = 'moderate',   // "think hard" - Enhanced analysis
  DEEP = 'deep',          // "think harder" - Deep exploration
  ULTRA = 'ultra'         // "ultrathink" - Maximum computation
}

/**
 * Mapping of trigger phrases to thinking levels
 */
export const THINKING_TRIGGERS: Record<ThinkingLevel, string> = {
  [ThinkingLevel.NONE]: '',
  [ThinkingLevel.BASIC]: 'think',
  [ThinkingLevel.MODERATE]: 'think hard',
  [ThinkingLevel.DEEP]: 'think harder',
  [ThinkingLevel.ULTRA]: 'ultrathink'
};

/**
 * Configuration for thinking strategy application
 */
export interface ThinkingConfig {
  /** The thinking level to apply */
  level: ThinkingLevel;
  
  /** Context-specific instructions for thinking */
  context?: string;
  
  /** Whether to auto-escalate thinking level based on complexity */
  autoEscalate?: boolean;
  
  /** Maximum thinking level allowed (for budget control) */
  maxLevel?: ThinkingLevel;
  
  /** Estimated additional processing time in seconds */
  estimatedDelay?: number;
  
  /** Task type for specialized thinking patterns */
  taskType?: 'debugging' | 'testing' | 'development' | 'analysis' | 'optimization' | 'exploration';
  
  /** Complexity score (0-100) for automatic level selection */
  complexityScore?: number;
}

/**
 * Result of applying thinking strategy to a prompt
 */
export interface ThinkingEnhancedPrompt {
  /** The original prompt before enhancement */
  originalPrompt: string;
  
  /** The enhanced prompt with thinking triggers */
  enhancedPrompt: string;
  
  /** The thinking level applied */
  appliedLevel: ThinkingLevel;
  
  /** Any additional context added */
  addedContext?: string;
  
  /** Estimated processing overhead */
  estimatedOverhead: number;
}

/**
 * Metrics for thinking strategy performance
 */
export interface ThinkingMetrics {
  /** Task ID or session ID */
  taskId: string;
  
  /** Thinking level used */
  level: ThinkingLevel;
  
  /** Actual processing time in ms */
  processingTime: number;
  
  /** Quality score of the output (0-100) */
  qualityScore?: number;
  
  /** Whether the task succeeded */
  success: boolean;
  
  /** Any errors encountered */
  errors?: string[];
  
  /** Timestamp of execution */
  timestamp: Date;
}

/**
 * Complexity indicators for automatic thinking level selection
 */
export interface ComplexityIndicators {
  /** Word count of the prompt */
  wordCount: number;
  
  /** Number of technical terms detected */
  technicalTermCount: number;
  
  /** Presence of complex requirements */
  hasComplexRequirements: boolean;
  
  /** Multiple interconnected systems involved */
  hasSystemIntegration: boolean;
  
  /** Requires architectural decisions */
  hasArchitecturalImpact: boolean;
  
  /** Involves debugging or troubleshooting */
  hasDebuggingNeeds: boolean;
  
  /** Requires comprehensive testing */
  hasTestingRequirements: boolean;
  
  /** Estimated task duration in minutes */
  estimatedDuration: number;
}

/**
 * User preferences for thinking strategy
 */
export interface ThinkingPreferences {
  /** Default thinking level for new tasks */
  defaultLevel: ThinkingLevel;
  
  /** Whether to enable automatic thinking selection */
  enableAutoSelection: boolean;
  
  /** Whether to show thinking level recommendations */
  showRecommendations: boolean;
  
  /** Maximum allowed thinking level (for API cost control) */
  maxAllowedLevel: ThinkingLevel;
  
  /** Preferred balance between speed and quality (0=speed, 100=quality) */
  speedQualityBalance: number;
}