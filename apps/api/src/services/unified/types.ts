/**
 * Unified Type Definitions for all Services
 * Central location for all service-related types
 */

// ============== Farm Types ==============
export interface Farm {
  id: string;
  name: string;
  description: string;
  config: FarmConfig;
  status: FarmStatus;
  agents: Agent[];
  createdAt: Date;
  updatedAt: Date;
  mode: FarmMode;
  orchestrator: OrchestratorType;
  timeout: number; // in seconds
  sessionName?: string;
  workspaceId?: string;
  harvestId?: string;
}

export type FarmStatus =
  | 'idle'
  | 'launching'
  | 'active'
  | 'running'
  | 'harvesting'
  | 'completed'
  | 'failed'
  | 'crashed'
  | 'stopped'
  | 'stopping'
  | 'terminated';

export type FarmMode =
  | 'farm'
  | 'quick'
  | 'gowild'
  | 'sequential'
  | 'collaborative'
  | 'parallel';

export type OrchestratorType =
  | 'standard'
  | 'xenosync'
  | 'multiclaude'
  | 'llama';

export interface FarmConfig {
  numberOfAgents: number;
  prompt: string;
  yamlContent?: string;
  steps?: string[];
  provider?: string;
  model?: string;
  contextFiles?: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
}

export interface CreateFarmInput {
  id?: string;
  name: string;
  description: string;
  config: FarmConfig;
  mode?: FarmMode;
  orchestrator?: OrchestratorType;
  timeout?: number;
}

// ============== Agent Types ==============
export interface Agent {
  id: string;
  farmId: string;
  name: string;
  type: string;
  status: AgentStatus;
  sessionName: string;
  paneIndex: number;
  createdAt: Date;
  updatedAt: Date;
  lastHeartbeat?: Date;
  metrics?: AgentMetrics;
  error?: string;
}

export type AgentStatus =
  | 'idle'
  | 'launching'
  | 'ready'
  | 'working'
  | 'completed'
  | 'failed'
  | 'terminated';

export interface AgentMetrics {
  tasksCompleted: number;
  tasksInProgress: number;
  totalTokens: number;
  errorCount: number;
  averageResponseTime: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

// ============== Terminal Types ==============
export interface TerminalSession {
  id: string;
  farmId: string;
  agentId: string;
  sessionName: string;
  paneId: string;
  outputPath: string;
  isActive: boolean;
  createdAt: Date;
}

export interface TerminalOutput {
  sessionId: string;
  agentId: string;
  lines: string[];
  timestamp: Date;
}

// ============== Harvest Types ==============
export interface Harvest {
  id: string;
  farmId: string;
  farmName: string;
  status: HarvestStatus;
  files: HarvestFile[];
  summary: HarvestSummary;
  createdAt: Date;
  completedAt?: Date;
}

export type HarvestStatus =
  | 'pending'
  | 'collecting'
  | 'processing'
  | 'ready'
  | 'failed';

export interface HarvestFile {
  path: string;
  content: string;
  size: number;
  type: string;
  createdAt: Date;
}

export interface HarvestSummary {
  totalFiles: number;
  totalSize: number;
  duration: number;
  agentCount: number;
  successRate: number;
}

// ============== Monitoring Types ==============
export interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: {
    incoming: number;
    outgoing: number;
  };
  timestamp: Date;
}

export interface ServiceHealth {
  service: string;
  healthy: boolean;
  message?: string;
  lastCheck: Date;
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  context: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
}

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

// ============== WebSocket Types ==============
export interface WebSocketMessage {
  event: string;
  data: any;
  timestamp: Date;
  correlationId?: string;
}

export interface WebSocketClient {
  id: string;
  userId?: string;
  roles?: string[];
  connectedAt: Date;
  lastActivity: Date;
}

// ============== Auth Types ==============
export interface User {
  id: string;
  email: string;
  username: string;
  roles: string[];
  apiKeys?: ApiKey[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  id: string;
  userId: string;
  provider: string;
  encryptedKey: string;
  lastUsed?: Date;
  createdAt: Date;
}

// ============== Database Types ==============
export interface DatabaseConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  poolSize: number;
  isConnected: boolean;
}

// ============== Cache Types ==============
export interface CacheEntry {
  key: string;
  value: any;
  ttl?: number;
  createdAt: Date;
  expiresAt?: Date;
}

// ============== File Types ==============
export interface FileInfo {
  path: string;
  size: number;
  type: string;
  createdAt: Date;
  modifiedAt: Date;
  permissions: string;
}

// ============== Notification Types ==============
export interface Notification {
  id: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: Date;
}

export type NotificationType =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'farm_started'
  | 'farm_completed'
  | 'agent_failed'
  | 'harvest_ready';

// ============== Service Base Interfaces ==============
export interface BaseService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;
  getStats(): Record<string, any>;
}

// ============== Error Types ==============
export interface ServiceError {
  code: string;
  message: string;
  service: string;
  context?: Record<string, any>;
  stack?: string;
}