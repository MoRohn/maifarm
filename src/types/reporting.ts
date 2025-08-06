export interface ReportSection {
  type: 'summary' | 'metrics' | 'charts' | 'table' | 'insights';
  title?: string;
  data?: any;
  options?: Record<string, any>;
}

export interface ReportTimeframe {
  start: Date;
  end: Date;
}

export interface ReportConfig {
  timeframe: ReportTimeframe;
  sections: ReportSection[];
  filters?: Record<string, any>;
  includeRawData?: boolean;
  includeCharts?: boolean;
  customOptions?: Record<string, any>;
  schedule?: {
    enabled: boolean;
    cron: string;
    recipients: string[];
  };
}

export interface Report {
  id: string;
  name: string;
  type: 'performance' | 'analytics' | 'security' | 'compliance' | 'custom';
  format: 'pdf' | 'csv' | 'json' | 'excel';
  status: 'generating' | 'ready' | 'failed' | 'scheduled';
  config: ReportConfig;
  generatedAt: Date;
  url?: string;
  error?: string;
  size?: number;
  metadata?: Record<string, any>;
}

export interface DataExport {
  id: string;
  type: 'agents' | 'farms' | 'metrics' | 'logs' | 'events';
  format: 'csv' | 'json' | 'excel';
  filters: Record<string, any>;
  createdAt: Date;
  url?: string;
  status: 'processing' | 'ready' | 'failed';
  error?: string;
}

export interface PerformanceMetrics {
  timestamp: Date;
  agentCount: number;
  activeFarms: number;
  totalTasks: number;
  completedTasks: number;
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  throughput: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
    storage: number;
    network: number;
  };
  topAgents: Array<{
    id: string;
    name: string;
    tasksCompleted: number;
    successRate: number;
  }>;
  // Additional metrics for compatibility
  taskMetrics: {
    total: number;
    completed: number;
    failed: number;
    avgDuration: number;
    throughput: number;
  };
  agentMetrics: {
    totalAgents: number;
    avgUtilization: number;
    avgResponseTime: number;
    errorRate: number;
  };
  resourceMetrics: {
    avgCpu: number;
    avgMemory: number;
    peakCpu: number;
    peakMemory: number;
  };
  costMetrics: {
    totalCost: number;
    costPerTask: number;
    costPerHour: number;
  };
}

export interface ReportSchedule {
  id: string;
  reportType: Report['type'];
  reportFormat: Report['format'];
  config: ReportConfig;
  cronExpression: string;
  enabled: boolean;
  recipients?: string[];
  lastRun?: Date;
  nextRun?: Date;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  type: Report['type'];
  defaultConfig: ReportConfig;
  customizable: boolean;
  sections: ReportSection[];
}

export interface ReportNotification {
  reportId: string;
  type: 'generated' | 'failed' | 'scheduled';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface PredictiveInsight {
  id: string;
  type: 'bottleneck' | 'anomaly' | 'optimization' | 'forecast';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  prediction: {
    metric: string;
    currentValue: number;
    predictedValue: number;
    confidence: number;
    timeframe: string;
  };
  recommendations: string[];
  impact: {
    performance?: number;
    cost?: number;
    reliability?: number;
  };
  createdAt: Date;
}

export interface AnalyticsMetric {
  id: string;
  name: string;
  category: 'performance' | 'resource' | 'reliability' | 'cost';
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  change: number;
  timestamp: Date;
}