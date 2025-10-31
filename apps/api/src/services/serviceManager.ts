/**
 * Service Manager - Centralized service lifecycle management
 * 
 * Handles:
 * - Service initialization order
 * - Dependency injection
 * - Health monitoring
 * - Graceful shutdown
 */

import { EventEmitter } from 'events';
import { logger, LogCategory } from '../utils/logger';
import { harvestService } from './harvestService';
import { terminalStreamService } from './terminalStreamService';
import { websocketManager } from '../websocket/websocketManager';
import { db } from '../database/connection';

interface ServiceConfig {
  name: string;
  service: any;
  dependencies?: string[];
  initialize?: () => Promise<void>;
  healthCheck?: () => Promise<boolean>;
  cleanup?: () => Promise<void>;
}

class ServiceManager extends EventEmitter {
  private static instance: ServiceManager;
  private services = new Map<string, ServiceConfig>();
  private initialized = new Set<string>();
  private isShuttingDown = false;

  private constructor() {
    super();
    this.registerCoreServices();
    this.setupShutdownHandlers();
  }

  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  /**
   * Register core services with proper dependencies
   */
  private registerCoreServices(): void {
    // Database - base dependency
    this.register({
      name: 'database',
      service: db,
      initialize: async () => {
        // Database is already initialized via connection.ts
        logger.info(LogCategory.SYSTEM, 'Database service registered');
      },
      healthCheck: async () => {
        try {
          await db.query('SELECT 1');
          return true;
        } catch {
          return false;
        }
      }
    });

    // Harvest service
    this.register({
      name: 'harvest',
      service: harvestService,
      dependencies: ['database'],
      initialize: async () => {
        logger.info(LogCategory.SYSTEM, 'Harvest service initialized');
      }
    });

    // Terminal stream service
    this.register({
      name: 'terminalStream',
      service: terminalStreamService,
      dependencies: ['websocket'],
      initialize: async () => {
        logger.info(LogCategory.SYSTEM, 'Terminal stream service initialized');
      },
      cleanup: async () => {
        await terminalStreamService.cleanup();
      }
    });

    // WebSocket manager
    this.register({
      name: 'websocket',
      service: websocketManager,
      initialize: async () => {
        logger.info(LogCategory.SYSTEM, 'WebSocket manager initialized');
      }
    });
  }

  /**
   * Register a service
   */
  register(config: ServiceConfig): void {
    if (this.services.has(config.name)) {
      logger.warn(LogCategory.SYSTEM, `Service ${config.name} already registered`);
      return;
    }

    this.services.set(config.name, config);
    logger.debug(LogCategory.SYSTEM, `Registered service: ${config.name}`);
  }

  /**
   * Initialize all services in dependency order
   */
  async initializeAll(): Promise<void> {
    logger.info(LogCategory.SYSTEM, 'Initializing all services...');

    const initOrder = this.calculateInitOrder();

    for (const serviceName of initOrder) {
      await this.initializeService(serviceName);
    }

    logger.info(LogCategory.SYSTEM, `All ${this.initialized.size} services initialized`);
    this.emit('initialized');
  }

  /**
   * Initialize a specific service
   */
  private async initializeService(name: string): Promise<void> {
    if (this.initialized.has(name)) {
      return;
    }

    const config = this.services.get(name);
    if (!config) {
      throw new Error(`Service ${name} not found`);
    }

    // Initialize dependencies first
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        await this.initializeService(dep);
      }
    }

    // Initialize the service
    try {
      if (config.initialize) {
        await config.initialize();
      }
      this.initialized.add(name);
      this.emit('service:initialized', name);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Failed to initialize service ${name}:`, error);
      throw error;
    }
  }

  /**
   * Calculate initialization order based on dependencies
   */
  private calculateInitOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      const config = this.services.get(name);
      if (config?.dependencies) {
        for (const dep of config.dependencies) {
          visit(dep);
        }
      }

      order.push(name);
    };

    for (const name of this.services.keys()) {
      visit(name);
    }

    return order;
  }

  /**
   * Get a service by name
   */
  getService<T = any>(name: string): T {
    const config = this.services.get(name);
    if (!config) {
      throw new Error(`Service ${name} not found`);
    }
    return config.service as T;
  }

  /**
   * Check if a service is initialized
   */
  isInitialized(name: string): boolean {
    return this.initialized.has(name);
  }

  /**
   * Perform health checks on all services
   */
  async performHealthChecks(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [name, config] of this.services) {
      if (config.healthCheck) {
        try {
          const healthy = await config.healthCheck();
          results.set(name, healthy);
        } catch (error) {
          logger.error(LogCategory.SYSTEM, `Health check failed for ${name}:`, error);
          results.set(name, false);
        }
      } else {
        // No health check defined, assume healthy if initialized
        results.set(name, this.initialized.has(name));
      }
    }

    return results;
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(LogCategory.SYSTEM, `Received ${signal}, shutting down services...`);

      await this.shutdownAll();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * Shutdown all services in reverse dependency order
   */
  async shutdownAll(): Promise<void> {
    const shutdownOrder = this.calculateInitOrder().reverse();

    for (const name of shutdownOrder) {
      if (this.initialized.has(name)) {
        await this.shutdownService(name);
      }
    }

    this.emit('shutdown');
  }

  /**
   * Shutdown a specific service
   */
  private async shutdownService(name: string): Promise<void> {
    const config = this.services.get(name);
    if (!config) return;

    try {
      if (config.cleanup) {
        await config.cleanup();
      }
      this.initialized.delete(name);
      logger.info(LogCategory.SYSTEM, `Service ${name} shut down`);
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Error shutting down service ${name}:`, error);
    }
  }

  /**
   * Restart a service
   */
  async restartService(name: string): Promise<void> {
    logger.info(LogCategory.SYSTEM, `Restarting service ${name}...`);

    // Shutdown the service
    if (this.initialized.has(name)) {
      await this.shutdownService(name);
    }

    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));

    // Reinitialize
    await this.initializeService(name);
  }
}

export const serviceManager = ServiceManager.getInstance();
export { ServiceManager };