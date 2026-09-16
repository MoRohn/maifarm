import { 
  Metric, 
  MetricType, 
  AgentMetrics, 
  SystemMetrics,
  MetricExport 
} from '@/types/metrics';
import { FarmMetrics } from '@/types';

// Browser-compatible Prometheus metrics client
export class PrometheusClient {
  private static instance: PrometheusClient;
  private metricsEndpoint = '/api/metrics';
  private metricsCache: Map<string, any> = new Map();

  private constructor() {}

  static getInstance(): PrometheusClient {
    if (!PrometheusClient.instance) {
      PrometheusClient.instance = new PrometheusClient();
    }
    return PrometheusClient.instance;
  }

  // Record HTTP request metrics
  async recordHttpRequest(method: string, route: string, status: number, duration: number): Promise<void> {
    try {
      await fetch(`${this.metricsEndpoint}/http`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, route, status, duration })
      });
    } catch (error) {
      console.error('Failed to record HTTP metric:', error);
    }
  }

  // Update WebSocket connections
  async updateWebSocketConnections(type: string, count: number): Promise<void> {
    try {
      await fetch(`${this.metricsEndpoint}/websocket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, count })
      });
    } catch (error) {
      console.error('Failed to update WebSocket metric:', error);
    }
  }

  // Record agent task
  async recordAgentTask(agentId: string, farmId: string, status: 'success' | 'failure'): Promise<void> {
    try {
      await fetch(`${this.metricsEndpoint}/agent-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, farmId, status })
      });
    } catch (error) {
      console.error('Failed to record agent task:', error);
    }
  }

  // Update agent metrics
  async updateAgentMetrics(metrics: AgentMetrics): Promise<void> {
    try {
      await fetch(`${this.metricsEndpoint}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metrics)
      });
    } catch (error) {
      console.error('Failed to update agent metrics:', error);
    }
  }

  // Update farm metrics
  async updateFarmMetrics(metrics: FarmMetrics): Promise<void> {
    try {
      await fetch(`${this.metricsEndpoint}/farm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metrics)
      });
    } catch (error) {
      console.error('Failed to update farm metrics:', error);
    }
  }

  // Record system error
  async recordSystemError(errorType: string, severity: string): Promise<void> {
    try {
      await fetch(`${this.metricsEndpoint}/error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorType, severity })
      });
    } catch (error) {
      console.error('Failed to record system error:', error);
    }
  }

  // Record API request
  async recordApiRequest(endpoint: string, method: string, duration: number): Promise<void> {
    try {
      await fetch(`${this.metricsEndpoint}/api-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, method, duration })
      });
    } catch (error) {
      console.error('Failed to record API request:', error);
    }
  }

  // Get metrics from server
  async getMetrics(): Promise<string> {
    try {
      const response = await fetch(`${this.metricsEndpoint}/export`);
      return await response.text();
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      return '';
    }
  }

  // Get metrics as JSON
  async getMetricsJson(): Promise<MetricExport> {
    try {
      const response = await fetch(`${this.metricsEndpoint}/export/json`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch metrics JSON:', error);
      return {
        format: 'json',
        metrics: [],
        timestamp: Date.now()
      };
    }
  }

  // Create custom metric on server
  async createCustomMetric(name: string, type: MetricType, help: string, labelNames?: string[]): Promise<void> {
    try {
      await fetch(`${this.metricsEndpoint}/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, help, labelNames })
      });
    } catch (error) {
      console.error('Failed to create custom metric:', error);
    }
  }

  // Cache metrics locally for offline support
  cacheMetric(key: string, value: any): void {
    this.metricsCache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  // Get cached metrics
  getCachedMetrics(): Map<string, any> {
    return this.metricsCache;
  }

  // Clear cached metrics
  clearCache(): void {
    this.metricsCache.clear();
  }

  // Batch send cached metrics when online
  async syncCachedMetrics(): Promise<void> {
    if (this.metricsCache.size === 0) return;

    try {
      const metrics = Array.from(this.metricsCache.entries()).map(([key, data]) => ({
        key,
        ...data
      }));

      await fetch(`${this.metricsEndpoint}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics })
      });

      this.clearCache();
    } catch (error) {
      console.error('Failed to sync cached metrics:', error);
    }
  }
}

// Export singleton instance
export const prometheusClient = PrometheusClient.getInstance();