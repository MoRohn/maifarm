import { useState, useEffect, useCallback } from 'react';
import { reportingService } from '@/services/reportingService';
import { predictiveAnalyticsService } from '@/services/predictiveAnalytics';
import { PerformanceMetrics, PredictiveInsight, Report } from '@/types/reporting';
import { Farm } from '@/types';
import { useWebSocketStore } from '@/store/websocketStore';

export function useAnalytics(farmId?: string) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [insights, setInsights] = useState<PredictiveInsight[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const { messages } = useWebSocketStore();

  // Load initial data
  useEffect(() => {
    loadAnalytics();
  }, [farmId]);

  // Listen for WebSocket updates
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'metrics_update':
      case 'task_completed':
      case 'agent_update':
        // Refresh metrics when relevant events occur
        loadMetrics();
        break;
      case 'insight_generated':
        if (lastMessage.payload) {
          setInsights(prev => [lastMessage.payload as PredictiveInsight, ...prev]);
        }
        break;
    }
  }, [messages]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadMetrics(),
        loadInsights(),
        loadReports()
      ]);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const metricsData = await reportingService.getPerformanceMetrics(farmId);
      setMetrics(metricsData);
      
      // Record metrics for historical tracking
      if (farmId) {
        predictiveAnalyticsService.recordMetrics(farmId, metricsData);
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const loadInsights = async () => {
    try {
      const insightsData = await predictiveAnalyticsService.getInsights(farmId);
      setInsights(insightsData);
    } catch (error) {
      console.error('Failed to load insights:', error);
    }
  };

  const loadReports = async () => {
    try {
      const reportsData = await reportingService.getReports();
      setReports(reportsData);
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  };

  const generateReport = useCallback(async (
    name: string,
    type: Report['type'],
    format: Report['format'],
    config: any
  ) => {
    try {
      const report = await reportingService.generateReport(name, type, format, config);
      setReports(prev => [report, ...prev]);
      
      // Poll for report completion
      const checkInterval = setInterval(async () => {
        const updatedReport = await reportingService.getReport(report.id);
        if (updatedReport && updatedReport.status !== 'generating') {
          clearInterval(checkInterval);
          setReports(prev => prev.map(r => r.id === report.id ? updatedReport : r));
        }
      }, 1000);
      
      return report;
    } catch (error) {
      console.error('Failed to generate report:', error);
      throw error;
    }
  }, []);

  const analyzeFarm = useCallback(async (farm: Farm) => {
    try {
      const newInsights = await predictiveAnalyticsService.analyzeFarmPerformance(farm);
      setInsights(newInsights);
      return newInsights;
    } catch (error) {
      console.error('Failed to analyze farm:', error);
      throw error;
    }
  }, []);

  const exportData = useCallback(async (format: 'json' | 'csv' | 'excel', data: any, filters?: any) => {
    try {
      return await reportingService.exportData(format, data, filters);
    } catch (error) {
      console.error('Failed to export data:', error);
      throw error;
    }
  }, []);

  return {
    metrics,
    insights,
    reports,
    loading,
    generateReport,
    analyzeFarm,
    exportData,
    refreshAnalytics: loadAnalytics
  };
}