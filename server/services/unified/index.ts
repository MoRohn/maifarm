/**
 * Unified Service Registry for MaiFarm
 * Consolidates all service instances and provides centralized access
 * This solves the problem of 62+ duplicate service files
 */

import { logger, LogCategory } from '../../utils/logger';

// Core Services (Singletons)
import { UnifiedFarmService } from './farmService';
import { UnifiedAgentService } from './agentService';
import { UnifiedTerminalService } from './terminalService';
import { UnifiedHarvestService } from './harvestService';
import { UnifiedMonitoringService } from './monitoringService';
import { UnifiedOrchestratorService } from './orchestratorService';
import { UnifiedWebSocketHub } from './websocketHub';
import { UnifiedAuthService } from './authService';
import { UnifiedDatabaseService } from './databaseService';
import { UnifiedCacheService } from './cacheService';
import { UnifiedFileService } from './fileService';
import { UnifiedNotificationService } from './notificationService';

/**
 * Service Registry Pattern
 * Provides centralized access to all services
 */
class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services: Map<string, any> = new Map();
  private initialized: boolean = false;

  // Service instances
  public farm!: UnifiedFarmService;
  public agent!: UnifiedAgentService;
  public terminal!: UnifiedTerminalService;
  public harvest!: UnifiedHarvestService;
  public monitoring!: UnifiedMonitoringService;
  public orchestrator!: UnifiedOrchestratorService;
  public websocket!: UnifiedWebSocketHub;
  public auth!: UnifiedAuthService;
  public database!: UnifiedDatabaseService;
  public cache!: UnifiedCacheService;
  public file!: UnifiedFileService;
  public notification!: UnifiedNotificationService;

  private constructor() {
    logger.info(LogCategory.SYSTEM, 'Initializing Unified Service Registry');
  }

  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Initialize all services in correct dependency order
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn(LogCategory.SYSTEM, 'Service Registry already initialized');
      return;
    }

    try {
      logger.info(LogCategory.SYSTEM, 'Starting service initialization...');

      // Level 1: Core infrastructure (no dependencies)
      this.database = new UnifiedDatabaseService();
      this.cache = new UnifiedCacheService();
      this.file = new UnifiedFileService();
      await Promise.all([
        this.database.initialize(),
        this.cache.initialize(),
        this.file.initialize()
      ]);
      logger.info(LogCategory.SYSTEM, 'Core infrastructure initialized');

      // Level 2: Foundation services (depend on infrastructure)
      this.auth = new UnifiedAuthService(this.database, this.cache);
      this.websocket = new UnifiedWebSocketHub();
      this.notification = new UnifiedNotificationService(this.websocket);
      await Promise.all([
        this.auth.initialize(),
        this.websocket.initialize(),
        this.notification.initialize()
      ]);
      logger.info(LogCategory.SYSTEM, 'Foundation services initialized');

      // Level 3: Business services (depend on foundation)
      this.monitoring = new UnifiedMonitoringService(this.database, this.websocket);
      this.agent = new UnifiedAgentService(this.database, this.monitoring, this.websocket);
      this.terminal = new UnifiedTerminalService(this.websocket, this.file);
      await Promise.all([
        this.monitoring.initialize(),
        this.agent.initialize(),
        this.terminal.initialize()
      ]);
      logger.info(LogCategory.SYSTEM, 'Business services initialized');

      // Level 4: Orchestration services (depend on business)
      this.farm = new UnifiedFarmService(
        this.database,
        this.agent,
        this.websocket,
        this.monitoring
      );
      this.harvest = new UnifiedHarvestService(
        this.database,
        this.farm,
        this.file,
        this.websocket
      );
      this.orchestrator = new UnifiedOrchestratorService(
        this.farm,
        this.agent,
        this.terminal,
        this.monitoring
      );
      await Promise.all([
        this.farm.initialize(),
        this.harvest.initialize(),
        this.orchestrator.initialize()
      ]);
      logger.info(LogCategory.SYSTEM, 'Orchestration services initialized');

      // Register all services
      this.registerServices();

      this.initialized = true;
      logger.info(LogCategory.SYSTEM, '✅ All services initialized successfully');
    } catch (error) {
      logger.error(LogCategory.SYSTEM, 'Failed to initialize services:', error);
      throw new Error(`Service initialization failed: ${error.message}`);
    }
  }

  /**
   * Register services in the registry
   */
  private registerServices(): void {
    this.services.set('farm', this.farm);
    this.services.set('agent', this.agent);
    this.services.set('terminal', this.terminal);
    this.services.set('harvest', this.harvest);
    this.services.set('monitoring', this.monitoring);
    this.services.set('orchestrator', this.orchestrator);
    this.services.set('websocket', this.websocket);
    this.services.set('auth', this.auth);
    this.services.set('database', this.database);
    this.services.set('cache', this.cache);
    this.services.set('file', this.file);
    this.services.set('notification', this.notification);
  }

  /**
   * Get a service by name
   */
  public getService<T = any>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not found in registry`);
    }
    return service as T;
  }

  /**
   * Check if a service exists
   */
  public hasService(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Shutdown all services gracefully
   */
  public async shutdown(): Promise<void> {
    logger.info(LogCategory.SYSTEM, 'Shutting down all services...');

    // Shutdown in reverse order of initialization
    const shutdownOrder = [
      this.orchestrator,
      this.harvest,
      this.farm,
      this.terminal,
      this.agent,
      this.monitoring,
      this.notification,
      this.websocket,
      this.auth,
      this.file,
      this.cache,
      this.database
    ];

    for (const service of shutdownOrder) {
      if (service && typeof service.shutdown === 'function') {
        try {
          await service.shutdown();
        } catch (error) {
          logger.error(LogCategory.SYSTEM, `Error shutting down service:`, error);
        }
      }
    }

    this.initialized = false;
    logger.info(LogCategory.SYSTEM, 'All services shut down');
  }

  /**
   * Health check for all services
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    services: Record<string, { healthy: boolean; message?: string }>;
  }> {
    const results: Record<string, { healthy: boolean; message?: string }> = {};
    let allHealthy = true;

    for (const [name, service] of this.services) {
      try {
        if (typeof service.healthCheck === 'function') {
          const health = await service.healthCheck();
          results[name] = health;
          if (!health.healthy) allHealthy = false;
        } else {
          results[name] = { healthy: true };
        }
      } catch (error) {
        results[name] = { healthy: false, message: error.message };
        allHealthy = false;
      }
    }

    return {
      healthy: allHealthy,
      services: results
    };
  }

  /**
   * Get service statistics
   */
  public getStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [name, service] of this.services) {
      if (typeof service.getStats === 'function') {
        stats[name] = service.getStats();
      }
    }

    return stats;
  }
}

// Export singleton instance
export const serviceRegistry = ServiceRegistry.getInstance();

// Export convenience getters for common services
export const getFarmService = () => serviceRegistry.farm;
export const getAgentService = () => serviceRegistry.agent;
export const getTerminalService = () => serviceRegistry.terminal;
export const getHarvestService = () => serviceRegistry.harvest;
export const getMonitoringService = () => serviceRegistry.monitoring;
export const getOrchestratorService = () => serviceRegistry.orchestrator;
export const getWebSocketHub = () => serviceRegistry.websocket;
export const getAuthService = () => serviceRegistry.auth;
export const getDatabaseService = () => serviceRegistry.database;
export const getCacheService = () => serviceRegistry.cache;
export const getFileService = () => serviceRegistry.file;
export const getNotificationService = () => serviceRegistry.notification;

// Re-export types
export * from './types';