import { useState, useEffect, useCallback } from 'react';
import { 
  Farm, 
  FarmTemplate, 
  FarmSetupRequest, 
  FarmSetupProgress 
} from '../types/orchestration';
import { FarmOrchestrationService } from '../services/farmOrchestrationService';

let orchestrationService: FarmOrchestrationService | null = null;

const getOrchestrationService = () => {
  if (!orchestrationService) {
    orchestrationService = new FarmOrchestrationService();
  }
  return orchestrationService;
};

export const useFarmOrchestration = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [templates, setTemplates] = useState<FarmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const service = getOrchestrationService();

  useEffect(() => {
    // Initialize service and load data
    const loadData = () => {
      try {
        setTemplates(service.getTemplates());
        setFarms(service.getAllFarms());
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load farm data');
        setLoading(false);
      }
    };

    loadData();

    // Set up event listeners
    const handleFarmCreated = (event: any) => {
      setFarms(service.getAllFarms());
    };

    const handleFarmFailed = (event: any) => {
      setError(`Farm ${event.farmId} failed: ${event.error}`);
    };

    const handleMetricsUpdated = () => {
      setFarms(service.getAllFarms());
    };

    service.on('farm:created', handleFarmCreated);
    service.on('farm:failed', handleFarmFailed);
    service.on('metrics:updated', handleMetricsUpdated);

    return () => {
      service.off('farm:created', handleFarmCreated);
      service.off('farm:failed', handleFarmFailed);
      service.off('metrics:updated', handleMetricsUpdated);
    };
  }, [service]);

  const createFarm = useCallback(async (request: FarmSetupRequest) => {
    setError(null);
    try {
      const progress = await service.createFarm(request);
      return progress;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create farm';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [service]);

  const getSetupProgress = useCallback(async (farmId: string) => {
    return service.getSetupProgress(farmId);
  }, [service]);

  const scaleAgents = useCallback(async (farmId: string, agentType: string, delta: number) => {
    setError(null);
    try {
      await service.scaleAgents(farmId, agentType, delta);
      setFarms(service.getAllFarms());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to scale agents';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [service]);

  const getFarm = useCallback((farmId: string) => {
    return service.getFarm(farmId);
  }, [service]);

  return {
    farms,
    templates,
    loading,
    error,
    createFarm,
    getSetupProgress,
    scaleAgents,
    getFarm
  };
};