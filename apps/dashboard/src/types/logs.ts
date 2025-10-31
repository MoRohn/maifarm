export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  message: string
  source: LogSource
  metadata: LogMetadata
  traceId?: string
  spanId?: string
}

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

export interface LogSource {
  service: string
  host: string
  pod?: string
  container?: string
  file?: string
  line?: number
}

export interface LogMetadata {
  farmId?: string
  agentId?: string
  userId?: string
  sessionId?: string
  requestId?: string
  [key: string]: any
}

export interface LogQuery {
  query: string
  timeRange: LogTimeRange
  level?: LogLevel[]
  sources?: string[]
  limit?: number
  offset?: number
  sort?: 'asc' | 'desc'
}

export interface LogTimeRange {
  from: number | string
  to: number | string
}

export interface LogSearchResult {
  logs: LogEntry[]
  total: number
  took: number
  aggregations?: LogAggregations
}

export interface LogAggregations {
  levels: Array<{
    level: LogLevel
    count: number
  }>
  sources: Array<{
    source: string
    count: number
  }>
  timeline: Array<{
    timestamp: number
    count: number
  }>
  topErrors?: Array<{
    message: string
    count: number
  }>
}

export interface LogStream {
  id: string
  query: LogQuery
  status: StreamStatus
  connectedAt: number
  lastEventAt?: number
}

export enum StreamStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

export interface LogFilter {
  field: string
  operator: FilterOperator
  value: string | number | boolean
}

export enum FilterOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'ne',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  REGEX = 'regex',
  IN = 'in',
  NOT_IN = 'not_in',
  EXISTS = 'exists',
  NOT_EXISTS = 'not_exists'
}

export interface LogPattern {
  id: string
  name: string
  pattern: string
  description?: string
  examples: string[]
  fields: PatternField[]
  createdAt: number
  updatedAt: number
}

export interface PatternField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'timestamp'
  format?: string
  required: boolean
}

export interface LogIndex {
  name: string
  size: number
  documentCount: number
  health: IndexHealth
  createdAt: number
  settings: IndexSettings
}

export enum IndexHealth {
  GREEN = 'green',
  YELLOW = 'yellow',
  RED = 'red'
}

export interface IndexSettings {
  numberOfShards: number
  numberOfReplicas: number
  refreshInterval: string
  maxResultWindow: number
  mappings: Record<string, any>
}

export interface LogRetentionPolicy {
  id: string
  name: string
  duration: number
  level?: LogLevel[]
  sources?: string[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface LogExport {
  format: 'json' | 'csv' | 'txt'
  query: LogQuery
  includeMetadata: boolean
  compress: boolean
}

export interface LogStatistics {
  totalLogs: number
  logRate: number
  errorRate: number
  warningRate: number
  averageResponseTime: number
  topSources: Array<{
    source: string
    count: number
    errorRate: number
  }>
  topErrors: Array<{
    message: string
    count: number
    firstSeen: number
    lastSeen: number
  }>
  volumeByLevel: Record<LogLevel, number>
  volumeOverTime: Array<{
    timestamp: number
    volume: number
  }>
}

export interface LogAnalysis {
  anomalies: LogAnomaly[]
  patterns: DetectedPattern[]
  correlations: LogCorrelation[]
  insights: LogInsight[]
}

export interface LogAnomaly {
  id: string
  type: 'spike' | 'drop' | 'pattern'
  severity: 'low' | 'medium' | 'high'
  description: string
  timestamp: number
  affectedLogs: number
  confidence: number
}

export interface DetectedPattern {
  pattern: string
  count: number
  percentage: number
  trend: 'increasing' | 'decreasing' | 'stable'
  examples: string[]
}

export interface LogCorrelation {
  fields: string[]
  correlation: number
  significance: number
  examples: LogEntry[]
}

export interface LogInsight {
  type: 'recommendation' | 'warning' | 'info'
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
  suggestedAction?: string
}

export interface LogVisualization {
  type: 'timeline' | 'heatmap' | 'distribution' | 'flow'
  data: any
  config: Record<string, any>
}

export interface ElasticsearchConfig {
  nodes: string[]
  auth?: {
    username: string
    password: string
  }
  ssl?: {
    ca?: string
    rejectUnauthorized?: boolean
  }
  indices: {
    logs: string
    metrics: string
    traces: string
  }
}