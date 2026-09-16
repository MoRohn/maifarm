/**
 * usePerformanceMonitor - React hook for performance monitoring
 * Tracks component-level performance and provides optimization insights
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { performanceMonitor, PerformanceMetrics, PerformanceAlert } from '@/services/PerformanceMonitor';
import { useCleanupManager } from '@/hooks/useCleanupManager';

interface UsePerformanceMonitorOptions {
  /**
   * Component name for tracking
   */
  componentName: string;

  /**
   * Enable automatic monitoring on mount
   */
  autoStart?: boolean;

  /**
   * Performance thresholds override
   */
  thresholds?: {
    renderTime?: number;
    updateTime?: number;
    memoryUsage?: number;
  };

  /**
   * Callback for performance alerts
   */
  onAlert?: (alert: PerformanceAlert) => void;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

interface ComponentPerformance {
  renderCount: number;
  lastRenderTime: number;
  averageRenderTime: number;
  slowRenders: number;
  memoryUsage: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
}

export function usePerformanceMonitor(options: UsePerformanceMonitorOptions) {
  const {
    componentName,
    autoStart = true,
    thresholds = {},
    onAlert,
    debug = false,
  } = options;

  const cleanup = useCleanupManager({ componentName: `PerformanceMonitor-${componentName}` });

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [componentPerf, setComponentPerf] = useState<ComponentPerformance>({
    renderCount: 0,
    lastRenderTime: 0,
    averageRenderTime: 0,
    slowRenders: 0,
    memoryUsage: 0,
    grade: 'excellent',
  });

  const renderStartRef = useRef<number>(0);
  const renderTimesRef = useRef<number[]>([]);
  const componentThresholds = useRef({
    renderTime: thresholds.renderTime || 16, // 60fps = 16ms per frame
    updateTime: thresholds.updateTime || 50,
    memoryUsage: thresholds.memoryUsage || 50, // MB
  });

  /**
   * Start performance monitoring
   */
  const startMonitoring = useCallback(() => {
    if (isMonitoring) return;

    performanceMonitor.start();
    setIsMonitoring(true);

    // Subscribe to metrics updates
    const unsubscribeMetrics = performanceMonitor.subscribe((newMetrics) => {
      setMetrics(newMetrics);
    });

    // Subscribe to alerts
    const unsubscribeAlerts = onAlert
      ? performanceMonitor.onAlert(onAlert)
      : undefined;

    // Store cleanup functions
    cleanup.addCleanup(() => {
      unsubscribeMetrics();
      unsubscribeAlerts?.();
    });

    if (debug) {
      // Debug logging
    }
  }, [isMonitoring, onAlert, cleanup, debug]);

  /**
   * Stop performance monitoring
   */
  const stopMonitoring = useCallback(() => {
    if (!isMonitoring) return;

    performanceMonitor.stop();
    setIsMonitoring(false);

    if (debug) {
      // Debug logging
    }
  }, [isMonitoring, debug]);

  /**
   * Mark the start of a render
   */
  const markRenderStart = useCallback(() => {
    renderStartRef.current = performance.now();
    performanceMonitor.mark(`${componentName}-render-start`);
  }, [componentName]);

  /**
   * Mark the end of a render and calculate metrics
   */
  const markRenderEnd = useCallback(() => {
    if (renderStartRef.current === 0) return;

    const renderTime = performance.now() - renderStartRef.current;
    performanceMonitor.mark(`${componentName}-render-end`);
    performanceMonitor.measure(
      `${componentName}-render`,
      `${componentName}-render-start`,
      `${componentName}-render-end`
    );

    // Track render times
    renderTimesRef.current.push(renderTime);
    if (renderTimesRef.current.length > 100) {
      renderTimesRef.current.shift(); // Keep last 100 renders
    }

    // Calculate statistics
    const averageTime =
      renderTimesRef.current.reduce((a, b) => a + b, 0) / renderTimesRef.current.length;
    const slowRenders = renderTimesRef.current.filter(
      (time) => time > componentThresholds.current.renderTime
    ).length;

    // Update component performance
    setComponentPerf((prev) => {
      const newPerf = {
        renderCount: prev.renderCount + 1,
        lastRenderTime: renderTime,
        averageRenderTime: averageTime,
        slowRenders,
        memoryUsage: metrics?.memory.used || prev.memoryUsage,
        grade: calculateGrade(averageTime, slowRenders, prev.renderCount),
      };

      // Check for performance issues
      if (renderTime > componentThresholds.current.updateTime) {
        if (onAlert) {
          onAlert({
            type: 'fps',
            severity: renderTime > componentThresholds.current.updateTime * 2 ? 'critical' : 'warning',
            message: `Slow render in ${componentName}: ${renderTime.toFixed(2)}ms`,
            value: renderTime,
            threshold: componentThresholds.current.updateTime,
            timestamp: Date.now(),
          });
        }
      }

      return newPerf;
    });

    renderStartRef.current = 0;
  }, [componentName, metrics, onAlert]);

  /**
   * Track a custom operation
   */
  const trackOperation = useCallback((
    operationName: string,
    operation: () => void | Promise<void>
  ) => {
    const startMark = `${componentName}-${operationName}-start`;
    const endMark = `${componentName}-${operationName}-end`;

    performanceMonitor.mark(startMark);
    const startTime = performance.now();

    const complete = () => {
      performanceMonitor.mark(endMark);
      const duration = performance.now() - startTime;
      performanceMonitor.measure(`${componentName}-${operationName}`, startMark, endMark);

      if (debug) {
        // Debug logging for operation
      }

      return duration;
    };

    const result = operation();

    if (result instanceof Promise) {
      return result.then(() => complete());
    } else {
      return complete();
    }
  }, [componentName, debug]);

  /**
   * Get performance suggestions
   */
  const getSuggestions = useCallback((): string[] => {
    const suggestions: string[] = [];

    if (componentPerf.averageRenderTime > componentThresholds.current.renderTime) {
      suggestions.push(`Consider memoizing ${componentName} - average render time is ${componentPerf.averageRenderTime.toFixed(2)}ms`);
    }

    if (componentPerf.slowRenders > componentPerf.renderCount * 0.1) {
      suggestions.push(`${componentName} has ${componentPerf.slowRenders} slow renders (>16ms) - optimize expensive computations`);
    }

    if (metrics && metrics.memory.percentage > 75) {
      suggestions.push('High memory usage detected - check for memory leaks');
    }

    if (metrics && metrics.fps < 30) {
      suggestions.push('Low FPS detected - reduce animation complexity or use CSS transforms');
    }

    return suggestions;
  }, [componentName, componentPerf, metrics]);

  /**
   * Calculate performance grade
   */
  const calculateGrade = (
    avgRenderTime: number,
    slowRenders: number,
    totalRenders: number
  ): 'excellent' | 'good' | 'fair' | 'poor' => {
    const slowRenderRatio = totalRenders > 0 ? slowRenders / totalRenders : 0;

    if (avgRenderTime <= 8 && slowRenderRatio < 0.05) {
      return 'excellent';
    } else if (avgRenderTime <= 16 && slowRenderRatio < 0.1) {
      return 'good';
    } else if (avgRenderTime <= 33 && slowRenderRatio < 0.2) {
      return 'fair';
    } else {
      return 'poor';
    }
  };

  /**
   * Reset component performance metrics
   */
  const resetMetrics = useCallback(() => {
    renderTimesRef.current = [];
    setComponentPerf({
      renderCount: 0,
      lastRenderTime: 0,
      averageRenderTime: 0,
      slowRenders: 0,
      memoryUsage: 0,
      grade: 'excellent',
    });
  }, []);

  // Auto-start monitoring if enabled
  useEffect(() => {
    if (autoStart) {
      startMonitoring();
    }

    return () => {
      if (isMonitoring) {
        stopMonitoring();
      }
    };
  }, [autoStart]);

  // Track renders automatically
  useEffect(() => {
    if (isMonitoring) {
      markRenderStart();
      return () => {
        markRenderEnd();
      };
    }
  });

  return {
    // State
    isMonitoring,
    metrics,
    componentPerformance: componentPerf,

    // Actions
    startMonitoring,
    stopMonitoring,
    markRenderStart,
    markRenderEnd,
    trackOperation,
    resetMetrics,

    // Analysis
    getSuggestions,
    grade: componentPerf.grade,
  };
}

/**
 * HOC for automatic performance monitoring
 */
export function withPerformanceMonitoring<P extends object>(
  Component: React.ComponentType<P>,
  options?: Partial<UsePerformanceMonitorOptions>
) {
  const componentName = Component.displayName || Component.name || 'Component';

  return React.forwardRef<any, P>((props, ref) => {
    const perf = usePerformanceMonitor({
      componentName,
      autoStart: true,
      ...options,
    });

    // Add performance data to props if needed
    const enhancedProps = {
      ...props,
      __performance: perf,
    } as P;

    return <Component ref={ref} {...enhancedProps} />;
  });
}