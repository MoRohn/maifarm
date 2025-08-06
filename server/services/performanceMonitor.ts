/**
 * Performance Monitor for AI Provider Integration
 * Tracks and optimizes performance metrics for Claude and Qwen3-Coder
 */

import { EventEmitter } from 'events';
import { promisify } from 'util';

interface PerformanceMetric {
  timestamp: Date;
  provider: 'claude' | 'qwen';
  farmId: string;
  agentId?: string;
  metricType: 'latency' | 'throughput' | 'tokens' | 'error' | 'cost';
  value: number;
  metadata?: Record<string, any>;
}

interface ProviderPerformance {
  provider: 'claude' | 'qwen';
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  errorRate: number;
  totalTokens: number;
  estimatedCost: number;
  uptime: number;
  lastUpdated: Date;
}

interface PerformanceAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  provider: 'claude' | 'qwen';
  metric: string;
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: Date;
}

export class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetric[] = [];
  private alerts: PerformanceAlert[] = [];
  private performanceCache: Map<string, ProviderPerformance> = new Map();
  
  // Performance thresholds
  private thresholds = {
    claude: {
      maxLatency: 5000, // 5 seconds
      minThroughput: 10, // tokens/second
      maxErrorRate: 0.05, // 5%
      costPerMillion: 15.0 // $15 per million tokens
    },
    qwen: {
      maxLatency: 3000, // 3 seconds (faster due to optimization)
      minThroughput: 15, // tokens/second
      maxErrorRate: 0.10, // 10% (more tolerant for free tier)
      costPerMillion: 0 // Free!
    }
  };

  // Sliding window for metrics (1 hour)
  private metricsWindow = 60 * 60 * 1000;

  constructor() {
    super();
    this.startMonitoring();
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: new Date()
    };

    this.metrics.push(fullMetric);
    this.cleanOldMetrics();
    this.updatePerformanceCache(metric.provider);
    this.checkThresholds(metric.provider);

    this.emit('metric:recorded', fullMetric);
  }

  /**
   * Record API latency
   */
  recordLatency(provider: 'claude' | 'qwen', farmId: string, latencyMs: number): void {
    this.recordMetric({
      provider,
      farmId,
      metricType: 'latency',
      value: latencyMs
    });
  }

  /**
   * Record token usage
   */
  recordTokenUsage(
    provider: 'claude' | 'qwen', 
    farmId: string, 
    tokens: number,
    type: 'input' | 'output'
  ): void {
    this.recordMetric({
      provider,
      farmId,
      metricType: 'tokens',
      value: tokens,
      metadata: { type }
    });
  }

  /**
   * Record error
   */
  recordError(provider: 'claude' | 'qwen', farmId: string, error: any): void {
    this.recordMetric({
      provider,
      farmId,
      metricType: 'error',
      value: 1,
      metadata: {
        errorType: error.code || 'unknown',
        message: error.message
      }
    });
  }

  /**
   * Get current performance stats for a provider
   */
  getProviderPerformance(provider: 'claude' | 'qwen'): ProviderPerformance | null {
    return this.performanceCache.get(provider) || null;
  }

  /**
   * Compare provider performance
   */
  compareProviders(): {
    recommendation: 'claude' | 'qwen';
    comparison: Record<string, { claude: number; qwen: number; winner: string }>;
    reasons: string[];
  } {
    const claudePerf = this.getProviderPerformance('claude');
    const qwenPerf = this.getProviderPerformance('qwen');

    if (!claudePerf || !qwenPerf) {
      return {
        recommendation: 'claude',
        comparison: {},
        reasons: ['Insufficient data for comparison']
      };
    }

    const comparison: Record<string, { claude: number; qwen: number; winner: string }> = {
      latency: {
        claude: claudePerf.avgLatency,
        qwen: qwenPerf.avgLatency,
        winner: claudePerf.avgLatency < qwenPerf.avgLatency ? 'claude' : 'qwen'
      },
      throughput: {
        claude: claudePerf.throughput,
        qwen: qwenPerf.throughput,
        winner: claudePerf.throughput > qwenPerf.throughput ? 'claude' : 'qwen'
      },
      errorRate: {
        claude: claudePerf.errorRate,
        qwen: qwenPerf.errorRate,
        winner: claudePerf.errorRate < qwenPerf.errorRate ? 'claude' : 'qwen'
      },
      cost: {
        claude: claudePerf.estimatedCost,
        qwen: qwenPerf.estimatedCost,
        winner: 'qwen' // Always wins on cost (free)
      }
    };

    // Calculate recommendation
    const reasons: string[] = [];
    let qwenScore = 0;
    let claudeScore = 0;

    // Weighted scoring
    if (comparison.latency.winner === 'qwen') {
      qwenScore += 2;
      reasons.push('Qwen has lower latency');
    } else {
      claudeScore += 2;
      reasons.push('Claude has lower latency');
    }

    if (comparison.throughput.winner === 'qwen') {
      qwenScore += 2;
      reasons.push('Qwen has higher throughput');
    } else {
      claudeScore += 2;
      reasons.push('Claude has higher throughput');
    }

    if (comparison.errorRate.winner === 'qwen') {
      qwenScore += 1;
      reasons.push('Qwen has lower error rate');
    } else {
      claudeScore += 1;
      reasons.push('Claude has lower error rate');
    }

    // Cost is heavily weighted for Qwen
    qwenScore += 3;
    reasons.push('Qwen is free to use');

    // Context window advantage for Qwen
    qwenScore += 1;
    reasons.push('Qwen supports larger context windows (256K+)');

    const recommendation = qwenScore > claudeScore ? 'qwen' : 'claude';

    return { recommendation, comparison, reasons };
  }

  /**
   * Get performance report
   */
  getPerformanceReport(provider?: 'claude' | 'qwen'): {
    summary: Record<string, ProviderPerformance>;
    alerts: PerformanceAlert[];
    recommendations: string[];
  } {
    const summary: Record<string, ProviderPerformance> = {};
    
    if (provider) {
      const perf = this.getProviderPerformance(provider);
      if (perf) summary[provider] = perf;
    } else {
      const claudePerf = this.getProviderPerformance('claude');
      const qwenPerf = this.getProviderPerformance('qwen');
      if (claudePerf) summary.claude = claudePerf;
      if (qwenPerf) summary.qwen = qwenPerf;
    }

    const activeAlerts = this.alerts.filter(a => 
      !provider || a.provider === provider
    );

    const recommendations = this.generateRecommendations(summary);

    return { summary, alerts: activeAlerts, recommendations };
  }

  /**
   * Update performance cache
   */
  private updatePerformanceCache(provider: 'claude' | 'qwen'): void {
    const recentMetrics = this.metrics.filter(m => 
      m.provider === provider &&
      Date.now() - m.timestamp.getTime() < this.metricsWindow
    );

    if (recentMetrics.length === 0) return;

    // Calculate latency stats
    const latencyMetrics = recentMetrics
      .filter(m => m.metricType === 'latency')
      .map(m => m.value)
      .sort((a, b) => a - b);

    const avgLatency = latencyMetrics.length > 0
      ? latencyMetrics.reduce((sum, val) => sum + val, 0) / latencyMetrics.length
      : 0;

    const p95Index = Math.floor(latencyMetrics.length * 0.95);
    const p99Index = Math.floor(latencyMetrics.length * 0.99);
    const p95Latency = latencyMetrics[p95Index] || avgLatency;
    const p99Latency = latencyMetrics[p99Index] || avgLatency;

    // Calculate throughput
    const tokenMetrics = recentMetrics.filter(m => m.metricType === 'tokens');
    const totalTokens = tokenMetrics.reduce((sum, m) => sum + m.value, 0);
    const timeSpan = recentMetrics.length > 0
      ? (Date.now() - recentMetrics[0].timestamp.getTime()) / 1000
      : 1;
    const throughput = totalTokens / timeSpan;

    // Calculate error rate
    const errorCount = recentMetrics.filter(m => m.metricType === 'error').length;
    const totalRequests = latencyMetrics.length + errorCount;
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;

    // Calculate cost
    const costPerToken = this.thresholds[provider].costPerMillion / 1000000;
    const estimatedCost = totalTokens * costPerToken;

    // Calculate uptime
    const oldestMetric = recentMetrics[0];
    const uptime = oldestMetric
      ? (Date.now() - oldestMetric.timestamp.getTime()) / 1000 / 60 // minutes
      : 0;

    const performance: ProviderPerformance = {
      provider,
      avgLatency,
      p95Latency,
      p99Latency,
      throughput,
      errorRate,
      totalTokens,
      estimatedCost,
      uptime,
      lastUpdated: new Date()
    };

    this.performanceCache.set(provider, performance);
  }

  /**
   * Check performance thresholds and create alerts
   */
  private checkThresholds(provider: 'claude' | 'qwen'): void {
    const performance = this.getProviderPerformance(provider);
    if (!performance) return;

    const threshold = this.thresholds[provider];

    // Check latency
    if (performance.p95Latency > threshold.maxLatency) {
      this.createAlert({
        severity: 'warning',
        provider,
        metric: 'latency',
        threshold: threshold.maxLatency,
        currentValue: performance.p95Latency,
        message: `${provider} P95 latency (${performance.p95Latency}ms) exceeds threshold (${threshold.maxLatency}ms)`
      });
    }

    // Check throughput
    if (performance.throughput < threshold.minThroughput) {
      this.createAlert({
        severity: 'warning',
        provider,
        metric: 'throughput',
        threshold: threshold.minThroughput,
        currentValue: performance.throughput,
        message: `${provider} throughput (${performance.throughput.toFixed(2)} tokens/s) below threshold (${threshold.minThroughput} tokens/s)`
      });
    }

    // Check error rate
    if (performance.errorRate > threshold.maxErrorRate) {
      this.createAlert({
        severity: 'critical',
        provider,
        metric: 'errorRate',
        threshold: threshold.maxErrorRate,
        currentValue: performance.errorRate,
        message: `${provider} error rate (${(performance.errorRate * 100).toFixed(2)}%) exceeds threshold (${(threshold.maxErrorRate * 100)}%)`
      });
    }
  }

  /**
   * Create performance alert
   */
  private createAlert(alert: Omit<PerformanceAlert, 'id' | 'timestamp'>): void {
    const fullAlert: PerformanceAlert = {
      ...alert,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    this.alerts.push(fullAlert);
    this.emit('alert:created', fullAlert);

    // Keep only recent alerts (last hour)
    this.alerts = this.alerts.filter(a => 
      Date.now() - a.timestamp.getTime() < this.metricsWindow
    );
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(summary: Record<string, ProviderPerformance>): string[] {
    const recommendations: string[] = [];

    for (const [provider, perf] of Object.entries(summary)) {
      // High latency recommendation
      if (perf.p95Latency > this.thresholds[provider as 'claude' | 'qwen'].maxLatency) {
        recommendations.push(
          `Consider reducing ${provider} workload or switching to ${provider === 'claude' ? 'Qwen' : 'Claude'} for latency-sensitive tasks`
        );
      }

      // Error rate recommendation
      if (perf.errorRate > 0.1) {
        recommendations.push(
          `High error rate detected for ${provider}. Check API key, rate limits, and network connectivity`
        );
      }

      // Cost optimization
      if (provider === 'claude' && perf.estimatedCost > 10) {
        recommendations.push(
          'Consider using Qwen3-Coder for cost savings on large-scale tasks (free API)'
        );
      }

      // Context optimization for Qwen
      if (provider === 'qwen' && perf.avgLatency > 2000) {
        recommendations.push(
          'Enable Qwen context compression for better performance with large contexts'
        );
      }
    }

    // Comparative recommendations
    if (summary.claude && summary.qwen) {
      if (summary.qwen.throughput > summary.claude.throughput * 1.5) {
        recommendations.push(
          'Qwen showing significantly better throughput - consider as primary provider'
        );
      }

      if (summary.claude.errorRate < summary.qwen.errorRate * 0.5) {
        recommendations.push(
          'Claude showing better reliability - use for critical tasks'
        );
      }
    }

    return recommendations;
  }

  /**
   * Clean old metrics
   */
  private cleanOldMetrics(): void {
    const cutoff = Date.now() - this.metricsWindow;
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  /**
   * Start periodic monitoring tasks
   */
  private startMonitoring(): void {
    // Update performance cache every minute
    setInterval(() => {
      this.updatePerformanceCache('claude');
      this.updatePerformanceCache('qwen');
    }, 60000);

    // Clean old data every 5 minutes
    setInterval(() => {
      this.cleanOldMetrics();
    }, 300000);
  }

  /**
   * Export metrics for analysis
   */
  async exportMetrics(format: 'json' | 'csv' = 'json'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify({
        metrics: this.metrics,
        performance: Object.fromEntries(this.performanceCache),
        alerts: this.alerts
      }, null, 2);
    } else {
      // CSV format
      const headers = ['timestamp', 'provider', 'farmId', 'metricType', 'value'];
      const rows = this.metrics.map(m => [
        m.timestamp.toISOString(),
        m.provider,
        m.farmId,
        m.metricType,
        m.value.toString()
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();