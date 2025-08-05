export type AgentHealthStatus = 'working' | 'idle' | 'error' | 'disabled';

export interface AgentHealth {
  agentId: string;
  status: AgentHealthStatus;
  lastHeartbeat: Date;
  contextPercentage: number;
  cycleTime: number; // Average time between heartbeats in ms
  errorCount: number;
  startTime: Date;
  totalCycles: number;
  lastError?: string;
  metadata?: Record<string, any>;
}

export interface HeartbeatData {
  agentId: string;
  timestamp: Date;
  contextPercentage?: number;
  currentTask?: string;
  error?: string;
}

export interface AgentHealthConfig {
  heartbeatInterval: number; // Expected interval between heartbeats in ms
  timeoutMultiplier: number; // Multiplier for adaptive timeout calculation
  maxContextPercentage: number; // Threshold for context warning
  staleHeartbeatMinutes: number; // Minutes before considering heartbeat stale
  errorCountThreshold: number; // Error count before marking agent as error state
}

export interface AgentHealthSummary {
  totalAgents: number;
  workingAgents: number;
  idleAgents: number;
  errorAgents: number;
  disabledAgents: number;
  averageContextUsage: number;
  averageCycleTime: number;
}

export interface AdaptiveTimeoutConfig {
  minTimeout: number; // Minimum timeout in ms
  maxTimeout: number; // Maximum timeout in ms
  windowSize: number; // Number of cycles to consider for averaging
}