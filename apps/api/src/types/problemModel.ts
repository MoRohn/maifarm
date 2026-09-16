/**
 * Problem Model Types - Model-First Reasoning Implementation
 *
 * Based on "Model-First Reasoning LLM Agents" (arxiv 2512.14474)
 * by Annu Rana and Gaurav Kumar
 *
 * Core insight: "Many LLM planning failures stem from representational
 * deficiencies rather than reasoning limitations"
 *
 * Two-phase approach:
 * 1. Phase 1: Model Construction - Build explicit problem representations
 * 2. Phase 2: Reasoning Over Models - Inference restricted to model boundaries
 */

/**
 * Condition for preconditions and goal verification
 */
export interface Condition {
  /** Variable name to check */
  variable: string;
  /** Comparison operator */
  operator: 'eq' | 'neq' | 'lt' | 'gt' | 'lte' | 'gte' | 'contains' | 'not_contains' | 'exists' | 'not_exists';
  /** Value to compare against */
  value: unknown;
  /** Optional description of this condition */
  description?: string;
}

/**
 * Effect of an action on state
 */
export interface Effect {
  /** Variable name to modify */
  variable: string;
  /** Operation to perform */
  operation: 'set' | 'add' | 'remove' | 'increment' | 'decrement' | 'append' | 'prepend';
  /** Value for the operation */
  value: unknown;
  /** Optional description of this effect */
  description?: string;
}

/**
 * Relationship between entities
 */
export interface EntityRelationship {
  /** ID of the target entity */
  targetId: string;
  /** Type of relationship */
  type: 'contains' | 'depends_on' | 'produces' | 'consumes' | 'inherits' | 'implements' | 'calls' | 'imports';
  /** Optional metadata about the relationship */
  metadata?: Record<string, unknown>;
}

/**
 * Entity types in the problem domain
 */
export type EntityType =
  | 'file'
  | 'function'
  | 'class'
  | 'module'
  | 'service'
  | 'agent'
  | 'resource'
  | 'database'
  | 'api'
  | 'component'
  | 'test'
  | 'config'
  | 'other';

/**
 * An entity in the problem domain
 */
export interface ProblemEntity {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Entity type classification */
  type: EntityType;
  /** Entity-specific properties */
  properties: Record<string, unknown>;
  /** Relationships to other entities */
  relationships: EntityRelationship[];
  /** Optional description */
  description?: string;
  /** Source location if applicable (file:line) */
  location?: string;
}

/**
 * Variable types for state tracking
 */
export type VariableType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'enum'
  | 'file_path'
  | 'status'
  | 'counter';

/**
 * A state variable in the problem domain
 */
export interface ProblemVariable {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Variable type */
  type: VariableType;
  /** Possible values (for enums) or value constraints */
  domain?: unknown[];
  /** Initial value */
  initialValue?: unknown;
  /** Current value (updated during execution) */
  currentValue?: unknown;
  /** Optional description */
  description?: string;
  /** Whether this variable is tracked for verification */
  tracked: boolean;
}

/**
 * An action that can be performed
 */
export interface ProblemAction {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description of what this action does */
  description: string;
  /** Conditions that must be true before execution */
  preconditions: Condition[];
  /** Changes that occur when action is executed */
  effects: Effect[];
  /** Agent assigned to this action (if any) */
  assignedAgent?: string;
  /** Execution priority (higher = earlier) */
  priority: number;
  /** Estimated duration in seconds */
  estimatedDuration?: number;
  /** Entity IDs this action operates on */
  targetEntities?: string[];
  /** Whether this action is atomic (cannot be interrupted) */
  atomic?: boolean;
  /** Action status during execution */
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
}

/**
 * Constraint types
 */
export type ConstraintType =
  | 'temporal'     // Ordering constraints (A before B)
  | 'resource'     // Resource limits (max 3 concurrent)
  | 'logical'      // Invariants that must always hold
  | 'dependency'   // Dependencies between actions/entities
  | 'mutual_exclusion'; // Actions that cannot run together

/**
 * A constraint on the problem
 */
export interface ProblemConstraint {
  /** Unique identifier */
  id: string;
  /** Constraint type */
  type: ConstraintType;
  /** Human-readable description */
  description: string;
  /** Formal expression (for evaluation) */
  expression: string;
  /** Whether this constraint is enforced */
  enforced: boolean;
  /** Severity if violated */
  severity: 'error' | 'warning' | 'info';
  /** Entity or action IDs this constraint applies to */
  appliesTo?: string[];
}

/**
 * A goal to achieve
 */
export interface ProblemGoal {
  /** Unique identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Conditions that define goal satisfaction */
  conditions: Condition[];
  /** Goal priority (higher = more important) */
  priority: number;
  /** Whether this goal has been verified as achieved */
  verified: boolean;
  /** Verification timestamp */
  verifiedAt?: Date;
  /** Optional sub-goals */
  subGoals?: string[];
}

/**
 * Verification result for an output
 */
export interface VerificationResult {
  /** Whether the output conforms to the model */
  conforms: boolean;
  /** Overall verification score (0-1) */
  score: number;
  /** Violations found */
  violations: ConstraintViolation[];
  /** Actions that were verified */
  verifiedActions: string[];
  /** Goals that were achieved */
  achievedGoals: string[];
  /** Timestamp of verification */
  timestamp: Date;
}

/**
 * A constraint violation
 */
export interface ConstraintViolation {
  /** ID of the violated constraint */
  constraintId: string;
  /** Description of the violation */
  description: string;
  /** Severity of the violation */
  severity: 'error' | 'warning' | 'info';
  /** Context where violation occurred */
  context?: string;
  /** Suggested fix */
  suggestedFix?: string;
}

/**
 * The complete Problem Model
 *
 * Represents explicit problem structure that agents use for reasoning.
 * Generated during the MODELING phase before agent execution.
 */
export interface ProblemModel {
  /** Unique identifier */
  id: string;
  /** Associated farm ID */
  farmId: string;
  /** Model version (incremented on updates) */
  version: number;

  /** Objects/actors in the problem domain */
  entities: ProblemEntity[];
  /** State variables to track */
  variables: ProblemVariable[];
  /** Possible operations */
  actions: ProblemAction[];
  /** Rules and limitations */
  constraints: ProblemConstraint[];
  /** Success criteria */
  goals: ProblemGoal[];

  /** Whether model has been verified */
  verified: boolean;
  /** Verification score (0-1) */
  verificationScore?: number;
  /** Detailed verification results */
  verificationDetails?: VerificationResult;

  /** Original prompt that generated this model */
  sourcePrompt?: string;
  /** AI provider used for generation */
  generatedBy?: 'claude' | 'openai' | 'ollama';
  /** Generation timestamp */
  generatedAt?: Date;

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Request to generate a problem model from a prompt
 */
export interface ProblemModelGenerationRequest {
  /** Farm ID */
  farmId: string;
  /** Farm prompt to analyze */
  prompt: string;
  /** Farm mode */
  mode: 'HARVEST' | 'QUICK_TASK' | 'GO_WILD';
  /** Number of agents */
  agentCount: number;
  /** AI provider to use */
  provider?: 'claude' | 'openai' | 'ollama';
  /** Additional context (files, YAML config, etc.) */
  context?: string;
}

/**
 * Output from problem model verification
 */
export interface ProblemModelOutput {
  /** Unique identifier */
  id: string;
  /** Associated problem model */
  problemModelId: string;
  /** Agent that produced this output (if any) */
  agentId?: string;
  /** Type of output */
  outputType: 'file' | 'code' | 'command' | 'message' | 'artifact';
  /** Output content */
  content: Record<string, unknown>;
  /** Whether output conforms to model */
  conformsToModel?: boolean;
  /** Any constraint violations */
  violations?: ConstraintViolation[];
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Summary of a problem model for display
 */
export interface ProblemModelSummary {
  id: string;
  farmId: string;
  entityCount: number;
  variableCount: number;
  actionCount: number;
  constraintCount: number;
  goalCount: number;
  verified: boolean;
  verificationScore?: number;
  createdAt: Date;
}

/**
 * Agent's view of the problem model
 * Serialized to JSON for injection into agent prompts
 */
export interface AgentProblemModelContext {
  /** Entities relevant to this agent */
  entities: Pick<ProblemEntity, 'id' | 'name' | 'type' | 'description'>[];
  /** Variables this agent should track */
  variables: Pick<ProblemVariable, 'id' | 'name' | 'type' | 'description' | 'currentValue'>[];
  /** Actions assigned to this agent */
  assignedActions: Pick<ProblemAction, 'id' | 'name' | 'description' | 'preconditions' | 'effects' | 'priority'>[];
  /** Constraints this agent must follow */
  constraints: Pick<ProblemConstraint, 'id' | 'type' | 'description' | 'severity'>[];
  /** Goals this agent should work toward */
  goals: Pick<ProblemGoal, 'id' | 'description' | 'priority'>[];
  /** Task ordering from causal model (if available) */
  taskOrder?: string[];
}
