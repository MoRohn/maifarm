/**
 * Monitoring Service
 * Provides performance metrics and system monitoring
 */

import * as os from 'os';
import { EventEmitter } from 'events';

class MonitoringService extends EventEmitter {
  private static instance: MonitoringService;
  private metrics: Map<string, any> = new Map();

  private constructor() {
    super();
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  public getPerformanceMetrics() {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const loadAverage = os.loadavg();

    return {
      cpu: {
        usage: loadAverage[0] / cpus.length * 100,
        cores: cpus.length,
        loadAverage
      },
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: totalMemory - freeMemory,
        percentage: ((totalMemory - freeMemory) / totalMemory) * 100
      },
      uptime: os.uptime(),
      timestamp: new Date()
    };
  }

  public recordMetric(key: string, value: any): void {
    this.metrics.set(key, {
      value,
      timestamp: new Date()
    });
    this.emit('metric:recorded', { key, value });
  }

  public getMetric(key: string): any {
    return this.metrics.get(key);
  }

  public getAllMetrics(): Map<string, any> {
    return new Map(this.metrics);
  }
}

export const monitoringService = MonitoringService.getInstance();