/**
 * Service Registry with Dependency Injection
 * Central management for all unified services with lifecycle control
 */

import { EventEmitter } from 'events';
import { UnifiedTerminalService, terminalService } from './unified/terminalService';
import { farmService } from './unified/farmService';
import { stateCoordinator } from './unified/stateCoordinator';
import { websocketHub } from './unified/websocketHub';
import { quickTaskService } from './unified/quickTaskService';
import { aiProviderService } from './unified/aiProviderService';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';

// Create dbManager alias for compatibility
const dbManager = db;
import { redis } from '../database/connection';

// Create RedisManager facade
const RedisManager = {
  getInstance: () => redis,
  getClient: () => redis
};

export interface ServiceConfig {
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  database?: {
    connectionString?: string;
    pool?: any;
  };
  ai?: {
    defaultProvider?: string;
    apiKeys?: Record<string, string>;
  };
  monitoring?: {
    enabled: boolean;
    interval: number;
  };
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  uptime: number;
  metrics: {
    requestCount?: number;
    errorCount?: number;
    avgResponseTime?: number;
    memoryUsage?: number;
  };
}

export interface ServiceDependency {
  service: string;
  required: boolean;
  version?: string;
}

interface ServiceDescriptor {
  name: string;
  instance: any;
  dependencies: ServiceDependency[];
  initialized: boolean;
  health: ServiceHealth;
  startTime: Date;
}

/**
 * Service Registry Pattern with Dependency Injection
 * Manages service lifecycle, health monitoring, and dependency resolution
 */
export class ServiceRegistry extends EventEmitter {
  private static instance: ServiceRegistry;
  private services: Map<string, ServiceDescriptor> = new Map();
  private config: ServiceConfig = {};
  private isInitialized: boolean = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private initializationOrder: string[] = [];

  private constructor() {
    super();
    this.setupProcessHandlers();
  }

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Configure the service registry
   */
  configure(config: ServiceConfig): void {
    this.config = { ...this.config, ...config };
    logger.info(LogCategory.SYSTEM, 'Service registry configured');
  }

  /**
   * Initialize all services with dependency resolution
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn(LogCategory.SYSTEM, 'Service registry already initialized');
      return;
    }

    logger.info(LogCategory.SYSTEM, 'Initializing service registry...');

    try {
      // Step 1: Register all services
      await this.registerServices();

      // Step 2: Resolve dependencies and determine initialization order
      this.initializationOrder = this.resolveDependencies();

      // Step 3: Initialize services in dependency order
      for (const serviceName of this.initializationOrder) {
        await this.initializeService(serviceName);
      }

      // Step 4: Start health monitoring
      if (this.config.monitoring?.enabled) {
        this.startHealthMonitoring();
      }

      this.isInitialized = true;
      this.emit('initialized');
      logger.info(LogCategory.SYSTEM, 'Service registry initialized successfully');

    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Failed to initialize service registry', error);
      throw error;
    }
  }

  /**
   * Register all unified services
   */
  private async registerServices(): Promise<void> {
    // Core infrastructure services (no dependencies)
    this.register('database', dbManager, []);
    this.register('redis', RedisManager.getInstance(), []);

    // State coordinator (depends on redis)
    this.register('stateCoordinator', stateCoordinator, [
      { service: 'redis', required: true }
    ]);

    // WebSocket hub (depends on state)
    this.register('websocketHub', websocketHub, [
      { service: 'stateCoordinator', required: true }
    ]);

    // Terminal service (depends on websocket)
    this.register('terminalService', terminalService, [
      { service: 'websocketHub', required: true },
      { service: 'stateCoordinator', required: true }
    ]);

    // AI provider service (independent)
    this.register('aiProviderService', aiProviderService, [
      { service: 'database', required: false }
    ]);

    // Farm service (depends on multiple services)
    this.register('farmService', farmService, [
      { service: 'terminalService', required: true },
      { service: 'stateCoordinator', required: true },
      { service: 'websocketHub', required: true },
      { service: 'aiProviderService', required: true }
    ]);

    // Quick task service (depends on farm service)
    this.register('quickTaskService', quickTaskService, [
      { service: 'farmService', required: true },
      { service: 'terminalService', required: true }
    ]);
  }

  /**
   * Register a service
   */
  private register(name: string, instance: any, dependencies: ServiceDependency[]): void {
    const descriptor: ServiceDescriptor = {
      name,
      instance,
      dependencies,
      initialized: false,
      health: {
        name,
        status: 'unhealthy',
        lastCheck: new Date(),
        uptime: 0,
        metrics: {}
      },
      startTime: new Date()
    };

    this.services.set(name, descriptor);
    logger.debug(LogCategory.SYSTEM, `Registered service: ${name}`);
  }

  /**
   * Resolve dependencies using topological sort
   */
  private resolveDependencies(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }

      visiting.add(name);
      const descriptor = this.services.get(name);

      if (descriptor) {
        for (const dep of descriptor.dependencies) {
          if (dep.required) {
            visit(dep.service);
          }
        }
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    for (const name of this.services.keys()) {
      visit(name);
    }

    return order;
  }

  /**
   * Initialize a specific service
   */
  private async initializeService(name: string): Promise<void> {
    const descriptor = this.services.get(name);
    if (!descriptor) {
      throw new Error(`Service not found: ${name}`);
    }

    if (descriptor.initialized) {
      return;
    }

    logger.info(LogCategory.SYSTEM, `Initializing service: ${name}`);

    try {
      // Check if all required dependencies are initialized
      for (const dep of descriptor.dependencies) {
        if (dep.required) {
          const depDescriptor = this.services.get(dep.service);
          if (!depDescriptor?.initialized) {
            throw new Error(`Required dependency not initialized: ${dep.service}`);
          }
        }
      }

      // Initialize the service if it has an initialize method
      if (typeof descriptor.instance.initialize === 'function') {
        await descriptor.instance.initialize(this.getServiceContext(name));
      }

      descriptor.initialized = true;
      descriptor.health.status = 'healthy';
      descriptor.startTime = new Date();

      this.emit('service:initialized', name);
      logger.info(LogCategory.SYSTEM, `Service initialized: ${name}`);

    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to initialize service: ${name}`, error);
      descriptor.health.status = 'unhealthy';
      throw error;
    }
  }

  /**
   * Get service context for dependency injection
   */
  private getServiceContext(serviceName: string): any {
    const descriptor = this.services.get(serviceName);
    if (!descriptor) return {};

    const context: any = {
      config: this.config,
      logger: (message: string, ...args: any[]) =>
        logger.info(LogCategory.SYSTEM, `[${serviceName}] ${message}`, ...args)
    };

    // Inject dependencies
    for (const dep of descriptor.dependencies) {
      const depDescriptor = this.services.get(dep.service);
      if (depDescriptor?.initialized) {
        context[dep.service] = depDescriptor.instance;
      }
    }

    return context;
  }

  /**
   * Get a service instance
   */
  get<T = any>(name: string): T {
    const descriptor = this.services.get(name);
    if (!descriptor) {
      throw new Error(`Service not found: ${name}`);
    }

    if (!descriptor.initialized) {
      throw new Error(`Service not initialized: ${name}`);
    }

    return descriptor.instance as T;
  }

  /**
   * Check if a service exists and is initialized
   */
  has(name: string): boolean {
    const descriptor = this.services.get(name);
    return descriptor?.initialized === true;
  }

  /**
   * Get all service health statuses
   */
  getHealth(): ServiceHealth[] {
    const health: ServiceHealth[] = [];
    for (const descriptor of this.services.values()) {
      health.push({
        ...descriptor.health,
        uptime: Date.now() - descriptor.startTime.getTime()
      });
    }
    return health;
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    const interval = this.config.monitoring?.interval || 30000;

    this.healthCheckInterval = setInterval(async () => {
      for (const [name, descriptor] of this.services.entries()) {
        if (descriptor.initialized) {
          await this.checkServiceHealth(name);
        }
      }
    }, interval);

    logger.info(LogCategory.SYSTEM, `Health monitoring started (interval: ${interval}ms)`);
  }

  /**
   * Check health of a specific service
   */
  private async checkServiceHealth(name: string): Promise<void> {
    const descriptor = this.services.get(name);
    if (!descriptor) return;

    try {
      // If service has a health check method, use it
      if (typeof descriptor.instance.healthCheck === 'function') {
        const isHealthy = await descriptor.instance.healthCheck();
        descriptor.health.status = isHealthy ? 'healthy' : 'unhealthy';
      } else {
        // Basic health check - service is considered healthy if initialized
        descriptor.health.status = descriptor.initialized ? 'healthy' : 'unhealthy';
      }

      // Update metrics if service provides them
      if (typeof descriptor.instance.getMetrics === 'function') {
        descriptor.health.metrics = await descriptor.instance.getMetrics();
      }

      descriptor.health.lastCheck = new Date();

    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Health check failed for ${name}`, error);
      descriptor.health.status = 'unhealthy';
    }
  }

  /**
   * Gracefully shutdown all services
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.SYSTEM, 'Shutting down service registry...');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Shutdown services in reverse initialization order
    const shutdownOrder = [...this.initializationOrder].reverse();

    for (const name of shutdownOrder) {
      const descriptor = this.services.get(name);
      if (descriptor?.initialized) {
        try {
          logger.info(LogCategory.SYSTEM, `Shutting down service: ${name}`);

          if (typeof descriptor.instance.shutdown === 'function') {
            await descriptor.instance.shutdown();
          }

          descriptor.initialized = false;
          descriptor.health.status = 'unhealthy';

        } catch (error) {
          logger.error(LogCategory.SYSTEM, `Error shutting down service: ${name}`, error);
        }
      }
    }

    this.isInitialized = false;
    this.emit('shutdown');
    logger.info(LogCategory.SYSTEM, 'Service registry shutdown complete');
  }

  /**
   * Restart a specific service
   */
  async restartService(name: string): Promise<void> {
    const descriptor = this.services.get(name);
    if (!descriptor) {
      throw new Error(`Service not found: ${name}`);
    }

    logger.info(LogCategory.SYSTEM, `Restarting service: ${name}`);

    // Shutdown the service
    if (descriptor.initialized && typeof descriptor.instance.shutdown === 'function') {
      await descriptor.instance.shutdown();
    }

    descriptor.initialized = false;

    // Re-initialize the service
    await this.initializeService(name);

    // Re-initialize dependent services
    for (const [depName, depDescriptor] of this.services.entries()) {
      if (depDescriptor.dependencies.some(d => d.service === name && d.required)) {
        await this.restartService(depName);
      }
    }
  }

  /**
   * Setup process handlers for graceful shutdown
   */
  private setupProcessHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      logger.info(LogCategory.SYSTEM, `Received ${signal}, initiating graceful shutdown...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error(LogCategory.SYSTEM, 'Uncaught exception', error);
      this.emit('error', error);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error(LogCategory.SYSTEM, 'Unhandled rejection', reason);
      this.emit('error', reason);
    });
  }

  /**
   * Get service statistics
   */
  getStatistics(): any {
    return {
      totalServices: this.services.size,
      initializedServices: Array.from(this.services.values()).filter(s => s.initialized).length,
      healthyServices: Array.from(this.services.values()).filter(s => s.health.status === 'healthy').length,
      degradedServices: Array.from(this.services.values()).filter(s => s.health.status === 'degraded').length,
      unhealthyServices: Array.from(this.services.values()).filter(s => s.health.status === 'unhealthy').length,
      uptime: this.isInitialized ? Date.now() - this.services.get('database')?.startTime.getTime() || 0 : 0
    };
  }
}

// Export singleton instance
export const serviceRegistry = ServiceRegistry.getInstance();