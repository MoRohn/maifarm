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
}

// Export singleton instance
export const analyticsService = new AnalyticsService();