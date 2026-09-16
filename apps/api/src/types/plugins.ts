/**
 * Plugin Types for blerbz-plugins Integration
 *
 * Defines types for inference-confidenz, inference-continuez, and inference-planz
 * plugins that integrate with MaiFarm's farming orchestrator.
 */

import { FarmMode } from './farm';

/**
 * Plugin Configuration for blerbz-plugins integration
 * Controls inference-confidenz, inference-continuez, and inference-planz
 */
export interface PluginConfig {
  /** Enable all plugins */
  pluginsEnabled: boolean;
  /** Enable confidence scoring (inference-confidenz) */
  confidenzEnabled: boolean;
  /** Enable auto-continuation (inference-continuez) */
  continuezEnabled: boolean;
  /** Confidence threshold for auto-continuation (0-99) */
  continuezThreshold: number;
  /** Enable planning workflow (inference-planz) */
  planzEnabled: boolean;
  /** Run pre-launch survey for GoWild mode */
  planzPrelaunchSurvey: boolean;
}

/**
 * Confidence level categories
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Confidence trend direction
 */
export type ConfidenceTrend = 'improving' | 'declining' | 'stable';

/**
 * Per-agent confidence data from coordination files
 */
export interface AgentConfidenceData {
  agentId: string;
  agentName: string;
  agentIndex: number;
  /** Confidence score 0-99 */
  score: number;
  /** Confidence level category */
  level: ConfidenceLevel;
  /** Whether this was calculated heuristically (vs explicit CZ marker) */
  heuristic: boolean;
  /** Whether auto-continuation should trigger */
  shouldAutoContinue: boolean;
  /** Timestamp of last update */
  timestamp: string;
}

/**
 * Farm-wide confidence summary
 */
export interface FarmConfidenceSummary {
  farmId: string;
  /** Individual agent confidence data */
  agents: Record<string, AgentConfidenceData>;
  /** Average confidence across all agents */
  averageScore: number;
  /** Minimum agent confidence */
  minScore: number;
  /** Maximum agent confidence */
  maxScore: number;
  /** Overall confidence level */
  overallLevel: ConfidenceLevel;
  /** Trend direction based on recent history */
  trend: ConfidenceTrend;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * WebSocket event for confidence updates
 */
export interface ConfidenceUpdateEvent {
  type: 'farm:confidence:update';
  farmId: string;
  agents: Array<{
    agentId: string;
    agentName: string;
    score: number;
    level: ConfidenceLevel;
    shouldAutoContinue: boolean;
  }>;
  aggregate: {
    averageScore: number;
    minScore: number;
    maxScore: number;
    trend: ConfidenceTrend;
  };
  timestamp: string;
}

/**
 * Planz survey question
 */
export interface PlanzSurveyQuestion {
  id: string;
  question: string;
  options: string[];
  selectedAnswer?: string;
}

/**
 * Planz survey result for GoWild mode
 */
export interface PlanzSurveyResult {
  farmId: string;
  mode: FarmMode;
  questions: Array<{
    id: string;
    question: string;
    answer: string;
  }>;
  derivedGoals: string[];
  derivedConstraints: string[];
  suggestedAgentCount: number;
  suggestedTimeout: number;
  createdAt: Date;
}

/**
 * Plugin coordinator status
 */
export interface PluginCoordinatorStatus {
  /** Whether coordinator is running */
  active: boolean;
  /** Current plugin configuration */
  config: PluginConfig;
  /** Number of farms being monitored */
  activeFarms: number;
  /** Last confidence update time */
  lastConfidenceUpdate?: string;
  /** Last planz survey time */
  lastPlanzSurvey?: string;
}

/**
 * Helper function to determine confidence level from score
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

/**
 * Helper function to determine if auto-continuation should trigger
 */
export function shouldAutoContinue(score: number, threshold: number): boolean {
  return score >= threshold;
}

/**
 * Default plugin configurations per mode
 * (Re-exported from farmModeOptimizations for convenience)
 */
export const DEFAULT_THRESHOLDS: Record<FarmMode, number> = {
  [FarmMode.QUICK_TASK]: 85,
  [FarmMode.HARVEST]: 80,
  [FarmMode.GO_WILD]: 60,
  [FarmMode.COLLABORATIVE]: 80,
  [FarmMode.SEQUENTIAL]: 80,
  [FarmMode.AUTONOMOUS]: 70,
};
