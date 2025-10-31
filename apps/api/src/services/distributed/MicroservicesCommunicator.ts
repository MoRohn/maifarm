/**
 * MicroservicesCommunicator - Enables service-to-service communication
 *
 * Provides:
 * - Service discovery and registration
 * - RPC-style communication
 * - Event-driven messaging
 * - Circuit breaker pattern
 * - Retry logic with exponential backoff
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger, LogCategory } from '../../utils/logger';
import { redisPubSubManager, RedisPubSubManager } from './RedisPubSubManager';

interface ServiceEndpoint {
  id: string;
  name: string;
  version: string;
  baseUrl: string;
  healthCheckUrl: string;
  capabilities: string[];
  status: 'healthy' | 'unhealthy' | 'circuit-open';
  lastHealthCheck: Date;
  metadata?: Record<string, any>;
}

interface ServiceRequest {
  id: string;
  service: string;
  method: string;
  params: any;
  headers?: Record<string, string>;
  timeout?: number;
}

interface ServiceResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

interface CircuitBreakerState {
  service: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successCount: number;
  lastFailure: Date | null;
  nextAttempt: Date | null;
}

interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export class MicroservicesCommunicator extends EventEmitter {
  private static instance: MicroservicesCommunicator;
  private services: Map<string, ServiceEndpoint[]> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private httpClients: Map<string, AxiosInstance> = new Map();
  private pendingRequests: Map<string, ServiceRequest> = new Map();
  private serviceId: string;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
  private readonly HALF_OPEN_SUCCESS_THRESHOLD = 3;
  private readonly DEFAULT_REQUEST_TIMEOUT = 30000; // 30 seconds

  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  };

  private constructor() {
    super();
    this.serviceId = `maifarm-${process.env.SERVICE_NAME || 'main'}-${uuidv4()}`;
    this.initialize();
  }

  static getInstance(): MicroservicesCommunicator {
    if (!MicroservicesCommunicator.instance) {
      MicroservicesCommunicator.instance = new MicroservicesCommunicator();
    }
    return MicroservicesCommunicator.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Register local service
      await this.registerLocalService();

      // Subscribe to service discovery channel
      await redisPubSubManager.subscribe(
        'maifarm:services:discovery',
        (message) => this.handleServiceDiscovery(message)
      );

      // Subscribe to RPC channel
      await redisPubSubManager.subscribe(
        `maifarm:services:rpc:${this.serviceId}`,
        (message) => this.handleRPCRequest(message)
      );

      // Start health checks
      this.startHealthChecking();

      logger.info(LogCategory.DISTRIBUTED,
        `MicroservicesCommunicator initialized with service ID: ${this.serviceId}`);

    } catch (error) {
      logger.error(LogCategory.DISTRIBUTED,
        'Failed to initialize MicroservicesCommunicator:', error);
    }
  }

  /**
   * Register local service
   */
  private async registerLocalService(): Promise<void> {
    const localService: ServiceEndpoint = {
      id: this.serviceId,
      name: process.env.SERVICE_NAME || 'maifarm-main',
      version: process.env.SERVICE_VERSION || '1.0.0',
      baseUrl: process.env.SERVICE_URL || `http://localhost:${process.env.PORT || 4567}`,
      healthCheckUrl: '/health',
      capabilities: this.getLocalCapabilities(),
      status: 'healthy',
      lastHealthCheck: new Date(),
      metadata: {
        instanceId: process.env.INSTANCE_ID,
        hostname: process.env.HOSTNAME,
        startTime: new Date()
      }
    };

    // Store locally
    this.addService(localService);

    // Announce to other services
    await this.announceService(localService);
  }

  /**
   * Get local service capabilities
   */
  private getLocalCapabilities(): string[] {
    // Determine capabilities based on loaded modules
    const capabilities: string[] = [];

    if (process.env.SERVICE_NAME === 'farm-service') {
      capabilities.push('farm-management', 'agent-orchestration');
    } else if (process.env.SERVICE_NAME === 'harvest-service') {
      capabilities.push('harvest-collection', 'barn-storage');
    } else if (process.env.SERVICE_NAME === 'terminal-service') {
      capabilities.push('terminal-streaming', 'output-capture');
    } else {
      // Main service has all capabilities
      capabilities.push(
        'farm-management',
        'agent-orchestration',
        'harvest-collection',
        'barn-storage',
        'terminal-streaming',
        'metrics-collection',
        'websocket-communication'
      );
    }

    return capabilities;
  }

  /**
   * Announce service to network
   */
  private async announceService(service: ServiceEndpoint): Promise<void> {
    await redisPubSubManager.publish(
      'maifarm:services:discovery',
      'service:announce',
      service
    );
  }

  /**
   * Handle service discovery messages
   */
  private handleServiceDiscovery(message: any): void {
    switch (message.event) {
      case 'service:announce':
        this.addService(message.data);
        break;

      case 'service:shutdown':
        this.removeService(message.data.id);
        break;

      case 'service:health:update':
        this.updateServiceHealth(message.data.id, message.data.status);
        break;
    }
  }

  /**
   * Add a discovered service
   */
  private addService(service: ServiceEndpoint): void {
    if (service.id === this.serviceId) return; // Skip self

    const services = this.services.get(service.name) || [];
    
    // Remove old version if exists
    const existingIndex = services.findIndex(s => s.id === service.id);
    if (existingIndex >= 0) {
      services[existingIndex] = service;
    } else {
      services.push(service);
    }

    this.services.set(service.name, services);

    // Create HTTP client for this service
    if (!this.httpClients.has(service.id)) {
      this.httpClients.set(service.id, axios.create({
        baseURL: service.baseUrl,
        timeout: this.DEFAULT_REQUEST_TIMEOUT
      }));
    }

    logger.info(LogCategory.DISTRIBUTED,
      `Service discovered: ${service.name} (${service.id}) at ${service.baseUrl}`);

    this.emit('service:discovered', service);
  }

  /**
   * Remove a service
   */
  private removeService(serviceId: string): void {
    for (const [name, services] of this.services) {
      const filtered = services.filter(s => s.id !== serviceId);
      if (filtered.length !== services.length) {
        this.services.set(name, filtered);
        this.httpClients.delete(serviceId);
        
        logger.info(LogCategory.DISTRIBUTED,
          `Service removed: ${name} (${serviceId})`);
        
        this.emit('service:removed', { name, id: serviceId });
        break;
      }
    }
  }

  /**
   * Update service health status
   */
  private updateServiceHealth(serviceId: string, status: string): void {
    for (const services of this.services.values()) {
      const service = services.find(s => s.id === serviceId);
      if (service) {
        service.status = status as any;
        service.lastHealthCheck = new Date();
        break;
      }
    }
  }

  /**
   * Call a remote service method
   */
  async call<T = any>(
    serviceName: string,
    method: string,
    params: any,
    options: {
      timeout?: number;
      retries?: number;
      preferredVersion?: string;
    } = {}
  ): Promise<T> {
    // Check circuit breaker
    const circuitBreaker = this.getCircuitBreaker(serviceName);
    if (circuitBreaker.state === 'open') {
      if (new Date() < circuitBreaker.nextAttempt!) {
        throw new Error(`Circuit breaker open for service ${serviceName}`);
      }
      // Try half-open
      circuitBreaker.state = 'half-open';
      circuitBreaker.successCount = 0;
    }

    // Find available service
    const service = this.selectService(serviceName, options.preferredVersion);
    if (!service) {
      throw new Error(`No available service: ${serviceName}`);
    }

    const requestId = uuidv4();
    const request: ServiceRequest = {
      id: requestId,
      service: serviceName,
      method,
      params,
      timeout: options.timeout || this.DEFAULT_REQUEST_TIMEOUT
    };

    try {
      // Try RPC first for internal services
      if (service.name.startsWith('maifarm-')) {
        return await this.callRPC<T>(service, request, options);
      }

      // Fall back to HTTP for external services
      return await this.callHTTP<T>(service, request, options);

    } catch (error) {
      await this.handleCallError(serviceName, circuitBreaker, error);
      throw error;
    }
  }

  /**
   * RPC call to internal service
   */
  private async callRPC<T>(
    service: ServiceEndpoint,
    request: ServiceRequest,
    options: any
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`RPC timeout for ${request.service}.${request.method}`));
      }, request.timeout!);

      // Store pending request
      this.pendingRequests.set(request.id, request);

      // Set up response handler
      const responseChannel = `maifarm:services:rpc:response:${request.id}`;
      await redisPubSubManager.subscribe(responseChannel, (message) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(request.id);
        redisPubSubManager.unsubscribe(responseChannel);

        if (message.data.success) {
          this.handleCallSuccess(request.service);
          resolve(message.data.data);
        } else {
          reject(new Error(message.data.error));
        }
      });

      // Send RPC request
      await redisPubSubManager.publish(
        `maifarm:services:rpc:${service.id}`,
        'rpc:request',
        {
          ...request,
          responseChannel
        }
      );
    });
  }

  /**
   * HTTP call to service
   */
  private async callHTTP<T>(
    service: ServiceEndpoint,
    request: ServiceRequest,
    options: any
  ): Promise<T> {
    const client = this.httpClients.get(service.id);
    if (!client) {
      throw new Error(`No HTTP client for service ${service.id}`);
    }

    const startTime = Date.now();
    const retryConfig = { ...this.defaultRetryConfig, maxRetries: options.retries || 3 };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const response = await client.request({
          url: `/api/${request.method}`,
          method: 'POST',
          data: request.params,
          headers: request.headers,
          timeout: request.timeout
        });

        const duration = Date.now() - startTime;
        
        logger.debug(LogCategory.DISTRIBUTED,
          `HTTP call to ${service.name}.${request.method} completed in ${duration}ms`);

        this.handleCallSuccess(request.service);
        return response.data;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retryConfig.maxRetries) {
          const delay = this.calculateRetryDelay(attempt, retryConfig);
          logger.warn(LogCategory.DISTRIBUTED,
            `HTTP call failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries})`);
          
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Handle incoming RPC requests
   */
  private async handleRPCRequest(message: any): Promise<void> {
    if (message.event !== 'rpc:request') return;

    const request = message.data;
    const startTime = Date.now();

    try {
      // Execute the requested method
      const result = await this.executeLocalMethod(request.method, request.params);
      
      const response: ServiceResponse = {
        id: request.id,
        success: true,
        data: result,
        duration: Date.now() - startTime
      };

      // Send response
      await redisPubSubManager.publish(
        request.responseChannel,
        'rpc:response',
        response
      );

    } catch (error) {
      const response: ServiceResponse = {
        id: request.id,
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime
      };

      await redisPubSubManager.publish(
        request.responseChannel,
        'rpc:response',
        response
      );
    }
  }

  /**
   * Execute a local method
   */
  private async executeLocalMethod(method: string, params: any): Promise<any> {
    // Route to appropriate service method
    // This would be replaced with actual service method routing
    const [servicePart, methodPart] = method.split('.');

    switch (servicePart) {
      case 'farm':
        const farmService = require('../unified/UnifiedFarmService').unifiedFarmService;
        return await farmService[methodPart](params);

      case 'terminal':
        const terminalService = require('../unified/UnifiedTerminalService').unifiedTerminalService;
        return await terminalService[methodPart](params);

      case 'harvest':
        const harvestService = require('../harvestService').harvestService;
        return await harvestService[methodPart](params);

      default:
        throw new Error(`Unknown service method: ${method}`);
    }
  }

  /**
   * Select best available service
   */
  private selectService(
    serviceName: string,
    preferredVersion?: string
  ): ServiceEndpoint | null {
    const services = this.services.get(serviceName);
    if (!services || services.length === 0) return null;

    // Filter healthy services
    const healthyServices = services.filter(s => s.status === 'healthy');
    if (healthyServices.length === 0) return null;

    // Prefer specific version if requested
    if (preferredVersion) {
      const versionMatch = healthyServices.find(s => s.version === preferredVersion);
      if (versionMatch) return versionMatch;
    }

    // Return random healthy service for load balancing
    return healthyServices[Math.floor(Math.random() * healthyServices.length)];
  }

  /**
   * Get or create circuit breaker for service
   */
  private getCircuitBreaker(serviceName: string): CircuitBreakerState {
    let breaker = this.circuitBreakers.get(serviceName);
    
    if (!breaker) {
      breaker = {
        service: serviceName,
        state: 'closed',
        failures: 0,
        successCount: 0,
        lastFailure: null,
        nextAttempt: null
      };
      this.circuitBreakers.set(serviceName, breaker);
    }

    return breaker;
  }

  /**
   * Handle successful call
   */
  private handleCallSuccess(serviceName: string): void {
    const breaker = this.getCircuitBreaker(serviceName);
    
    if (breaker.state === 'half-open') {
      breaker.successCount++;
      if (breaker.successCount >= this.HALF_OPEN_SUCCESS_THRESHOLD) {
        breaker.state = 'closed';
        breaker.failures = 0;
        breaker.successCount = 0;
        logger.info(LogCategory.DISTRIBUTED,
          `Circuit breaker closed for ${serviceName}`);
      }
    } else if (breaker.state === 'closed') {
      breaker.failures = 0;
    }
  }

  /**
   * Handle call error
   */
  private async handleCallError(
    serviceName: string,
    breaker: CircuitBreakerState,
    error: any
  ): Promise<void> {
    breaker.failures++;
    breaker.lastFailure = new Date();

    if (breaker.state === 'half-open') {
      // Failed in half-open, go back to open
      breaker.state = 'open';
      breaker.nextAttempt = new Date(Date.now() + this.CIRCUIT_BREAKER_TIMEOUT);
      logger.warn(LogCategory.DISTRIBUTED,
        `Circuit breaker opened for ${serviceName} (half-open failure)`);
    } else if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      // Open circuit breaker
      breaker.state = 'open';
      breaker.nextAttempt = new Date(Date.now() + this.CIRCUIT_BREAKER_TIMEOUT);
      logger.warn(LogCategory.DISTRIBUTED,
        `Circuit breaker opened for ${serviceName} (threshold reached)`);
      
      this.emit('circuit:open', { service: serviceName, failures: breaker.failures });
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    const delay = Math.min(
      config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
      config.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }

  /**
   * Start health checking
   */
  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkServicesHealth();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Check health of all services
   */
  private async checkServicesHealth(): Promise<void> {
    for (const services of this.services.values()) {
      for (const service of services) {
        if (service.id === this.serviceId) continue;

        try {
          const client = this.httpClients.get(service.id);
          if (!client) continue;

          const response = await client.get(service.healthCheckUrl, {
            timeout: 5000
          });

          if (response.status === 200) {
            service.status = 'healthy';
          } else {
            service.status = 'unhealthy';
          }
        } catch (error) {
          service.status = 'unhealthy';
          logger.debug(LogCategory.DISTRIBUTED,
            `Health check failed for ${service.name} (${service.id})`);
        }

        service.lastHealthCheck = new Date();
      }
    }
  }

  /**
   * Broadcast event to all services
   */
  async broadcast(event: string, data: any): Promise<void> {
    await redisPubSubManager.publish(
      'maifarm:services:events',
      event,
      {
        source: this.serviceId,
        timestamp: new Date(),
        data
      }
    );
  }

  /**
   * Subscribe to service events
   */
  async subscribe(
    eventPattern: string,
    handler: (event: string, data: any) => void
  ): Promise<void> {
    await redisPubSubManager.subscribe(
      'maifarm:services:events',
      (message) => {
        if (message.event.match(eventPattern)) {
          handler(message.event, message.data);
        }
      }
    );
  }

  /**
   * Get service statistics
   */
  getStatistics(): {
    totalServices: number;
    healthyServices: number;
    circuitBreakers: Map<string, CircuitBreakerState>;
    pendingRequests: number;
  } {
    let totalServices = 0;
    let healthyServices = 0;

    for (const services of this.services.values()) {
      totalServices += services.length;
      healthyServices += services.filter(s => s.status === 'healthy').length;
    }

    return {
      totalServices,
      healthyServices,
      circuitBreakers: this.circuitBreakers,
      pendingRequests: this.pendingRequests.size
    };
  }

  /**
   * Get list of available services
   */
  getServices(): Map<string, ServiceEndpoint[]> {
    return new Map(this.services);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown communicator
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Announce shutdown
    await redisPubSubManager.publish(
      'maifarm:services:discovery',
      'service:shutdown',
      { id: this.serviceId }
    );

    // Clear pending requests
    this.pendingRequests.clear();

    logger.info(LogCategory.DISTRIBUTED, 'MicroservicesCommunicator shut down');
  }
}

// Export singleton instance
export const microservicesCommunicator = MicroservicesCommunicator.getInstance();