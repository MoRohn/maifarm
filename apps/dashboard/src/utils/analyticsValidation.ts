/**
 * Data validation utilities for analytics using Zod schemas
 * Ensures all metrics data is valid before rendering
 */

import { z } from 'zod';

// System Metrics Schema
export const SystemMetricsSchema = z.object({
  cpu: z.object({
    usage: z.number().min(0).max(100),
    cores: z.number().int().positive(),
    model: z.string(),
    temperature: z.number().optional()
  }),
  memory: z.object({
    total: z.number().nonnegative(),
    used: z.number().nonnegative(),
    free: z.number().nonnegative(),
    percentage: z.number().min(0).max(100)
  }),
  storage: z.object({
    total: z.number().nonnegative(),
    used: z.number().nonnegative(),
    available: z.number().nonnegative(),
    percentage: z.number().min(0).max(100)
  }),
  gpu: z.object({
    usage: z.number().min(0).max(100),
    memory: z.number().nonnegative(),
    temperature: z.number().optional(),
    name: z.string().optional(),
    count: z.number().int().nonnegative()
  })
});

export type ValidatedSystemMetrics = z.infer<typeof SystemMetricsSchema>;

// Analytics Metrics Schema
export const AnalyticsMetricsSchema = z.object({
  totalTasks: z.number().int().nonnegative(),
  completedTasks: z.number().int().nonnegative(),
  failedTasks: z.number().int().nonnegative(),
  inProgressTasks: z.number().int().nonnegative(),
  pendingTasks: z.number().int().nonnegative(),
  averageCompletionTime: z.number().nonnegative(),
  activeAgents: z.number().int().nonnegative(),
  errorRate: z.number().min(0).max(100)
});

export type ValidatedAnalyticsMetrics = z.infer<typeof AnalyticsMetricsSchema>;

// Cost Breakdown Schema
export const CostBreakdownSchema = z.object({
  total: z.number().nonnegative(),
  compute: z.number().nonnegative(),
  storage: z.number().nonnegative(),
  network: z.number().nonnegative(),
  api: z.number().nonnegative(),
  period: z.enum(['hourly', 'daily', 'weekly', 'monthly']),
  currency: z.string().default('USD')
});

export type ValidatedCostBreakdown = z.infer<typeof CostBreakdownSchema>;

// Agent Performance Schema
export const AgentPerformanceSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  tasksCompleted: z.number().int().nonnegative(),
  tasksInProgress: z.number().int().nonnegative(),
  tasksFailed: z.number().int().nonnegative(),
  averageResponseTime: z.number().nonnegative(),
  successRate: z.number().min(0).max(100),
  lastActive: z.date().or(z.string()).optional()
});

export type ValidatedAgentPerformance = z.infer<typeof AgentPerformanceSchema>;

// Time Series Data Point Schema
export const TimeSeriesDataPointSchema = z.object({
  timestamp: z.date().or(z.string()),
  value: z.number()
});

export const TimeSeriesDataSchema = z.object({
  label: z.string(),
  data: z.array(TimeSeriesDataPointSchema),
  unit: z.string().optional(),
  color: z.string().optional(),
  isDashed: z.boolean().optional()
});

export type ValidatedTimeSeriesData = z.infer<typeof TimeSeriesDataSchema>;

/**
 * Validate system metrics data
 */
export const validateSystemMetrics = (data: unknown): ValidatedSystemMetrics | null => {
  try {
    return SystemMetricsSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('System metrics validation failed:', error.errors);
    }
    return null;
  }
};

/**
 * Validate analytics metrics data
 */
export const validateAnalyticsMetrics = (data: unknown): ValidatedAnalyticsMetrics | null => {
  try {
    return AnalyticsMetricsSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Analytics metrics validation failed:', error.errors);
    }
    return null;
  }
};

/**
 * Validate cost breakdown data
 */
export const validateCostBreakdown = (data: unknown): ValidatedCostBreakdown | null => {
  try {
    return CostBreakdownSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Cost breakdown validation failed:', error.errors);
    }
    return null;
  }
};

/**
 * Validate agent performance data
 */
export const validateAgentPerformance = (data: unknown): ValidatedAgentPerformance | null => {
  try {
    return AgentPerformanceSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Agent performance validation failed:', error.errors);
    }
    return null;
  }
};

/**
 * Validate array of agent performance data
 */
export const validateAgentPerformanceArray = (data: unknown): ValidatedAgentPerformance[] => {
  if (!Array.isArray(data)) {
    console.error('Agent performance data is not an array');
    return [];
  }

  return data
    .map(item => validateAgentPerformance(item))
    .filter((item): item is ValidatedAgentPerformance => item !== null);
};

/**
 * Validate time series data
 */
export const validateTimeSeriesData = (data: unknown): ValidatedTimeSeriesData | null => {
  try {
    return TimeSeriesDataSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Time series data validation failed:', error.errors);
    }
    return null;
  }
};

/**
 * Validate array of time series data
 */
export const validateTimeSeriesDataArray = (data: unknown): ValidatedTimeSeriesData[] => {
  if (!Array.isArray(data)) {
    console.error('Time series data is not an array');
    return [];
  }

  return data
    .map(item => validateTimeSeriesData(item))
    .filter((item): item is ValidatedTimeSeriesData => item !== null);
};

/**
 * Safe number parse with fallback
 */
export const safeParseNumber = (value: unknown, fallback: number = 0): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(parsed) ? fallback : parsed;
};

/**
 * Safe percentage calculation with validation
 */
export const safePercentage = (part: number, total: number): number => {
  if (total === 0) return 0;
  const percentage = (part / total) * 100;
  return Math.min(100, Math.max(0, percentage));
};

/**
 * Sanitize metric value to ensure it's within valid range
 */
export const sanitizeMetricValue = (
  value: number,
  min: number = 0,
  max: number = 100
): number => {
  if (isNaN(value) || !isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

/**
 * Validate API response structure
 */
export const validateApiResponse = <T>(
  response: unknown,
  validator: (data: unknown) => T | null,
  errorMessage: string = 'Invalid API response'
): T => {
  if (!response || typeof response !== 'object') {
    throw new Error(`${errorMessage}: Response is not an object`);
  }

  const responseObj = response as any;

  if (!responseObj.success) {
    throw new Error(`${errorMessage}: ${responseObj.error || 'Unknown error'}`);
  }

  const validated = validator(responseObj.data);

  if (!validated) {
    throw new Error(`${errorMessage}: Data validation failed`);
  }

  return validated;
};

/**
 * Create default system metrics for fallback
 */
export const createDefaultSystemMetrics = (): ValidatedSystemMetrics => ({
  cpu: { usage: 0, cores: 0, model: 'Unknown' },
  memory: { total: 0, used: 0, free: 0, percentage: 0 },
  storage: { total: 0, used: 0, available: 0, percentage: 0 },
  gpu: { usage: 0, memory: 0, count: 0 }
});

/**
 * Create default analytics metrics for fallback
 */
export const createDefaultAnalyticsMetrics = (): ValidatedAnalyticsMetrics => ({
  totalTasks: 0,
  completedTasks: 0,
  failedTasks: 0,
  inProgressTasks: 0,
  pendingTasks: 0,
  averageCompletionTime: 0,
  activeAgents: 0,
  errorRate: 0
});
