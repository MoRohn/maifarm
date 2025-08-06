import { Gauge, Counter, Histogram } from 'prom-client';

interface MetricSnapshot {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

interface AggregatedMetric {
  min: number;
  max: number;
  avg: number;
  sum: number;
  count: number;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

class MetricsAggregator {
  private metricsBuffer: Map<string, MetricSnapshot[]> = new Map();
  private readonly maxBufferSize = 10000;
  private readonly retentionPeriod = 3600000; // 1 hour

  // Add metric snapshot
  addMetric(name: string, value: number, labels?: Record<string, string>) {
    const key = this.getMetricKey(name, labels);
    const snapshot: MetricSnapshot = {
      timestamp: new Date(),
      value,
      labels
    };

    if (!this.metricsBuffer.has(key)) {
      this.metricsBuffer.set(key, []);
    }

    const buffer = this.metricsBuffer.get(key)!;
    buffer.push(snapshot);

    // Maintain buffer size
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    // Clean old metrics
    this.cleanOldMetrics(key);
  }

  // Get aggregated metrics for time range
  getAggregatedMetrics(
    name: string,
    startTime: Date,
    endTime: Date,
    labels?: Record<string, string>
  ): AggregatedMetric | null {
    const key = this.getMetricKey(name, labels);
    const buffer = this.metricsBuffer.get(key);

    if (!buffer || buffer.length === 0) {
      return null;
    }

    const filteredMetrics = buffer.filter(
      m => m.timestamp >= startTime && m.timestamp <= endTime
    );

    if (filteredMetrics.length === 0) {
      return null;
    }

    const values = filteredMetrics.map(m => m.value).sort((a, b) => a - b);
    
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, val) => sum + val, 0) / values.length,
      sum: values.reduce((sum, val) => sum + val, 0),
      count: values.length,
      percentiles: {
        p50: this.getPercentile(values, 0.5),
        p90: this.getPercentile(values, 0.9),
        p95: this.getPercentile(values, 0.95),
        p99: this.getPercentile(values, 0.99)
      }
    };
  }

  // Get time series data
  getTimeSeries(
    name: string,
    startTime: Date,
    endTime: Date,
    interval: string,
    labels?: Record<string, string>
  ): Array<{ timestamp: Date; value: number }> {
    const key = this.getMetricKey(name, labels);
    const buffer = this.metricsBuffer.get(key);

    if (!buffer || buffer.length === 0) {
      return [];
    }

    const intervalMs = this.parseInterval(interval);
    const result: Array<{ timestamp: Date; value: number }> = [];
    
    let currentTime = startTime.getTime();
    while (currentTime <= endTime.getTime()) {
      const windowStart = new Date(currentTime);
      const windowEnd = new Date(currentTime + intervalMs);
      
      const windowMetrics = buffer.filter(
        m => m.timestamp >= windowStart && m.timestamp < windowEnd
      );

      if (windowMetrics.length > 0) {
        const avgValue = windowMetrics.reduce((sum, m) => sum + m.value, 0) / windowMetrics.length;
        result.push({
          timestamp: new Date(currentTime + intervalMs / 2),
          value: avgValue
        });
      }

      currentTime += intervalMs;
    }

    return result;
  }

  // Calculate rate of change
  calculateRate(
    name: string,
    duration: string,
    labels?: Record<string, string>
  ): number | null {
    const key = this.getMetricKey(name, labels);
    const buffer = this.metricsBuffer.get(key);

    if (!buffer || buffer.length < 2) {
      return null;
    }

    const durationMs = this.parseInterval(duration);
    const now = Date.now();
    const startTime = new Date(now - durationMs);

    const recentMetrics = buffer.filter(m => m.timestamp >= startTime);
    
    if (recentMetrics.length < 2) {
      return null;
    }

    const first = recentMetrics[0];
    const last = recentMetrics[recentMetrics.length - 1];
    const timeDiff = (last.timestamp.getTime() - first.timestamp.getTime()) / 1000; // seconds

    return (last.value - first.value) / timeDiff;
  }

  // Aggregate metrics by labels
  aggregateByLabels(
    name: string,
    startTime: Date,
    endTime: Date,
    groupBy: string
  ): Map<string, AggregatedMetric> {
    const results = new Map<string, AggregatedMetric>();
    
    // Find all metric keys that match the name
    for (const [key, buffer] of this.metricsBuffer.entries()) {
      if (key.startsWith(name)) {
        const labels = this.parseLabelsFromKey(key);
        const groupValue = labels[groupBy] || 'unknown';
        
        const aggregated = this.getAggregatedMetrics(name, startTime, endTime, labels);
        if (aggregated) {
          results.set(groupValue, aggregated);
        }
      }
    }

    return results;
  }

  // Compare metrics across time periods
  compareMetrics(
    name: string,
    period1: { start: Date; end: Date },
    period2: { start: Date; end: Date },
    labels?: Record<string, string>
  ): {
    period1: AggregatedMetric | null;
    period2: AggregatedMetric | null;
    change: {
      absolute: number;
      percentage: number;
    } | null;
  } {
    const metrics1 = this.getAggregatedMetrics(name, period1.start, period1.end, labels);
    const metrics2 = this.getAggregatedMetrics(name, period2.start, period2.end, labels);

    let change = null;
    if (metrics1 && metrics2) {
      const absoluteChange = metrics2.avg - metrics1.avg;
      const percentageChange = (absoluteChange / metrics1.avg) * 100;
      
      change = {
        absolute: absoluteChange,
        percentage: percentageChange
      };
    }

    return {
      period1: metrics1,
      period2: metrics2,
      change
    };
  }

  // Helper methods
  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return `${name}{${labelStr}}`;
  }

  private parseLabelsFromKey(key: string): Record<string, string> {
    const match = key.match(/\{(.+)\}$/);
    if (!match) return {};

    const labels: Record<string, string> = {};
    const labelPairs = match[1].split(',');
    
    for (const pair of labelPairs) {
      const [k, v] = pair.split('=');
      if (k && v) {
        labels[k] = v.replace(/"/g, '');
      }
    }

    return labels;
  }

  private cleanOldMetrics(key: string) {
    const buffer = this.metricsBuffer.get(key);
    if (!buffer) return;

    const cutoffTime = new Date(Date.now() - this.retentionPeriod);
    const filtered = buffer.filter(m => m.timestamp >= cutoffTime);
    
    if (filtered.length !== buffer.length) {
      this.metricsBuffer.set(key, filtered);
    }
  }

  private parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)([smhd])$/);
    if (!match) return 60000; // Default to 1 minute

    const [, value, unit] = match;
    const num = parseInt(value);

    switch (unit) {
      case 's': return num * 1000;
      case 'm': return num * 60000;
      case 'h': return num * 3600000;
      case 'd': return num * 86400000;
      default: return 60000;
    }
  }

  private getPercentile(sortedValues: number[], percentile: number): number {
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }
}

// Export singleton instance
export const metricsAggregator = new MetricsAggregator();

// Export aggregation functions
export function aggregateMetrics(
  name: string,
  startTime: Date,
  endTime: Date,
  labels?: Record<string, string>
): AggregatedMetric | null {
  return metricsAggregator.getAggregatedMetrics(name, startTime, endTime, labels);
}

export function getMetricTimeSeries(
  name: string,
  startTime: Date,
  endTime: Date,
  interval: string,
  labels?: Record<string, string>
): Array<{ timestamp: Date; value: number }> {
  return metricsAggregator.getTimeSeries(name, startTime, endTime, interval, labels);
}

export function calculateMetricRate(
  name: string,
  duration: string,
  labels?: Record<string, string>
): number | null {
  return metricsAggregator.calculateRate(name, duration, labels);
}