/**
 * Utility functions for calculating real metrics and trends
 * Replaces all random data generation with accurate calculations
 */

export interface MetricValue {
  current: number;
  previous: number;
  timestamp: Date;
}

export interface TrendCalculation {
  value: string;
  direction: 'up' | 'down' | 'stable';
  percentage: number;
}

/**
 * Calculate trend between current and previous values
 * Returns formatted string with sign (e.g., "+12.5%", "-5.2%")
 */
export const calculateTrend = (current: number, previous: number): TrendCalculation => {
  if (previous === 0) {
    return {
      value: '+0.0%',
      direction: 'stable',
      percentage: 0
    };
  }

  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'stable';

  return {
    value: `${sign}${change.toFixed(1)}%`,
    direction,
    percentage: change
  };
};

/**
 * Get time range in milliseconds
 */
export const getTimeRangeMs = (range: '1h' | '6h' | '24h' | '7d' | '30d'): number => {
  const map: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  return map[range] || map['24h'];
};

/**
 * Calculate average from array of numbers
 */
export const calculateAverage = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (part: number, total: number): number => {
  if (total === 0) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
};

/**
 * Format bytes to human-readable format
 */
export const formatBytes = (bytes: number, decimals: number = 1): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Format duration in milliseconds to human-readable format
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

/**
 * Calculate estimated costs based on resource usage
 */
export const calculateEstimatedCosts = (
  activeAgents: number,
  cpuUsage: number,
  memoryUsage: number,
  apiCallCount: number = 0
): {
  hourly: string;
  daily: string;
  monthly: string;
  breakdown: {
    compute: number;
    memory: number;
    api: number;
    storage: number;
  };
} => {
  // Cost rates (based on typical cloud pricing)
  const COMPUTE_COST_PER_CORE_HOUR = 0.05; // $0.05 per core-hour
  const MEMORY_COST_PER_GB_HOUR = 0.01; // $0.01 per GB-hour
  const API_COST_PER_CALL = 0.002; // $0.002 per API call
  const STORAGE_BASE_COST = 0.02; // $0.02 per hour base storage

  // Calculate component costs
  const computeCost = (cpuUsage / 100) * activeAgents * COMPUTE_COST_PER_CORE_HOUR;
  const memoryCost = (memoryUsage / 100) * activeAgents * MEMORY_COST_PER_GB_HOUR;
  const apiCost = apiCallCount * API_COST_PER_CALL;
  const storageCost = STORAGE_BASE_COST * activeAgents;

  const hourlyCost = computeCost + memoryCost + apiCost + storageCost;
  const dailyCost = hourlyCost * 24;
  const monthlyCost = dailyCost * 30;

  return {
    hourly: hourlyCost.toFixed(2),
    daily: dailyCost.toFixed(2),
    monthly: monthlyCost.toFixed(2),
    breakdown: {
      compute: computeCost,
      memory: memoryCost,
      api: apiCost,
      storage: storageCost
    }
  };
};

/**
 * Calculate success rate from tasks
 */
export const calculateSuccessRate = (
  completed: number,
  failed: number,
  total: number
): number => {
  if (total === 0) return 0;
  return Math.min(100, Math.max(0, (completed / total) * 100));
};

/**
 * Validate numeric value is within bounds
 */
export const validateNumericValue = (
  value: number,
  min: number = 0,
  max: number = Infinity
): number => {
  return Math.min(max, Math.max(min, value));
};

/**
 * Calculate moving average for smoothing data
 */
export const calculateMovingAverage = (
  values: number[],
  windowSize: number = 5
): number[] => {
  if (values.length < windowSize) return values;

  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    const avg = calculateAverage(window);
    result.push(avg);
  }

  return result;
};

/**
 * Calculate agent efficiency score
 */
export const calculateAgentEfficiency = (
  tasksCompleted: number,
  tasksFailed: number,
  avgResponseTime: number,
  targetResponseTime: number = 30000 // 30 seconds
): number => {
  const totalTasks = tasksCompleted + tasksFailed;
  if (totalTasks === 0) return 0;

  // Success rate component (50% weight)
  const successRate = (tasksCompleted / totalTasks) * 100;

  // Response time component (50% weight)
  const responseTimeScore = Math.max(0, 100 - ((avgResponseTime / targetResponseTime) * 100));

  // Combined efficiency score
  const efficiency = (successRate * 0.5) + (responseTimeScore * 0.5);

  return Math.min(100, Math.max(0, efficiency));
};

/**
 * Calculate system health score
 */
export const calculateSystemHealth = (
  cpuUsage: number,
  memoryUsage: number,
  storageUsage: number,
  errorRate: number
): {
  score: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  issues: string[];
} => {
  const issues: string[] = [];
  let score = 100;

  // CPU penalties
  if (cpuUsage > 90) {
    score -= 30;
    issues.push('CPU usage critically high');
  } else if (cpuUsage > 75) {
    score -= 15;
    issues.push('CPU usage high');
  }

  // Memory penalties
  if (memoryUsage > 90) {
    score -= 30;
    issues.push('Memory usage critically high');
  } else if (memoryUsage > 75) {
    score -= 15;
    issues.push('Memory usage high');
  }

  // Storage penalties
  if (storageUsage > 90) {
    score -= 20;
    issues.push('Storage critically low');
  } else if (storageUsage > 80) {
    score -= 10;
    issues.push('Storage running low');
  }

  // Error rate penalties
  if (errorRate > 10) {
    score -= 30;
    issues.push('Error rate critically high');
  } else if (errorRate > 5) {
    score -= 15;
    issues.push('Error rate elevated');
  }

  score = Math.max(0, score);

  const status: 'excellent' | 'good' | 'warning' | 'critical' =
    score >= 90 ? 'excellent' :
    score >= 70 ? 'good' :
    score >= 50 ? 'warning' : 'critical';

  return { score, status, issues };
};
