import { api } from './apiClient';
import { useFarmStore } from '../store/farmStore';

export interface DashboardMetrics {
  activeFarms: number;
  totalAgents: number;
  tasksCompleted: number;
  successRate: number;
}

export interface MetricsResponse {
  activeFarms: number;
  totalAgents: number;
  tasksCompleted: number;
  successRate: number;
}

class MetricsService {
  private static instance: MetricsService;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private isUpdating = false;

  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  // Fetch metrics from the API
  async fetchMetrics(farmId?: string, metricType?: any, period?: string): Promise<any> {
    // If called with parameters, return mock time series data for compatibility
    if (farmId && metricType && period) {
      return this.getMockTimeSeries(farmId, metricType, period);
    }
    
    return this.getDashboardMetrics();
  }

  // Original dashboard metrics method
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
      const response = await api.metrics();
      const data: MetricsResponse = response.data?.data || response.data;
      
      return {
        activeFarms: data.activeFarms,
        totalAgents: data.totalAgents,
        tasksCompleted: data.tasksCompleted,
        successRate: data.successRate,
      };
    } catch (error) {
      // Don't log network errors - apiClient already handles these
      const errorCode = (error as any)?.code;
      if (errorCode !== 'ERR_NETWORK' && errorCode !== 'ECONNREFUSED') {
        console.error('Error fetching metrics:', error);
      }
      // Return current store values as fallback
      const store = useFarmStore.getState();
      return store.stats;
    }
  }

  // Start periodic metrics updates
  startMetricsUpdates(intervalMs: number = 5000): void {
    if (this.updateInterval) {
      return; // Already running
    }

    // Initial fetch
    this.updateMetrics();

    // Set up periodic updates
    this.updateInterval = setInterval(() => {
      this.updateMetrics();
    }, intervalMs);
  }

  // Stop periodic updates
  stopMetricsUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Update metrics in the store
  private async updateMetrics(): Promise<void> {
    if (this.isUpdating) {
      return; // Prevent concurrent updates
    }

    this.isUpdating = true;
    try {
      const metrics = await this.getDashboardMetrics();
      useFarmStore.getState().updateStats(metrics);
    } catch (error) {
      // Don't log network errors - apiClient already handles these
      const errorCode = (error as any)?.code;
      if (errorCode !== 'ERR_NETWORK' && errorCode !== 'ECONNREFUSED') {
        console.error('Failed to update metrics:', error);
      }
    } finally {
      this.isUpdating = false;
    }
  }

  // Handle WebSocket metrics updates
  handleWebSocketMetrics(data: any): void {
    try {
      // Handle both formats: direct metrics object and wrapped in event
      let dashboard = null;
      
      if (data?.dashboard) {
        // Direct metrics object
        dashboard = data.dashboard;
      } else if (data?.event === 'metrics:update' && data.data?.dashboard) {
        // Wrapped in WebSocketEvent format
        dashboard = data.data.dashboard;
      } else if (data?.data?.dashboard) {
        // Alternative format
        dashboard = data.data.dashboard;
      }
      
      if (dashboard) {
        const metrics: DashboardMetrics = {
          activeFarms: dashboard.activeFarms || 0,
          totalAgents: dashboard.totalAgents || 0,
          tasksCompleted: dashboard.tasksCompleted || 0,
          successRate: dashboard.successRate || 100,
        };
        
        useFarmStore.getState().updateStats(metrics);
        console.log('Metrics updated via WebSocket:', metrics);
      }
    } catch (error) {
      console.error('Error handling WebSocket metrics:', error);
    }
  }

  // Get current metrics from store
  getCurrentMetrics(): DashboardMetrics {
    return useFarmStore.getState().stats;
  }

  // Force refresh metrics
  async refreshMetrics(): Promise<DashboardMetrics> {
    const metrics = await this.getDashboardMetrics();
    useFarmStore.getState().updateStats(metrics);
    return metrics;
  }

  // Get aggregated metrics by wrapping calculateAggregatedMetrics
  async getAggregatedMetrics(farmId: string, metricType: any, aggregation: string, period: string): Promise<any> {
    // Import analyticsService to access calculateAggregatedMetrics
    const { analyticsService } = await import('./analyticsService');
    
    // Map period to TimeRange format expected by calculateAggregatedMetrics
    const timeRange = {
      start: new Date(Date.now() - this.parsePeriodToMs(period)),
      end: new Date(),
      period
    };
    
    return analyticsService.calculateAggregatedMetrics(timeRange);
  }

  // Helper to parse period string to milliseconds
  private parsePeriodToMs(period: string): number {
    const value = parseInt(period.slice(0, -1));
    const unit = period.slice(-1);
    
    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      case 'm': return value * 30 * 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000; // Default to 1 hour
    }
  }

  // Generate mock time series data for compatibility
  private getMockTimeSeries(farmId: string, metricType: any, period: string): any[] {
    const now = Date.now();
    const periodMs = this.parsePeriodToMs(period);
    const points = [];
    
    // Generate 20 data points over the period
    for (let i = 19; i >= 0; i--) {
      const timestamp = now - (periodMs / 20) * i;
      const value = Math.random() * 100;
      points.push({
        timestamp: new Date(timestamp),
        value
      });
    }
    
    return [{
      metric: `${metricType}_${farmId}`,
      points
    }];
  }
}

export const metricsService = MetricsService.getInstance();