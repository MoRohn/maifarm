// Farm orchestration type definitions

import { Agent, Farm, FarmConfig } from './index';

export interface FarmTemplate {
  id: string;
  name: string;
  description: string;
  category: 'development' | 'testing' | 'analysis' | 'deployment' | 'custom';
  icon?: string;
  config: FarmConfig;
  agentBlueprints: AgentBlueprint[];
  workflowTemplate?: WorkflowTemplate;
  requirements?: FarmRequirements;
  estimatedDuration?: number;
  popularity: number;
  tags: string[];
  createdBy: 'system' | 'user' | 'ai';
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentBlueprint {
  name: string;
  type: Agent['type'];
  capabilities: string[];
  resources: {
    cpu: number;
    memory: number;
    priority: 'low' | 'medium' | 'high';
  };
  scalingPolicy?: {
    minInstances: number;
    maxInstances: number;
    scaleTriggers: ScaleTrigger[];
  };
}

export interface ScaleTrigger {
  metric: 'cpu' | 'memory' | 'queue_depth' | 'response_time';
  threshold: number;
  duration: number;
  action: 'scale_up' | 'scale_down';
}

export interface FarmRequirements {
  minAgents: number;
  maxAgents: number;
  estimatedCpu: number;
  estimatedMemory: number;
  estimatedCost?: number;
  dependencies?: string[];
}

export interface FarmProvisioningStatus {
  farmId: string;
  status: 'provisioning' | 'ready' | 'failed' | 'terminated';
  progress: number;
  currentStep: string;
  steps: ProvisioningStep[];
  startTime: Date;
  endTime?: Date;
  error?: string;
}

export interface ProvisioningStep {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  duration?: number;
  error?: string;
}

export interface AgentLifecycleState {
  agentId: string;
  state: 'provisioning' | 'starting' | 'active' | 'stopping' | 'stopped' | 'failed';
  health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date;
  restartCount: number;
  errorCount: number;
  resources: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
  };
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  tasks: WorkflowTask[];
  dependencies: WorkflowDependency[];
  triggers?: WorkflowTrigger[];
  errorHandling?: ErrorHandlingPolicy;
}

export interface WorkflowTask {
  id: string;
  name: string;
  type: 'agent_task' | 'system_task' | 'external_api' | 'conditional' | 'parallel';
  agentType?: Agent['type'];
  config: Record<string, any>;
  timeout?: number;
  retryPolicy?: RetryPolicy;
  dependencies?: string[];
}

export interface WorkflowDependency {
  from: string;
  to: string;
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
  lag?: number;
}

export interface WorkflowTrigger {
  type: 'schedule' | 'event' | 'manual' | 'webhook';
  config: Record<string, any>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffType: 'linear' | 'exponential' | 'constant';
  initialDelay: number;
  maxDelay?: number;
  retryableErrors?: string[];
}

export interface ErrorHandlingPolicy {
  strategy: 'fail_fast' | 'continue_on_error' | 'rollback';
  fallbackTasks?: WorkflowTask[];
  notificationChannels?: string[];
}

export interface FarmExecution {
  id: string;
  farmId: string;
  workflowId: string;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  taskExecutions: TaskExecution[];
  metrics: ExecutionMetrics;
  logs: ExecutionLog[];
}

export interface TaskExecution {
  taskId: string;
  agentId?: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
  retryCount: number;
}

export interface ExecutionMetrics {
  totalDuration: number;
  taskCompletionRate: number;
  averageTaskDuration: number;
  resourcePeakUsage: {
    cpu: number;
    memory: number;
  };
  cost?: number;
}

export interface ExecutionLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface FarmPool {
  id: string;
  name: string;
  farms: Farm[];
  capacity: {
    totalAgents: number;
    availableAgents: number;
    totalCpu: number;
    availableCpu: number;
    totalMemory: number;
    availableMemory: number;
  };
  loadBalancingStrategy: 'round_robin' | 'least_loaded' | 'priority' | 'custom';
  healthStatus: 'healthy' | 'degraded' | 'critical';
}

export interface ExternalAPIConfig {
  id: string;
  name: string;
  type: 'rest' | 'graphql' | 'websocket' | 'grpc';
  baseUrl: string;
  authentication?: {
    type: 'none' | 'api_key' | 'oauth2' | 'basic';
    config: Record<string, any>;
  };
  headers?: Record<string, string>;
  timeout?: number;
  retryPolicy?: RetryPolicy;
  rateLimiting?: {
    requestsPerMinute: number;
    burstSize: number;
  };
}