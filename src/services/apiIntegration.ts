import { EventEmitter } from 'events';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { ExternalIntegration } from '../types/orchestration';
import { faultTolerance } from './faultTolerance';
import { websocketService } from './websocket';

interface APIProvider {
  name: string;
  type: ExternalIntegration['type'];
  baseURL: string;
  auth: AuthConfig;
  rateLimit?: RateLimitConfig;
  timeout?: number;
  retryPolicy?: string;
}

interface AuthConfig {
  type: 'none' | 'api-key' | 'bearer' | 'oauth2' | 'basic';
  credentials?: Record<string, any>;
}

interface RateLimitConfig {
  requests: number;
  period: number; // milliseconds
  strategy: 'fixed-window' | 'sliding-window' | 'token-bucket';
}

interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime: Date;
}

class ApiIntegrationService extends EventEmitter {
  private providers: Map<string, APIProvider> = new Map();
  private clients: Map<string, AxiosInstance> = new Map();
  private integrations: Map<string, ExternalIntegration> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private metrics: Map<string, RequestMetrics> = new Map();

  constructor() {
    super();
    this.registerDefaultProviders();
  }

  private registerDefaultProviders() {
    // GitHub provider
    this.registerProvider({
      name: 'github',
      type: 'github',
      baseURL: 'https://api.github.com',
      auth: { type: 'bearer' },
      rateLimit: {
        requests: 5000,
        period: 3600000, // 1 hour
        strategy: 'fixed-window'
      },
      timeout: 30000,
      retryPolicy: 'default'
    });

    // Docker provider
    this.registerProvider({
      name: 'docker',
      type: 'docker',
      baseURL: 'http://localhost:2375',
      auth: { type: 'none' },
      timeout: 60000,
      retryPolicy: 'default'
    });

    // AWS provider
    this.registerProvider({
      name: 'aws',
      type: 'aws',
      baseURL: 'https://amazonaws.com',
      auth: { type: 'api-key' },
      timeout: 30000,
      retryPolicy: 'default'
    });

    // Slack provider
    this.registerProvider({
      name: 'slack',
      type: 'slack',
      baseURL: 'https://slack.com/api',
      auth: { type: 'bearer' },
      rateLimit: {
        requests: 1,
        period: 1000, // 1 per second
        strategy: 'token-bucket'
      },
      timeout: 10000
    });
  }

  registerProvider(provider: APIProvider): void {
    this.providers.set(provider.name, provider);
    
    // Create axios instance for the provider
    const client = this.createClient(provider);
    this.clients.set(provider.name, client);
    
    // Initialize rate limiter if needed
    if (provider.rateLimit) {
      const rateLimiter = new RateLimiter(provider.rateLimit);
      this.rateLimiters.set(provider.name, rateLimiter);
    }
    
    // Initialize metrics
    this.metrics.set(provider.name, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: new Date()
    });
  }

  async createIntegration(config: {
    name: string;
    type: ExternalIntegration['type'];
    config: Record<string, any>;
  }): Promise<ExternalIntegration> {
    const provider = this.providers.get(config.type);
    if (!provider) {
      throw new Error(`Provider ${config.type} not registered`);
    }

    const integration: ExternalIntegration = {
      id: `${config.type}-${Date.now()}`,
      name: config.name,
      type: config.type,
      config: config.config,
      status: 'disconnected',
      metadata: {}
    };

    // Test connection
    try {
      await this.testConnection(integration);
      integration.status = 'connected';
      integration.lastSync = new Date();
    } catch (error: any) {
      integration.status = 'error';
      if (!integration.metadata) integration.metadata = {};
      integration.metadata.error = error?.message ?? 'Unknown error';
    }

    this.integrations.set(integration.id, integration);
    
    this.emit('integration:created', integration);
    websocketService.broadcast('integration:created', {
      id: integration.id,
      name: integration.name,
      type: integration.type,
      status: integration.status
    });

    return integration;
  }

  async executeRequest(
    integrationId: string,
    request: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      endpoint: string;
      data?: any;
      params?: Record<string, any>;
      headers?: Record<string, string>;
    }
  ): Promise<any> {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    const provider = this.providers.get(integration.type);
    if (!provider) {
      throw new Error(`Provider ${integration.type} not registered`);
    }

    const client = this.clients.get(integration.type);
    if (!client) {
      throw new Error(`Client for ${integration.type} not initialized`);
    }

    // Check rate limit
    const rateLimiter = this.rateLimiters.get(integration.type);
    if (rateLimiter) {
      await rateLimiter.acquire();
    }

    // Prepare request config
    const config: AxiosRequestConfig = {
      method: request.method,
      url: request.endpoint,
      data: request.data,
      params: request.params,
      headers: {
        ...this.getAuthHeaders(provider, integration),
        ...request.headers
      }
    };

    // Track metrics
    const startTime = Date.now();
    const metrics = this.metrics.get(integration.type)!;
    metrics.totalRequests++;

    try {
      // Execute with fault tolerance
      const response = await faultTolerance.retryWithPolicy(
        () => client.request(config),
        provider.retryPolicy || 'default'
      );

      // Update metrics
      const responseTime = Date.now() - startTime;
      metrics.successfulRequests++;
      metrics.averageResponseTime = 
        (metrics.averageResponseTime * (metrics.successfulRequests - 1) + responseTime) / 
        metrics.successfulRequests;
      metrics.lastRequestTime = new Date();

      // Update integration status
      integration.status = 'connected';
      integration.lastSync = new Date();

      this.emit('request:success', {
        integrationId,
        endpoint: request.endpoint,
        method: request.method,
        responseTime
      });

      return response.data;
    } catch (error) {
      // Update metrics
      metrics.failedRequests++;
      metrics.lastRequestTime = new Date();

      // Update integration status
      integration.status = 'error';
      if (!integration.metadata) integration.metadata = {};
      integration.metadata.lastError = {
        message: error?.message ?? 'Unknown error',
        timestamp: new Date()
      };

      this.emit('request:failed', {
        integrationId,
        endpoint: request.endpoint,
        method: request.method,
        error: error?.message ?? 'Unknown error'
      });

      throw error;
    }
  }

  // Provider-specific methods
  async githubRequest(
    integrationId: string,
    operation: 'create_repo' | 'create_pr' | 'create_issue' | 'get_repo' | 'list_repos',
    params: Record<string, any>
  ): Promise<any> {
    const endpoints = {
      create_repo: { method: 'POST', endpoint: '/user/repos' },
      create_pr: { method: 'POST', endpoint: `/repos/${params.owner}/${params.repo}/pulls` },
      create_issue: { method: 'POST', endpoint: `/repos/${params.owner}/${params.repo}/issues` },
      get_repo: { method: 'GET', endpoint: `/repos/${params.owner}/${params.repo}` },
      list_repos: { method: 'GET', endpoint: '/user/repos' }
    };

    const config = endpoints[operation];
    if (!config) {
      throw new Error(`Unknown GitHub operation: ${operation}`);
    }

    return this.executeRequest(integrationId, {
      method: config.method as any,
      endpoint: config.endpoint,
      data: params.data,
      params: params.query
    });
  }

  async dockerRequest(
    integrationId: string,
    operation: 'create_container' | 'start_container' | 'stop_container' | 'list_containers',
    params: Record<string, any>
  ): Promise<any> {
    const endpoints = {
      create_container: { method: 'POST', endpoint: '/containers/create' },
      start_container: { method: 'POST', endpoint: `/containers/${params.id}/start` },
      stop_container: { method: 'POST', endpoint: `/containers/${params.id}/stop` },
      list_containers: { method: 'GET', endpoint: '/containers/json' }
    };

    const config = endpoints[operation];
    if (!config) {
      throw new Error(`Unknown Docker operation: ${operation}`);
    }

    return this.executeRequest(integrationId, {
      method: config.method as any,
      endpoint: config.endpoint,
      data: params.config,
      params: params.query
    });
  }

  async slackRequest(
    integrationId: string,
    operation: 'post_message' | 'create_channel' | 'invite_user',
    params: Record<string, any>
  ): Promise<any> {
    const endpoints = {
      post_message: { method: 'POST', endpoint: '/chat.postMessage' },
      create_channel: { method: 'POST', endpoint: '/conversations.create' },
      invite_user: { method: 'POST', endpoint: '/conversations.invite' }
    };

    const config = endpoints[operation];
    if (!config) {
      throw new Error(`Unknown Slack operation: ${operation}`);
    }

    return this.executeRequest(integrationId, {
      method: config.method as any,
      endpoint: config.endpoint,
      data: params
    });
  }

  async webhookRequest(
    integrationId: string,
    data: any
  ): Promise<any> {
    const integration = this.integrations.get(integrationId);
    if (!integration || integration.type !== 'webhook') {
      throw new Error('Invalid webhook integration');
    }

    const webhookUrl = (integration.config as any).url || integration.config.baseUrl;
    const headers = integration.config.headers || {};
    const secret = (integration.config as any).secret;

    // Add webhook signature if secret is configured
    if (secret) {
      const signature = this.generateWebhookSignature(data, secret);
      headers['X-Webhook-Signature'] = signature;
    }

    return axios.post(webhookUrl, data, { headers, timeout: 30000 });
  }

  private createClient(provider: APIProvider): AxiosInstance {
    const client = axios.create({
      baseURL: provider.baseURL,
      timeout: provider.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MaiFarm/1.0'
      }
    });

    // Add request interceptor for logging
    client.interceptors.request.use(
      (config) => {
        this.emit('request:start', {
          provider: provider.name,
          method: config.method,
          url: config.url
        });
        return config;
      },
      (error) => {
        this.emit('request:error', {
          provider: provider.name,
          error: error?.message ?? 'Unknown error'
        });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    client.interceptors.response.use(
      (response) => {
        this.emit('request:complete', {
          provider: provider.name,
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        this.emit('request:error', {
          provider: provider.name,
          status: error.response?.status,
          error: error?.message ?? 'Unknown error'
        });
        return Promise.reject(error);
      }
    );

    return client;
  }

  private getAuthHeaders(
    provider: APIProvider,
    integration: ExternalIntegration
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    const auth = provider.auth;
    const credentials = (integration.config as any).credentials || auth.credentials;

    switch (auth.type) {
      case 'api-key':
        if (credentials?.apiKey) {
          headers['X-API-Key'] = credentials.apiKey;
        }
        break;
      
      case 'bearer':
        if (credentials?.token) {
          headers['Authorization'] = `Bearer ${credentials.token}`;
        }
        break;
      
      case 'basic':
        if (credentials?.username && credentials?.password) {
          const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;
      
      case 'oauth2':
        if (credentials?.accessToken) {
          headers['Authorization'] = `Bearer ${credentials.accessToken}`;
        }
        break;
    }

    return headers;
  }

  private async testConnection(integration: ExternalIntegration): Promise<void> {
    const testEndpoints: Record<string, string> = {
      github: '/user',
      docker: '/version',
      aws: '/health',
      slack: '/api.test',
      webhook: ''
    };

    const endpoint = testEndpoints[integration.type];
    if (!endpoint && integration.type !== 'webhook') {
      throw new Error(`No test endpoint for ${integration.type}`);
    }

    if (integration.type === 'webhook') {
      // For webhooks, just validate the URL
      try {
        new URL(integration.config.url);
      } catch {
        throw new Error('Invalid webhook URL');
      }
      return;
    }

    await this.executeRequest(integration.id, {
      method: 'GET',
      endpoint
    });
  }

  private generateWebhookSignature(data: any, secret: string): string {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(data));
    return hmac.digest('hex');
  }

  // Public API methods
  getIntegration(id: string): ExternalIntegration | undefined {
    return this.integrations.get(id);
  }

  getAllIntegrations(): ExternalIntegration[] {
    return Array.from(this.integrations.values());
  }

  getIntegrationsByType(type: ExternalIntegration['type']): ExternalIntegration[] {
    return Array.from(this.integrations.values()).filter(i => i.type === type);
  }

  getMetrics(providerName: string): RequestMetrics | undefined {
    return this.metrics.get(providerName);
  }

  async updateIntegration(
    id: string,
    updates: Partial<ExternalIntegration>
  ): Promise<void> {
    const integration = this.integrations.get(id);
    if (!integration) {
      throw new Error(`Integration ${id} not found`);
    }

    Object.assign(integration, updates);
    
    // Test connection if config changed
    if (updates.config) {
      try {
        await this.testConnection(integration);
        integration.status = 'connected';
      } catch (error: any) {
        integration.status = 'error';
        if (!integration.metadata) integration.metadata = {};
        integration.metadata.error = error?.message ?? 'Unknown error';
      }
    }

    this.emit('integration:updated', integration);
    websocketService.broadcast('integration:updated', {
      id: integration.id,
      status: integration.status
    });
  }

  async deleteIntegration(id: string): Promise<void> {
    const integration = this.integrations.get(id);
    if (!integration) {
      throw new Error(`Integration ${id} not found`);
    }

    this.integrations.delete(id);
    
    this.emit('integration:deleted', { id });
    websocketService.broadcast('integration:deleted', { id });
  }
}

// Rate limiter implementation
class RateLimiter {
  private config: RateLimitConfig;
  private tokens: number;
  private lastRefill: number;
  private queue: Array<() => void> = [];

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.tokens = config.requests;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        this.refillTokens();
        
        if (this.tokens > 0) {
          this.tokens--;
          resolve();
        } else {
          this.queue.push(tryAcquire);
        }
      };

      tryAcquire();
    });
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (this.config.strategy === 'fixed-window') {
      if (elapsed >= this.config.period) {
        this.tokens = this.config.requests;
        this.lastRefill = now;
        this.processQueue();
      }
    } else if (this.config.strategy === 'token-bucket') {
      const tokensToAdd = (elapsed / this.config.period) * this.config.requests;
      this.tokens = Math.min(this.config.requests, this.tokens + tokensToAdd);
      this.lastRefill = now;
      
      if (this.tokens >= 1) {
        this.processQueue();
      }
    }
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.tokens > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

export const apiIntegrationService = new ApiIntegrationService();
export { ApiIntegrationService };