export interface MetricDataPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface TimeSeriesData {
  label: string;
  data: MetricDataPoint[];
  unit?: string;
  color?: string;
  isDashed?: boolean;
}

export interface AgentPerformanceMetric {
  agentId: string;
  agentName: string;
  tasksCompleted: number;
  tasksInProgress: number;
  tasksFailed: number;
  averageResponseTime: number;
  successRate: number;
  lastActive: Date;
  resourceUsage: ResourceUtilization;
  costMetrics: CostBreakdown;
}

export interface ResourceUtilization {
  cpu: number;
  memory: number;
  storage: number;
  network: number;
  gpu?: number;
  timestamp: Date;
}

export interface CostBreakdown {
  total: number;
  compute: number;
  storage: number;
  network: number;
  api: number;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  currency: string;
}

export interface FarmYieldMetrics {
  averageYield: number;
  totalFilesGenerated: number;
  completedFarms: number;
  topFarm: {
    id: string;
    name: string;
    fileCount: number;
    completedAt: Date;
  } | null;
  yieldTrend: Array<{
    date: Date;
    averageYield: number;
    farmCount: number;
  }>;
  yieldByType: {
    file: number;
    report: number;
    code: number;
    documentation: number;
    data: number;
    model: number;
  };
}

export interface TaskCompletion {
  taskId: string;
  taskName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  agentId: string;
  resourcesUsed: Partial<ResourceUtilization>;
  cost?: number;
}

export interface ErrorMetric {
  errorId: string;
  timestamp: Date;
  agentId: string;
  errorType: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  resolutionTime?: number;
}

export interface PerformanceTrend {
  metric: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  forecast?: number[];
}

export interface AggregatedMetrics {
  timeRange: {
    start: Date;
    end: Date;
  };
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  inProgressTasks?: number;
  pendingTasks?: number;
  averageCompletionTime: number;
  totalCost: CostBreakdown;
  activeAgents: number;
  resourceUtilization: ResourceUtilization;
  errorRate: number;
  performanceTrends: PerformanceTrend[];
  harvestMetrics?: {
    totalYield: number;
    qualityScore: number;
    efficiency: number;
  };
  // Additional properties for MetricsOverview
  totalFarms?: number;
  activeFarms?: number;
  farmGrowth?: number;
  totalAgents?: number;
  agentUtilization?: number;
  taskSuccessRate?: number;
  avgResponseTime?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  totalErrors?: number;
  estimatedCost?: number;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap' | 'sankey' | 'network';
  data: any;
  options?: {
    title?: string;
    xAxis?: AxisConfig;
    yAxis?: AxisConfig;
    legend?: boolean;
    tooltip?: boolean;
    animation?: boolean;
    responsive?: boolean;
  };
}

export interface AxisConfig {
  label: string;
  type?: 'linear' | 'logarithmic' | 'time' | 'category';
  min?: number;
  max?: number;
  tickFormat?: (value: any) => string;
}

export interface Report {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  schedule?: ReportSchedule;
  filters: ReportFilter[];
  metrics: string[];
  visualizations: ChartConfig[];
  format: 'pdf' | 'csv' | 'excel' | 'json';
}

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  timezone: string;
  recipients: string[];
  enabled: boolean;
}

export interface ReportFilter {
  field: string;
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'between';
  value: any;
}

export interface PredictionModel {
  id: string;
  name: string;
  type: 'timeseries' | 'regression' | 'classification' | 'anomaly';
  accuracy: number;
  lastTrained: Date;
  parameters: Record<string, any>;
}

export interface Prediction {
  id: string;
  modelId?: string;
  timestamp: Date;
  metric: string;
  predictedValue: number;
  confidence: number;
  accuracy?: number;
  upperBound?: number;
  lowerBound?: number;
  horizon: number;
  trend: 'up' | 'down' | 'stable';
  seasonalityDetected?: boolean;
  forecastData?: MetricDataPoint[];
  insight?: string;
  recommendations?: string[];
}

export interface Anomaly {
  id: string;
  timestamp: Date;
  detectedAt: Date;
  metric: string;
  actualValue: number;
  expectedValue: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
  resolved: boolean;
}

export interface FarmPerformanceMetric {
  farmId: string;
  farmName: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  efficiency: number;
  throughput: number;
  uptime: number;
  errorRate: number;
  avgResponseTime: number;
  totalTasks: number;
  completedTasks: number;
  timestamp: Date;
}

export interface HarvestAnalytics {
  farmType: string;
  totalHarvests: number;
  successfulHarvests: number;
  failedHarvests: number;
  averageYield: number;
  totalValue: number;
  efficiency: number;
  timeToHarvest: number;
}

export interface ClaudeCodeMetrics {
  apiCalls: number;
  tokensUsed: number;
  costPerToken: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  modelType: string;
  timestamp: Date;
}

export interface SystemHealthMetric {
  uptime: number;
  errorRate: number;
  avgResponseTime: number;
  activeConnections: number;
  memoryUsage: number;
  cpuUsage: number;
  diskUsage: number;
  networkLatency: number;
  serviceStatus: Record<string, 'healthy' | 'degraded' | 'down'>;
}

export interface AnalyticsOverview {
  farmPerformance: FarmPerformanceMetric[];
  resourceUsage: ResourceUtilization;
  harvestAnalytics: HarvestAnalytics[];
  claudeCodeMetrics: ClaudeCodeMetrics;
  systemHealth: SystemHealthMetric;
  costBreakdown: CostBreakdown;
  agentEfficiency: AgentPerformanceMetric[];
  taskCompletionRates: TaskCompletion[];
}

export interface AnalyticsState {
  overview: AnalyticsOverview | null;
  metrics: AggregatedMetrics | null;
  timeSeriesData: TimeSeriesData[];
  agentPerformance: AgentPerformanceMetric[];
  taskCompletions: TaskCompletion[];
  farmYieldMetrics: FarmYieldMetrics | null;
  errors: ErrorMetric[];
  predictions: Prediction[];
  anomalies: Anomaly[];
  reports: Report[];
  isLoading: boolean;
  error: string | null;
  selectedTimeRange: TimeRange;
  refreshInterval: number;
  lastUpdated: Date | null;
  engineMetrics: EngineAnalyticsMetric[];
  engineCostSummary: EngineCostSummary | null;
}

export type EngineCircuitState = 'closed' | 'open' | 'half-open';

export interface EngineAnalyticsMetric {
  key: string;
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  lastError?: string;
  circuitState: EngineCircuitState;
  lastUpdated: number;
}

export interface EngineCostSummary {
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byProvider: Array<{
    provider: string;
    totalCost: number;
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    models: Array<{
      model: string;
      cost: number;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      period: string;
    }>;
  }>;
}

export interface TimeRange {
  start: Date;
  end: Date;
  preset?: '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';
}

export interface MetricUpdate {
  type: 'agent_performance' | 'task_completion' | 'resource_usage' | 'error' | 'cost';
  data: any;
  timestamp: Date;
}

export interface AnalyticsFilter {
  agents?: string[];
  metrics?: string[];
  timeRange?: TimeRange;
  aggregation?: 'min' | 'max' | 'avg' | 'sum';
  groupBy?: 'hour' | 'day' | 'week' | 'month';
}

export type InsightCategory = 'performance' | 'cost' | 'optimization' | 'anomaly';
export type InsightPriority = 'low' | 'medium' | 'high';

export interface Insight {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  description: string;
  impact?: {
    metric: string;
    value: number;
  };
  evidence?: string[];
  suggestedActions?: string[];
  generatedAt: Date;
  confidence?: number;
}

export type ReportFormat = 'pdf' | 'csv' | 'json' | 'excel';

export interface ReportSection {
  id: string;
  type: 'summary' | 'chart' | 'table' | 'insights';
  title: string;
  enabled: boolean;
  order: number;
  config?: Record<string, any>;
}
