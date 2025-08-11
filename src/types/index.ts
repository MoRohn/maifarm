// Core type definitions for MaiFarm V2

// Import types needed for Agent interface
import type { AgentState, AgentHealth } from './agent';

// Export additional type definitions
export * from './security';
export * from './reporting';
export * from './harvest';
export * from './agent';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  credits: number;
  tier: 'free' | 'pro' | 'enterprise';
  preferences: {
    theme: 'light' | 'dark' | 'system';
    notifications: boolean;
    language: string;
    goWild?: {
      creativityLevel: number;
      explorationDepth: number;
      maxDuration: number;
      boundaries: {
        allowExternalAPIs: boolean;
        allowFileSystem: boolean;
        allowNetworkRequests: boolean;
        restrictedDomains: string[];
      };
      focusAreas: string[];
    };
  };
  notifications?: Notification[];
}

// Agent status enum for better type safety
export type AgentStatus = 
  | 'idle' 
  | 'working' 
  | 'completed' 
  | 'error' 
  | 'paused' 
  | 'busy' 
  | 'running' 
  | 'failed' 
  | 'provisioning' 
  | 'starting' 
  | 'stopping' 
  | 'stopped'
  | 'initializing'
  | 'draining'
  | 'terminating'
  | 'terminated';

export interface Agent {
  id: string;
  name: string;
  type: 'builder' | 'reviewer' | 'tester' | 'documenter' | 'custom';
  status: AgentStatus;
  progress: number;
  currentTask?: string;
  memory: number;
  cpu: number;
  lastActive: Date;
  capabilities: string[];
  lastHeartbeat?: Date;
  performance?: {
    cpuUsage: number;
    memoryUsage: number;
    responseTime: number;
    throughput: number;
  };
  // Additional properties for agent lifecycle and resource management
  lifecycle?: {
    state: AgentStatus;
    phase: string;
    startTime: Date;
    lastUpdate: Date;
    health?: {
      status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
      lastCheck?: Date;
    };
  };
  resources?: {
    cpu: { usage?: number; allocated?: number; limit?: number };
    memory: { usage?: number; allocated?: number; limit?: number };
    network?: { inbound?: string; outbound?: string };
    cpuUsage?: number;
    memoryUsage?: number;
  };
  tasks?: Array<{
    id: string;
    type: string;
    status: string;
    priority: string;
    createdAt: Date;
  }>;
  metrics?: {
    tasksCompleted: number;
    filesCreated?: number;  // New: Count of files created by agent
    successRate: number;
    averageTaskDuration: number;
    uptime: number;
    tasksFailed?: number;
  };
  // Properties from AgentInstance for compatibility
  instanceId?: string;
  poolId?: string;
  farmId?: string;
  state?: AgentState;
  health?: AgentHealth;
  assignedTasks?: string[];
  startTime?: Date;
  lastHealthCheck?: Date;
  restartCount?: number;
  metadata?: Record<string, any>;
}

export interface Farm {
  id: string;
  name: string;
  description: string;
  type: 'sequential' | 'collaborative' | 'autonomous';
  status: 'active' | 'paused' | 'completed' | 'failed' | 'running' | 'launching';
  provider?: 'claude' | 'qwen';
  agents: Agent[];
  createdAt: Date;
  updatedAt: Date;
  owner: string;
  config: FarmConfig;
  metrics: FarmMetrics;
  // Additional properties for workflow and monitoring
  workflows?: Array<{
    id: string;
    name: string;
    status: string;
    steps: any[];
  }>;
  startTime?: Date;
  // Resources for the farm
  resources?: {
    cpu: {
      total: number;
      used: number;
      percentage: number;
    };
    memory: {
      total: number;
      used: number;
      percentage: number;
    };
    disk: {
      total: number;
      used: number;
      percentage: number;
    };
  };
  template?: string;
  // Task management properties
  tasks?: Array<{
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    assignedTo?: string;
    progress?: number;
    createdAt: Date;
    updatedAt?: Date;
  }>;
  // Health monitoring properties
  health?: {
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    lastCheck?: Date;
    checks?: Array<{
      name: string;
      status: 'pass' | 'warn' | 'fail';
      message?: string;
      timestamp: Date;
    }>;
    uptime?: number;
    responseTime?: number;
  };
}

export interface FarmConfig {
  yaml?: string;
  autoScale: boolean;
  autoScaling?: boolean | {
    enabled: boolean;
    minAgents: number;
    maxAgents: number;
    targetUtilization?: number;
    scaleUpThreshold?: number;
    scaleDownThreshold?: number;
  };
  maxAgents: number;
  timeout?: number;
  collaborative?: boolean;
  processId?: string;
  retryPolicy: {
    enabled: boolean;
    maxRetries: number;
    backoffMultiplier: number;
  };
  goWildMode?: {
    enabled: boolean;
    creativityLevel: 1 | 2 | 3 | 4 | 5;
    boundaries: string[];
  };
  failover?: {
    enabled: boolean;
    strategy: string;
    backupRegions?: string[];
  };
  autoPauseOnClose?: boolean; // Per-farm setting for auto-pause behavior
  persistInBackground?: boolean; // Persist farm data in database after completion
}

export interface FarmMetrics {
  totalTasks: number;
  completedTasks: number;
  filesCreated?: number;  // New: Total files created by all agents in farm
  failedTasks: number;
  avgCompletionTime: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    network: number;
  };
  resourceUtilization?: {
    cpu: number;
    memory: number;
    disk: number;
  };
  collaborationScore: number;
  efficiency: number;
  // Additional metrics for agent management
  totalAgents?: number;
  activeAgents?: number;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  farmId?: string;
  agentId?: string;
}

export interface WebSocketMessage {
  type: 'agent_update' | 'farm_update' | 'notification' | 'metrics_update' | 
        'goWild:started' | 'goWild:node-added' | 'goWild:discovery-made' | 
        'goWild:status-changed' | 'goWild:path-changed' | 'goWild:boundary-reached' |
        'workflow:status:update' | 'farm:setup:progress' | 'farm:updated' | 'farm:deleted' |
        'agent:lifecycle:change' | 'task_completed' | 'insight_generated' | 
        'workflow:execution:started' | 'workflow:execution:progress' | 'workflow:execution:completed' |
        'workflow:node:started' | 'workflow:node:completed' | string;
  payload: any;
  data?: any; // Legacy support
  timestamp: Date;
}

export interface HistoricalFarm extends Farm {
  archived: Date;
  summary: {
    totalDuration: number;
    peakResourceUsage: ResourceUsage;
    insights: string[];
    recommendations: string[];
  };
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
  network: number;
  disk: number;
  timestamp: Date;
}

export interface YAMLTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  yaml: string;
  parameters: YAMLParameter[];
  popularity: number;
  aiGenerated?: boolean;
}

export interface YAMLParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  default?: any;
  required: boolean;
}