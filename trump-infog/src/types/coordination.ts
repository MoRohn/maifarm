/**
 * Coordination types for Trump Infog multi-agent system
 */

// Agent types and roles
export type AgentType = 'backend' | 'frontend' | 'data' | 'qa';

export interface AgentInfo {
  agentId: string;
  agentType: AgentType;
  capabilities: string[];
  status: AgentStatus;
  startTime: string;
  lastHeartbeat: string;
  resources: {
    cpu: string;
    memory: string;
  };
}

export type AgentStatus = 'initializing' | 'ready' | 'busy' | 'error' | 'offline';

// Task management
export interface Task {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  title: string;
  description: string;
  requirements: string[];
  dependencies: string[];
  assignedTo?: string;
  status: TaskStatus;
  createdAt: string;
  createdBy: string;
  claimedAt?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedTime?: string;
  actualTime?: string;
  progress?: number;
  outputs?: TaskOutputs;
  metadata?: Record<string, any>;
}

export type TaskType = 'feature' | 'bug' | 'refactor' | 'test' | 'docs' | 'infrastructure';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'claimed' | 'in_progress' | 'review' | 'completed' | 'failed' | 'blocked';

export interface TaskOutputs {
  files: string[];
  apis: string[];
  tests: string[];
  docs: string[];
  migrations?: string[];
  configs?: string[];
}

// Coordination events
export interface CoordinationEvent {
  id: string;
  timestamp: string;
  agentId: string;
  eventType: EventType;
  payload: any;
  correlationId?: string;
  sequenceNumber?: number;
}

export type EventType = 
  | 'agent:registered'
  | 'agent:ready'
  | 'agent:heartbeat'
  | 'agent:offline'
  | 'task:created'
  | 'task:claimed'
  | 'task:started'
  | 'task:progress'
  | 'task:completed'
  | 'task:failed'
  | 'task:blocked'
  | 'resource:requested'
  | 'resource:granted'
  | 'resource:released'
  | 'sync:requested'
  | 'sync:completed'
  | 'error:reported';

// Resource management
export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  owner?: string;
  locked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  version?: number;
  metadata?: Record<string, any>;
}

export type ResourceType = 'database' | 'api' | 'file' | 'service' | 'config';

// Dependencies
export interface Dependency {
  id: string;
  type: DependencyType;
  source: string;
  target: string;
  status: DependencyStatus;
  metadata?: Record<string, any>;
}

export type DependencyType = 'blocking' | 'soft' | 'optional';
export type DependencyStatus = 'pending' | 'satisfied' | 'failed';

// State synchronization
export interface SharedState {
  projectId: string;
  version: number;
  lastUpdated: string;
  lastUpdatedBy: string;
  state: ProjectState;
}

export interface ProjectState {
  phase: ProjectPhase;
  agents: Record<string, AgentInfo>;
  tasks: Record<string, Task>;
  resources: Record<string, Resource>;
  dependencies: Dependency[];
  metrics: ProjectMetrics;
}

export type ProjectPhase = 'setup' | 'development' | 'integration' | 'testing' | 'deployment' | 'maintenance';

export interface ProjectMetrics {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  averageTaskTime: number;
  agentUtilization: Record<string, number>;
  lastUpdated: string;
}

// Distributed lock
export interface DistributedLock {
  resource: string;
  token: string;
  agentId: string;
  acquiredAt: string;
  ttl: number;
}

// Health monitoring
export interface Heartbeat {
  agentId: string;
  timestamp: string;
  status: HealthStatus;
  metrics: AgentMetrics;
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface AgentMetrics {
  tasksCompleted: number;
  tasksInProgress: number;
  tasksFailed: number;
  cpuUsage: number;
  memoryUsage: number;
  lastTaskCompletedAt?: string;
  errors: number;
  warnings: number;
}

// Error handling
export interface CoordinationError {
  id: string;
  code: string;
  message: string;
  agentId: string;
  taskId?: string;
  severity: ErrorSeverity;
  timestamp: string;
  stackTrace?: string;
  context?: Record<string, any>;
}

export type ErrorSeverity = 'warning' | 'error' | 'critical';

// WebSocket message types
export interface WSMessage<T = any> {
  type: string;
  payload: T;
  timestamp: string;
  from: string;
  to?: string | string[];
  correlationId?: string;
}

// Agent communication
export interface AgentMessage {
  id: string;
  from: string;
  to: string | string[];
  subject: string;
  body: any;
  priority: 'low' | 'normal' | 'high';
  timestamp: string;
  expiresAt?: string;
  requiresAck?: boolean;
}

// Configuration
export interface CoordinationConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  websocket: {
    url: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
  };
  heartbeat: {
    interval: number;
    timeout: number;
  };
  task: {
    maxConcurrent: number;
    claimTimeout: number;
    progressInterval: number;
  };
  lock: {
    defaultTTL: number;
    retryInterval: number;
    maxRetries: number;
  };
}

// API responses
export interface CoordinationResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

// Utility types
export type AgentCapability = 
  | 'api-development'
  | 'frontend-development'
  | 'database-design'
  | 'testing'
  | 'deployment'
  | 'monitoring'
  | 'documentation'
  | 'security'
  | 'performance-optimization';

export interface TaskClaim {
  taskId: string;
  agentId: string;
  estimatedTime: string;
  reason?: string;
}

export interface TaskProgress {
  taskId: string;
  agentId: string;
  progress: number;
  message?: string;
  blockers?: string[];
  estimatedCompletion?: string;
}

export interface ResourceRequest {
  resourceId: string;
  agentId: string;
  operation: 'read' | 'write' | 'delete';
  duration?: number;
  priority?: 'low' | 'normal' | 'high';
}