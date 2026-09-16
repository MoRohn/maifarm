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
  // CRITICAL FIX: Added all AI providers including grok
  provider: 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama' | 'ollama';
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
  // CRITICAL FIX: Added all AI providers including grok
  provider: 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama' | 'ollama';
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
  version?: AIEngineVersion;
  availableModels?: AIModelInfo[];
}

/**
 * AI Engine Version Information
 */
export interface AIEngineVersion {
  current: string;
  latest: string;
  releaseDate: string;
  deprecationDate?: string;
  isDeprecated: boolean;
  updateAvailable: boolean;
  changelogUrl?: string;
  migrationGuideUrl?: string;
}

/**
 * Detailed AI Model Information
 */
export interface AIModelInfo {
  id: string;
  name: string;
  displayName: string;
  // CRITICAL FIX: Added all AI providers including grok
  provider: 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama' | 'ollama';
  version: string;
  releaseDate: string;
  isDefault: boolean;
  isDeprecated: boolean;
  deprecationDate?: string;
  maxTokens: number;
  contextWindow: number;
  costPer1kPromptTokens: number;
  costPer1kCompletionTokens: number;
  capabilities: AIModelCapability[];
  description?: string;
  performanceProfile?: {
    speed: 'fast' | 'medium' | 'slow';
    quality: 'standard' | 'high' | 'premium';
    costEfficiency: 'budget' | 'balanced' | 'premium';
  };
}

/**
 * AI Model Capabilities
 */
export type AIModelCapability =
  | 'text-generation'
  | 'code-generation'
  | 'vision'
  | 'function-calling'
  | 'json-mode'
  | 'streaming'
  | 'context-caching'
  | 'extended-thinking'
  | 'computer-use'
  | 'mcp';

/**
 * Engine Upgrade Request
 */
export interface EngineUpgradeRequest {
  // CRITICAL FIX: Added all AI providers including grok
  provider: 'claude' | 'openai' | 'grok' | 'gpt-oss' | 'llama' | 'ollama';
  targetVersion: string;
  forceUpgrade?: boolean;
  backupConfig?: boolean;
}

/**
 * Engine Upgrade Response
 */
export interface EngineUpgradeResponse {
  success: boolean;
  provider: string;
  previousVersion: string;
  newVersion: string;
  upgradeSteps: EngineUpgradeStep[];
  warnings?: string[];
  errors?: string[];
  rollbackAvailable: boolean;
}

/**
 * Engine Upgrade Step
 */
export interface EngineUpgradeStep {
  step: number;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  message?: string;
  startTime?: Date;
  endTime?: Date;
  error?: string;
}

/**
 * Model Change Request
 */
export interface ModelChangeRequest {
  provider: 'claude' | 'openai';
  modelId: string;
  validateCompatibility?: boolean;
}

/**
 * Model Change Response
 */
export interface ModelChangeResponse {
  success: boolean;
  provider: string;
  previousModel: string;
  newModel: string;
  warnings?: string[];
  requiresRestart?: boolean;
  compatibilityIssues?: ModelCompatibilityIssue[];
}

/**
 * Model Compatibility Issue
 */
export interface ModelCompatibilityIssue {
  type: 'warning' | 'error';
  feature: string;
  message: string;
  resolution?: string;
}

/**
 * Available Models Response
 */
export interface AvailableModelsResponse {
  provider: string;
  currentModel: string;
  models: AIModelInfo[];
  recommendedModel?: string;
  filters?: ModelFilter;
}

/**
 * Model Filter
 */
export interface ModelFilter {
  capabilities?: AIModelCapability[];
  maxCostPerRequest?: number;
  minContextWindow?: number;
  includeDeprecated?: boolean;
}