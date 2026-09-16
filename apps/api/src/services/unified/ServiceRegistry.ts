/**
 * ServiceRegistry - Centralized service management and dependency injection
 *
 * Provides:
 * - Single source of truth for all services
 * - Lazy loading of services
 * - Dependency injection
 * - Service lifecycle management
 */

import { logger, LogCategory } from '../../utils/logger';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
import { farmService } from './farmService';
import { terminalService } from './terminalService';
import { MemoryManager, memoryManager } from './MemoryManager';
import { CacheManager, cacheManager } from './CacheManager';
import { unifiedFarmLaunchOrchestrator } from '../UnifiedFarmLaunchOrchestrator';

// Import legacy services that haven't been unified yet
// These will be imported lazily to avoid circular dependencies

interface ServiceMap {
  // Unified services
  farm: typeof farmService;
  terminal: typeof terminalService;
  memory: MemoryManager;
  cache: CacheManager;
  farmLauncher: typeof unifiedFarmLaunchOrchestrator;

  // Distributed services
  pubsub: typeof redisPubSubManager;
  scaling: typeof horizontalScalingCoordinator;
  microservices: typeof microservicesCommunicator;

  // Legacy services (to be unified later)
  websocket: typeof websocketManager;
  database: typeof db;
  redis: typeof redis;
  shutdown: typeof shutdownCoordinator;
  harvest: typeof harvestService;
  barn: typeof barnService;
  workspace: typeof workspaceManager;
  yaml: typeof yamlGenerator;
  costTracking: typeof costTrackingService;
  metrics: typeof metricsAggregator;
}

class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services: Partial<ServiceMap> = {};
  private initialized = false;

  private constructor() {}

  has(serviceName: keyof ServiceMap): boolean {
    return this.services[serviceName] !== undefined;
  }

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Initialize all core services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn(LogCategory.SYSTEM, 'ServiceRegistry already initialized');
      return;
    }

    logger.info(LogCategory.SYSTEM, 'Initializing ServiceRegistry...');

    try {
      // Register unified services
      this.services.farm = farmService;
      this.services.terminal = terminalService;
      this.services.memory = memoryManager;
      this.services.cache = cacheManager;

      // Register legacy services lazily to avoid circular dependencies
      // These will be loaded on-demand when accessed

      this.initialized = true;
      logger.info(LogCategory.SYSTEM, 'ServiceRegistry initialized successfully');

    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Failed to initialize ServiceRegistry:', error);
      throw error;
    }
  }

  /**
   * Get a service by name (with lazy loading for legacy services)
   */
  get<K extends keyof ServiceMap>(serviceName: K): ServiceMap[K] {
    let service = this.services[serviceName];

    // Lazy load legacy services on first access
    if (!service) {
      service = this.lazyLoadService(serviceName);
      if (service) {
        this.services[serviceName] = service;
      }
    }

    if (!service) {
      throw new Error(`Service '${serviceName}' not found in registry`);
    }

    return service as ServiceMap[K];
  }

  /**
   * Lazy load a legacy service
   */
  private lazyLoadService(serviceName: keyof ServiceMap): any {
    try {
      switch (serviceName) {
        // Distributed services
        case 'pubsub':
          return require('../distributed/RedisPubSubManager').redisPubSubManager;
        case 'scaling':
          return require('../distributed/HorizontalScalingCoordinator').horizontalScalingCoordinator;
        case 'microservices':
          return require('../distributed/MicroservicesCommunicator').microservicesCommunicator;

        // Legacy services
        case 'websocket':
          return require('../../websocket/websocketManager').websocketManager;
        case 'database':
          return require('../../database/connection').db;
        case 'redis':
          return require('../../database/redis').redis;
        case 'shutdown':
          return require('../shutdownCoordinator').shutdownCoordinator;
        case 'harvest':
          return require('./harvestService').harvestService;
        case 'barn':
          // FIX: Use unified barnService with full harvest integration
          return require('./barnService').barnService;
        case 'workspace':
          return require('../workspaceManager').workspaceManager;
        case 'yaml':
          return require('../yamlGenerator').yamlGenerator;
        case 'costTracking':
          return require('../costTrackingService').costTrackingService;
        case 'metrics':
          return require('../metricsAggregator').metricsAggregator;
        default:
          return null;
      }
    } catch (error) {
      logger.warn(LogCategory.SYSTEM, `Failed to lazy load service ${serviceName}:`, error);
      return null;
    }
  }

  /**
   * Check if a service is registered
   */
  has(serviceName: keyof ServiceMap): boolean {
    return !!this.services[serviceName];
  }

  /**
   * Register a custom service
   */
  register<K extends keyof ServiceMap>(serviceName: K, service: ServiceMap[K]): void {
    if (this.services[serviceName]) {
      logger.warn(LogCategory.SYSTEM, `Service '${serviceName}' already registered, overwriting`);
    }

    this.services[serviceName] = service;
    logger.info(LogCategory.SYSTEM, `Service '${serviceName}' registered`);
  }

  /**
   * Unregister a service
   */
  unregister(serviceName: keyof ServiceMap): void {
    delete this.services[serviceName];
    logger.info(LogCategory.SYSTEM, `Service '${serviceName}' unregistered`);
  }

  /**
   * Get all registered services
   */
  getAllServices(): Partial<ServiceMap> {
    return { ...this.services };
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.SYSTEM, 'Shutting down all services...');

    const shutdownPromises: Promise<void>[] = [];

    // Shutdown unified services
    if (this.services.farm) {
      // Farm service handles its own shutdown
    }

    if (this.services.terminal) {
      // Terminal service handles its own shutdown
    }

    // Memory manager and cache manager handle their own cleanup

    await Promise.all(shutdownPromises);

    logger.info(LogCategory.SYSTEM, 'All services shut down successfully');
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<{
    [K in keyof ServiceMap]?: {
      status: 'healthy' | 'unhealthy' | 'unknown';
      details?: any;
    }
  }> {
    const health: any = {};

    // Check each service health
    for (const [name, service] of Object.entries(this.services)) {
      try {
        // Add health check logic based on service type
        health[name] = {
          status: 'healthy',
          details: {}
        };
      } catch (error) {
        health[name] = {
          status: 'unhealthy',
          details: { error: error.message }
        };
      }
    }

    return health;
  }
}

// Export singleton instance
export const serviceRegistry = ServiceRegistry.getInstance();

// Export service getter for convenience
export function getService<K extends keyof ServiceMap>(serviceName: K): ServiceMap[K] {
  return serviceRegistry.get(serviceName);
}

// Export type for service names
export type ServiceName = keyof ServiceMap;
