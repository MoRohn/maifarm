/**
 * Unified Monitoring Dashboard Service
 * Provides real-time metrics, health status, and performance monitoring
 */

import { EventEmitter } from 'events';
import { Server as SocketServer } from 'socket.io';
import { redis, db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { ResourceManager } from '../utils/ResourceManager';
import { apiCircuitBreaker } from '../middleware/rateLimiter';
import os from 'os';
import { performance } from 'perf_hooks';

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
    percentUsed: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentUsed: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
}

interface ApplicationMetrics {
  requests: {
    total: number;
    success: number;
    errors: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  farms: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    avgDuration: number;
  };
  agents: {
    total: number;
    active: number;
    idle: number;
    failed: number;
    recovered: number;
  };
  tasks: {
    quickTasks: number;
    quickTasksCompleted: number;
    quickTasksFailed: number;
    avgQuickTaskTime: number;
  };
  websockets: {
    connections: number;
    messagesIn: number;
    messagesOut: number;
    avgLatency: number;
  };
  database: {
    poolSize: number;
    activeConnections: number;
    waitingConnections: number;
    queryCount: number;
    avgQueryTime: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    memoryUsage: number;
  };
  resources: ResourceMetrics;
}

interface ResourceMetrics {
  buffers: {
    count: number;
    totalSize: number;
  };
  connections: {
    count: number;
    types: Record<string, number>;
  };
  sessions: {
    count: number;
    avgLifetime: number;
  };
  timers: {
    active: number;
    cleared: number;
  };
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    websocket: ServiceHealth;
    tmux: ServiceHealth;
    aiProvider: ServiceHealth;
  };
  circuitBreakers: Record<string, 'closed' | 'open' | 'half-open'>;
  alerts: Alert[];
}

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency: number;
  lastCheck: Date;
  error?: string;
}

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

interface RateLimitMetrics {
  endpoints: Record<string, {
    requests: number;
    blocked: number;
    remaining: number;
    resetTime: Date;
  }>;
  users: Record<string, {
    tier: string;
    requests: number;
    limit: number;
  }>;
}

class MonitoringDashboardService extends EventEmitter {
  private static instance: MonitoringDashboardService;
  private io?: SocketServer;
  private metricsInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  private responseTimes: number[] = [];
  private queryTimes: number[] = [];
  private requestCounts = {
    total: 0,
    success: 0,
    errors: 0
  };

  private alerts: Alert[] = [];
  private readonly MAX_ALERTS = 100;
  private readonly MAX_METRICS_HISTORY = 1000;

  private constructor() {
    super();
    this.startMetricsCollection();
    this.startHealthChecks();
  }

  static getInstance(): MonitoringDashboardService {
    if (!MonitoringDashboardService.instance) {
      MonitoringDashboardService.instance = new MonitoringDashboardService();
    }
    return MonitoringDashboardService.instance;
  }

  /**
   * Initialize WebSocket connection for real-time updates
   */
  initializeWebSocket(io: SocketServer): void {
    this.io = io;

    io.on('connection', (socket) => {
      // Send initial dashboard data
      socket.emit('monitoring:initial', {
        system: this.getSystemMetrics(),
        application: this.getApplicationMetrics(),
        health: this.getHealthStatus(),
        alerts: this.alerts
      });

      // Handle dashboard subscriptions
      socket.on('monitoring:subscribe', (metrics: string[]) => {
        metrics.forEach(metric => {
          socket.join(`monitoring:${metric}`);
        });
      });

      // Handle alert acknowledgment
      socket.on('monitoring:acknowledge-alert', (alertId: string) => {
        this.acknowledgeAlert(alertId);
      });
    });
  }

  /**
   * Start collecting metrics
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      const metrics = await this.collectMetrics();
      this.broadcastMetrics(metrics);
    }, 5000); // Collect every 5 seconds
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.performHealthChecks();
      this.broadcastHealth(health);
    }, 10000); // Check every 10 seconds
  }

  /**
   * Collect all metrics
   */
  private async collectMetrics(): Promise<{
    system: SystemMetrics;
    application: ApplicationMetrics;
    rateLimits: RateLimitMetrics;
  }> {
    const [system, application, rateLimits] = await Promise.all([
      this.getSystemMetrics(),
      this.getApplicationMetrics(),
      this.getRateLimitMetrics()
    ]);

    return { system, application, rateLimits };
  }

  /**
   * Get system metrics
   */
  private getSystemMetrics(): SystemMetrics {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });
    const cpuUsage = 100 - Math.floor(totalIdle / totalTick * 100);

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
        percentUsed: Math.round((usedMemory / totalMemory) * 100)
      },
      disk: {
        total: 0, // Would need to implement disk usage checking
        used: 0,
        free: 0,
        percentUsed: 0
      },
      network: {
        bytesIn: 0, // Would need to track network usage
        bytesOut: 0,
        packetsIn: 0,
        packetsOut: 0
      }
    };
  }

  /**
   * Get application metrics
   */
  private async getApplicationMetrics(): Promise<ApplicationMetrics> {
    try {
      // Get farm metrics
      const farmStats = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status IN ('running', 'active')) as active,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration
        FROM farms
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      // Get agent metrics
      const agentStats = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'running') as active,
          COUNT(*) FILTER (WHERE status = 'idle') as idle,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM agents
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      // Get task metrics
      const taskStats = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_time
        FROM tasks
        WHERE type = 'quick' AND created_at > NOW() - INTERVAL '24 hours'
      `);

      // Get resource metrics from ResourceManager
      const resourceStats = ResourceManager.getInstance().getStatistics();

      // Calculate response time percentiles
      const sortedResponseTimes = [...this.responseTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sortedResponseTimes.length * 0.95);
      const p99Index = Math.floor(sortedResponseTimes.length * 0.99);

      return {
        requests: {
          total: this.requestCounts.total,
          success: this.requestCounts.success,
          errors: this.requestCounts.errors,
          avgResponseTime: this.calculateAverage(this.responseTimes),
          p95ResponseTime: sortedResponseTimes[p95Index] || 0,
          p99ResponseTime: sortedResponseTimes[p99Index] || 0
        },
        farms: {
          total: parseInt(farmStats.rows[0]?.total || '0'),
          active: parseInt(farmStats.rows[0]?.active || '0'),
          completed: parseInt(farmStats.rows[0]?.completed || '0'),
          failed: parseInt(farmStats.rows[0]?.failed || '0'),
          avgDuration: parseFloat(farmStats.rows[0]?.avg_duration || '0')
        },
        agents: {
          total: parseInt(agentStats.rows[0]?.total || '0'),
          active: parseInt(agentStats.rows[0]?.active || '0'),
          idle: parseInt(agentStats.rows[0]?.idle || '0'),
          failed: parseInt(agentStats.rows[0]?.failed || '0'),
          recovered: 0 // Would need to track recoveries
        },
        tasks: {
          quickTasks: parseInt(taskStats.rows[0]?.total || '0'),
          quickTasksCompleted: parseInt(taskStats.rows[0]?.completed || '0'),
          quickTasksFailed: parseInt(taskStats.rows[0]?.failed || '0'),
          avgQuickTaskTime: parseFloat(taskStats.rows[0]?.avg_time || '0')
        },
        websockets: {
          connections: this.io?.sockets.sockets.size || 0,
          messagesIn: 0, // Would need to track
          messagesOut: 0,
          avgLatency: 0
        },
        database: {
          poolSize: 20, // From configuration
          activeConnections: 0, // Would need to get from pool
          waitingConnections: 0,
          queryCount: this.queryTimes.length,
          avgQueryTime: this.calculateAverage(this.queryTimes)
        },
        cache: {
          hits: 0, // Would need to track from Redis
          misses: 0,
          hitRate: 0,
          memoryUsage: 0
        },
        resources: {
          buffers: {
            count: resourceStats.pools.buffer.count,
            totalSize: resourceStats.pools.buffer.totalSize
          },
          connections: {
            count: resourceStats.pools.connection.count,
            types: {} // Would need to track connection types
          },
          sessions: {
            count: resourceStats.pools.session.count,
            avgLifetime: 0 // Would need to track
          },
          timers: {
            active: resourceStats.pools.timer.count,
            cleared: 0 // Would need to track
          }
        }
      };
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to get application metrics', error);
      return this.getEmptyApplicationMetrics();
    }
  }

  /**
   * Get rate limit metrics
   */
  private async getRateLimitMetrics(): Promise<RateLimitMetrics> {
    try {
      const keys = await redis.keys('ratelimit:*');
      const endpoints: Record<string, any> = {};

      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          const endpoint = key.replace('ratelimit:', '');
          endpoints[endpoint] = {
            requests: parsed.tokens,
            blocked: 0, // Would need to track
            remaining: parsed.burstCapacity - parsed.tokens,
            resetTime: new Date(parsed.lastRefill)
          };
        }
      }

      return {
        endpoints,
        users: {} // Would need to track user-specific limits
      };
    } catch (error) {
      logger.error(LogCategory.MONITORING, 'Failed to get rate limit metrics', error);
      return { endpoints: {}, users: {} };
    }
  }

  /**
   * Perform health checks
   */
  private async performHealthChecks(): Promise<HealthStatus> {
    const services = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkWebSocket(),
      this.checkTmux(),
      this.checkAIProvider()
    ]);

    const [database, redisHealth, websocket, tmux, aiProvider] = services;

    // Determine overall health status
    const unhealthyServices = services.filter(s => s.status === 'down').length;
    const degradedServices = services.filter(s => s.status === 'degraded').length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyServices > 0) {
      status = 'unhealthy';
      this.createAlert('critical', `${unhealthyServices} services are down`);
    } else if (degradedServices > 0) {
      status = 'degraded';
      this.createAlert('warning', `${degradedServices} services are degraded`);
    }

    // Get circuit breaker states
    const circuitBreakers: Record<string, 'closed' | 'open' | 'half-open'> = {};
    ['openai', 'anthropic', 'ollama'].forEach(service => {
      circuitBreakers[service] = apiCircuitBreaker.getState(service) as any;
    });

    return {
      status,
      timestamp: new Date(),
      services: {
        database,
        redis: redisHealth,
        websocket,
        tmux,
        aiProvider
      },
      circuitBreakers,
      alerts: this.alerts.filter(a => !a.acknowledged)
    };
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<ServiceHealth> {
    const start = performance.now();
    try {
      await db.query('SELECT 1');
      const latency = performance.now() - start;
      return {
        status: latency < 100 ? 'up' : 'degraded',
        latency,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'down',
        latency: performance.now() - start,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedis(): Promise<ServiceHealth> {
    const start = performance.now();
    try {
      await redis.ping();
      const latency = performance.now() - start;
      return {
        status: latency < 50 ? 'up' : 'degraded',
        latency,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'down',
        latency: performance.now() - start,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check WebSocket health
   */
  private async checkWebSocket(): Promise<ServiceHealth> {
    return {
      status: this.io ? 'up' : 'down',
      latency: 0,
      lastCheck: new Date()
    };
  }

  /**
   * Check tmux health
   */
  private async checkTmux(): Promise<ServiceHealth> {
    const start = performance.now();
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execPromise = promisify(exec);

      await execPromise('TMUX_TMPDIR=/tmp tmux list-sessions');
      const latency = performance.now() - start;

      return {
        status: 'up',
        latency,
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'degraded', // Tmux might not be running but system can work without it
        latency: performance.now() - start,
        lastCheck: new Date(),
        error: 'Tmux not available'
      };
    }
  }

  /**
   * Check AI provider health
   */
  private async checkAIProvider(): Promise<ServiceHealth> {
    // Check if any AI provider is available
    const providers = ['openai', 'anthropic', 'ollama'];

    for (const provider of providers) {
      const state = apiCircuitBreaker.getState(provider);
      if (state === 'closed') {
        return {
          status: 'up',
          latency: 0,
          lastCheck: new Date()
        };
      }
    }

    return {
      status: 'degraded',
      latency: 0,
      lastCheck: new Date(),
      error: 'All AI providers circuit breakers are open'
    };
  }

  /**
   * Get health status
   */
  private async getHealthStatus(): Promise<HealthStatus> {
    return await this.performHealthChecks();
  }

  /**
   * Record request metric
   */
  recordRequest(responseTime: number, success: boolean): void {
    this.requestCounts.total++;
    if (success) {
      this.requestCounts.success++;
    } else {
      this.requestCounts.errors++;
    }

    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > this.MAX_METRICS_HISTORY) {
      this.responseTimes.shift();
    }
  }

  /**
   * Record query metric
   */
  recordQuery(queryTime: number): void {
    this.queryTimes.push(queryTime);
    if (this.queryTimes.length > this.MAX_METRICS_HISTORY) {
      this.queryTimes.shift();
    }
  }

  /**
   * Create an alert
   */
  createAlert(level: 'info' | 'warning' | 'critical', message: string): void {
    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      level,
      message,
      timestamp: new Date(),
      acknowledged: false
    };

    this.alerts.unshift(alert);
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts.pop();
    }

    this.broadcastAlert(alert);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.io?.emit('monitoring:alert-acknowledged', alertId);
    }
  }

  /**
   * Broadcast metrics to connected clients
   */
  private broadcastMetrics(metrics: any): void {
    if (this.io) {
      this.io.to('monitoring:metrics').emit('monitoring:metrics', metrics);
    }
  }

  /**
   * Broadcast health status to connected clients
   */
  private broadcastHealth(health: HealthStatus): void {
    if (this.io) {
      this.io.to('monitoring:health').emit('monitoring:health', health);
    }
  }

  /**
   * Broadcast alert to connected clients
   */
  private broadcastAlert(alert: Alert): void {
    if (this.io) {
      this.io.emit('monitoring:alert', alert);
    }
  }

  /**
   * Calculate average
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Get empty application metrics
   */
  private getEmptyApplicationMetrics(): ApplicationMetrics {
    return {
      requests: {
        total: 0,
        success: 0,
        errors: 0,
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0
      },
      farms: {
        total: 0,
        active: 0,
        completed: 0,
        failed: 0,
        avgDuration: 0
      },
      agents: {
        total: 0,
        active: 0,
        idle: 0,
        failed: 0,
        recovered: 0
      },
      tasks: {
        quickTasks: 0,
        quickTasksCompleted: 0,
        quickTasksFailed: 0,
        avgQuickTaskTime: 0
      },
      websockets: {
        connections: 0,
        messagesIn: 0,
        messagesOut: 0,
        avgLatency: 0
      },
      database: {
        poolSize: 0,
        activeConnections: 0,
        waitingConnections: 0,
        queryCount: 0,
        avgQueryTime: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        memoryUsage: 0
      },
      resources: {
        buffers: { count: 0, totalSize: 0 },
        connections: { count: 0, types: {} },
        sessions: { count: 0, avgLifetime: 0 },
        timers: { active: 0, cleared: 0 }
      }
    };
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

export const monitoringDashboard = MonitoringDashboardService.getInstance();