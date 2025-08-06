import { Agent, Farm, FarmMetrics, ResourceUsage } from '../../types';
import { MonitoringAlert, TimeSeriesData } from '../../types/monitoring';

interface PrometheusMetric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  value: number | Record<string, number>;
  labels?: Record<string, string>;
}

export class PrometheusExporter {
  private metrics: Map<string, PrometheusMetric> = new Map();
  private readonly prefix = 'maifarm_';

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics() {
    // Agent metrics
    this.registerMetric({
      name: 'agent_status',
      help: 'Current status of agents (1=active, 0=inactive)',
      type: 'gauge',
      value: 0,
    });

    this.registerMetric({
      name: 'agent_cpu_usage',
      help: 'CPU usage percentage by agent',
      type: 'gauge',
      value: 0,
    });

    this.registerMetric({
      name: 'agent_memory_usage',
      help: 'Memory usage percentage by agent',
      type: 'gauge',
      value: 0,
    });

    this.registerMetric({
      name: 'agent_task_completion_total',
      help: 'Total number of tasks completed by agent',
      type: 'counter',
      value: 0,
    });

    this.registerMetric({
      name: 'agent_task_failure_total',
      help: 'Total number of tasks failed by agent',
      type: 'counter',
      value: 0,
    });

    this.registerMetric({
      name: 'agent_task_duration_seconds',
      help: 'Task duration in seconds',
      type: 'histogram',
      value: {},
    });

    // Farm metrics
    this.registerMetric({
      name: 'farm_active_total',
      help: 'Total number of active farms',
      type: 'gauge',
      value: 0,
    });

    this.registerMetric({
      name: 'farm_agents_total',
      help: 'Total number of agents per farm',
      type: 'gauge',
      value: 0,
    });

    this.registerMetric({
      name: 'farm_efficiency',
      help: 'Farm efficiency score (0-1)',
      type: 'gauge',
      value: 0,
    });

    this.registerMetric({
      name: 'farm_collaboration_score',
      help: 'Farm collaboration score (0-1)',
      type: 'gauge',
      value: 0,
    });

    // System metrics
    this.registerMetric({
      name: 'websocket_connections_active',
      help: 'Number of active WebSocket connections',
      type: 'gauge',
      value: 0,
    });

    this.registerMetric({
      name: 'api_request_duration_seconds',
      help: 'API request duration in seconds',
      type: 'histogram',
      value: {},
    });

    this.registerMetric({
      name: 'api_request_total',
      help: 'Total number of API requests',
      type: 'counter',
      value: 0,
    });

    // Alert metrics
    this.registerMetric({
      name: 'alerts_active_total',
      help: 'Total number of active alerts by severity',
      type: 'gauge',
      value: 0,
    });
  }

  private registerMetric(metric: Omit<PrometheusMetric, 'name'> & { name: string }) {
    this.metrics.set(this.prefix + metric.name, {
      ...metric,
      name: this.prefix + metric.name,
    });
  }

  updateAgentMetrics(agent: Agent, taskMetrics?: { completed: number; failed: number; duration?: number }) {
    // Update agent status
    this.updateMetric('agent_status', agent.status === 'working' ? 1 : 0, { agent_id: agent.id });

    // Update resource usage
    this.updateMetric('agent_cpu_usage', agent.cpu, { agent_id: agent.id, agent_type: agent.type });
    this.updateMetric('agent_memory_usage', agent.memory, { agent_id: agent.id, agent_type: agent.type });

    // Update task metrics if provided
    if (taskMetrics) {
      if (taskMetrics.completed > 0) {
        this.incrementMetric('agent_task_completion_total', taskMetrics.completed, { agent_id: agent.id });
      }
      if (taskMetrics.failed > 0) {
        this.incrementMetric('agent_task_failure_total', taskMetrics.failed, { agent_id: agent.id });
      }
      if (taskMetrics.duration !== undefined) {
        this.observeHistogram('agent_task_duration_seconds', taskMetrics.duration, { agent_id: agent.id });
      }
    }
  }

  updateFarmMetrics(farms: Farm[]) {
    const activeFarms = farms.filter(f => f.status === 'active');
    this.updateMetric('farm_active_total', activeFarms.length);

    farms.forEach(farm => {
      const labels = { farm_id: farm.id, farm_type: farm.type };
      
      this.updateMetric('farm_agents_total', farm.agents.length, labels);
      this.updateMetric('farm_efficiency', farm.metrics.efficiency, labels);
      this.updateMetric('farm_collaboration_score', farm.metrics.collaborationScore, labels);
    });
  }

  updateSystemMetrics(metrics: {
    websocketConnections?: number;
    apiRequests?: { endpoint: string; duration: number; method: string; status: number };
  }) {
    if (metrics.websocketConnections !== undefined) {
      this.updateMetric('websocket_connections_active', metrics.websocketConnections);
    }

    if (metrics.apiRequests) {
      const { endpoint, duration, method, status } = metrics.apiRequests;
      this.incrementMetric('api_request_total', 1, { endpoint, method, status: String(status) });
      this.observeHistogram('api_request_duration_seconds', duration, { endpoint, method });
    }
  }

  updateAlertMetrics(alerts: MonitoringAlert[]) {
    const alertsBySeverity = alerts.reduce((acc, alert) => {
      if (!alert.resolvedAt) {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    Object.entries(alertsBySeverity).forEach(([severity, count]) => {
      this.updateMetric('alerts_active_total', count, { severity });
    });
  }

  private updateMetric(name: string, value: number, labels?: Record<string, string>) {
    const metric = this.metrics.get(this.prefix + name);
    if (metric && metric.type === 'gauge') {
      if (labels) {
        const labelKey = this.serializeLabels(labels);
        if (typeof metric.value === 'object') {
          metric.value[labelKey] = value;
        }
      } else {
        metric.value = value;
      }
    }
  }

  private incrementMetric(name: string, increment: number = 1, labels?: Record<string, string>) {
    const metric = this.metrics.get(this.prefix + name);
    if (metric && metric.type === 'counter') {
      if (labels) {
        const labelKey = this.serializeLabels(labels);
        if (typeof metric.value === 'object') {
          metric.value[labelKey] = (metric.value[labelKey] || 0) + increment;
        }
      } else if (typeof metric.value === 'number') {
        metric.value += increment;
      }
    }
  }

  private observeHistogram(name: string, value: number, labels?: Record<string, string>) {
    const metric = this.metrics.get(this.prefix + name);
    if (metric && metric.type === 'histogram') {
      const labelKey = labels ? this.serializeLabels(labels) : 'default';
      if (typeof metric.value === 'object') {
        if (!metric.value[labelKey]) {
          metric.value[labelKey] = value;
        } else {
          // In a real implementation, this would maintain buckets
          // For now, we'll just store the latest value
          metric.value[labelKey] = value;
        }
      }
    }
  }

  private serializeLabels(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  // Export metrics in Prometheus text format
  exportMetrics(): string {
    const lines: string[] = [];

    this.metrics.forEach(metric => {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      if (typeof metric.value === 'number') {
        lines.push(`${metric.name} ${metric.value}`);
      } else if (typeof metric.value === 'object') {
        Object.entries(metric.value).forEach(([labels, value]) => {
          if (labels === 'default') {
            lines.push(`${metric.name} ${value}`);
          } else {
            lines.push(`${metric.name}{${labels}} ${value}`);
          }
        });
      }
    });

    return lines.join('\n');
  }

  // Convert to time series data for visualization
  toTimeSeries(metricName: string, labels?: Record<string, string>): TimeSeriesData[] {
    const metric = this.metrics.get(this.prefix + metricName);
    if (!metric) return [];

    const now = new Date();
    const labelKey = labels ? this.serializeLabels(labels) : 'default';

    if (typeof metric.value === 'number') {
      return [{ value: metric.value, timestamp: now }];
    } else if (typeof metric.value === 'object' && labelKey in metric.value) {
      return [{ value: metric.value[labelKey], timestamp: now }];
    }

    return [];
  }

  // Get metric value
  getMetricValue(metricName: string, labels?: Record<string, string>): number | null {
    const metric = this.metrics.get(this.prefix + metricName);
    if (!metric) return null;

    if (typeof metric.value === 'number') {
      return metric.value;
    } else if (typeof metric.value === 'object' && labels) {
      const labelKey = this.serializeLabels(labels);
      return metric.value[labelKey] || null;
    }

    return null;
  }

  // Reset all metrics
  reset() {
    this.metrics.clear();
    this.initializeMetrics();
  }
}

// Singleton instance
export const prometheusExporter = new PrometheusExporter();