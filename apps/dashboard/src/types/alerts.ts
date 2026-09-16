export interface Alert {
  id: string
  name: string
  description: string
  metric: string
  condition: AlertCondition
  severity: AlertSeverity
  status: AlertStatus
  createdAt: number
  updatedAt: number
  resolvedAt?: number
  annotations: Record<string, string>
  labels: Record<string, string>
}

export interface AlertCondition {
  type: 'threshold' | 'anomaly' | 'pattern'
  operator: ComparisonOperator
  value: number | string
  duration?: number
  aggregation?: string
}

export enum ComparisonOperator {
  GREATER_THAN = '>',
  LESS_THAN = '<',
  EQUALS = '=',
  NOT_EQUALS = '!=',
  GREATER_OR_EQUAL = '>=',
  LESS_OR_EQUAL = '<=',
  REGEX_MATCH = '=~',
  REGEX_NOT_MATCH = '!~'
}

export enum AlertStatus {
  PENDING = 'pending',
  FIRING = 'firing',
  RESOLVED = 'resolved',
  SILENCED = 'silenced'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface AlertRule {
  id: string
  name: string
  query: string
  condition: AlertCondition
  severity: AlertSeverity
  for: string
  labels: Record<string, string>
  annotations: Record<string, string>
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface AlertGroup {
  name: string
  interval: string
  rules: AlertRule[]
}

export interface AlertNotification {
  id: string
  alertId: string
  channel: NotificationChannel
  status: NotificationStatus
  sentAt: number
  error?: string
}

export enum NotificationChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  PAGERDUTY = 'pagerduty',
  SMS = 'sms'
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  DELIVERED = 'delivered'
}

export interface NotificationConfig {
  channel: NotificationChannel
  enabled: boolean
  config: EmailConfig | SlackConfig | WebhookConfig | PagerDutyConfig | SMSConfig
}

export interface EmailConfig {
  recipients: string[]
  subject?: string
  template?: string
}

export interface SlackConfig {
  webhookUrl: string
  channel?: string
  username?: string
  iconEmoji?: string
}

export interface WebhookConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT'
  headers?: Record<string, string>
  template?: string
}

export interface PagerDutyConfig {
  integrationKey: string
  severity?: string
}

export interface SMSConfig {
  recipients: string[]
  provider: 'twilio' | 'aws-sns'
  credentials: Record<string, string>
}

export interface AlertHistory {
  alertId: string
  events: AlertEvent[]
}

export interface AlertEvent {
  timestamp: number
  type: AlertEventType
  message: string
  details?: Record<string, any>
}

export enum AlertEventType {
  CREATED = 'created',
  TRIGGERED = 'triggered',
  RESOLVED = 'resolved',
  ACKNOWLEDGED = 'acknowledged',
  SILENCED = 'silenced',
  ESCALATED = 'escalated',
  NOTIFIED = 'notified'
}

export interface AlertSilence {
  id: string
  matchers: AlertMatcher[]
  startsAt: number
  endsAt: number
  createdBy: string
  comment: string
  status: SilenceStatus
}

export interface AlertMatcher {
  name: string
  value: string
  isRegex: boolean
}

export enum SilenceStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  EXPIRED = 'expired'
}

export interface AlertCorrelation {
  id: string
  rootCause: string
  relatedAlerts: string[]
  confidence: number
  timestamp: number
}

export interface EscalationPolicy {
  id: string
  name: string
  levels: EscalationLevel[]
  repeatInterval?: number
  enabled: boolean
}

export interface EscalationLevel {
  level: number
  delay: number
  targets: EscalationTarget[]
}

export interface EscalationTarget {
  type: 'user' | 'team' | 'schedule'
  id: string
  channel: NotificationChannel
}

export interface AlertMetrics {
  totalAlerts: number
  activeAlerts: number
  alertsByStatus: Record<AlertStatus, number>
  alertsBySeverity: Record<AlertSeverity, number>
  mttr: number // Mean Time To Resolution
  alertRate: number
  falsePositiveRate: number
}

export interface AlertDashboard {
  activeAlerts: Alert[]
  recentAlerts: Alert[]
  metrics: AlertMetrics
  topAlertingMetrics: Array<{
    metric: string
    count: number
  }>
  alertTrends: Array<{
    timestamp: number
    count: number
    severity: AlertSeverity
  }>
}