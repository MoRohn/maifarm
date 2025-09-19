/**
 * Comprehensive Observability Service
 * Provides metrics, tracing, logging, and health monitoring
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import { performance } from 'perf_hooks';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { redis } from '../database/connection';

interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
}

interface Trace {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'started' | 'completed' | 'failed';
  tags: Record<string, any>;
  logs: Array<{ timestamp: number; message: string }>;
}

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  message?: string;
  details?: Record<string, any>;
}

interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  process: {
    uptime: number;
    pid: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
  network?: {
    connections: number;
    bytesIn: number;
    bytesOut: number;
  };
}

interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
}

export class ObservabilityService extends EventEmitter {
  private static instance: ObservabilityService;

  // Metrics storage
  private metrics: Map<string, Metric[]> = new Map();
  private metricsRetention = 3600000; // 1 hour

  // Tracing
  private traces: Map<string, Trace> = new Map();
  private activeSpans: Map<string, Trace> = new Map();

  // Health checks
  private healthChecks: Map<string, HealthCheck> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timer> = new Map();

  // Alerts
  private alerts: Map<string, Alert> = new Map();
  private alertThresholds: Map<string, any> = new Map();

  // System metrics
  private systemMetricsInterval?: NodeJS.Timer;
  private lastSystemMetrics?: SystemMetrics;

  // Network tracking
  private networkBytesIn = 0;
  private networkBytesOut = 0;
  private activeConnections = 0;

  private constructor() {
    super();
    this.initialize();
  }

  public static getInstance(): ObservabilityService {
    if (!ObservabilityService.instance) {
      ObservabilityService.instance = new ObservabilityService();
    }
    return ObservabilityService.instance;
  }

  /**
   * Initialize observability service
   */
  private initialize(): void {
    // Start system metrics collection
    this.startSystemMetricsCollection();

    // Setup default health checks
    this.setupDefaultHealthChecks();

    // Setup alert thresholds
    this.setupAlertThresholds();

    // Start metrics cleanup
    this.startMetricsCleanup();

    logger.info(LogCategory.SYSTEM, 'Observability Service initialized');
  }

  /**
   * Record a metric
   */
  public recordMetric(
    name: string,
    value: number,
    type: Metric['type'] = 'gauge',
    labels?: Record<string, string>
  ): void {
    const metric: Metric = {
      name,
      value,
      timestamp: new Date(),
      type,
      labels
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push(metric);

    // Check alert thresholds
    this.checkAlertThresholds(name, value);

    // Emit metric event
    this.emit('metric:recorded', metric);
  }

  /**
   * Increment a counter metric
   */
  public incrementCounter(name: string, value = 1, labels?: Record<string, string>): void {
    this.recordMetric(name, value, 'counter', labels);
  }

  /**
   * Record a histogram metric
   */
  public recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    this.recordMetric(name, value, 'histogram', labels);
  }

  /**
   * Start a trace span
   */
  public startSpan(
    traceId: string,
    operation: string,
    parentSpanId?: string
  ): string {
    const spanId = `${traceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const trace: Trace = {
      traceId,
      spanId,
      parentSpanId,
      operation,
      startTime: performance.now(),
      status: 'started',
      tags: {},
      logs: []
    };

    this.traces.set(spanId, trace);
    this.activeSpans.set(spanId, trace);

    return spanId;
  }

  /**
   * End a trace span
   */
  public endSpan(spanId: string, status: 'completed' | 'failed' = 'completed'): void {
    const trace = this.activeSpans.get(spanId);
    if (!trace) {
      logger.warn(LogCategory.SYSTEM, `Span ${spanId} not found`);
      return;
    }

    trace.endTime = performance.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = status;

    this.activeSpans.delete(spanId);

    // Record duration as metric
    this.recordHistogram(`trace.${trace.operation}.duration`, trace.duration, {
      status,
      traceId: trace.traceId
    });

    this.emit('span:ended', trace);
  }

  /**
   * Add tag to span
   */
  public addSpanTag(spanId: string, key: string, value: any): void {
    const trace = this.activeSpans.get(spanId) || this.traces.get(spanId);
    if (trace) {
      trace.tags[key] = value;
    }
  }

  /**
   * Add log to span
   */
  public addSpanLog(spanId: string, message: string): void {
    const trace = this.activeSpans.get(spanId) || this.traces.get(spanId);
    if (trace) {
      trace.logs.push({
        timestamp: performance.now(),
        message
      });
    }
  }

  /**
   * Register a health check
   */
  public registerHealthCheck(
    name: string,
    checkFn: () => Promise<{ healthy: boolean; message?: string; details?: any }>,
    intervalMs = 30000
  ): void {
    // Run initial check
    this.runHealthCheck(name, checkFn);

    // Schedule periodic checks
    const interval = setInterval(async () => {
      await this.runHealthCheck(name, checkFn);
    }, intervalMs);

    this.healthCheckIntervals.set(name, interval);
  }

  /**
   * Run a health check
   */
  private async runHealthCheck(
    name: string,
    checkFn: () => Promise<{ healthy: boolean; message?: string; details?: any }>
  ): Promise<void> {
    try {
      const result = await checkFn();

      const healthCheck: HealthCheck = {
        name,
        status: result.healthy ? 'healthy' : 'unhealthy',
        lastCheck: new Date(),
        message: result.message,
        details: result.details
      };

      const previousCheck = this.healthChecks.get(name);
      this.healthChecks.set(name, healthCheck);

      // Emit event if status changed
      if (previousCheck?.status !== healthCheck.status) {
        this.emit('health:changed', healthCheck);

        if (!result.healthy) {
          this.createAlert(
            'warning',
            `Health Check Failed: ${name}`,
            result.message || 'Health check failed'
          );
        }
      }
    } catch (error) {
      logger.error(LogCategory.SYSTEM, `Health check ${name} failed`, error);

      this.healthChecks.set(name, {
        name,
        status: 'unhealthy',
        lastCheck: new Date(),
        message: `Check failed: ${error.message}`
      });
    }
  }

  /**
   * Setup default health checks
   */
  private setupDefaultHealthChecks(): void {
    // Database health check
    this.registerHealthCheck('database', async () => {
      try {
        const result = await db.query('SELECT 1');
        return { healthy: true, message: 'Database is responsive' };
      } catch (error) {
        return { healthy: false, message: error.message };
      }
    });

    // Redis health check
    this.registerHealthCheck('redis', async () => {
      try {
        await redis.ping();
        return { healthy: true, message: 'Redis is responsive' };
      } catch (error) {
        return { healthy: false, message: error.message };
      }
    });

    // Memory health check
    this.registerHealthCheck('memory', async () => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const percentage = (heapUsedMB / heapTotalMB) * 100;

      return {
        healthy: percentage < 90,
        message: `Memory usage: ${Math.round(percentage)}%`,
        details: {
          heapUsed: Math.round(heapUsedMB),
          heapTotal: Math.round(heapTotalMB),
          percentage: Math.round(percentage)
        }
      };
    });

    // Disk space health check (if needed)
    this.registerHealthCheck('diskSpace', async () => {
      // This would need a proper disk space check implementation
      return { healthy: true, message: 'Disk space check not implemented' };
    });
  }

  /**
   * Start system metrics collection
   */
  private startSystemMetricsCollection(): void {
    this.systemMetricsInterval = setInterval(() => {
      const metrics = this.collectSystemMetrics();
      this.lastSystemMetrics = metrics;

      // Record as individual metrics
      this.recordMetric('system.cpu.usage', metrics.cpu.usage);
      this.recordMetric('system.memory.percentage', metrics.memory.percentage);
      this.recordMetric('system.memory.used', metrics.memory.used);
      this.recordMetric('process.uptime', metrics.process.uptime);
      this.recordMetric('process.memory.heapUsed', metrics.process.memoryUsage.heapUsed);

      this.emit('system:metrics', metrics);
    }, 10000); // Every 10 seconds
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): SystemMetrics {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);

    return {
      cpu: {
        usage: cpuUsage,
        loadAverage: os.loadavg(),
        cores: cpus.length
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        percentage: (usedMemory / totalMemory) * 100
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      },
      network: {
        connections: this.activeConnections,
        bytesIn: this.networkBytesIn,
        bytesOut: this.networkBytesOut
      }
    };
  }

  /**
   * Create an alert
   */
  public createAlert(
    severity: Alert['severity'],
    title: string,
    message: string
  ): string {
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const alert: Alert = {
      id: alertId,
      severity,
      title,
      message,
      timestamp: new Date(),
      acknowledged: false
    };

    this.alerts.set(alertId, alert);
    this.emit('alert:created', alert);

    // Log based on severity
    if (severity === 'critical') {
      logger.error(LogCategory.SYSTEM, `CRITICAL ALERT: ${title} - ${message}`);
    } else if (severity === 'warning') {
      logger.warn(LogCategory.SYSTEM, `WARNING ALERT: ${title} - ${message}`);
    } else {
      logger.info(LogCategory.SYSTEM, `INFO ALERT: ${title} - ${message}`);
    }

    return alertId;
  }

  /**
   * Setup alert thresholds
   */
  private setupAlertThresholds(): void {
    this.alertThresholds.set('system.cpu.usage', {
      warning: 70,
      critical: 90
    });

    this.alertThresholds.set('system.memory.percentage', {
      warning: 80,
      critical: 95
    });

    this.alertThresholds.set('error.rate', {
      warning: 10, // errors per minute
      critical: 50
    });

    this.alertThresholds.set('response.time.p95', {
      warning: 1000, // ms
      critical: 5000
    });
  }

  /**
   * Check alert thresholds
   */
  private checkAlertThresholds(metricName: string, value: number): void {
    const threshold = this.alertThresholds.get(metricName);
    if (!threshold) return;

    if (value >= threshold.critical) {
      this.createAlert(
        'critical',
        `Critical threshold exceeded: ${metricName}`,
        `Value ${value} exceeds critical threshold ${threshold.critical}`
      );
    } else if (value >= threshold.warning) {
      this.createAlert(
        'warning',
        `Warning threshold exceeded: ${metricName}`,
        `Value ${value} exceeds warning threshold ${threshold.warning}`
      );
    }
  }

  /**
   * Start metrics cleanup
   */
  private startMetricsCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const cutoff = now - this.metricsRetention;

      // Clean old metrics
      for (const [name, metrics] of this.metrics.entries()) {
        const filtered = metrics.filter(m => m.timestamp.getTime() > cutoff);
        if (filtered.length === 0) {
          this.metrics.delete(name);
        } else {
          this.metrics.set(name, filtered);
        }
      }

      // Clean old traces
      for (const [spanId, trace] of this.traces.entries()) {
        if (trace.endTime && trace.endTime < cutoff) {
          this.traces.delete(spanId);
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Get current health status
   */
  public getHealthStatus(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    checks: HealthCheck[];
  } {
    const checks = Array.from(this.healthChecks.values());
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyCount > 0) {
      overall = 'unhealthy';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    }

    return { overall, checks };
  }

  /**
   * Get metrics summary
   */
  public getMetricsSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [name, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;

      const values = metrics.map(m => m.value);
      summary[name] = {
        count: metrics.length,
        last: values[values.length - 1],
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    }

    return summary;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolvedAt);
  }

  /**
   * Acknowledge alert
   */
  public acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alert:acknowledged', alert);
    }
  }

  /**
   * Resolve alert
   */
  public resolveAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolvedAt = new Date();
      this.emit('alert:resolved', alert);
    }
  }

  /**
   * Update network metrics
   */
  public updateNetworkMetrics(bytesIn: number, bytesOut: number): void {
    this.networkBytesIn += bytesIn;
    this.networkBytesOut += bytesOut;
  }

  /**
   * Update active connections
   */
  public updateActiveConnections(count: number): void {
    this.activeConnections = count;
    this.recordMetric('network.connections.active', count);
  }

  /**
   * Export metrics in Prometheus format
   */
  public exportPrometheusMetrics(): string {
    const lines: string[] = [];

    for (const [name, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;

      const latest = metrics[metrics.length - 1];
      const metricName = name.replace(/\./g, '_');

      // Add help text
      lines.push(`# HELP ${metricName} ${name}`);
      lines.push(`# TYPE ${metricName} ${latest.type}`);

      // Add metric value
      if (latest.labels && Object.keys(latest.labels).length > 0) {
        const labels = Object.entries(latest.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        lines.push(`${metricName}{${labels}} ${latest.value}`);
      } else {
        lines.push(`${metricName} ${latest.value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Shutdown observability service
   */
  public shutdown(): void {
    // Clear intervals
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
    }

    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }

    // Clear data
    this.metrics.clear();
    this.traces.clear();
    this.activeSpans.clear();
    this.healthChecks.clear();
    this.alerts.clear();

    logger.info(LogCategory.SYSTEM, 'Observability Service shutdown');
  }
}

// Export singleton
export const observability = ObservabilityService.getInstance();