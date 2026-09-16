import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { db } from '../database/connection';
import { redis } from '../database/connection';
import { realtimeConnectionManager } from './RealtimeConnectionManager';
import { stateCoordinator } from './StateCoordinator';
import { v4 as uuidv4 } from 'uuid';

interface MetricEvent {
  id: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: Date;
}

interface AggregatedMetric {
  name: string;
  type: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
  tags: Record<string, string>;
  window: {
    start: Date;
    end: Date;
  };
}

interface MetricStream {
  name: string;
  buffer: MetricEvent[];
  aggregator: MetricAggregator;
  flushInterval: number;
  lastFlush: Date;
}

interface MetricAggregator {
  type: 'sum' | 'avg' | 'min' | 'max' | 'percentile';
  window: number; // milliseconds
  compute: (events: MetricEvent[]) => AggregatedMetric;
}

/**
 * Event-Driven Metrics Pipeline
 * 
 * Features:
 * - Event-driven collection (no polling)
 * - Stream processing for aggregations
 * - Real-time WebSocket push
 * - Time-series with automatic rollups
 * - Performance metrics with percentiles
 * - Custom metric streams
 */
export class MetricsPipeline extends EventEmitter {
  private static instance: MetricsPipeline;
  
  private streams: Map<string, MetricStream> = new Map();
  private eventBuffer: MetricEvent[] = [];
  private aggregationTimer: NodeJS.Timeout | null = null;
  private rollupTimer: NodeJS.Timeout | null = null;
  
  private readonly BUFFER_SIZE = 10000;
  private readonly FLUSH_INTERVAL = 1000; // 1 second
  private readonly ROLLUP_INTERVALS = [
    { name: '1m', ms: 60000 },
    { name: '5m', ms: 300000 },
    { name: '1h', ms: 3600000 },
    { name: '1d', ms: 86400000 }
  ];

  private constructor() {
    super();
    this.initialize();
  }

  static getInstance(): MetricsPipeline {
    if (!MetricsPipeline.instance) {
      MetricsPipeline.instance = new MetricsPipeline();
    }
    return MetricsPipeline.instance;
  }

  /**
   * Initialize metrics pipeline
   */
  private initialize(): void {
    this.setupDefaultStreams();
    this.startAggregationProcessor();
    this.startRollupProcessor();
    this.setupEventListeners();
    
    logger.info('[MetricsPipeline] Initialized with event-driven collection');
  }

  /**
   * Setup default metric streams
   */
  private setupDefaultStreams(): void {
    // Farm metrics stream
    this.createStream('farm_metrics', {
      type: 'avg',
      window: 60000,
      compute: this.computeAverageMetrics.bind(this)
    });

    // Agent performance stream
    this.createStream('agent_performance', {
      type: 'percentile',
      window: 60000,
      compute: this.computePercentileMetrics.bind(this)
    });

    // API latency stream
    this.createStream('api_latency', {
      type: 'percentile',
      window: 60000,
      compute: this.computePercentileMetrics.bind(this)
    });

    // Task throughput stream
    this.createStream('task_throughput', {
      type: 'sum',
      window: 60000,
      compute: this.computeSumMetrics.bind(this)
    });

    // System resources stream
    this.createStream('system_resources', {
      type: 'avg',
      window: 30000,
      compute: this.computeAverageMetrics.bind(this)
    });
  }

  /**
   * Record a metric event
   */
  record(
    name: string,
    value: number,
    type: 'counter' | 'gauge' | 'histogram' | 'timer' = 'gauge',
    tags: Record<string, string> = {}
  ): void {
    const event: MetricEvent = {
      id: uuidv4(),
      type,
      name,
      value,
      tags,
      timestamp: new Date()
    };

    // Add to buffer
    this.eventBuffer.push(event);
    
    // Trim buffer if too large
    if (this.eventBuffer.length > this.BUFFER_SIZE) {
      this.eventBuffer.shift();
    }

    // Route to appropriate stream
    this.routeToStream(event);

    // Emit for real-time processing
    this.emit('metric:recorded', event);

    // Process immediately for critical metrics
    if (tags.priority === 'high') {
      this.processMetricImmediately(event);
    }
  }

  /**
   * Record farm-specific metrics
   */
  recordFarmMetric(
    farmId: string,
    metricName: string,
    value: number,
    additionalTags: Record<string, string> = {}
  ): void {
    this.record(
      `farm.${metricName}`,
      value,
      'gauge',
      {
        farmId,
        ...additionalTags
      }
    );
  }

  /**
   * Record agent-specific metrics
   */
  recordAgentMetric(
    agentId: string,
    farmId: string,
    metricName: string,
    value: number,
    additionalTags: Record<string, string> = {}
  ): void {
    this.record(
      `agent.${metricName}`,
      value,
      'gauge',
      {
        agentId,
        farmId,
        ...additionalTags
      }
    );
  }

  /**
   * Record API performance metrics
   */
  recordApiMetric(
    provider: string,
    operation: string,
    latencyMs: number,
    success: boolean,
    additionalTags: Record<string, string> = {}
  ): void {
    this.record(
      'api.latency',
      latencyMs,
      'timer',
      {
        provider,
        operation,
        success: success.toString(),
        ...additionalTags
      }
    );

    // Record success/failure counter
    this.record(
      `api.${success ? 'success' : 'failure'}`,
      1,
      'counter',
      {
        provider,
        operation,
        ...additionalTags
      }
    );
  }

  /**
   * Record task metrics
   */
  recordTaskMetric(
    taskId: string,
    farmId: string,
    metricName: string,
    value: number,
    additionalTags: Record<string, string> = {}
  ): void {
    this.record(
      `task.${metricName}`,
      value,
      'gauge',
      {
        taskId,
        farmId,
        ...additionalTags
      }
    );
  }

  /**
   * Create a custom metric stream
   */
  createStream(name: string, aggregator: MetricAggregator): void {
    const stream: MetricStream = {
      name,
      buffer: [],
      aggregator,
      flushInterval: this.FLUSH_INTERVAL,
      lastFlush: new Date()
    };

    this.streams.set(name, stream);
    logger.debug(`[MetricsPipeline] Created stream: ${name}`);
  }

  /**
   * Route metric event to appropriate streams
   */
  private routeToStream(event: MetricEvent): void {
    // Route based on metric name prefix
    const prefix = event.name.split('.')[0];
    
    switch (prefix) {
      case 'farm':
        this.addToStream('farm_metrics', event);
        break;
      case 'agent':
        this.addToStream('agent_performance', event);
        break;
      case 'api':
        if (event.type === 'timer') {
          this.addToStream('api_latency', event);
        }
        break;
      case 'task':
        this.addToStream('task_throughput', event);
        break;
      case 'system':
        this.addToStream('system_resources', event);
        break;
    }
  }

  /**
   * Add event to stream buffer
   */
  private addToStream(streamName: string, event: MetricEvent): void {
    const stream = this.streams.get(streamName);
    if (!stream) return;

    stream.buffer.push(event);

    // Check if flush needed
    const now = Date.now();
    if (now - stream.lastFlush.getTime() >= stream.flushInterval) {
      this.flushStream(streamName);
    }
  }

  /**
   * Flush stream and compute aggregations
   */
  private async flushStream(streamName: string): Promise<void> {
    const stream = this.streams.get(streamName);
    if (!stream || stream.buffer.length === 0) return;

    // Compute aggregation
    const aggregated = stream.aggregator.compute(stream.buffer);
    
    // Clear buffer
    stream.buffer = [];
    stream.lastFlush = new Date();

    // Store aggregated metric
    await this.storeAggregatedMetric(aggregated);

    // Broadcast via WebSocket
    this.broadcastMetric(aggregated);

    // Emit for further processing
    this.emit('metric:aggregated', aggregated);
  }

  /**
   * Process metric immediately for critical updates
   */
  private async processMetricImmediately(event: MetricEvent): Promise<void> {
    // Store in time-series database
    await this.storeMetricEvent(event);

    // Broadcast immediately for critical metrics
    realtimeConnectionManager.broadcast('metric:realtime', {
      metric: event.name,
      value: event.value,
      tags: event.tags,
      timestamp: event.timestamp
    });

    // Update state if needed
    if (event.tags.farmId) {
      await stateCoordinator.applyStateChange(
        'farm',
        event.tags.farmId,
        {
          [`metrics.${event.name}`]: event.value,
          [`metrics.lastUpdate`]: event.timestamp
        }
      );
    }
  }

  /**
   * Compute average metrics
   */
  private computeAverageMetrics(events: MetricEvent[]): AggregatedMetric {
    if (events.length === 0) {
      return this.createEmptyAggregation('average');
    }

    const values = events.map(e => e.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = sum / values.length;

    return {
      name: events[0].name,
      type: 'average',
      count: events.length,
      sum,
      min,
      max,
      avg,
      tags: events[0].tags,
      window: {
        start: events[0].timestamp,
        end: events[events.length - 1].timestamp
      }
    };
  }

  /**
   * Compute sum metrics
   */
  private computeSumMetrics(events: MetricEvent[]): AggregatedMetric {
    if (events.length === 0) {
      return this.createEmptyAggregation('sum');
    }

    const sum = events.reduce((total, e) => total + e.value, 0);

    return {
      name: events[0].name,
      type: 'sum',
      count: events.length,
      sum,
      min: 0,
      max: sum,
      avg: sum / events.length,
      tags: events[0].tags,
      window: {
        start: events[0].timestamp,
        end: events[events.length - 1].timestamp
      }
    };
  }

  /**
   * Compute percentile metrics
   */
  private computePercentileMetrics(events: MetricEvent[]): AggregatedMetric {
    if (events.length === 0) {
      return this.createEmptyAggregation('percentile');
    }

    const values = events.map(e => e.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    const p50Index = Math.floor(values.length * 0.5);
    const p95Index = Math.floor(values.length * 0.95);
    const p99Index = Math.floor(values.length * 0.99);

    return {
      name: events[0].name,
      type: 'percentile',
      count: events.length,
      sum,
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      p50: values[p50Index],
      p95: values[p95Index],
      p99: values[p99Index],
      tags: events[0].tags,
      window: {
        start: events[0].timestamp,
        end: events[events.length - 1].timestamp
      }
    };
  }

  /**
   * Create empty aggregation
   */
  private createEmptyAggregation(type: string): AggregatedMetric {
    return {
      name: 'unknown',
      type,
      count: 0,
      sum: 0,
      min: 0,
      max: 0,
      avg: 0,
      tags: {},
      window: {
        start: new Date(),
        end: new Date()
      }
    };
  }

  /**
   * Store metric event in database
   */
  private async storeMetricEvent(event: MetricEvent): Promise<void> {
    try {
      await db.query(
        `INSERT INTO metrics (id, type, name, value, tags, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          event.id,
          event.type,
          event.name,
          event.value,
          JSON.stringify(event.tags),
          event.timestamp
        ]
      );
    } catch (error) {
      logger.error('[MetricsPipeline] Error storing metric event:', error);
    }

    // Store in Redis for fast access
    if (redis && redis.status === 'ready') {
      const key = `metric:${event.name}:${Math.floor(event.timestamp.getTime() / 1000)}`;
      await redis.setEx(key, 3600, JSON.stringify(event)); // 1 hour TTL
    }
  }

  /**
   * Store aggregated metric
   */
  private async storeAggregatedMetric(metric: AggregatedMetric): Promise<void> {
    try {
      await db.query(
        `INSERT INTO aggregated_metrics 
         (name, type, count, sum, min, max, avg, p50, p95, p99, tags, window_start, window_end, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          metric.name,
          metric.type,
          metric.count,
          metric.sum,
          metric.min,
          metric.max,
          metric.avg,
          metric.p50,
          metric.p95,
          metric.p99,
          JSON.stringify(metric.tags),
          metric.window.start,
          metric.window.end,
          new Date()
        ]
      );
    } catch (error) {
      logger.error('[MetricsPipeline] Error storing aggregated metric:', error);
    }
  }

  /**
   * Broadcast metric via WebSocket
   */
  private broadcastMetric(metric: AggregatedMetric): void {
    // Send to metrics room
    realtimeConnectionManager.sendToRoom('metrics', 'metric:update', {
      metric: metric.name,
      type: metric.type,
      value: metric.avg,
      count: metric.count,
      min: metric.min,
      max: metric.max,
      p50: metric.p50,
      p95: metric.p95,
      p99: metric.p99,
      tags: metric.tags,
      window: metric.window
    });

    // Send to farm-specific room if applicable
    if (metric.tags.farmId) {
      realtimeConnectionManager.sendToFarm(metric.tags.farmId, 'farm:metrics', {
        metric: metric.name,
        value: metric.avg,
        aggregation: metric
      });
    }
  }

  /**
   * Start aggregation processor
   */
  private startAggregationProcessor(): void {
    this.aggregationTimer = setInterval(() => {
      for (const [name, stream] of this.streams) {
        const now = Date.now();
        if (now - stream.lastFlush.getTime() >= stream.flushInterval) {
          this.flushStream(name);
        }
      }
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Start rollup processor
   */
  private startRollupProcessor(): void {
    this.rollupTimer = setInterval(async () => {
      for (const interval of this.ROLLUP_INTERVALS) {
        await this.performRollup(interval.name, interval.ms);
      }
    }, 60000); // Every minute
  }

  /**
   * Perform metric rollup
   */
  private async performRollup(intervalName: string, intervalMs: number): Promise<void> {
    const cutoff = new Date(Date.now() - intervalMs);
    
    try {
      // Get metrics to rollup
      const result = await db.query(
        `SELECT name, type, COUNT(*) as count, SUM(sum) as total_sum, 
         MIN(min) as total_min, MAX(max) as total_max, AVG(avg) as total_avg
         FROM aggregated_metrics
         WHERE window_start >= $1
         GROUP BY name, type`,
        [cutoff]
      );

      for (const row of result.rows) {
        await db.query(
          `INSERT INTO metric_rollups 
           (interval, name, type, count, sum, min, max, avg, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (interval, name, created_at) 
           DO UPDATE SET count = $4, sum = $5, min = $6, max = $7, avg = $8`,
          [
            intervalName,
            row.name,
            row.type,
            row.count,
            row.total_sum,
            row.total_min,
            row.total_max,
            row.total_avg,
            new Date()
          ]
        );
      }
    } catch (error) {
      logger.error(`[MetricsPipeline] Error performing ${intervalName} rollup:`, error);
    }
  }

  /**
   * Setup event listeners for automatic metric collection
   */
  private setupEventListeners(): void {
    // Listen to state changes
    stateCoordinator.on('state:changed', (event) => {
      this.record(
        `state.${event.entityType}.changed`,
        1,
        'counter',
        {
          entityType: event.entityType,
          entityId: event.entityId,
          changeType: event.type
        }
      );
    });

    // Listen to WebSocket events
    realtimeConnectionManager.on('client:connected', (data) => {
      this.record('websocket.connections', 1, 'counter', { event: 'connected' });
    });

    realtimeConnectionManager.on('client:disconnected', (data) => {
      this.record('websocket.connections', -1, 'counter', { event: 'disconnected' });
    });

    // Listen to farm events
    this.on('farm:created', (farmId: string) => {
      this.recordFarmMetric(farmId, 'created', 1);
    });

    this.on('farm:started', (farmId: string) => {
      this.recordFarmMetric(farmId, 'started', 1);
    });

    this.on('farm:completed', (farmId: string) => {
      this.recordFarmMetric(farmId, 'completed', 1);
    });

    // Listen to agent events
    this.on('agent:created', (data: { agentId: string; farmId: string }) => {
      this.recordAgentMetric(data.agentId, data.farmId, 'created', 1);
    });

    this.on('agent:active', (data: { agentId: string; farmId: string }) => {
      this.recordAgentMetric(data.agentId, data.farmId, 'active', 1);
    });
  }

  /**
   * Get current metrics summary
   */
  async getMetricsSummary(
    timeRange: { start: Date; end: Date },
    filters?: { name?: string; tags?: Record<string, string> }
  ): Promise<any> {
    const query = `
      SELECT name, type, COUNT(*) as count, AVG(avg) as avg_value, 
      MIN(min) as min_value, MAX(max) as max_value
      FROM aggregated_metrics
      WHERE window_start >= $1 AND window_end <= $2
      ${filters?.name ? 'AND name LIKE $3' : ''}
      GROUP BY name, type
      ORDER BY count DESC
    `;

    const params = [timeRange.start, timeRange.end];
    if (filters?.name) {
      params.push(`%${filters.name}%`);
    }

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get real-time metrics
   */
  getRealTimeMetrics(): MetricEvent[] {
    // Return last 100 events from buffer
    return this.eventBuffer.slice(-100);
  }

  /**
   * Get metrics stats
   */
  getStats(): {
    bufferedEvents: number;
    activeStreams: number;
    totalStreams: number;
  } {
    return {
      bufferedEvents: this.eventBuffer.length,
      activeStreams: Array.from(this.streams.values())
        .filter(s => s.buffer.length > 0).length,
      totalStreams: this.streams.size
    };
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
    }
    if (this.rollupTimer) {
      clearInterval(this.rollupTimer);
    }

    // Flush all streams
    for (const streamName of this.streams.keys()) {
      this.flushStream(streamName);
    }

    this.streams.clear();
    this.eventBuffer = [];
  }
}

// Export singleton instance
export const metricsPipeline = MetricsPipeline.getInstance();