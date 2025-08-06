import { useState, useEffect } from 'react';
import { MetricType, TimeSeries, AggregationResult, SystemMetrics, FarmMetricsData, AgentMetrics } from '../types/metrics';
import { metricsService } from '../services/metricsService';

interface UseMetricsReturn {
  metrics: TimeSeries[];
  aggregated: AggregationResult | null;
  loading: boolean;
  error: string | null;
  systemMetrics: SystemMetrics | null;
  farmMetrics: FarmMetricsData[];
  agentMetrics: AgentMetrics[];
  fetchMetrics: (farmId: string, metricType: MetricType, period: string) => Promise<void>;
  fetchAggregated: (farmId: string, metricType: MetricType, aggregation: string, period: string) => Promise<void>;
  refreshMetrics: () => Promise<void>;
  getTimeSeries: (metric: string, period: string) => TimeSeries[];
  aggregateMetrics: (metrics: TimeSeries[], aggregation: string) => number;
}

export const useMetrics = (): UseMetricsReturn => {
  const [metrics, setMetrics] = useState<TimeSeries[]>([]);
  const [aggregated, setAggregated] = useState<AggregationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [farmMetrics, setFarmMetrics] = useState<FarmMetricsData[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<AgentMetrics[]>([]);

  const fetchMetrics = async (farmId: string, metricType: MetricType, period: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await metricsService.fetchMetrics(farmId, metricType, period);
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  };

  const fetchAggregated = async (farmId: string, metricType: MetricType, aggregation: string, period: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await metricsService.getAggregatedMetrics(farmId, metricType, aggregation, period);
      setAggregated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch aggregated metrics');
    } finally {
      setLoading(false);
    }
  };

  const refreshMetrics = async () => {
    // Implement refresh logic based on current context
    setLoading(true);
    try {
      // Refresh all metrics types
      await Promise.all([
        fetchMetrics('current', MetricType.GAUGE, '1h'),
        // Add more refresh calls as needed
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh metrics');
    } finally {
      setLoading(false);
    }
  };

  const getTimeSeries = (metric: string, period: string): TimeSeries[] => {
    return metrics.filter(m => m.metric === metric);
  };

  const aggregateMetrics = (metrics: TimeSeries[], aggregation: string): number => {
    if (metrics.length === 0) return 0;
    
    const allValues = metrics.flatMap(m => m.points.map(p => p.value));
    
    switch (aggregation) {
      case 'avg':
        return allValues.reduce((sum, val) => sum + val, 0) / allValues.length;
      case 'sum':
        return allValues.reduce((sum, val) => sum + val, 0);
      case 'max':
        return Math.max(...allValues);
      case 'min':
        return Math.min(...allValues);
      default:
        return 0;
    }
  };

  return {
    metrics,
    aggregated,
    loading,
    error,
    systemMetrics,
    farmMetrics,
    agentMetrics,
    fetchMetrics,
    fetchAggregated,
    refreshMetrics,
    getTimeSeries,
    aggregateMetrics
  };
};