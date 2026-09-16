import { WorkflowExecution } from './workflow';

// Re-export for convenience
export type { WorkflowExecution };

export interface FarmTemplate {
  id: string
  name: string
  description: string
  type: 'development' | 'production' | 'research' | 'custom'
  configuration: {
    agents: AgentConfiguration[]
    resources: ResourceAllocation
    security: SecurityPolicy
    monitoring: MonitoringConfig
  }
  metadata: {
    createdAt: Date
    updatedAt: Date
    version: string
    author: string
    tags: string[]
  }
}

export interface AgentConfiguration {
  type: string
  count: number
  capabilities: string[]
  resources: {
    cpu: number
    memory: string
    storage: string
  }
  environment: Record<string, string>
  healthCheck?: HealthCheckConfig
}

export interface ResourceAllocation {
  totalCpu: number
  totalMemory: string
  totalStorage: string
  limits: {
    maxAgents: number
    maxConcurrentTasks: number
    maxQueueDepth: number
  }
}

export interface SecurityPolicy {
  authentication: {
    required: boolean
    methods: string[]
  }
  authorization: {
    roleBasedAccess: boolean
    permissions: Permission[]
  }
  encryption: {
    atRest: boolean
    inTransit: boolean
    algorithm: string
  }
}

export interface Permission {
  resource: string
  actions: string[]
  conditions?: Record<string, any>
}

export interface MonitoringConfig {
  metricsEnabled: boolean
  loggingLevel: 'debug' | 'info' | 'warn' | 'error'
  alerting: {
    enabled: boolean
    channels: AlertChannel[]
    rules: AlertRule[]
  }
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty'
  configuration: Record<string, any>
}

export interface AlertRule {
  id: string
  name: string
  condition: string
  threshold: number
  duration: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  actions: string[]
}

export interface HealthCheckConfig {
  endpoint?: string
  interval: number
  timeout: number
  retries: number
  successThreshold: number
  failureThreshold: number
}

export interface FarmSetupRequest {
  templateId?: string
  name: string
  description?: string
  configuration?: Partial<FarmTemplate['configuration']>
  autoStart: boolean
  autoPauseOnClose?: boolean
}

export interface FarmSetupProgress {
  farmId: string
  status: 'initializing' | 'provisioning' | 'configuring' | 'validating' | 'ready' | 'failed'
  progress: number
  currentStep: string
  steps: SetupStep[]
  startedAt: Date
  completedAt?: Date
  error?: string
}

export interface SetupStep {
  name: string
  status: 'pending' | 'active' | 'completed' | 'failed'
  progress: number
  startedAt?: Date
  completedAt?: Date
  error?: string
}

// Import base types and extend them
import { Farm as BaseFarm, Agent as BaseAgent, FarmConfig, FarmMetrics } from './index'

// Re-export base types for convenience
export type Farm = BaseFarm
export type Agent = BaseAgent

// Extended Farm type for orchestration features
export interface OrchestrationFarm extends Omit<BaseFarm, 'workflows' | 'resources' | 'template'> {
  template?: FarmTemplate | string
  workflows?: Workflow[]
  resources?: OrchestrationResourceUsage
  metadata?: Record<string, any>
}

export type FarmStatus = 'launching' | 'active' | 'completed' | 'stopped'

export interface OrchestrationResourceUsage {
  cpu: {
    used: number
    allocated: number
    percentage: number
    total?: number
  }
  memory: {
    used: string | number
    allocated: string | number
    percentage: number
    total?: number
  }
  storage?: {
    used: string | number
    allocated: string | number
    percentage: number
    total?: number
  }
  disk?: {
    total: number
    used: number
    percentage: number
  }
}

// Extended Agent type for orchestration features
export interface OrchestrationAgent extends Omit<BaseAgent, 'lifecycle'> {
  lifecycle?: AgentLifecycle
  tasks?: Task[]
}

export type AgentStatus = 'provisioning' | 'starting' | 'active' | 'busy' | 'idle' | 'stopping' | 'stopped' | 'failed'

export interface AgentLifecycle {
  state: AgentStatus
  history: LifecycleEvent[]
  health: HealthStatus
  lastHealthCheck: Date
}

export interface LifecycleEvent {
  timestamp: Date
  fromState: AgentStatus
  toState: AgentStatus
  reason?: string
  metadata?: Record<string, any>
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  checks: HealthCheck[]
  lastUpdated: Date
}

export interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message?: string
  timestamp: Date
}

export interface AgentResources {
  cpu: {
    cores: number
    usage: number
  }
  memory: {
    total: string
    used: string
    usage: number
  }
  network: {
    inbound: string
    outbound: string
  }
  // Add flat properties expected by components
  cpuUsage?: number
  memoryUsage?: number
  networkUsage?: number
}

export interface AgentMetrics {
  tasksCompleted: number
  tasksFailed: number
  averageTaskTime: number
  uptime: number
  errorRate: number
}

export interface Task {
  id: string
  agentId: string
  workflowId?: string
  type: string
  status: TaskStatus
  priority: 'low' | 'medium' | 'high' | 'critical'
  payload: Record<string, any>
  result?: Record<string, any>
  error?: string
  retries: number
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

export type TaskStatus = 'pending' | 'assigned' | 'active' | 'completed' | 'failed' | 'cancelled'

// FarmConfig and FarmMetrics are imported from ./index
// No need to redefine them here

export interface AgentLifecycleEvent {
  agentId: string;
  farmId: string;
  event: 'provisioned' | 'started' | 'stopped' | 'terminated' | 'error';
  timestamp: Date;
  details?: any;
}

export interface FarmScalingEvent {
  farmId: string;
  action: 'scale_up' | 'scale_down';
  previousCount: number;
  newCount: number;
  reason: string;
  timestamp: Date;
}

export interface WorkflowInstance {
  id: string;
  farmId: string;
  workflowId: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface FarmHealthStatus {
  farmId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    agentAvailability: boolean;
    resourceUtilization: boolean;
    workflowExecution: boolean;
    connectivity: boolean;
  };
  lastChecked: Date;
}

export interface Workflow {
  id: string
  farmId: string
  name: string
  description?: string
  status: WorkflowStatus
  definition: WorkflowDefinition
  execution?: WorkflowExecution
  createdAt: Date
  updatedAt: Date
}

export type WorkflowStatus = 'draft' | 'ready' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface WorkflowDefinition {
  version: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: Record<string, any>
  triggers?: WorkflowTrigger[]
  timeout?: number
}

export interface WorkflowNode {
  id: string
  type: 'task' | 'condition' | 'parallel' | 'sequential' | 'loop'
  name: string
  configuration: Record<string, any>
  position: { x: number; y: number }
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  condition?: string
  label?: string
}

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'event' | 'webhook'
  configuration: Record<string, any>
}

export interface OrchestrationWorkflowExecution {
  id: string
  workflowId: string
  status: WorkflowStatus
  progress: number
  currentNodes: string[]
  completedNodes: string[]
  failedNodes: string[]
  variables: Record<string, any>
  startedAt: Date
  completedAt?: Date
  error?: string
}

export interface OrchestrationConfig {
  maxRetries: number
  retryDelay: number
  retryBackoff: 'linear' | 'exponential'
  timeout: number
  circuitBreaker: {
    enabled: boolean
    threshold: number
    timeout: number
  }
  failover: {
    enabled: boolean
    strategy: 'round-robin' | 'least-loaded' | 'random'
    healthCheckInterval: number
  }
}

export interface ExternalApiConfig {
  id: string
  name: string
  type: string
  endpoint: string
  authentication: {
    type: 'none' | 'api-key' | 'oauth2' | 'basic'
    configuration: Record<string, any>
  }
  headers?: Record<string, string>
  timeout?: number
  retries?: number
}

export interface OrchestrationEvent {
  id: string
  type: string
  source: string
  timestamp: Date
  data: Record<string, any>
}

export interface OrchestrationError {
  code: string
  message: string
  details?: Record<string, any>
  retryable: boolean
  timestamp: Date
}

export interface ExternalIntegration {
  id: string
  name: string
  type: 'api' | 'webhook' | 'database' | 'service' | 'custom' | 'github' | 'gitlab' | 'slack' | 'discord' | 'docker' | 'aws'
  config: ExternalApiConfig
  status: 'active' | 'inactive' | 'error' | 'connected' | 'disconnected'
  lastSync?: Date
  metadata?: Record<string, any>
}