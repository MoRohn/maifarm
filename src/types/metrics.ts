export interface Metric {
  name: string
  value: number
  timestamp: number
  labels: Record<string, string>
  type: MetricType
}

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

export interface MetricPoint {
  timestamp: number
  value: number
}

export interface TimeSeries {
  metric: string
  labels: Record<string, string>
  points: MetricPoint[]
}

export interface MetricQuery {
  metric: string
  labels?: Record<string, string>
  timeRange: TimeRange
  aggregation?: AggregationType
  groupBy?: string[]
}

export interface TimeRange {
  start: number
  end: number
  step?: number
}

export enum AggregationType {
  AVG = 'avg',
  SUM = 'sum',
  MIN = 'min',
  MAX = 'max',
  COUNT = 'count',
  P50 = 'p50',
  P90 = 'p90',
  P95 = 'p95',
  P99 = 'p99'
}

export interface AggregationResult {
  metric: string;
  aggregation: AggregationType;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface AgentMetrics {
  agentId: string
  farmId: string
  cpu: number
  memory: number
  responseTime: number
  errorRate: number
  throughput: number
  activeConnections: number
  timestamp: number
}

export interface FarmMetricsData {
  farmId: string
  totalAgents: number
  activeAgents: number
  resourceUtilization: number
  taskCompletionRate: number
  avgResponseTime: number
  errorCount: number
  throughput: number
  timestamp: number
}

export interface SystemMetrics {
  cpu: number
  memory: number
  disk: number
  network: {
    bytesIn: number
    bytesOut: number
    packetsIn: number
    packetsOut: number
  }
  websocketConnections: number
  apiRequestRate: number
  apiErrorRate: number
  queueDepth: number
  timestamp: number
}

export interface MetricThreshold {
  id: string
  metric: string
  condition: ThresholdCondition
  value: number
  duration?: number
  severity: AlertSeverity
  enabled: boolean
}

export enum ThresholdCondition {
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  EQUALS = 'eq',
  NOT_EQUALS = 'ne',
  GREATER_OR_EQUAL = 'gte',
  LESS_OR_EQUAL = 'lte'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface MetricAggregation {
  metric: string
  period: number
  aggregation: AggregationType
  value: number
  timestamp: number
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: number
  checks: HealthCheck[]
  uptime: number
  version: string
}

export interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message?: string
  duration: number
  timestamp: number
}

export interface SLATarget {
  id: string
  name: string
  target: number
  metric: string
  window: number
  enabled: boolean
}

export interface SLAStatus {
  slaId: string
  current: number
  target: number
  compliance: boolean
  timeWindow: TimeRange
  violations: SLAViolation[]
}

export interface SLAViolation {
  timestamp: number
  duration: number
  value: number
  severity: AlertSeverity
}

export interface MetricExport {
  format: 'prometheus' | 'json' | 'csv'
  metrics: Metric[]
  timestamp: number
}

export interface GrafanaDashboard {
  id: string
  title: string
  panels: GrafanaPanel[]
  templating: GrafanaTemplate[]
  time: TimeRange
  refresh: string
}

export interface GrafanaPanel {
  id: number
  title: string
  type: 'graph' | 'stat' | 'gauge' | 'table' | 'heatmap'
  targets: GrafanaTarget[]
  gridPos: {
    x: number
    y: number
    w: number
    h: number
  }
}

export interface GrafanaTarget {
  expr: string
  refId: string
  legendFormat?: string
}

export interface GrafanaTemplate {
  name: string
  query: string
  current: string
  options: string[]
}