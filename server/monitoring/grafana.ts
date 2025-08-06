import axios from 'axios';
import { metricsRegistry } from './metricsCollector';

export interface GrafanaDashboard {
  uid: string;
  title: string;
  tags: string[];
  panels: GrafanaPanel[];
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: 'graph' | 'gauge' | 'stat' | 'table' | 'heatmap';
  gridPos: { x: number; y: number; w: number; h: number };
  targets: GrafanaTarget[];
}

export interface GrafanaTarget {
  expr: string;
  legendFormat?: string;
  refId: string;
}

export class GrafanaService {
  private apiUrl: string;
  private apiKey: string;
  private organizationId: string;

  constructor(config: {
    apiUrl: string;
    apiKey: string;
    organizationId?: string;
  }) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.organizationId = config.organizationId || '1';
  }

  // Create MaiFarm monitoring dashboard
  async createMaiFarmDashboard(): Promise<void> {
    const dashboard: GrafanaDashboard = {
      uid: 'maifarm-overview',
      title: 'MaiFarm Overview',
      tags: ['maifarm', 'monitoring', 'production'],
      panels: [
        // Farm metrics row
        {
          id: 1,
          title: 'Active Farms',
          type: 'stat',
          gridPos: { x: 0, y: 0, w: 6, h: 4 },
          targets: [{
            expr: 'sum(maifarm_active_farms)',
            refId: 'A'
          }]
        },
        {
          id: 2,
          title: 'Active Agents',
          type: 'stat',
          gridPos: { x: 6, y: 0, w: 6, h: 4 },
          targets: [{
            expr: 'sum(maifarm_active_agents)',
            refId: 'A'
          }]
        },
        {
          id: 3,
          title: 'Tasks Completed (24h)',
          type: 'stat',
          gridPos: { x: 12, y: 0, w: 6, h: 4 },
          targets: [{
            expr: 'sum(increase(maifarm_tasks_completed_total[24h]))',
            refId: 'A'
          }]
        },
        {
          id: 4,
          title: 'Connected Clients',
          type: 'stat',
          gridPos: { x: 18, y: 0, w: 6, h: 4 },
          targets: [{
            expr: 'maifarm_connected_clients',
            refId: 'A'
          }]
        },
        // System resources
        {
          id: 5,
          title: 'System Resources',
          type: 'graph',
          gridPos: { x: 0, y: 4, w: 12, h: 8 },
          targets: [
            {
              expr: 'maifarm_system_resources{resource_type="cpu"}',
              legendFormat: 'CPU %',
              refId: 'A'
            },
            {
              expr: 'maifarm_system_resources{resource_type="memory"}',
              legendFormat: 'Memory %',
              refId: 'B'
            },
            {
              expr: 'maifarm_system_resources{resource_type="disk"}',
              legendFormat: 'Disk %',
              refId: 'C'
            }
          ]
        },
        // Farm efficiency heatmap
        {
          id: 6,
          title: 'Farm Efficiency',
          type: 'heatmap',
          gridPos: { x: 12, y: 4, w: 12, h: 8 },
          targets: [{
            expr: 'maifarm_farm_efficiency_percent',
            refId: 'A'
          }]
        },
        // API performance
        {
          id: 7,
          title: 'API Response Time',
          type: 'graph',
          gridPos: { x: 0, y: 12, w: 12, h: 8 },
          targets: [{
            expr: 'histogram_quantile(0.95, sum(rate(maifarm_api_response_time_seconds_bucket[5m])) by (le))',
            legendFormat: '95th percentile',
            refId: 'A'
          }]
        },
        // Task duration
        {
          id: 8,
          title: 'Task Duration Distribution',
          type: 'graph',
          gridPos: { x: 12, y: 12, w: 12, h: 8 },
          targets: [
            {
              expr: 'histogram_quantile(0.5, sum(rate(maifarm_task_duration_seconds_bucket[5m])) by (le))',
              legendFormat: 'p50',
              refId: 'A'
            },
            {
              expr: 'histogram_quantile(0.95, sum(rate(maifarm_task_duration_seconds_bucket[5m])) by (le))',
              legendFormat: 'p95',
              refId: 'B'
            },
            {
              expr: 'histogram_quantile(0.99, sum(rate(maifarm_task_duration_seconds_bucket[5m])) by (le))',
              legendFormat: 'p99',
              refId: 'C'
            }
          ]
        },
        // Farm lifecycle
        {
          id: 9,
          title: 'Farm Creation Rate',
          type: 'graph',
          gridPos: { x: 0, y: 20, w: 12, h: 8 },
          targets: [{
            expr: 'sum(rate(maifarm_farms_created_total[5m])) by (type)',
            legendFormat: '{{type}}',
            refId: 'A'
          }]
        },
        // WebSocket activity
        {
          id: 10,
          title: 'WebSocket Events',
          type: 'graph',
          gridPos: { x: 12, y: 20, w: 12, h: 8 },
          targets: [{
            expr: 'sum(rate(maifarm_websocket_events_total[5m])) by (event_type)',
            legendFormat: '{{event_type}}',
            refId: 'A'
          }]
        }
      ]
    };

    await this.createDashboard(dashboard);
  }

  // Create agent performance dashboard
  async createAgentPerformanceDashboard(): Promise<void> {
    const dashboard: GrafanaDashboard = {
      uid: 'maifarm-agents',
      title: 'MaiFarm Agent Performance',
      tags: ['maifarm', 'agents', 'performance'],
      panels: [
        {
          id: 1,
          title: 'Agent Performance Scores',
          type: 'table',
          gridPos: { x: 0, y: 0, w: 24, h: 8 },
          targets: [{
            expr: 'maifarm_agent_performance_score',
            refId: 'A'
          }]
        },
        {
          id: 2,
          title: 'Agent Spawn Rate',
          type: 'graph',
          gridPos: { x: 0, y: 8, w: 12, h: 8 },
          targets: [{
            expr: 'sum(rate(maifarm_agents_spawned_total[5m])) by (agent_type)',
            legendFormat: '{{agent_type}}',
            refId: 'A'
          }]
        },
        {
          id: 3,
          title: 'Task Completion by Agent',
          type: 'graph',
          gridPos: { x: 12, y: 8, w: 12, h: 8 },
          targets: [{
            expr: 'sum(rate(maifarm_tasks_completed_total{status="success"}[5m])) by (agent_id)',
            legendFormat: '{{agent_id}}',
            refId: 'A'
          }]
        }
      ]
    };

    await this.createDashboard(dashboard);
  }

  // Create infrastructure dashboard
  async createInfrastructureDashboard(): Promise<void> {
    const dashboard: GrafanaDashboard = {
      uid: 'maifarm-infra',
      title: 'MaiFarm Infrastructure',
      tags: ['maifarm', 'infrastructure', 'system'],
      panels: [
        {
          id: 1,
          title: 'CPU Usage',
          type: 'gauge',
          gridPos: { x: 0, y: 0, w: 6, h: 8 },
          targets: [{
            expr: 'rate(process_cpu_seconds_total[5m]) * 100',
            refId: 'A'
          }]
        },
        {
          id: 2,
          title: 'Memory Usage',
          type: 'gauge',
          gridPos: { x: 6, y: 0, w: 6, h: 8 },
          targets: [{
            expr: 'process_resident_memory_bytes / 1024 / 1024',
            refId: 'A'
          }]
        },
        {
          id: 3,
          title: 'API Request Rate',
          type: 'graph',
          gridPos: { x: 12, y: 0, w: 12, h: 8 },
          targets: [{
            expr: 'sum(rate(maifarm_api_requests_total[5m])) by (status_code)',
            legendFormat: '{{status_code}}',
            refId: 'A'
          }]
        },
        {
          id: 4,
          title: 'WebSocket Message Size',
          type: 'graph',
          gridPos: { x: 0, y: 8, w: 24, h: 8 },
          targets: [{
            expr: 'histogram_quantile(0.95, sum(rate(maifarm_websocket_message_size_bytes_bucket[5m])) by (le))',
            legendFormat: 'p95 message size',
            refId: 'A'
          }]
        }
      ]
    };

    await this.createDashboard(dashboard);
  }

  // Generic dashboard creation
  private async createDashboard(dashboard: GrafanaDashboard): Promise<void> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/api/dashboards/db`,
        {
          dashboard: {
            ...dashboard,
            schemaVersion: 16,
            version: 0,
            timezone: 'browser',
            refresh: '10s',
            time: {
              from: 'now-6h',
              to: 'now'
            }
          },
          overwrite: true
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Grafana-Org-Id': this.organizationId
          }
        }
      );

      console.log(`Dashboard created: ${dashboard.title}`, response.data);
    } catch (error) {
      console.error(`Failed to create dashboard ${dashboard.title}:`, error);
      throw error;
    }
  }

  // Create datasource for Prometheus
  async createPrometheusDataSource(prometheusUrl: string): Promise<void> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/api/datasources`,
        {
          name: 'MaiFarm Prometheus',
          type: 'prometheus',
          url: prometheusUrl,
          access: 'proxy',
          isDefault: true,
          jsonData: {
            httpMethod: 'POST',
            scrapeInterval: '15s'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Grafana-Org-Id': this.organizationId
          }
        }
      );

      console.log('Prometheus datasource created:', response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        console.log('Prometheus datasource already exists');
      } else {
        console.error('Failed to create Prometheus datasource:', error);
        throw error;
      }
    }
  }

  // Create alert rules
  async createAlertRules(): Promise<void> {
    const alertRules = [
      {
        uid: 'high-cpu-alert',
        title: 'High CPU Usage',
        condition: 'A',
        data: [{
          refId: 'A',
          model: {
            expr: 'rate(process_cpu_seconds_total[5m]) * 100 > 80',
            intervalMs: 1000,
            maxDataPoints: 43200,
            refId: 'A'
          }
        }],
        noDataState: 'NoData',
        execErrState: 'Alerting',
        for: '5m',
        annotations: {
          description: 'CPU usage has been above 80% for 5 minutes',
          runbook_url: '',
          summary: 'High CPU usage detected'
        },
        labels: {
          severity: 'warning'
        }
      },
      {
        uid: 'high-memory-alert',
        title: 'High Memory Usage',
        condition: 'A',
        data: [{
          refId: 'A',
          model: {
            expr: 'process_resident_memory_bytes / 1024 / 1024 / 1024 > 8',
            intervalMs: 1000,
            maxDataPoints: 43200,
            refId: 'A'
          }
        }],
        noDataState: 'NoData',
        execErrState: 'Alerting',
        for: '5m',
        annotations: {
          description: 'Memory usage has been above 8GB for 5 minutes',
          runbook_url: '',
          summary: 'High memory usage detected'
        },
        labels: {
          severity: 'warning'
        }
      },
      {
        uid: 'farm-failure-alert',
        title: 'High Farm Failure Rate',
        condition: 'A',
        data: [{
          refId: 'A',
          model: {
            expr: 'sum(rate(maifarm_tasks_completed_total{status="failed"}[5m])) / sum(rate(maifarm_tasks_completed_total[5m])) > 0.2',
            intervalMs: 1000,
            maxDataPoints: 43200,
            refId: 'A'
          }
        }],
        noDataState: 'NoData',
        execErrState: 'Alerting',
        for: '10m',
        annotations: {
          description: 'Farm failure rate has been above 20% for 10 minutes',
          runbook_url: '',
          summary: 'High farm failure rate detected'
        },
        labels: {
          severity: 'critical'
        }
      }
    ];

    for (const rule of alertRules) {
      try {
        await axios.post(
          `${this.apiUrl}/api/v1/provisioning/alert-rules`,
          rule,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'X-Grafana-Org-Id': this.organizationId
            }
          }
        );
        console.log(`Alert rule created: ${rule.title}`);
      } catch (error) {
        console.error(`Failed to create alert rule ${rule.title}:`, error);
      }
    }
  }

  // Initialize all dashboards and alerts
  async initialize(prometheusUrl: string): Promise<void> {
    console.log('Initializing Grafana integration...');
    
    // Create datasource
    await this.createPrometheusDataSource(prometheusUrl);
    
    // Create dashboards
    await this.createMaiFarmDashboard();
    await this.createAgentPerformanceDashboard();
    await this.createInfrastructureDashboard();
    
    // Create alert rules
    await this.createAlertRules();
    
    console.log('Grafana integration initialized successfully');
  }
}

// Export singleton instance
export const grafanaService = new GrafanaService({
  apiUrl: process.env.GRAFANA_URL || 'http://localhost:3000',
  apiKey: process.env.GRAFANA_API_KEY || '',
  organizationId: process.env.GRAFANA_ORG_ID || '1'
});