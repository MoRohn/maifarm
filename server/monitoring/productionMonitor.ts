/**
 * Production Monitoring System
 * Comprehensive monitoring for production deployment
 * Tracks metrics, performance, errors, and system health
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { logger, LogCategory } from '../utils/logger';
import { pool } from '../database/connection';
import { redis } from '../database/connection';
import { websocketManager } from '../websocket/websocketManager';

interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentUsed: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentUsed: number;
  };
  network: {
    rxBytes: number;
    txBytes: number;
    connections: number;
  };
  process: {
    uptime: number;
    pid: number;
    memory: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

interface ApplicationMetrics {
  timestamp: Date;
  requests: {
    total: number;
    success: number;
    errors: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  websockets: {
    connections: number;
    messages: number;
    errors: number;
  };
  database: {
    poolSize: number;
    activeConnections: number;
    waitingConnections: number;
    queryCount: number;
    avgQueryTime: number;
  };
  redis: {
    connected: boolean;
    memory: number;
    keys: number;
    hits: number;
    misses: number;
  };
  farms: {
    active: number;
    total: number;
    avgDuration: number;
    successRate: number;
  };
  agents: {
    active: number;
    total: number;
    failureRate: number;
  };
}

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  type: string;
  message: string;
  metric?: any;
  timestamp: Date;
  resolved: boolean;
}

class ProductionMonitor extends EventEmitter {
  private static instance: ProductionMonitor;
  private monitoringInterval: NodeJS.Timer | null = null;
  private metricsHistory: SystemMetrics[] = [];
  private applicationMetrics: ApplicationMetrics[] = [];
  private activeAlerts: Map<string, Alert> = new Map();
  private requestMetrics: Map<string, number[]> = new Map();
  
  // Thresholds
  private readonly thresholds = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    disk: { warning: 80, critical: 90 },
    responseTime: { warning: 1000, critical: 3000 },
    errorRate: { warning: 0.05, critical: 0.1 },
    dbConnections: { warning: 40, critical: 45 },
  };

  private constructor() {
    super();
    this.setupRequestTracking();
  }

  public static getInstance(): ProductionMonitor {
    if (!ProductionMonitor.instance) {
      ProductionMonitor.instance = new ProductionMonitor();
    }
    return ProductionMonitor.instance;
  }

  /**
   * Start monitoring
   */
  public async start(intervalMs: number = 30000): Promise<void> {
    if (this.monitoringInterval) {
      logger.warn(LogCategory.MONITORING, 'Production monitoring already started');
      return;
    }

    logger.info(LogCategory.MONITORING, 'Starting production monitoring');
    
    // Initial metrics collection
    await this.collectMetrics();
    
    // Schedule periodic collection
    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
    }, intervalMs);

    // Set up Prometheus metrics endpoint
    await this.setupPrometheusEndpoint();
    
    this.emit('monitoring:started');
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    logger.info(LogCategory.MONITORING, 'Production monitoring stopped');
    this.emit('monitoring:stopped');
  }

  /**
   * Collect all metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const [systemMetrics, appMetrics] = await Promise.all([
        this.collectSystemMetrics(),
        this.collectApplicationMetrics()
      ]);

      // Store metrics
      this.metricsHistory.push(systemMetrics);
      this.applicationMetrics.push(appMetrics);

      // Keep only last 24 hours of metrics
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      this.metricsHistory = this.metricsHistory.filter(m => 
        m.timestamp.getTime() > cutoff
      );
      this.applicationMetrics = this.applicationMetrics.filter(m => 
        m.timestamp.getTime() > cutoff
      );

      // Check thresholds and generate alerts
      await this.checkThresholds(systemMetrics, appMetrics);

      // Store metrics in database
      await this.persistMetrics(systemMetrics, appMetrics);

      // Broadcast to monitoring dashboard
      websocketManager.broadcast('monitoring:metrics', {
        system: systemMetrics,
        application: appMetrics,
        alerts: Array.from(this.activeAlerts.values())
      });

    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to collect metrics:', error);
    }
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    
    // Get disk usage
    const diskUsage = await this.getDiskUsage();
    
    // Get network stats
    const networkStats = await this.getNetworkStats();
    
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      timestamp: new Date(),
      cpu: {
        usage: os.loadavg()[0] * 100 / os.cpus().length,
        loadAverage: os.loadavg(),
        cores: os.cpus().length
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percentUsed: (usedMem / totalMem) * 100
      },
      disk: diskUsage,
      network: networkStats,
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        memory: memUsage,
        cpuUsage
      }
    };
  }

  /**
   * Collect application metrics
   */
  private async collectApplicationMetrics(): Promise<ApplicationMetrics> {
    // Get request metrics
    const requestStats = this.calculateRequestStats();
    
    // Get database metrics
    const dbMetrics = await this.getDatabaseMetrics();
    
    // Get Redis metrics
    const redisMetrics = await this.getRedisMetrics();
    
    // Get farm/agent metrics
    const farmMetrics = await this.getFarmMetrics();
    const agentMetrics = await this.getAgentMetrics();
    
    // Get WebSocket metrics
    const wsMetrics = this.getWebSocketMetrics();
    
    return {
      timestamp: new Date(),
      requests: requestStats,
      websockets: wsMetrics,
      database: dbMetrics,
      redis: redisMetrics,
      farms: farmMetrics,
      agents: agentMetrics
    };
  }

  /**
   * Get disk usage
   */
  private async getDiskUsage(): Promise<any> {
    try {
      const { execSync } = require('child_process');
      const output = execSync('df -k /', { encoding: 'utf8' });
      const lines = output.trim().split('\n');
      const parts = lines[1].split(/\s+/);
      
      const total = parseInt(parts[1]) * 1024;
      const used = parseInt(parts[2]) * 1024;
      const free = parseInt(parts[3]) * 1024;
      
      return {
        total,
        used,
        free,
        percentUsed: (used / total) * 100
      };
    } catch (error) {
      return {
        total: 0,
        used: 0,
        free: 0,
        percentUsed: 0
      };
    }
  }

  /**
   * Get network statistics
   */
  private async getNetworkStats(): Promise<any> {
    try {
      const { execSync } = require('child_process');
      const connections = execSync('netstat -an | wc -l', { encoding: 'utf8' });
      
      return {
        rxBytes: 0, // Would need platform-specific implementation
        txBytes: 0,
        connections: parseInt(connections.trim())
      };
    } catch (error) {
      return {
        rxBytes: 0,
        txBytes: 0,
        connections: 0
      };
    }
  }

  /**
   * Setup request tracking
   */
  private setupRequestTracking(): void {
    // Track all requests
    this.on('request:complete', (data: { path: string; method: string; status: number; duration: number }) => {
      const key = `${data.method}:${data.path}`;
      if (!this.requestMetrics.has(key)) {
        this.requestMetrics.set(key, []);
      }
      this.requestMetrics.get(key)!.push(data.duration);
      
      // Keep only last 1000 requests per endpoint
      const metrics = this.requestMetrics.get(key)!;
      if (metrics.length > 1000) {
        metrics.shift();
      }
    });
  }

  /**
   * Calculate request statistics
   */
  private calculateRequestStats(): any {
    let total = 0;
    let success = 0;
    let errors = 0;
    const allDurations: number[] = [];
    
    this.requestMetrics.forEach((durations, key) => {
      total += durations.length;
      allDurations.push(...durations);
    });
    
    if (allDurations.length === 0) {
      return {
        total: 0,
        success: 0,
        errors: 0,
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      };
    }
    
    allDurations.sort((a, b) => a - b);
    const avg = allDurations.reduce((a, b) => a + b, 0) / allDurations.length;
    const p95Index = Math.floor(allDurations.length * 0.95);
    const p99Index = Math.floor(allDurations.length * 0.99);
    
    return {
      total,
      success: total - errors,
      errors,
      avgResponseTime: avg,
      p95ResponseTime: allDurations[p95Index] || 0,
      p99ResponseTime: allDurations[p99Index] || 0
    };
  }

  /**
   * Get database metrics
   */
  private async getDatabaseMetrics(): Promise<any> {
    try {
      const poolStats = (pool as any)._pool;
      const queryResult = await pool.query(
        "SELECT COUNT(*) as count, AVG(EXTRACT(EPOCH FROM (now() - query_start))) as avg_time FROM pg_stat_activity WHERE state = 'active'"
      );
      
      return {
        poolSize: poolStats?.size || 0,
        activeConnections: poolStats?.borrowed || 0,
        waitingConnections: poolStats?.pending || 0,
        queryCount: parseInt(queryResult.rows[0].count),
        avgQueryTime: parseFloat(queryResult.rows[0].avg_time) || 0
      };
    } catch (error) {
      return {
        poolSize: 0,
        activeConnections: 0,
        waitingConnections: 0,
        queryCount: 0,
        avgQueryTime: 0
      };
    }
  }

  /**
   * Get Redis metrics
   */
  private async getRedisMetrics(): Promise<any> {
    try {
      const info = await redis.info();
      const lines = info.split('\r\n');
      const stats: any = {};
      
      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });
      
      return {
        connected: redis.status === 'ready',
        memory: parseInt(stats.used_memory || 0),
        keys: parseInt(await redis.dbsize()),
        hits: parseInt(stats.keyspace_hits || 0),
        misses: parseInt(stats.keyspace_misses || 0)
      };
    } catch (error) {
      return {
        connected: false,
        memory: 0,
        keys: 0,
        hits: 0,
        misses: 0
      };
    }
  }

  /**
   * Get farm metrics
   */
  private async getFarmMetrics(): Promise<any> {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) as total,
          AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration,
          COUNT(*) FILTER (WHERE status = 'completed')::float / NULLIF(COUNT(*), 0) as success_rate
        FROM farms
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      
      return {
        active: parseInt(result.rows[0].active),
        total: parseInt(result.rows[0].total),
        avgDuration: parseFloat(result.rows[0].avg_duration) || 0,
        successRate: parseFloat(result.rows[0].success_rate) || 0
      };
    } catch (error) {
      return {
        active: 0,
        total: 0,
        avgDuration: 0,
        successRate: 0
      };
    }
  }

  /**
   * Get agent metrics
   */
  private async getAgentMetrics(): Promise<any> {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'failed')::float / NULLIF(COUNT(*), 0) as failure_rate
        FROM agents
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      
      return {
        active: parseInt(result.rows[0].active),
        total: parseInt(result.rows[0].total),
        failureRate: parseFloat(result.rows[0].failure_rate) || 0
      };
    } catch (error) {
      return {
        active: 0,
        total: 0,
        failureRate: 0
      };
    }
  }

  /**
   * Get WebSocket metrics
   */
  private getWebSocketMetrics(): any {
    // Would need to be implemented based on your WebSocket manager
    return {
      connections: websocketManager.getConnectionCount?.() || 0,
      messages: 0,
      errors: 0
    };
  }

  /**
   * Check thresholds and generate alerts
   */
  private async checkThresholds(
    systemMetrics: SystemMetrics,
    appMetrics: ApplicationMetrics
  ): Promise<void> {
    // CPU check
    if (systemMetrics.cpu.usage > this.thresholds.cpu.critical) {
      this.createAlert('critical', 'cpu', `CPU usage critical: ${systemMetrics.cpu.usage.toFixed(1)}%`);
    } else if (systemMetrics.cpu.usage > this.thresholds.cpu.warning) {
      this.createAlert('warning', 'cpu', `CPU usage high: ${systemMetrics.cpu.usage.toFixed(1)}%`);
    } else {
      this.resolveAlert('cpu');
    }

    // Memory check
    if (systemMetrics.memory.percentUsed > this.thresholds.memory.critical) {
      this.createAlert('critical', 'memory', `Memory usage critical: ${systemMetrics.memory.percentUsed.toFixed(1)}%`);
    } else if (systemMetrics.memory.percentUsed > this.thresholds.memory.warning) {
      this.createAlert('warning', 'memory', `Memory usage high: ${systemMetrics.memory.percentUsed.toFixed(1)}%`);
    } else {
      this.resolveAlert('memory');
    }

    // Response time check
    if (appMetrics.requests.avgResponseTime > this.thresholds.responseTime.critical) {
      this.createAlert('critical', 'response_time', `Response time critical: ${appMetrics.requests.avgResponseTime.toFixed(0)}ms`);
    } else if (appMetrics.requests.avgResponseTime > this.thresholds.responseTime.warning) {
      this.createAlert('warning', 'response_time', `Response time slow: ${appMetrics.requests.avgResponseTime.toFixed(0)}ms`);
    } else {
      this.resolveAlert('response_time');
    }

    // Error rate check
    const errorRate = appMetrics.requests.total > 0 ? 
      appMetrics.requests.errors / appMetrics.requests.total : 0;
    
    if (errorRate > this.thresholds.errorRate.critical) {
      this.createAlert('critical', 'error_rate', `Error rate critical: ${(errorRate * 100).toFixed(1)}%`);
    } else if (errorRate > this.thresholds.errorRate.warning) {
      this.createAlert('warning', 'error_rate', `Error rate high: ${(errorRate * 100).toFixed(1)}%`);
    } else {
      this.resolveAlert('error_rate');
    }
  }

  /**
   * Create or update alert
   */
  private createAlert(level: 'info' | 'warning' | 'critical', type: string, message: string): void {
    const existingAlert = this.activeAlerts.get(type);
    
    if (!existingAlert || existingAlert.level !== level) {
      const alert: Alert = {
        id: `${type}_${Date.now()}`,
        level,
        type,
        message,
        timestamp: new Date(),
        resolved: false
      };
      
      this.activeAlerts.set(type, alert);
      
      // Log alert
      const logMethod = level === 'critical' ? 'error' : level === 'warning' ? 'warn' : 'info';
      logger[logMethod](LogCategory.MONITORING, `Alert: ${message}`);
      
      // Send notification
      websocketManager.broadcast('monitoring:alert', alert);
      
      // Store in database
      this.persistAlert(alert);
    }
  }

  /**
   * Resolve alert
   */
  private resolveAlert(type: string): void {
    const alert = this.activeAlerts.get(type);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      this.activeAlerts.delete(type);
      
      logger.info(LogCategory.MONITORING, `Alert resolved: ${type}`);
      websocketManager.broadcast('monitoring:alert:resolved', { type });
    }
  }

  /**
   * Persist metrics to database
   */
  private async persistMetrics(
    systemMetrics: SystemMetrics,
    appMetrics: ApplicationMetrics
  ): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO metrics (entity_type, entity_id, metric_name, metric_value, metric_data, timestamp)
        VALUES 
          ('system', 'cpu', 'usage', $1, $2, $3),
          ('system', 'memory', 'usage', $4, $5, $3),
          ('application', 'requests', 'count', $6, $7, $3),
          ('application', 'farms', 'active', $8, $9, $3)
      `, [
        systemMetrics.cpu.usage,
        JSON.stringify(systemMetrics.cpu),
        systemMetrics.timestamp,
        systemMetrics.memory.percentUsed,
        JSON.stringify(systemMetrics.memory),
        appMetrics.requests.total,
        JSON.stringify(appMetrics.requests),
        appMetrics.farms.active,
        JSON.stringify(appMetrics.farms)
      ]);
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to persist metrics:', error);
    }
  }

  /**
   * Persist alert to database
   */
  private async persistAlert(alert: Alert): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO alerts (alert_type, severity, title, message, details, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        alert.type,
        alert.level,
        `${alert.type} Alert`,
        alert.message,
        JSON.stringify(alert),
        'active',
        alert.timestamp
      ]);
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to persist alert:', error);
    }
  }

  /**
   * Setup Prometheus metrics endpoint
   */
  private async setupPrometheusEndpoint(): Promise<void> {
    // This would export metrics in Prometheus format
    // Implementation would depend on your Express setup
  }

  /**
   * Get current status
   */
  public getStatus(): any {
    const latestSystem = this.metricsHistory[this.metricsHistory.length - 1];
    const latestApp = this.applicationMetrics[this.applicationMetrics.length - 1];
    
    return {
      healthy: this.activeAlerts.size === 0,
      alerts: Array.from(this.activeAlerts.values()),
      system: latestSystem,
      application: latestApp,
      uptime: process.uptime()
    };
  }

  /**
   * Export metrics for external monitoring
   */
  public exportMetrics(format: 'json' | 'prometheus' = 'json'): string {
    if (format === 'prometheus') {
      return this.formatPrometheusMetrics();
    }
    
    return JSON.stringify({
      system: this.metricsHistory,
      application: this.applicationMetrics,
      alerts: Array.from(this.activeAlerts.values())
    });
  }

  /**
   * Format metrics for Prometheus
   */
  private formatPrometheusMetrics(): string {
    const latest = this.getStatus();
    if (!latest.system) return '';
    
    const lines: string[] = [];
    
    // System metrics
    lines.push(`# HELP maifarm_cpu_usage CPU usage percentage`);
    lines.push(`# TYPE maifarm_cpu_usage gauge`);
    lines.push(`maifarm_cpu_usage ${latest.system.cpu.usage}`);
    
    lines.push(`# HELP maifarm_memory_usage Memory usage percentage`);
    lines.push(`# TYPE maifarm_memory_usage gauge`);
    lines.push(`maifarm_memory_usage ${latest.system.memory.percentUsed}`);
    
    // Application metrics
    if (latest.application) {
      lines.push(`# HELP maifarm_request_total Total number of requests`);
      lines.push(`# TYPE maifarm_request_total counter`);
      lines.push(`maifarm_request_total ${latest.application.requests.total}`);
      
      lines.push(`# HELP maifarm_request_duration_ms Request duration in milliseconds`);
      lines.push(`# TYPE maifarm_request_duration_ms histogram`);
      lines.push(`maifarm_request_duration_ms{quantile="0.95"} ${latest.application.requests.p95ResponseTime}`);
      lines.push(`maifarm_request_duration_ms{quantile="0.99"} ${latest.application.requests.p99ResponseTime}`);
      
      lines.push(`# HELP maifarm_active_farms Number of active farms`);
      lines.push(`# TYPE maifarm_active_farms gauge`);
      lines.push(`maifarm_active_farms ${latest.application.farms.active}`);
    }
    
    return lines.join('\n');
  }
}

// Export singleton instance
export const productionMonitor = ProductionMonitor.getInstance();

export default productionMonitor;