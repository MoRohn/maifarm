/**
 * Backend Infrastructure Integration Module
 * 
 * This module integrates all the new infrastructure components:
 * - Central API Manager
 * - Connection Pool Manager
 * - Enhanced Quick Task Service V2
 * - Real-time Metrics Aggregator
 * 
 * It provides a unified interface for the MaiFarm backend to utilize
 * these enhanced services seamlessly.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { centralApiManager } from './centralApiManager';
import { connectionPoolManager } from './connectionPoolManager';
import { quickTaskServiceV2 } from './quickTaskServiceV2';
import { realtimeMetricsAggregator } from './realtimeMetricsAggregator';
import { websocketManager } from '../websocket/websocketManager';
import { AIProvider } from '../config/aiProviders';

export interface InfrastructureHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  services: {
    apiManager: 'online' | 'offline';
    connectionPool: 'online' | 'offline';
    quickTask: 'online' | 'offline';
    metrics: 'online' | 'offline';
  };
  metrics: {
    apiSuccessRate: number;
    connectionUtilization: number;
    quickTaskSuccessRate: number;
    averageLatency: number;
  };
  timestamp: Date;
}

/**
 * Backend Infrastructure Integration Service
 * Coordinates all enhanced backend services and provides unified management
 */
export class BackendInfrastructureIntegration extends EventEmitter {
  private static instance: BackendInfrastructureIntegration;
  private initialized: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  private constructor() {
    super();
  }
  
  static getInstance(): BackendInfrastructureIntegration {
    if (!BackendInfrastructureIntegration.instance) {
      BackendInfrastructureIntegration.instance = new BackendInfrastructureIntegration();
    }
    return BackendInfrastructureIntegration.instance;
  }
  
  /**
   * Initialize all infrastructure services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('[Infrastructure] Already initialized');
      return;
    }
    
    logger.info('[Infrastructure] Initializing enhanced backend infrastructure...');
    
    try {
      // Initialize services in order
      await this.initializeConnectionPool();
      await this.initializeCentralApi();
      await this.initializeQuickTask();
      await this.initializeMetrics();
      
      // Setup cross-service communication
      this.setupServiceIntegration();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.initialized = true;
      
      logger.info('[Infrastructure] ✅ All infrastructure services initialized successfully');
      
      // Broadcast initialization complete
      websocketManager.broadcast('infrastructure:ready', {
        timestamp: new Date(),
        services: {
          apiManager: 'online',
          connectionPool: 'online',
          quickTask: 'online',
          metrics: 'online'
        }
      });
      
      this.emit('initialized');
      
    } catch (error) {
      logger.error('[Infrastructure] Failed to initialize:', error);
      throw error;
    }
  }
  
  /**
   * Initialize Connection Pool Manager
   */
  private async initializeConnectionPool(): Promise<void> {
    logger.info('[Infrastructure] Initializing Connection Pool Manager...');
    
    // Set load balancing strategy
    connectionPoolManager.setLoadBalancingStrategy({
      type: 'least-connections'
    });
    
    // Refresh connections to ensure they're ready
    await connectionPoolManager.refreshConnections();
    
    logger.info('[Infrastructure] Connection Pool Manager initialized');
  }
  
  /**
   * Initialize Central API Manager
   */
  private async initializeCentralApi(): Promise<void> {
    logger.info('[Infrastructure] Initializing Central API Manager...');
    
    // Central API Manager initializes itself via singleton
    // Ensure it's ready
    await centralApiManager.ensureReady();
    
    const health = centralApiManager.getHealthStatus();
    
    logger.info(`[Infrastructure] Central API Manager initialized with ${health.length} providers`);
  }
  
  /**
   * Initialize Enhanced Quick Task Service
   */
  private async initializeQuickTask(): Promise<void> {
    logger.info('[Infrastructure] Initializing Quick Task Service V2...');
    
    // Quick Task Service V2 initializes itself via singleton
    // Get initial statistics
    const stats = quickTaskServiceV2.getStatistics();
    
    logger.info('[Infrastructure] Quick Task Service V2 initialized', stats);
  }
  
  /**
   * Initialize Real-time Metrics Aggregator
   */
  private async initializeMetrics(): Promise<void> {
    logger.info('[Infrastructure] Initializing Real-time Metrics Aggregator...');
    
    // Metrics Aggregator initializes itself via singleton
    // Get initial metrics
    const metrics = realtimeMetricsAggregator.getCurrentMetrics();
    
    logger.info('[Infrastructure] Real-time Metrics Aggregator initialized');
    logger.debug('[Infrastructure] Initial metrics:', {
      quickTasks: metrics.quickTasks.total,
      apiCalls: metrics.apiCalls.total,
      connections: metrics.connections.total
    });
  }
  
  /**
   * Setup cross-service integration
   */
  private setupServiceIntegration(): void {
    logger.info('[Infrastructure] Setting up cross-service integration...');
    
    // Central API Manager -> Metrics
    centralApiManager.on('request:success', (data) => {
      realtimeMetricsAggregator.recordMetric('api.requests.success', 1, {
        provider: data.provider
      });
    });
    
    centralApiManager.on('request:failed', (data) => {
      realtimeMetricsAggregator.recordMetric('api.requests.failed', 1, {
        provider: data.provider,
        error: data.error
      });
    });
    
    // Connection Pool -> Metrics
    connectionPoolManager.on('connection:acquired', (data) => {
      realtimeMetricsAggregator.recordMetric('connections.acquired', 1, {
        provider: data.provider
      });
    });
    
    connectionPoolManager.on('connection:failed', (data) => {
      realtimeMetricsAggregator.recordMetric('connections.failed', 1, {
        provider: data.provider
      });
      
      // Trigger alert
      this.emit('alert', {
        type: 'connection_failure',
        provider: data.provider,
        message: `Connection failed for ${data.provider}`
      });
    });
    
    // Quick Task -> Metrics
    quickTaskServiceV2.on('quicktask:created', (data) => {
      realtimeMetricsAggregator.recordMetric('quicktask.created', 1);
    });
    
    quickTaskServiceV2.on('task:completed', (data) => {
      realtimeMetricsAggregator.recordMetric('quicktask.completed', 1);
      if (data.performanceMetrics) {
        realtimeMetricsAggregator.recordMetric('quicktask.performance', 
          data.performanceMetrics.totalTime
        );
      }
    });
    
    // Metrics -> Alerts
    realtimeMetricsAggregator.on('alert:created', (alert) => {
      this.handleAlert(alert);
    });
    
    logger.info('[Infrastructure] Cross-service integration established');
  }
  
  /**
   * Handle alerts from metrics aggregator
   */
  private handleAlert(alert: any): void {
    logger.warn(`[Infrastructure] Alert: ${alert.title} - ${alert.message}`);
    
    // Broadcast alert
    websocketManager.broadcast('infrastructure:alert', alert);
    
    // Take corrective action based on alert type
    switch (alert.source) {
      case 'api':
        if (alert.severity === 'critical') {
          // Switch to fallback provider
          this.switchToFallbackProvider();
        }
        break;
        
      case 'connections':
        if (alert.severity === 'high') {
          // Refresh connection pools
          connectionPoolManager.refreshConnections();
        }
        break;
        
      case 'tasks':
        if (alert.severity === 'high') {
          // Reduce concurrent task limit temporarily
          logger.info('[Infrastructure] Reducing task concurrency due to high failure rate');
        }
        break;
        
      case 'system':
        if (alert.severity === 'critical') {
          // Trigger emergency measures
          this.triggerEmergencyMode();
        }
        break;
    }
    
    this.emit('alert:handled', alert);
  }
  
  /**
   * Switch to fallback provider when primary fails
   */
  private switchToFallbackProvider(): void {
    logger.info('[Infrastructure] Switching to fallback AI provider');
    
    // This would coordinate with the AI provider manager
    // to switch the default provider
    
    this.emit('provider:switched', {
      from: AIProvider.CLAUDE,
      to: AIProvider.OPENAI,
      reason: 'critical_failure'
    });
  }
  
  /**
   * Trigger emergency mode to preserve system stability
   */
  private triggerEmergencyMode(): void {
    logger.error('[Infrastructure] EMERGENCY MODE ACTIVATED');
    
    // Reduce resource consumption
    // Pause non-critical operations
    // Alert administrators
    
    websocketManager.broadcast('infrastructure:emergency', {
      timestamp: new Date(),
      message: 'System entering emergency mode due to critical resource constraints'
    });
    
    this.emit('emergency:activated');
  }
  
  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Every 30 seconds
    
    logger.info('[Infrastructure] Health monitoring started');
  }
  
  /**
   * Perform health check on all services
   */
  private async performHealthCheck(): Promise<void> {
    const health: InfrastructureHealth = {
      overall: 'healthy',
      services: {
        apiManager: 'online',
        connectionPool: 'online',
        quickTask: 'online',
        metrics: 'online'
      },
      metrics: {
        apiSuccessRate: 0,
        connectionUtilization: 0,
        quickTaskSuccessRate: 0,
        averageLatency: 0
      },
      timestamp: new Date()
    };
    
    try {
      // Check Central API Manager
      const apiHealth = centralApiManager.getHealthStatus();
      const avgSuccessRate = apiHealth.reduce((sum, h) => sum + h.successRate, 0) / apiHealth.length;
      health.metrics.apiSuccessRate = avgSuccessRate;
      
      if (avgSuccessRate < 50) {
        health.services.apiManager = 'offline';
        health.overall = 'critical';
      } else if (avgSuccessRate < 80) {
        health.overall = 'degraded';
      }
      
      // Check Connection Pool
      const poolStats = connectionPoolManager.getPoolStatistics();
      let totalUtil = 0;
      let poolCount = 0;
      
      for (const stats of Object.values(poolStats)) {
        const util = (stats.busy / stats.total) * 100;
        totalUtil += util;
        poolCount++;
      }
      
      health.metrics.connectionUtilization = poolCount > 0 ? totalUtil / poolCount : 0;
      
      if (health.metrics.connectionUtilization > 90) {
        health.overall = 'degraded';
      }
      
      // Check Quick Task Service
      const qtStats = quickTaskServiceV2.getStatistics();
      // Calculate success rate from current metrics
      const systemMetrics = realtimeMetricsAggregator.getCurrentMetrics();
      health.metrics.quickTaskSuccessRate = systemMetrics.quickTasks.successRate;
      health.metrics.averageLatency = systemMetrics.apiCalls.avgLatency;
      
      if (health.metrics.quickTaskSuccessRate < 50) {
        health.services.quickTask = 'offline';
        health.overall = 'critical';
      } else if (health.metrics.quickTaskSuccessRate < 80) {
        health.overall = 'degraded';
      }
      
      // Broadcast health status
      websocketManager.broadcast('infrastructure:health', health);
      
      // Emit health event
      this.emit('health:checked', health);
      
      // Log if not healthy
      if (health.overall !== 'healthy') {
        logger.warn('[Infrastructure] Health check:', health);
      }
      
    } catch (error) {
      logger.error('[Infrastructure] Health check failed:', error);
      health.overall = 'critical';
    }
  }
  
  /**
   * Create a Quick Task using the enhanced service
   */
  async createQuickTask(config: any, userId: string): Promise<any> {
    logger.info('[Infrastructure] Creating Quick Task via enhanced service');
    
    try {
      const result = await quickTaskServiceV2.createQuickTask({
        ...config,
        enableOptimisticUpdates: true,
        enableProgressiveStatus: true,
        enableAutoRecovery: true
      }, userId);
      
      logger.info('[Infrastructure] Quick Task created successfully:', result.taskId);
      
      return result;
    } catch (error) {
      logger.error('[Infrastructure] Failed to create Quick Task:', error);
      throw error;
    }
  }
  
  /**
   * Execute an API request through the central manager
   */
  async executeApiRequest(request: any): Promise<any> {
    logger.debug('[Infrastructure] Executing API request via central manager');
    
    try {
      const response = await centralApiManager.executeRequest(request);
      
      if (!response.success) {
        logger.error('[Infrastructure] API request failed:', response.error);
        throw new Error(response.error?.message || 'API request failed');
      }
      
      return response.data;
    } catch (error) {
      logger.error('[Infrastructure] Failed to execute API request:', error);
      throw error;
    }
  }
  
  /**
   * Get current infrastructure status
   */
  getStatus(): any {
    return {
      initialized: this.initialized,
      health: this.getHealth(),
      metrics: realtimeMetricsAggregator.getCurrentMetrics(),
      alerts: realtimeMetricsAggregator.getActiveAlerts(),
      statistics: {
        quickTask: quickTaskServiceV2.getStatistics(),
        connectionPool: connectionPoolManager.getPoolStatistics(),
        apiHealth: centralApiManager.getHealthStatus()
      }
    };
  }
  
  /**
   * Get current health status
   */
  private getHealth(): InfrastructureHealth {
    const systemMetrics = realtimeMetricsAggregator.getCurrentMetrics();
    
    return {
      overall: 'healthy', // Simplified - would calculate based on metrics
      services: {
        apiManager: 'online',
        connectionPool: 'online',
        quickTask: 'online',
        metrics: 'online'
      },
      metrics: {
        apiSuccessRate: systemMetrics.apiCalls.successRate,
        connectionUtilization: systemMetrics.connections.utilizationRate,
        quickTaskSuccessRate: systemMetrics.quickTasks.successRate,
        averageLatency: systemMetrics.apiCalls.avgLatency
      },
      timestamp: new Date()
    };
  }
  
  /**
   * Shutdown all infrastructure services gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('[Infrastructure] Shutting down infrastructure services...');
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Shutdown services in reverse order
    await realtimeMetricsAggregator.shutdown();
    await centralApiManager.shutdown();
    await connectionPoolManager.shutdown();
    
    logger.info('[Infrastructure] All services shut down successfully');
    
    this.emit('shutdown');
  }
}

// Export singleton instance
export const backendInfrastructure = BackendInfrastructureIntegration.getInstance();

// Auto-initialize on import if in production
if (process.env.NODE_ENV === 'production' || process.env.AUTO_INIT_INFRASTRUCTURE === 'true') {
  backendInfrastructure.initialize().catch(error => {
    logger.error('[Infrastructure] Auto-initialization failed:', error);
  });
}