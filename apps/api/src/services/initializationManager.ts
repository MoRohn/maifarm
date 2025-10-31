/**
 * Service Initialization Manager
 * Ensures proper startup order and dependency management
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { db } from '../database/connection';

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const access = promisify(fs.access);

export interface ServiceDependency {
  name: string;
  check: () => Promise<boolean>;
  initialize?: () => Promise<void>;
  required: boolean;
}

export interface InitializationResult {
  service: string;
  success: boolean;
  error?: string;
  duration: number;
}

export class InitializationManager {
  private static instance: InitializationManager;
  private initResults: InitializationResult[] = [];
  private isInitialized = false;
  
  private constructor() {}
  
  static getInstance(): InitializationManager {
    if (!InitializationManager.instance) {
      InitializationManager.instance = new InitializationManager();
    }
    return InitializationManager.instance;
  }
  
  /**
   * Initialize all required directories
   */
  async initializeDirectories(): Promise<void> {
    const directories = [
      // Main data directories
      path.join(process.cwd(), 'data'),
      path.join(process.cwd(), 'data', 'storage'),
      path.join(process.cwd(), 'data', 'storage', 'maibarn'),
      
      // Maibarn subdirectories
      path.join(process.cwd(), 'data', 'storage', 'maibarn', 'coordination'),
      path.join(process.cwd(), 'data', 'storage', 'maibarn', 'harvests'),
      path.join(process.cwd(), 'data', 'storage', 'maibarn', 'workspaces'),
      path.join(process.cwd(), 'data', 'storage', 'maibarn', 'terminals'),
      path.join(process.cwd(), 'data', 'storage', 'maibarn', 'barn'),
      path.join(process.cwd(), 'data', 'storage', 'maibarn', 'barn', 'items'),
      
      // Legacy directories (for backward compatibility)
      path.join(process.cwd(), 'maibarn'),
      path.join(process.cwd(), 'maibarn', 'coordination'),
      path.join(process.cwd(), 'maibarn', 'harvests'),
      path.join(process.cwd(), 'maibarn', 'workspaces'),
      path.join(process.cwd(), 'maibarn', 'terminals'),
      path.join(process.cwd(), 'maibarn', 'barn'),
      path.join(process.cwd(), 'maibarn', 'barn', 'items'),
      
      // Temp directories
      '/tmp/maifarm',
      '/tmp/maifarm/terminals',
      '/tmp/maifarm/workspaces',
      '/tmp/claude_coordination'
    ];
    
    for (const dir of directories) {
      try {
        await mkdir(dir, { recursive: true });
        logger.debug(LogCategory.SYSTEM, `Ensured directory exists: ${dir}`);
      } catch (error: any) {
        if (error.code !== 'EEXIST') {
          logger.error(LogCategory.SYSTEM, `Failed to create directory ${dir}:`, error);
        }
      }
    }
    
    // Create default files if they don't exist
    await this.createDefaultFiles();
  }
  
  /**
   * Create default files required by services
   */
  private async createDefaultFiles(): Promise<void> {
    const defaultFiles = [
      {
        path: path.join(process.cwd(), 'data', 'storage', 'maibarn', 'coordination', 'agent_registrations.json'),
        content: '[]'
      },
      {
        path: path.join(process.cwd(), 'data', 'storage', 'maibarn', 'coordination', 'farm_sessions.json'),
        content: '{}'
      },
      {
        path: path.join(process.cwd(), 'maibarn', 'coordination', 'agent_registrations.json'),
        content: '[]'
      },
      {
        path: path.join(process.cwd(), 'maibarn', 'coordination', 'farm_sessions.json'),
        content: '{}'
      }
    ];
    
    for (const file of defaultFiles) {
      try {
        await access(file.path);
        // File exists
      } catch {
        // File doesn't exist, create it
        try {
          await writeFile(file.path, file.content, 'utf8');
          logger.info(LogCategory.SYSTEM, `Created default file: ${file.path}`);
        } catch (error) {
          logger.error(LogCategory.SYSTEM, `Failed to create file ${file.path}:`, error);
        }
      }
    }
  }
  
  /**
   * Check database connectivity
   */
  async checkDatabase(): Promise<boolean> {
    try {
      const result = await db.query('SELECT 1');
      return result.rows.length > 0;
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Database connection check failed:', error);
      return false;
    }
  }
  
  /**
   * Initialize database (create tables, run migrations)
   */
  async initializeDatabase(): Promise<void> {
    try {
      // Import and run migrations
      const { runMigrations } = await import('../database/runMigrations');
      await runMigrations();
      logger.info(LogCategory.DATABASE, 'Database migrations completed successfully');
    } catch (error) {
      logger.error(LogCategory.DATABASE, 'Database initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Check Redis connectivity
   */
  async checkRedis(): Promise<boolean> {
    try {
      const { redisClient } = await import('../services/unified/stateCoordinator');
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }
      await redisClient.ping();
      return true;
    } catch (error) {
      logger.warn(LogCategory.CACHE, 'Redis connection check failed (non-critical):', error);
      return false; // Redis is optional
    }
  }
  
  /**
   * Initialize core services in proper order
   */
  async initializeServices(): Promise<InitializationResult[]> {
    if (this.isInitialized) {
      logger.warn(LogCategory.SYSTEM, 'Services already initialized');
      return this.initResults;
    }
    
    logger.info(LogCategory.SYSTEM, '🚀 Starting service initialization...');
    
    const services: ServiceDependency[] = [
      {
        name: 'Directories',
        check: async () => true,
        initialize: () => this.initializeDirectories(),
        required: true
      },
      {
        name: 'Database',
        check: () => this.checkDatabase(),
        initialize: () => this.initializeDatabase(),
        required: true
      },
      {
        name: 'Redis',
        check: () => this.checkRedis(),
        initialize: async () => {
          const { redisClient } = await import('../services/unified/stateCoordinator');
          if (!redisClient.isOpen) {
            await redisClient.connect();
          }
        },
        required: false // Redis is optional
      },
      {
        name: 'PathConfig',
        check: async () => {
          // Verify pathConfig is working
          const testPath = pathConfig.getWorkspacePath('test');
          return testPath.includes('maibarn/workspaces');
        },
        required: true
      },
      {
        name: 'WebSocket',
        check: async () => {
          const { websocketManager } = await import('../websocket/websocketManager');
          return websocketManager !== null;
        },
        required: true
      },
      {
        name: 'SessionManager',
        check: async () => {
          const { sessionManager } = await import('./sessionManager');
          return sessionManager !== null;
        },
        required: true
      },
      {
        name: 'MetricsSynchronizer',
        check: async () => {
          const { metricsSynchronizer } = await import('./metricsSynchronizer');
          return metricsSynchronizer !== null;
        },
        initialize: async () => {
          // MetricsSynchronizer needs explicit initialization after database is ready
          const { metricsSynchronizer } = await import('./metricsSynchronizer');
          await metricsSynchronizer.initialize();
        },
        required: false
      },
      {
        name: 'AgentHandshake',
        check: async () => {
          const { agentHandshakeService } = await import('./agentHandshakeService');
          return agentHandshakeService !== null;
        },
        initialize: async () => {
          const { agentHandshakeService } = await import('./agentHandshakeService');
          await agentHandshakeService.initialize();
        },
        required: false
      },
      {
        name: 'HarvestSessionBroadcaster',
        check: async () => {
          const { harvestSessionBroadcaster } = await import('./harvestSessionBroadcaster');
          return harvestSessionBroadcaster !== null;
        },
        initialize: async () => {
          const { harvestSessionBroadcaster } = await import('./harvestSessionBroadcaster');
          harvestSessionBroadcaster.initialize();
        },
        required: false
      },
      {
        name: 'MemoryManager',
        check: async () => {
          const { memoryManager } = await import('../utils/memoryManager');
          return memoryManager !== null;
        },
        initialize: async () => {
          const { memoryManager } = await import('../utils/memoryManager');
          memoryManager.startMonitoring(60000);
        },
        required: false
      }
    ];
    
    // Initialize services in order
    for (const service of services) {
      const startTime = Date.now();
      let success = false;
      let error: string | undefined;
      
      try {
        // Run initialization if provided
        if (service.initialize) {
          logger.info(LogCategory.SYSTEM, `Initializing ${service.name}...`);
          await service.initialize();
        }
        
        // Check if service is ready
        success = await service.check();
        
        if (!success && service.required) {
          throw new Error(`Required service ${service.name} failed to initialize`);
        }
        
        if (success) {
          logger.info(LogCategory.SYSTEM, `✅ ${service.name} initialized successfully`);
        } else {
          logger.warn(LogCategory.SYSTEM, `⚠️  ${service.name} initialization failed (non-critical)`);
        }
      } catch (err: any) {
        success = false;
        error = err.message;
        
        if (service.required) {
          logger.error(LogCategory.SYSTEM, `❌ ${service.name} initialization failed (critical):`, err);
          throw err;
        } else {
          logger.warn(LogCategory.SYSTEM, `⚠️  ${service.name} initialization failed (non-critical):`, err);
        }
      }
      
      const duration = Date.now() - startTime;
      this.initResults.push({
        service: service.name,
        success,
        error,
        duration
      });
    }
    
    this.isInitialized = true;
    
    // Log summary
    const successful = this.initResults.filter(r => r.success).length;
    const failed = this.initResults.filter(r => !r.success).length;
    const totalTime = this.initResults.reduce((sum, r) => sum + r.duration, 0);
    
    logger.info(LogCategory.SYSTEM, 
      `🏁 Service initialization complete: ${successful} successful, ${failed} failed (${totalTime}ms total)`
    );
    
    return this.initResults;
  }
  
  /**
   * Get initialization status
   */
  getStatus(): {
    initialized: boolean;
    results: InitializationResult[];
    summary: {
      total: number;
      successful: number;
      failed: number;
      totalDuration: number;
    };
  } {
    const successful = this.initResults.filter(r => r.success).length;
    const failed = this.initResults.filter(r => !r.success).length;
    const totalDuration = this.initResults.reduce((sum, r) => sum + r.duration, 0);
    
    return {
      initialized: this.isInitialized,
      results: this.initResults,
      summary: {
        total: this.initResults.length,
        successful,
        failed,
        totalDuration
      }
    };
  }
  
  /**
   * Reset initialization state (for testing)
   */
  reset(): void {
    this.isInitialized = false;
    this.initResults = [];
  }

  /**
   * Mark as initialized without running full initialization
   * Used for simplified startup scenarios
   */
  markAsInitialized(): void {
    this.isInitialized = true;
    logger.info(LogCategory.SYSTEM, '✅ Services marked as initialized (simplified mode)');
  }
}

export const initializationManager = InitializationManager.getInstance();