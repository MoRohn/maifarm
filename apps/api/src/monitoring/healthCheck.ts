import { Request, Response } from 'express';
import * as os from 'os';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { metricsRegistry } from './metricsCollector';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  componentType: 'system' | 'datastore' | 'service' | 'external';
  observedValue?: any;
  observedUnit?: string;
  threshold?: any;
  message?: string;
  time: number; // Time taken for the check in ms
}

export interface HealthCheckConfig {
  database?: {
    pool: Pool;
    timeout: number;
  };
  redis?: {
    client: Redis;
    timeout: number;
  };
  externalServices?: Array<{
    name: string;
    url: string;
    timeout: number;
  }>;
  thresholds?: {
    cpu?: number;
    memory?: number;
    disk?: number;
    responseTime?: number;
  };
}

export class HealthCheckService {
  private startTime: Date;
  private config: HealthCheckConfig;
  private version: string;

  constructor(config: HealthCheckConfig = {}) {
    this.startTime = new Date();
    this.config = {
      thresholds: {
        cpu: 80,
        memory: 85,
        disk: 90,
        responseTime: 1000,
        ...config.thresholds
      },
      ...config
    };
    this.version = process.env.APP_VERSION || '1.0.0';
  }

  // Main health check endpoint
  async getHealth(): Promise<HealthStatus> {
    const checks: HealthCheck[] = [];
    const checkPromises: Promise<HealthCheck>[] = [];

    // System checks
    checkPromises.push(this.checkCPU());
    checkPromises.push(this.checkMemory());
    checkPromises.push(this.checkDisk());

    // Database check
    if (this.config.database) {
      checkPromises.push(this.checkDatabase());
    }

    // Redis check
    if (this.config.redis) {
      checkPromises.push(this.checkRedis());
    }

    // External services checks
    if (this.config.externalServices) {
      for (const service of this.config.externalServices) {
        checkPromises.push(this.checkExternalService(service));
      }
    }

    // Execute all checks in parallel
    const results = await Promise.allSettled(checkPromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        checks.push(result.value);
      } else {
        checks.push({
          name: 'unknown',
          status: 'fail',
          componentType: 'system',
          message: result.reason?.message || 'Check failed',
          time: 0
        });
      }
    }

    // Determine overall status
    const hasFailure = checks.some(check => check.status === 'fail');
    const hasWarning = checks.some(check => check.status === 'warn');
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (hasFailure) {
      status = 'unhealthy';
    } else if (hasWarning) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      version: this.version,
      checks
    };
  }

  // Liveness check - basic "is the service running"
  async getLiveness(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  }

  // Readiness check - "is the service ready to accept traffic"
  async getReadiness(): Promise<{ ready: boolean; checks: HealthCheck[] }> {
    const checks: HealthCheck[] = [];

    // Check critical dependencies
    if (this.config.database) {
      checks.push(await this.checkDatabase());
    }

    if (this.config.redis) {
      checks.push(await this.checkRedis());
    }

    const ready = checks.every(check => check.status !== 'fail');

    return { ready, checks };
  }

  // CPU check
  private async checkCPU(): Promise<HealthCheck> {
    const start = Date.now();
    const cpus = os.cpus();
    
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    const status = usage > this.config.thresholds!.cpu! ? 'warn' : 'pass';

    return {
      name: 'cpu:usage',
      status,
      componentType: 'system',
      observedValue: usage,
      observedUnit: 'percent',
      threshold: this.config.thresholds!.cpu,
      time: Date.now() - start
    };
  }

  // Memory check
  private async checkMemory(): Promise<HealthCheck> {
    const start = Date.now();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usage = Math.round((usedMemory / totalMemory) * 100);

    const status = usage > this.config.thresholds!.memory! ? 'warn' : 'pass';

    return {
      name: 'memory:usage',
      status,
      componentType: 'system',
      observedValue: usage,
      observedUnit: 'percent',
      threshold: this.config.thresholds!.memory,
      time: Date.now() - start
    };
  }

  // Disk check (simplified - checks root partition)
  private async checkDisk(): Promise<HealthCheck> {
    const start = Date.now();
    
    // This is a simplified check - in production, you'd want to use
    // a library like 'diskusage' or 'node-disk-info'
    const usage = 50; // Placeholder

    const status = usage > this.config.thresholds!.disk! ? 'warn' : 'pass';

    return {
      name: 'disk:usage',
      status,
      componentType: 'system',
      observedValue: usage,
      observedUnit: 'percent',
      threshold: this.config.thresholds!.disk,
      time: Date.now() - start
    };
  }

  // Database check
  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    const { pool, timeout } = this.config.database!;

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database check timeout')), timeout)
      );

      const queryPromise = pool.query('SELECT 1');

      await Promise.race([queryPromise, timeoutPromise]);

      return {
        name: 'database:connection',
        status: 'pass',
        componentType: 'datastore',
        time: Date.now() - start
      };
    } catch (error) {
      return {
        name: 'database:connection',
        status: 'fail',
        componentType: 'datastore',
        message: error instanceof Error ? error.message : 'Database check failed',
        time: Date.now() - start
      };
    }
  }

  // Redis check
  private async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    const { client, timeout } = this.config.redis!;

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis check timeout')), timeout)
      );

      const pingPromise = client.ping();

      await Promise.race([pingPromise, timeoutPromise]);

      return {
        name: 'redis:connection',
        status: 'pass',
        componentType: 'datastore',
        time: Date.now() - start
      };
    } catch (error) {
      return {
        name: 'redis:connection',
        status: 'fail',
        componentType: 'datastore',
        message: error instanceof Error ? error.message : 'Redis check failed',
        time: Date.now() - start
      };
    }
  }

  // External service check
  private async checkExternalService(service: {
    name: string;
    url: string;
    timeout: number;
  }): Promise<HealthCheck> {
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), service.timeout);

      const response = await fetch(service.url, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - start;
      const status = response.ok ? 'pass' : 'warn';

      return {
        name: `external:${service.name}`,
        status,
        componentType: 'external',
        observedValue: response.status,
        observedUnit: 'http_status',
        time: responseTime
      };
    } catch (error) {
      return {
        name: `external:${service.name}`,
        status: 'fail',
        componentType: 'external',
        message: error instanceof Error ? error.message : 'Service check failed',
        time: Date.now() - start
      };
    }
  }

  // Express middleware for health endpoints
  setupHealthEndpoints(app: any): void {
    // Main health endpoint - comprehensive check
    app.get('/health', async (req: Request, res: Response) => {
      try {
        const health = await this.getHealth();
        const statusCode = health.status === 'healthy' ? 200 : 
                         health.status === 'degraded' ? 200 : 503;
        
        res.status(statusCode).json(health);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Health check failed'
        });
      }
    });

    // Liveness probe - for Kubernetes
    app.get('/health/live', async (req: Request, res: Response) => {
      try {
        const liveness = await this.getLiveness();
        res.json(liveness);
      } catch (error) {
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Readiness probe - for Kubernetes
    app.get('/health/ready', async (req: Request, res: Response) => {
      try {
        const readiness = await this.getReadiness();
        res.status(readiness.ready ? 200 : 503).json(readiness);
      } catch (error) {
        res.status(503).json({
          ready: false,
          error: error instanceof Error ? error.message : 'Readiness check failed'
        });
      }
    });

    // Metrics endpoint for Prometheus
    app.get('/metrics', (req: Request, res: Response) => {
      res.set('Content-Type', metricsRegistry.contentType);
      res.end(metricsRegistry.metrics());
    });
  }
}

// Export singleton instance
export const healthCheckService = new HealthCheckService();