import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

export interface RealTimeCostMetrics {
  currentSession: {
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    apiCalls: number;
    startTime: Date;
    provider: string;
    model: string;
  };
  hourlyCost: number;
  dailyCost: number;
  monthlyCost: number;
  projectedMonthlyCost: number;
  costPerTask: number;
  costPerAgent: { [agentId: string]: number };
  costPerFarm: { [farmId: string]: number };
  comparisonWithAlternative?: {
    currentProvider: string;
    alternativeProvider: string;
    currentCost: number;
    alternativeCost: number;
    potentialSavings: number;
    savingsPercentage: number;
  };
}

export interface PricingModel {
  key: string;
  name: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  contextWindow: number;
  description?: string;
  active: boolean;
  lastUpdated: Date;
}

export interface ProviderPricing {
  provider: string;
  models: PricingModel[];
}

export interface OptimizationTip {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  estimatedSavings: number;
  action: string;
}

export interface CostUpdate {
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    model: string;
    provider: string;
    timestamp: Date;
  };
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
  };
  metrics: RealTimeCostMetrics;
}

export const useCostTracking = () => {
  const { socket, connected } = useWebSocket();
  const [metrics, setMetrics] = useState<RealTimeCostMetrics | null>(null);
  const [pricingData, setPricingData] = useState<ProviderPricing[]>([]);
  const [optimizationTips, setOptimizationTips] = useState<OptimizationTip[]>([]);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        
        // Fetch pricing data
        const pricingResponse = await fetch('/api/cost-tracking/pricing', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (pricingResponse.ok) {
          const pricingResult = await pricingResponse.json();
          if (pricingResult.success) {
            setPricingData(pricingResult.data);
          }
        }

        // Fetch current metrics
        const metricsResponse = await fetch('/api/cost-tracking/metrics', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (metricsResponse.ok) {
          const metricsResult = await metricsResponse.json();
          if (metricsResult.success) {
            setMetrics(metricsResult.data);
          }
        }

        // Fetch optimization tips
        const tipsResponse = await fetch('/api/cost-tracking/optimization-tips', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (tipsResponse.ok) {
          const tipsResult = await tipsResponse.json();
          if (tipsResult.success) {
            setOptimizationTips(tipsResult.data.tips);
          }
        }

        setError(null);
      } catch (err) {
        console.error('Failed to fetch cost tracking data:', err);
        setError('Failed to load cost tracking data');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!socket || !connected) return;

    // Subscribe to cost updates
    socket.emit('cost:subscribe');

    // Handle cost metrics updates
    const handleCostMetrics = (data: RealTimeCostMetrics) => {
      setMetrics(data);
    };

    // Handle individual cost updates
    const handleCostUpdate = (event: { data: CostUpdate }) => {
      // Update metrics from the cost update
      if (event.data.metrics) {
        setMetrics(event.data.metrics);
      }
    };

    socket.on('cost:metrics', handleCostMetrics);
    socket.on('cost:update', handleCostUpdate);

    return () => {
      socket.emit('cost:unsubscribe');
      socket.off('cost:metrics', handleCostMetrics);
      socket.off('cost:update', handleCostUpdate);
    };
  }, [socket, connected]);

  // Track token usage
  const trackUsage = useCallback(async (usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    provider: string;
    taskId?: string;
    farmId?: string;
    agentId?: string;
  }) => {
    try {
      const response = await fetch('/api/cost-tracking/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(usage)
      });

      const result = await response.json();
      return result.success ? result.data : null;
    } catch (error) {
      console.error('Failed to track token usage:', error);
      return null;
    }
  }, []);

  // Calculate cost without tracking
  const calculateCost = useCallback(async (usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    provider: string;
  }) => {
    try {
      const response = await fetch('/api/cost-tracking/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(usage)
      });

      const result = await response.json();
      return result.success ? result.data : null;
    } catch (error) {
      console.error('Failed to calculate cost:', error);
      return null;
    }
  }, []);

  // Fetch historical data
  const fetchHistoricalData = useCallback(async (timeRange: {
    start: Date;
    end: Date;
    groupBy?: 'hour' | 'day' | 'week' | 'month';
  }) => {
    try {
      const params = new URLSearchParams({
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
        groupBy: timeRange.groupBy || 'day'
      });

      const response = await fetch(`/api/cost-tracking/history?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        setHistoricalData(result.data);
        return result.data;
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
      return [];
    }
  }, []);

  // Export cost report
  const exportReport = useCallback(async (
    timeRange: { start: Date; end: Date },
    format: 'csv' | 'json' = 'csv'
  ) => {
    try {
      const params = new URLSearchParams({
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
        format
      });

      const response = await fetch(`/api/cost-tracking/export?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cost-report-${timeRange.start.toISOString().split('T')[0]}-to-${timeRange.end.toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to export report:', error);
      return false;
    }
  }, []);

  // Get model pricing info
  const getModelPricing = useCallback((provider: string, model: string) => {
    const providerPricing = pricingData.find(p => p.provider === provider);
    if (!providerPricing) return null;
    
    return providerPricing.models.find(m => m.key === model || m.name === model);
  }, [pricingData]);

  // Get provider comparison
  const getProviderComparison = useCallback(() => {
    return metrics?.comparisonWithAlternative || null;
  }, [metrics]);

  return {
    metrics,
    pricingData,
    optimizationTips,
    historicalData,
    loading,
    error,
    trackUsage,
    calculateCost,
    fetchHistoricalData,
    exportReport,
    getModelPricing,
    getProviderComparison,
    // Current session metrics
    currentSessionCost: metrics?.currentSession?.totalCost || 0,
    dailyCost: metrics?.dailyCost || 0,
    monthlyCost: metrics?.monthlyCost || 0,
    projectedMonthlyCost: metrics?.projectedMonthlyCost || 0,
    // Cost breakdown
    costPerTask: metrics?.costPerTask || 0,
    costPerAgent: metrics?.costPerAgent || {},
    costPerFarm: metrics?.costPerFarm || {},
    // Savings potential
    potentialSavings: metrics?.comparisonWithAlternative?.potentialSavings || 0,
    savingsPercentage: metrics?.comparisonWithAlternative?.savingsPercentage || 0
  };
};