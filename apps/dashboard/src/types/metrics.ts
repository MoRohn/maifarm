/**
 * Unified Metrics Type Definitions
 * Single source of truth for all metric types and interfaces
 */

/**
 * Standard metric value type - always a number
 */
export type MetricValue = number;

/**
 * File categories for generated files
 */
export enum FileCategory {
  TEXT = 'text',      // .txt, .md, .log, .csv
  CODE = 'code',      // .js, .ts, .py, .java, .cpp, etc.
  IMAGE = 'image',    // .png, .jpg, .svg, .gif
  DATA = 'data',      // .json, .xml, .sql, .db
  CONFIG = 'config',  // .yml, .yaml, .toml, .ini, .env
  OTHER = 'other'     // Everything else
}

/**
 * Helper function to categorize a file by its extension
 */
export function categorizeFile(filename: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // Text files
  if (['txt', 'md', 'log', 'csv', 'doc', 'docx', 'pdf'].includes(ext)) {
    return FileCategory.TEXT;
  }
  
  // Code files
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rb', 'go', 'rs', 'swift', 'php', 'html', 'css', 'scss', 'sass'].includes(ext)) {
    return FileCategory.CODE;
  }
  
  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'ico', 'webp'].includes(ext)) {
    return FileCategory.IMAGE;
  }
  
  // Data files
  if (['json', 'xml', 'sql', 'db', 'sqlite', 'parquet', 'arrow'].includes(ext)) {
    return FileCategory.DATA;
  }
  
  // Config files
  if (['yml', 'yaml', 'toml', 'ini', 'env', 'conf', 'config', 'properties'].includes(ext)) {
    return FileCategory.CONFIG;
  }
  
  return FileCategory.OTHER;
}

/**
 * Metric names enum for consistency
 */
export enum MetricName {
  // Farm metrics
  TOTAL_FARMS = 'total_farms',
  ACTIVE_FARMS = 'active_farms',
  STOPPED_FARMS = 'stopped_farms',
  FAILED_FARMS = 'failed_farms',
  
  // Agent metrics  
  TOTAL_AGENTS = 'total_agents',
  ACTIVE_AGENTS = 'active_agents',
  IDLE_AGENTS = 'idle_agents',
  UNIQUE_AGENTS = 'unique_agents',
  
  // File generation metrics
  TOTAL_FILES = 'total_files',
  FILES_GENERATED = 'files_generated',
  FILES_FAILED = 'files_failed',
  FILES_PENDING = 'files_pending',
  YIELDED_ITEMS = 'yielded_items',
  
  // File categories
  FILES_TEXT = 'files_text',
  FILES_CODE = 'files_code',
  FILES_IMAGE = 'files_image',
  FILES_DATA = 'files_data',
  FILES_CONFIG = 'files_config',
  FILES_OTHER = 'files_other',
  
  // Resource metrics
  CPU_USAGE = 'cpu_usage',
  MEMORY_USAGE = 'memory_usage',
  GPU_USAGE = 'gpu_usage',
  DISK_USAGE = 'disk_usage',
  NETWORK_USAGE = 'network_usage',
  
  // Performance metrics
  AVG_RESPONSE_TIME = 'avg_response_time',
  THROUGHPUT = 'throughput',
  ERROR_RATE = 'error_rate',
  UPTIME = 'uptime',
  
  // Cost metrics
  TOTAL_COST = 'total_cost',
  API_COST = 'api_cost',
  COMPUTE_COST = 'compute_cost',
  STORAGE_COST = 'storage_cost'
}

/**
 * Standard metric labels for UI display
 */
export const MetricLabels: Record<MetricName, string> = {
  [MetricName.TOTAL_FARMS]: 'Total Farms',
  [MetricName.ACTIVE_FARMS]: 'Live Farms',
  [MetricName.STOPPED_FARMS]: 'Stopped Farms',
  [MetricName.FAILED_FARMS]: 'Failed Farms',
  
  [MetricName.TOTAL_AGENTS]: 'Total Agents',
  [MetricName.ACTIVE_AGENTS]: 'Agents Working',
  [MetricName.IDLE_AGENTS]: 'Idle Agents',
  [MetricName.UNIQUE_AGENTS]: 'Unique Agents',
  
  [MetricName.TOTAL_FILES]: 'Total Files',
  [MetricName.FILES_GENERATED]: 'Files Generated',
  [MetricName.FILES_FAILED]: 'Files Failed',
  [MetricName.FILES_PENDING]: 'Files Pending',
  [MetricName.YIELDED_ITEMS]: 'Yielded Items',
  
  [MetricName.FILES_TEXT]: 'Text Files',
  [MetricName.FILES_CODE]: 'Code Files',
  [MetricName.FILES_IMAGE]: 'Image Files',
  [MetricName.FILES_DATA]: 'Data Files',
  [MetricName.FILES_CONFIG]: 'Config Files',
  [MetricName.FILES_OTHER]: 'Other Files',
  
  [MetricName.CPU_USAGE]: 'CPU Usage',
  [MetricName.MEMORY_USAGE]: 'Memory Usage',
  [MetricName.GPU_USAGE]: 'GPU Usage',
  [MetricName.DISK_USAGE]: 'Disk Usage',
  [MetricName.NETWORK_USAGE]: 'Network Usage',
  
  [MetricName.AVG_RESPONSE_TIME]: 'Avg Response Time',
  [MetricName.THROUGHPUT]: 'Throughput',
  [MetricName.ERROR_RATE]: 'Error Rate',
  [MetricName.UPTIME]: 'Uptime',
  
  [MetricName.TOTAL_COST]: 'Total Cost',
  [MetricName.API_COST]: 'API Cost',
  [MetricName.COMPUTE_COST]: 'Compute Cost',
  [MetricName.STORAGE_COST]: 'Storage Cost'
};

/**
 * Metric units for display
 */
export enum MetricUnit {
  COUNT = 'count',
  PERCENTAGE = 'percentage',
  MILLISECONDS = 'ms',
  SECONDS = 's',
  BYTES = 'bytes',
  KILOBYTES = 'KB',
  MEGABYTES = 'MB',
  GIGABYTES = 'GB',
  DOLLARS = 'USD',
  REQUESTS_PER_SECOND = 'req/s'
}

/**
 * Core metrics interface - all values are numbers
 */
export interface CoreMetrics {
  // Farm metrics
  totalFarms: MetricValue;
  activeFarms: MetricValue;
  stoppedFarms: MetricValue;
  failedFarms: MetricValue;
  
  // Agent metrics (deduplicated)
  totalAgents: MetricValue;
  activeAgents: MetricValue;
  idleAgents: MetricValue;
  uniqueAgents: MetricValue; // Count of unique agent IDs
  
  // File generation metrics (new)
  totalFiles: MetricValue;
  filesGenerated: MetricValue;
  filesFailed: MetricValue;
  filesPending: MetricValue;
  yieldedItems: MetricValue; // Total yielded items from all harvests
  
  // File categorization
  filesText: MetricValue;
  filesCode: MetricValue;
  filesImage: MetricValue;
  filesData: MetricValue;
  filesConfig: MetricValue;
  filesOther: MetricValue;
  
  // Harvest metrics
  totalHarvests: MetricValue;
  completedHarvests: MetricValue;
  failedHarvests: MetricValue;
  pendingHarvests: MetricValue;
  
  // Legacy task metrics (kept for backward compatibility, maps to harvest metrics)
  totalTasks: MetricValue;
  completedTasks: MetricValue;
  failedTasks: MetricValue;
  pendingTasks: MetricValue;
  
  // Resource metrics (percentages 0-100)
  cpuUsage: MetricValue;
  memoryUsage: MetricValue;
  gpuUsage: MetricValue;
  diskUsage: MetricValue;
  networkUsage: MetricValue;
  
  // Performance metrics
  avgResponseTime: MetricValue; // in milliseconds
  throughput: MetricValue; // requests per second
  errorRate: MetricValue; // percentage (0-100)
  uptime: MetricValue; // percentage (0-100)
  
  // Cost metrics (in dollars)
  totalCost: MetricValue;
  apiCost: MetricValue;
  computeCost: MetricValue;
  storageCost: MetricValue;
}

/**
 * Extended metrics with metadata
 */
export interface ExtendedMetrics extends CoreMetrics {
  timestamp: Date;
  version: number; // For conflict resolution
  source: 'api' | 'websocket' | 'cache' | 'computed';
  isStale: boolean;
  staleSince?: Date;
  successRate?: MetricValue; // Success rate percentage (0-100)
}

// Legacy interface for backward compatibility
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

/**
 * Farm-specific metrics with unified types
 */
export interface FarmMetricsUnified {
  farmId: string;
  farmName: string;
  status: string;
  agents: MetricValue;
  activeAgents: MetricValue;
  completedTasks: MetricValue;
  failedTasks: MetricValue;
  yieldedItems: MetricValue;
  uptime: MetricValue;
  cpuUsage: MetricValue;
  memoryUsage: MetricValue;
  lastUpdated: Date;
}

/**
 * Agent-specific metrics with unified types
 */
export interface AgentMetricsUnified {
  agentId: string;
  agentName: string;
  farmId: string;
  status: string;
  tasksCompleted: MetricValue;
  tasksFailed: MetricValue;
  yieldedItems: MetricValue;
  avgResponseTime: MetricValue;
  cpuUsage: MetricValue;
  memoryUsage: MetricValue;
  lastActivity: Date;
  successRate?: MetricValue; // Success rate percentage (0-100)
}

/**
 * Time series data point
 */
export interface MetricDataPoint {
  timestamp: Date;
  value: MetricValue;
  metricName: MetricName;
}

/**
 * Time series metrics
 */
export interface TimeSeriesMetrics {
  metricName: MetricName;
  unit: MetricUnit;
  dataPoints: MetricDataPoint[];
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'last';
}

/**
 * Metric update event for WebSocket
 */
export interface MetricUpdateEvent {
  type: 'full' | 'partial' | 'delta';
  metrics: Partial<CoreMetrics>;
  timestamp: Date;
  version: number;
  source: string;
}

/**
 * Dashboard metrics interface
 */
export interface DashboardMetrics {
  overview: CoreMetrics;
  farms: FarmMetricsUnified[];
  agents: AgentMetricsUnified[];
  lastUpdated: Date;
}

/**
 * Helper to format metric values with proper units
 */
export function formatMetricValue(value: MetricValue, unit: MetricUnit): string {
  switch (unit) {
    case MetricUnit.PERCENTAGE:
      return `${value.toFixed(1)}%`;
    case MetricUnit.MILLISECONDS:
      return `${value.toFixed(0)}ms`;
    case MetricUnit.SECONDS:
      return `${value.toFixed(1)}s`;
    case MetricUnit.BYTES:
      return `${value} B`;
    case MetricUnit.KILOBYTES:
      return `${(value / 1024).toFixed(1)} KB`;
    case MetricUnit.MEGABYTES:
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    case MetricUnit.GIGABYTES:
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    case MetricUnit.DOLLARS:
      return `$${value.toFixed(2)}`;
    case MetricUnit.REQUESTS_PER_SECOND:
      return `${value.toFixed(1)} req/s`;
    case MetricUnit.COUNT:
    default:
      return value.toFixed(0);
  }
}

/**
 * Helper to get metric unit
 */
export function getMetricUnit(metricName: MetricName): MetricUnit {
  switch (metricName) {
    case MetricName.ERROR_RATE:
    case MetricName.UPTIME:
    case MetricName.CPU_USAGE:
    case MetricName.MEMORY_USAGE:
    case MetricName.GPU_USAGE:
    case MetricName.DISK_USAGE:
    case MetricName.NETWORK_USAGE:
      return MetricUnit.PERCENTAGE;
    
    case MetricName.AVG_RESPONSE_TIME:
      return MetricUnit.MILLISECONDS;
    
    case MetricName.THROUGHPUT:
      return MetricUnit.REQUESTS_PER_SECOND;
    
    case MetricName.TOTAL_COST:
    case MetricName.API_COST:
    case MetricName.COMPUTE_COST:
    case MetricName.STORAGE_COST:
      return MetricUnit.DOLLARS;
    
    default:
      return MetricUnit.COUNT;
  }
}