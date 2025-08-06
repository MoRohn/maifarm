// Advanced monitoring types for MaiFarm V2

import { Agent, ResourceUsage } from './index';

export interface MonitoringData {
  agents: AgentMonitoringData[];
  resources: ResourceMetrics;
  communication: CommunicationGraph;
  predictions: ErrorPrediction[];
  timestamp: Date;
}

export interface AgentMonitoringData extends Agent {
  resourceHistory: ResourceHistory;
  taskHistory: TaskEvent[];
  errorCount: number;
  warningCount: number;
  communicationStats: {
    messagesSent: number;
    messagesReceived: number;
    avgResponseTime: number;
  };
  performanceMetrics: {
    taskCompletionRate: number;
    avgTaskDuration: number;
    efficiency: number;
  };
}

export interface ResourceHistory {
  cpu: TimeSeriesData[];
  memory: TimeSeriesData[];
  network: TimeSeriesData[];
  disk: TimeSeriesData[];
}

export interface TimeSeriesData {
  value: number;
  timestamp: Date;
}

export interface ResourceMetrics {
  overall: ResourceUsage;
  byAgent: Map<string, ResourceUsage>;
  predictions: {
    cpuTrend: 'increasing' | 'stable' | 'decreasing';
    memoryTrend: 'increasing' | 'stable' | 'decreasing';
    estimatedTimeToLimit: number | null;
  };
}

export interface CommunicationGraph {
  nodes: CommunicationNode[];
  edges: CommunicationEdge[];
  clusters: AgentCluster[];
}

export interface CommunicationNode {
  id: string;
  agentId: string;
  label: string;
  type: 'agent' | 'external' | 'system';
  position: { x: number; y: number; z: number };
  activity: number; // 0-1 scale
  status: 'active' | 'idle' | 'error';
  // D3 simulation properties
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
  index?: number;
}

export interface CommunicationEdge {
  id: string;
  source: string;
  target: string;
  weight: number; // Message frequency
  latency: number; // Average latency in ms
  type: 'sync' | 'async' | 'broadcast';
  active: boolean;
}

export interface AgentCluster {
  id: string;
  name: string;
  agentIds: string[];
  collaborationScore: number;
  purpose: string;
}

export interface ErrorPrediction {
  agentId: string;
  type: 'resource_exhaustion' | 'task_failure' | 'communication_breakdown' | 'deadlock';
  probability: number; // 0-1 scale
  estimatedTimeToError: number; // seconds
  suggestedActions: SuggestedAction[];
  confidence: number; // 0-1 scale
}

export interface SuggestedAction {
  id: string;
  type: 'restart' | 'scale' | 'throttle' | 'migrate' | 'investigate';
  description: string;
  impact: 'low' | 'medium' | 'high';
  automated: boolean;
  command?: string;
}

export interface TaskEvent {
  id: string;
  taskName: string;
  status: 'started' | 'completed' | 'failed' | 'cancelled';
  timestamp: Date;
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface MonitoringControl {
  type: 'pause' | 'resume' | 'restart' | 'terminate';
  targetId: string; // agent or farm ID
  reason?: string;
  force?: boolean;
}

export interface MonitoringAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  type: 'resource' | 'performance' | 'communication' | 'prediction';
  title: string;
  message: string;
  agentId?: string;
  farmId?: string;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
  suggestedActions?: SuggestedAction[];
}

export interface Resource3DVisualization {
  type: 'sphere' | 'cube' | 'cylinder' | 'custom';
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  color: string;
  opacity: number;
  animationSpeed: number;
  data: {
    label: string;
    value: number;
    unit: string;
    trend: 'up' | 'down' | 'stable';
  };
}

export interface MonitoringPreferences {
  refreshInterval: number; // milliseconds
  alertThresholds: {
    cpu: number;
    memory: number;
    errorRate: number;
    responseTime: number;
  };
  visualizations: {
    enable3D: boolean;
    particleEffects: boolean;
    animationSpeed: number;
  };
  notifications: {
    enableSound: boolean;
    enableDesktop: boolean;
    severityFilter: ('info' | 'warning' | 'error' | 'critical')[];
  };
}