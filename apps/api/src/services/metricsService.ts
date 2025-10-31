import { db } from '../database/connection.js';
import { metricsCollector } from '../monitoring/metricsCollector.js';
import { metricsAggregator } from '../utils/metricsAggregator.js';

export class MetricsService {
  async getSystemMetrics() {
    // Get current system metrics
    const currentMetrics = await metricsCollector.getCurrentMetrics();
    
    // Get aggregated metrics from the database
    const query = `
      SELECT 
        COUNT(DISTINCT farm_id) as active_farms,
        COUNT(DISTINCT agent_id) as active_agents,
        SUM(tokens_used) as total_tokens,
        AVG(response_time) as avg_response_time
      FROM metrics
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `;
    
    try {
      const result = await db.query(query);
      return {
        ...currentMetrics,
        ...result.rows[0],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.warn('Failed to get system metrics from DB:', error);
      return currentMetrics;
    }
  }
  
  async getMetricsByDateRange(dateRange: { start: Date; end: Date }) {
    return metricsAggregator.getMetricsByDateRange(dateRange);
  }
  
  async recordMetric(metric: any) {
    return metricsCollector.recordMetric(metric);
  }
}

export const metricsService = new MetricsService();