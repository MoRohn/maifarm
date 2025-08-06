export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp: Date;
  };
}

export interface Agent {
  id: string;
  farmId: string;
  name: string;
  type: 'primary' | 'secondary' | 'specialized';
  status: 'idle' | 'active' | 'processing' | 'error' | 'terminated';
  capabilities: string[];
  resources: {
    cpu: number;
    memory: number;
    gpu?: number;
  };
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    averageExecutionTime: number;
    uptime: number;
    efficiency: number;
  };
  config: Record<string, any>;
  lastHeartbeat: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Farm {
  id: string;
  name: string;
  description?: string;
  status: 'preparing' | 'running' | 'paused' | 'failed' | 'terminated';
  agents: string[]; // Agent IDs
  provider?: 'claude' | 'qwen'; // AI provider for this farm
  config: {
    yaml?: string;
    maxAgents: number;
    resourceLimits: {
      totalCpu: number;
      totalMemory: number;
      totalGpu?: number;
    };
    orchestrationStrategy: 'round-robin' | 'least-loaded' | 'priority' | 'custom';
  };
  metrics: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    queuedTasks: number;
    efficiency: number;
    resourceUtilization: {
      cpu: number;
      memory: number;
      gpu?: number;
    };
  };
  tags: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  farmId: string;
  agentId?: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'queued' | 'assigned' | 'processing' | 'completed' | 'failed' | 'cancelled';
  payload: Record<string, any>;
  result?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  dependencies: string[]; // Task IDs
  retries: number;
  maxRetries: number;
  timeout: number;
  metadata: Record<string, any>;
  createdAt: Date;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
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
  provider: 'claude' | 'qwen';
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
  provider: 'claude' | 'qwen';
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

export interface QwenSpecificConfig {
  contextWindow?: number; // Up to 256K tokens
  chainOfThought?: boolean;
  apiEndpoint?: string;
}

export interface ClaudeSpecificConfig {
  constitutionalAI?: boolean;
  apiEndpoint?: string;
}