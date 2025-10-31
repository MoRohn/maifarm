// Core type definitions for MaiFarm V2

// Re-export unified types
export * from '../../../shared/types/unified';

// Keep existing specialized exports
export * from './security';
export * from './reporting';
// Selectively export harvest types that don't conflict with unified
export type { 
  HarvestResult,
  HarvestInsight,
  HarvestYield,
  HarvestFilter,
  HarvestExport,
  HarvestSummary
} from './harvest';
// Don't re-export agent here to avoid duplicates with unified types
// export * from './agent';

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

// Import unified types
import type { 
  AgentStatus as UnifiedAgentStatus,
  Agent as UnifiedAgent,
  Farm as UnifiedFarm,
  AgentHealth,
  AgentState
} from '../../../shared/types/unified';

// Re-export for backward compatibility
export type AgentStatus = UnifiedAgentStatus;

// Use unified Agent interface but extend for backward compatibility
export interface Agent extends UnifiedAgent {
  // Keep backward compatibility fields
  memory?: number;
  cpu?: number;
  lastActive?: Date;
  performance?: {
    cpuUsage: number;
    memoryUsage: number;
    responseTime: number;
    throughput: number;
  };
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
  tasks?: Array<{
    id: string;
    type: string;
    status: string;
    priority: string;
    createdAt: Date;
  }>;
  // Properties from AgentInstance for compatibility
  instanceId?: string;
  poolId?: string;
  state?: AgentState;
  assignedTasks?: string[];
  startTime?: Date;
  lastHealthCheck?: Date;
  restartCount?: number;
  metadata?: Record<string, any>;
}

// Use unified Farm interface but extend for backward compatibility
export interface Farm extends UnifiedFarm {
  // Keep backward compatibility fields
  type?: 'sequential' | 'collaborative' | 'autonomous';
  owner?: string;
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
    status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
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
  autoScale?: boolean;
  maxAgents?: number;
  timeout?: number;
  orchestrationStrategy?: OrchestrationStrategy;
  resourceLimits?: {
    totalCpu: number;
    totalMemory: number;
    totalGpu?: number;
  };
  collaborative?: boolean;
  processId?: string;
  orchestratorType?: 'xenosync'; // XenoSync is the only orchestrator
  quickTask?: boolean;
  retryPolicy?: {
    enabled: boolean;
    maxRetries: number;
    backoffMultiplier: number;
  };
  goWildMode?: {
    enabled: boolean;
    creativityLevel: 1 | 2 | 3 | 4 | 5;
    boundaries: string[];
  };
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
