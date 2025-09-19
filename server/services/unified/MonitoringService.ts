/**
 * MonitoringService - Comprehensive system monitoring and observability
 *
 * Features:
 * - Real-time metrics collection
 * - Performance monitoring
 * - Health checks
 * - Alert generation
 * - Resource usage tracking
 * - Service-level monitoring
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import { logger, LogCategory } from '../../utils/logger';
import { serviceRegistry } from './ServiceRegistry';
import { memoryManager } from './MemoryManager';
import { cacheManager } from './CacheManager';
import { db } from '../../database/connection';
import { redis, isRedisConnected } from '../../database/redis';

interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastCheck: Date;
  metadata?: Record<string, any>;
}

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  service: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  acknowledged?: boolean;
}

interface SystemMetrics {
  cpu: {
    usage: number;
    load: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
  };
  process: {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

export class MonitoringService extends EventEmitter {
  private static instance: MonitoringService;

  private metrics: Map<string, Metric[]> = new Map();
  private healthChecks: Map<string, HealthCheck> = new Map();
  private alerts: Map<string, Alert> = new Map();

  private monitoringInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  private readonly MONITORING_INTERVAL = 10000; // 10 seconds
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly METRICS_RETENTION = 3600000; // 1 hour
  private readonly MAX_METRICS_PER_TYPE = 360; // 360 data points per hour

  private alertThresholds = {
    cpuUsage: 80, // %
    memoryUsage: 85, // %
    diskUsage: 90, // %
    responseTime: 5000, // ms
    errorRate: 0.05 // 5%
  };

  private constructor() {
    super();
    this.initialize();
  }

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Start monitoring
      this.startMonitoring();
      this.startHealthChecks();

      // Register with memory manager
      memoryManager.registerService('MonitoringService', {
        getMemoryUsage: () => this.getMemoryUsage(),
        cleanup: () => this.cleanup(),
        priority: 10 // Low priority for cleanup
      });

      logger.info(LogCategory.MONITORING, 'MonitoringService initialized');
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to initialize MonitoringService:', error);
    }
  }

  /**
   * Start system monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.collectSystemMetrics();
      await this.collectServiceMetrics();
      this.cleanupOldMetrics();
      this.checkAlertThresholds();
    }, this.MONITORING_INTERVAL);
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);

    // Perform initial health check
    this.performHealthChecks();
  }

  /**
   * Collect system-level metrics
   */
  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const systemMetrics: SystemMetrics = {
      cpu: {
        usage: this.calculateCPUUsage(cpus),
        load: os.loadavg(),
        cores: cpus.length
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        percentage: (usedMemory / totalMemory) * 100
      },
      disk: {
        total: 0, // TODO: Implement disk usage
        used: 0,
        free: 0,
        percentage: 0
      },
      network: {
        rx: 0, // TODO: Implement network stats
        tx: 0
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };

    // Record metrics
    this.recordMetric('cpu.usage', systemMetrics.cpu.usage, '%');
    this.recordMetric('memory.usage', systemMetrics.memory.percentage, '%');
    this.recordMetric('memory.used', systemMetrics.memory.used, 'bytes');
    this.recordMetric('process.memory.heap', systemMetrics.process.memoryUsage.heapUsed, 'bytes');

    // Emit system metrics
    this.emit('metrics:system', systemMetrics);

    return systemMetrics;
  }

  /**
   * Collect service-level metrics
   */
  private async collectServiceMetrics(): Promise<void> {
    try {
      // Farm service metrics
      const farmService = serviceRegistry.get('farm');
      if (farmService) {
        const farms = (farmService as any).farms;
        this.recordMetric('farms.active', farms?.size || 0, 'count');
      }

      // Terminal service metrics
      const terminalService = serviceRegistry.get('terminal');
      if (terminalService) {
        const sessions = (terminalService as any).getActiveSessions();
        this.recordMetric('terminals.active', sessions?.length || 0, 'count');
      }

      // WebSocket metrics
      const websocketStats = (serviceRegistry.get('websocket') as any)?.getStats?.();
      if (websocketStats) {
        this.recordMetric('websocket.connections', websocketStats.connectionsActive || 0, 'count');
        this.recordMetric('websocket.messages', websocketStats.messagesSent || 0, 'count');
        this.recordMetric('websocket.rooms', websocketStats.roomCount || 0, 'count');
      }

      // Cache metrics
      const cacheStats = cacheManager.getAllStats();
      let totalHits = 0, totalMisses = 0;
      for (const [name, stats] of cacheStats) {
        totalHits += stats.hits;
        totalMisses += stats.misses;
        this.recordMetric(`cache.${name}.hitRate`,
          stats.hits / (stats.hits + stats.misses + 1) * 100, '%');
      }
      this.recordMetric('cache.total.hits', totalHits, 'count');
      this.recordMetric('cache.total.misses', totalMisses, 'count');

      // Database metrics
      if (db) {
        const poolStats = await this.getDatabasePoolStats();
        this.recordMetric('database.connections.active', poolStats.active, 'count');
        this.recordMetric('database.connections.idle', poolStats.idle, 'count');
      }

      // Redis metrics
      if (isRedisConnected()) {
        const redisInfo = await redis.info();
        const usedMemory = this.parseRedisInfo(redisInfo, 'used_memory');
        if (usedMemory) {
          this.recordMetric('redis.memory.used', parseInt(usedMemory), 'bytes');
        }
      }

    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Error collecting service metrics:', error);
    }
  }

  /**
   * Perform health checks on all services
   */
  private async performHealthChecks(): Promise<void> {
    const checks: HealthCheck[] = [];

    // Database health
    checks.push(await this.checkDatabaseHealth());

    // Redis health
    checks.push(await this.checkRedisHealth());

    // Service health
    checks.push(await this.checkServicesHealth());

    // Memory health
    checks.push(this.checkMemoryHealth());

    // Update health checks
    for (const check of checks) {
      this.healthChecks.set(check.service, check);

      // Generate alerts for unhealthy services
      if (check.status === 'unhealthy') {
        this.generateAlert('error', check.service,
          `Service ${check.service} is unhealthy: ${check.message}`);
      }
    }

    // Emit health status
    this.emit('health:updated', Array.from(this.healthChecks.values()));
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<HealthCheck> {
    try {
      await db.query('SELECT 1');
      return {
        service: 'database',
        status: 'healthy',
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        message: error.message,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<HealthCheck> {
    try {
      if (isRedisConnected()) {
        await redis.ping();
        return {
          service: 'redis',
          status: 'healthy',
          lastCheck: new Date()
        };
      } else {
        return {
          service: 'redis',
          status: 'unhealthy',
          message: 'Redis not connected',
          lastCheck: new Date()
        };
      }
    } catch (error) {
      return {
        service: 'redis',
        status: 'unhealthy',
        message: error.message,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Check services health
   */
  private async checkServicesHealth(): Promise<HealthCheck> {
    try {
      const serviceHealth = await serviceRegistry.getHealth();
      const unhealthyServices = Object.entries(serviceHealth)
        .filter(([_, health]) => health.status === 'unhealthy');

      if (unhealthyServices.length === 0) {
        return {
          service: 'services',
          status: 'healthy',
          lastCheck: new Date(),
          metadata: serviceHealth
        };
      } else {
        return {
          service: 'services',
          status: 'degraded',
          message: `${unhealthyServices.length} services unhealthy`,
          lastCheck: new Date(),
          metadata: serviceHealth
        };
      }
    } catch (error) {
      return {
        service: 'services',
        status: 'unhealthy',
        message: error.message,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Check memory health
   */
  private checkMemoryHealth(): HealthCheck {
    const memoryReport = memoryManager.getMemoryReport();
    const percentage = memoryReport.stats.percentage;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message: string | undefined;

    if (percentage > 0.9) {
      status = 'unhealthy';
      message = `Memory usage critical: ${Math.round(percentage * 100)}%`;
    } else if (percentage > 0.7) {
      status = 'degraded';
      message = `Memory usage high: ${Math.round(percentage * 100)}%`;
    }

    return {
      service: 'memory',
      status,
      message,
      lastCheck: new Date(),
      metadata: memoryReport
    };
  }

  /**
   * Record a metric
   */
  recordMetric(name: string, value: number, unit: string, tags?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      tags
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricArray = this.metrics.get(name)!;
    metricArray.push(metric);

    // Limit array size
    if (metricArray.length > this.MAX_METRICS_PER_TYPE) {
      metricArray.shift();
    }

    // Emit metric event
    this.emit('metric:recorded', metric);
  }

  /**
   * Generate an alert
   */
  generateAlert(
    level: Alert['level'],
    service: string,
    message: string,
    metadata?: Record<string, any>
  ): void {
    const alert: Alert = {
      id: `${service}-${Date.now()}`,
      level,
      service,
      message,
      timestamp: new Date(),
      metadata,
      acknowledged: false
    };

    this.alerts.set(alert.id, alert);

    // Emit alert
    this.emit('alert:generated', alert);

    // Log alert
    const logLevel = level === 'critical' || level === 'error' ? 'error' :
                    level === 'warning' ? 'warn' : 'info';
    logger[logLevel](LogCategory.MONITORING, `Alert: ${message}`, metadata);
  }

  /**
   * Check alert thresholds
   */
  private checkAlertThresholds(): void {
    // Check CPU usage
    const cpuMetrics = this.metrics.get('cpu.usage');
    if (cpuMetrics && cpuMetrics.length > 0) {
      const latest = cpuMetrics[cpuMetrics.length - 1];
      if (latest.value > this.alertThresholds.cpuUsage) {
        this.generateAlert('warning', 'system',
          `CPU usage high: ${latest.value.toFixed(2)}%`);
      }
    }

    // Check memory usage
    const memoryMetrics = this.metrics.get('memory.usage');
    if (memoryMetrics && memoryMetrics.length > 0) {
      const latest = memoryMetrics[memoryMetrics.length - 1];
      if (latest.value > this.alertThresholds.memoryUsage) {
        this.generateAlert('warning', 'system',
          `Memory usage high: ${latest.value.toFixed(2)}%`);
      }
    }
  }

  /**
   * Clean up old metrics
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.METRICS_RETENTION;

    for (const [name, metricArray] of this.metrics) {
      const filtered = metricArray.filter(m =>
        m.timestamp.getTime() > cutoff
      );

      if (filtered.length !== metricArray.length) {
        this.metrics.set(name, filtered);
      }

      // Remove empty arrays
      if (filtered.length === 0) {
        this.metrics.delete(name);
      }
    }
  }

  /**
   * Helper methods
   */

  private calculateCPUUsage(cpus: os.CpuInfo[]): number {
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    return 100 - Math.floor(totalIdle / totalTick * 100);
  }

  private async getDatabasePoolStats(): Promise<{ active: number; idle: number }> {
    try {
      // This is a simplified version - actual implementation would depend on the pool library
      return {
        active: (db as any)._pool?.totalCount || 0,
        idle: (db as any)._pool?.idleCount || 0
      };
    } catch {
      return { active: 0, idle: 0 };
    }
  }

  private parseRedisInfo(info: string, key: string): string | null {
    const match = info.match(new RegExp(`${key}:(\\S+)`));
    return match ? match[1] : null;
  }

  private getMemoryUsage(): number {
    let totalSize = 0;
    for (const metricArray of this.metrics.values()) {
      totalSize += metricArray.length * 100; // Rough estimate
    }
    return totalSize;
  }

  private async cleanup(): Promise<void> {
    // Clean up old metrics aggressively
    this.metrics.clear();
    this.alerts.clear();
  }

  /**
   * Public API
   */

  /**
   * Get current metrics
   */
  getMetrics(name?: string): Metric[] {
    if (name) {
      return this.metrics.get(name) || [];
    }

    // Return all metrics
    const allMetrics: Metric[] = [];
    for (const metricArray of this.metrics.values()) {
      allMetrics.push(...metricArray);
    }
    return allMetrics;
  }

  /**
   * Get current health status
   */
  getHealth(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  /**
   * Get active alerts
   */
  getAlerts(unacknowledgedOnly = true): Alert[] {
    const alerts = Array.from(this.alerts.values());
    if (unacknowledgedOnly) {
      return alerts.filter(a => !a.acknowledged);
    }
    return alerts;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Get monitoring report
   */
  getReport(): {
    metrics: { [key: string]: Metric[] };
    health: HealthCheck[];
    alerts: Alert[];
    summary: {
      totalMetrics: number;
      healthyServices: number;
      degradedServices: number;
      unhealthyServices: number;
      activeAlerts: number;
    };
  } {
    const health = this.getHealth();
    const alerts = this.getAlerts();

    return {
      metrics: Object.fromEntries(this.metrics),
      health,
      alerts,
      summary: {
        totalMetrics: this.metrics.size,
        healthyServices: health.filter(h => h.status === 'healthy').length,
        degradedServices: health.filter(h => h.status === 'degraded').length,
        unhealthyServices: health.filter(h => h.status === 'unhealthy').length,
        activeAlerts: alerts.filter(a => !a.acknowledged).length
      }
    };
  }

  /**
   * Shutdown monitoring
   */
  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    logger.info(LogCategory.MONITORING, 'MonitoringService shut down');
  }
}

// Export singleton instance
export const monitoringService = MonitoringService.getInstance();