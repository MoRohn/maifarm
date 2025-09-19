// Workflow orchestration type definitions

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'draft' | 'active' | 'archived';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
  triggers: WorkflowTrigger[];
  settings: WorkflowSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'task' | 'decision' | 'parallel' | 'loop' | 'wait';
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowNodeData {
  label: string;
  description?: string;
  taskType?: 'agent' | 'system' | 'external' | 'manual';
  agentType?: string;
  config?: Record<string, any>;
  inputs?: WorkflowInput[];
  outputs?: WorkflowOutput[];
  errorHandling?: NodeErrorHandling;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: 'default' | 'conditional';
  label?: string;
  condition?: WorkflowCondition;
}

export interface WorkflowCondition {
  type: 'expression' | 'script' | 'rule';
  value: string;
  fallback?: string;
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  value?: any;
  source?: 'input' | 'output' | 'global' | 'environment';
  required?: boolean;
}

export interface WorkflowInput {
  name: string;
  type: string;
  required: boolean;
  default?: any;
  validation?: string;
}

export interface WorkflowOutput {
  name: string;
  type: string;
  mapping?: string;
}

export interface WorkflowTrigger {
  id: string;
  type: 'manual' | 'schedule' | 'event' | 'webhook' | 'condition';
  enabled: boolean;
  config: TriggerConfig;
}

export interface TriggerConfig {
  schedule?: string; // cron expression
  event?: {
    source: string;
    type: string;
    filters?: Record<string, any>;
  };
  webhook?: {
    url: string;
    secret?: string;
    headers?: Record<string, string>;
  };
  condition?: {
    expression: string;
    checkInterval?: number;
  };
}

export interface WorkflowSettings {
  maxExecutionTime?: number;
  maxRetries?: number;
  parallelism?: number;
  priority?: 'low' | 'medium' | 'high';
  notifications?: NotificationSettings;
  monitoring?: MonitoringSettings;
}

export interface NotificationSettings {
  onStart?: boolean;
  onComplete?: boolean;
  onError?: boolean;
  channels: NotificationChannel[];
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'in_app';
  config: Record<string, any>;
}

export interface MonitoringSettings {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  metricsEnabled: boolean;
  tracingEnabled: boolean;
  customMetrics?: CustomMetric[];
}

export interface CustomMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  labels?: string[];
  expression?: string;
}

export interface NodeErrorHandling {
  strategy: 'retry' | 'skip' | 'fail' | 'compensate';
  retryConfig?: {
    times: number;
    delay: number;
    backoff?: 'linear' | 'exponential';
  };
  compensationTask?: string;
  fallbackValue?: any;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled' | 'suspended';
  startTime: Date;
  endTime?: Date;
  context: WorkflowContext;
  nodeExecutions: NodeExecution[];
  errors: WorkflowError[];
  metrics: WorkflowMetrics;
}

export interface WorkflowContext {
  variables: Record<string, any>;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  metadata: Record<string, any>;
}

export interface NodeExecution {
  nodeId: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  error?: WorkflowError;
  retryCount?: number;
}

export interface WorkflowError {
  nodeId?: string;
  timestamp: Date;
  type: string;
  message: string;
  details?: any;
  stackTrace?: string;
}

export interface WorkflowMetrics {
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  averageNodeDuration: number;
  totalDuration: number;
  resourceUsage?: {
    cpu: number;
    memory: number;
  };
}

export interface WorkflowValidation {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'syntax' | 'logic' | 'reference' | 'configuration';
  nodeId?: string;
  message: string;
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'best_practice' | 'deprecation';
  nodeId?: string;
  message: string;
  suggestion?: string;
}

export interface WorkflowOptimization {
  type: 'parallelization' | 'caching' | 'batching' | 'simplification';
  description: string;
  impact: 'low' | 'medium' | 'high';
  implementation?: string;
}