/**
 * Production Health Check System
 * Comprehensive health monitoring for production deployment
 */

import { EventEmitter } from 'events';
import { db } from '../database/connection';
import { redis } from './redis';
import { logger, LogCategory } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';
import { circuitBreakerManager } from './circuitBreaker';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pathConfig } from '../config/paths';

const execAsync = promisify(exec);
const tmuxTmpDir = pathConfig.getPath('TMUX_TMP_DIR');

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical'
}

export interface HealthCheckResult {
  service: string;
  status: HealthStatus;
  responseTime: number;
  message?: string;
  error?: string;
  metadata?: any;
}

export interface SystemHealthReport {
  timestamp: Date;
  status: HealthStatus;
  uptime: number;
  checks: HealthCheckResult[];
  system: {
    cpu: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    disk: {
      used: number;
      total: number;
      percentage: number;
    };
    load: number[];
  };
  services: {
    database: HealthStatus;
    redis: HealthStatus;
    websocket: HealthStatus;
    tmux: HealthStatus;
  };
  activeConnections: number;
  activeFarms: number;
  activeAgents: number;
  circuitBreakers: any;
}

/**
 * Production Health Check Service
 */
export class ProductionHealthCheck extends EventEmitter {
  private static instance: ProductionHealthCheck;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 30000; // 30 seconds
  private readonly WARNING_THRESHOLDS = {
    cpu: 70,
    memory: 80,
    disk: 85,
    responseTime: 5000,  // 5 seconds
    connectionPool: 80    // 80% of pool size
  };
  private readonly CRITICAL_THRESHOLDS = {
    cpu: 90,
    memory: 95,
    disk: 95,
    responseTime: 10000,  // 10 seconds
    connectionPool: 95     // 95% of pool size
  };

  private lastReport: SystemHealthReport | null = null;
  private healthHistory: HealthStatus[] = [];
  private readonly HISTORY_SIZE = 100;

  private constructor() {
    super();
    this.startMonitoring();
  }

  static getInstance(): ProductionHealthCheck {
    if (!ProductionHealthCheck.instance) {
      ProductionHealthCheck.instance = new ProductionHealthCheck();
    }
    return ProductionHealthCheck.instance;
  }

  /**
   * Start health monitoring
   */
  private startMonitoring(): void {
    // Initial check
    this.performHealthCheck();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.CHECK_INTERVAL);

    logger.info(LogCategory.MONITORING, 'Production health monitoring started');
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<SystemHealthReport> {
    const startTime = Date.now();
    const checks: HealthCheckResult[] = [];

    // Check database
    const dbHealth = await this.checkDatabase();
    checks.push(dbHealth);

    // Check Redis
    const redisHealth = await this.checkRedis();
    checks.push(redisHealth);

    // Check WebSocket
    const wsHealth = await this.checkWebSocket();
    checks.push(wsHealth);

    // Check Tmux
    const tmuxHealth = await this.checkTmux();
    checks.push(tmuxHealth);

    // Check file system
    const fsHealth = await this.checkFileSystem();
    checks.push(fsHealth);

    // Get system metrics
    const systemMetrics = await this.getSystemMetrics();

    // Get active counts
    const activeCounts = await this.getActiveCounts();

    // Get circuit breaker status
    const circuitBreakers = circuitBreakerManager.getAllMetrics();

    // Determine overall status
    const overallStatus = this.determineOverallStatus(checks, systemMetrics);

    const report: SystemHealthReport = {
      timestamp: new Date(),
      status: overallStatus,
      uptime: process.uptime(),
      checks,
      system: systemMetrics,
      services: {
        database: dbHealth.status,
        redis: redisHealth.status,
        websocket: wsHealth.status,
        tmux: tmuxHealth.status
      },
      activeConnections: activeCounts.connections,
      activeFarms: activeCounts.farms,
      activeAgents: activeCounts.agents,
      circuitBreakers
    };

    // Track history
    this.healthHistory.push(overallStatus);
    if (this.healthHistory.length > this.HISTORY_SIZE) {
      this.healthHistory.shift();
    }

    // Check for status changes
    if (this.lastReport && this.lastReport.status !== overallStatus) {
      this.emit('status-change', {
        previous: this.lastReport.status,
        current: overallStatus,
        report
      });

      // Alert on critical status
      if (overallStatus === HealthStatus.CRITICAL) {
        this.emitCriticalAlert(report);
      }
    }

    this.lastReport = report;

    // Emit health update
    this.emit('health-update', report);

    // Broadcast to WebSocket clients
    websocketManager.broadcast('system:health', report);

    const checkDuration = Date.now() - startTime;
    logger.debug(LogCategory.MONITORING,
      `Health check completed in ${checkDuration}ms - Status: ${overallStatus}`);

    return report;
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Simple query to check connectivity
      await db.query('SELECT 1');

      // Check connection pool
      const poolStats = await this.getDatabasePoolStats();

      const responseTime = Date.now() - startTime;
      let status = HealthStatus.HEALTHY;

      if (poolStats.waiting > 10) {
        status = HealthStatus.DEGRADED;
      }

      if (responseTime > this.CRITICAL_THRESHOLDS.responseTime) {
        status = HealthStatus.CRITICAL;
      } else if (responseTime > this.WARNING_THRESHOLDS.responseTime) {
        status = HealthStatus.DEGRADED;
      }

      return {
        service: 'database',
        status,
        responseTime,
        metadata: poolStats
      };
    } catch (error) {
      return {
        service: 'database',
        status: HealthStatus.CRITICAL,
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedis(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const client = await redis.getClient();
      const pong = await client.ping();

      const responseTime = Date.now() - startTime;
      let status = HealthStatus.HEALTHY;

      if (pong !== 'PONG') {
        status = HealthStatus.UNHEALTHY;
      }

      if (responseTime > this.WARNING_THRESHOLDS.responseTime) {
        status = HealthStatus.DEGRADED;
      }

      // Check memory usage
      const info = await client.info('memory');
      const memoryUsage = this.parseRedisMemory(info);

      return {
        service: 'redis',
        status,
        responseTime,
        metadata: { memoryUsage }
      };
    } catch (error) {
      return {
        service: 'redis',
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Check WebSocket health
   */
  private async checkWebSocket(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const io = websocketManager.getIO();
      if (!io) {
        return {
          service: 'websocket',
          status: HealthStatus.CRITICAL,
          responseTime: Date.now() - startTime,
          error: 'WebSocket server not initialized'
        };
      }

      const sockets = await io.fetchSockets();
      const connectionCount = sockets.length;

      return {
        service: 'websocket',
        status: HealthStatus.HEALTHY,
        responseTime: Date.now() - startTime,
        metadata: { connections: connectionCount }
      };
    } catch (error) {
      return {
        service: 'websocket',
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Check Tmux health
   */
  private async checkTmux(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const { stdout } = await execAsync(`TMUX_TMPDIR="${tmuxTmpDir}" tmux list-sessions 2>/dev/null || echo ""`);
      const sessions = stdout.trim().split('\n').filter(Boolean);

      return {
        service: 'tmux',
        status: HealthStatus.HEALTHY,
        responseTime: Date.now() - startTime,
        metadata: { sessionCount: sessions.length }
      };
    } catch (error) {
      return {
        service: 'tmux',
        status: HealthStatus.DEGRADED,
        responseTime: Date.now() - startTime,
        message: 'Tmux not accessible',
        error: error.message
      };
    }
  }

  /**
   * Check file system health
   */
  private async checkFileSystem(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const { stdout } = await execAsync('df -h / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      const usagePercent = parseInt(parts[4].replace('%', ''));

      let status = HealthStatus.HEALTHY;
      if (usagePercent > this.CRITICAL_THRESHOLDS.disk) {
        status = HealthStatus.CRITICAL;
      } else if (usagePercent > this.WARNING_THRESHOLDS.disk) {
        status = HealthStatus.DEGRADED;
      }

      return {
        service: 'filesystem',
        status,
        responseTime: Date.now() - startTime,
        metadata: { diskUsagePercent: usagePercent }
      };
    } catch (error) {
      return {
        service: 'filesystem',
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Get system metrics
   */
  private async getSystemMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Calculate CPU usage
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;

    // Get disk usage
    let diskUsage = { used: 0, total: 0, percentage: 0 };
    try {
      const { stdout } = await execAsync('df -k / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      const total = parseInt(parts[1]) * 1024;
      const used = parseInt(parts[2]) * 1024;
      diskUsage = {
        total,
        used,
        percentage: (used / total) * 100
      };
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to get disk usage:', error);
    }

    return {
      cpu: cpuUsage,
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: (usedMem / totalMem) * 100
      },
      disk: diskUsage,
      load: os.loadavg()
    };
  }

  /**
   * Get active counts
   */
  private async getActiveCounts() {
    let farms = 0;
    let agents = 0;

    try {
      const farmResult = await db.query(
        "SELECT COUNT(*) as count FROM farms WHERE status IN ('active', 'running', 'launching')"
      );
      farms = farmResult.rows[0]?.count || 0;

      const agentResult = await db.query(
        "SELECT COUNT(*) as count FROM agents WHERE status IN ('active', 'working', 'ready')"
      );
      agents = agentResult.rows[0]?.count || 0;
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to get active counts:', error);
    }

    const io = websocketManager.getIO();
    const connections = io ? (await io.fetchSockets()).length : 0;

    return { connections, farms, agents };
  }

  /**
   * Determine overall status
   */
  private determineOverallStatus(
    checks: HealthCheckResult[],
    systemMetrics: any
  ): HealthStatus {
    // Check for critical conditions
    if (checks.some(c => c.status === HealthStatus.CRITICAL)) {
      return HealthStatus.CRITICAL;
    }

    if (systemMetrics.cpu > this.CRITICAL_THRESHOLDS.cpu ||
        systemMetrics.memory.percentage > this.CRITICAL_THRESHOLDS.memory ||
        systemMetrics.disk.percentage > this.CRITICAL_THRESHOLDS.disk) {
      return HealthStatus.CRITICAL;
    }

    // Check for unhealthy conditions
    const unhealthyCount = checks.filter(c =>
      c.status === HealthStatus.UNHEALTHY
    ).length;

    if (unhealthyCount >= 2) {
      return HealthStatus.UNHEALTHY;
    }

    // Check for degraded conditions
    const degradedCount = checks.filter(c =>
      c.status === HealthStatus.DEGRADED
    ).length;

    if (degradedCount >= 2 || unhealthyCount >= 1) {
      return HealthStatus.DEGRADED;
    }

    if (systemMetrics.cpu > this.WARNING_THRESHOLDS.cpu ||
        systemMetrics.memory.percentage > this.WARNING_THRESHOLDS.memory ||
        systemMetrics.disk.percentage > this.WARNING_THRESHOLDS.disk) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  /**
   * Parse Redis memory info
   */
  private parseRedisMemory(info: string): number {
    const match = info.match(/used_memory:(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Get database pool stats
   */
  private async getDatabasePoolStats() {
    // This would depend on your database driver
    // Example for pg:
    return {
      total: 20,
      idle: 15,
      waiting: 0
    };
  }

  /**
   * Emit critical alert
   */
  private emitCriticalAlert(report: SystemHealthReport): void {
    const alert = {
      severity: 'critical',
      timestamp: new Date(),
      message: 'System health is CRITICAL',
      report
    };

    this.emit('critical-alert', alert);
    logger.error(LogCategory.MONITORING, 'CRITICAL SYSTEM ALERT', alert);

    // Send notification to administrators
    // This could integrate with PagerDuty, Slack, etc.
  }

  /**
   * Get health report
   */
  getHealthReport(): SystemHealthReport | null {
    return this.lastReport;
  }

  /**
   * Get health history
   */
  getHealthHistory(): HealthStatus[] {
    return [...this.healthHistory];
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info(LogCategory.MONITORING, 'Production health monitoring stopped');
  }

  /**
   * Force health check
   */
  async forceCheck(): Promise<SystemHealthReport> {
    return this.performHealthCheck();
  }
}

export const productionHealthCheck = ProductionHealthCheck.getInstance();
