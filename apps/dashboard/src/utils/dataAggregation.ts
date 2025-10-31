import { 
  MetricDataPoint, 
  TimeSeriesData,
  ResourceUtilization,
  TaskCompletion 
} from '@/types/analytics';
import { groupBy, mean, sum, max, min } from 'lodash';
import { 
  startOfHour, 
  startOfDay, 
  startOfWeek, 
  startOfMonth,
  format 
} from 'date-fns';

export interface AggregationOptions {
  groupBy: 'hour' | 'day' | 'week' | 'month';
  aggregationMethod: 'sum' | 'avg' | 'max' | 'min' | 'count';
  fillGaps?: boolean;
  defaultValue?: number;
}

export function aggregateTimeSeries(
  data: MetricDataPoint[],
  options: AggregationOptions
): MetricDataPoint[] {
  if (data.length === 0) return [];

  // Group data by time period
  const grouped = groupBy(data, (point) => {
    const date = new Date(point.timestamp);
    switch (options.groupBy) {
      case 'hour':
        return startOfHour(date).toISOString();
      case 'day':
        return startOfDay(date).toISOString();
      case 'week':
        return startOfWeek(date).toISOString();
      case 'month':
        return startOfMonth(date).toISOString();
    }
  });

  // Aggregate values for each group
  const aggregated = Object.entries(grouped).map(([timestamp, points]) => {
    let value: number;
    const values = points.map(p => p.value);

    switch (options.aggregationMethod) {
      case 'sum':
        value = sum(values);
        break;
      case 'avg':
        value = mean(values);
        break;
      case 'max':
        value = max(values) || 0;
        break;
      case 'min':
        value = min(values) || 0;
        break;
      case 'count':
        value = points.length;
        break;
    }

    return {
      timestamp: new Date(timestamp),
      value,
      metadata: {
        count: points.length,
        raw: points,
      },
    };
  });

  // Sort by timestamp
  aggregated.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Fill gaps if requested
  if (options.fillGaps && aggregated.length > 1) {
    return fillTimeSeriesGaps(aggregated, options);
  }

  return aggregated;
}

function fillTimeSeriesGaps(
  data: MetricDataPoint[],
  options: AggregationOptions
): MetricDataPoint[] {
  const filled: MetricDataPoint[] = [];
  const defaultValue = options.defaultValue ?? 0;

  for (let i = 0; i < data.length - 1; i++) {
    filled.push(data[i]);

    const current = data[i].timestamp;
    const next = data[i + 1].timestamp;
    const gap = getTimeGap(current, next, options.groupBy);

    if (gap > 1) {
      // Fill the gap
      for (let j = 1; j < gap; j++) {
        const gapTimestamp = addTimeUnit(current, j, options.groupBy);
        filled.push({
          timestamp: gapTimestamp,
          value: defaultValue,
          metadata: { interpolated: true },
        });
      }
    }
  }

  filled.push(data[data.length - 1]);
  return filled;
}

function getTimeGap(start: Date, end: Date, unit: string): number {
  const diff = end.getTime() - start.getTime();
  switch (unit) {
    case 'hour':
      return Math.floor(diff / (60 * 60 * 1000));
    case 'day':
      return Math.floor(diff / (24 * 60 * 60 * 1000));
    case 'week':
      return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
    case 'month':
      return Math.floor(diff / (30 * 24 * 60 * 60 * 1000));
    default:
      return 0;
  }
}

function addTimeUnit(date: Date, amount: number, unit: string): Date {
  const result = new Date(date);
  switch (unit) {
    case 'hour':
      result.setHours(result.getHours() + amount);
      break;
    case 'day':
      result.setDate(result.getDate() + amount);
      break;
    case 'week':
      result.setDate(result.getDate() + amount * 7);
      break;
    case 'month':
      result.setMonth(result.getMonth() + amount);
      break;
  }
  return result;
}

export function calculateMovingAverage(
  data: MetricDataPoint[],
  windowSize: number
): MetricDataPoint[] {
  if (data.length < windowSize) return data;

  return data.map((point, index) => {
    if (index < windowSize - 1) {
      return point;
    }

    const window = data.slice(index - windowSize + 1, index + 1);
    const avgValue = mean(window.map(p => p.value));

    return {
      ...point,
      value: avgValue,
      metadata: {
        ...point.metadata,
        movingAverage: true,
        windowSize,
      },
    };
  });
}

export function calculatePercentiles(
  values: number[],
  percentiles: number[] = [25, 50, 75, 90, 95, 99]
): Record<string, number> {
  const sorted = [...values].sort((a, b) => a - b);
  const result: Record<string, number> = {};

  percentiles.forEach(p => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    result[`p${p}`] = sorted[Math.max(0, index)];
  });

  return result;
}

export function groupTasksByStatus(tasks: TaskCompletion[]): Record<string, TaskCompletion[]> {
  return groupBy(tasks, 'status');
}

export function calculateResourceUtilizationStats(
  utilizations: ResourceUtilization[]
): {
  avg: ResourceUtilization;
  max: ResourceUtilization;
  min: ResourceUtilization;
} {
  if (utilizations.length === 0) {
    const empty: ResourceUtilization = {
      cpu: 0,
      memory: 0,
      storage: 0,
      network: 0,
      timestamp: new Date(),
    };
    return { avg: empty, max: empty, min: empty };
  }

  return {
    avg: {
      cpu: mean(utilizations.map(u => u.cpu)),
      memory: mean(utilizations.map(u => u.memory)),
      storage: mean(utilizations.map(u => u.storage)),
      network: mean(utilizations.map(u => u.network)),
      timestamp: new Date(),
    },
    max: {
      cpu: max(utilizations.map(u => u.cpu)) || 0,
      memory: max(utilizations.map(u => u.memory)) || 0,
      storage: max(utilizations.map(u => u.storage)) || 0,
      network: max(utilizations.map(u => u.network)) || 0,
      timestamp: new Date(),
    },
    min: {
      cpu: min(utilizations.map(u => u.cpu)) || 0,
      memory: min(utilizations.map(u => u.memory)) || 0,
      storage: min(utilizations.map(u => u.storage)) || 0,
      network: min(utilizations.map(u => u.network)) || 0,
      timestamp: new Date(),
    },
  };
}

export function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function formatMetricValue(value: number, unit?: string): string {
  if (unit === '%') {
    return `${value.toFixed(1)}%`;
  }
  
  if (unit === 'ms') {
    if (value > 1000) {
      return `${(value / 1000).toFixed(2)}s`;
    }
    return `${value.toFixed(0)}ms`;
  }
  
  if (unit === 'GB') {
    if (value > 1024) {
      return `${(value / 1024).toFixed(2)}TB`;
    }
    return `${value.toFixed(2)}GB`;
  }
  
  if (value > 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  
  if (value > 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  
  return value.toFixed(2);
}