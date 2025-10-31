/**
 * Performance Monitoring Service
 * Tracks application performance metrics and reports to analytics
 */

interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percent';
  tags?: Record<string, string>;
  timestamp?: number;
}

interface PerformanceReport {
  metrics: PerformanceMetric[];
  metadata: {
    userAgent: string;
    connectionType?: string;
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
}

class PerformanceMonitoringService {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private observer: PerformanceObserver | null = null;
  private reportingInterval: number = 60000; // 1 minute
  private reportingTimer: NodeJS.Timeout | null = null;
  private apiEndpoint = import.meta.env.VITE_METRICS_API || '/api/metrics';

  /**
   * Initialize performance monitoring
   */
  initialize() {
    this.setupPerformanceObserver();
    this.measureCoreWebVitals();
    this.startReportingCycle();
    this.trackResourceUsage();

    console.log('[PerformanceMonitoring] Initialized');
  }

  /**
   * Setup PerformanceObserver for various metrics
   */
  private setupPerformanceObserver() {
    if (!window.PerformanceObserver) {
      console.warn('[PerformanceMonitoring] PerformanceObserver not supported');
      return;
    }

    try {
      // Observe navigation timing
      const navigationObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            this.recordNavigationMetrics(entry as PerformanceNavigationTiming);
          }
        }
      });
      navigationObserver.observe({ entryTypes: ['navigation'] });

      // Observe resource timing
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            this.recordResourceMetrics(entry as PerformanceResourceTiming);
          }
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });

      // Observe long tasks
      const taskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric({
            name: 'long_task',
            value: entry.duration,
            unit: 'ms',
            tags: {
              taskName: entry.name,
            },
          });
        }
      });
      taskObserver.observe({ entryTypes: ['longtask'] });

      this.observer = navigationObserver;
    } catch (error) {
      console.error('[PerformanceMonitoring] Failed to setup observer:', error);
    }
  }

  /**
   * Measure Core Web Vitals
   */
  private measureCoreWebVitals() {
    // Largest Contentful Paint (LCP)
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as any;
      this.recordMetric({
        name: 'lcp',
        value: lastEntry.renderTime || lastEntry.loadTime,
        unit: 'ms',
        tags: { vital: 'true' },
      });
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    // First Input Delay (FID)
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        this.recordMetric({
          name: 'fid',
          value: entry.processingStart - entry.startTime,
          unit: 'ms',
          tags: { vital: 'true' },
        });
      });
    }).observe({ type: 'first-input', buffered: true });

    // Cumulative Layout Shift (CLS)
    let clsValue = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
      this.recordMetric({
        name: 'cls',
        value: clsValue,
        unit: 'count',
        tags: { vital: 'true' },
      });
    }).observe({ type: 'layout-shift', buffered: true });
  }

  /**
   * Record navigation metrics
   */
  private recordNavigationMetrics(entry: PerformanceNavigationTiming) {
    const metrics: PerformanceMetric[] = [
      {
        name: 'page_load_time',
        value: entry.loadEventEnd - entry.fetchStart,
        unit: 'ms',
      },
      {
        name: 'dom_content_loaded',
        value: entry.domContentLoadedEventEnd - entry.fetchStart,
        unit: 'ms',
      },
      {
        name: 'time_to_first_byte',
        value: entry.responseStart - entry.requestStart,
        unit: 'ms',
      },
      {
        name: 'dns_lookup',
        value: entry.domainLookupEnd - entry.domainLookupStart,
        unit: 'ms',
      },
      {
        name: 'tcp_connection',
        value: entry.connectEnd - entry.connectStart,
        unit: 'ms',
      },
    ];

    metrics.forEach(metric => this.recordMetric(metric));
  }

  /**
   * Record resource loading metrics
   */
  private recordResourceMetrics(entry: PerformanceResourceTiming) {
    // Track only significant resources
    if (entry.duration > 100) {
      const resourceType = this.getResourceType(entry.name);

      this.recordMetric({
        name: `resource_load_${resourceType}`,
        value: entry.duration,
        unit: 'ms',
        tags: {
          resource: entry.name.split('/').pop() || 'unknown',
          type: resourceType,
          size: entry.transferSize?.toString() || '0',
        },
      });
    }
  }

  /**
   * Get resource type from URL
   */
  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'style';
    if (/\.(png|jpg|jpeg|gif|webp|svg)/.test(url)) return 'image';
    if (/\.(woff|woff2|ttf|eot)/.test(url)) return 'font';
    if (url.includes('/api/')) return 'api';
    return 'other';
  }

  /**
   * Track memory and resource usage
   */
  private trackResourceUsage() {
    setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        this.recordMetric({
          name: 'js_heap_used',
          value: memory.usedJSHeapSize,
          unit: 'bytes',
        });

        this.recordMetric({
          name: 'js_heap_limit',
          value: memory.jsHeapSizeLimit,
          unit: 'bytes',
        });
      }

      // Track connection quality
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        this.recordMetric({
          name: 'connection_speed',
          value: connection.downlink || 0,
          unit: 'ms',
          tags: {
            type: connection.effectiveType || 'unknown',
          },
        });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Record a metric
   */
  recordMetric(metric: PerformanceMetric) {
    const key = metric.name;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    this.metrics.get(key)?.push({
      ...metric,
      timestamp: metric.timestamp || Date.now(),
    });

    // Keep only last 100 entries per metric
    const entries = this.metrics.get(key);
    if (entries && entries.length > 100) {
      this.metrics.set(key, entries.slice(-100));
    }
  }

  /**
   * Track custom performance marks
   */
  mark(name: string, metadata?: Record<string, unknown>) {
    performance.mark(name, { detail: metadata });
    this.recordMetric({
      name: `custom_mark_${name}`,
      value: performance.now(),
      unit: 'ms',
      tags: metadata as Record<string, string>,
    });
  }

  /**
   * Measure between two marks
   */
  measure(name: string, startMark: string, endMark: string) {
    try {
      performance.measure(name, startMark, endMark);
      const measures = performance.getEntriesByName(name, 'measure');
      const measure = measures[measures.length - 1];

      this.recordMetric({
        name: `custom_measure_${name}`,
        value: measure.duration,
        unit: 'ms',
      });

      return measure.duration;
    } catch (error) {
      console.error('[PerformanceMonitoring] Measure failed:', error);
      return 0;
    }
  }

  /**
   * Start reporting cycle
   */
  private startReportingCycle() {
    this.reportingTimer = setInterval(() => {
      this.sendReport();
    }, this.reportingInterval);
  }

  /**
   * Send performance report to backend
   */
  private async sendReport() {
    if (this.metrics.size === 0) return;

    const report: PerformanceReport = {
      metrics: Array.from(this.metrics.values()).flat(),
      metadata: {
        userAgent: navigator.userAgent,
        connectionType: (navigator as any).connection?.effectiveType,
        deviceMemory: (navigator as any).deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
      },
    };

    try {
      await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
      });

      // Clear sent metrics
      this.metrics.clear();
    } catch (error) {
      console.error('[PerformanceMonitoring] Failed to send report:', error);
    }
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary(): Record<string, number> {
    const summary: Record<string, number> = {};

    this.metrics.forEach((values, key) => {
      if (values.length > 0) {
        const sum = values.reduce((acc, v) => acc + v.value, 0);
        summary[key] = sum / values.length;
      }
    });

    return summary;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
  }

  /**
   * Cleanup monitoring
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }

    if (this.reportingTimer) {
      clearInterval(this.reportingTimer);
    }

    this.sendReport(); // Send final report
    this.metrics.clear();
  }
}

// Export singleton instance
export const performanceMonitoring = new PerformanceMonitoringService();

// Export types
export type { PerformanceMetric, PerformanceReport };