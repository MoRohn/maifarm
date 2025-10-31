/**
 * Enhanced Integration Service
 * Initializes and coordinates all V2 services for optimal Go Wild experience
 */

import { apiConnectionManager } from './apiConnectionManager';
import { realtimeMetricsService } from './realtimeMetricsService';
import { agentCoordinatorV2 } from './agentCoordinatorV2';
import { goWildManagerV2 } from './goWildManagerV2';
import { reliabilityManager } from '../websocket/reliabilityManager';
import { websocketManager } from '../websocket/websocketManager';
import { Redis } from 'ioredis';
import logger from '../utils/logger';

interface IntegrationConfig {
  useRedis?: boolean;
  redisUrl?: string;
  enableMetrics?: boolean;
  enableHealthChecks?: boolean;
  priorityBroadcast?: boolean;
}

class EnhancedIntegrationService {
  private static instance: EnhancedIntegrationService;
  private redis: Redis | null = null;
  private initialized = false;
  
  private constructor() {}
  
  static getInstance(): EnhancedIntegrationService {
    if (!EnhancedIntegrationService.instance) {
      EnhancedIntegrationService.instance = new EnhancedIntegrationService();
    }
    return EnhancedIntegrationService.instance;
  }
  
  /**
   * Initialize all enhanced services
   */
  async initialize(config: IntegrationConfig = {}): Promise<void> {
    if (this.initialized) {
      logger.warn('[EnhancedIntegration] Already initialized');
      return;
    }
    
    try {
      logger.info('[EnhancedIntegration] Initializing enhanced services...');
      
      // 1. Setup Redis if configured
      if (config.useRedis && config.redisUrl) {
        this.redis = new Redis(config.redisUrl);
        
        // Connect Redis to services
        apiConnectionManager.setRedis(this.redis);
        realtimeMetricsService.setRedis(this.redis);
        agentCoordinatorV2.setRedis(this.redis);
        
        logger.info('[EnhancedIntegration] Redis connected');
      }
      
      // 2. Configure WebSocket reliability
      if (config.priorityBroadcast !== false) {
        // Priority broadcast is enabled by default in our optimized version
        reliabilityManager.setConflictDetection(false); // Disable conflict detection for performance
        logger.info('[EnhancedIntegration] WebSocket optimization enabled');
      }
      
      // 3. Setup service interconnections
      this.setupServiceConnections();
      
      // 4. Initialize health monitoring
      if (config.enableHealthChecks !== false) {
        this.startHealthMonitoring();
      }
      
      // 5. Initialize metrics collection
      if (config.enableMetrics !== false) {
        this.startMetricsCollection();
      }
      
      this.initialized = true;
      logger.info('[EnhancedIntegration] All services initialized successfully');
      
    } catch (error) {
      logger.error('[EnhancedIntegration] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Setup interconnections between services
   */
  private setupServiceConnections() {
    // API Connection Manager events
    apiConnectionManager.on('failover', (data) => {
      logger.warn(`[EnhancedIntegration] API failover: ${data.from} -> ${data.to}`);
      websocketManager.broadcast('system:failover', data);
    });
    
    apiConnectionManager.on('circuit-breaker:open', (data) => {
      logger.error(`[EnhancedIntegration] Circuit breaker opened for ${data.provider}`);
      websocketManager.broadcast('system:circuit-breaker', data);
    });
    
    // Agent Coordinator events
    agentCoordinatorV2.on('farm:metrics', (metrics) => {
      realtimeMetricsService.emit('farm:metrics', metrics);
    });
    
    agentCoordinatorV2.on('task:completed', (data) => {
      realtimeMetricsService.emit('agent:taskCompleted', data);
    });
    
    // Go Wild Manager events
    goWildManagerV2.on('discovery:high-value', (discovery) => {
      websocketManager.broadcast('goWild:high-value-discovery', discovery);
    });
    
    // Metrics Service events
    realtimeMetricsService.on('metrics:snapshot', (snapshot) => {
      // Store critical metrics
      if (this.redis) {
        this.redis.zadd(
          'metrics:timeline',
          Date.now(),
          JSON.stringify(snapshot)
        ).catch(err => logger.error('[EnhancedIntegration] Failed to store metrics:', err));
      }
    });
    
    logger.info('[EnhancedIntegration] Service connections established');
  }
  
  /**
   * Start health monitoring
   */
  private startHealthMonitoring() {
    setInterval(() => {
      const health = this.getSystemHealth();
      
      if (health.status === 'unhealthy') {
        logger.error('[EnhancedIntegration] System unhealthy:', health);
        websocketManager.broadcast('system:unhealthy', health);
      } else if (health.status === 'degraded') {
        logger.warn('[EnhancedIntegration] System degraded:', health);
      }
      
    }, 30000); // Check every 30 seconds
    
    logger.info('[EnhancedIntegration] Health monitoring started');
  }
  
  /**
   * Start metrics collection
   */
  private startMetricsCollection() {
    // Create default metric streams
    const systemStreamId = realtimeMetricsService.createStream('system', {}, 5000);
    const goWildStreamId = realtimeMetricsService.createStream('goWild', {}, 2000);
    
    logger.info('[EnhancedIntegration] Metrics collection started', {
      systemStream: systemStreamId,
      goWildStream: goWildStreamId
    });
  }
  
  /**
   * Get system health status
   */
  getSystemHealth(): any {
    const apiHealth = apiConnectionManager.getHealthSummary();
    const metrics = realtimeMetricsService.getSnapshot();
    const activeSessions = goWildManagerV2.getActiveSessions();
    
    // Calculate overall health
    let healthScore = 100;
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const issues: string[] = [];
    
    // Check API health
    for (const provider in apiHealth) {
      if (apiHealth[provider].status === 'unhealthy') {
        healthScore -= 20;
        issues.push(`API provider ${provider} is unhealthy`);
      } else if (apiHealth[provider].status === 'degraded') {
        healthScore -= 10;
        issues.push(`API provider ${provider} is degraded`);
      }
    }
    
    // Check system metrics
    if (metrics.system) {
      if (metrics.system.errorRate > 10) {
        healthScore -= 15;
        issues.push(`High error rate: ${metrics.system.errorRate.toFixed(2)}%`);
      }
      if (metrics.system.averageLatency > 5000) {
        healthScore -= 10;
        issues.push(`High latency: ${metrics.system.averageLatency.toFixed(0)}ms`);
      }
    }
    
    // Determine status
    if (healthScore < 50) {
      status = 'unhealthy';
    } else if (healthScore < 80) {
      status = 'degraded';
    }
    
    return {
      status,
      score: healthScore,
      issues,
      details: {
        apiHealth,
        activeSessions: activeSessions.length,
        systemMetrics: metrics.system
      },
      timestamp: new Date()
    };
  }
  
  /**
   * Start a Go Wild session with enhanced monitoring
   */
  async startGoWildSession(farmId: string, config: any): Promise<any> {
    logger.info(`[EnhancedIntegration] Starting Go Wild session for farm ${farmId}`);
    
    // Check system health first
    const health = this.getSystemHealth();
    if (health.status === 'unhealthy') {
      throw new Error('System is unhealthy. Please try again later.');
    }
    
    // Get best API provider
    const bestProvider = apiConnectionManager.getBestProvider();
    if (!bestProvider) {
      throw new Error('No healthy API providers available');
    }
    
    logger.info(`[EnhancedIntegration] Using API provider: ${bestProvider}`);
    
    // Start exploration with enhanced config
    const session = await goWildManagerV2.startExploration(farmId, {
      ...config,
      apiProvider: bestProvider,
      enhancedMetrics: true
    });
    
    // Setup session-specific monitoring
    const metricsStreamId = realtimeMetricsService.createStream(
      'goWild',
      { sessionId: session.id },
      1000
    );
    
    // Track session
    if (this.redis) {
      await this.redis.setEx(
        `session:${session.id}`,
        3600,
        JSON.stringify({
          farmId,
          startTime: session.startTime,
          config: session.config,
          metricsStreamId
        })
      );
    }
    
    logger.info(`[EnhancedIntegration] Go Wild session started: ${session.id}`);
    
    return {
      session,
      metricsStreamId,
      apiProvider: bestProvider,
      health: health.status
    };
  }
  
  /**
   * Get Go Wild session with enhanced metrics
   */
  async getGoWildSession(sessionId: string): Promise<any> {
    const session = goWildManagerV2.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const metrics = realtimeMetricsService.getGoWildMetrics(sessionId);
    const apiHealth = apiConnectionManager.getHealthSummary();
    
    return {
      session,
      realtimeMetrics: metrics,
      apiHealth,
      systemHealth: this.getSystemHealth().status
    };
  }
  
  /**
   * Stop Go Wild session with harvest
   */
  async stopGoWildSession(sessionId: string): Promise<any> {
    logger.info(`[EnhancedIntegration] Stopping Go Wild session ${sessionId}`);
    
    await goWildManagerV2.stopExploration(sessionId);
    
    const session = goWildManagerV2.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found after stop`);
    }
    
    // Get final metrics
    const metrics = realtimeMetricsService.getGoWildMetrics(sessionId);
    
    // Archive session data
    if (this.redis) {
      await this.redis.zadd(
        'sessions:completed',
        Date.now(),
        JSON.stringify({
          sessionId,
          farmId: session.farmId,
          duration: session.endTime ? session.endTime.getTime() - session.startTime.getTime() : 0,
          discoveries: session.metrics.discoveriesMade,
          value: session.metrics.totalValue,
          harvestId: session.harvestId
        })
      );
    }
    
    logger.info(`[EnhancedIntegration] Go Wild session stopped: ${sessionId}`, {
      discoveries: session.metrics.discoveriesMade,
      value: session.metrics.totalValue,
      harvestId: session.harvestId
    });
    
    return {
      session,
      finalMetrics: metrics,
      harvestId: session.harvestId,
      summary: {
        duration: session.endTime ? session.endTime.getTime() - session.startTime.getTime() : 0,
        discoveries: session.metrics.discoveriesMade,
        highValueDiscoveries: session.metrics.highValueDiscoveries,
        totalValue: session.metrics.totalValue,
        performanceScore: session.metrics.performanceScore
      }
    };
  }
  
  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(): Promise<any> {
    const snapshot = realtimeMetricsService.getSnapshot();
    const systemHealth = this.getSystemHealth();
    const activeSessions = goWildManagerV2.getActiveSessions();
    
    return {
      system: {
        health: systemHealth,
        metrics: snapshot.system,
        timestamp: new Date()
      },
      goWild: {
        activeSessions: activeSessions.length,
        sessions: activeSessions.map(s => ({
          id: s.id,
          farmId: s.farmId,
          status: s.status,
          progress: {
            nodesExplored: s.metrics?.nodesExplored || 0,
            discoveries: s.metrics?.discoveriesMade || 0,
            value: s.metrics?.totalValue || 0
          }
        })),
        totalMetrics: snapshot.goWild
      },
      agents: {
        total: snapshot.agents.length,
        active: snapshot.agents.filter(a => a.status === 'processing').length,
        metrics: snapshot.agents
      }
    };
  }
  
  /**
   * Shutdown all services gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('[EnhancedIntegration] Shutting down services...');
    
    // Stop all Go Wild sessions
    await goWildManagerV2.stopAll();
    
    // Stop services
    agentCoordinatorV2.stop();
    realtimeMetricsService.stop();
    apiConnectionManager.stop();
    reliabilityManager.stop();
    
    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }
    
    this.initialized = false;
    logger.info('[EnhancedIntegration] Shutdown complete');
  }
  
  /**
   * Check if services are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export const enhancedIntegration = EnhancedIntegrationService.getInstance();