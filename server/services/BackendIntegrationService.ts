/**
 * Backend Integration Service
 * 
 * Bridges the new centralized architecture with existing MaiFarm services
 * Provides compatibility layer during transition to new backend
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { unifiedConnectionHub } from './UnifiedConnectionHub';
import { optimizedTerminalEngine } from './OptimizedTerminalEngine';
import { harvestOrchestrator as existingHarvestOrchestrator } from './HarvestOrchestrator';
import { websocketManager } from '../websocket/websocketManager';
import { farmService as farmManager } from './unified/farmService';
import { shutdownCoordinator } from './shutdownCoordinator';
import { barnService as barnCollectionService } from './unified/barnService';
import { proactiveCollectionEngine } from './ProactiveCollectionEngine';
import { terminalStreamService } from './terminalStreamService';
import { redis } from '../database/connection';

interface IntegrationConfig {
  enableNewArchitecture: boolean;
  enableLegacyCompatibility: boolean;
  transitionMode: 'immediate' | 'gradual' | 'testing';
  featureFlags: {
    useUnifiedConnections: boolean;
    useOptimizedTerminal: boolean;
    useStreamlinedHarvest: boolean;
    useRedisEvents: boolean;
  };
}

export class BackendIntegrationService extends EventEmitter {
  private static instance: BackendIntegrationService;
  private config: IntegrationConfig;
  private migrationStatus: Map<string, boolean> = new Map();
  private redisPublisher: typeof redis;
  private redisSubscriber: typeof redis;
  
  private constructor() {
    super();
    
    // Default configuration - gradual transition
    this.config = {
      enableNewArchitecture: true,
      enableLegacyCompatibility: true,
      transitionMode: 'gradual',
      featureFlags: {
        useUnifiedConnections: true,
        useOptimizedTerminal: true,
        useStreamlinedHarvest: false, // Keep existing for now
        useRedisEvents: true
      }
    };
    
    this.initialize();
  }
  
  static getInstance(): BackendIntegrationService {
    if (!BackendIntegrationService.instance) {
      BackendIntegrationService.instance = new BackendIntegrationService();
    }
    return BackendIntegrationService.instance;
  }
  
  private async initialize(): Promise<void> {
    try {
      logger.info('[BackendIntegration] Initializing integration service...');
      
      // Setup Redis pub/sub
      await this.setupRedisIntegration();
      
      // Initialize new architecture components
      if (this.config.enableNewArchitecture) {
        await this.initializeNewArchitecture();
      }
      
      // Setup compatibility bridges
      if (this.config.enableLegacyCompatibility) {
        this.setupCompatibilityBridges();
      }
      
      // Setup event routing
      this.setupEventRouting();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      logger.info('[BackendIntegration] Integration service initialized successfully');
    } catch (error) {
      logger.error('[BackendIntegration] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Setup Redis integration for event distribution
   */
  private async setupRedisIntegration(): Promise<void> {
    if (!this.config.featureFlags.useRedisEvents) return;
    
    this.redisPublisher = redis.duplicate();
    this.redisSubscriber = redis.duplicate();
    
    // Subscribe to legacy channels for compatibility
    await this.redisSubscriber.subscribe(
      'farm:events',
      'agent:events',
      'harvest:events',
      'terminal:events'
    );
    
    // Route Redis events to appropriate handlers
    this.redisSubscriber.on('message', async (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);
        await this.routeRedisEvent(channel, data);
      } catch (error) {
        logger.error(`[BackendIntegration] Error processing Redis message on ${channel}:`, error);
      }
    });
    
    logger.info('[BackendIntegration] Redis integration established');
  }
  
  /**
   * Initialize new architecture components
   */
  private async initializeNewArchitecture(): Promise<void> {
    // Initialize UnifiedConnectionHub with existing WebSocket server
    if (this.config.featureFlags.useUnifiedConnections) {
      const wsServer = websocketManager.getServer();
      if (wsServer?.io) {
        unifiedConnectionHub.initializeWebSocket(wsServer.io);
        this.migrationStatus.set('unifiedConnections', true);
        logger.info('[BackendIntegration] UnifiedConnectionHub integrated');
      }
    }
    
    // Terminal streaming migration
    if (this.config.featureFlags.useOptimizedTerminal) {
      // Redirect terminal streaming to optimized engine
      this.migrateTerminalStreaming();
      this.migrationStatus.set('optimizedTerminal', true);
      logger.info('[BackendIntegration] OptimizedTerminalEngine activated');
    }
    
    // Harvest collection migration (when ready)
    if (this.config.featureFlags.useStreamlinedHarvest) {
      this.migrateHarvestCollection();
      this.migrationStatus.set('streamlinedHarvest', true);
      logger.info('[BackendIntegration] Streamlined harvest activated');
    }
  }
  
  /**
   * Setup compatibility bridges between old and new systems
   */
  private setupCompatibilityBridges(): void {
    // Bridge WebSocket events between old and new systems
    this.bridgeWebSocketEvents();
    
    // Bridge terminal events
    this.bridgeTerminalEvents();
    
    // Bridge harvest events
    this.bridgeHarvestEvents();
    
    // Bridge shutdown coordination
    this.bridgeShutdownEvents();
    
    logger.info('[BackendIntegration] Compatibility bridges established');
  }
  
  /**
   * Bridge WebSocket events between systems
   */
  private bridgeWebSocketEvents(): void {
    // Forward events from new UnifiedConnectionHub to legacy WebSocket manager
    unifiedConnectionHub.on('connection:established', (data) => {
      websocketManager.broadcast('connection:established', data);
    });
    
    unifiedConnectionHub.on('connection:disconnected', (data) => {
      websocketManager.broadcast('connection:disconnected', data);
    });
    
    unifiedConnectionHub.on('health:metrics', (metrics) => {
      websocketManager.broadcast('system:health', metrics);
    });
    
    // Forward farm events
    farmManager.on('farm:created', async (farm) => {
      await unifiedConnectionHub.broadcastToFarm(farm.id, 'farm:created', farm);
    });
    
    farmManager.on('farm:updated', async (farm) => {
      await unifiedConnectionHub.broadcastToFarm(farm.id, 'farm:updated', farm);
    });
  }
  
  /**
   * Bridge terminal events between old and new systems
   */
  private bridgeTerminalEvents(): void {
    if (!this.config.featureFlags.useOptimizedTerminal) return;
    
    // Forward events from OptimizedTerminalEngine to legacy terminalStreamService
    optimizedTerminalEngine.on('session:started', (data) => {
      // Notify legacy system
      terminalStreamService.emit('session:started', data);
      
      // Broadcast via WebSocket
      websocketManager.broadcast('terminal:streaming:ready', data);
    });
    
    optimizedTerminalEngine.on('activities:detected', (data) => {
      // Forward to legacy activity parsing
      websocketManager.broadcast('agent:activity', data);
    });
    
    optimizedTerminalEngine.on('session:stopped', (data) => {
      terminalStreamService.emit('session:stopped', data);
      websocketManager.broadcast('terminal:streaming:stopped', data);
    });
  }
  
  /**
   * Bridge harvest events between systems
   */
  private bridgeHarvestEvents(): void {
    // Forward events from existing harvest services to new architecture
    existingHarvestOrchestrator.on('harvest:started', async (data) => {
      // Publish to Redis for new architecture
      await this.redisPublisher.publish('harvest:events', JSON.stringify({
        type: 'started',
        ...data
      }));
      
      // Broadcast via UnifiedConnectionHub
      await unifiedConnectionHub.broadcastToFarm(data.farmId, 'harvest:started', data);
    });
    
    existingHarvestOrchestrator.on('harvest:completed', async (data) => {
      await this.redisPublisher.publish('harvest:events', JSON.stringify({
        type: 'completed',
        ...data
      }));
      
      await unifiedConnectionHub.broadcastToFarm(data.farmId, 'harvest:completed', data);
    });
    
    // Bridge barn collection events
    barnCollectionService.on('collection:triggered', async (data) => {
      await this.redisPublisher.publish('harvest:events', JSON.stringify({
        type: 'collection:triggered',
        ...data
      }));
    });
    
    // Bridge proactive collection events
    proactiveCollectionEngine.on('pattern:detected', async (data) => {
      await this.redisPublisher.publish('harvest:events', JSON.stringify({
        type: 'pattern:detected',
        ...data
      }));
    });
  }
  
  /**
   * Bridge shutdown coordination events
   */
  private bridgeShutdownEvents(): void {
    shutdownCoordinator.on('shutdown:scheduled', async (data) => {
      // Notify all systems
      await this.redisPublisher.publish('system:events', JSON.stringify({
        type: 'shutdown:scheduled',
        ...data
      }));
      
      await unifiedConnectionHub.broadcastToFarm(data.farmId, 'shutdown:scheduled', data);
    });
    
    shutdownCoordinator.on('shutdown:started', async (data) => {
      // Ensure harvest collection is triggered
      if (this.config.featureFlags.useStreamlinedHarvest) {
        // Use new harvest orchestrator
        await this.triggerFinalHarvest(data.farmId);
      } else {
        // Use existing harvest services
        existingHarvestOrchestrator.emit('farm:ending', {
          farmId: data.farmId,
          status: 'shutting_down'
        });
      }
    });
  }
  
  /**
   * Migrate terminal streaming to optimized engine
   */
  private migrateTerminalStreaming(): void {
    // Intercept terminalStreamService start requests
    const originalStart = terminalStreamService.startStreaming.bind(terminalStreamService);
    
    terminalStreamService.startStreaming = async (sessionName: string, farmId: string, agentCount: number) => {
      if (this.shouldUseOptimizedTerminal(sessionName)) {
        logger.info(`[BackendIntegration] Redirecting terminal session ${sessionName} to OptimizedTerminalEngine`);
        await optimizedTerminalEngine.startSession(sessionName, farmId, agentCount);
      } else {
        // Fall back to legacy
        await originalStart(sessionName, farmId, agentCount);
      }
    };
    
    // Intercept stop requests
    const originalStop = terminalStreamService.stopStreaming.bind(terminalStreamService);
    
    terminalStreamService.stopStreaming = async (sessionName: string) => {
      if (optimizedTerminalEngine.getActiveSessions().includes(sessionName)) {
        await optimizedTerminalEngine.stopSession(sessionName);
      } else {
        await originalStop(sessionName);
      }
    };
  }
  
  /**
   * Determine if session should use optimized terminal
   */
  private shouldUseOptimizedTerminal(sessionName: string): boolean {
    // Use optimized for new sessions based on transition mode
    switch (this.config.transitionMode) {
      case 'immediate':
        return true;
      case 'gradual':
        // Use for Quick Tasks and new farms
        return sessionName.startsWith('quick_') || 
               sessionName.includes('farm-') && Date.now() % 2 === 0; // 50% rollout
      case 'testing':
        // Only for test sessions
        return sessionName.includes('test');
      default:
        return false;
    }
  }
  
  /**
   * Migrate harvest collection to new orchestrator
   */
  private migrateHarvestCollection(): void {
    // TODO: Implement when ready to fully migrate
    logger.info('[BackendIntegration] Harvest collection migration pending');
  }
  
  /**
   * Setup event routing between services
   */
  private setupEventRouting(): void {
    // Create event routing table
    const eventRoutes = new Map<string, Function[]>();
    
    // Register event routes
    eventRoutes.set('farm:created', [
      (data: any) => this.routeToRedis('farm:events', data),
      (data: any) => this.routeToWebSocket(data.farmId, 'farm:created', data)
    ]);
    
    eventRoutes.set('agent:status', [
      (data: any) => this.routeToRedis('agent:events', data),
      (data: any) => this.routeToWebSocket(data.farmId, 'agent:status', data)
    ]);
    
    eventRoutes.set('harvest:ready', [
      (data: any) => this.routeToRedis('harvest:events', data),
      (data: any) => this.routeToWebSocket(data.farmId, 'harvest:ready', data)
    ]);
    
    // Apply routing
    for (const [event, handlers] of eventRoutes) {
      this.on(event, async (data) => {
        for (const handler of handlers) {
          try {
            await handler(data);
          } catch (error) {
            logger.error(`[BackendIntegration] Error routing event ${event}:`, error);
          }
        }
      });
    }
  }
  
  /**
   * Route event to Redis
   */
  private async routeToRedis(channel: string, data: any): Promise<void> {
    if (this.config.featureFlags.useRedisEvents && this.redisPublisher) {
      await this.redisPublisher.publish(channel, JSON.stringify(data));
    }
  }
  
  /**
   * Route event to WebSocket
   */
  private async routeToWebSocket(farmId: string, event: string, data: any): Promise<void> {
    if (this.config.featureFlags.useUnifiedConnections) {
      await unifiedConnectionHub.broadcastToFarm(farmId, event, data);
    } else {
      websocketManager.broadcastToFarm(farmId, event, data);
    }
  }
  
  /**
   * Route Redis event to appropriate handler
   */
  private async routeRedisEvent(channel: string, data: any): Promise<void> {
    switch (channel) {
      case 'farm:events':
        this.emit('farm:' + data.type, data);
        break;
      case 'agent:events':
        this.emit('agent:' + data.type, data);
        break;
      case 'harvest:events':
        this.emit('harvest:' + data.type, data);
        break;
      case 'terminal:events':
        this.emit('terminal:' + data.type, data);
        break;
    }
  }
  
  /**
   * Trigger final harvest collection
   */
  private async triggerFinalHarvest(farmId: string): Promise<void> {
    logger.info(`[BackendIntegration] Triggering final harvest for farm ${farmId}`);
    
    // Get farm details
    const farm = await farmManager.getFarm(farmId);
    if (!farm) return;
    
    // Create harvest job
    const harvestId = await existingHarvestOrchestrator.startHarvest(
      uuidv4(),
      farmId,
      pathConfig.getFarmWorkspacePath(farmId),
      {
        compress: true,
        includePatterns: ['**/*'],
        excludePatterns: ['**/node_modules/**', '**/.git/**']
      }
    );
    
    logger.info(`[BackendIntegration] Final harvest ${harvestId} started for farm ${farmId}`);
  }
  
  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    setInterval(() => {
      this.checkSystemHealth();
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Check overall system health
   */
  private async checkSystemHealth(): Promise<void> {
    const health = {
      timestamp: new Date(),
      services: {
        unifiedConnections: false,
        optimizedTerminal: false,
        harvestOrchestrator: false,
        redis: false,
        websocket: false
      },
      migrationStatus: Object.fromEntries(this.migrationStatus),
      metrics: {}
    };
    
    // Check UnifiedConnectionHub
    try {
      const stats = unifiedConnectionHub.getStatistics();
      health.services.unifiedConnections = true;
      health.metrics = { ...health.metrics, ...stats };
    } catch (error) {
      logger.error('[BackendIntegration] UnifiedConnectionHub health check failed:', error);
    }
    
    // Check OptimizedTerminalEngine
    try {
      const sessions = optimizedTerminalEngine.getActiveSessions();
      health.services.optimizedTerminal = true;
      health.metrics = { ...health.metrics, activeSessions: sessions.length };
    } catch (error) {
      logger.error('[BackendIntegration] OptimizedTerminalEngine health check failed:', error);
    }
    
    // Check Redis
    try {
      await redis.ping();
      health.services.redis = true;
    } catch (error) {
      logger.error('[BackendIntegration] Redis health check failed:', error);
    }
    
    // Check WebSocket
    health.services.websocket = websocketManager.getServer() !== null;
    
    // Check HarvestOrchestrator
    try {
      const activeHarvests = existingHarvestOrchestrator.getActiveHarvests();
      health.services.harvestOrchestrator = true;
      health.metrics = { ...health.metrics, activeHarvests: activeHarvests.length };
    } catch (error) {
      logger.error('[BackendIntegration] HarvestOrchestrator health check failed:', error);
    }
    
    // Emit health status
    this.emit('health:status', health);
    
    // Broadcast health status
    await this.routeToRedis('system:health', health);
    await unifiedConnectionHub.broadcastToFarm('*', 'system:health', health);
    
    // Log if any services are unhealthy
    const unhealthyServices = Object.entries(health.services)
      .filter(([_, healthy]) => !healthy)
      .map(([service]) => service);
    
    if (unhealthyServices.length > 0) {
      logger.warn('[BackendIntegration] Unhealthy services detected:', unhealthyServices);
    }
  }
  
  /**
   * Update configuration
   */
  public updateConfiguration(config: Partial<IntegrationConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[BackendIntegration] Configuration updated:', this.config);
    
    // Reinitialize if needed
    if (config.enableNewArchitecture !== undefined || config.featureFlags) {
      this.initialize();
    }
  }
  
  /**
   * Get migration status
   */
  public getMigrationStatus(): Record<string, boolean> {
    return Object.fromEntries(this.migrationStatus);
  }
  
  /**
   * Force migration of a specific component
   */
  public async forceMigration(component: string): Promise<void> {
    logger.info(`[BackendIntegration] Force migrating ${component}`);
    
    switch (component) {
      case 'terminal':
        this.config.featureFlags.useOptimizedTerminal = true;
        this.migrateTerminalStreaming();
        break;
      case 'connections':
        this.config.featureFlags.useUnifiedConnections = true;
        await this.initializeNewArchitecture();
        break;
      case 'harvest':
        this.config.featureFlags.useStreamlinedHarvest = true;
        this.migrateHarvestCollection();
        break;
      default:
        throw new Error(`Unknown component: ${component}`);
    }
  }
  
  /**
   * Shutdown integration service
   */
  public async shutdown(): Promise<void> {
    logger.info('[BackendIntegration] Shutting down integration service...');
    
    // Cleanup Redis connections
    if (this.redisPublisher) {
      await this.redisPublisher.quit();
    }
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
    }
    
    // Shutdown new components
    await optimizedTerminalEngine.shutdown();
    
    // Remove all listeners
    this.removeAllListeners();
    
    logger.info('[BackendIntegration] Integration service shutdown complete');
  }
}

// Export singleton instance
export const backendIntegrationService = BackendIntegrationService.getInstance();

// Auto-initialize on import
backendIntegrationService.on('ready', () => {
  logger.info('[BackendIntegration] Backend integration service ready');
});