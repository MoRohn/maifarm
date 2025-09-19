import { EventEmitter } from 'events';
import { websocketManager } from '../websocket/websocketManager';
import { db } from '../database/connection';
import { apiConnectionManager } from './apiConnectionManager';
import logger from '../utils/logger';
import { Redis } from 'ioredis';

interface GoWildMetrics {
  sessionId: string;
  farmId: string;
  status: string;
  startTime: Date;
  duration: number;
  nodesExplored: number;
  discoveriesMade: number;
  highValueDiscoveries: number;
  explorationDepth: number;
  creativityLevel: number;
  agentCount: number;
  averageResponseTime: number;
  totalCost: number;
  valueGenerated: number;
  discoveryRate: number; // discoveries per minute
  explorationVelocity: number; // nodes per minute
}

interface AgentMetrics {
  agentId: string;
  farmId: string;
  status: string;
  tasksCompleted: number;
  successRate: number;
  averageTaskDuration: number;
  currentTask: string | null;
  lastActivity: Date;
  tokensUsed: number;
  cost: number;
}

interface SystemMetrics {
  timestamp: Date;
  activeFarms: number;
  activeAgents: number;
  goWildSessions: number;
  totalDiscoveries: number;
  apiHealth: Record<string, any>;
  websocketConnections: number;
  queuedTasks: number;
  averageLatency: number;
  errorRate: number;
  throughput: number; // requests per second
}

interface MetricSnapshot {
  goWild: GoWildMetrics[];
  agents: AgentMetrics[];
  system: SystemMetrics;
  timestamp: Date;
}

interface MetricStream {
  id: string;
  type: 'goWild' | 'agent' | 'system' | 'all';
  filter?: any;
  interval: number;
  active: boolean;
  lastEmit: Date;
}

export class RealtimeMetricsService extends EventEmitter {
  private static instance: RealtimeMetricsService;
  private redis: Redis | null = null;
  private metricsCache: Map<string, any> = new Map();
  private streams: Map<string, MetricStream> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private streamInterval: NodeJS.Timeout | null = null;
  
  private goWildMetrics: Map<string, GoWildMetrics> = new Map();
  private agentMetrics: Map<string, AgentMetrics> = new Map();
  private systemMetrics: SystemMetrics | null = null;
  
  private readonly UPDATE_INTERVAL = 1000; // 1 second
  private readonly STREAM_INTERVAL = 100; // 100ms for real-time streaming
  private readonly CACHE_TTL = 300000; // 5 minutes
  
  private constructor() {
    super();
    this.initialize();
  }
  
  static getInstance(): RealtimeMetricsService {
    if (!RealtimeMetricsService.instance) {
      RealtimeMetricsService.instance = new RealtimeMetricsService();
    }
    return RealtimeMetricsService.instance;
  }
  
  /**
   * Initialize the metrics service
   */
  private initialize() {
    this.startMetricsCollection();
    this.startStreamProcessing();
    this.setupEventListeners();
    
    logger.info('[RealtimeMetricsService] Initialized');
  }
  
  /**
   * Start collecting metrics from various sources
   */
  private startMetricsCollection() {
    this.updateInterval = setInterval(async () => {
      try {
        await Promise.all([
          this.collectGoWildMetrics(),
          this.collectAgentMetrics(),
          this.collectSystemMetrics()
        ]);
        
        // Emit aggregated metrics
        this.emitAggregatedMetrics();
      } catch (error) {
        logger.error('[RealtimeMetricsService] Error collecting metrics:', error);
      }
    }, this.UPDATE_INTERVAL);
  }
  
  /**
   * Collect Go Wild session metrics
   */
  private async collectGoWildMetrics() {
    try {
      // Query active Go Wild sessions from database
      // Note: Some columns may not exist if migrations haven't been run
      const result = await db.query(`
        SELECT
          s.id as session_id,
          s.farm_id,
          s.status,
          s.started_at,
          '{}' as config,  -- Default empty config if column doesn't exist
          '{}' as metrics,  -- Default empty metrics if column doesn't exist
          0 as discovery_count,
          0 as high_value_count,
          0 as avg_response_time,
          0 as total_cost
        FROM gowild_sessions s
        WHERE s.status IN ('exploring', 'paused')
      `).catch((error: any) => {
        // If table doesn't exist or other error, return empty result
        if (error.code === '42P01' || error.code === '42703') {
          return { rows: [] };
        }
        throw error;
      });
      
      for (const row of result.rows) {
        const duration = Date.now() - new Date(row.started_at).getTime();
        const minutes = duration / 60000;
        
        const metrics: GoWildMetrics = {
          sessionId: row.session_id,
          farmId: row.farm_id,
          status: row.status,
          startTime: new Date(row.started_at),
          duration,
          nodesExplored: row.metrics?.nodesExplored || 0,
          discoveriesMade: row.discovery_count || 0,
          highValueDiscoveries: row.high_value_count || 0,
          explorationDepth: row.config?.explorationDepth || 3,
          creativityLevel: row.config?.creativityLevel || 50,
          agentCount: row.config?.agentCount || 1,
          averageResponseTime: row.avg_response_time || 0,
          totalCost: row.total_cost || 0,
          valueGenerated: this.calculateValueGenerated(row),
          discoveryRate: minutes > 0 ? (row.discovery_count || 0) / minutes : 0,
          explorationVelocity: minutes > 0 ? (row.metrics?.nodesExplored || 0) / minutes : 0
        };
        
        this.goWildMetrics.set(metrics.sessionId, metrics);
        
        // Stream real-time updates for active sessions
        if (row.status === 'exploring') {
          this.streamGoWildUpdate(metrics);
        }
      }
    } catch (error) {
      logger.error('[RealtimeMetricsService] Error collecting Go Wild metrics:', error);
    }
  }
  
  /**
   * Calculate value generated from discoveries
   */
  private calculateValueGenerated(session: any): number {
    // Value scoring algorithm
    const baseValue = session.discovery_count * 10;
    const highValueBonus = session.high_value_count * 50;
    const depthBonus = (session.stats?.nodesExplored || 0) * 2;
    const creativityBonus = (session.config?.creativityLevel || 50) / 10;
    
    return baseValue + highValueBonus + depthBonus + creativityBonus;
  }
  
  /**
   * Collect agent metrics
   */
  private async collectAgentMetrics() {
    try {
      const result = await db.query(`
        SELECT 
          a.id,
          a.farm_id,
          a.status,
          a.name,
          COUNT(t.id) as tasks_completed,
          AVG(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) * 100 as success_rate,
          AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) * 1000) as avg_duration,
          MAX(t.created_at) as last_activity,
          SUM(COALESCE((t.metadata->>'tokens_used')::int, 0)) as tokens_used,
          SUM(COALESCE((t.metadata->>'tokens_used')::int, 0) * 0.00001) as cost
        FROM agents a
        LEFT JOIN tasks t ON t.agent_id = a.id
        WHERE a.status IN ('active', 'idle', 'processing')
        GROUP BY a.id
      `).catch(() => ({ rows: [] }));
      
      for (const row of result.rows) {
        const metrics: AgentMetrics = {
          agentId: row.id,
          farmId: row.farm_id,
          status: row.status,
          tasksCompleted: row.tasks_completed || 0,
          successRate: row.success_rate || 0,
          averageTaskDuration: row.avg_duration || 0,
          currentTask: row.status === 'processing' ? 'Processing task' : null,
          lastActivity: row.last_activity ? new Date(row.last_activity) : new Date(),
          tokensUsed: row.tokens_used || 0,
          cost: row.cost || 0
        };
        
        this.agentMetrics.set(metrics.agentId, metrics);
      }
    } catch (error) {
      logger.error('[RealtimeMetricsService] Error collecting agent metrics:', error);
    }
  }
  
  /**
   * Collect system-wide metrics
   */
  private async collectSystemMetrics() {
    try {
      // Get API health from connection manager
      const apiHealth = apiConnectionManager.getHealthSummary();
      
      // Get database metrics
      const dbMetrics = await this.getDatabaseMetrics();
      
      // Get WebSocket metrics
      const wsMetrics = this.getWebSocketMetrics();
      
      this.systemMetrics = {
        timestamp: new Date(),
        activeFarms: dbMetrics.activeFarms,
        activeAgents: dbMetrics.activeAgents,
        goWildSessions: this.goWildMetrics.size,
        totalDiscoveries: dbMetrics.totalDiscoveries,
        apiHealth,
        websocketConnections: wsMetrics.connections,
        queuedTasks: dbMetrics.queuedTasks,
        averageLatency: this.calculateAverageLatency(),
        errorRate: this.calculateErrorRate(),
        throughput: this.calculateThroughput()
      };
    } catch (error) {
      logger.error('[RealtimeMetricsService] Error collecting system metrics:', error);
    }
  }
  
  /**
   * Get database metrics
   */
  private async getDatabaseMetrics() {
    const metrics = {
      activeFarms: 0,
      activeAgents: 0,
      totalDiscoveries: 0,
      queuedTasks: 0
    };
    
    try {
      const farms = await db.query(
        "SELECT COUNT(*) as count FROM farms WHERE status IN ('running', 'active')"
      ).catch(() => ({ rows: [{ count: 0 }] }));
      metrics.activeFarms = parseInt(farms.rows[0].count);
      
      const agents = await db.query(
        "SELECT COUNT(*) as count FROM agents WHERE status IN ('active', 'idle', 'processing')"
      ).catch(() => ({ rows: [{ count: 0 }] }));
      metrics.activeAgents = parseInt(agents.rows[0].count);
      
      const discoveries = await db.query(
        "SELECT COUNT(*) as count FROM gowild_discoveries WHERE created_at > NOW() - INTERVAL '24 hours'"
      ).catch(() => ({ rows: [{ count: 0 }] }));
      metrics.totalDiscoveries = parseInt(discoveries.rows[0].count);
      
      const tasks = await db.query(
        "SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'"
      ).catch(() => ({ rows: [{ count: 0 }] }));
      metrics.queuedTasks = parseInt(tasks.rows[0].count);
    } catch (error) {
      logger.error('[RealtimeMetricsService] Error getting database metrics:', error);
    }
    
    return metrics;
  }
  
  /**
   * Get WebSocket metrics
   */
  private getWebSocketMetrics() {
    const server = websocketManager.getServer();
    if (!server || !(server as any).io) {
      return { connections: 0, rooms: 0 };
    }
    
    // Socket.io API for getting connection count
    const io = (server as any).io;
    const sockets = io.sockets.sockets;
    const connections = sockets.size || 0;
    
    // Get room count (excluding default rooms)
    const rooms = io.sockets.adapter.rooms.size || 0;
    
    return {
      connections,
      rooms
    };
  }
  
  /**
   * Calculate average latency across all systems
   */
  private calculateAverageLatency(): number {
    const latencies: number[] = [];
    
    // API latencies
    const apiHealth = apiConnectionManager.getHealthSummary();
    for (const provider in apiHealth) {
      if (apiHealth[provider].averageLatency) {
        latencies.push(apiHealth[provider].averageLatency);
      }
    }
    
    // Agent response times
    for (const agent of this.agentMetrics.values()) {
      if (agent.averageTaskDuration) {
        latencies.push(agent.averageTaskDuration);
      }
    }
    
    if (latencies.length === 0) return 0;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }
  
  /**
   * Calculate system error rate
   */
  private calculateErrorRate(): number {
    let totalRequests = 0;
    let failedRequests = 0;
    
    const apiHealth = apiConnectionManager.getHealthSummary();
    for (const provider in apiHealth) {
      const successRate = apiHealth[provider].successRate || 100;
      totalRequests += 100;
      failedRequests += (100 - successRate);
    }
    
    return totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
  }
  
  /**
   * Calculate system throughput
   */
  private calculateThroughput(): number {
    // Calculate requests per second based on recent activity
    let totalOperations = 0;
    
    // Count Go Wild exploration operations
    for (const metrics of this.goWildMetrics.values()) {
      if (metrics.status === 'exploring') {
        totalOperations += metrics.explorationVelocity / 60; // Convert to per second
      }
    }
    
    // Count agent operations
    for (const metrics of this.agentMetrics.values()) {
      if (metrics.status === 'processing') {
        totalOperations += 1; // Active agent = ~1 op/sec
      }
    }
    
    return totalOperations;
  }
  
  /**
   * Stream Go Wild updates in real-time
   */
  private streamGoWildUpdate(metrics: GoWildMetrics) {
    // Calculate real-time insights
    const insights = {
      explorationProgress: (metrics.nodesExplored / (metrics.explorationDepth * 10)) * 100,
      discoveryQuality: metrics.highValueDiscoveries > 0 
        ? (metrics.highValueDiscoveries / metrics.discoveriesMade) * 100 
        : 0,
      costEfficiency: metrics.valueGenerated / (metrics.totalCost || 1),
      performanceScore: this.calculatePerformanceScore(metrics)
    };
    
    // Broadcast real-time update
    websocketManager.broadcastToFarm(metrics.farmId, 'metrics:goWild:realtime', {
      sessionId: metrics.sessionId,
      metrics,
      insights,
      timestamp: new Date()
    });
  }
  
  /**
   * Calculate performance score for Go Wild session
   */
  private calculatePerformanceScore(metrics: GoWildMetrics): number {
    const weights = {
      discoveries: 0.3,
      velocity: 0.2,
      value: 0.3,
      efficiency: 0.2
    };
    
    const scores = {
      discoveries: Math.min(metrics.discoveryRate * 10, 100),
      velocity: Math.min(metrics.explorationVelocity * 2, 100),
      value: Math.min(metrics.valueGenerated / 10, 100),
      efficiency: metrics.totalCost > 0 ? Math.min((metrics.valueGenerated / metrics.totalCost) * 10, 100) : 100
    };
    
    return Object.keys(weights).reduce((total, key) => {
      return total + (scores[key] * weights[key]);
    }, 0);
  }
  
  /**
   * Emit aggregated metrics
   */
  private emitAggregatedMetrics() {
    const snapshot: MetricSnapshot = {
      goWild: Array.from(this.goWildMetrics.values()),
      agents: Array.from(this.agentMetrics.values()),
      system: this.systemMetrics!,
      timestamp: new Date()
    };
    
    // Emit local event
    this.emit('metrics:snapshot', snapshot);
    
    // Broadcast via WebSocket
    websocketManager.broadcast('metrics:snapshot', snapshot);
    
    // Store in cache
    this.cacheMetrics(snapshot);
  }
  
  /**
   * Cache metrics for historical analysis
   */
  private cacheMetrics(snapshot: MetricSnapshot) {
    const key = `metrics:${Date.now()}`;
    this.metricsCache.set(key, snapshot);
    
    // Store in Redis if available
    if (this.redis) {
      this.redis.setEx(
        key,
        this.CACHE_TTL / 1000,
        JSON.stringify(snapshot)
      ).catch(err => logger.error('[RealtimeMetricsService] Failed to cache metrics:', err));
    }
    
    // Clean old cache entries
    const cutoff = Date.now() - this.CACHE_TTL;
    for (const [key, value] of this.metricsCache.entries()) {
      if (value.timestamp.getTime() < cutoff) {
        this.metricsCache.delete(key);
      }
    }
  }
  
  /**
   * Start stream processing for subscribed clients
   */
  private startStreamProcessing() {
    this.streamInterval = setInterval(() => {
      for (const [id, stream] of this.streams) {
        if (!stream.active) continue;
        
        const now = Date.now();
        if (now - stream.lastEmit.getTime() < stream.interval) continue;
        
        this.processStream(stream);
        stream.lastEmit = new Date();
      }
    }, this.STREAM_INTERVAL);
  }
  
  /**
   * Process individual metric stream
   */
  private processStream(stream: MetricStream) {
    let data: any = null;
    
    switch (stream.type) {
      case 'goWild':
        data = this.filterMetrics(Array.from(this.goWildMetrics.values()), stream.filter);
        break;
      case 'agent':
        data = this.filterMetrics(Array.from(this.agentMetrics.values()), stream.filter);
        break;
      case 'system':
        data = this.systemMetrics;
        break;
      case 'all':
        data = {
          goWild: Array.from(this.goWildMetrics.values()),
          agents: Array.from(this.agentMetrics.values()),
          system: this.systemMetrics
        };
        break;
    }
    
    if (data) {
      this.emit(`stream:${stream.id}`, data);
      websocketManager.broadcast(`metrics:stream:${stream.id}`, data);
    }
  }
  
  /**
   * Filter metrics based on criteria
   */
  private filterMetrics(metrics: any[], filter?: any): any[] {
    if (!filter) return metrics;
    
    return metrics.filter(metric => {
      for (const key in filter) {
        if (metric[key] !== filter[key]) {
          return false;
        }
      }
      return true;
    });
  }
  
  /**
   * Setup event listeners for metric updates
   */
  private setupEventListeners() {
    // Listen for Go Wild events
    this.on('goWild:started', (data) => {
      this.trackGoWildStart(data);
    });
    
    this.on('goWild:discovery', (data) => {
      this.trackDiscovery(data);
    });
    
    this.on('goWild:completed', (data) => {
      this.trackGoWildCompletion(data);
    });
    
    // Listen for agent events
    this.on('agent:taskCompleted', (data) => {
      this.trackAgentTask(data);
    });
    
    // Listen for API events
    apiConnectionManager.on('metrics:update', (data) => {
      this.updateApiMetrics(data);
    });
  }
  
  /**
   * Track Go Wild session start
   */
  private trackGoWildStart(data: any) {
    const metrics: GoWildMetrics = {
      sessionId: data.sessionId,
      farmId: data.farmId,
      status: 'exploring',
      startTime: new Date(),
      duration: 0,
      nodesExplored: 0,
      discoveriesMade: 0,
      highValueDiscoveries: 0,
      explorationDepth: data.config.explorationDepth || 3,
      creativityLevel: data.config.creativityLevel || 50,
      agentCount: data.config.agentCount || 1,
      averageResponseTime: 0,
      totalCost: 0,
      valueGenerated: 0,
      discoveryRate: 0,
      explorationVelocity: 0
    };
    
    this.goWildMetrics.set(metrics.sessionId, metrics);
    this.streamGoWildUpdate(metrics);
  }
  
  /**
   * Track discovery made
   */
  private trackDiscovery(data: any) {
    const metrics = this.goWildMetrics.get(data.sessionId);
    if (!metrics) return;
    
    metrics.discoveriesMade++;
    if (data.discovery.impact === 'high') {
      metrics.highValueDiscoveries++;
    }
    
    // Recalculate rates
    const duration = Date.now() - metrics.startTime.getTime();
    const minutes = duration / 60000;
    metrics.discoveryRate = minutes > 0 ? metrics.discoveriesMade / minutes : 0;
    
    this.streamGoWildUpdate(metrics);
  }
  
  /**
   * Track Go Wild session completion
   */
  private trackGoWildCompletion(data: any) {
    const metrics = this.goWildMetrics.get(data.sessionId);
    if (!metrics) return;
    
    metrics.status = 'completed';
    metrics.duration = Date.now() - metrics.startTime.getTime();
    
    // Final metrics broadcast
    this.streamGoWildUpdate(metrics);
    
    // Archive to database
    this.archiveGoWildMetrics(metrics);
    
    // Remove from active tracking
    this.goWildMetrics.delete(data.sessionId);
  }
  
  /**
   * Track agent task completion
   */
  private trackAgentTask(data: any) {
    const metrics = this.agentMetrics.get(data.agentId);
    if (!metrics) return;
    
    metrics.tasksCompleted++;
    metrics.lastActivity = new Date();
    if (data.tokens) {
      metrics.tokensUsed += data.tokens;
      metrics.cost += data.tokens * 0.00001; // Approximate cost calculation
    }
  }
  
  /**
   * Update API metrics
   */
  private updateApiMetrics(data: any) {
    if (this.systemMetrics) {
      this.systemMetrics.apiHealth = data.health;
    }
  }
  
  /**
   * Archive Go Wild metrics to database
   */
  private async archiveGoWildMetrics(metrics: GoWildMetrics) {
    try {
      await db.query(`
        INSERT INTO go_wild_metrics (
          session_id, farm_id, duration, nodes_explored,
          discoveries_made, high_value_discoveries, total_cost,
          value_generated, discovery_rate, exploration_velocity,
          performance_score, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        metrics.sessionId,
        metrics.farmId,
        metrics.duration,
        metrics.nodesExplored,
        metrics.discoveriesMade,
        metrics.highValueDiscoveries,
        metrics.totalCost,
        metrics.valueGenerated,
        metrics.discoveryRate,
        metrics.explorationVelocity,
        this.calculatePerformanceScore(metrics)
      ]);
    } catch (error) {
      logger.error('[RealtimeMetricsService] Failed to archive Go Wild metrics:', error);
    }
  }
  
  /**
   * Create a new metric stream subscription
   */
  createStream(type: 'goWild' | 'agent' | 'system' | 'all', filter?: any, interval: number = 1000): string {
    const id = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const stream: MetricStream = {
      id,
      type,
      filter,
      interval,
      active: true,
      lastEmit: new Date()
    };
    
    this.streams.set(id, stream);
    
    logger.info(`[RealtimeMetricsService] Created stream ${id} for ${type} metrics`);
    
    return id;
  }
  
  /**
   * Stop a metric stream
   */
  stopStream(id: string) {
    const stream = this.streams.get(id);
    if (stream) {
      stream.active = false;
      this.streams.delete(id);
      logger.info(`[RealtimeMetricsService] Stopped stream ${id}`);
    }
  }
  
  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricSnapshot {
    return {
      goWild: Array.from(this.goWildMetrics.values()),
      agents: Array.from(this.agentMetrics.values()),
      system: this.systemMetrics!,
      timestamp: new Date()
    };
  }
  
  /**
   * Get Go Wild session metrics
   */
  getGoWildMetrics(sessionId: string): GoWildMetrics | undefined {
    return this.goWildMetrics.get(sessionId);
  }
  
  /**
   * Get historical metrics from cache
   */
  async getHistoricalMetrics(startTime: Date, endTime: Date): Promise<MetricSnapshot[]> {
    const snapshots: MetricSnapshot[] = [];
    
    // Get from cache
    for (const [key, value] of this.metricsCache.entries()) {
      if (value.timestamp >= startTime && value.timestamp <= endTime) {
        snapshots.push(value);
      }
    }
    
    // Get from Redis if available
    if (this.redis) {
      try {
        const keys = await this.redis.zrangebyscore(
          'metrics:timeline',
          startTime.getTime(),
          endTime.getTime()
        );
        
        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            snapshots.push(JSON.parse(data));
          }
        }
      } catch (error) {
        logger.error('[RealtimeMetricsService] Failed to get historical metrics:', error);
      }
    }
    
    return snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  
  /**
   * Set Redis connection
   */
  setRedis(redis: Redis) {
    this.redis = redis;
  }
  
  /**
   * Stop the metrics service
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }
    
    // Stop all active streams
    for (const stream of this.streams.values()) {
      stream.active = false;
    }
    this.streams.clear();
    
    this.removeAllListeners();
    
    logger.info('[RealtimeMetricsService] Stopped');
  }
}

// Export singleton instance
export const realtimeMetricsService = RealtimeMetricsService.getInstance();