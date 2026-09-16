import { EventEmitter } from 'events';
import {
  Metric,
  MetricType,
  AgentMetrics,
  SystemMetrics,
  MetricAggregation,
  AggregationType,
  TimeRange
} from '@/types/metrics';
import { FarmMetrics, Agent } from '@/types';
import { prometheusService } from './prometheus';
import { useWebSocketStore } from '@/store/websocketStore';
import { useFarmStore } from '@/store/farmStore';

// Helper function to safely get agents as Agent array
function getAgentsAsObjects(agents: Agent[] | string[]): Agent[] {
  if (agents.length === 0) return [];
  if (typeof agents[0] === 'string') return []; // If string IDs, return empty
  return agents as Agent[];
}

interface MetricBuffer {
  metrics: Metric[];
  maxSize: number;
  flushInterval: number;
}

export class MetricsCollector extends EventEmitter {
  private static instance: MetricsCollector;
  private buffer: MetricBuffer;
  private flushTimer: NodeJS.Timeout | null = null;
  private collectionInterval: NodeJS.Timeout | null = null;
  private metricsCache: Map<string, Metric[]> = new Map();

  private constructor() {
    super();
    this.buffer = {
      metrics: [],
      maxSize: 1000,
      flushInterval: 10000 // 10 seconds
    };
    
    this.startAutoFlush();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  // Start collecting metrics
  startCollection(interval: number = 5000): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    // Start Prometheus collection
    // prometheusService.startCollection(interval); // Method may not exist

    this.collectionInterval = setInterval(() => {
      this.collectAllMetrics();
    }, interval);

    // Emit start event
    this.emit('collection:started');
  }

  // Stop collecting metrics
  stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }

    // prometheusService.stopCollection(); // Method may not exist
    this.emit('collection:stopped');
  }

  // Collect all metrics
  private async collectAllMetrics(): Promise<void> {
    try {
      const [agentMetrics, farmMetrics, systemMetrics] = await Promise.all([
        this.collectAgentMetrics(),
        this.collectFarmMetrics(),
        this.collectSystemMetrics()
      ]);

      // Process and store metrics
      [...agentMetrics, ...farmMetrics, ...systemMetrics].forEach(metric => {
        this.addMetric(metric);
      });

      this.emit('metrics:collected', {
        agents: agentMetrics.length,
        farms: farmMetrics.length,
        system: systemMetrics.length
      });
    } catch (error) {
      this.emit('error', error);
    }
  }

  // Collect agent metrics
  private async collectAgentMetrics(): Promise<Metric[]> {
    const metrics: Metric[] = [];
    const wsStore = useWebSocketStore.getState();
    const farms = useFarmStore.getState().farms;

    farms.forEach(farm => {
      farm.agents.forEach(agent => {
        const agentMetrics: AgentMetrics = {
          agentId: agent.id,
          farmId: farm.id,
          cpu: typeof agent.resources?.cpu === 'number' ? agent.resources.cpu : (agent.resources?.cpu?.usage ?? 0),
          memory: typeof agent.resources?.memory === 'number' ? agent.resources.memory : (agent.resources?.memory?.usage ?? 0),
          responseTime: Math.random() * 100, // TODO: Get from actual monitoring
          errorRate: Math.random() * 5,
          throughput: Math.random() * 1000,
          activeConnections: 1,
          timestamp: Date.now()
        };

        // Update Prometheus metrics
        prometheusService.updateAgentMetrics(agentMetrics);

        // Create individual metrics
        metrics.push(
          this.createMetric(`agent.cpu`, agentMetrics.cpu, MetricType.GAUGE, {
            agent_id: agent.id,
            farm_id: farm.id
          }),
          this.createMetric(`agent.memory`, agentMetrics.memory, MetricType.GAUGE, {
            agent_id: agent.id,
            farm_id: farm.id
          }),
          this.createMetric(`agent.response_time`, agentMetrics.responseTime, MetricType.HISTOGRAM, {
            agent_id: agent.id,
            farm_id: farm.id
          }),
          this.createMetric(`agent.error_rate`, agentMetrics.errorRate, MetricType.GAUGE, {
            agent_id: agent.id,
            farm_id: farm.id
          }),
          this.createMetric(`agent.throughput`, agentMetrics.throughput, MetricType.COUNTER, {
            agent_id: agent.id,
            farm_id: farm.id
          })
        );
      });
    });

    return metrics;
  }

  // Collect farm metrics
  private async collectFarmMetrics(): Promise<Metric[]> {
    const metrics: Metric[] = [];
    const farms = useFarmStore.getState().farms;

    farms.forEach(farm => {
      // Use helper to safely get agents as objects
      const agents = getAgentsAsObjects(farm.agents);
      const agentCount = agents.length || 1; // Avoid division by zero

      // Calculate resource usage
      let totalCpu = 0;
      let totalMemory = 0;
      agents.forEach(a => {
        const cpuVal = a.resources?.cpu;
        totalCpu += typeof cpuVal === 'number' ? cpuVal : 0;
        const memVal = a.resources?.memory;
        totalMemory += typeof memVal === 'number' ? memVal : 0;
      });

      const farmMetrics: Partial<FarmMetrics> & { farmId: string; totalAgents?: number; activeAgents?: number } = {
        farmId: farm.id,
        totalAgents: agents.length,
        activeAgents: agents.filter(a => a.status === 'active' || a.status === 'working').length,
        resourceUtilization: {
          cpu: totalCpu / agentCount,
          memory: totalMemory / agentCount,
          disk: 0
        },
      };

      // Update Prometheus metrics (cast to satisfy type requirement)
      prometheusService.updateFarmMetrics(farmMetrics as FarmMetrics);

      // Create individual metrics
      metrics.push(
        this.createMetric(`farm.total_agents`, farmMetrics.totalAgents ?? 0, MetricType.GAUGE, {
          farm_id: farm.id
        }),
        this.createMetric(`farm.active_agents`, farmMetrics.activeAgents ?? 0, MetricType.GAUGE, {
          farm_id: farm.id
        }),
        this.createMetric(`farm.resource_utilization`, farmMetrics.resourceUtilization?.cpu ?? 0, MetricType.GAUGE, {
          farm_id: farm.id
        })
        // Commented out metrics that don't exist on FarmMetrics interface
        // this.createMetric(`farm.task_completion_rate`, farmMetrics.taskCompletionRate, MetricType.GAUGE, {
        //   farm_id: farm.id
        // }),
        // this.createMetric(`farm.avg_response_time`, farmMetrics.avgResponseTime, MetricType.HISTOGRAM, {
        //   farm_id: farm.id
        // }),
        // this.createMetric(`farm.error_count`, farmMetrics.errorCount, MetricType.COUNTER, {
        //   farm_id: farm.id
        // })
      );
    });

    return metrics;
  }

  // Collect system metrics
  private async collectSystemMetrics(): Promise<Metric[]> {
    const metrics: Metric[] = [];
    const wsStore = useWebSocketStore.getState();

    const systemMetrics: SystemMetrics = {
      cpu: await this.getSystemCPU(),
      memory: await this.getSystemMemory(),
      disk: await this.getSystemDisk(),
      network: {
        bytesIn: Math.floor(Math.random() * 1000000),
        bytesOut: Math.floor(Math.random() * 1000000),
        packetsIn: Math.floor(Math.random() * 10000),
        packetsOut: Math.floor(Math.random() * 10000)
      },
      websocketConnections: wsStore.connected ? 1 : 0,
      apiRequestRate: Math.random() * 1000,
      apiErrorRate: Math.random() * 10,
      queueDepth: Math.floor(Math.random() * 50),
      timestamp: Date.now()
    };

    // Update WebSocket connections
    prometheusService.updateWebSocketConnections('total', systemMetrics.websocketConnections);

    // Create individual metrics
    metrics.push(
      this.createMetric('system.cpu', systemMetrics.cpu, MetricType.GAUGE),
      this.createMetric('system.memory', systemMetrics.memory, MetricType.GAUGE),
      this.createMetric('system.disk', systemMetrics.disk, MetricType.GAUGE),
      this.createMetric('system.network.bytes_in', systemMetrics.network.bytesIn, MetricType.COUNTER),
      this.createMetric('system.network.bytes_out', systemMetrics.network.bytesOut, MetricType.COUNTER),
      this.createMetric('system.websocket_connections', systemMetrics.websocketConnections, MetricType.GAUGE),
      this.createMetric('system.api_request_rate', systemMetrics.apiRequestRate, MetricType.GAUGE),
      this.createMetric('system.api_error_rate', systemMetrics.apiErrorRate, MetricType.GAUGE),
      this.createMetric('system.queue_depth', systemMetrics.queueDepth, MetricType.GAUGE)
    );

    return metrics;
  }

  // Create a metric
  private createMetric(
    name: string, 
    value: number, 
    type: MetricType, 
    labels: Record<string, string> = {}
  ): Metric {
    return {
      name: `maifarm.${name}`,
      value,
      timestamp: Date.now(),
      labels,
      type
    };
  }

  // Add metric to buffer
  addMetric(metric: Metric): void {
    this.buffer.metrics.push(metric);

    // Cache metric for aggregation
    const key = this.getMetricKey(metric);
    if (!this.metricsCache.has(key)) {
      this.metricsCache.set(key, []);
    }
    this.metricsCache.get(key)!.push(metric);

    // Flush if buffer is full
    if (this.buffer.metrics.length >= this.buffer.maxSize) {
      this.flush();
    }
  }

  // Get metric key for caching
  private getMetricKey(metric: Metric): string {
    const labelStr = Object.entries(metric.labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${metric.name}{${labelStr}}`;
  }

  // Start auto-flush timer
  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.metrics.length > 0) {
        this.flush();
      }
    }, this.buffer.flushInterval);
  }

  // Flush metrics
  flush(): void {
    if (this.buffer.metrics.length === 0) return;

    const metrics = [...this.buffer.metrics];
    this.buffer.metrics = [];

    // Emit metrics for processing
    this.emit('metrics:flushed', metrics);

    // Clean up old cached metrics
    this.cleanupCache();
  }

  // Clean up old cached metrics
  private cleanupCache(): void {
    const cutoff = Date.now() - 3600000; // 1 hour
    
    this.metricsCache.forEach((metrics, key) => {
      const filtered = metrics.filter(m => m.timestamp > cutoff);
      if (filtered.length === 0) {
        this.metricsCache.delete(key);
      } else {
        this.metricsCache.set(key, filtered);
      }
    });
  }

  // Aggregate metrics
  aggregate(
    metricName: string,
    timeRange: TimeRange,
    aggregation: AggregationType,
    labels?: Record<string, string>
  ): MetricAggregation | null {
    const key = this.getMetricKey({
      name: metricName,
      value: 0,
      timestamp: 0,
      labels: labels || {},
      type: MetricType.GAUGE
    });

    const metrics = this.metricsCache.get(key) || [];
    const filtered = metrics.filter(
      m => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
    );

    if (filtered.length === 0) return null;

    const values = filtered.map(m => m.value);
    let aggregatedValue: number;

    switch (aggregation) {
      case AggregationType.AVG:
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case AggregationType.SUM:
        aggregatedValue = values.reduce((a, b) => a + b, 0);
        break;
      case AggregationType.MIN:
        aggregatedValue = Math.min(...values);
        break;
      case AggregationType.MAX:
        aggregatedValue = Math.max(...values);
        break;
      case AggregationType.COUNT:
        aggregatedValue = values.length;
        break;
      case AggregationType.P50:
        aggregatedValue = this.percentile(values, 0.5);
        break;
      case AggregationType.P90:
        aggregatedValue = this.percentile(values, 0.9);
        break;
      case AggregationType.P95:
        aggregatedValue = this.percentile(values, 0.95);
        break;
      case AggregationType.P99:
        aggregatedValue = this.percentile(values, 0.99);
        break;
      default:
        aggregatedValue = 0;
    }

    return {
      metric: metricName,
      period: timeRange.end - timeRange.start,
      aggregation,
      value: aggregatedValue,
      timestamp: Date.now()
    };
  }

  // Calculate percentile
  private percentile(values: number[], p: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index] || 0;
  }

  // Get system CPU usage (placeholder)
  private async getSystemCPU(): Promise<number> {
    // In a real implementation, this would use os.cpus() or similar
    return Math.random() * 100;
  }

  // Get system memory usage (placeholder)
  private async getSystemMemory(): Promise<number> {
    // In a real implementation, this would use os.freemem() / os.totalmem()
    return Math.random() * 100;
  }

  // Get system disk usage (placeholder)
  private async getSystemDisk(): Promise<number> {
    // In a real implementation, this would use disk usage libraries
    return Math.random() * 100;
  }

  // Get recent metrics
  getRecentMetrics(metricName: string, duration: number = 300000): Metric[] {
    const cutoff = Date.now() - duration;
    const results: Metric[] = [];

    this.metricsCache.forEach((metrics, key) => {
      if (key.startsWith(metricName)) {
        results.push(...metrics.filter(m => m.timestamp >= cutoff));
      }
    });

    return results.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Initialize agent metrics
  initializeAgentMetrics(agentId: string): void {
    // Initialize metrics collection for a specific agent
    const initialMetrics = [
      this.createMetric(`agent.initialized`, 1, MetricType.COUNTER, { agent_id: agentId }),
      this.createMetric(`agent.cpu`, 0, MetricType.GAUGE, { agent_id: agentId }),
      this.createMetric(`agent.memory`, 0, MetricType.GAUGE, { agent_id: agentId })
    ];
    
    initialMetrics.forEach(metric => this.addMetric(metric));
    this.emit('agent:metrics:initialized', agentId);
  }

  // Stop agent metrics collection
  stopAgentMetrics(agentId: string): void {
    // Mark agent metrics as stopped
    const stopMetric = this.createMetric(
      `agent.stopped`, 
      1, 
      MetricType.COUNTER, 
      { agent_id: agentId }
    );
    
    this.addMetric(stopMetric);
    this.emit('agent:metrics:stopped', agentId);
  }

  // Cleanup agent metrics
  cleanupAgentMetrics(agentId: string): void {
    // Remove cached metrics for specific agent
    const keysToDelete: string[] = [];
    
    this.metricsCache.forEach((metrics, key) => {
      if (key.includes(`agent_id=${agentId}`)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.metricsCache.delete(key));
    
    // Add cleanup metric
    const cleanupMetric = this.createMetric(
      `agent.cleaned_up`, 
      1, 
      MetricType.COUNTER, 
      { agent_id: agentId }
    );
    
    this.addMetric(cleanupMetric);
    this.emit('agent:metrics:cleaned', agentId);
  }

  // Initialize farm metrics
  initializeFarmMetrics(farmId: string): void {
    const initMetric = this.createMetric(
      'farm.initialized',
      1,
      MetricType.COUNTER,
      { farm_id: farmId }
    );
    
    this.addMetric(initMetric);
    this.emit('farm:metrics:initialized', farmId);
  }

  // Start collecting farm metrics
  startFarmMetrics(farmId: string): void {
    const startMetric = this.createMetric(
      'farm.started',
      1,
      MetricType.COUNTER,
      { farm_id: farmId }
    );
    
    this.addMetric(startMetric);
    this.emit('farm:metrics:started', farmId);
  }

  // Stop collecting farm metrics
  stopFarmMetrics(farmId: string): void {
    const stopMetric = this.createMetric(
      'farm.stopped',
      1,
      MetricType.COUNTER,
      { farm_id: farmId }
    );
    
    this.addMetric(stopMetric);
    this.emit('farm:metrics:stopped', farmId);
  }

  // Cleanup farm metrics
  cleanupFarmMetrics(farmId: string): void {
    // Remove cached metrics for specific farm
    const keysToDelete: string[] = [];
    
    this.metricsCache.forEach((metrics, key) => {
      if (key.includes(`farm_id=${farmId}`)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.metricsCache.delete(key));
    
    // Add cleanup metric
    const cleanupMetric = this.createMetric(
      'farm.cleaned_up',
      1,
      MetricType.COUNTER,
      { farm_id: farmId }
    );
    
    this.addMetric(cleanupMetric);
    this.emit('farm:metrics:cleaned', farmId);
  }

  // Clear all metrics
  clear(): void {
    this.buffer.metrics = [];
    this.metricsCache.clear();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();