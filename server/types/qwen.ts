export interface QwenModelInfo {
  name: string;
  parameters: string;
  contextWindow: number;
  localAvailable: boolean;
  localModel?: string;
  apiAvailable: boolean;
  useProxy: boolean;
  provider: 'proxy' | 'ollama' | 'api';
}

export interface QwenCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repetitionPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  stop?: string[];
  useLocal?: boolean;
}

export interface QwenResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  provider: 'proxy' | 'ollama' | 'api';
}

export interface QwenFarmConfig {
  id: string;
  name: string;
  description: string;
  agents: number;
  prompt: string;
  steps?: string[];
  collaborative?: boolean;
  sessionName?: string;
  projectPath: string;
  status: 'creating' | 'running' | 'stopped' | 'error';
  provider: 'qwen';
  useLocalModel?: boolean;
  modelName?: string;
}

export interface QwenAgentConfig {
  id: string;
  farmId: string;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error' | 'stopped';
  paneId?: string;
  startTime: Date;
  currentTask?: string;
  lastActivity?: Date;
  modelUsed?: string;
  tokensUsed?: number;
}

export interface QwenTaskResult {
  taskId: string;
  agentId: string;
  farmId: string;
  prompt: string;
  response: string;
  startTime: Date;
  endTime: Date;
  tokensUsed: number;
  modelUsed: string;
  success: boolean;
  error?: string;
}

export interface QwenMetrics {
  totalTokensUsed: number;
  totalCost: number;
  averageResponseTime: number;
  successRate: number;
  modelUsage: {
    [model: string]: {
      calls: number;
      tokens: number;
      errors: number;
    };
  };
}

export interface QwenProviderStatus {
  available: boolean;
  type: 'local' | 'api' | 'proxy';
  modelName?: string;
  modelVersion?: string;
  contextWindow?: number;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  health?: 'healthy' | 'degraded' | 'unhealthy';
  lastChecked?: Date;
}