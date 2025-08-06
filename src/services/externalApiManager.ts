// External API integration manager

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { ExternalAPIConfig } from '../types/farm';
import { faultTolerance, CircuitBreaker } from './faultTolerance';
import { websocketService } from './websocket';

interface APIClient {
  instance: AxiosInstance;
  config: ExternalAPIConfig;
  circuitBreaker: CircuitBreaker;
  metrics: APIMetrics;
}

interface APIMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastError?: string;
  lastErrorTime?: Date;
}

interface APIRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  data?: any;
  headers?: Record<string, string>;
  params?: Record<string, any>;
}

interface RateLimiter {
  requestsPerMinute: number;
  burstSize: number;
  tokens: number;
  lastRefill: number;
  queue: Array<() => void>;
}

class ExternalApiManager {
  private apiClients: Map<string, APIClient> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private requestInterceptors: Map<string, (config: AxiosRequestConfig) => AxiosRequestConfig> = new Map();
  private responseInterceptors: Map<string, (response: any) => any> = new Map();

  async registerAPI(config: ExternalAPIConfig): Promise<void> {
    // Create axios instance
    const instance = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: config.headers || {},
    });

    // Add authentication
    this.setupAuthentication(instance, config);

    // Add interceptors
    this.setupInterceptors(instance, config);

    // Create circuit breaker
    const circuitBreaker = faultTolerance.createCircuitBreaker(config.id, {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 300000,
      onStateChange: (state) => {
        websocketService.broadcast({
          type: 'api_circuit_breaker_state_change',
          payload: { apiId: config.id, state },
        });
      },
    });

    // Initialize rate limiter
    if (config.rateLimiting) {
      this.rateLimiters.set(config.id, {
        ...config.rateLimiting,
        tokens: config.rateLimiting.burstSize,
        lastRefill: Date.now(),
        queue: [],
      });
    }

    // Store client
    this.apiClients.set(config.id, {
      instance,
      config,
      circuitBreaker,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
      },
    });
  }

  async callAPI<T = any>(
    apiId: string,
    request: APIRequest
  ): Promise<T> {
    const client = this.apiClients.get(apiId);
    if (!client) {
      throw new Error(`API ${apiId} not registered`);
    }

    // Check rate limit
    await this.checkRateLimit(apiId);

    // Update metrics
    const startTime = Date.now();
    client.metrics.totalRequests++;

    try {
      // Execute with circuit breaker
      const response = await client.circuitBreaker.execute(async () => {
        if (client.config.retryPolicy) {
          return faultTolerance.retry(
            () => this.executeRequest(client, request),
            {
              maxRetries: client.config.retryPolicy.maxRetries,
              backoffType: client.config.retryPolicy.backoff || 'exponential',
              initialDelay: client.config.retryPolicy.initialDelay,
              maxDelay: client.config.retryPolicy.maxDelay,
              retryableErrors: client.config.retryPolicy.retryableErrors,
            }
          );
        } else {
          return this.executeRequest(client, request);
        }
      });

      // Update success metrics
      client.metrics.successfulRequests++;
      this.updateResponseTime(client, Date.now() - startTime);

      // Broadcast success
      websocketService.broadcast({
        type: 'api_call_success',
        payload: {
          apiId,
          method: request.method,
          path: request.path,
          duration: Date.now() - startTime,
        },
      });

      return response.data;
    } catch (error) {
      // Update failure metrics
      client.metrics.failedRequests++;
      client.metrics.lastError = error instanceof Error ? error.message : 'Unknown error';
      client.metrics.lastErrorTime = new Date();

      // Broadcast failure
      websocketService.broadcast({
        type: 'api_call_failure',
        payload: {
          apiId,
          method: request.method,
          path: request.path,
          error: client.metrics.lastError,
        },
      });

      throw error;
    }
  }

  async healthCheck(apiId: string): Promise<boolean> {
    const client = this.apiClients.get(apiId);
    if (!client) {
      return false;
    }

    try {
      // Perform a simple health check
      await client.instance.get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  getMetrics(apiId: string): APIMetrics | undefined {
    return this.apiClients.get(apiId)?.metrics;
  }

  getAllMetrics(): Record<string, APIMetrics> {
    const metrics: Record<string, APIMetrics> = {};
    
    this.apiClients.forEach((client, apiId) => {
      metrics[apiId] = { ...client.metrics };
    });

    return metrics;
  }

  setRequestInterceptor(
    apiId: string,
    interceptor: (config: AxiosRequestConfig) => AxiosRequestConfig
  ): void {
    this.requestInterceptors.set(apiId, interceptor);
    
    const client = this.apiClients.get(apiId);
    if (client) {
      client.instance.interceptors.request.use(interceptor);
    }
  }

  setResponseInterceptor(
    apiId: string,
    interceptor: (response: any) => any
  ): void {
    this.responseInterceptors.set(apiId, interceptor);
    
    const client = this.apiClients.get(apiId);
    if (client) {
      client.instance.interceptors.response.use(interceptor);
    }
  }

  private setupAuthentication(instance: AxiosInstance, config: ExternalAPIConfig): void {
    if (!config.authentication) return;

    switch (config.authentication.type) {
      case 'api_key':
        instance.defaults.headers.common['X-API-Key'] = config.authentication.config.apiKey;
        break;

      case 'basic':
        const credentials = btoa(
          `${config.authentication.config.username}:${config.authentication.config.password}`
        );
        instance.defaults.headers.common['Authorization'] = `Basic ${credentials}`;
        break;

      case 'oauth2':
        // OAuth2 would require token management
        instance.interceptors.request.use(async (requestConfig) => {
          const token = await this.getOAuth2Token(config.authentication!.config);
          requestConfig.headers['Authorization'] = `Bearer ${token}`;
          return requestConfig;
        });
        break;
    }
  }

  private setupInterceptors(instance: AxiosInstance, config: ExternalAPIConfig): void {
    // Request interceptor for logging
    instance.interceptors.request.use(
      (requestConfig) => {
        console.log(`[API ${config.id}] ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`);
        return requestConfig;
      },
      (error) => {
        console.error(`[API ${config.id}] Request error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    instance.interceptors.response.use(
      (response) => {
        console.log(`[API ${config.id}] Response:`, response.status);
        return response;
      },
      (error) => {
        if (error.response) {
          console.error(`[API ${config.id}] Response error:`, error.response.status, error.response.data);
        } else if (error.request) {
          console.error(`[API ${config.id}] No response received`);
        } else {
          console.error(`[API ${config.id}] Request setup error:`, error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  private async executeRequest(client: APIClient, request: APIRequest): Promise<any> {
    const config: AxiosRequestConfig = {
      method: request.method,
      url: request.path,
      data: request.data,
      headers: request.headers,
      params: request.params,
    };

    return client.instance.request(config);
  }

  private async checkRateLimit(apiId: string): Promise<void> {
    const limiter = this.rateLimiters.get(apiId);
    if (!limiter) return;

    // Refill tokens
    const now = Date.now();
    const timePassed = now - limiter.lastRefill;
    const tokensToAdd = Math.floor(timePassed / 60000 * limiter.requestsPerMinute);
    
    if (tokensToAdd > 0) {
      limiter.tokens = Math.min(limiter.burstSize, limiter.tokens + tokensToAdd);
      limiter.lastRefill = now;
    }

    // Check if we have tokens
    if (limiter.tokens > 0) {
      limiter.tokens--;
      return;
    }

    // Wait for next token
    return new Promise<void>((resolve) => {
      limiter.queue.push(resolve);
      
      // Schedule token refill
      setTimeout(() => {
        const resolver = limiter.queue.shift();
        if (resolver) {
          limiter.tokens = Math.max(0, limiter.tokens - 1);
          resolver();
        }
      }, 60000 / limiter.requestsPerMinute);
    });
  }

  private updateResponseTime(client: APIClient, responseTime: number): void {
    const metrics = client.metrics;
    const totalTime = metrics.averageResponseTime * (metrics.successfulRequests - 1) + responseTime;
    metrics.averageResponseTime = totalTime / metrics.successfulRequests;
  }

  private async getOAuth2Token(config: any): Promise<string> {
    // Simplified OAuth2 token retrieval
    // In production, implement proper token management with refresh
    if (config.accessToken) {
      return config.accessToken;
    }

    // Exchange credentials for token
    const response = await axios.post(config.tokenUrl, {
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: config.scope,
    });

    return response.data.access_token;
  }

  // Webhook handling
  async handleWebhook(
    apiId: string,
    headers: Record<string, string>,
    body: any
  ): Promise<{ valid: boolean; message?: string }> {
    const client = this.apiClients.get(apiId);
    if (!client) {
      return { valid: false, message: 'API not registered' };
    }

    // Verify webhook signature if configured
    if (client.config.authentication?.type === 'webhook') {
      const secret = client.config.authentication.config.secret;
      const signature = headers['x-webhook-signature'];
      
      if (!this.verifyWebhookSignature(body, signature, secret)) {
        return { valid: false, message: 'Invalid signature' };
      }
    }

    // Process webhook
    websocketService.broadcast({
      type: 'webhook_received',
      payload: {
        apiId,
        headers,
        body,
      },
    });

    return { valid: true };
  }

  private verifyWebhookSignature(body: any, signature: string, secret: string): boolean {
    // Implement webhook signature verification
    // This is a placeholder - actual implementation depends on the webhook provider
    return true;
  }
}

export const externalApiManager = new ExternalApiManager();