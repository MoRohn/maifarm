export interface AIProvider {
  initialize(): Promise<void>;
  completion(messages: any[], options?: any): Promise<AIResponse>;
  streamCompletion?(messages: any[], options?: any): Promise<AsyncGenerator<string>>;
  resetContext?(): Promise<void>;
  getStatus(): Promise<any>;
  shutdown(): Promise<void>;
}

export interface AIResponse {
  content: string;
  role: 'assistant' | 'system' | 'user';
  usage?: TokenUsage;
  cost?: number;
  model?: string;
  requestId?: string;
  finishReason?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: 'claude' | 'openai';
  maxTokens: number;
  contextWindow: number;
  costPer1kPromptTokens: number;
  costPer1kCompletionTokens: number;
  capabilities: string[];
  isAvailable: boolean;
}

export interface ContextWindow {
  maxSize: number;
  currentSize: number;
  messages: any[];
  metadata?: Record<string, any>;
}

export interface CostEstimate {
  promptCost: number;
  completionCost: number;
  totalCost: number;
  currency: string;
}

export interface AIProviderConfig {
  provider: 'claude' | 'openai';
  apiKey?: string;
  model: string;
  endpoint?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  enabled: boolean;
}

export interface AIProviderStatus {
  provider: string;
  enabled: boolean;
  initialized: boolean;
  model: string;
  contextSize?: number;
  budgetStatus?: any;
  rateLimitStatus?: any;
  performanceMetrics?: any;
  error?: string;
}