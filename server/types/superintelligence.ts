/**
 * Type definitions for AI Super Intelligence features
 * Enabling emergent behaviors, collective intelligence, and meta-learning
 */

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
  frequency: number;
  agentContributors: string[];
  confidence: number;
  impact: 'low' | 'medium' | 'high' | 'breakthrough';
  discovered: Date;
  metadata?: Record<string, any>;
}

export interface CollectiveMemory {
  knowledgeBase: KnowledgeNode[];
  connections: KnowledgeEdge[];
  insights: CollectiveInsight[];
  totalNodes: number;
  memoryUtilization: number;
}

export interface KnowledgeNode {
  id: string;
  content: string;
  type: 'fact' | 'pattern' | 'strategy' | 'insight';
  source: string[];
  confidence: number;
  created: Date;
  lastAccessed: Date;
  accessCount: number;
}

export interface KnowledgeEdge {
  from: string;
  to: string;
  weight: number;
  type: 'causal' | 'correlation' | 'similarity' | 'temporal';
}

export interface CollectiveInsight {
  id: string;
  insight: string;
  derivedFrom: string[];
  novelty: number;
  utility: number;
  validated: boolean;
}

export interface SwarmTopology {
  type: 'fully-connected' | 'ring' | 'star' | 'small-world' | 'scale-free';
  nodes: SwarmNode[];
  edges: SwarmEdge[];
  centralityMetrics: CentralityMetrics;
}

export interface SwarmNode {
  agentId: string;
  position: Vector3D;
  velocity: Vector3D;
  fitness: number;
  personalBest: number;
  neighbors: string[];
}

export interface SwarmEdge {
  from: string;
  to: string;
  bandwidth: number;
  latency: number;
}

export interface CentralityMetrics {
  betweenness: Map<string, number>;
  closeness: Map<string, number>;
  eigenvector: Map<string, number>;
  pageRank: Map<string, number>;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface SwarmOptimizationConfig {
  particles: number;
  dimensions: number;
  inertiaWeight: number;
  cognitiveCoefficient: number;
  socialCoefficient: number;
  maxIterations: number;
  convergenceThreshold: number;
  topology: 'global' | 'local' | 'dynamic';
}

export interface NeuralParticle {
  id: string;
  position: number[];
  velocity: number[];
  personalBest: number[];
  personalBestFitness: number;
  currentFitness: number;
  neuralWeights: number[][];
  activationFunction: 'relu' | 'sigmoid' | 'tanh' | 'swish';
}

export interface FitnessEvaluation {
  particleId: string;
  fitness: number;
  components: {
    accuracy: number;
    speed: number;
    novelty: number;
    robustness: number;
  };
  timestamp: Date;
}

export interface EmergentStrategy {
  id: string;
  name: string;
  description: string;
  genotype: number[];
  phenotype: StrategyPhenotype;
  fitness: number;
  generation: number;
  parents?: string[];
  mutations: number;
  discovered: Date;
}

export interface StrategyPhenotype {
  actions: StrategyAction[];
  conditions: StrategyCondition[];
  objectives: string[];
  constraints: string[];
  expectedOutcome: string;
}

export interface StrategyAction {
  type: string;
  parameters: Record<string, any>;
  priority: number;
  dependencies?: string[];
}

export interface StrategyCondition {
  type: 'prerequisite' | 'trigger' | 'termination';
  expression: string;
  evaluation: () => boolean;
}

export interface MetaLearningState {
  learningRate: number;
  adaptationSpeed: number;
  transferEfficiency: number;
  hyperparameters: HyperparameterSet;
  learningCurves: LearningCurve[];
  domainKnowledge: DomainKnowledge[];
}

export interface HyperparameterSet {
  exploration: number;
  exploitation: number;
  memoryRetention: number;
  generalizationFactor: number;
  noiseLevel: number;
  batchSize: number;
  updateFrequency: number;
}

export interface LearningCurve {
  taskId: string;
  dataPoints: { iteration: number; performance: number; timestamp: Date }[];
  convergenceRate: number;
  plateauDetected: boolean;
  optimalPoint?: { iteration: number; performance: number };
}

export interface DomainKnowledge {
  domain: string;
  concepts: string[];
  relationships: string[][];
  transferability: number;
  applications: string[];
}

export interface QuantumInspiredState {
  qubits: number;
  superposition: SuperpositionState[];
  entanglements: EntanglementPair[];
  measurementBasis: 'computational' | 'hadamard' | 'custom';
  decoherenceRate: number;
}

export interface SuperpositionState {
  id: string;
  amplitudes: Complex[];
  probabilities: number[];
  coherence: number;
  entangled: boolean;
}

export interface Complex {
  real: number;
  imaginary: number;
}

export interface EntanglementPair {
  qubit1: string;
  qubit2: string;
  correlationType: 'bell' | 'ghz' | 'w';
  strength: number;
}

export interface CollectiveDecision {
  id: string;
  question: string;
  options: DecisionOption[];
  votes: AgentVote[];
  consensusMethod: 'majority' | 'weighted' | 'ranked' | 'borda';
  result?: DecisionOption;
  confidence: number;
  timestamp: Date;
}

export interface DecisionOption {
  id: string;
  description: string;
  supportingEvidence: string[];
  riskAssessment: number;
  expectedValue: number;
}

export interface AgentVote {
  agentId: string;
  optionId: string;
  weight: number;
  reasoning?: string;
  confidence: number;
}

export interface EmergentPattern {
  id: string;
  pattern: string;
  type: 'behavioral' | 'structural' | 'temporal' | 'causal';
  occurrences: PatternOccurrence[];
  significance: number;
  predictivePower: number;
  validated: boolean;
}

export interface PatternOccurrence {
  timestamp: Date;
  context: string;
  agents: string[];
  strength: number;
}

export interface SwarmMessage {
  from: string;
  to: string | 'broadcast';
  type: 'info' | 'query' | 'response' | 'command';
  content: any;
  timestamp: Date;
  ttl?: number;
}

export interface CollectiveMetrics {
  diversity: number;
  coherence: number;
  efficiency: number;
  adaptability: number;
  emergenceIndex: number;
  swarmIntelligence: number;
  collectiveIQ: number;
}