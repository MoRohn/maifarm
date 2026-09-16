import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { db, redis } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';
import { logger } from '../utils/logger';
import { centralApiManager } from './centralApiManager';
import { connectionPoolManager } from './connectionPoolManager';
import { quickTaskServiceV2 } from './quickTaskServiceV2';
import { AIProvider } from '../config/aiProviders';

export interface MetricPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface MetricSeries {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  points: MetricPoint[];
  aggregations?: {
    min: number;
    max: number;
    avg: number;
    sum: number;
    count: number;
    p50?: number;
    p95?: number;
    p99?: number;
  };
}

export interface SystemMetrics {
  timestamp: Date;
  quickTasks: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    avgCompletionTime: number;
    successRate: number;
  };
  apiCalls: {
    total: number;
    byProvider: Record<AIProvider, number>;
    successRate: number;
    avgLatency: number;
    errors: number;
    retries: number;
  };
  connections: {
    total: number;
    active: number;
    available: number;
    failed: number;
    utilizationRate: number;
  };
  farms: {
    total: number;
    active: number;
    completed: number;
    failed: number;
  };
  harvests: {
    total: number;
    inProgress: number;
    completed: number;
    avgYieldSize: number;
  };
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkLatency: number;
  };
  costs: {
    total: number;
    byProvider: Record<AIProvider, number>;
    projectedMonthly: number;
  };
}

export interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  source: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  acknowledged: boolean;
}

/**
 * Real-time Metrics Aggregator
 * Features:
 * - Centralized metrics collection from all services
 * - Real-time aggregation and processing
 * - Historical data storage and retrieval
 * - Performance tracking and analysis
 * - Cost monitoring and projections
 * - Alert generation based on thresholds
 * - Dashboard data streaming
 */
export class RealtimeMetricsAggregator extends EventEmitter {
  private static instance: RealtimeMetricsAggregator;
  
  private metricsBuffer: Map<string, MetricPoint[]> = new Map();
  private aggregationInterval: NodeJS.Timeout | null = null;
  private collectionInterval: NodeJS.Timeout | null = null;
  private alertCheckInterval: NodeJS.Timeout | null = null;
  private activeAlerts: Map<string, Alert> = new Map();
  
  // Thresholds for alerts
  private readonly THRESHOLDS = {
    API_ERROR_RATE: 0.1, // 10% error rate
    CONNECTION_UTILIZATION: 0.9, // 90% utilization
    TASK_FAILURE_RATE: 0.2, // 20% failure rate
    LATENCY_HIGH: 5000, // 5 seconds
    COST_DAILY_LIMIT: 100, // $100 per day
    MEMORY_USAGE: 0.85, // 85% memory usage
    CPU_USAGE: 0.9 // 90% CPU usage
  };
  
  // Configuration
  private readonly AGGREGATION_INTERVAL = 10000; // 10 seconds
  private readonly COLLECTION_INTERVAL = 5000; // 5 seconds
  private readonly ALERT_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly RETENTION_PERIOD = 86400000; // 24 hours in ms
  private readonly MAX_POINTS_PER_METRIC = 1000;
  
  private constructor() {
    super();
    this.initializeMetrics();
    this.setupEventListeners();
    this.startMetricsCollection();
    this.startAggregation();
    this.startAlertMonitoring();
  }
  
  static getInstance(): RealtimeMetricsAggregator {
    if (!RealtimeMetricsAggregator.instance) {
      RealtimeMetricsAggregator.instance = new RealtimeMetricsAggregator();
    }
    return RealtimeMetricsAggregator.instance;
  }
  
  /**
   * Initialize metrics series
   */
  private initializeMetrics(): void {
    const metrics = [
      'quicktask.created',
      'quicktask.completed',
      'quicktask.failed',
      'quicktask.duration',
      'api.requests',
      'api.errors',
      'api.latency',
      'api.retries',
      'connection.active',
      'connection.available',
      'connection.utilization',
      'farm.active',
      'farm.completed',
      'harvest.yield_size',
      'system.cpu',
      'system.memory',
      'system.disk',
      'cost.total',
      'cost.claude',
      'cost.openai',
      'cost.llama'
    ];
    
    for (const metric of metrics) {
      this.metricsBuffer.set(metric, []);
    }
    
    logger.info('[RealtimeMetricsAggregator] Initialized metrics collection');
  }
  
  /**
   * Setup event listeners for metrics collection
   */
  private setupEventListeners(): void {
    // Listen to Central API Manager events
    centralApiManager.on('request:success', (data) => {
      this.recordMetric('api.requests', 1, { provider: data.provider });
      this.recordMetric(`api.latency.${data.provider}`, data.latency);
    });
    
    centralApiManager.on('request:failed', (data) => {
      this.recordMetric('api.errors', 1, { provider: data.provider, error: data.error });
    });
    
    centralApiManager.on('request:retry', (data) => {
      this.recordMetric('api.retries', 1, { provider: data.provider });
    });
    
    // Listen to Connection Pool Manager events
    connectionPoolManager.on('connection:acquired', (data) => {
      this.recordMetric('connection.active', 1);
    });
    
    connectionPoolManager.on('connection:released', (data) => {
      this.recordMetric('connection.active', -1);
      this.recordMetric('connection.available', 1);
    });
    
    // Listen to Quick Task Service V2 events
    quickTaskServiceV2.on('quicktask:created', (data) => {
      this.recordMetric('quicktask.created', 1);
    });
    
    quickTaskServiceV2.on('task:completed', (data) => {
      this.recordMetric('quicktask.completed', 1);
      if (data.performanceMetrics) {
        this.recordMetric('quicktask.duration', data.performanceMetrics.totalTime);
      }
    });
    
    quickTaskServiceV2.on('task:failed', (data) => {
      this.recordMetric('quicktask.failed', 1);
    });
  }
  
  /**
   * Record a metric point
   */
  recordMetric(name: string, value: number, metadata?: Record<string, any>): void {
    if (!this.metricsBuffer.has(name)) {
      this.metricsBuffer.set(name, []);
    }
    
    const buffer = this.metricsBuffer.get(name)!;
    const point: MetricPoint = {
      timestamp: new Date(),
      value,
      metadata
    };
    
    buffer.push(point);
    
    // Trim buffer if too large
    if (buffer.length > this.MAX_POINTS_PER_METRIC) {
      buffer.shift();
    }
    
    // Emit metric event
    this.emit('metric:recorded', { name, point });
  }
  
  /**
   * Start metrics collection from various sources
   */
  private startMetricsCollection(): void {
    this.collectionInterval = setInterval(async () => {
      await this.collectSystemMetrics();
      await this.collectDatabaseMetrics();
      await this.collectServiceMetrics();
    }, this.COLLECTION_INTERVAL);
    
    logger.info('[RealtimeMetricsAggregator] Started metrics collection');
  }
  
  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      // CPU usage (simplified - in production use proper system monitoring)
      const cpuUsage = process.cpuUsage();
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000 / 5; // Rough percentage
      this.recordMetric('system.cpu', Math.min(cpuPercent, 100));
      
      // Memory usage
      const memUsage = process.memoryUsage();
      const totalMem = require('os').totalmem();
      const memPercent = (memUsage.heapUsed / totalMem) * 100;
      this.recordMetric('system.memory', memPercent);
      
      // Disk usage (simplified)
      this.recordMetric('system.disk', Math.random() * 100); // Placeholder
      
    } catch (error) {
      logger.error('[RealtimeMetricsAggregator] Failed to collect system metrics:', error);
    }
  }
  
  /**
   * Collect database metrics
   */
  private async collectDatabaseMetrics(): Promise<void> {
    try {
      // Quick tasks metrics
      const tasksResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          AVG(CASE 
            WHEN status = 'completed' AND completed_at IS NOT NULL AND created_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (completed_at - created_at))
            ELSE NULL
          END) as avg_duration
        FROM tasks 
        WHERE type LIKE 'quick-task%'
        AND created_at > NOW() - INTERVAL '24 hours'
      `);
      
      if (tasksResult.rows[0]) {
        const stats = tasksResult.rows[0];
        this.recordMetric('quicktask.total', parseInt(stats.total));
        this.recordMetric('quicktask.active', parseInt(stats.active));
        this.recordMetric('quicktask.completed', parseInt(stats.completed));
        this.recordMetric('quicktask.failed', parseInt(stats.failed));
        if (stats.avg_duration) {
          this.recordMetric('quicktask.avg_duration', parseFloat(stats.avg_duration) * 1000);
        }
      }
      
      // Farms metrics
      const farmsResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status IN ('active', 'running', 'launching') THEN 1 END) as active,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM farms
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      
      if (farmsResult.rows[0]) {
        const stats = farmsResult.rows[0];
        this.recordMetric('farm.total', parseInt(stats.total));
        this.recordMetric('farm.active', parseInt(stats.active));
        this.recordMetric('farm.completed', parseInt(stats.completed));
        this.recordMetric('farm.failed', parseInt(stats.failed));
      }
      
      // Harvests metrics
      const harvestsResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          AVG(CASE 
            WHEN metadata->>'fileCount' IS NOT NULL 
            THEN (metadata->>'fileCount')::int 
            ELSE 0 
          END) as avg_yield
        FROM harvests
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      
      if (harvestsResult.rows[0]) {
        const stats = harvestsResult.rows[0];
        this.recordMetric('harvest.total', parseInt(stats.total));
        this.recordMetric('harvest.in_progress', parseInt(stats.in_progress));
        this.recordMetric('harvest.completed', parseInt(stats.completed));
        if (stats.avg_yield) {
          this.recordMetric('harvest.avg_yield', parseFloat(stats.avg_yield));
        }
      }
      
    } catch (error) {
      logger.error('[RealtimeMetricsAggregator] Failed to collect database metrics:', error);
    }
  }
  
  /**
   * Collect service-specific metrics
   */
  private async collectServiceMetrics(): Promise<void> {
    try {
      // Get connection pool statistics
      const poolStats = connectionPoolManager.getPoolStatistics();
      let totalActive = 0;
      let totalAvailable = 0;
      
      for (const [provider, stats] of Object.entries(poolStats)) {
        totalActive += stats.busy || 0;
        totalAvailable += stats.available || 0;
        this.recordMetric(`connection.${provider}.active`, stats.busy || 0);
        this.recordMetric(`connection.${provider}.available`, stats.available || 0);
      }
      
      const utilization = (totalActive / (totalActive + totalAvailable)) || 0;
      this.recordMetric('connection.utilization', utilization * 100);
      
      // Get API health status
      const apiHealth = centralApiManager.getHealthStatus();
      for (const health of apiHealth) {
        this.recordMetric(`api.health.${health.provider}`, health.successRate);
        this.recordMetric(`api.latency.${health.provider}`, health.averageResponseTime);
      }
      
      // Get Quick Task statistics
      const qtStats = quickTaskServiceV2.getStatistics();
      this.recordMetric('quicktask.transactions', qtStats.activeTransactions);
      this.recordMetric('quicktask.tracked', qtStats.trackedTasks);
      
    } catch (error) {
      logger.error('[RealtimeMetricsAggregator] Failed to collect service metrics:', error);
    }
  }
  
  /**
   * Start aggregation process
   */
  private startAggregation(): void {
    this.aggregationInterval = setInterval(() => {
      this.performAggregation();
    }, this.AGGREGATION_INTERVAL);
    
    logger.info('[RealtimeMetricsAggregator] Started metrics aggregation');
  }
  
  /**
   * Perform metrics aggregation
   */
  private performAggregation(): void {
    const aggregatedMetrics: Record<string, MetricSeries> = {};
    
    for (const [name, points] of this.metricsBuffer) {
      if (points.length === 0) continue;
      
      // Filter points within retention period
      const cutoff = Date.now() - this.RETENTION_PERIOD;
      const validPoints = points.filter(p => p.timestamp.getTime() > cutoff);
      
      // Calculate aggregations
      const values = validPoints.map(p => p.value);
      const aggregations = this.calculateAggregations(values);
      
      aggregatedMetrics[name] = {
        name,
        type: this.getMetricType(name),
        points: validPoints.slice(-100), // Keep last 100 points for visualization
        aggregations
      };
    }
    
    // Generate system metrics summary
    const systemMetrics = this.generateSystemMetrics(aggregatedMetrics);
    
    // Broadcast aggregated metrics
    websocketManager.broadcast('metrics:aggregated', {
      metrics: aggregatedMetrics,
      system: systemMetrics,
      timestamp: new Date()
    });
    
    // Store in Redis for historical analysis
    this.storeMetricsInRedis(systemMetrics);
    
    // Emit aggregation complete event
    this.emit('aggregation:complete', { metrics: aggregatedMetrics, system: systemMetrics });
  }
  
  /**
   * Calculate statistical aggregations
   */
  private calculateAggregations(values: number[]): any {
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, sum: 0, count: 0 };
    }
    
    const sorted = values.sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      sum,
      count: values.length,
      p50: sorted[Math.floor(values.length * 0.5)],
      p95: sorted[Math.floor(values.length * 0.95)],
      p99: sorted[Math.floor(values.length * 0.99)]
    };
  }
  
  /**
   * Generate system metrics summary
   */
  private generateSystemMetrics(aggregated: Record<string, MetricSeries>): SystemMetrics {
    const getLatestValue = (name: string): number => {
      const series = aggregated[name];
      if (!series || series.points.length === 0) return 0;
      return series.points[series.points.length - 1].value;
    };
    
    const getAggValue = (name: string, field: string): number => {
      const series = aggregated[name];
      if (!series || !series.aggregations) return 0;
      return series.aggregations[field] || 0;
    };
    
    return {
      timestamp: new Date(),
      quickTasks: {
        total: getLatestValue('quicktask.total'),
        active: getLatestValue('quicktask.active'),
        completed: getLatestValue('quicktask.completed'),
        failed: getLatestValue('quicktask.failed'),
        avgCompletionTime: getAggValue('quicktask.duration', 'avg'),
        successRate: this.calculateSuccessRate('quicktask.completed', 'quicktask.failed', aggregated)
      },
      apiCalls: {
        total: getAggValue('api.requests', 'sum'),
        byProvider: this.getProviderMetrics(aggregated),
        successRate: this.calculateSuccessRate('api.requests', 'api.errors', aggregated),
        avgLatency: this.calculateAverageLatency(aggregated),
        errors: getAggValue('api.errors', 'sum'),
        retries: getAggValue('api.retries', 'sum')
      },
      connections: {
        total: this.getTotalConnections(),
        active: getLatestValue('connection.active'),
        available: getLatestValue('connection.available'),
        failed: 0, // Calculated from pool stats
        utilizationRate: getLatestValue('connection.utilization')
      },
      farms: {
        total: getLatestValue('farm.total'),
        active: getLatestValue('farm.active'),
        completed: getLatestValue('farm.completed'),
        failed: getLatestValue('farm.failed')
      },
      harvests: {
        total: getLatestValue('harvest.total'),
        inProgress: getLatestValue('harvest.in_progress'),
        completed: getLatestValue('harvest.completed'),
        avgYieldSize: getLatestValue('harvest.avg_yield')
      },
      performance: {
        cpuUsage: getLatestValue('system.cpu'),
        memoryUsage: getLatestValue('system.memory'),
        diskUsage: getLatestValue('system.disk'),
        networkLatency: this.calculateNetworkLatency()
      },
      costs: {
        total: this.calculateTotalCost(aggregated),
        byProvider: this.getCostByProvider(aggregated),
        projectedMonthly: this.projectMonthlyCost(aggregated)
      }
    };
  }
  
  /**
   * Calculate success rate
   */
  private calculateSuccessRate(
    successMetric: string,
    failureMetric: string,
    aggregated: Record<string, MetricSeries>
  ): number {
    const successes = aggregated[successMetric]?.aggregations?.sum || 0;
    const failures = aggregated[failureMetric]?.aggregations?.sum || 0;
    const total = successes + failures;
    return total > 0 ? (successes / total) * 100 : 100;
  }
  
  /**
   * Calculate average latency across providers
   */
  private calculateAverageLatency(aggregated: Record<string, MetricSeries>): number {
    const providers = [AIProvider.CLAUDE, AIProvider.OPENAI, AIProvider.LLAMA];
    let totalLatency = 0;
    let count = 0;
    
    for (const provider of providers) {
      const latency = aggregated[`api.latency.${provider}`]?.aggregations?.avg;
      if (latency) {
        totalLatency += latency;
        count++;
      }
    }
    
    return count > 0 ? totalLatency / count : 0;
  }
  
  /**
   * Get provider-specific metrics
   */
  private getProviderMetrics(aggregated: Record<string, MetricSeries>): Record<AIProvider, number> {
    const result: any = {};
    const providers = [AIProvider.CLAUDE, AIProvider.OPENAI, AIProvider.LLAMA];
    
    for (const provider of providers) {
      // Count provider-specific requests from metadata
      result[provider] = 0; // Simplified - would need proper tracking
    }
    
    return result;
  }
  
  /**
   * Get total connections across all providers
   */
  private getTotalConnections(): number {
    const poolStats = connectionPoolManager.getPoolStatistics();
    return Object.values(poolStats).reduce((sum: number, stats: any) => sum + (stats.total || 0), 0);
  }
  
  /**
   * Calculate network latency
   */
  private calculateNetworkLatency(): number {
    // Simplified - would use actual network monitoring
    return Math.random() * 50 + 10; // 10-60ms
  }
  
  /**
   * Calculate total cost
   */
  private calculateTotalCost(aggregated: Record<string, MetricSeries>): number {
    return (aggregated['cost.total']?.aggregations?.sum || 0) / 100; // Convert cents to dollars
  }
  
  /**
   * Get cost breakdown by provider
   */
  private getCostByProvider(aggregated: Record<string, MetricSeries>): Record<AIProvider, number> {
    return {
      [AIProvider.CLAUDE]: (aggregated['cost.claude']?.aggregations?.sum || 0) / 100,
      [AIProvider.OPENAI]: (aggregated['cost.openai']?.aggregations?.sum || 0) / 100,
      [AIProvider.LLAMA]: (aggregated['cost.llama']?.aggregations?.sum || 0) / 100,
      [AIProvider.GPT_OSS]: 0,
      [AIProvider.GROK]: (aggregated['cost.grok']?.aggregations?.sum || 0) / 100
    };
  }
  
  /**
   * Project monthly cost based on current usage
   */
  private projectMonthlyCost(aggregated: Record<string, MetricSeries>): number {
    const dailyCost = this.calculateTotalCost(aggregated);
    return dailyCost * 30; // Simple projection
  }
  
  /**
   * Start alert monitoring
   */
  private startAlertMonitoring(): void {
    this.alertCheckInterval = setInterval(() => {
      this.checkAlertConditions();
    }, this.ALERT_CHECK_INTERVAL);
    
    logger.info('[RealtimeMetricsAggregator] Started alert monitoring');
  }
  
  /**
   * Check for alert conditions
   */
  private checkAlertConditions(): void {
    const metrics = this.getCurrentMetrics();
    
    // Check API error rate
    if (metrics.apiCalls.successRate < (1 - this.THRESHOLDS.API_ERROR_RATE) * 100) {
      this.createAlert({
        type: 'warning',
        severity: 'high',
        title: 'High API Error Rate',
        message: `API error rate is ${(100 - metrics.apiCalls.successRate).toFixed(1)}%`,
        source: 'api'
      });
    }
    
    // Check connection utilization
    if (metrics.connections.utilizationRate > this.THRESHOLDS.CONNECTION_UTILIZATION * 100) {
      this.createAlert({
        type: 'warning',
        severity: 'medium',
        title: 'High Connection Utilization',
        message: `Connection pool utilization is ${metrics.connections.utilizationRate.toFixed(1)}%`,
        source: 'connections'
      });
    }
    
    // Check task failure rate
    const taskFailureRate = metrics.quickTasks.total > 0 
      ? metrics.quickTasks.failed / metrics.quickTasks.total 
      : 0;
    
    if (taskFailureRate > this.THRESHOLDS.TASK_FAILURE_RATE) {
      this.createAlert({
        type: 'error',
        severity: 'high',
        title: 'High Task Failure Rate',
        message: `Task failure rate is ${(taskFailureRate * 100).toFixed(1)}%`,
        source: 'tasks'
      });
    }
    
    // Check latency
    if (metrics.apiCalls.avgLatency > this.THRESHOLDS.LATENCY_HIGH) {
      this.createAlert({
        type: 'warning',
        severity: 'medium',
        title: 'High API Latency',
        message: `Average API latency is ${metrics.apiCalls.avgLatency.toFixed(0)}ms`,
        source: 'api'
      });
    }
    
    // Check daily cost
    if (metrics.costs.total > this.THRESHOLDS.COST_DAILY_LIMIT) {
      this.createAlert({
        type: 'warning',
        severity: 'high',
        title: 'Daily Cost Limit Approaching',
        message: `Daily cost is $${metrics.costs.total.toFixed(2)}`,
        source: 'costs'
      });
    }
    
    // Check system resources
    if (metrics.performance.memoryUsage > this.THRESHOLDS.MEMORY_USAGE * 100) {
      this.createAlert({
        type: 'warning',
        severity: 'high',
        title: 'High Memory Usage',
        message: `Memory usage is ${metrics.performance.memoryUsage.toFixed(1)}%`,
        source: 'system'
      });
    }
    
    if (metrics.performance.cpuUsage > this.THRESHOLDS.CPU_USAGE * 100) {
      this.createAlert({
        type: 'warning',
        severity: 'critical',
        title: 'High CPU Usage',
        message: `CPU usage is ${metrics.performance.cpuUsage.toFixed(1)}%`,
        source: 'system'
      });
    }
  }
  
  /**
   * Create or update an alert
   */
  private createAlert(alertData: Omit<Alert, 'id' | 'timestamp' | 'acknowledged'>): void {
    const alertKey = `${alertData.source}:${alertData.title}`;
    
    // Check if alert already exists
    if (this.activeAlerts.has(alertKey)) {
      return; // Don't duplicate alerts
    }
    
    const alert: Alert = {
      id: uuidv4(),
      ...alertData,
      timestamp: new Date(),
      acknowledged: false
    };
    
    this.activeAlerts.set(alertKey, alert);
    
    // Emit alert event
    this.emit('alert:created', alert);
    
    // Broadcast alert
    websocketManager.broadcast('metrics:alert', alert);
    
    logger.warn(`[RealtimeMetricsAggregator] Alert created: ${alert.title}`);
  }
  
  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    for (const [key, alert] of this.activeAlerts) {
      if (alert.id === alertId) {
        alert.acknowledged = true;
        this.emit('alert:acknowledged', alert);
        
        // Remove after acknowledgment
        setTimeout(() => {
          this.activeAlerts.delete(key);
        }, 60000); // Keep for 1 minute after acknowledgment
        
        break;
      }
    }
  }
  
  /**
   * Get metric type
   */
  private getMetricType(name: string): 'counter' | 'gauge' | 'histogram' | 'summary' {
    if (name.includes('total') || name.includes('count')) return 'counter';
    if (name.includes('duration') || name.includes('latency')) return 'histogram';
    if (name.includes('avg') || name.includes('rate')) return 'summary';
    return 'gauge';
  }
  
  /**
   * Store metrics in Redis
   */
  private async storeMetricsInRedis(metrics: SystemMetrics): Promise<void> {
    if (!redis || !redis.isReady) return;
    
    try {
      const key = `metrics:system:${Date.now()}`;
      await redis.setEx(key, 86400, JSON.stringify(metrics)); // Keep for 24 hours
      
      // Also update current metrics
      await redis.set('metrics:current', JSON.stringify(metrics));
    } catch (error) {
      logger.error('[RealtimeMetricsAggregator] Failed to store metrics in Redis:', error);
    }
  }
  
  /**
   * Get current metrics
   */
  getCurrentMetrics(): SystemMetrics {
    const aggregated: Record<string, MetricSeries> = {};
    
    for (const [name, points] of this.metricsBuffer) {
      if (points.length > 0) {
        aggregated[name] = {
          name,
          type: this.getMetricType(name),
          points: points.slice(-100),
          aggregations: this.calculateAggregations(points.map(p => p.value))
        };
      }
    }
    
    return this.generateSystemMetrics(aggregated);
  }
  
  /**
   * Get historical metrics
   */
  async getHistoricalMetrics(hours: number = 24): Promise<SystemMetrics[]> {
    if (!redis || !redis.isReady) return [];
    
    try {
      const cutoff = Date.now() - (hours * 3600000);
      const keys = await redis.keys('metrics:system:*');
      const validKeys = keys.filter(key => {
        const timestamp = parseInt(key.split(':')[2]);
        return timestamp > cutoff;
      });
      
      if (validKeys.length === 0) return [];
      
      const values = await redis.mget(...validKeys);
      return values
        .filter(v => v !== null)
        .map(v => JSON.parse(v as string))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
    } catch (error) {
      logger.error('[RealtimeMetricsAggregator] Failed to get historical metrics:', error);
      return [];
    }
  }
  
  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  
  /**
   * Export metrics for analysis
   */
  async exportMetrics(format: 'json' | 'csv' = 'json'): Promise<string> {
    const metrics = await this.getHistoricalMetrics(24);
    
    if (format === 'json') {
      return JSON.stringify(metrics, null, 2);
    } else {
      // CSV export
      const headers = ['timestamp', 'quicktasks_total', 'quicktasks_success_rate', 
                      'api_calls', 'api_latency', 'costs_total'];
      const rows = metrics.map(m => [
        m.timestamp,
        m.quickTasks.total,
        m.quickTasks.successRate,
        m.apiCalls.total,
        m.apiCalls.avgLatency,
        m.costs.total
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
  }
  
  /**
   * Shutdown metrics aggregator
   */
  async shutdown(): Promise<void> {
    logger.info('[RealtimeMetricsAggregator] Shutting down...');
    
    if (this.aggregationInterval) clearInterval(this.aggregationInterval);
    if (this.collectionInterval) clearInterval(this.collectionInterval);
    if (this.alertCheckInterval) clearInterval(this.alertCheckInterval);
    
    // Final metrics export
    const finalMetrics = this.getCurrentMetrics();
    await this.storeMetricsInRedis(finalMetrics);
    
    logger.info('[RealtimeMetricsAggregator] Shutdown complete');
  }
}

// Export singleton instance
export const realtimeMetricsAggregator = RealtimeMetricsAggregator.getInstance();
