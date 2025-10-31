/**
 * Unified AI Provider Service
 * Abstraction layer for all AI providers with dynamic routing
 * Replaces: aiOrchestrator, claudeCodeManager, openaiCodeManager, ollamaService, etc.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance } from 'axios';
import { db, redis } from '../../database/connection';
import { logger } from '../../utils/logger';
import { stateCoordinator } from './stateCoordinator';
import { websocketHub } from './websocketHub';
import {
  MaiFarmError,
  ProviderError,
  ErrorCode,
  ErrorSeverity
} from '../../types/errors';

export enum AIProvider {
  CLAUDE = 'claude',
  OPENAI = 'openai',
  QWEN = 'qwen',
  OLLAMA = 'ollama',
  GPT_OSS = 'gpt_oss'
}

export interface ProviderConfig {
  provider: AIProvider;
  apiKey?: string;
  apiEndpoint: string;
  model: string;
  enabled: boolean;
  isLocal: boolean;
  maxTokens: number;
  temperature: number;
  contextWindow: number;
  cliCommand?: string;
  costPerToken?: {
    input: number;
    output: number;
  };
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  capabilities?: {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    codeExecution: boolean;
  };
}

export interface ProviderRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  images?: string[];
  functions?: any[];
  stream?: boolean;
  metadata?: Record<string, any>;
}

export interface ProviderResponse {
  id: string;
  provider: AIProvider;
  model: string;
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost?: number;
  latency: number;
  metadata?: Record<string, any>;
}

export interface ProviderHealth {
  provider: AIProvider;
  healthy: boolean;
  latency?: number;
  error?: string;
  lastChecked: Date;
  availability: number; // Percentage
}

export interface ProviderMetrics {
  provider: AIProvider;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
}

interface ProviderInstance {
  config: ProviderConfig;
  client?: AxiosInstance;
  health: ProviderHealth;
  metrics: ProviderMetrics;
  rateLimiter?: RateLimiter;
  lastUsed: Date;
}

interface RateLimiter {
  requestCount: number;
  tokenCount: number;
  windowStart: Date;
  queue: Array<() => void>;
}

class UnifiedAIProviderService extends EventEmitter {
  private static instance: UnifiedAIProviderService;
  private providers: Map<AIProvider, ProviderInstance> = new Map();
  private defaultProvider: AIProvider = AIProvider.CLAUDE;
  private apiKeys: Map<AIProvider, string> = new Map();
  private healthCheckInterval: NodeJS.Timer | null = null;
  private metricsInterval: NodeJS.Timer | null = null;
  private costTracking: Map<string, number> = new Map(); // userId -> totalCost

  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly METRICS_INTERVAL = 300000; // 5 minutes
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly MAX_RETRIES = 3;

  private constructor() {
    super();
    this.initialize();
  }

  public static getInstance(): UnifiedAIProviderService {
    if (!UnifiedAIProviderService.instance) {
      UnifiedAIProviderService.instance = new UnifiedAIProviderService();
    }
    return UnifiedAIProviderService.instance;
  }

  private async initialize(): Promise<void> {
    // Load provider configurations
    await this.loadProviderConfigs();

    // Load API keys
    await this.loadApiKeys();

    // Initialize provider clients
    this.initializeProviderClients();

    // Start monitoring
    this.startHealthMonitoring();
    this.startMetricsCollection();

    // Setup event handlers
    this.setupEventHandlers();

    logger.info('UnifiedAIProviderService initialized', {
      providers: Array.from(this.providers.keys()),
      defaultProvider: this.defaultProvider
    });
  }

  /**
   * Load provider configurations
   */
  private async loadProviderConfigs(): Promise<void> {
    // Claude configuration
    this.providers.set(AIProvider.CLAUDE, {
      config: {
        provider: AIProvider.CLAUDE,
        apiEndpoint: process.env.CLAUDE_API_ENDPOINT || 'https://api.anthropic.com/v1',
        model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
        enabled: true,
        isLocal: false,
        maxTokens: 4096,
        temperature: 0.7,
        contextWindow: 200000,
        cliCommand: 'claude',
        costPerToken: {
          input: 0.003,
          output: 0.015
        },
        rateLimit: {
          requestsPerMinute: 50,
          tokensPerMinute: 100000
        },
        capabilities: {
          streaming: true,
          functionCalling: true,
          vision: true,
          codeExecution: false
        }
      },
      health: {
        provider: AIProvider.CLAUDE,
        healthy: true,
        lastChecked: new Date(),
        availability: 100
      },
      metrics: this.createEmptyMetrics(AIProvider.CLAUDE),
      lastUsed: new Date()
    });

    // OpenAI configuration
    this.providers.set(AIProvider.OPENAI, {
      config: {
        provider: AIProvider.OPENAI,
        apiEndpoint: process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        enabled: process.env.OPENAI_ENABLED === 'true',
        isLocal: false,
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '8192'),
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
        contextWindow: 128000,
        cliCommand: 'openai-cli',
        costPerToken: {
          input: 0.01,
          output: 0.03
        },
        rateLimit: {
          requestsPerMinute: 60,
          tokensPerMinute: 150000
        },
        capabilities: {
          streaming: true,
          functionCalling: true,
          vision: true,
          codeExecution: true
        }
      },
      health: {
        provider: AIProvider.OPENAI,
        healthy: true,
        lastChecked: new Date(),
        availability: 100
      },
      metrics: this.createEmptyMetrics(AIProvider.OPENAI),
      lastUsed: new Date()
    });

    // Ollama configuration (local)
    this.providers.set(AIProvider.OLLAMA, {
      config: {
        provider: AIProvider.OLLAMA,
        apiEndpoint: process.env.OLLAMA_API_ENDPOINT || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'llama2',
        enabled: process.env.OLLAMA_ENABLED === 'true',
        isLocal: true,
        maxTokens: 4096,
        temperature: 0.7,
        contextWindow: 8192,
        cliCommand: 'ollama',
        costPerToken: {
          input: 0,
          output: 0
        },
        capabilities: {
          streaming: true,
          functionCalling: false,
          vision: false,
          codeExecution: false
        }
      },
      health: {
        provider: AIProvider.OLLAMA,
        healthy: false,
        lastChecked: new Date(),
        availability: 0
      },
      metrics: this.createEmptyMetrics(AIProvider.OLLAMA),
      lastUsed: new Date()
    });

    // Qwen configuration
    this.providers.set(AIProvider.QWEN, {
      config: {
        provider: AIProvider.QWEN,
        apiEndpoint: process.env.QWEN_API_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1',
        model: process.env.QWEN_MODEL || 'qwen-max',
        enabled: process.env.QWEN_ENABLED === 'true',
        isLocal: false,
        maxTokens: 8192,
        temperature: 0.7,
        contextWindow: 32768,
        cliCommand: 'qwen',
        costPerToken: {
          input: 0.002,
          output: 0.006
        },
        rateLimit: {
          requestsPerMinute: 30,
          tokensPerMinute: 50000
        },
        capabilities: {
          streaming: true,
          functionCalling: true,
          vision: false,
          codeExecution: false
        }
      },
      health: {
        provider: AIProvider.QWEN,
        healthy: false,
        lastChecked: new Date(),
        availability: 0
      },
      metrics: this.createEmptyMetrics(AIProvider.QWEN),
      lastUsed: new Date()
    });
  }

  /**
   * Load API keys from database
   */
  private async loadApiKeys(): Promise<void> {
    try {
      const result = await db.query(
        'SELECT service, key_encrypted FROM api_keys WHERE is_active = true'
      );

      for (const row of result.rows) {
        try {
          const decryptedKey = await this.decryptApiKey(row.key_encrypted);

          if (row.service.toLowerCase() === 'claude' || row.service.toLowerCase() === 'anthropic') {
            this.apiKeys.set(AIProvider.CLAUDE, decryptedKey);
          } else if (row.service.toLowerCase() === 'openai') {
            this.apiKeys.set(AIProvider.OPENAI, decryptedKey);
          }
        } catch (decryptError) {
          logger.warn(`Failed to decrypt API key for ${row.service}, will use environment variables if available`);
          // Continue with next key instead of failing completely
        }
      }

      // Fall back to environment variables if no DB keys
      if (!this.apiKeys.has(AIProvider.CLAUDE)) {
        const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
        if (claudeKey) {
          this.apiKeys.set(AIProvider.CLAUDE, claudeKey);
        }
      }

      if (!this.apiKeys.has(AIProvider.OPENAI)) {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (openaiKey) {
          this.apiKeys.set(AIProvider.OPENAI, openaiKey);
        }
      }

      logger.info('API keys loaded', {
        providers: Array.from(this.apiKeys.keys())
      });

    } catch (error) {
      logger.warn('Failed to load API keys from database, using environment variables', error.message);
    }

    // Always check environment variables as fallback (moved outside try-catch)
    if (!this.apiKeys.has(AIProvider.CLAUDE)) {
      const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
      if (claudeKey) {
        this.apiKeys.set(AIProvider.CLAUDE, claudeKey);
        logger.info('Claude API key loaded from environment');
      }
    }

    if (!this.apiKeys.has(AIProvider.OPENAI)) {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        this.apiKeys.set(AIProvider.OPENAI, openaiKey);
        logger.info('OpenAI API key loaded from environment');
      }
    }

  }

  /**
   * Decrypt API key
   */
  private async decryptApiKey(encrypted: string): Promise<string> {
    const crypto = await import('crypto');
    const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-encryption-key';

    try {
      const parts = encrypted.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = parts[1];

      const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt API key: ${error.message}`);
    }
  }

  /**
   * Initialize provider clients
   */
  private initializeProviderClients(): void {
    for (const [provider, instance] of this.providers) {
      const apiKey = this.apiKeys.get(provider);

      if (!apiKey && !instance.config.isLocal) {
        logger.warn(`No API key found for provider ${provider}`);
        instance.config.enabled = false;
        continue;
      }

      // Create axios client
      instance.client = axios.create({
        baseURL: instance.config.apiEndpoint,
        timeout: 60000,
        headers: this.getProviderHeaders(provider, apiKey)
      });

      // Setup rate limiter
      if (instance.config.rateLimit) {
        instance.rateLimiter = {
          requestCount: 0,
          tokenCount: 0,
          windowStart: new Date(),
          queue: []
        };
      }
    }
  }

  /**
   * Get provider-specific headers
   */
  private getProviderHeaders(provider: AIProvider, apiKey?: string): Record<string, string> {
    switch (provider) {
      case AIProvider.CLAUDE:
        return {
          'x-api-key': apiKey || '',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        };

      case AIProvider.OPENAI:
        return {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        };

      case AIProvider.QWEN:
        return {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        };

      case AIProvider.OLLAMA:
        return {
          'Content-Type': 'application/json'
        };

      default:
        return {};
    }
  }

  /**
   * Send request to AI provider
   */
  public async sendRequest(
    request: ProviderRequest,
    provider?: AIProvider,
    userId?: string
  ): Promise<ProviderResponse> {
    const selectedProvider = provider || this.selectBestProvider(request);
    const instance = this.providers.get(selectedProvider);

    if (!instance || !instance.config.enabled) {
      throw new ProviderError(
        ErrorCode.PROVIDER_NOT_CONFIGURED,
        `Provider ${selectedProvider} is not available`,
        { provider: selectedProvider }
      );
    }

    // Check rate limits
    await this.checkRateLimit(instance);

    const startTime = Date.now();
    let response: ProviderResponse;

    try {
      // Try primary request
      response = await this.executeProviderRequest(instance, request);

      // Update metrics
      this.updateMetrics(instance, true, response.usage?.totalTokens || 0, Date.now() - startTime);

      // Track costs
      if (userId && response.cost) {
        this.trackCost(userId, response.cost);
      }

      return response;

    } catch (error) {
      // Update metrics
      this.updateMetrics(instance, false, 0, Date.now() - startTime);

      // Try fallback provider if available
      if (this.shouldFallback(error)) {
        const fallbackProvider = this.getFallbackProvider(selectedProvider);
        if (fallbackProvider) {
          logger.warn(`Falling back from ${selectedProvider} to ${fallbackProvider}`);
          return this.sendRequest(request, fallbackProvider, userId);
        }
      }

      throw new ProviderError(
        ErrorCode.PROVIDER_API_ERROR,
        `Provider request failed: ${error.message}`,
        { provider: selectedProvider },
        this.isRetryableError(error)
      );
    }
  }

  /**
   * Execute provider-specific request
   */
  private async executeProviderRequest(
    instance: ProviderInstance,
    request: ProviderRequest
  ): Promise<ProviderResponse> {
    const { provider } = instance.config;

    switch (provider) {
      case AIProvider.CLAUDE:
        return this.executeClaudeRequest(instance, request);

      case AIProvider.OPENAI:
        return this.executeOpenAIRequest(instance, request);

      case AIProvider.OLLAMA:
        return this.executeOllamaRequest(instance, request);

      case AIProvider.QWEN:
        return this.executeQwenRequest(instance, request);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Execute Claude API request
   */
  private async executeClaudeRequest(
    instance: ProviderInstance,
    request: ProviderRequest
  ): Promise<ProviderResponse> {
    const payload = {
      model: request.model || instance.config.model,
      max_tokens: request.maxTokens || instance.config.maxTokens,
      temperature: request.temperature || instance.config.temperature,
      messages: [
        {
          role: 'user',
          content: request.prompt
        }
      ]
    };

    if (request.systemPrompt) {
      payload.messages.unshift({
        role: 'system',
        content: request.systemPrompt
      });
    }

    const response = await instance.client!.post('/messages', payload);

    return {
      id: response.data.id,
      provider: AIProvider.CLAUDE,
      model: response.data.model,
      content: response.data.content[0].text,
      usage: {
        inputTokens: response.data.usage.input_tokens,
        outputTokens: response.data.usage.output_tokens,
        totalTokens: response.data.usage.input_tokens + response.data.usage.output_tokens
      },
      cost: this.calculateCost(
        instance.config,
        response.data.usage.input_tokens,
        response.data.usage.output_tokens
      ),
      latency: 0,
      metadata: response.data.metadata
    };
  }

  /**
   * Execute OpenAI API request
   */
  private async executeOpenAIRequest(
    instance: ProviderInstance,
    request: ProviderRequest
  ): Promise<ProviderResponse> {
    const payload: any = {
      model: request.model || instance.config.model,
      messages: [
        {
          role: 'user',
          content: request.prompt
        }
      ],
      max_tokens: request.maxTokens || instance.config.maxTokens,
      temperature: request.temperature || instance.config.temperature
    };

    if (request.systemPrompt) {
      payload.messages.unshift({
        role: 'system',
        content: request.systemPrompt
      });
    }

    if (request.functions) {
      payload.functions = request.functions;
    }

    const response = await instance.client!.post('/chat/completions', payload);

    return {
      id: response.data.id,
      provider: AIProvider.OPENAI,
      model: response.data.model,
      content: response.data.choices[0].message.content,
      usage: {
        inputTokens: response.data.usage.prompt_tokens,
        outputTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens
      },
      cost: this.calculateCost(
        instance.config,
        response.data.usage.prompt_tokens,
        response.data.usage.completion_tokens
      ),
      latency: 0
    };
  }

  /**
   * Execute Ollama request
   */
  private async executeOllamaRequest(
    instance: ProviderInstance,
    request: ProviderRequest
  ): Promise<ProviderResponse> {
    const payload = {
      model: request.model || instance.config.model,
      prompt: request.prompt,
      stream: false
    };

    const response = await instance.client!.post('/api/generate', payload);

    return {
      id: uuidv4(),
      provider: AIProvider.OLLAMA,
      model: response.data.model,
      content: response.data.response,
      latency: response.data.total_duration / 1000000, // Convert nanoseconds to ms
      metadata: {
        context: response.data.context
      }
    };
  }

  /**
   * Execute Qwen request
   */
  private async executeQwenRequest(
    instance: ProviderInstance,
    request: ProviderRequest
  ): Promise<ProviderResponse> {
    const payload = {
      model: request.model || instance.config.model,
      input: {
        messages: [
          {
            role: 'user',
            content: request.prompt
          }
        ]
      },
      parameters: {
        max_tokens: request.maxTokens || instance.config.maxTokens,
        temperature: request.temperature || instance.config.temperature
      }
    };

    const response = await instance.client!.post('/services/aigc/text-generation/generation', payload);

    return {
      id: response.data.request_id,
      provider: AIProvider.QWEN,
      model: instance.config.model,
      content: response.data.output.text,
      usage: {
        inputTokens: response.data.usage.input_tokens,
        outputTokens: response.data.usage.output_tokens,
        totalTokens: response.data.usage.total_tokens
      },
      cost: this.calculateCost(
        instance.config,
        response.data.usage.input_tokens,
        response.data.usage.output_tokens
      ),
      latency: 0
    };
  }

  /**
   * Select best provider for request
   */
  private selectBestProvider(request: ProviderRequest): AIProvider {
    // Check for specific requirements
    if (request.functions) {
      // Only certain providers support function calling
      const functionProviders = [AIProvider.CLAUDE, AIProvider.OPENAI];
      for (const provider of functionProviders) {
        if (this.isProviderAvailable(provider)) {
          return provider;
        }
      }
    }

    if (request.images) {
      // Vision-capable providers
      const visionProviders = [AIProvider.CLAUDE, AIProvider.OPENAI];
      for (const provider of visionProviders) {
        if (this.isProviderAvailable(provider)) {
          return provider;
        }
      }
    }

    // Return default or best available
    if (this.isProviderAvailable(this.defaultProvider)) {
      return this.defaultProvider;
    }

    // Find any available provider
    for (const [provider, instance] of this.providers) {
      if (instance.config.enabled && instance.health.healthy) {
        return provider;
      }
    }

    throw new ProviderError(
      ErrorCode.PROVIDER_NOT_CONFIGURED,
      'No available AI providers',
      {},
      false
    );
  }

  /**
   * Check if provider is available
   */
  private isProviderAvailable(provider: AIProvider): boolean {
    const instance = this.providers.get(provider);
    return !!(instance && instance.config.enabled && instance.health.healthy);
  }

  /**
   * Get fallback provider
   */
  private getFallbackProvider(currentProvider: AIProvider): AIProvider | null {
    const fallbackMap: Record<AIProvider, AIProvider[]> = {
      [AIProvider.CLAUDE]: [AIProvider.OPENAI, AIProvider.QWEN],
      [AIProvider.OPENAI]: [AIProvider.CLAUDE, AIProvider.QWEN],
      [AIProvider.QWEN]: [AIProvider.CLAUDE, AIProvider.OPENAI],
      [AIProvider.OLLAMA]: [AIProvider.CLAUDE],
      [AIProvider.GPT_OSS]: [AIProvider.OPENAI]
    };

    const fallbacks = fallbackMap[currentProvider] || [];

    for (const fallback of fallbacks) {
      if (this.isProviderAvailable(fallback)) {
        return fallback;
      }
    }

    return null;
  }

  /**
   * Check rate limits
   */
  private async checkRateLimit(instance: ProviderInstance): Promise<void> {
    if (!instance.rateLimiter || !instance.config.rateLimit) {
      return;
    }

    const now = new Date();
    const windowDuration = 60000; // 1 minute

    // Reset window if needed
    if (now.getTime() - instance.rateLimiter.windowStart.getTime() > windowDuration) {
      instance.rateLimiter.requestCount = 0;
      instance.rateLimiter.tokenCount = 0;
      instance.rateLimiter.windowStart = now;
    }

    // Check limits
    if (instance.rateLimiter.requestCount >= instance.config.rateLimit.requestsPerMinute) {
      throw new ProviderError(
        ErrorCode.PROVIDER_RATE_LIMITED,
        `Rate limit exceeded for ${instance.config.provider}`,
        { provider: instance.config.provider },
        true
      );
    }

    instance.rateLimiter.requestCount++;
  }

  /**
   * Calculate cost for tokens
   */
  private calculateCost(config: ProviderConfig, inputTokens: number, outputTokens: number): number {
    if (!config.costPerToken) {
      return 0;
    }

    const inputCost = (inputTokens / 1000) * config.costPerToken.input;
    const outputCost = (outputTokens / 1000) * config.costPerToken.output;

    return inputCost + outputCost;
  }

  /**
   * Track user costs
   */
  private trackCost(userId: string, cost: number): void {
    const current = this.costTracking.get(userId) || 0;
    this.costTracking.set(userId, current + cost);

    // Emit cost event
    websocketHub.broadcast('provider:cost:updated', {
      userId,
      cost,
      total: current + cost
    });
  }

  /**
   * Update provider metrics
   */
  private updateMetrics(
    instance: ProviderInstance,
    success: boolean,
    tokens: number,
    latency: number
  ): void {
    const metrics = instance.metrics;

    metrics.totalRequests++;
    if (success) {
      metrics.successfulRequests++;
    } else {
      metrics.failedRequests++;
    }

    metrics.totalTokens += tokens;
    metrics.averageLatency = (metrics.averageLatency * (metrics.totalRequests - 1) + latency) / metrics.totalRequests;
    metrics.errorRate = (metrics.failedRequests / metrics.totalRequests) * 100;

    instance.lastUsed = new Date();
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(provider: AIProvider): ProviderMetrics {
    return {
      provider,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      errorRate: 0
    };
  }

  /**
   * Check if error should trigger fallback
   */
  private shouldFallback(error: any): boolean {
    const fallbackErrors = [
      'rate_limit',
      'quota_exceeded',
      'model_not_found',
      'authentication_failed'
    ];

    return fallbackErrors.some(e => error.message?.toLowerCase().includes(e));
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'timeout',
      'network',
      'ECONNREFUSED',
      'ETIMEDOUT',
      '503',
      '504'
    ];

    return retryableErrors.some(e => error.message?.includes(e));
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [provider, instance] of this.providers) {
        await this.checkProviderHealth(instance);
      }

      // Broadcast health status
      websocketHub.broadcast('provider:health', this.getHealthStatus());

    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Check provider health
   */
  private async checkProviderHealth(instance: ProviderInstance): Promise<void> {
    const startTime = Date.now();

    try {
      // Simple health check request
      const testRequest: ProviderRequest = {
        prompt: 'Hello',
        maxTokens: 10
      };

      await this.executeProviderRequest(instance, testRequest);

      instance.health.healthy = true;
      instance.health.latency = Date.now() - startTime;
      instance.health.error = undefined;
      instance.health.availability = this.calculateAvailability(instance);

    } catch (error) {
      instance.health.healthy = false;
      instance.health.error = error.message;
      instance.health.availability = this.calculateAvailability(instance);
    }

    instance.health.lastChecked = new Date();
  }

  /**
   * Calculate provider availability
   */
  private calculateAvailability(instance: ProviderInstance): number {
    if (instance.metrics.totalRequests === 0) {
      return 100;
    }

    return ((instance.metrics.successfulRequests / instance.metrics.totalRequests) * 100);
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      const metrics = this.getMetrics();

      // Store in database
      await this.persistMetrics(metrics);

      // Broadcast metrics
      websocketHub.broadcast('provider:metrics', metrics);

      logger.debug('Provider metrics collected', metrics);

    }, this.METRICS_INTERVAL);
  }

  /**
   * Persist metrics to database
   */
  private async persistMetrics(metrics: Record<AIProvider, ProviderMetrics>): Promise<void> {
    try {
      for (const [provider, metric] of Object.entries(metrics)) {
        await db.query(
          `INSERT INTO provider_metrics (
            provider, total_requests, successful_requests,
            failed_requests, total_tokens, total_cost,
            average_latency, error_rate, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            provider,
            metric.totalRequests,
            metric.successfulRequests,
            metric.failedRequests,
            metric.totalTokens,
            metric.totalCost,
            metric.averageLatency,
            metric.errorRate,
            new Date()
          ]
        );
      }
    } catch (error) {
      logger.error('Failed to persist metrics:', error);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle API key updates
    websocketHub.on('apikey:updated', async (data: any) => {
      const { provider, apiKey } = data;
      this.apiKeys.set(provider, apiKey);
      this.initializeProviderClients();
      logger.info(`API key updated for ${provider}`);
    });

    // Handle shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Get provider health status
   */
  public getHealthStatus(): Record<AIProvider, ProviderHealth> {
    const status: any = {};

    for (const [provider, instance] of this.providers) {
      status[provider] = instance.health;
    }

    return status;
  }

  /**
   * Get provider metrics
   */
  public getMetrics(): Record<AIProvider, ProviderMetrics> {
    const metrics: any = {};

    for (const [provider, instance] of this.providers) {
      metrics[provider] = instance.metrics;
    }

    return metrics;
  }

  /**
   * Get user cost tracking
   */
  public getUserCost(userId: string): number {
    return this.costTracking.get(userId) || 0;
  }

  /**
   * Set default provider
   */
  public setDefaultProvider(provider: AIProvider): void {
    if (!this.providers.has(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    this.defaultProvider = provider;
    logger.info(`Default provider set to ${provider}`);
  }

  /**
   * Get available providers
   */
  public getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.entries())
      .filter(([_, instance]) => instance.config.enabled && instance.health.healthy)
      .map(([provider]) => provider);
  }

  /**
   * Get provider config
   */
  public getProviderConfig(provider: AIProvider): ProviderConfig | undefined {
    return this.providers.get(provider)?.config;
  }

  /**
   * Shutdown service
   */
  private async shutdown(): Promise<void> {
    logger.info('Shutting down UnifiedAIProviderService');

    // Stop intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Persist final metrics
    await this.persistMetrics(this.getMetrics());

    logger.info('UnifiedAIProviderService shutdown complete');
  }
}

// Export singleton instance
export const aiProviderService = UnifiedAIProviderService.getInstance();
