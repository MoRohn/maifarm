/**
 * Plugin Types for Dashboard
 *
 * TypeScript types for blerbz-plugins integration:
 * - inference-confidenz
 * - inference-continuez
 * - inference-planz
 *
 * @author Blerbz
 * @license MIT
 */

// ============================================================================
// Confidence Types (inference-confidenz)
// ============================================================================

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ConfidenceTrend = 'improving' | 'declining' | 'stable';

export interface AgentConfidenceData {
  agentId: string;
  agentName: string;
  agentIndex: number;
  score: number;
  level: ConfidenceLevel;
  heuristic: boolean;
  shouldAutoContinue: boolean;
  timestamp: string;
}

export interface FarmConfidenceSummary {
  farmId: string;
  agents: Record<string, AgentConfidenceData>;
  averageScore: number;
  minScore: number;
  maxScore: number;
  overallLevel: ConfidenceLevel;
  trend: ConfidenceTrend;
  updatedAt: string;
}

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

// ============================================================================
// Continuez Types (inference-continuez)
// ============================================================================

export interface ContinuezConfig {
  enabled: boolean;
  threshold: number; // 0-99, auto-continue if score >= threshold
  maxContinuations: number;
}

export interface ContinuezState {
  farmId: string;
  agentId: string;
  continuationCount: number;
  lastConfidenceScore: number;
  shouldContinue: boolean;
  reason?: string;
}

// ============================================================================
// Planz Types (inference-planz)
// ============================================================================

export type PlanzPhase = 'research' | 'survey' | 'plan' | 'execute';

export interface PlanzConfig {
  enabled: boolean;
  prelaunchSurvey: boolean;
  autoExecute: boolean;
}

export interface PlanzSurveyQuestion {
  id: string;
  question: string;
  header: string;
  options: Array<{
    label: string;
    description: string;
  }>;
  multiSelect: boolean;
}

export interface PlanzSurveyResponse {
  questionId: string;
  selectedOptions: string[];
  customInput?: string;
}

export interface PlanzResearchInsight {
  category: string;
  finding: string;
  confidence: number;
  sources: string[];
}

export interface PlanzRoadmapStep {
  id: string;
  title: string;
  description: string;
  phase: PlanzPhase;
  dependencies: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

export interface PlanzSession {
  id: string;
  farmId: string;
  phase: PlanzPhase;
  prompt: string;
  research: PlanzResearchInsight[];
  survey: PlanzSurveyQuestion[];
  responses: PlanzSurveyResponse[];
  roadmap: PlanzRoadmapStep[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Plugin Configuration
// ============================================================================

export interface PluginConfig {
  pluginsEnabled: boolean;
  confidenzEnabled: boolean;
  continuezEnabled: boolean;
  continuezThreshold: number;
  planzEnabled: boolean;
  planzPrelaunchSurvey: boolean;
}

export interface FarmModePluginDefaults {
  QUICK_TASK: PluginConfig;
  HARVEST: PluginConfig;
  GO_WILD: PluginConfig;
  STANDARD: PluginConfig;
  HIGH_PERFORMANCE: PluginConfig;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 75) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function shouldAutoContinue(score: number, threshold: number): boolean {
  return score >= threshold;
}

export function getConfidenceLevelColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'high':
      return '#22c55e'; // green-500
    case 'medium':
      return '#f59e0b'; // amber-500
    case 'low':
      return '#ef4444'; // red-500
    default:
      return '#6b7280'; // gray-500
  }
}

export function formatConfidenceScore(score: number): string {
  return `${Math.round(score)}%`;
}

export function getTrendIndicator(trend: ConfidenceTrend): { icon: string; color: string } {
  switch (trend) {
    case 'improving':
      return { icon: '\u2191', color: '#22c55e' }; // Up arrow, green
    case 'declining':
      return { icon: '\u2193', color: '#ef4444' }; // Down arrow, red
    case 'stable':
      return { icon: '\u2192', color: '#6b7280' }; // Right arrow, gray
    default:
      return { icon: '\u2192', color: '#6b7280' };
  }
}
