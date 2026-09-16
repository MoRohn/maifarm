// @ts-nocheck
import { metricsService } from '../../services/metricsService.js';
import { costTrackingService } from '../../services/costTrackingService.js';
import { monitoringService } from '../../services/monitoringService.js';
import { logger, LogCategory } from '../../utils/logger.js';

/**
 * Helper to extract value from Promise.allSettled result with fallback
 */
function extractSettledValue<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === 'fulfilled') {
    return result.value;
  }
  logger.warn(LogCategory.ANALYTICS, `${label} failed, using fallback:`, result.reason);
  return fallback;
}

export class AnalyticsService {
  /**
   * Get analytics overview with resilient data fetching.
   * Uses Promise.allSettled to prevent cascading failures - if one service
   * fails, the others still return their data with the failed one using fallbacks.
   */
  async getOverview() {
    const results = await Promise.allSettled([
      metricsService.getSystemMetrics(),
      costTrackingService.getCurrentCosts(),
      monitoringService.getPerformanceMetrics()
    ]);

    // Extract values with fallbacks for failed services
    const metrics = extractSettledValue(results[0], {
      cpu: 0,
      memory: 0,
      disk: 0,
      uptime: 0,
      error: 'Metrics service unavailable'
    }, 'Metrics service');

    const costs = extractSettledValue(results[1], {
      total: 0,
      breakdown: {},
      error: 'Cost tracking service unavailable'
    }, 'Cost tracking service');

    const performance = extractSettledValue(results[2], {
      responseTime: 0,
      throughput: 0,
      errorRate: 0,
      error: 'Monitoring service unavailable'
    }, 'Monitoring service');

    // Track partial failures for frontend awareness
    const serviceStatus = {
      metricsAvailable: results[0].status === 'fulfilled',
      costsAvailable: results[1].status === 'fulfilled',
      performanceAvailable: results[2].status === 'fulfilled',
      allServicesHealthy: results.every(r => r.status === 'fulfilled')
    };

    return {
      metrics,
      costs,
      performance,
      serviceStatus,
      timestamp: new Date().toISOString()
    };
  }
  
  async getMetrics(dateRange: any) {
    return metricsService.getMetricsByDateRange(dateRange);
  }
  
  async getCostAnalysis(params: any) {
    return costTrackingService.analyzeCosts(params);
  }
  
  async getPerformanceMetrics() {
    return monitoringService.getPerformanceMetrics();
  }

  async getFarmYieldMetrics(timeRange?: { start: Date; end: Date }) {
    // Return empty metrics for now - this endpoint is not yet implemented
    return {
      totalFarms: 0,
      completedFarms: 0,
      successRate: 0,
      averageCompletionTime: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      farmsByStatus: {
        idle: 0,
        launching: 0,
        active: 0,
        completed: 0,
        failed: 0
      },
      timeRange: timeRange || { start: new Date(), end: new Date() }
    };
  }

  async getFarmCreationMetrics() {
    // Stub implementation - returns empty metrics
    return {
      totalFarms: 0,
      successRate: 0,
      avgCreationTime: 0,
      failureReasons: {},
      recentFarms: [],
      trend: []
    };
  }

  async getGoWildMetrics() {
    // Stub implementation - returns empty metrics
    return {
      sessions: 0,
      avgDuration: 0,
      tasksGenerated: 0,
      creativityScore: 0,
      explorationDepth: 0,
      discoveries: [],
      boundaries: {}
    };
  }

  async getQuickTaskMetrics() {
    // Stub implementation - returns empty metrics
    return {
      completed: 0,
      avgTime: 0,
      taskTypes: {},
      successRate: 0,
      popularTasks: [],
      performanceScore: 0
    };
  }

  async trackEvent(event: any) {
    // Stub implementation - logs the event
    console.log('Analytics event tracked:', event);
    return { success: true };
  }

  async getStandardizedTaskMetrics() {
    // Stub implementation - returns empty metrics
    return {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTime: 0,
      successRate: 0,
      byType: {}
    };
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
