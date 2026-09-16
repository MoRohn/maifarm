/**
 * Type definitions for AI Super Intelligence features
 * Enabling emergent behaviors, collective intelligence, and meta-learning
 * Version 2.0 - Stable implementation with safety controls
 */

export interface SuperIntelligenceConfig {
  enabled: boolean;
  mode: 'passive' | 'active' | 'autonomous';
  resourceLimits: ResourceLimits;
  safetyControls: SafetyControls;
  integrationMode: 'isolated' | 'integrated' | 'hybrid';
}

export interface ResourceLimits {
  maxCpuUsage: number; // Percentage (0-100)
  maxMemoryMB: number;
  maxConcurrentOperations: number;
  maxExecutionTimeMs: number;
  throttleDelayMs: number;
}

export interface SafetyControls {
  requireHumanApproval: boolean;
  maxAutonomousActions: number;
  allowedOperations: string[];
  forbiddenOperations: string[];
  emergencyStopEnabled: boolean;
  auditLogging: boolean;
}

// Core Superintelligence State
export interface SuperIntelligenceState {
  id: string;
  status: 'initializing' | 'idle' | 'processing' | 'learning' | 'paused' | 'error';
  modules: {
    collective: boolean;
    swarm: boolean;
    emergent: boolean;
    metaLearning: boolean;
  };
  metrics: SuperIntelligenceMetrics;
  lastUpdate: Date;
}

export interface SuperIntelligenceMetrics {
  intelligenceLevel: number; // 0-100
  collectiveInsights: number;
  emergentBehaviors: number;
  learningRate: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    operations: number;
  };
  performance: {
    decisionsPerSecond: number;
    averageConfidence: number;
    successRate: number;
  };
}

// Collective Intelligence Types
export interface CollectiveIntelligenceState {
  id: string;
  activeAgents: number;
  consensusThreshold: number;
  emergentBehaviors: EmergentBehavior[];
  collectiveMemory: CollectiveMemory;
  swarmTopology: SwarmTopology;
  timestamp: Date;
}

export interface EmergentBehavior {
  id: string;
  pattern: string;
  description: string;
  frequency: number;
  agentContributors: string[];
  confidence: number;
  impact: 'low' | 'medium' | 'high' | 'breakthrough';
  discovered: Date;
  validated: boolean;
  metadata?: Record<string, any>;
}

export interface CollectiveMemory {
  knowledgeBase: KnowledgeNode[];
  connections: KnowledgeEdge[];
  insights: CollectiveInsight[];
  totalNodes: number;
  memoryUtilization: number;
  lastConsolidation: Date;
}

export interface KnowledgeNode {
  id: string;
  content: string;
  type: 'fact' | 'pattern' | 'strategy' | 'insight' | 'experience';
  source: string[];
  confidence: number;
  created: Date;
  lastAccessed: Date;
  accessCount: number;
  relevance: number;
  tags: string[];
}

export interface KnowledgeEdge {
  from: string;
  to: string;
  weight: number;
  type: 'causal' | 'correlation' | 'similarity' | 'temporal' | 'hierarchical';
  confidence: number;
  evidence: string[];
}

export interface CollectiveInsight {
  id: string;
  insight: string;
  derivedFrom: string[];
  novelty: number; // 0-1
  utility: number; // 0-1
  confidence: number; // 0-1
  validated: boolean;
  applications: string[];
  timestamp: Date;
}

// Swarm Intelligence Types
export interface SwarmTopology {
  type: 'fully-connected' | 'ring' | 'star' | 'small-world' | 'scale-free' | 'adaptive';
  nodes: SwarmNode[];
  edges: SwarmEdge[];
  centralityMetrics: CentralityMetrics;
  efficiency: number;
}

export interface SwarmNode {
  agentId: string;
  position: Vector3D;
  velocity: Vector3D;
  fitness: number;
  personalBest: number;
  globalBest: number;
  neighbors: string[];
  role: 'explorer' | 'exploiter' | 'coordinator' | 'specialist';
  state: 'active' | 'idle' | 'learning' | 'communicating';
}

export interface SwarmEdge {
  from: string;
  to: string;
  bandwidth: number;
  latency: number;
  reliability: number;
  messageCount: number;
}

export interface CentralityMetrics {
  betweenness: Map<string, number>;
  closeness: Map<string, number>;
  eigenvector: Map<string, number>;
  pageRank: Map<string, number>;
  hubScore: Map<string, number>;
  authorityScore: Map<string, number>;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

// Neural Swarm Optimizer Types
export interface SwarmOptimizationConfig {
  particles: number;
  dimensions: number;
  inertiaWeight: number;
  cognitiveWeight: number;
  socialWeight: number;
  maxVelocity: number;
  maxIterations: number;
  convergenceThreshold: number;
  diversityThreshold: number;
}

export interface OptimizationObjective {
  id: string;
  name: string;
  type: 'minimize' | 'maximize';
  evaluate: (position: number[]) => number;
  constraints?: Constraint[];
  targetValue?: number;
}

export interface Constraint {
  type: 'equality' | 'inequality';
  evaluate: (position: number[]) => number;
  threshold: number;
}

export interface OptimizationResult {
  bestPosition: number[];
  bestFitness: number;
  iterations: number;
  converged: boolean;
  particleHistory: ParticleState[];
  performanceMetrics: {
    avgFitness: number;
    diversity: number;
    convergenceRate: number;
  };
}

export interface ParticleState {
  id: string;
  position: number[];
  velocity: number[];
  fitness: number;
  personalBest: number[];
  personalBestFitness: number;
  activation: number[];
}

// Emergent Strategy Engine Types
export interface EmergentStrategy {
  id: string;
  genome: StrategyGenome;
  phenotype: StrategyPhenotype;
  fitness: StrategyFitness;
  generation: number;
  parents: string[];
  mutations: string[];
  created: Date;
}

export interface StrategyGenome {
  genes: Gene[];
  length: number;
  mutationRate: number;
  crossoverPoints: number[];
}

export interface Gene {
  id: string;
  type: 'action' | 'condition' | 'parameter' | 'connector';
  value: any;
  mutable: boolean;
  dominance: number;
}

export interface StrategyPhenotype {
  actions: StrategyAction[];
  conditions: StrategyCondition[];
  parameters: Map<string, any>;
  structure: 'linear' | 'branching' | 'cyclic' | 'network';
  complexity: number;
}

export interface StrategyAction {
  type: string;
  target: string;
  parameters: Record<string, any>;
  priority: number;
  dependencies: string[];
}

export interface StrategyCondition {
  type: 'if' | 'while' | 'until' | 'when';
  expression: string;
  trueBranch: string[];
  falseBranch?: string[];
}

export interface StrategyFitness {
  overall: number;
  effectiveness: number;
  efficiency: number;
  novelty: number;
  robustness: number;
  adaptability: number;
}

// Meta-Learning Types
export interface MetaLearningState {
  id: string;
  learningHistory: LearningEpisode[];
  transferKnowledge: TransferKnowledge[];
  hyperparameters: Map<string, HyperParameter>;
  performanceModel: PerformanceModel;
  optimizationStrategy: 'bayesian' | 'genetic' | 'gradient' | 'random';
}

export interface LearningEpisode {
  id: string;
  domain: string;
  task: string;
  startTime: Date;
  endTime: Date;
  initialPerformance: number;
  finalPerformance: number;
  learningCurve: number[];
  hyperparameters: Record<string, any>;
  insights: string[];
}

export interface TransferKnowledge {
  sourceDomain: string;
  targetDomain: string;
  knowledge: string;
  applicability: number;
  successRate: number;
  adaptations: string[];
}

export interface HyperParameter {
  name: string;
  value: any;
  type: 'continuous' | 'discrete' | 'categorical';
  range?: [number, number];
  options?: any[];
  importance: number;
  lastOptimized: Date;
}

export interface PerformanceModel {
  type: 'regression' | 'classification' | 'clustering';
  accuracy: number;
  features: string[];
  predictions: Map<string, number>;
  confidence: Map<string, number>;
}

// Integration Types
export interface SuperIntelligenceIntegration {
  farmId?: string;
  harvestId?: string;
  taskId?: string;
  agentIds: string[];
  mode: 'advisory' | 'collaborative' | 'autonomous';
  permissions: IntegrationPermissions;
}

export interface IntegrationPermissions {
  canReadData: boolean;
  canSuggestActions: boolean;
  canExecuteActions: boolean;
  canModifyAgents: boolean;
  canOptimizeResources: boolean;
  requiresApproval: boolean;
}

// Decision Making Types
export interface CollectiveDecision {
  id: string;
  question: string;
  options: DecisionOption[];
  votes: AgentVote[];
  consensusMethod: 'majority' | 'weighted' | 'ranked' | 'byzantine';
  result?: DecisionResult;
  timestamp: Date;
}

export interface DecisionOption {
  id: string;
  description: string;
  proposedBy: string;
  supportingEvidence: string[];
  riskAssessment: {
    probability: number;
    impact: number;
    mitigation: string[];
  };
}

export interface AgentVote {
  agentId: string;
  optionId: string;
  confidence: number;
  reasoning: string;
  timestamp: Date;
}

export interface DecisionResult {
  selectedOption: string;
  confidence: number;
  consensus: number;
  dissent: string[];
  implementation: string;
}

// Communication Types
export interface SwarmMessage {
  id: string;
  from: string;
  to: string | 'broadcast';
  type: 'info' | 'query' | 'command' | 'response' | 'alert';
  priority: 'low' | 'normal' | 'high' | 'critical';
  content: any;
  timestamp: Date;
  ttl?: number;
  acknowledgements: string[];
}

// Event Types
export interface SuperIntelligenceEvent {
  type: SuperIntelligenceEventType;
  payload: any;
  timestamp: Date;
  source: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export type SuperIntelligenceEventType =
  | 'insight:discovered'
  | 'behavior:emerged'
  | 'strategy:evolved'
  | 'learning:completed'
  | 'consensus:reached'
  | 'optimization:complete'
  | 'resource:limit'
  | 'safety:triggered'
  | 'error:occurred';

// API Response Types
export interface SuperIntelligenceResponse {
  success: boolean;
  data?: any;
  insights?: CollectiveInsight[];
  recommendations?: string[];
  confidence: number;
  reasoning?: string;
  error?: string;
}