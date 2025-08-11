import { useState, useEffect, useCallback } from 'react';
import { useFarmStore } from '../store/farmStore';
import { apiClient } from '../services/apiClient';

export interface MetricsData {
  totalAgents: number;
  activeAgents: number;
  totalFarms: number;
  activeFarms: number;
  completedTasks: number;
  failedTasks: number;
  uptime: number;
  lastUpdated: Date;
  isStale: boolean;
}

export interface MetricsConfig {
  refreshInterval?: number;
  fallbackEnabled?: boolean;
  staleThreshold?: number; // minutes before data is considered stale
}

/**
 * Hook for robust metrics calculation with fallback mechanisms
 * Provides consistent agent/farm counts across all components
 */
export const useRobustMetrics = (config: MetricsConfig = {}) => {
  const {
    refreshInterval = 30000, // 30 seconds
    fallbackEnabled = true,
    staleThreshold = 5 // 5 minutes
  } = config;

  const [metrics, setMetrics] = useState<MetricsData>({
    totalAgents: 0,
    activeAgents: 0,
    totalFarms: 0,
    activeFarms: 0,
    completedTasks: 0,
    failedTasks: 0,
    uptime: 0,
    lastUpdated: new Date(),
    isStale: false
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get farm store data for fallback
  const { farms, fetchFarms } = useFarmStore();

  /**
   * Calculate metrics from multiple sources with prioritized fallback
   */
  const calculateMetrics = useCallback(async (): Promise<MetricsData> => {
    const timestamp = new Date();
    let primaryData: MetricsData | null = null;
    let fallbackData: MetricsData | null = null;

    // Primary source: API endpoints
    try {
      const [agentsResponse, farmsResponse, metricsResponse] = await Promise.allSettled([
        apiClient.get('/api/agents'),
        apiClient.get('/api/farms'),
        apiClient.get('/api/metrics/dashboard')
      ]);

      if (agentsResponse.status === 'fulfilled' && 
          farmsResponse.status === 'fulfilled') {
        
        // Axios response.data contains the API response { success: true, data: [...] }
        const agents = agentsResponse.value.data?.data || [];
        const farmsList = farmsResponse.value.data?.data || [];
        
        // Get additional metrics if available
        let additionalMetrics = {};
        if (metricsResponse.status === 'fulfilled') {
          additionalMetrics = metricsResponse.value.data?.data || metricsResponse.value.data || {};
        }

        // Filter to only count agents from active farms
        const activeFarmsList = farmsList.filter((f: any) => 
          ['running', 'active', 'harvesting', 'launching'].includes(f.status)
        );
        const activeFarmIds = new Set(activeFarmsList.map((f: any) => f.id));
        
        // Count distinct agents by ID from active farms only
        const uniqueAgentIds = new Set();
        const activeAgentsList = [];
        
        agents.forEach((agent: any) => {
          if (activeFarmIds.has(agent.farmId) && agent.id) {
            if (!uniqueAgentIds.has(agent.id)) {
              uniqueAgentIds.add(agent.id);
              activeAgentsList.push(agent);
            }
          }
        });
        
        // Calculate completed tasks from farms data
        const totalCompletedTasks = farmsList.reduce((sum: number, farm: any) => {
          return sum + (farm.metrics?.completedTasks || 0);
        }, 0);
        
        const totalFailedTasks = farmsList.reduce((sum: number, farm: any) => {
          return sum + (farm.metrics?.failedTasks || 0);
        }, 0);
        
        primaryData = {
          totalAgents: uniqueAgentIds.size,
          activeAgents: activeAgentsList.filter((a: any) => 
            ['running', 'active', 'working', 'launching'].includes(a.status)
          ).length,
          totalFarms: farmsList.length,
          activeFarms: activeFarmsList.length,
          completedTasks: totalCompletedTasks || additionalMetrics.completedTasks || 0,
          failedTasks: totalFailedTasks || additionalMetrics.failedTasks || 0,
          uptime: additionalMetrics.uptime || 0,
          lastUpdated: timestamp,
          isStale: false
        };
      }
    } catch (apiError) {
      console.warn('API metrics fetch failed:', apiError);
    }

    // Fallback source: Local farm store + coordination files
    if (fallbackEnabled) {
      try {
        // Refresh farm store data
        await fetchFarms();
        
        // Calculate from local store - count distinct agents
        const uniqueStoreAgents = new Set();
        const activeStoreAgents = new Set();
        
        farms.forEach(farm => {
          if (['running', 'active', 'harvesting', 'launching'].includes(farm.status)) {
            (farm.agents || []).forEach((agent: any) => {
              if (agent?.id) {
                uniqueStoreAgents.add(agent.id);
                if (['running', 'active', 'working'].includes(agent.status)) {
                  activeStoreAgents.add(agent.id);
                }
              }
            });
          }
        });
        
        const totalAgentsFromStore = uniqueStoreAgents.size || farms.reduce((sum, farm) => 
          sum + (farm.agents?.length || 0), 0
        );
        
        const activeAgentsFromStore = activeStoreAgents.size;

        const activeFarmsFromStore = farms.filter(f => 
          ['running', 'active', 'harvesting'].includes(f.status)
        ).length;

        // Try to get coordination file data
        let coordinationAgents = 0;
        try {
          const coordResponse = await fetch('/api/coordination/agents');
          if (coordResponse.ok) {
            const coordData = await coordResponse.json();
            coordinationAgents = coordData.data?.length || 0;
          }
        } catch (coordError) {
          console.debug('Coordination data not available:', coordError);
        }

        fallbackData = {
          totalAgents: Math.max(totalAgentsFromStore, coordinationAgents),
          activeAgents: activeAgentsFromStore,
          totalFarms: farms.length,
          activeFarms: activeFarmsFromStore,
          completedTasks: farms.reduce((sum, f) => sum + (f.metrics?.completedTasks || 0), 0),
          failedTasks: farms.reduce((sum, f) => sum + (f.metrics?.failedTasks || 0), 0),
          uptime: Math.max(...farms.map(f => f.uptime || 0), 0),
          lastUpdated: timestamp,
          isStale: false
        };
      } catch (storeError) {
        console.warn('Store metrics calculation failed:', storeError);
      }
    }

    // Return primary data if available, otherwise fallback
    const finalData = primaryData || fallbackData;
    
    if (!finalData) {
      throw new Error('Unable to calculate metrics from any source');
    }

    return finalData;
  }, [farms, fetchFarms, fallbackEnabled]);

  /**
   * Update metrics data with staleness detection
   */
  const updateMetrics = useCallback(async () => {
    try {
      setError(null);
      const newMetrics = await calculateMetrics();
      
      // Check if data is stale
      const now = new Date();
      const minutesSinceUpdate = (now.getTime() - newMetrics.lastUpdated.getTime()) / (1000 * 60);
      newMetrics.isStale = minutesSinceUpdate > staleThreshold;

      setMetrics(newMetrics);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update metrics';
      setError(errorMessage);
      
      // Mark existing data as stale on error
      setMetrics(prev => ({ ...prev, isStale: true }));
    } finally {
      setLoading(false);
    }
  }, [calculateMetrics, staleThreshold]);

  /**
   * Force refresh metrics
   */
  const refreshMetrics = useCallback(() => {
    setLoading(true);
    updateMetrics();
  }, [updateMetrics]);

  // Initial load
  useEffect(() => {
    updateMetrics();
  }, []);

  // Set up refresh interval
  useEffect(() => {
    const interval = setInterval(updateMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [updateMetrics, refreshInterval]);

  return {
    metrics,
    loading,
    error,
    refreshMetrics,
    isHealthy: !error && !metrics.isStale
  };
};

/**
 * Hook for specific farm metrics
 */
export const useFarmMetrics = (farmId: string) => {
  const [farmMetrics, setFarmMetrics] = useState({
    agentCount: 0,
    activeAgents: 0,
    completedTasks: 0,
    status: 'idle' as string,
    uptime: 0
  });

  const { farms } = useFarmStore();

  useEffect(() => {
    const farm = farms.find(f => f.id === farmId);
    if (farm) {
      setFarmMetrics({
        agentCount: farm.agents?.length || 0,
        activeAgents: farm.agents?.filter((a: any) => 
          ['running', 'active', 'working'].includes(a.status)
        ).length || 0,
        completedTasks: farm.metrics?.completedTasks || 0,
        status: farm.status || 'idle',
        uptime: farm.uptime || 0
      });
    }
  }, [farmId, farms]);

  return farmMetrics;
};