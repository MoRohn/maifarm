import { register, collectDefaultMetrics, Counter, Gauge, Histogram, Summary } from 'prom-client';
import { 
  Metric, 
  MetricType, 
  AgentMetrics, 
  SystemMetrics,
  MetricExport 
} from '@/types/metrics';
import { FarmMetrics } from '@/types';

// Initialize default metrics collection
collectDefaultMetrics({ prefix: 'maifarm_' });

// Custom metrics
const httpRequestDuration = new Histogram({
  name: 'maifarm_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const websocketConnections = new Gauge({
  name: 'maifarm_websocket_connections',
  help: 'Number of active WebSocket connections',
  labelNames: ['type']
});

const agentTasksTotal = new Counter({
  name: 'maifarm_agent_tasks_total',
  help: 'Total number of tasks processed by agents',
  labelNames: ['agent_id', 'farm_id', 'status']
});

const agentResourceUsage = new Gauge({
  name: 'maifarm_agent_resource_usage',
  help: 'Resource usage by agents',
  labelNames: ['agent_id', 'farm_id', 'resource_type']
});

const farmActiveAgents = new Gauge({
  name: 'maifarm_farm_active_agents',
  help: 'Number of active agents per farm',
  labelNames: ['farm_id']
});

const systemErrors = new Counter({
  name: 'maifarm_system_errors_total',
  help: 'Total number of system errors',
  labelNames: ['error_type', 'severity']
});

const apiRequestRate = new Summary({
  name: 'maifarm_api_request_rate',
  help: 'API request rate',
  labelNames: ['endpoint', 'method'],
  maxAgeSeconds: 600,
  ageBuckets: 5
});

export class PrometheusService {
  private static instance: PrometheusService;
  private metricsInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  static getInstance(): PrometheusService {
    if (!PrometheusService.instance) {
      PrometheusService.instance = new PrometheusService();
    }
    return PrometheusService.instance;
  }

  // Start collecting custom metrics
  startCollection(interval: number = 10000): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.metricsInterval = setInterval(() => {
      this.collectCustomMetrics();
    }, interval);
  }

  // Stop collecting metrics
  stopCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  // Record HTTP request
  recordHttpRequest(method: string, route: string, status: number, duration: number): void {
    httpRequestDuration.observe({ method, route, status: status.toString() }, duration);
  }

  // Update WebSocket connections
  updateWebSocketConnections(type: string, count: number): void {
    websocketConnections.set({ type }, count);
  }

  // Record agent task
  recordAgentTask(agentId: string, farmId: string, status: 'success' | 'failure'): void {
    agentTasksTotal.inc({ agent_id: agentId, farm_id: farmId, status });
  }

  // Update agent metrics
  updateAgentMetrics(metrics: AgentMetrics): void {
    const { agentId, farmId, cpu, memory, responseTime, errorRate, throughput } = metrics;
    
    agentResourceUsage.set({ agent_id: agentId, farm_id: farmId, resource_type: 'cpu' }, cpu);
    agentResourceUsage.set({ agent_id: agentId, farm_id: farmId, resource_type: 'memory' }, memory);
    agentResourceUsage.set({ agent_id: agentId, farm_id: farmId, resource_type: 'response_time' }, responseTime);
    agentResourceUsage.set({ agent_id: agentId, farm_id: farmId, resource_type: 'error_rate' }, errorRate);
    agentResourceUsage.set({ agent_id: agentId, farm_id: farmId, resource_type: 'throughput' }, throughput);
  }

  // Update farm metrics
  updateFarmMetrics(metrics: FarmMetrics): void {
    const { farmId, activeAgents } = metrics;
    farmActiveAgents.set({ farm_id: farmId }, activeAgents);
  }

  // Record system error
  recordSystemError(errorType: string, severity: string): void {
    systemErrors.inc({ error_type: errorType, severity });
  }

  // Record API request
  recordApiRequest(endpoint: string, method: string, duration: number): void {
    apiRequestRate.observe({ endpoint, method }, duration);
  }

  // Get metrics in Prometheus format
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  // Get metrics as JSON
  async getMetricsJson(): Promise<MetricExport> {
    const metrics = await register.getMetricsAsJSON();
    return {
      format: 'json',
      metrics: metrics.map(m => ({
        name: m.name,
        value: this.extractMetricValue(m),
        timestamp: Date.now(),
        labels: {},
        type: this.mapMetricType(m.type)
      })),
      timestamp: Date.now()
    };
  }

  // Custom metric aggregation
  private collectCustomMetrics(): void {
    // This would connect to your actual data sources
    // For now, we'll use placeholder logic
    
    // Example: Update system metrics
    const systemMetrics: SystemMetrics = {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100,
      network: {
        bytesIn: Math.floor(Math.random() * 1000000),
        bytesOut: Math.floor(Math.random() * 1000000),
        packetsIn: Math.floor(Math.random() * 10000),
        packetsOut: Math.floor(Math.random() * 10000)
      },
      websocketConnections: Math.floor(Math.random() * 100),
      apiRequestRate: Math.random() * 1000,
      apiErrorRate: Math.random() * 10,
      queueDepth: Math.floor(Math.random() * 50),
      timestamp: Date.now()
    };

    // Update gauges based on system metrics
    websocketConnections.set({ type: 'total' }, systemMetrics.websocketConnections);
  }

  // Helper to extract metric value
  private extractMetricValue(metric: any): number {
    if (metric.values && metric.values.length > 0) {
      return metric.values[0].value;
    }
    return 0;
  }

  // Map Prometheus metric type to our MetricType enum
  private mapMetricType(type: string): MetricType {
    switch (type) {
      case 'counter':
        return MetricType.COUNTER;
      case 'gauge':
        return MetricType.GAUGE;
      case 'histogram':
        return MetricType.HISTOGRAM;
      case 'summary':
        return MetricType.SUMMARY;
      default:
        return MetricType.GAUGE;
    }
  }

  // Create custom metric
  createCustomMetric(name: string, type: MetricType, help: string, labelNames?: string[]): void {
    const metricName = `maifarm_${name}`;
    
    switch (type) {
      case MetricType.COUNTER:
        new Counter({ name: metricName, help, labelNames: labelNames || [] });
        break;
      case MetricType.GAUGE:
        new Gauge({ name: metricName, help, labelNames: labelNames || [] });
        break;
      case MetricType.HISTOGRAM:
        new Histogram({ name: metricName, help, labelNames: labelNames || [] });
        break;
      case MetricType.SUMMARY:
        new Summary({ name: metricName, help, labelNames: labelNames || [] });
        break;
    }
  }

  // Push metrics to Prometheus Pushgateway (for batch jobs)
  async pushMetrics(gateway: string, job: string): Promise<void> {
    const { Pushgateway } = await import('prom-client');
    const pushgateway = new Pushgateway(gateway);
    
    await pushgateway.push({ jobName: job });
  }

  // Clear all metrics
  clearMetrics(): void {
    register.clear();
  }
}

// Export singleton instance
export const prometheusService = PrometheusService.getInstance();