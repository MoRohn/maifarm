// Re-export unified types
export type {
  ApiResponse,
  Agent,
  AgentStatus,
  AgentHealth,
  AgentType,
  Farm,
  FarmStatus,
  OrchestrationStrategy,
  AIProvider,
  Task,
  TaskPriority,
  TaskStatus,
  TerminalOutput,
  TerminalStreamStatus,
  Harvest,
  HarvestStatus,
  HarvestFile,
  WebSocketEvent,
  WebSocketMessage,
  LogLevel,
  LogEntry,
  TIMING
} from '../../../shared/types/unified';

// Import the actual types
import type {
  Agent as UnifiedAgent,
  Farm as UnifiedFarm,
  Task as UnifiedTask
} from '../../../shared/types/unified';

// Re-export with compatibility
export { 
  type UnifiedAgent as Agent,
  type UnifiedFarm as Farm,
  type UnifiedTask as Task
}

export interface Metric {
  id: string;
  source: 'agent' | 'farm' | 'system';
  sourceId: string;
  type: string;
  name: string;
  value: number;
  unit?: string;
  labels: Record<string, string>;
  timestamp: Date;
}

export interface User {
  id: string;
  email: string;
  username: string;
  roles: string[];
  permissions: string[];
  apiKeys?: string[];
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface FilterQuery {
  status?: string;
  type?: string;
  farmId?: string;
  agentId?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
}

export interface WebSocketEvent<T = any> {
  event: string;
  data: T;
  timestamp: Date;
  source?: string;
}

export interface AuthToken {
  userId: string;
  roles: string[];
  permissions: string[];
  exp: number;
  iat: number;
}

// AI Provider Types
export interface AIProviderRequest {
  provider: 'claude' | 'openai';
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: Record<string, any>;
}

export interface AIProviderResponse {
  provider: 'claude' | 'openai';
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  metadata?: Record<string, any>;
}

export interface ClaudeSpecificConfig {
  constitutionalAI?: boolean;
  apiEndpoint?: string;
}

export interface OpenAISpecificConfig {
  model?: string;
  apiEndpoint?: string;
}
