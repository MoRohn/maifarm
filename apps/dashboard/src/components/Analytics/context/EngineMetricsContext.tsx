import React, { createContext, useContext, useEffect, useState } from 'react';
import { engineCatalogService, type EngineCatalogEntry, type EngineMetricsEntry } from '@/services/engineCatalogService';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { toast } from 'react-hot-toast';

interface EngineMetricsContextValue {
  catalog: EngineCatalogEntry[];
  metrics: EngineMetricsEntry[];
  refresh: () => Promise<void>;
  isLoading: boolean;
}

const EngineMetricsContext = createContext<EngineMetricsContextValue | undefined>(undefined);

export const EngineMetricsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [catalog, setCatalog] = useState<EngineCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { setEngineMetrics, engineMetrics } = useAnalyticsStore();

  const load = async () => {
    setIsLoading(true);
    try {
      const [catalogData, metricsData] = await Promise.all([
        engineCatalogService.fetchCatalog(),
        engineCatalogService.fetchMetrics()
      ]);
      setCatalog(catalogData);
      setEngineMetrics(metricsData);
    } catch (error) {
      console.error('[EngineMetrics] Failed to load engine metrics', error);
      toast.error('Failed to load engine metrics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const value: EngineMetricsContextValue = {
    catalog,
    metrics: engineMetrics,
    isLoading,
    refresh: load
  };

  return (
    <EngineMetricsContext.Provider value={value}>
      {children}
    </EngineMetricsContext.Provider>
  );
};

export const useEngineMetrics = () => {
  const context = useContext(EngineMetricsContext);
  if (!context) {
    throw new Error('useEngineMetrics must be used within EngineMetricsProvider');
  }
  return context;
};

export default EngineMetricsContext;
