import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { aiProviderManager, AIProvider, AIProviderConfig } from '../config/aiProviders';
import { websocketManager } from '../websocket/websocketManager';
import logger from '../utils/logger';
import { Redis } from 'ioredis';

interface ConnectionPool {
  provider: AIProvider;
  instances: AxiosInstance[];
  activeIndex: number;
  health: ConnectionHealth;
  circuitBreaker: CircuitBreaker;
}

interface ConnectionHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  successRate: number;
  averageLatency: number;
  lastCheck: Date;
  consecutiveFailures: number;
  totalRequests: number;
  successfulRequests: number;
}

interface CircuitBreaker {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: Date | null;
  nextRetry: Date | null;
  threshold: number;
  timeout: number;
}

interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

interface RequestMetrics {
  provider: string;
  duration: number;
  success: boolean;
  statusCode?: number;
  error?: string;
  retries: number;
  timestamp: Date;
}

export class APIConnectionManager extends EventEmitter {
  private static instance: APIConnectionManager;
  private connectionPools: Map<AIProvider, ConnectionPool> = new Map();
  private metricsBuffer: RequestMetrics[] = [];
  private metricsInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private redis: Redis | null = null;
  
  private readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  };

  private readonly CIRCUIT_BREAKER_CONFIG = {
    threshold: 5,
    timeout: 60000,
    halfOpenRequests: 3
  };

  private readonly POOL_SIZE = 3;
  private readonly HEALTH_CHECK_INTERVAL = 30000;
  private readonly METRICS_FLUSH_INTERVAL = 5000;

  private constructor() {
    super();
    this.initializeConnectionPools();
    this.startHealthChecking();
    this.startMetricsReporting();
  }

  static getInstance(): APIConnectionManager {
    if (!APIConnectionManager.instance) {
      APIConnectionManager.instance = new APIConnectionManager();
    }
    return APIConnectionManager.instance;
  }

  /**
   * Initialize connection pools for all configured providers
   */
  private initializeConnectionPools() {
    const providers = aiProviderManager.getAllProviders();
    
    for (const [name, config] of Object.entries(providers)) {
      const provider = name as AIProvider;
      const pool = this.createConnectionPool(provider, config);
      this.connectionPools.set(provider, pool);
      
      logger.info(`[APIConnectionManager] Initialized connection pool for ${provider}`, {
        poolSize: pool.instances.length,
        endpoint: config.apiEndpoint
      });
    }
  }

  /**
   * Create a connection pool for a specific provider
   */
  private createConnectionPool(provider: AIProvider, config: AIProviderConfig): ConnectionPool {
    const instances: AxiosInstance[] = [];
    
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const instance = axios.create({
        baseURL: config.apiEndpoint,
        timeout: config.timeout || 300000,
        headers: this.getProviderHeaders(provider, config),
        validateStatus: (status) => status < 500
      });

      // Add request interceptor for logging
      instance.interceptors.request.use(
        (config) => {
          config.metadata = { startTime: Date.now() };
          return config;
        },
        (error) => Promise.reject(error)
      );

      // Add response interceptor for metrics
      instance.interceptors.response.use(
        (response) => {
          const duration = Date.now() - (response.config.metadata?.startTime || 0);
          this.recordMetrics(provider, duration, true, response.status);
          return response;
        },
        (error) => {
          const duration = Date.now() - (error.config?.metadata?.startTime || 0);
          this.recordMetrics(provider, duration, false, error.response?.status, error.message);
          return Promise.reject(error);
        }
      );

      instances.push(instance);
    }

    return {
      provider,
      instances,
      activeIndex: 0,
      health: {
        status: 'healthy',
        successRate: 100,
        averageLatency: 0,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        totalRequests: 0,
        successfulRequests: 0
      },
      circuitBreaker: {
        state: 'closed',
        failures: 0,
        lastFailure: null,
        nextRetry: null,
        threshold: this.CIRCUIT_BREAKER_CONFIG.threshold,
        timeout: this.CIRCUIT_BREAKER_CONFIG.timeout
      }
    };
  }

  /**
   * Get provider-specific headers
   */
  private getProviderHeaders(provider: AIProvider, config: AIProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    switch (provider) {
      case AIProvider.CLAUDE:
        headers['X-API-Key'] = config.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
      case AIProvider.OPENAI:
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        break;
      case AIProvider.LLAMA:
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        headers['X-DashScope-SSE'] = 'enable';
        break;
      case AIProvider.OLLAMA:
        // Ollama doesn't require auth headers
        break;
    }

    return headers;
  }

  /**
   * Execute a request with retry logic and circuit breaker
   */
  async executeRequest<T = any>(
    provider: AIProvider,
    config: AxiosRequestConfig,
    retryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const pool = this.connectionPools.get(provider);
    if (!pool) {
      throw new Error(`No connection pool for provider: ${provider}`);
    }

    // Check circuit breaker
    if (pool.circuitBreaker.state === 'open') {
      if (this.shouldAttemptHalfOpen(pool.circuitBreaker)) {
        pool.circuitBreaker.state = 'half-open';
        logger.info(`[APIConnectionManager] Circuit breaker half-open for ${provider}`);
      } else {
        throw new Error(`Circuit breaker open for ${provider}. Retry after ${pool.circuitBreaker.nextRetry}`);
      }
    }

    const finalRetryConfig = { ...this.DEFAULT_RETRY_CONFIG, ...retryConfig };
    let lastError: Error | null = null;
    let retries = 0;

    while (retries <= finalRetryConfig.maxRetries) {
      try {
        // Get next available connection
        const instance = this.getNextConnection(pool);
        
        // Execute request
        const response = await instance.request<T>(config);
        
        // Success - update circuit breaker
        this.onRequestSuccess(pool);
        
        return response.data;
      } catch (error) {
        lastError = error as Error;
        this.onRequestFailure(pool, error as Error);
        
        // Check if we should retry
        if (!this.shouldRetry(error as AxiosError, retries, finalRetryConfig)) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          finalRetryConfig.initialDelay * Math.pow(finalRetryConfig.backoffMultiplier, retries),
          finalRetryConfig.maxDelay
        );

        logger.warn(`[APIConnectionManager] Retrying ${provider} request in ${delay}ms (attempt ${retries + 1}/${finalRetryConfig.maxRetries})`);
        
        await this.delay(delay);
        retries++;
      }
    }

    // All retries exhausted
    throw lastError || new Error(`Request failed after ${retries} retries`);
  }

  /**
   * Get next available connection from pool
   */
  private getNextConnection(pool: ConnectionPool): AxiosInstance {
    const instance = pool.instances[pool.activeIndex];
    pool.activeIndex = (pool.activeIndex + 1) % pool.instances.length;
    return instance;
  }

  /**
   * Check if we should attempt half-open state
   */
  private shouldAttemptHalfOpen(circuitBreaker: CircuitBreaker): boolean {
    if (!circuitBreaker.nextRetry) return false;
    return Date.now() >= circuitBreaker.nextRetry.getTime();
  }

  /**
   * Handle successful request
   */
  private onRequestSuccess(pool: ConnectionPool) {
    pool.health.consecutiveFailures = 0;
    pool.health.successfulRequests++;
    pool.health.totalRequests++;
    
    if (pool.circuitBreaker.state === 'half-open') {
      pool.circuitBreaker.state = 'closed';
      pool.circuitBreaker.failures = 0;
      logger.info(`[APIConnectionManager] Circuit breaker closed for ${pool.provider}`);
    }
    
    this.updateHealthStatus(pool);
  }

  /**
   * Handle failed request
   */
  private onRequestFailure(pool: ConnectionPool, error: Error) {
    pool.health.consecutiveFailures++;
    pool.health.totalRequests++;
    pool.circuitBreaker.failures++;
    pool.circuitBreaker.lastFailure = new Date();
    
    if (pool.circuitBreaker.failures >= pool.circuitBreaker.threshold) {
      pool.circuitBreaker.state = 'open';
      pool.circuitBreaker.nextRetry = new Date(Date.now() + pool.circuitBreaker.timeout);
      
      logger.error(`[APIConnectionManager] Circuit breaker opened for ${pool.provider}`, {
        failures: pool.circuitBreaker.failures,
        nextRetry: pool.circuitBreaker.nextRetry
      });
      
      this.emit('circuit-breaker:open', {
        provider: pool.provider,
        failures: pool.circuitBreaker.failures,
        nextRetry: pool.circuitBreaker.nextRetry
      });
    }
    
    this.updateHealthStatus(pool);
  }

  /**
   * Update health status based on metrics
   */
  private updateHealthStatus(pool: ConnectionPool) {
    const successRate = pool.health.totalRequests > 0
      ? (pool.health.successfulRequests / pool.health.totalRequests) * 100
      : 100;
    
    pool.health.successRate = successRate;
    
    if (successRate >= 95 && pool.health.consecutiveFailures < 3) {
      pool.health.status = 'healthy';
    } else if (successRate >= 80 || pool.health.consecutiveFailures < 5) {
      pool.health.status = 'degraded';
    } else {
      pool.health.status = 'unhealthy';
    }
  }

  /**
   * Check if request should be retried
   */
  private shouldRetry(error: AxiosError, attempt: number, config: RetryConfig): boolean {
    if (attempt >= config.maxRetries) return false;
    
    // Don't retry client errors (4xx) except for rate limiting
    if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
      return error.response.status === 429; // Only retry rate limit errors
    }
    
    // Retry network errors and server errors
    return !error.response || error.response.status >= 500;
  }

  /**
   * Record request metrics
   */
  private recordMetrics(
    provider: string,
    duration: number,
    success: boolean,
    statusCode?: number,
    error?: string,
    retries: number = 0
  ) {
    const metric: RequestMetrics = {
      provider,
      duration,
      success,
      statusCode,
      error,
      retries,
      timestamp: new Date()
    };
    
    this.metricsBuffer.push(metric);
    
    // Limit buffer size
    if (this.metricsBuffer.length > 1000) {
      this.metricsBuffer.shift();
    }
  }

  /**
   * Start health checking for all providers
   */
  private startHealthChecking() {
    this.healthCheckInterval = setInterval(async () => {
      for (const [provider, pool] of this.connectionPools) {
        await this.checkProviderHealth(provider, pool);
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Check health of a specific provider
   */
  private async checkProviderHealth(provider: AIProvider, pool: ConnectionPool) {
    try {
      const startTime = Date.now();
      
      // Simple health check request
      const instance = this.getNextConnection(pool);
      await instance.get('/health', { timeout: 5000 }).catch(() => {
        // Some providers don't have health endpoints, try a minimal request
        return instance.get('/', { timeout: 5000 });
      });
      
      const latency = Date.now() - startTime;
      pool.health.averageLatency = pool.health.averageLatency
        ? (pool.health.averageLatency + latency) / 2
        : latency;
      pool.health.lastCheck = new Date();
      
      logger.debug(`[APIConnectionManager] Health check for ${provider}: ${pool.health.status} (${latency}ms)`);
    } catch (error) {
      logger.warn(`[APIConnectionManager] Health check failed for ${provider}:`, error.message);
      pool.health.consecutiveFailures++;
      this.updateHealthStatus(pool);
    }
  }

  /**
   * Start metrics reporting
   */
  private startMetricsReporting() {
    this.metricsInterval = setInterval(() => {
      this.flushMetrics();
    }, this.METRICS_FLUSH_INTERVAL);
  }

  /**
   * Flush metrics to monitoring system
   */
  private flushMetrics() {
    if (this.metricsBuffer.length === 0) return;
    
    const summary = this.calculateMetricsSummary();
    
    // Emit metrics event
    this.emit('metrics:update', summary);
    
    // Broadcast via WebSocket
    websocketManager.broadcast('api:metrics', summary);
    
    // Store in Redis if available
    if (this.redis) {
      this.redis.zadd(
        'api:metrics',
        Date.now(),
        JSON.stringify(summary)
      ).catch(err => logger.error('[APIConnectionManager] Failed to store metrics:', err));
    }
    
    // Clear old metrics
    const cutoff = Date.now() - 60000; // Keep last minute
    this.metricsBuffer = this.metricsBuffer.filter(
      m => m.timestamp.getTime() > cutoff
    );
  }

  /**
   * Calculate metrics summary
   */
  private calculateMetricsSummary() {
    const byProvider: Record<string, any> = {};
    
    for (const metric of this.metricsBuffer) {
      if (!byProvider[metric.provider]) {
        byProvider[metric.provider] = {
          totalRequests: 0,
          successfulRequests: 0,
          totalDuration: 0,
          errors: []
        };
      }
      
      byProvider[metric.provider].totalRequests++;
      if (metric.success) {
        byProvider[metric.provider].successfulRequests++;
      } else if (metric.error) {
        byProvider[metric.provider].errors.push(metric.error);
      }
      byProvider[metric.provider].totalDuration += metric.duration;
    }
    
    // Calculate averages
    for (const provider in byProvider) {
      const stats = byProvider[provider];
      stats.successRate = stats.totalRequests > 0
        ? (stats.successfulRequests / stats.totalRequests) * 100
        : 0;
      stats.averageLatency = stats.totalRequests > 0
        ? stats.totalDuration / stats.totalRequests
        : 0;
    }
    
    return {
      timestamp: new Date(),
      providers: byProvider,
      health: this.getHealthSummary()
    };
  }

  /**
   * Get health summary for all providers
   */
  getHealthSummary() {
    const summary: Record<string, any> = {};
    
    for (const [provider, pool] of this.connectionPools) {
      summary[provider] = {
        status: pool.health.status,
        successRate: pool.health.successRate,
        averageLatency: pool.health.averageLatency,
        circuitBreaker: pool.circuitBreaker.state,
        lastCheck: pool.health.lastCheck
      };
    }
    
    return summary;
  }

  /**
   * Get best available provider based on health
   */
  getBestProvider(): AIProvider | null {
    let bestProvider: AIProvider | null = null;
    let bestScore = -1;
    
    for (const [provider, pool] of this.connectionPools) {
      if (pool.circuitBreaker.state === 'open') continue;
      
      const score = this.calculateProviderScore(pool);
      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }
    
    return bestProvider;
  }

  /**
   * Calculate provider score for selection
   */
  private calculateProviderScore(pool: ConnectionPool): number {
    let score = 0;
    
    // Health status
    if (pool.health.status === 'healthy') score += 50;
    else if (pool.health.status === 'degraded') score += 25;
    
    // Success rate
    score += pool.health.successRate * 0.3;
    
    // Latency (inverse - lower is better)
    if (pool.health.averageLatency > 0) {
      score += Math.max(0, 20 - (pool.health.averageLatency / 100));
    }
    
    return score;
  }

  /**
   * Failover to alternative provider
   */
  async failover(fromProvider: AIProvider): Promise<AIProvider | null> {
    logger.warn(`[APIConnectionManager] Initiating failover from ${fromProvider}`);
    
    // Mark current provider as unhealthy
    const currentPool = this.connectionPools.get(fromProvider);
    if (currentPool) {
      currentPool.health.status = 'unhealthy';
    }
    
    // Find best alternative
    const alternative = this.getBestProvider();
    
    if (alternative && alternative !== fromProvider) {
      logger.info(`[APIConnectionManager] Failing over from ${fromProvider} to ${alternative}`);
      
      this.emit('failover', {
        from: fromProvider,
        to: alternative,
        timestamp: new Date()
      });
      
      return alternative;
    }
    
    logger.error(`[APIConnectionManager] No alternative provider available for failover`);
    return null;
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set Redis connection for persistence
   */
  setRedis(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Stop the connection manager
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    this.flushMetrics();
    this.removeAllListeners();
    
    logger.info('[APIConnectionManager] Stopped');
  }
}

// Export singleton instance
export const apiConnectionManager = APIConnectionManager.getInstance();