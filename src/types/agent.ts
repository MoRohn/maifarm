// Agent lifecycle and management type definitions

import { Agent } from './index';

// Re-export Agent for consumers of this module
export type { Agent };

export interface AgentPool {
  id: string;
  name: string;
  description: string;
  agents: AgentInstance[];
  capacity: {
    min: number;
    max: number;
    current: number;
    available: number;
  };
  scalingPolicy: ScalingPolicy;
  healthCheck: HealthCheckConfig;
  metrics: PoolMetrics;
}

export interface AgentInstance extends Agent {
  instanceId: string;
  poolId: string;
  farmId?: string;
  state: AgentState;
  health: AgentHealth;
  resources: AgentResources;
  assignedTasks: string[];
  startTime: Date;
  lastHealthCheck: Date;
  restartCount: number;
  metadata: Record<string, any>;
}

export interface AgentState {
  current: 'initializing' | 'idle' | 'busy' | 'draining' | 'terminating' | 'terminated';
  previous?: string;
  transitionTime: Date;
  reason?: string;
}

export interface AgentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  checks: HealthCheck[];
  lastCheck: Date;
  lastUpdated?: Date;
  consecutiveFailures: number;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  timestamp: Date;
  duration: number;
}

export interface AgentResources {
  cpu: {
    cores?: number;
    usage?: number;
    allocated?: number;
    used?: number;
    limit?: number;
  };
  memory: {
    total?: string;
    used?: string;
    usage?: number;
    allocated?: number;
    limit?: number;
  };
  network?: {
    inbound?: string;
    outbound?: string;
  };
  // Flat properties for backward compatibility
  cpuUsage?: number;
  memoryUsage?: number;
  networkUsage?: number;
  // Legacy nested structure support
  allocated?: {
    cpu: number;
    memory: number;
    disk?: number;
  };
  used?: {
    cpu: number;
    memory: number;
    disk?: number;
  };
  limits?: {
    cpu: number;
    memory: number;
    disk?: number;
  };
  // Additional properties for full backward compatibility
  disk?: {
    total?: string;
    used?: string;
    usage?: number;
    allocated?: number;
    limit?: number;
  };
}

export interface ScalingPolicy {
  type: 'manual' | 'reactive' | 'predictive' | 'scheduled';
  enabled: boolean;
  rules: ScalingRule[];
  cooldown: {
    scaleUp: number;
    scaleDown: number;
  };
}

export interface ScalingRule {
  id: string;
  name: string;
  trigger: ScalingTrigger;
  action: ScalingAction;
  priority: number;
  enabled: boolean;
}

export interface ScalingTrigger {
  type: 'metric' | 'schedule' | 'event';
  metric?: {
    name: string;
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    threshold: number;
    duration: number;
    aggregation: 'avg' | 'min' | 'max' | 'sum';
  };
  schedule?: {
    cron: string;
    timezone?: string;
  };
  event?: {
    source: string;
    type: string;
    filters?: Record<string, any>;
  };
}

export interface ScalingAction {
  type: 'scale_out' | 'scale_in' | 'scale_to';
  value: number;
  constraints?: {
    minInstances?: number;
    maxInstances?: number;
    increment?: number;
  };
}

export interface HealthCheckConfig {
  interval: number;
  timeout: number;
  retries: number;
  checks: HealthCheckDefinition[];
}

export interface HealthCheckDefinition {
  name: string;
  type: 'http' | 'tcp' | 'process' | 'custom';
  config: Record<string, any>;
  critical: boolean;
}

export interface PoolMetrics {
  utilization: {
    cpu: number;
    memory: number;
    agentCount: number;
  };
  throughput: {
    tasksPerMinute: number;
    successRate: number;
    averageTaskDuration: number;
  };
  availability: {
    uptime: number;
    healthyAgents: number;
    degradedAgents: number;
    unhealthyAgents: number;
  };
}

export interface AgentLifecycleEvent {
  agentId: string;
  instanceId: string;
  type: 'created' | 'started' | 'stopped' | 'restarted' | 'scaled' | 'failed' | 'terminated';
  timestamp: Date;
  details: Record<string, any>;
  triggeredBy: 'system' | 'user' | 'policy' | 'health_check';
}

export interface AgentProvisioningRequest {
  poolId: string;
  count: number;
  agentType: Agent['type'];
  capabilities: string[];
  resources: {
    cpu: number;
    memory: number;
    disk?: number;
  };
  metadata?: Record<string, any>;
  placementConstraints?: PlacementConstraint[];
}

export interface PlacementConstraint {
  type: 'affinity' | 'anti_affinity' | 'spread' | 'pack';
  target: 'pool' | 'zone' | 'host';
  value?: string;
  weight?: number;
}

export interface AgentTask {
  id: string;
  agentId: string;
  type: 'build' | 'test' | 'deploy' | 'analyze' | 'custom';
  status: 'queued' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  payload: Record<string, any>;
  dependencies?: string[];
  timeout?: number;
  retryCount: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

export interface AgentCapability {
  name: string;
  version?: string;
  type: 'language' | 'framework' | 'tool' | 'service' | 'custom';
  metadata?: Record<string, any>;
}

export interface AgentSchedulingPolicy {
  strategy: 'round_robin' | 'least_loaded' | 'best_fit' | 'priority' | 'custom';
  constraints: SchedulingConstraint[];
  preferences: SchedulingPreference[];
}

export interface SchedulingConstraint {
  type: 'capability' | 'resource' | 'affinity' | 'time_window';
  operator: 'must' | 'must_not';
  value: any;
}

export interface SchedulingPreference {
  type: 'capability' | 'resource' | 'location' | 'cost';
  weight: number;
  value: any;
}