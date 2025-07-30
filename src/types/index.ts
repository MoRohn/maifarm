// Core type definitions for MaiFarm V2

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
  };
}

export interface Agent {
  id: string;
  name: string;
  type: 'builder' | 'reviewer' | 'tester' | 'documenter' | 'custom';
  status: 'idle' | 'working' | 'completed' | 'error' | 'paused';
  progress: number;
  currentTask?: string;
  memory: number;
  cpu: number;
  lastActive: Date;
  capabilities: string[];
}

export interface Farm {
  id: string;
  name: string;
  description: string;
  type: 'sequential' | 'collaborative' | 'autonomous';
  status: 'active' | 'paused' | 'completed' | 'failed';
  agents: Agent[];
  createdAt: Date;
  updatedAt: Date;
  owner: string;
  config: FarmConfig;
  metrics: FarmMetrics;
}

export interface FarmConfig {
  yaml?: string;
  autoScale: boolean;
  maxAgents: number;
  timeout?: number;
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
}

export interface FarmMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgCompletionTime: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    network: number;
  };
  collaborationScore: number;
  efficiency: number;
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
  type: 'agent_update' | 'farm_update' | 'notification' | 'metrics_update';
  payload: any;
  timestamp: Date;
}

export interface HistoricalFarm extends Farm {
  archivedAt: Date;
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