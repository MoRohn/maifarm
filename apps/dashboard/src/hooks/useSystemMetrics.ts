import { useState, useEffect, useRef } from 'react';

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  storage: {
    total: number;
    used: number;
    available: number;
    percentage: number;
  };
  gpu: {
    usage: number;
    memory: number;
    temperature?: number;
    name?: string;
    count: number;
  };
}

interface UseSystemMetricsOptions {
  refreshInterval?: number;
  autoRefresh?: boolean;
}

interface UseSystemMetricsReturn {
  systemInfo: SystemMetrics;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const defaultSystemMetrics: SystemMetrics = {
  cpu: { cores: 0, usage: 0, model: '' },
  memory: { total: 0, used: 0, free: 0, percentage: 0 },
  storage: { total: 0, used: 0, available: 0, percentage: 0 },
  gpu: { usage: 0, memory: 0, count: 0 }
};

export const useSystemMetrics = (
  options: UseSystemMetricsOptions = {}
): UseSystemMetricsReturn => {
  const { refreshInterval = 15000, autoRefresh = true } = options;

  const [systemInfo, setSystemInfo] = useState<SystemMetrics>(defaultSystemMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSystemInfo = async () => {
    if (!mountedRef.current) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:4567'}/api/metrics/system`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch system metrics: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data && mountedRef.current) {
        // Validate and set system info
        const validatedData: SystemMetrics = {
          cpu: {
            usage: Math.min(100, Math.max(0, data.data.cpu?.usage || 0)),
            cores: data.data.cpu?.cores || 0,
            model: data.data.cpu?.model || 'Unknown',
            temperature: data.data.cpu?.temperature
          },
          memory: {
            total: data.data.memory?.total || 0,
            used: data.data.memory?.used || 0,
            free: data.data.memory?.free || 0,
            percentage: Math.min(100, Math.max(0, data.data.memory?.percentage || 0))
          },
          storage: {
            total: data.data.storage?.total || 0,
            used: data.data.storage?.used || 0,
            available: data.data.storage?.available || 0,
            percentage: Math.min(100, Math.max(0, data.data.storage?.percentage || 0))
          },
          gpu: {
            usage: Math.min(100, Math.max(0, data.data.gpu?.usage || 0)),
            memory: data.data.gpu?.memory || 0,
            temperature: data.data.gpu?.temperature,
            name: data.data.gpu?.name,
            count: data.data.gpu?.count || 0
          }
        };

        setSystemInfo(validatedData);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch system info:', err);
      if (mountedRef.current) {
        setError(err as Error);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch
    fetchSystemInfo();

    // Set up auto-refresh if enabled
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchSystemInfo, refreshInterval);
    }

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refreshInterval, autoRefresh]);

  return {
    systemInfo,
    loading,
    error,
    refetch: fetchSystemInfo
  };
};
