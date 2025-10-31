import { EventEmitter } from 'events';
import * as os from 'os';
import { performance } from 'perf_hooks';
import fetch from 'node-fetch';

interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
  critical: boolean;
  interval: number;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: any;
  latency?: number;
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
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
    connections: number;
  };
  uptime: number;
  timestamp: Date;
}

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  consecutiveFailures: number;
  details: any;
}

export class HealthMonitor extends EventEmitter {
  private checks: Map<string, HealthCheck> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private systemMetrics: SystemMetrics | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;

  constructor() {
    super();
    this.setupDefaultChecks();
    this.startMetricsCollection();
  }

  private setupDefaultChecks(): void {
    // Database health check
    this.registerCheck({
      name: 'database',
      check: this.checkDatabase.bind(this),
      critical: true,
      interval: 10000
    });

    // Redis health check
    this.registerCheck({
      name: 'redis',
      check: this.checkRedis.bind(this),
      critical: true,
      interval: 10000
    });

    // API health check
    this.registerCheck({
      name: 'api',
      check: this.checkAPI.bind(this),
      critical: true,
      interval: 15000
    });

    // Disk space check
    this.registerCheck({
      name: 'disk',
      check: this.checkDiskSpace.bind(this),
      critical: false,
      interval: 60000
    });

    // Memory check
    this.registerCheck({
      name: 'memory',
      check: this.checkMemory.bind(this),
      critical: false,
      interval: 30000
    });

    // CPU check
    this.registerCheck({
      name: 'cpu',
      check: this.checkCPU.bind(this),
      critical: false,
      interval: 30000
    });
  }

  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
    
    // Initialize service health
    this.serviceHealth.set(check.name, {
      name: check.name,
      status: 'healthy',
      lastCheck: new Date(),
      consecutiveFailures: 0,
      details: {}
    });

    // Start periodic check
    const interval = setInterval(async () => {
      if (this.isShuttingDown) return;
      await this.performCheck(check);
    }, check.interval);

    this.checkIntervals.set(check.name, interval);

    // Perform initial check
    this.performCheck(check);
  }

  private async performCheck(check: HealthCheck): Promise<void> {
    const startTime = performance.now();
    
    try {
      const result = await check.check();
      const latency = performance.now() - startTime;
      
      const health = this.serviceHealth.get(check.name)!;
      health.status = result.status;
      health.lastCheck = new Date();
      health.details = {
        ...result.details,
        latency: `${latency.toFixed(2)}ms`
      };

      if (result.status === 'healthy') {
        health.consecutiveFailures = 0;
      } else {
        health.consecutiveFailures++;
      }

      this.emit('health:check:complete', {
        service: check.name,
        result,
        latency
      });

      // Alert on critical service failure
      if (check.critical && result.status === 'unhealthy') {
        this.emit('health:critical', {
          service: check.name,
          message: result.message || 'Critical service unhealthy',
          details: result.details
        });
      }
    } catch (error) {
      const health = this.serviceHealth.get(check.name)!;
      health.status = 'unhealthy';
      health.lastCheck = new Date();
      health.consecutiveFailures++;
      health.details = {
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.emit('health:check:failed', {
        service: check.name,
        error
      });
    }
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    try {
      // This would be replaced with actual database check
      // For example, executing a simple query
      const mockDbLatency = Math.random() * 50;
      
      await new Promise(resolve => setTimeout(resolve, mockDbLatency));
      
      return {
        status: mockDbLatency < 100 ? 'healthy' : 'degraded',
        details: {
          latency: mockDbLatency,
          connections: 10,
          activeQueries: 2
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Database connection failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    try {
      // This would be replaced with actual Redis ping
      const mockRedisLatency = Math.random() * 20;
      
      await new Promise(resolve => setTimeout(resolve, mockRedisLatency));
      
      return {
        status: mockRedisLatency < 50 ? 'healthy' : 'degraded',
        details: {
          latency: mockRedisLatency,
          memory: '128MB',
          connectedClients: 5
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Redis connection failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkAPI(): Promise<HealthCheckResult> {
    try {
      const startTime = performance.now();
      const response = await fetch('http://localhost:3000/api/health', {
        method: 'GET',
        timeout: 5000
      });
      
      const latency = performance.now() - startTime;
      
      if (response.ok) {
        return {
          status: latency < 1000 ? 'healthy' : 'degraded',
          details: {
            statusCode: response.status,
            latency
          }
        };
      } else {
        return {
          status: 'unhealthy',
          message: `API returned ${response.status}`,
          details: {
            statusCode: response.status,
            latency
          }
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'API health check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkDiskSpace(): Promise<HealthCheckResult> {
    const disk = this.getDiskUsage();
    
    if (disk.percentage > 90) {
      return {
        status: 'unhealthy',
        message: 'Disk space critical',
        details: disk
      };
    } else if (disk.percentage > 80) {
      return {
        status: 'degraded',
        message: 'Disk space warning',
        details: disk
      };
    }
    
    return {
      status: 'healthy',
      details: disk
    };
  }

  private async checkMemory(): Promise<HealthCheckResult> {
    const memory = this.getMemoryUsage();
    
    if (memory.percentage > 90) {
      return {
        status: 'unhealthy',
        message: 'Memory usage critical',
        details: memory
      };
    } else if (memory.percentage > 80) {
      return {
        status: 'degraded',
        message: 'Memory usage high',
        details: memory
      };
    }
    
    return {
      status: 'healthy',
      details: memory
    };
  }

  private async checkCPU(): Promise<HealthCheckResult> {
    const cpu = this.getCPUUsage();
    
    if (cpu.usage > 90) {
      return {
        status: 'unhealthy',
        message: 'CPU usage critical',
        details: cpu
      };
    } else if (cpu.usage > 70) {
      return {
        status: 'degraded',
        message: 'CPU usage high',
        details: cpu
      };
    }
    
    return {
      status: 'healthy',
      details: cpu
    };
  }

  private startMetricsCollection(): void {
    this.collectSystemMetrics();
    
    this.metricsInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      this.collectSystemMetrics();
    }, 5000);
  }

  private collectSystemMetrics(): void {
    this.systemMetrics = {
      cpu: this.getCPUUsage(),
      memory: this.getMemoryUsage(),
      disk: this.getDiskUsage(),
      network: this.getNetworkUsage(),
      uptime: process.uptime(),
      timestamp: new Date()
    };

    this.emit('metrics:collected', this.systemMetrics);
  }

  private getCPUUsage(): SystemMetrics['cpu'] {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();
    
    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });
    
    const usage = 100 - ((totalIdle / totalTick) * 100);
    
    return {
      usage: Math.round(usage * 100) / 100,
      loadAverage,
      cores: cpus.length
    };
  }

  private getMemoryUsage(): SystemMetrics['memory'] {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const percentage = (used / total) * 100;
    
    return {
      total: total / 1024 / 1024, // Convert to MB
      used: used / 1024 / 1024,
      free: free / 1024 / 1024,
      percentage: Math.round(percentage * 100) / 100
    };
  }

  private getDiskUsage(): SystemMetrics['disk'] {
    // This is a simplified version
    // In production, you'd use a library like 'diskusage'
    const total = 100 * 1024 * 1024 * 1024; // 100GB mock
    const used = 45 * 1024 * 1024 * 1024; // 45GB mock
    const free = total - used;
    const percentage = (used / total) * 100;
    
    return {
      total: total / 1024 / 1024 / 1024, // Convert to GB
      used: used / 1024 / 1024 / 1024,
      free: free / 1024 / 1024 / 1024,
      percentage: Math.round(percentage * 100) / 100
    };
  }

  private getNetworkUsage(): SystemMetrics['network'] {
    // This is a simplified version
    // In production, you'd track actual network I/O
    return {
      rx: Math.random() * 1000, // KB/s
      tx: Math.random() * 1000, // KB/s
      connections: Math.floor(Math.random() * 100)
    };
  }

  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
    metrics: SystemMetrics | null;
    uptime: number;
  } {
    const services = Array.from(this.serviceHealth.values());
    const criticalServices = Array.from(this.checks.entries())
      .filter(([_, check]) => check.critical)
      .map(([name]) => name);
    
    // Check critical services
    const criticalUnhealthy = services.filter(s => 
      criticalServices.includes(s.name) && s.status === 'unhealthy'
    );
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (criticalUnhealthy.length > 0) {
      overallStatus = 'unhealthy';
    } else if (services.some(s => s.status === 'unhealthy' || s.status === 'degraded')) {
      overallStatus = 'degraded';
    }
    
    return {
      status: overallStatus,
      services,
      metrics: this.systemMetrics,
      uptime: process.uptime()
    };
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    // Clear all intervals
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    this.emit('shutdown');
  }
}

// Singleton instance
let monitorInstance: HealthMonitor | null = null;

export function getHealthMonitor(): HealthMonitor {
  if (!monitorInstance) {
    monitorInstance = new HealthMonitor();
  }
  return monitorInstance;
}