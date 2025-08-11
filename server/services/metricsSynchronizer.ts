/**
 * Metrics Synchronizer Service
 * Server-side service to aggregate, deduplicate, and synchronize metrics
 */

import { EventEmitter } from 'events';
import { db } from '../database/connection';
import { redis } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { farmManager } from './farmManager';
import { coordinationService } from './coordinationService';
import * as os from 'os';

interface CoreMetrics {
  // Farm metrics
  totalFarms: number;
  activeFarms: number;
  stoppedFarms: number;
  failedFarms: number;
  
  // Agent metrics (deduplicated)
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  uniqueAgents: number;
  
  // Task metrics
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  successRate: number;
  
  // Resource metrics
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage: number;
  diskUsage: number;
  networkUsage: number;
  
  // Performance metrics
  avgResponseTime: number;
  throughput: number;
  errorRate: number;
  uptime: number;
  
  // Cost metrics
  totalCost: number;
  apiCost: number;
  computeCost: number;
  storageCost: number;
}

interface MetricUpdateEvent {
  type: 'full' | 'partial' | 'delta';
  metrics: Partial<CoreMetrics>;
  timestamp: Date;
  version: number;
  source: string;
}

class MetricsSynchronizer extends EventEmitter {
  private static instance: MetricsSynchronizer;
  private metrics: CoreMetrics;
  private uniqueAgentIds: Set<string> = new Set();
  private farmAgentMap: Map<string, Set<string>> = new Map();
  private metricsVersion: number = 0;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly REDIS_KEY = 'maifarm:metrics:current';
  private readonly REDIS_TTL = 60; // 60 seconds
  private readonly UPDATE_INTERVAL = 5000; // 5 seconds
  private readonly BROADCAST_BATCH_INTERVAL = 1000; // 1 second
  private pendingBroadcasts: MetricUpdateEvent[] = [];
  private broadcastTimer: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.metrics = this.getDefaultMetrics();
    this.initialize();
  }

  static getInstance(): MetricsSynchronizer {
    if (!MetricsSynchronizer.instance) {
      MetricsSynchronizer.instance = new MetricsSynchronizer();
    }
    return MetricsSynchronizer.instance;
  }

  private async initialize(): Promise<void> {
    // Load initial metrics from Redis if available
    await this.loadFromRedis();
    
    // Start periodic aggregation
    this.startPeriodicAggregation();
    
    // Subscribe to metric update events
    this.subscribeToMetricEvents();
  }

  private getDefaultMetrics(): CoreMetrics {
    return {
      totalFarms: 0,
      activeFarms: 0,
      stoppedFarms: 0,
      failedFarms: 0,
      totalAgents: 0,
      activeAgents: 0,
      idleAgents: 0,
      uniqueAgents: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      pendingTasks: 0,
      successRate: 100,
      cpuUsage: 0,
      memoryUsage: 0,
      gpuUsage: 0,
      diskUsage: 0,
      networkUsage: 0,
      avgResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      uptime: 100,
      totalCost: 0,
      apiCost: 0,
      computeCost: 0,
      storageCost: 0
    };
  }

  /**
   * Aggregate metrics from all sources with deduplication
   */
  private async aggregateMetrics(): Promise<CoreMetrics> {
    const metrics = this.getDefaultMetrics();
    
    // Reset tracking
    this.uniqueAgentIds.clear();
    this.farmAgentMap.clear();

    try {
      // 1. Get farm metrics from database
      const farmsResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status IN ('running', 'active', 'launching', 'harvesting')) as active,
          COUNT(*) FILTER (WHERE status IN ('stopped', 'completed')) as stopped,
          COUNT(*) FILTER (WHERE status IN ('failed', 'error')) as failed
        FROM farms
      `);
      
      if (farmsResult.rows[0]) {
        metrics.totalFarms = parseInt(farmsResult.rows[0].total) || 0;
        metrics.activeFarms = parseInt(farmsResult.rows[0].active) || 0;
        metrics.stoppedFarms = parseInt(farmsResult.rows[0].stopped) || 0;
        metrics.failedFarms = parseInt(farmsResult.rows[0].failed) || 0;
      }

      // 2. Get agent metrics with deduplication
      const agentsResult = await db.query(`
        SELECT DISTINCT
          a.id,
          a.farm_id,
          a.status,
          a.name
        FROM agents a
        INNER JOIN farms f ON a.farm_id = f.id
        WHERE f.status IN ('running', 'active', 'launching', 'harvesting')
      `);

      // Process agents and track unique IDs
      agentsResult.rows.forEach(agent => {
        const agentId = agent.id;
        const farmId = agent.farm_id;
        
        // Track unique agent
        if (!this.uniqueAgentIds.has(agentId)) {
          this.uniqueAgentIds.add(agentId);
          metrics.totalAgents++;
          
          // Count by status
          if (['running', 'active', 'working'].includes(agent.status)) {
            metrics.activeAgents++;
          } else if (agent.status === 'idle') {
            metrics.idleAgents++;
          }
        }
        
        // Track farm-agent relationship
        if (!this.farmAgentMap.has(farmId)) {
          this.farmAgentMap.set(farmId, new Set());
        }
        this.farmAgentMap.get(farmId)!.add(agentId);
      });
      
      metrics.uniqueAgents = this.uniqueAgentIds.size;

      // 3. Get task metrics
      const tasksResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE status IN ('pending', 'queued', 'assigned')) as pending
        FROM tasks
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);
      
      if (tasksResult.rows[0]) {
        metrics.totalTasks = parseInt(tasksResult.rows[0].total) || 0;
        metrics.completedTasks = parseInt(tasksResult.rows[0].completed) || 0;
        metrics.failedTasks = parseInt(tasksResult.rows[0].failed) || 0;
        metrics.pendingTasks = parseInt(tasksResult.rows[0].pending) || 0;
        
        // Calculate success rate
        if (metrics.totalTasks > 0) {
          metrics.successRate = (metrics.completedTasks / metrics.totalTasks) * 100;
        }
        
        // Calculate error rate
        if (metrics.totalTasks > 0) {
          metrics.errorRate = (metrics.failedTasks / metrics.totalTasks) * 100;
        }
      }

      // 4. Get system resource metrics
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      
      // Calculate CPU usage
      let totalIdle = 0;
      let totalTick = 0;
      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type as keyof typeof cpu.times];
        }
        totalIdle += cpu.times.idle;
      });
      
      metrics.cpuUsage = Math.max(0, Math.min(100, 
        100 - Math.floor(100 * totalIdle / totalTick)
      ));
      
      // Calculate memory usage
      metrics.memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

      // 5. Get performance metrics from recent data
      const perfResult = await db.query(`
        SELECT 
          AVG(response_time) as avg_response_time,
          COUNT(*) / EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) as throughput
        FROM tasks
        WHERE created_at >= NOW() - INTERVAL '5 minutes'
        AND status = 'completed'
      `);
      
      if (perfResult.rows[0]) {
        metrics.avgResponseTime = parseFloat(perfResult.rows[0].avg_response_time) || 0;
        metrics.throughput = parseFloat(perfResult.rows[0].throughput) || 0;
      }

      // 6. Get cost metrics
      const costResult = await db.query(`
        SELECT 
          SUM(total_cost) as total,
          SUM(api_cost) as api,
          SUM(compute_cost) as compute,
          SUM(storage_cost) as storage
        FROM token_usage
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);
      
      if (costResult.rows[0]) {
        metrics.totalCost = parseFloat(costResult.rows[0].total) || 0;
        metrics.apiCost = parseFloat(costResult.rows[0].api) || 0;
        metrics.computeCost = parseFloat(costResult.rows[0].compute) || 0;
        metrics.storageCost = parseFloat(costResult.rows[0].storage) || 0;
      }

      // 7. Calculate uptime (simplified - based on server start time)
      const uptimeSeconds = process.uptime();
      const targetUptime = 24 * 60 * 60; // 24 hours target
      metrics.uptime = Math.min(100, (uptimeSeconds / targetUptime) * 100);

    } catch (error) {
      console.error('[MetricsSynchronizer] Error aggregating metrics:', error);
    }

    return metrics;
  }

  /**
   * Update metrics and broadcast changes
   */
  public async updateMetrics(source: string = 'aggregation'): Promise<void> {
    const oldMetrics = { ...this.metrics };
    const newMetrics = await this.aggregateMetrics();
    
    // Update version
    this.metricsVersion++;
    
    // Store new metrics
    this.metrics = newMetrics;
    
    // Save to Redis
    await this.saveToRedis();
    
    // Determine what changed
    const changes: Partial<CoreMetrics> = {};
    let hasChanges = false;
    
    for (const key in newMetrics) {
      if (oldMetrics[key as keyof CoreMetrics] !== newMetrics[key as keyof CoreMetrics]) {
        changes[key as keyof CoreMetrics] = newMetrics[key as keyof CoreMetrics];
        hasChanges = true;
      }
    }
    
    // Broadcast if there are changes
    if (hasChanges) {
      this.queueBroadcast({
        type: 'partial',
        metrics: changes,
        timestamp: new Date(),
        version: this.metricsVersion,
        source
      });
    }
  }

  /**
   * Queue a broadcast for batching
   */
  private queueBroadcast(event: MetricUpdateEvent): void {
    this.pendingBroadcasts.push(event);
    
    // Start batch timer if not already running
    if (!this.broadcastTimer) {
      this.broadcastTimer = setTimeout(() => {
        this.processBroadcastQueue();
      }, this.BROADCAST_BATCH_INTERVAL);
    }
  }

  /**
   * Process queued broadcasts
   */
  private processBroadcastQueue(): void {
    if (this.pendingBroadcasts.length === 0) {
      this.broadcastTimer = null;
      return;
    }
    
    // Merge all pending updates
    const mergedEvent: MetricUpdateEvent = {
      type: 'full',
      metrics: { ...this.metrics },
      timestamp: new Date(),
      version: this.metricsVersion,
      source: 'batch'
    };
    
    // Clear queue
    this.pendingBroadcasts = [];
    this.broadcastTimer = null;
    
    // Broadcast to all connected clients
    websocketManager.broadcast('metrics:update', mergedEvent);
    
    // Emit local event
    this.emit('metrics:updated', mergedEvent);
    
    console.log('[MetricsSynchronizer] Broadcasted metrics update to all clients');
  }

  /**
   * Force immediate broadcast
   */
  public broadcastNow(): void {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    this.processBroadcastQueue();
  }

  /**
   * Get current metrics
   */
  public getMetrics(): CoreMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics for specific farm
   */
  public getFarmAgentCount(farmId: string): number {
    return this.farmAgentMap.get(farmId)?.size || 0;
  }

  /**
   * Get unique agent count
   */
  public getUniqueAgentCount(): number {
    return this.uniqueAgentIds.size;
  }

  /**
   * Validate incoming metrics
   */
  public validateMetrics(metrics: Partial<CoreMetrics>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const [key, value] of Object.entries(metrics)) {
      // Check if value is a number
      if (typeof value !== 'number') {
        errors.push(`${key} must be a number, got ${typeof value}`);
        continue;
      }
      
      // Check for NaN
      if (isNaN(value)) {
        errors.push(`${key} is NaN`);
        continue;
      }
      
      // Check for negative values where not allowed
      if (value < 0 && !['errorRate'].includes(key)) {
        errors.push(`${key} cannot be negative`);
      }
      
      // Check percentage bounds
      if (['successRate', 'errorRate', 'cpuUsage', 'memoryUsage', 'gpuUsage', 
           'diskUsage', 'networkUsage', 'uptime'].includes(key)) {
        if (value < 0 || value > 100) {
          errors.push(`${key} must be between 0 and 100`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Handle external metric update
   */
  public async handleMetricUpdate(source: string, metrics: Partial<CoreMetrics>): Promise<void> {
    // Validate metrics
    const validation = this.validateMetrics(metrics);
    if (!validation.valid) {
      console.error('[MetricsSynchronizer] Invalid metrics from', source, validation.errors);
      return;
    }
    
    // Merge with current metrics
    this.metrics = {
      ...this.metrics,
      ...metrics
    };
    
    // Update version
    this.metricsVersion++;
    
    // Save to Redis
    await this.saveToRedis();
    
    // Queue broadcast
    this.queueBroadcast({
      type: 'partial',
      metrics,
      timestamp: new Date(),
      version: this.metricsVersion,
      source
    });
  }

  /**
   * Redis persistence
   */
  private async saveToRedis(): Promise<void> {
    if (!redis) return;
    
    try {
      // Check if Redis is connected, if not skip silently
      if (!redis.isReady) {
        // Try to connect if not already connected
        if (!redis.isOpen) {
          return; // Skip if not connected
        }
        return;
      }
      
      const data = JSON.stringify({
        metrics: this.metrics,
        version: this.metricsVersion,
        timestamp: new Date(),
        uniqueAgents: Array.from(this.uniqueAgentIds),
        farmAgentMap: Array.from(this.farmAgentMap.entries()).map(([k, v]) => [k, Array.from(v)])
      });
      
      await redis.setEx(this.REDIS_KEY, this.REDIS_TTL, data);
    } catch (error) {
      // Only log error if it's not a connection issue
      if (!error.message.includes('connection') && !error.message.includes('closed')) {
        console.error('[MetricsSynchronizer] Failed to save to Redis:', error);
      }
    }
  }

  private async loadFromRedis(): Promise<void> {
    if (!redis) return;
    
    try {
      // Check if Redis is connected, if not skip silently
      if (!redis.isReady) {
        return;
      }
      
      const data = await redis.get(this.REDIS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.metrics = parsed.metrics;
        this.metricsVersion = parsed.version;
        this.uniqueAgentIds = new Set(parsed.uniqueAgents);
        this.farmAgentMap = new Map(parsed.farmAgentMap.map(([k, v]: [string, string[]]) => [k, new Set(v)]));
        
        console.log('[MetricsSynchronizer] Loaded metrics from Redis cache');
      }
    } catch (error) {
      // Only log error if it's not a connection issue
      if (!error.message.includes('connection') && !error.message.includes('closed')) {
        console.error('[MetricsSynchronizer] Failed to load from Redis:', error);
      }
    }
  }

  /**
   * Start periodic metric aggregation
   */
  private startPeriodicAggregation(): void {
    // Initial aggregation
    this.updateMetrics('startup');
    
    // Set up interval
    this.updateInterval = setInterval(() => {
      this.updateMetrics('periodic');
    }, this.UPDATE_INTERVAL);
    
    console.log('[MetricsSynchronizer] Started periodic aggregation');
  }

  /**
   * Stop periodic aggregation
   */
  public stopPeriodicAggregation(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  /**
   * Subscribe to various metric update events
   */
  private subscribeToMetricEvents(): void {
    // Subscribe to farm events
    farmManager.on('farm:created', () => this.updateMetrics('farm:created'));
    farmManager.on('farm:updated', () => this.updateMetrics('farm:updated'));
    farmManager.on('farm:deleted', () => this.updateMetrics('farm:deleted'));
    
    // Subscribe to task events
    coordinationService.on('task:completed', () => this.updateMetrics('task:completed'));
    coordinationService.on('task:failed', () => this.updateMetrics('task:failed'));
    
    console.log('[MetricsSynchronizer] Subscribed to metric update events');
  }

  /**
   * Get dashboard-ready metrics
   */
  public getDashboardMetrics(): any {
    return {
      activeFarms: this.metrics.activeFarms,
      totalAgents: this.metrics.uniqueAgents, // Use deduplicated count
      tasksCompleted: this.metrics.completedTasks,
      successRate: this.metrics.successRate
    };
  }

  /**
   * Cleanup on shutdown
   */
  public async cleanup(): Promise<void> {
    this.stopPeriodicAggregation();
    await this.saveToRedis();
    this.removeAllListeners();
    console.log('[MetricsSynchronizer] Cleaned up');
  }
}

// Create and export singleton instance
export const metricsSynchronizer = MetricsSynchronizer.getInstance();