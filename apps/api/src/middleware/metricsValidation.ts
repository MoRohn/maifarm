/**
 * Metrics Validation Middleware
 * Ensures all metrics data is properly typed and validated
 */

import { Request, Response, NextFunction } from 'express';
import { metricsSynchronizer } from '../services/metricsSynchronizer';

interface MetricValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Validate that a value is a number and within acceptable bounds
 */
function validateNumber(
  value: any,
  fieldName: string,
  min: number = 0,
  max: number = Number.MAX_SAFE_INTEGER
): MetricValidationError | null {
  // Check if value is a number
  if (typeof value !== 'number') {
    return {
      field: fieldName,
      message: `${fieldName} must be a number, got ${typeof value}`,
      value
    };
  }
  
  // Check for NaN
  if (isNaN(value)) {
    return {
      field: fieldName,
      message: `${fieldName} is NaN`,
      value
    };
  }
  
  // Check for Infinity
  if (!isFinite(value)) {
    return {
      field: fieldName,
      message: `${fieldName} is not finite`,
      value
    };
  }
  
  // Check bounds
  if (value < min || value > max) {
    return {
      field: fieldName,
      message: `${fieldName} must be between ${min} and ${max}`,
      value
    };
  }
  
  return null;
}

/**
 * Validate percentage values (0-100)
 */
function validatePercentage(value: any, fieldName: string): MetricValidationError | null {
  return validateNumber(value, fieldName, 0, 100);
}

/**
 * Validate count values (non-negative integers)
 */
function validateCount(value: any, fieldName: string): MetricValidationError | null {
  const error = validateNumber(value, fieldName, 0);
  if (error) return error;
  
  if (!Number.isInteger(value)) {
    return {
      field: fieldName,
      message: `${fieldName} must be an integer`,
      value
    };
  }
  
  return null;
}

/**
 * Validate cost values (non-negative)
 */
function validateCost(value: any, fieldName: string): MetricValidationError | null {
  return validateNumber(value, fieldName, 0);
}

/**
 * Validate metrics request body
 */
export function validateMetricsRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const metrics = req.body;
  
  if (!metrics) {
    return next();
  }
  
  const errors: MetricValidationError[] = [];
  
  // Validate farm metrics
  if ('totalFarms' in metrics) {
    const error = validateCount(metrics.totalFarms, 'totalFarms');
    if (error) errors.push(error);
  }
  
  if ('activeFarms' in metrics) {
    const error = validateCount(metrics.activeFarms, 'activeFarms');
    if (error) errors.push(error);
  }
  
  if ('stoppedFarms' in metrics) {
    const error = validateCount(metrics.stoppedFarms, 'stoppedFarms');
    if (error) errors.push(error);
  }
  
  if ('failedFarms' in metrics) {
    const error = validateCount(metrics.failedFarms, 'failedFarms');
    if (error) errors.push(error);
  }
  
  // Validate agent metrics
  if ('totalAgents' in metrics) {
    const error = validateCount(metrics.totalAgents, 'totalAgents');
    if (error) errors.push(error);
  }
  
  if ('activeAgents' in metrics) {
    const error = validateCount(metrics.activeAgents, 'activeAgents');
    if (error) errors.push(error);
  }
  
  if ('idleAgents' in metrics) {
    const error = validateCount(metrics.idleAgents, 'idleAgents');
    if (error) errors.push(error);
  }
  
  if ('uniqueAgents' in metrics) {
    const error = validateCount(metrics.uniqueAgents, 'uniqueAgents');
    if (error) errors.push(error);
  }
  
  // Validate task metrics
  if ('totalTasks' in metrics) {
    const error = validateCount(metrics.totalTasks, 'totalTasks');
    if (error) errors.push(error);
  }
  
  if ('completedTasks' in metrics) {
    const error = validateCount(metrics.completedTasks, 'completedTasks');
    if (error) errors.push(error);
  }
  
  if ('failedTasks' in metrics) {
    const error = validateCount(metrics.failedTasks, 'failedTasks');
    if (error) errors.push(error);
  }
  
  if ('pendingTasks' in metrics) {
    const error = validateCount(metrics.pendingTasks, 'pendingTasks');
    if (error) errors.push(error);
  }
  
  // Validate percentage metrics
  if ('successRate' in metrics) {
    const error = validatePercentage(metrics.successRate, 'successRate');
    if (error) errors.push(error);
  }
  
  if ('errorRate' in metrics) {
    const error = validatePercentage(metrics.errorRate, 'errorRate');
    if (error) errors.push(error);
  }
  
  if ('cpuUsage' in metrics) {
    const error = validatePercentage(metrics.cpuUsage, 'cpuUsage');
    if (error) errors.push(error);
  }
  
  if ('memoryUsage' in metrics) {
    const error = validatePercentage(metrics.memoryUsage, 'memoryUsage');
    if (error) errors.push(error);
  }
  
  if ('gpuUsage' in metrics) {
    const error = validatePercentage(metrics.gpuUsage, 'gpuUsage');
    if (error) errors.push(error);
  }
  
  if ('diskUsage' in metrics) {
    const error = validatePercentage(metrics.diskUsage, 'diskUsage');
    if (error) errors.push(error);
  }
  
  if ('networkUsage' in metrics) {
    const error = validatePercentage(metrics.networkUsage, 'networkUsage');
    if (error) errors.push(error);
  }
  
  if ('uptime' in metrics) {
    const error = validatePercentage(metrics.uptime, 'uptime');
    if (error) errors.push(error);
  }
  
  // Validate cost metrics
  if ('totalCost' in metrics) {
    const error = validateCost(metrics.totalCost, 'totalCost');
    if (error) errors.push(error);
  }
  
  if ('apiCost' in metrics) {
    const error = validateCost(metrics.apiCost, 'apiCost');
    if (error) errors.push(error);
  }
  
  if ('computeCost' in metrics) {
    const error = validateCost(metrics.computeCost, 'computeCost');
    if (error) errors.push(error);
  }
  
  if ('storageCost' in metrics) {
    const error = validateCost(metrics.storageCost, 'storageCost');
    if (error) errors.push(error);
  }
  
  // Validate performance metrics
  if ('avgResponseTime' in metrics) {
    const error = validateNumber(metrics.avgResponseTime, 'avgResponseTime', 0);
    if (error) errors.push(error);
  }
  
  if ('throughput' in metrics) {
    const error = validateNumber(metrics.throughput, 'throughput', 0);
    if (error) errors.push(error);
  }
  
  // Check for logical consistency
  if (metrics.totalFarms !== undefined && metrics.activeFarms !== undefined) {
    if (metrics.activeFarms > metrics.totalFarms) {
      errors.push({
        field: 'activeFarms',
        message: 'activeFarms cannot be greater than totalFarms',
        value: metrics.activeFarms
      });
    }
  }
  
  if (metrics.totalAgents !== undefined && metrics.activeAgents !== undefined) {
    if (metrics.activeAgents > metrics.totalAgents) {
      errors.push({
        field: 'activeAgents',
        message: 'activeAgents cannot be greater than totalAgents',
        value: metrics.activeAgents
      });
    }
  }
  
  if (metrics.totalTasks !== undefined && metrics.completedTasks !== undefined) {
    if (metrics.completedTasks > metrics.totalTasks) {
      errors.push({
        field: 'completedTasks',
        message: 'completedTasks cannot be greater than totalTasks',
        value: metrics.completedTasks
      });
    }
  }
  
  // If there are errors, return validation error response
  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'METRICS_VALIDATION_ERROR',
        message: 'Invalid metrics data',
        details: errors
      }
    });
    return;
  }
  
  // All validations passed
  next();
}

/**
 * Validate WebSocket metrics update
 */
export function validateWebSocketMetrics(data: any): {
  valid: boolean;
  errors: MetricValidationError[];
} {
  const errors: MetricValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push({
      field: 'data',
      message: 'Metrics data must be an object',
      value: data
    });
    return { valid: false, errors };
  }
  
  // Use the metrics synchronizer's validation
  const validation = metricsSynchronizer.validateMetrics(data.metrics || data);
  
  if (!validation.valid) {
    validation.errors.forEach(error => {
      errors.push({
        field: 'metrics',
        message: error,
        value: undefined
      });
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize metrics data
 * Converts string numbers to numbers and removes invalid values
 */
export function sanitizeMetrics(metrics: any): any {
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(metrics)) {
    // Skip null/undefined values
    if (value === null || value === undefined) {
      continue;
    }
    
    // Try to convert strings to numbers
    if (typeof value === 'string') {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        sanitized[key] = num;
      }
    } else if (typeof value === 'number') {
      // Ensure number is valid
      if (isFinite(value) && !isNaN(value)) {
        sanitized[key] = value;
      }
    } else if (typeof value === 'object') {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeMetrics(value);
    } else {
      // Keep other types as-is
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Middleware to automatically sanitize metrics in request body
 */
export function sanitizeMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeMetrics(req.body);
  }
  next();
}