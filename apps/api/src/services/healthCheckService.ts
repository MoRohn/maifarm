/**
 * Comprehensive Health Check Service
 * Provides readiness, liveness, and detailed health status
 */

import { db } from '../database/connection';
import { getPaths } from '../config/paths';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/logger';
import { memoryManager } from '../utils/memoryManager';
import { websocketManager } from '../websocket/websocketManager';
import { initializationManager } from './initializationManager';
import * as os from 'os';
import * as fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const access = promisify(fs.access);

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
  latency?: number;
  metadata?: Record<string, any>;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: Date;
  version: string;
  uptime: number;
  components: ComponentHealth[];
  metrics: {
    cpu: {
      usage: number;
      loadAverage: number[];
    };
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    connections: {
      websocket: number;
      database: number;
    };
  };
}

export class HealthCheckService {
  private static instance: HealthCheckService;
  private startTime: Date;
  private lastCheck: Date | null = null;
  private healthCache: SystemHealth | null = null;
  private readonly CACHE_TTL = 5000; // 5 seconds
  
  private constructor() {
    this.startTime = new Date();
  }
  
  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }
  
  /**
   * Liveness probe - checks if service is alive
   * Used by load balancers to restart unhealthy instances
   */
  async getLiveness(): Promise<{ alive: boolean; message: string }> {
    try {
      // Simple check - if we can respond, we're alive
      return {
        alive: true,
        message: 'Service is alive'
      };
    } catch (error) {
      return {
        alive: false,
        message: 'Service is not responding'
      };
    }
  }
  
  /**
   * Readiness probe - checks if service is ready to accept requests
   * Used by load balancers to route traffic
   */
  async getReadiness(): Promise<{ ready: boolean; message: string; checks: ComponentHealth[] }> {
    const checks: ComponentHealth[] = [];
    
    // Check critical components
    checks.push(await this.checkDatabase());
    checks.push(await this.checkFileSystem());
    checks.push(await this.checkInitialization());
    
    const criticalFailures = checks.filter(c => 
      c.status === HealthStatus.UNHEALTHY && 
      ['Database', 'FileSystem', 'Initialization'].includes(c.name)
    );
    
    const ready = criticalFailures.length === 0;
    
    return {
      ready,
      message: ready ? 'Service is ready' : `Service not ready: ${criticalFailures.map(c => c.name).join(', ')} failed`,
      checks
    };
  }
  
  /**
   * Comprehensive health check
   */
  async getHealth(): Promise<SystemHealth> {
    // Return cached result if still valid
    if (this.healthCache && this.lastCheck) {
      const age = Date.now() - this.lastCheck.getTime();
      if (age < this.CACHE_TTL) {
        return this.healthCache;
      }
    }
    
    const components: ComponentHealth[] = [];
    
    // Check all components
    components.push(await this.checkDatabase());
    components.push(await this.checkRedis());
    components.push(await this.checkWebSocket());
    components.push(await this.checkFileSystem());
    components.push(await this.checkMemory());
    components.push(await this.checkInitialization());
    components.push(await this.checkTmux());
    
    // Determine overall status
    const unhealthyCount = components.filter(c => c.status === HealthStatus.UNHEALTHY).length;
    const degradedCount = components.filter(c => c.status === HealthStatus.DEGRADED).length;
    
    let overallStatus: HealthStatus;
    if (unhealthyCount > 0) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (degradedCount > 0) {
      overallStatus = HealthStatus.DEGRADED;
    } else {
      overallStatus = HealthStatus.HEALTHY;
    }
    
    // Get system metrics
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    const loadAvg = os.loadavg();
    
    const health: SystemHealth = {
      status: overallStatus,
      timestamp: new Date(),
      version: process.env.npm_package_version || '2.0.0',
      uptime: Date.now() - this.startTime.getTime(),
      components,
      metrics: {
        cpu: {
          usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
          loadAverage: loadAvg
        },
        memory: {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal,
          percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        },
        connections: {
          websocket: this.getWebSocketConnections(),
          database: await this.getDatabaseConnections()
        }
      }
    };
    
    // Cache the result
    this.healthCache = health;
    this.lastCheck = new Date();
    
    return health;
  }
  
  /**
   * Check database health
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const result = await db.query('SELECT NOW() as time, version() as version');
      const latency = Date.now() - startTime;
      
      if (latency > 1000) {
        return {
          name: 'Database',
          status: HealthStatus.DEGRADED,
          message: 'High latency detected',
          latency,
          metadata: {
            version: result.rows[0].version
          }
        };
      }
      
      return {
        name: 'Database',
        status: HealthStatus.HEALTHY,
        message: 'PostgreSQL is responsive',
        latency,
        metadata: {
          version: result.rows[0].version,
          time: result.rows[0].time
        }
      };
    } catch (error: any) {
      return {
        name: 'Database',
        status: HealthStatus.UNHEALTHY,
        message: `Database error: ${error.message}`,
        latency: Date.now() - startTime
      };
    }
  }
  
  /**
   * Check Redis health
   */
  private async checkRedis(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const { redisClient } = await import('./unified/cacheService');
      
      if (!redisClient.isOpen) {
        return {
          name: 'Redis',
          status: HealthStatus.DEGRADED,
          message: 'Redis not connected (non-critical)',
          latency: Date.now() - startTime
        };
      }
      
      await redisClient.ping();
      const latency = Date.now() - startTime;
      
      return {
        name: 'Redis',
        status: HealthStatus.HEALTHY,
        message: 'Redis is responsive',
        latency
      };
    } catch (error: any) {
      return {
        name: 'Redis',
        status: HealthStatus.DEGRADED,
        message: `Redis unavailable (non-critical): ${error.message}`,
        latency: Date.now() - startTime
      };
    }
  }
  
  /**
   * Check WebSocket health
   */
  private async checkWebSocket(): Promise<ComponentHealth> {
    try {
      const connectionCount = this.getWebSocketConnections();
      
      if (!websocketManager) {
        return {
          name: 'WebSocket',
          status: HealthStatus.UNHEALTHY,
          message: 'WebSocket manager not initialized'
        };
      }
      
      return {
        name: 'WebSocket',
        status: HealthStatus.HEALTHY,
        message: 'WebSocket server is running',
        metadata: {
          connections: connectionCount
        }
      };
    } catch (error: any) {
      return {
        name: 'WebSocket',
        status: HealthStatus.UNHEALTHY,
        message: `WebSocket error: ${error.message}`
      };
    }
  }
  
  /**
   * Check file system health
   */
  private async checkFileSystem(): Promise<ComponentHealth> {
    const {
      MAIBARN_ROOT,
      BARN_STORAGE,
      LOGS_DIR,
      TEMP_DIR,
      FARM_WORKSPACES,
      FARM_WORKSPACES_ACTIVE,
      FARM_WORKSPACES_ARCHIVED
    } = getPaths();

    const coordinationDir = path.join(MAIBARN_ROOT, 'coordination');
    const harvestsActive = path.join(MAIBARN_ROOT, 'harvests', 'active');
    const harvestsCompleted = path.join(MAIBARN_ROOT, 'harvests', 'completed');
    const terminalsDir = path.join(MAIBARN_ROOT, 'terminals');

    const criticalDirs = new Set([
      MAIBARN_ROOT,
      coordinationDir,
      harvestsActive,
      harvestsCompleted,
      terminalsDir,
      FARM_WORKSPACES,
      FARM_WORKSPACES_ACTIVE,
      FARM_WORKSPACES_ARCHIVED,
      BARN_STORAGE,
      LOGS_DIR,
      TEMP_DIR
    ]);

    
    try {
      for (const dir of criticalDirs) {
        try {
          await fs.promises.mkdir(dir, { recursive: true });
          await access(dir, fs.constants.R_OK | fs.constants.W_OK);
        } catch (error: any) {
          logger.warn(LogCategory.SYSTEM, `Filesystem check failed for ${dir}:`, error);
          throw new Error(`Failed to access ${dir}: ${error.message}`);
        }
      }

      return {
        name: 'FileSystem',
        status: HealthStatus.HEALTHY,
        message: 'File system is accessible'
      };
    } catch (error: any) {
      return {
        name: 'FileSystem',
        status: HealthStatus.UNHEALTHY,
        message: `File system error: ${error.message}`
      };
    }
  }
  
  /**
   * Check memory health
   */
  private async checkMemory(): Promise<ComponentHealth> {
    const stats = memoryManager.getMemoryStats();
    
    if (stats.percentage >= 85) {
      return {
        name: 'Memory',
        status: HealthStatus.UNHEALTHY,
        message: 'Critical memory usage',
        metadata: stats
      };
    } else if (stats.percentage >= 70) {
      return {
        name: 'Memory',
        status: HealthStatus.DEGRADED,
        message: 'High memory usage',
        metadata: stats
      };
    }
    
    return {
      name: 'Memory',
      status: HealthStatus.HEALTHY,
      message: 'Memory usage is normal',
      metadata: stats
    };
  }
  
  /**
   * Check initialization status
   */
  private async checkInitialization(): Promise<ComponentHealth> {
    const status = initializationManager.getStatus();
    
    if (!status.initialized) {
      return {
        name: 'Initialization',
        status: HealthStatus.UNHEALTHY,
        message: 'Services not initialized'
      };
    }
    
    if (status.summary.failed > 0) {
      return {
        name: 'Initialization',
        status: HealthStatus.DEGRADED,
        message: `${status.summary.failed} services failed to initialize`,
        metadata: status.summary
      };
    }
    
    return {
      name: 'Initialization',
      status: HealthStatus.HEALTHY,
      message: 'All services initialized',
      metadata: status.summary
    };
  }
  
  /**
   * Check tmux availability
   */
  private async checkTmux(): Promise<ComponentHealth> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      await execAsync('which tmux');
      const result = await execAsync('TMUX_TMPDIR=/tmp tmux list-sessions 2>/dev/null || echo "No sessions"');
      
      return {
        name: 'Tmux',
        status: HealthStatus.HEALTHY,
        message: 'Tmux is available',
        metadata: {
          output: result.stdout.trim()
        }
      };
    } catch (error: any) {
      return {
        name: 'Tmux',
        status: HealthStatus.DEGRADED,
        message: 'Tmux not available (affects farm features)',
        metadata: {
          error: error.message
        }
      };
    }
  }
  
  /**
   * Get WebSocket connection count
   */
  private getWebSocketConnections(): number {
    try {
      if (websocketManager && websocketManager.io) {
        return websocketManager.io.sockets.sockets.size;
      }
      return 0;
    } catch {
      return 0;
    }
  }
  
  /**
   * Get database connection count
   */
  private async getDatabaseConnections(): Promise<number> {
    try {
      const result = await db.query(`
        SELECT count(*) as connections 
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `);
      return parseInt(result.rows[0].connections, 10);
    } catch {
      return 0;
    }
  }
  
  /**
   * Get startup diagnostics
   */
  async getStartupDiagnostics(): Promise<{
    checks: ComponentHealth[];
    recommendations: string[];
  }> {
    const checks: ComponentHealth[] = [];
    const recommendations: string[] = [];
    
    // Run all checks
    checks.push(await this.checkDatabase());
    checks.push(await this.checkRedis());
    checks.push(await this.checkFileSystem());
    checks.push(await this.checkTmux());
    checks.push(await this.checkMemory());
    
    // Generate recommendations
    for (const check of checks) {
      if (check.status === HealthStatus.UNHEALTHY) {
        switch (check.name) {
          case 'Database':
            recommendations.push('Ensure PostgreSQL is running: brew services start postgresql@15');
            break;
          case 'Redis':
            recommendations.push('Start Redis for caching: brew services start redis');
            break;
          case 'FileSystem':
            recommendations.push('Run setup to create directories: npm run setup:all');
            break;
          case 'Tmux':
            recommendations.push('Install tmux for farm features: brew install tmux');
            break;
          case 'Memory':
            recommendations.push('High memory usage detected. Restart the server if needed.');
            break;
        }
      }
    }
    
    return { checks, recommendations };
  }
}

export const healthCheckService = HealthCheckService.getInstance();
