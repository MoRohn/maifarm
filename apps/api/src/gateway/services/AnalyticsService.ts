import { metricsService } from '../../services/metricsService.js';
import { costTrackingService } from '../../services/costTrackingService.js';
import { monitoringService } from '../../services/monitoringService.js';

export class AnalyticsService {
  async getOverview() {
    const [metrics, costs, performance] = await Promise.all([
      metricsService.getSystemMetrics(),
      costTrackingService.getCurrentCosts(),
      monitoringService.getPerformanceMetrics()
    ]);
    
    return {
      metrics,
      costs,
      performance,
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