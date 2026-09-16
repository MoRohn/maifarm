/**
 * AI Engine Service - Frontend API Client
 * Handles all API calls for AI engine management, model selection, and cost tracking
 *
 * Features:
 * - Circuit breaker pattern for fault tolerance
 * - Exponential backoff retry logic
 * - Request caching with TTL
 * - Automatic error recovery
 * - Health check monitoring
 *
 * @module services/aiEngineService
 */

import axios, { AxiosError } from 'axios';

const API_BASE = '/api/ai-engines';

// Circuit breaker configuration
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailureTime: 0,
  state: 'CLOSED'
};

const CIRCUIT_BREAKER_THRESHOLD = 5; // Open after 5 failures
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
const CIRCUIT_BREAKER_HALF_OPEN_REQUESTS = 1;

// Cache configuration
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const requestCache = new Map<string, CacheEntry<any>>();
const DEFAULT_CACHE_TTL = 30000; // 30 seconds

export type EngineId = 'claude' | 'openai' | 'gpt-oss' | 'llama' | 'grok';

// Aligned with backend response structure from apps/api/src/api/ai-engines.ts
export interface EngineStatus {
  provider: EngineId;
  enabled: boolean;
  configured: boolean;
  model: string;
  version: string | {
    current: string;
    latest?: string;
    releaseDate?: string;
    isDeprecated?: boolean;
    updateAvailable?: boolean;
  };
  contextWindow: number;
  maxTokens: number;
  isDefault: boolean;
  isLocal: boolean;
  status: 'online' | 'offline';
  temperature: number;
  endpoint: string;
  hasApiKey?: boolean;
}

export interface AIModelInfo {
  id: string;
  name: string;
  displayName: string;
  provider: 'claude' | 'openai';
  version: string;
  releaseDate: string;
  isDefault: boolean;
  isDeprecated: boolean;
  deprecationDate?: string;
  maxTokens: number;
  contextWindow: number;
  costPer1kPromptTokens: number;
  costPer1kCompletionTokens: number;
  capabilities: string[];
  description?: string;
  performanceProfile?: {
    speed: 'fast' | 'medium' | 'slow';
    quality: 'standard' | 'high' | 'premium';
    costEfficiency: 'budget' | 'balanced' | 'premium';
  };
}

export interface ModelChangeResponse {
  success: boolean;
  provider: string;
  previousModel: string;
  newModel: string;
  warnings?: string[];
  requiresRestart?: boolean;
  compatibilityIssues?: Array<{
    type: 'warning' | 'error';
    feature: string;
    message: string;
    resolution?: string;
  }>;
}

export interface UpgradeResponse {
  success: boolean;
  provider: string;
  previousVersion: string;
  newVersion: string;
  upgradeSteps: Array<{
    step: number;
    name: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
    message?: string;
    startTime?: string;
    endTime?: string;
    error?: string;
  }>;
  warnings?: string[];
  errors?: string[];
  rollbackAvailable: boolean;
}

export interface CostSummary {
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
}

/**
 * AI Engine Service Class
 */
class AIEngineService {
  /**
   * Check if circuit breaker allows requests
   */
  private checkCircuitBreaker(): boolean {
    const now = Date.now();

    if (circuitBreaker.state === 'OPEN') {
      // Check if timeout has passed to try half-open
      if (now - circuitBreaker.lastFailureTime > CIRCUIT_BREAKER_TIMEOUT) {
        circuitBreaker.state = 'HALF_OPEN';
        circuitBreaker.failures = 0;
        console.info('[CircuitBreaker] Transitioning to HALF_OPEN state');
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Record circuit breaker success
   */
  private recordSuccess(): void {
    if (circuitBreaker.state === 'HALF_OPEN') {
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failures = 0;
      console.info('[CircuitBreaker] Transitioning to CLOSED state');
    }
  }

  /**
   * Record circuit breaker failure
   */
  private recordFailure(): void {
    circuitBreaker.failures++;
    circuitBreaker.lastFailureTime = Date.now();

    if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitBreaker.state = 'OPEN';
      console.warn(`[CircuitBreaker] Opening circuit after ${circuitBreaker.failures} failures`);
    }
  }

  /**
   * Get cached data if available and not expired
   */
  private getFromCache<T>(key: string): T | null {
    const entry = requestCache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      requestCache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Store data in cache
   */
  private setCache<T>(key: string, data: T, ttl: number = DEFAULT_CACHE_TTL): void {
    requestCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Clear cache for a specific key or all cache
   */
  clearCache(key?: string): void {
    if (key) {
      requestCache.delete(key);
    } else {
      requestCache.clear();
    }
  }

  /**
   * Exponential backoff retry with jitter
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
          console.warn(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay.toFixed(0)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Get status of all AI engines with resilience features
   */
  async getEngineStatus(): Promise<{
    success: boolean;
    engines: EngineStatus[];
    defaultProvider?: EngineId;
    stats?: any;
    gptOssStatus?: any;
  }> {
    const cacheKey = 'engine-status';

    // Check cache first
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) {
      console.debug('[Cache] Returning cached engine status');
      return cached;
    }

    // Check circuit breaker
    if (!this.checkCircuitBreaker()) {
      throw new Error('Circuit breaker is OPEN. Service temporarily unavailable.');
    }

    try {
      const result = await this.retryWithBackoff(async () => {
        const response = await axios.get(`${API_BASE}/status`, {
          timeout: 10000 // 10 second timeout
        });
        return response.data;
      });

      this.recordSuccess();

      // Format response to ensure success flag
      const formattedResult = {
        success: true,
        engines: result.engines || [],
        defaultProvider: result.defaultProvider,
        stats: result.stats,
        gptOssStatus: result.gptOssStatus
      };

      this.setCache(cacheKey, formattedResult, 30000); // 30 second cache
      return formattedResult;
    } catch (error) {
      this.recordFailure();
      this.handleError(error, 'Failed to fetch engine status');
      throw error;
    }
  }

  /**
   * Get version information for a provider
   */
  async getVersion(provider: 'claude' | 'openai'): Promise<any> {
    try {
      const response = await axios.get(`${API_BASE}/${provider}/version`);
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to fetch version for ${provider}`);
      throw error;
    }
  }

  /**
   * Get available models for a provider
   */
  async getAvailableModels(
    provider: 'claude' | 'openai',
    filters?: {
      capabilities?: string[];
      maxCostPerRequest?: number;
      minContextWindow?: number;
      includeDeprecated?: boolean;
    }
  ): Promise<{
    success: boolean;
    provider: string;
    currentModel: string;
    models: AIModelInfo[];
    recommendedModel?: string;
  }> {
    try {
      const params = new URLSearchParams();

      if (filters?.capabilities) {
        params.append('capabilities', JSON.stringify(filters.capabilities));
      }
      if (filters?.maxCostPerRequest) {
        params.append('maxCostPerRequest', filters.maxCostPerRequest.toString());
      }
      if (filters?.minContextWindow) {
        params.append('minContextWindow', filters.minContextWindow.toString());
      }
      if (filters?.includeDeprecated !== undefined) {
        params.append('includeDeprecated', filters.includeDeprecated.toString());
      }

      const queryString = params.toString();
      const url = `${API_BASE}/${provider}/models${queryString ? '?' + queryString : ''}`;

      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to fetch models for ${provider}`);
      throw error;
    }
  }

  /**
   * Change the active model for a provider
   */
  async changeModel(
    provider: 'claude' | 'openai',
    modelId: string,
    validateCompatibility = true
  ): Promise<ModelChangeResponse> {
    try {
      const response = await axios.post(`${API_BASE}/${provider}/model`, {
        modelId,
        validateCompatibility
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to change model for ${provider}`);
      throw error;
    }
  }

  /**
   * Upgrade engine version
   */
  async upgradeEngine(
    provider: 'claude' | 'openai',
    targetVersion: string,
    forceUpgrade = false,
    backupConfig = true
  ): Promise<UpgradeResponse> {
    try {
      const response = await axios.post(`${API_BASE}/${provider}/upgrade`, {
        targetVersion,
        forceUpgrade,
        backupConfig
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to upgrade ${provider}`);
      throw error;
    }
  }

  /**
   * Validate API key for a provider
   */
  async validateApiKey(
    provider: 'claude' | 'openai',
    apiKey: string
  ): Promise<{ success: boolean; valid: boolean; error?: string }> {
    try {
      const response = await axios.post(`${API_BASE}/${provider}/validate`, {
        apiKey
      });
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to validate API key for ${provider}`);
      throw error;
    }
  }

  /**
   * Get cost metrics
   */
  async getCosts(
    provider?: 'claude' | 'openai',
    startDate?: string,
    endDate?: string,
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    success: boolean;
    summary: CostSummary;
    byProvider: any[];
    details: any[];
  }> {
    try {
      const params = new URLSearchParams();

      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('groupBy', groupBy);

      const queryString = params.toString();
      const url = provider
        ? `${API_BASE}/costs/${provider}?${queryString}`
        : `${API_BASE}/costs?${queryString}`;

      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to fetch cost metrics');
      throw error;
    }
  }

  /**
   * Check for available updates for a provider
   */
  async checkForUpdates(provider: EngineId): Promise<{
    success: boolean;
    provider: string;
    currentModel: string;
    latestModel: string;
    latestVersion: string;
    releaseDate: string;
    updateAvailable: boolean;
    checkSources: {
      checkUrl: string;
      docsUrl: string;
      changelogUrl: string;
      releaseNotesUrl: string;
    };
    availableModels: Array<{
      id: string;
      name: string;
      version: string;
      releaseDate: string;
      isDefault: boolean;
      isDeprecated: boolean;
    }>;
    lastChecked: string;
  }> {
    try {
      const response = await axios.post(`${API_BASE}/${provider}/check-updates`);
      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to check updates for ${provider}`);
      throw error;
    }
  }

  /**
   * Upgrade provider to the latest or specified model
   */
  async upgradeProvider(
    provider: EngineId,
    targetModel?: string,
    forceUpgrade?: boolean
  ): Promise<{
    success: boolean;
    provider: string;
    previousModel: string;
    newModel: string;
    upgraded: boolean;
    upgradeSteps?: Array<{
      step: number;
      name: string;
      status: string;
    }>;
    modelInfo?: {
      name: string;
      version: string;
      releaseDate: string;
      features: string[];
      description: string;
    };
    message?: string;
  }> {
    try {
      const response = await axios.post(`${API_BASE}/${provider}/upgrade`, {
        targetModel,
        forceUpgrade
      });

      // Clear cache after upgrade
      this.clearCache('engine-status');

      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to upgrade ${provider}`);
      throw error;
    }
  }

  /**
   * Set default AI provider
   */
  async setDefaultProvider(provider: EngineId): Promise<{
    success: boolean;
    provider: string;
    message: string;
  }> {
    try {
      const response = await axios.post(`${API_BASE}/default`, {
        provider
      });

      // Clear cache to force refresh
      this.clearCache('engine-status');

      return response.data;
    } catch (error) {
      this.handleError(error, `Failed to set default provider to ${provider}`);
      throw error;
    }
  }

  /**
   * Handle API errors
   */
  private handleError(error: unknown, defaultMessage: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>;
      const message = axiosError.response?.data?.error || axiosError.response?.data?.message || defaultMessage;
      console.error(`[AIEngineService] ${message}`, {
        status: axiosError.response?.status,
        data: axiosError.response?.data
      });
    } else {
      console.error(`[AIEngineService] ${defaultMessage}`, error);
    }
  }
}

// Export singleton instance
export const aiEngineService = new AIEngineService();
