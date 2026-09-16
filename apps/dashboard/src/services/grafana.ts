import axios, { AxiosInstance } from 'axios';
import { 
  GrafanaDashboard, 
  GrafanaPanel, 
  GrafanaTarget,
  TimeSeries,
  MetricQuery
} from '@/types/metrics';

export interface GrafanaConfig {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

export class GrafanaService {
  private client: AxiosInstance;
  private config: GrafanaConfig;

  constructor(config: GrafanaConfig) {
    this.config = config;
    
    const authHeader = config.apiKey 
      ? { 'Authorization': `Bearer ${config.apiKey}` }
      : config.username && config.password
      ? { 'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`) }
      : {};

    this.client = axios.create({
      baseURL: config.url,
      headers: {
        'Content-Type': 'application/json',
        ...authHeader
      }
    });
  }

  // Create or update dashboard
  async upsertDashboard(dashboard: GrafanaDashboard): Promise<string> {
    const response = await this.client.post('/api/dashboards/db', {
      dashboard,
      overwrite: true,
      message: 'Updated by MaiFarm monitoring system'
    });
    
    return response.data.uid;
  }

  // Get dashboard by UID
  async getDashboard(uid: string): Promise<GrafanaDashboard> {
    const response = await this.client.get(`/api/dashboards/uid/${uid}`);
    return response.data.dashboard;
  }

  // Delete dashboard
  async deleteDashboard(uid: string): Promise<void> {
    await this.client.delete(`/api/dashboards/uid/${uid}`);
  }

  // Query Prometheus datasource
  async queryPrometheus(query: MetricQuery): Promise<TimeSeries[]> {
    const { metric, labels, timeRange, aggregation } = query;
    
    // Build Prometheus query
    let promQL = metric;
    if (labels && Object.keys(labels).length > 0) {
      const labelFilters = Object.entries(labels)
        .map(([key, value]) => `${key}="${value}"`)
        .join(',');
      promQL = `${metric}{${labelFilters}}`;
    }
    
    if (aggregation) {
      promQL = `${aggregation}(${promQL})`;
    }
    
    const response = await this.client.post('/api/ds/query', {
      queries: [{
        refId: 'A',
        expr: promQL,
        intervalMs: query.timeRange.step || 60000,
        maxDataPoints: 1000
      }],
      from: timeRange.start.toString(),
      to: timeRange.end.toString()
    });
    
    return this.parseQueryResponse(response.data);
  }

  // Create annotation
  async createAnnotation(text: string, tags: string[], time?: number): Promise<number> {
    const response = await this.client.post('/api/annotations', {
      text,
      tags,
      time: time || Date.now()
    });
    
    return response.data.id;
  }

  // Get annotations
  async getAnnotations(from: number, to: number, tags?: string[]): Promise<any[]> {
    const params: any = { from, to };
    if (tags && tags.length > 0) {
      params.tags = tags.join(',');
    }
    
    const response = await this.client.get('/api/annotations', { params });
    return response.data;
  }

  // Create alert rule
  async createAlertRule(rule: any): Promise<string> {
    const response = await this.client.post('/api/v1/provisioning/alert-rules', rule);
    return response.data.uid;
  }

  // Get alert rules
  async getAlertRules(): Promise<any[]> {
    const response = await this.client.get('/api/v1/provisioning/alert-rules');
    return response.data;
  }

  // Create notification channel
  async createNotificationChannel(channel: any): Promise<number> {
    const response = await this.client.post('/api/alert-notifications', channel);
    return response.data.id;
  }

  // Test notification channel
  async testNotificationChannel(channel: any): Promise<boolean> {
    const response = await this.client.post('/api/alert-notifications/test', channel);
    return response.data.success;
  }

  // Create MaiFarm default dashboard
  async createMaiFarmDashboard(): Promise<string> {
    const dashboard: GrafanaDashboard = {
      id: 'maifarm-main',
      title: 'MaiFarm Production Monitoring',
      panels: [
        this.createSystemOverviewPanel(1),
        this.createAgentPerformancePanel(2),
        this.createFarmResourcePanel(3),
        this.createErrorRatePanel(4),
        this.createWebSocketPanel(5),
        this.createAPIPerformancePanel(6),
        this.createAlertPanel(7),
        this.createSLACompliancePanel(8)
      ],
      templating: [
        {
          name: 'farm_id',
          query: 'label_values(maifarm_farm_active_agents, farm_id)',
          current: 'all',
          options: ['all']
        },
        {
          name: 'agent_id',
          query: 'label_values(maifarm_agent_resource_usage, agent_id)',
          current: 'all',
          options: ['all']
        }
      ],
      time: {
        from: Date.now() - 3600000, // Last hour
        to: Date.now()
      },
      refresh: '10s'
    };
    
    return this.upsertDashboard(dashboard);
  }

  // Panel creation helpers
  private createSystemOverviewPanel(id: number): GrafanaPanel {
    return {
      id,
      title: 'System Overview',
      type: 'stat',
      targets: [
        {
          expr: 'up{job="maifarm"}',
          refId: 'A',
          legendFormat: 'System Status'
        }
      ],
      gridPos: { x: 0, y: 0, w: 6, h: 4 }
    };
  }

  private createAgentPerformancePanel(id: number): GrafanaPanel {
    return {
      id,
      title: 'Agent Performance',
      type: 'graph',
      targets: [
        {
          expr: 'avg(maifarm_agent_resource_usage{resource_type="cpu"}) by (agent_id)',
          refId: 'A',
          legendFormat: 'CPU - {{agent_id}}'
        },
        {
          expr: 'avg(maifarm_agent_resource_usage{resource_type="memory"}) by (agent_id)',
          refId: 'B',
          legendFormat: 'Memory - {{agent_id}}'
        }
      ],
      gridPos: { x: 6, y: 0, w: 12, h: 8 }
    };
  }

  private createFarmResourcePanel(id: number): GrafanaPanel {
    return {
      id,
      title: 'Farm Resource Utilization',
      type: 'heatmap',
      targets: [
        {
          expr: 'maifarm_farm_active_agents',
          refId: 'A'
        }
      ],
      gridPos: { x: 18, y: 0, w: 6, h: 8 }
    };
  }

  private createErrorRatePanel(id: number): GrafanaPanel {
    return {
      id,
      title: 'Error Rate',
      type: 'graph',
      targets: [
        {
          expr: 'rate(maifarm_system_errors_total[5m])',
          refId: 'A',
          legendFormat: '{{error_type}} - {{severity}}'
        }
      ],
      gridPos: { x: 0, y: 4, w: 6, h: 4 }
    };
  }

  private createWebSocketPanel(id: number): GrafanaPanel {
    return {
      id,
      title: 'WebSocket Connections',
      type: 'gauge',
      targets: [
        {
          expr: 'maifarm_websocket_connections',
          refId: 'A'
        }
      ],
      gridPos: { x: 0, y: 8, w: 6, h: 4 }
    };
  }

  private createAPIPerformancePanel(id: number): GrafanaPanel {
    return {
      id,
      title: 'API Performance',
      type: 'table',
      targets: [
        {
          expr: 'histogram_quantile(0.95, maifarm_http_request_duration_seconds_bucket)',
          refId: 'A',
          legendFormat: 'P95 - {{method}} {{route}}'
        }
      ],
      gridPos: { x: 6, y: 8, w: 12, h: 4 }
    };
  }

  private createAlertPanel(id: number): GrafanaPanel {
    return {
      id,
      title: 'Active Alerts',
      type: 'table',
      targets: [
        {
          expr: 'ALERTS{alertstate="firing"}',
          refId: 'A'
        }
      ],
      gridPos: { x: 18, y: 8, w: 6, h: 4 }
    };
  }

  private createSLACompliancePanel(id: number): GrafanaPanel {
    return {
      id,
      title: 'SLA Compliance',
      type: 'stat',
      targets: [
        {
          expr: '(1 - (rate(maifarm_http_request_duration_seconds_count{status=~"5.."}[5m]) / rate(maifarm_http_request_duration_seconds_count[5m]))) * 100',
          refId: 'A',
          legendFormat: 'Availability %'
        }
      ],
      gridPos: { x: 0, y: 12, w: 24, h: 4 }
    };
  }

  // Parse query response
  private parseQueryResponse(data: any): TimeSeries[] {
    const results: TimeSeries[] = [];
    
    if (data.results && data.results.A) {
      const frames = data.results.A.frames || [];
      
      frames.forEach((frame: any) => {
        if (frame.data && frame.data.values) {
          const timeField = frame.data.values[0];
          const valueField = frame.data.values[1];
          
          const series: TimeSeries = {
            metric: frame.schema.name || 'unknown',
            labels: frame.schema.labels || {},
            points: timeField.map((time: number, idx: number) => ({
              timestamp: time,
              value: valueField[idx]
            }))
          };
          
          results.push(series);
        }
      });
    }
    
    return results;
  }

  // Create folder
  async createFolder(title: string): Promise<string> {
    const response = await this.client.post('/api/folders', { title });
    return response.data.uid;
  }

  // Get datasources
  async getDatasources(): Promise<any[]> {
    const response = await this.client.get('/api/datasources');
    return response.data;
  }

  // Create Prometheus datasource
  async createPrometheusDatasource(name: string, url: string): Promise<number> {
    const response = await this.client.post('/api/datasources', {
      name,
      type: 'prometheus',
      url,
      access: 'proxy',
      isDefault: true
    });
    
    return response.data.id;
  }
}

// Factory function
export function createGrafanaService(config: GrafanaConfig): GrafanaService {
  return new GrafanaService(config);
}