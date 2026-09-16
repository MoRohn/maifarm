/**
 * PerformanceMonitor - Real-time performance monitoring service
 * Tracks FPS, memory usage, load times, and other critical metrics
 */

interface PerformanceMetrics {
  fps: number;
  memory: {
    used: number;
    limit: number;
    percentage: number;
  };
  loadTime: {
    domContentLoaded: number;
    fullyLoaded: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    timeToInteractive: number;
  };
  network: {
    rtt: number;
    downlink: number;
    effectiveType: string;
  };
  resources: {
    totalSize: number;
    scripts: number;
    styles: number;
    images: number;
    fonts: number;
  };
  errors: {
    total: number;
    rate: number;
  };
}

interface PerformanceThresholds {
  fps: { good: number; fair: number };
  memory: { good: number; fair: number };
  loadTime: { good: number; fair: number };
  errorRate: { good: number; fair: number };
}

type PerformanceCallback = (metrics: PerformanceMetrics) => void;
type AlertCallback = (alert: PerformanceAlert) => void;

interface PerformanceAlert {
  type: 'fps' | 'memory' | 'loadTime' | 'error';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private thresholds: PerformanceThresholds;
  private callbacks: Set<PerformanceCallback> = new Set();
  private alertCallbacks: Set<AlertCallback> = new Set();
  private isMonitoring: boolean = false;
  private fpsFrameCount: number = 0;
  private fpsLastTime: number = 0;
  private rafId: number | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private errorCount: number = 0;
  private errorStartTime: number = Date.now();
  private observer: PerformanceObserver | null = null;

  constructor() {
    this.metrics = this.getInitialMetrics();
    this.thresholds = this.getDefaultThresholds();
    this.setupErrorTracking();
    this.setupPerformanceObserver();
  }

  /**
   * Get initial metrics structure
   */
  private getInitialMetrics(): PerformanceMetrics {
    return {
      fps: 60,
      memory: {
        used: 0,
        limit: 0,
        percentage: 0,
      },
      loadTime: {
        domContentLoaded: 0,
        fullyLoaded: 0,
        firstContentfulPaint: 0,
        largestContentfulPaint: 0,
        timeToInteractive: 0,
      },
      network: {
        rtt: 0,
        downlink: 0,
        effectiveType: 'unknown',
      },
      resources: {
        totalSize: 0,
        scripts: 0,
        styles: 0,
        images: 0,
        fonts: 0,
      },
      errors: {
        total: 0,
        rate: 0,
      },
    };
  }

  /**
   * Get default performance thresholds
   */
  private getDefaultThresholds(): PerformanceThresholds {
    return {
      fps: { good: 55, fair: 30 },
      memory: { good: 50, fair: 75 }, // Percentage
      loadTime: { good: 3000, fair: 5000 }, // Milliseconds
      errorRate: { good: 0.01, fair: 0.05 }, // Errors per minute
    };
  }

  /**
   * Setup error tracking
   */
  private setupErrorTracking(): void {
    window.addEventListener('error', () => {
      this.errorCount++;
      this.updateErrorRate();
    });

    window.addEventListener('unhandledrejection', () => {
      this.errorCount++;
      this.updateErrorRate();
    });
  }

  /**
   * Setup Performance Observer for Web Vitals
   */
  private setupPerformanceObserver(): void {
    if (!('PerformanceObserver' in window)) return;

    try {
      // Observe paint timing
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.loadTime.firstContentfulPaint = entry.startTime;
          }
        }
      });
      paintObserver.observe({ entryTypes: ['paint'] });

      // Observe largest contentful paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.metrics.loadTime.largestContentfulPaint = lastEntry.startTime;
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // Store observer for cleanup
      this.observer = paintObserver;
    } catch (error) {
      // Silently fail if Performance Observer is not supported
    }
  }

  /**
   * Start monitoring performance
   */
  public start(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.fpsLastTime = performance.now();

    // Start FPS monitoring
    this.measureFPS();

    // Start periodic metrics collection
    this.intervalId = setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
      this.notifyCallbacks();
    }, 1000); // Update every second

    // Collect initial load metrics
    this.collectLoadMetrics();
    this.collectResourceMetrics();
  }

  /**
   * Stop monitoring performance
   */
  public stop(): void {
    this.isMonitoring = false;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Measure FPS using requestAnimationFrame
   */
  private measureFPS = (): void => {
    if (!this.isMonitoring) return;

    const currentTime = performance.now();
    const delta = currentTime - this.fpsLastTime;

    this.fpsFrameCount++;

    // Calculate FPS every second
    if (delta >= 1000) {
      this.metrics.fps = Math.round((this.fpsFrameCount * 1000) / delta);
      this.fpsFrameCount = 0;
      this.fpsLastTime = currentTime;
    }

    this.rafId = requestAnimationFrame(this.measureFPS);
  };

  /**
   * Collect all metrics
   */
  private collectMetrics(): void {
    this.collectMemoryMetrics();
    this.collectNetworkMetrics();
  }

  /**
   * Collect memory metrics
   */
  private collectMemoryMetrics(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memory = {
        used: memory.usedJSHeapSize,
        limit: memory.jsHeapSizeLimit,
        percentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
      };
    }
  }

  /**
   * Collect network metrics
   */
  private collectNetworkMetrics(): void {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      this.metrics.network = {
        rtt: connection.rtt || 0,
        downlink: connection.downlink || 0,
        effectiveType: connection.effectiveType || 'unknown',
      };
    }
  }

  /**
   * Collect load time metrics
   */
  private collectLoadMetrics(): void {
    const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    if (perfData) {
      this.metrics.loadTime = {
        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
        fullyLoaded: perfData.loadEventEnd - perfData.loadEventStart,
        firstContentfulPaint: this.metrics.loadTime.firstContentfulPaint,
        largestContentfulPaint: this.metrics.loadTime.largestContentfulPaint,
        timeToInteractive: perfData.domInteractive - perfData.fetchStart,
      };
    }
  }

  /**
   * Collect resource metrics
   */
  private collectResourceMetrics(): void {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    let totalSize = 0;
    let scripts = 0;
    let styles = 0;
    let images = 0;
    let fonts = 0;

    resources.forEach((resource) => {
      const size = resource.transferSize || 0;
      totalSize += size;

      if (resource.initiatorType === 'script') {
        scripts += size;
      } else if (resource.initiatorType === 'css' || resource.initiatorType === 'link') {
        styles += size;
      } else if (resource.initiatorType === 'img' || resource.initiatorType === 'image') {
        images += size;
      } else if (resource.name.includes('font')) {
        fonts += size;
      }
    });

    this.metrics.resources = {
      totalSize,
      scripts,
      styles,
      images,
      fonts,
    };
  }

  /**
   * Update error rate
   */
  private updateErrorRate(): void {
    const timeElapsed = (Date.now() - this.errorStartTime) / 60000; // Convert to minutes
    this.metrics.errors = {
      total: this.errorCount,
      rate: timeElapsed > 0 ? this.errorCount / timeElapsed : 0,
    };
  }

  /**
   * Check performance thresholds and trigger alerts
   */
  private checkThresholds(): void {
    // Check FPS
    if (this.metrics.fps < this.thresholds.fps.fair) {
      this.triggerAlert({
        type: 'fps',
        severity: this.metrics.fps < this.thresholds.fps.fair / 2 ? 'critical' : 'warning',
        message: `Low FPS detected: ${this.metrics.fps} fps`,
        value: this.metrics.fps,
        threshold: this.thresholds.fps.fair,
        timestamp: Date.now(),
      });
    }

    // Check Memory
    if (this.metrics.memory.percentage > this.thresholds.memory.fair) {
      this.triggerAlert({
        type: 'memory',
        severity: this.metrics.memory.percentage > 90 ? 'critical' : 'warning',
        message: `High memory usage: ${this.metrics.memory.percentage.toFixed(1)}%`,
        value: this.metrics.memory.percentage,
        threshold: this.thresholds.memory.fair,
        timestamp: Date.now(),
      });
    }

    // Check Error Rate
    if (this.metrics.errors.rate > this.thresholds.errorRate.fair) {
      this.triggerAlert({
        type: 'error',
        severity: this.metrics.errors.rate > this.thresholds.errorRate.fair * 2 ? 'critical' : 'warning',
        message: `High error rate: ${this.metrics.errors.rate.toFixed(2)} errors/min`,
        value: this.metrics.errors.rate,
        threshold: this.thresholds.errorRate.fair,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Trigger performance alert
   */
  private triggerAlert(alert: PerformanceAlert): void {
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        // Prevent callback errors from breaking monitoring
      }
    });
  }

  /**
   * Notify all registered callbacks
   */
  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => {
      try {
        callback(this.metrics);
      } catch (error) {
        // Prevent callback errors from breaking monitoring
      }
    });
  }

  /**
   * Subscribe to performance metrics
   */
  public subscribe(callback: PerformanceCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Subscribe to performance alerts
   */
  public onAlert(callback: AlertCallback): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }

  /**
   * Get current metrics
   */
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Set custom thresholds
   */
  public setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get performance grade
   */
  public getGrade(): 'excellent' | 'good' | 'fair' | 'poor' {
    const { fps, memory, errors } = this.metrics;

    if (
      fps >= this.thresholds.fps.good &&
      memory.percentage <= this.thresholds.memory.good &&
      errors.rate <= this.thresholds.errorRate.good
    ) {
      return 'excellent';
    }

    if (
      fps >= this.thresholds.fps.fair &&
      memory.percentage <= this.thresholds.memory.fair &&
      errors.rate <= this.thresholds.errorRate.fair
    ) {
      return 'good';
    }

    if (
      fps >= this.thresholds.fps.fair / 2 &&
      memory.percentage <= 90 &&
      errors.rate <= this.thresholds.errorRate.fair * 2
    ) {
      return 'fair';
    }

    return 'poor';
  }

  /**
   * Mark a custom timing
   */
  public mark(name: string): void {
    performance.mark(name);
  }

  /**
   * Measure between two marks
   */
  public measure(name: string, startMark: string, endMark?: string): number {
    try {
      performance.measure(name, startMark, endMark);
      const measures = performance.getEntriesByName(name, 'measure');
      return measures[measures.length - 1]?.duration || 0;
    } catch (error) {
      return 0;
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export types
export type { PerformanceMetrics, PerformanceThresholds, PerformanceAlert };