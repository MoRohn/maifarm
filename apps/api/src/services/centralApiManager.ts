import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { aiProviderManager, AIProvider, AIProviderConfig } from '../config/aiProviders';
import { redis } from '../database/connection';

// Dynamic import for p-queue to avoid ESM issues
let PQueue: any;

export interface ApiRequest {
  id: string;
  provider: AIProvider;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
  headers?: Record<string, string>;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  retryCount?: number;
  maxRetries?: number;
  timeout?: number;
  metadata?: Record<string, any>;
}

export interface ApiResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timing: {
    requestStart: Date;
    requestEnd: Date;
    durationMs: number;
  };
  retries: number;
}

export interface ProviderHealth {
  provider: AIProvider;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  successRate: number;
  averageResponseTime: number;
  lastCheckTime: Date;
  consecutiveFailures: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
}

interface CircuitBreaker {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

interface ConnectionPool {
  provider: AIProvider;
  client: AxiosInstance;
  activeRequests: number;
  maxConcurrent: number;
  health: ProviderHealth;
  circuitBreaker: CircuitBreaker;
}

/**
 * Centralized API Manager for all AI provider communications
 * Features:
 * - Connection pooling with concurrent request limits
 * - Circuit breaker pattern for failure protection
 * - Automatic retry with exponential backoff
 * - Request prioritization and queuing
 * - Real-time health monitoring
 * - Fallback to alternative providers
 * - Comprehensive metrics tracking
 */
export class CentralApiManager extends EventEmitter {
  private static instance: CentralApiManager;
  
  private connectionPools: Map<AIProvider, ConnectionPool> = new Map();
  private requestQueues: Map<string, any> = new Map();
  private metricsBuffer: Map<string, any[]> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private initializationPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;
  
  // Configuration
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_BASE = 1000; // 1 second
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly REQUEST_TIMEOUT_DEFAULT = 30000; // 30 seconds
  private readonly MAX_CONCURRENT_PER_PROVIDER = 10;
  
  private constructor() {
    super();
    this.initializationPromise = this.initialize();
  }
  
  /**
   * Initialize all components
   */
  private async initialize(): Promise<void> {
    try {
      await this.initializePQueue();
      this.initializeConnectionPools();
      this.startHealthMonitoring();
      this.setupMetricsReporting();
      this.isInitialized = true;
    } catch (error) {
      logger.error('[CentralApiManager] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Initialize PQueue dynamically to avoid ESM issues
   */
  private async initializePQueue(): Promise<void> {
    try {
      const module = await import('p-queue');
      PQueue = module.default || module.PQueue;
    } catch (error) {
      logger.error('[CentralApiManager] Failed to import p-queue:', error);
      // Fallback to a simple queue implementation
      PQueue = class {
        private queue: any[] = [];
        private concurrency: number;
        private running: number = 0;
        
        constructor(options: any = {}) {
          this.concurrency = options.concurrency || 10;
        }
        
        async add(fn: any, options: any = {}): Promise<any> {
          return fn();
        }
        
        clear() {
          this.queue = [];
        }
        
        get size() {
          return this.queue.length;
        }
      };
    }
  }
  
  static getInstance(): CentralApiManager {
    if (!CentralApiManager.instance) {
      CentralApiManager.instance = new CentralApiManager();
    }
    return CentralApiManager.instance;
  }
  
  /**
   * Initialize connection pools for all configured AI providers
   */
  private initializeConnectionPools(): void {
    const providers = aiProviderManager.getAllProviders();
    
    for (const providerConfig of providers) {
      if (!providerConfig.enabled) continue;
      
      // Create axios instance with base configuration
      const client = axios.create({
        baseURL: providerConfig.apiEndpoint,
        timeout: this.REQUEST_TIMEOUT_DEFAULT,
        headers: {
          'Content-Type': 'application/json',
          ...(providerConfig.apiKey && { 'Authorization': `Bearer ${providerConfig.apiKey}` })
        }
      });
      
      // Add request/response interceptors for logging and metrics
      this.setupInterceptors(client, providerConfig.provider);
      
      // Create connection pool
      const pool: ConnectionPool = {
        provider: providerConfig.provider,
        client,
        activeRequests: 0,
        maxConcurrent: this.MAX_CONCURRENT_PER_PROVIDER,
        health: {
          provider: providerConfig.provider,
          status: 'healthy',
          successRate: 100,
          averageResponseTime: 0,
          lastCheckTime: new Date(),
          consecutiveFailures: 0,
          circuitBreakerState: 'closed'
        },
        circuitBreaker: {
          state: 'closed',
          failures: 0,
          successCount: 0
        }
      };
      
      this.connectionPools.set(providerConfig.provider, pool);
      
      // Create priority queue for this provider
      const queue = new PQueue({
        concurrency: this.MAX_CONCURRENT_PER_PROVIDER,
        intervalCap: 10,
        interval: 1000 // Rate limiting: 10 requests per second
      });
      
      this.requestQueues.set(providerConfig.provider, queue);
      
      logger.info(`[CentralApiManager] Initialized connection pool for ${providerConfig.provider}`);
    }
  }
  
  /**
   * Setup axios interceptors for metrics and error handling
   */
  private setupInterceptors(client: AxiosInstance, provider: AIProvider): void {
    // Request interceptor
    client.interceptors.request.use(
      (config) => {
        // Add request ID for tracking
        config.headers['X-Request-ID'] = uuidv4();
        config.metadata = { startTime: Date.now(), provider };
        return config;
      },
      (error) => {
        this.recordMetric(provider, 'request_error', { error: error.message });
        return Promise.reject(error);
      }
    );
    
    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - (response.config.metadata?.startTime || 0);
        this.recordMetric(provider, 'request_success', { duration, status: response.status });
        this.updateProviderHealth(provider, true, duration);
        return response;
      },
      (error: AxiosError) => {
        const duration = Date.now() - (error.config?.metadata?.startTime || 0);
        this.recordMetric(provider, 'request_failure', { 
          duration, 
          status: error.response?.status,
          error: error.message 
        });
        this.updateProviderHealth(provider, false, duration);
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Execute an API request with retry logic and circuit breaker
   */
  async executeRequest(request: ApiRequest): Promise<ApiResponse> {
    // Ensure initialization is complete
    if (!this.isInitialized && this.initializationPromise) {
      await this.initializationPromise;
    }
    
    const startTime = new Date();
    const provider = request.provider || AIProvider.CLAUDE;
    const pool = this.connectionPools.get(provider);
    
    if (!pool) {
      throw new Error(`Provider ${provider} not initialized`);
    }
    
    // Check circuit breaker
    if (!this.canMakeRequest(pool)) {
      // Try fallback provider
      const fallbackProvider = this.getFallbackProvider(provider);
      if (fallbackProvider) {
        logger.warn(`[CentralApiManager] Circuit breaker open for ${provider}, falling back to ${fallbackProvider}`);
        request.provider = fallbackProvider;
        return this.executeRequest(request);
      }
      
      throw new Error(`Provider ${provider} is currently unavailable (circuit breaker open)`);
    }
    
    // Get the appropriate queue based on priority
    const queue = this.requestQueues.get(provider);
    if (!queue) {
      throw new Error(`Queue not initialized for provider ${provider}`);
    }
    
    // Set priority for queue
    const priority = this.getPriorityValue(request.priority || 'medium');
    
    try {
      // Execute request through queue
      const result = await queue.add(
        async () => this.executeWithRetry(pool, request),
        { priority }
      );
      
      const endTime = new Date();
      
      return {
        success: true,
        data: result,
        timing: {
          requestStart: startTime,
          requestEnd: endTime,
          durationMs: endTime.getTime() - startTime.getTime()
        },
        retries: request.retryCount || 0
      };
    } catch (error) {
      const endTime = new Date();
      
      // Emit failure event
      this.emit('request:failed', {
        requestId: request.id,
        provider,
        error: error.message,
        retries: request.retryCount || 0
      });
      
      return {
        success: false,
        error: {
          code: 'API_REQUEST_FAILED',
          message: error.message,
          details: error
        },
        timing: {
          requestStart: startTime,
          requestEnd: endTime,
          durationMs: endTime.getTime() - startTime.getTime()
        },
        retries: request.retryCount || 0
      };
    }
  }
  
  /**
   * Execute request with retry logic
   */
  private async executeWithRetry(pool: ConnectionPool, request: ApiRequest): Promise<any> {
    const maxRetries = request.maxRetries || this.MAX_RETRIES;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Track active requests
        pool.activeRequests++;
        
        // Make the actual request
        const config: AxiosRequestConfig = {
          method: request.method,
          url: request.endpoint,
          data: request.data,
          headers: request.headers,
          timeout: request.timeout || this.REQUEST_TIMEOUT_DEFAULT
        };
        
        const response = await pool.client.request(config);
        
        // Success - update circuit breaker
        this.recordSuccess(pool);
        pool.activeRequests--;
        
        // Emit success event
        this.emit('request:success', {
          requestId: request.id,
          provider: pool.provider,
          attempt: attempt + 1
        });
        
        return response.data;
      } catch (error) {
        pool.activeRequests--;
        lastError = error as Error;
        
        // Record failure
        this.recordFailure(pool);
        
        // Check if we should retry
        if (attempt < maxRetries && this.shouldRetry(error as AxiosError)) {
          const delay = this.calculateRetryDelay(attempt);
          
          logger.warn(`[CentralApiManager] Request failed for ${pool.provider}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          
          // Emit retry event
          this.emit('request:retry', {
            requestId: request.id,
            provider: pool.provider,
            attempt: attempt + 1,
            delay
          });
          
          await this.delay(delay);
          request.retryCount = (request.retryCount || 0) + 1;
        } else {
          break;
        }
      }
    }
    
    throw lastError || new Error('Request failed after all retries');
  }
  
  /**
   * Check if request can be made based on circuit breaker state
   */
  private canMakeRequest(pool: ConnectionPool): boolean {
    const breaker = pool.circuitBreaker;
    
    if (breaker.state === 'closed') {
      return true;
    }
    
    if (breaker.state === 'open') {
      // Check if enough time has passed to try again
      if (breaker.nextAttemptTime && Date.now() >= breaker.nextAttemptTime.getTime()) {
        breaker.state = 'half-open';
        breaker.successCount = 0;
        logger.info(`[CentralApiManager] Circuit breaker for ${pool.provider} entering half-open state`);
        return true;
      }
      return false;
    }
    
    // Half-open state - allow limited requests
    return true;
  }
  
  /**
   * Record successful request for circuit breaker
   */
  private recordSuccess(pool: ConnectionPool): void {
    const breaker = pool.circuitBreaker;
    
    if (breaker.state === 'half-open') {
      breaker.successCount++;
      
      // Close circuit breaker after enough successes
      if (breaker.successCount >= 3) {
        breaker.state = 'closed';
        breaker.failures = 0;
        breaker.successCount = 0;
        pool.health.circuitBreakerState = 'closed';
        
        logger.info(`[CentralApiManager] Circuit breaker for ${pool.provider} closed (recovered)`);
        
        // Emit recovery event
        this.emit('provider:recovered', {
          provider: pool.provider,
          health: pool.health
        });
      }
    } else if (breaker.state === 'closed') {
      breaker.failures = Math.max(0, breaker.failures - 1);
    }
  }
  
  /**
   * Record failed request for circuit breaker
   */
  private recordFailure(pool: ConnectionPool): void {
    const breaker = pool.circuitBreaker;
    
    breaker.failures++;
    breaker.lastFailureTime = new Date();
    pool.health.consecutiveFailures++;
    
    if (breaker.state === 'half-open') {
      // Immediately open the circuit breaker
      this.openCircuitBreaker(pool);
    } else if (breaker.state === 'closed' && breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      // Open circuit breaker after threshold
      this.openCircuitBreaker(pool);
    }
  }
  
  /**
   * Open the circuit breaker for a provider
   */
  private openCircuitBreaker(pool: ConnectionPool): void {
    const breaker = pool.circuitBreaker;
    
    breaker.state = 'open';
    breaker.nextAttemptTime = new Date(Date.now() + this.CIRCUIT_BREAKER_TIMEOUT);
    pool.health.circuitBreakerState = 'open';
    pool.health.status = 'unhealthy';
    
    logger.error(`[CentralApiManager] Circuit breaker opened for ${pool.provider} (failures: ${breaker.failures})`);
    
    // Emit circuit breaker event
    this.emit('circuit_breaker:opened', {
      provider: pool.provider,
      failures: breaker.failures,
      nextAttemptTime: breaker.nextAttemptTime
    });
    
    // Broadcast to WebSocket
    websocketManager.broadcast('provider:unhealthy', {
      provider: pool.provider,
      status: 'circuit_breaker_open',
      nextRetry: breaker.nextAttemptTime,
      timestamp: new Date()
    });
  }
  
  /**
   * Determine if request should be retried based on error
   */
  private shouldRetry(error: AxiosError): boolean {
    if (!error.response) {
      // Network error - retry
      return true;
    }
    
    const status = error.response.status;
    
    // Retry on temporary errors
    return status === 429 || // Rate limit
           status === 502 || // Bad gateway
           status === 503 || // Service unavailable
           status === 504 || // Gateway timeout
           status >= 500;    // Server errors
  }
  
  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.RETRY_DELAY_BASE;
    const maxDelay = 30000; // 30 seconds max
    
    // Exponential backoff with jitter
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * 0.3 * delay; // Up to 30% jitter
    
    return Math.floor(delay + jitter);
  }
  
  /**
   * Get fallback provider when primary fails
   */
  private getFallbackProvider(failedProvider: AIProvider): AIProvider | null {
    // Priority order for fallbacks
    const fallbackOrder: Record<AIProvider, AIProvider[]> = {
      [AIProvider.CLAUDE]: [AIProvider.OPENAI, AIProvider.QWEN],
      [AIProvider.OPENAI]: [AIProvider.CLAUDE, AIProvider.QWEN],
      [AIProvider.QWEN]: [AIProvider.CLAUDE, AIProvider.OPENAI],
      [AIProvider.QWEN_LOCAL]: [AIProvider.QWEN, AIProvider.CLAUDE],
      [AIProvider.GPT_OSS]: [AIProvider.OPENAI, AIProvider.CLAUDE]
    };
    
    const fallbacks = fallbackOrder[failedProvider] || [];
    
    for (const fallback of fallbacks) {
      const pool = this.connectionPools.get(fallback);
      if (pool && pool.health.status === 'healthy' && pool.circuitBreaker.state === 'closed') {
        return fallback;
      }
    }
    
    return null;
  }
  
  /**
   * Update provider health metrics
   */
  private updateProviderHealth(provider: AIProvider, success: boolean, responseTime: number): void {
    const pool = this.connectionPools.get(provider);
    if (!pool) return;
    
    const health = pool.health;
    
    // Update success rate (rolling average of last 100 requests)
    const weight = 0.99;
    health.successRate = health.successRate * weight + (success ? 100 : 0) * (1 - weight);
    
    // Update average response time
    if (success) {
      health.averageResponseTime = health.averageResponseTime * weight + responseTime * (1 - weight);
      health.consecutiveFailures = 0;
    } else {
      health.consecutiveFailures++;
    }
    
    // Update status based on metrics
    if (health.successRate >= 95 && health.consecutiveFailures === 0) {
      health.status = 'healthy';
    } else if (health.successRate >= 80 || health.consecutiveFailures < 3) {
      health.status = 'degraded';
    } else {
      health.status = 'unhealthy';
    }
    
    health.lastCheckTime = new Date();
  }
  
  /**
   * Start health monitoring for all providers
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [provider, pool] of this.connectionPools) {
        try {
          // Perform health check
          await this.performHealthCheck(pool);
          
          // Broadcast health status
          websocketManager.broadcast('provider:health', {
            provider,
            health: pool.health,
            timestamp: new Date()
          });
        } catch (error) {
          logger.error(`[CentralApiManager] Health check failed for ${provider}:`, error);
        }
      }
    }, this.HEALTH_CHECK_INTERVAL);
    
    logger.info('[CentralApiManager] Started health monitoring');
  }
  
  /**
   * Perform health check for a provider
   */
  private async performHealthCheck(pool: ConnectionPool): Promise<void> {
    try {
      // Simple health check request
      const response = await pool.client.get('/health', { timeout: 5000 });
      
      if (response.status === 200) {
        pool.health.status = 'healthy';
        pool.health.consecutiveFailures = 0;
      }
    } catch (error) {
      // Health check failed, but don't immediately mark as unhealthy
      // Let the circuit breaker handle persistent failures
      logger.debug(`[CentralApiManager] Health check failed for ${pool.provider}:`, error.message);
    }
  }
  
  /**
   * Setup metrics reporting
   */
  private setupMetricsReporting(): void {
    // Report metrics every 10 seconds
    setInterval(() => {
      const metrics = this.collectMetrics();
      
      // Emit metrics event
      this.emit('metrics:collected', metrics);
      
      // Broadcast to WebSocket
      websocketManager.broadcast('api:metrics', {
        metrics,
        timestamp: new Date()
      });
      
      // Store in Redis for historical tracking
      this.storeMetricsInRedis(metrics);
    }, 10000);
  }
  
  /**
   * Collect current metrics
   */
  private collectMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const [provider, pool] of this.connectionPools) {
      metrics[provider] = {
        health: pool.health,
        activeRequests: pool.activeRequests,
        queueSize: this.requestQueues.get(provider)?.size || 0,
        circuitBreaker: {
          state: pool.circuitBreaker.state,
          failures: pool.circuitBreaker.failures
        },
        bufferedMetrics: this.metricsBuffer.get(provider)?.length || 0
      };
    }
    
    return metrics;
  }
  
  /**
   * Store metrics in Redis for historical analysis
   */
  private async storeMetricsInRedis(metrics: Record<string, any>): Promise<void> {
    if (!redis || !redis.isReady) return;
    
    try {
      const key = `api:metrics:${Date.now()}`;
      await redis.setEx(key, 86400, JSON.stringify(metrics)); // Keep for 24 hours
    } catch (error) {
      logger.error('[CentralApiManager] Failed to store metrics in Redis:', error);
    }
  }
  
  /**
   * Record a metric for a provider
   */
  private recordMetric(provider: AIProvider, type: string, data: any): void {
    if (!this.metricsBuffer.has(provider)) {
      this.metricsBuffer.set(provider, []);
    }
    
    const buffer = this.metricsBuffer.get(provider)!;
    buffer.push({
      type,
      data,
      timestamp: Date.now()
    });
    
    // Keep only last 1000 metrics per provider
    if (buffer.length > 1000) {
      buffer.shift();
    }
  }
  
  /**
   * Get priority value for queue ordering
   */
  private getPriorityValue(priority: string): number {
    const priorities: Record<string, number> = {
      'critical': 4,
      'high': 3,
      'medium': 2,
      'low': 1
    };
    return priorities[priority] || 2;
  }
  
  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Ensure the service is ready
   */
  async ensureReady(): Promise<void> {
    if (!this.isInitialized && this.initializationPromise) {
      await this.initializationPromise;
    }
  }
  
  /**
   * Get current health status for all providers
   */
  getHealthStatus(): ProviderHealth[] {
    const health: ProviderHealth[] = [];
    
    for (const pool of this.connectionPools.values()) {
      health.push({ ...pool.health });
    }
    
    return health;
  }
  
  /**
   * Get metrics for a specific provider
   */
  getProviderMetrics(provider: AIProvider): any[] {
    return this.metricsBuffer.get(provider) || [];
  }
  
  /**
   * Force close all connections (for graceful shutdown)
   */
  async shutdown(): Promise<void> {
    logger.info('[CentralApiManager] Shutting down...');
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Clear all queues
    for (const queue of this.requestQueues.values()) {
      queue.clear();
    }
    
    // Close all connections
    this.connectionPools.clear();
    this.requestQueues.clear();
    
    logger.info('[CentralApiManager] Shutdown complete');
  }
}

// Export singleton instance
export const centralApiManager = CentralApiManager.getInstance();