/**
 * useConfidenceScore - React hook for real-time confidence scoring
 *
 * Provides confidence data for farms and agents with WebSocket integration
 * for real-time updates from the inference-confidenz plugin.
 *
 * @author Blerbz
 * @license MIT
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import {
  confidenzService,
  FarmConfidenceData,
  ConfidenceMetrics,
  AgentConfidence,
  ConfidenceHistory,
} from '@/services/confidenzService';

export interface UseConfidenceScoreOptions {
  farmId: string;
  autoSubscribe?: boolean;
  pollInterval?: number; // Optional polling interval in ms (0 = no polling)
}

export interface UseConfidenceScoreReturn {
  // Current data
  confidence: FarmConfidenceData | null;
  metrics: ConfidenceMetrics | null;
  agents: AgentConfidence[];
  history: ConfidenceHistory[];

  // Computed values
  averageScore: number;
  trend: 'improving' | 'declining' | 'stable';
  overallLevel: 'high' | 'medium' | 'low';

  // Loading states
  isLoading: boolean;
  isSubscribed: boolean;
  error: string | null;

  // Actions
  subscribe: () => Promise<void>;
  unsubscribe: () => void;
  refresh: () => Promise<void>;
  fetchHistory: (limit?: number) => Promise<void>;

  // Utilities
  getLevelColor: (level: 'high' | 'medium' | 'low') => string;
  formatScore: (score: number) => string;
  getTrendIcon: (trend: 'improving' | 'declining' | 'stable') => string;
}

export function useConfidenceScore(options: UseConfidenceScoreOptions): UseConfidenceScoreReturn {
  const { farmId, autoSubscribe = true, pollInterval = 0 } = options;

  // State
  const [confidence, setConfidence] = useState<FarmConfidenceData | null>(null);
  const [metrics, setMetrics] = useState<ConfidenceMetrics | null>(null);
  const [agents, setAgents] = useState<AgentConfidence[]>([]);
  const [history, setHistory] = useState<ConfidenceHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // WebSocket
  const { subscribe: wsSubscribe, unsubscribe: wsUnsubscribe, socket } = useWebSocket();

  // Computed values
  const averageScore = confidence?.aggregate?.average ?? metrics?.currentScore ?? 0;
  const trend = confidence?.aggregate?.trend ?? metrics?.trend ?? 'stable';
  const overallLevel = confidence?.aggregate?.level ?? confidenzService.getLevelFromScore(averageScore);

  /**
   * Fetch confidence data from API
   */
  const refresh = useCallback(async () => {
    if (!farmId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await confidenzService.getFarmConfidence(farmId);

      if (response.status === 'ok') {
        // Update metrics
        if (response.metrics) {
          setMetrics(response.metrics);
        }

        // Update agents
        if (response.agents) {
          setAgents(response.agents);
        }

        // Update coordination-based confidence data
        if (response.coordination) {
          setConfidence({
            farmId,
            agents: response.agents || [],
            aggregate: {
              average: response.coordination.averageScore,
              min: response.coordination.minScore,
              max: response.coordination.maxScore,
              level: response.coordination.overallLevel,
              trend: response.coordination.trend,
            },
            updatedAt: response.coordination.updatedAt,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch confidence data';
      setError(message);
      console.error('[useConfidenceScore] Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [farmId]);

  /**
   * Fetch confidence history
   */
  const fetchHistory = useCallback(async (limit = 50) => {
    if (!farmId) return;

    try {
      const response = await confidenzService.getHistory(farmId, limit);
      setHistory(response.history);
    } catch (err) {
      console.error('[useConfidenceScore] Error fetching history:', err);
    }
  }, [farmId]);

  /**
   * Handle WebSocket confidence update
   */
  const handleConfidenceUpdate = useCallback((data: any) => {
    if (data.farmId !== farmId) return;

    // Update from WebSocket event
    if (data.agents) {
      const formattedAgents: AgentConfidence[] = data.agents.map((a: any) => ({
        id: a.agentId || a.id,
        name: a.agentName || a.name,
        score: a.score,
        level: a.level || confidenzService.getLevelFromScore(a.score),
        shouldAutoContinue: a.shouldAutoContinue ?? true,
        timestamp: a.timestamp || new Date().toISOString(),
      }));
      setAgents(formattedAgents);
    }

    if (data.aggregate) {
      setConfidence({
        farmId,
        agents: agents,
        aggregate: {
          average: data.aggregate.averageScore || data.aggregate.average,
          min: data.aggregate.minScore || data.aggregate.min,
          max: data.aggregate.maxScore || data.aggregate.max,
          level: data.aggregate.level || confidenzService.getLevelFromScore(data.aggregate.averageScore || data.aggregate.average),
          trend: data.aggregate.trend || 'stable',
        },
        updatedAt: data.timestamp || new Date().toISOString(),
      });
    }
  }, [farmId, agents]);

  /**
   * Subscribe to WebSocket confidence updates
   */
  const subscribe = useCallback(async () => {
    if (!farmId || isSubscribed) return;

    try {
      // Start backend monitoring
      await confidenzService.startMonitoring(farmId);

      // Subscribe to WebSocket events
      if (socket) {
        socket.emit('confidence:subscribe', { farmId });
      }

      setIsSubscribed(true);

      // Initial data fetch
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to subscribe to confidence updates';
      setError(message);
      console.error('[useConfidenceScore] Error subscribing:', err);
    }
  }, [farmId, isSubscribed, socket, refresh]);

  /**
   * Unsubscribe from WebSocket updates
   */
  const unsubscribe = useCallback(() => {
    if (!farmId) return;

    if (socket) {
      socket.emit('confidence:unsubscribe', { farmId });
    }

    setIsSubscribed(false);
  }, [farmId, socket]);

  // Setup WebSocket listener
  useEffect(() => {
    if (!socket || !farmId) return;

    // Listen for farm-specific updates
    const cleanup1 = wsSubscribe('farm:confidence:update', handleConfidenceUpdate);

    // Listen for global confidence updates
    const cleanup2 = wsSubscribe('confidence:update', handleConfidenceUpdate);

    // Listen for current data response
    const handleCurrentData = (data: any) => {
      if (data.farmId === farmId) {
        handleConfidenceUpdate(data);
      }
    };
    const cleanup3 = wsSubscribe('confidence:current', handleCurrentData);

    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
    };
  }, [socket, farmId, wsSubscribe, handleConfidenceUpdate]);

  // Auto-subscribe on mount
  useEffect(() => {
    if (autoSubscribe && farmId) {
      subscribe();
    }

    return () => {
      if (isSubscribed) {
        unsubscribe();
      }
    };
  }, [farmId, autoSubscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Setup polling if configured
  useEffect(() => {
    if (pollInterval > 0 && farmId) {
      pollIntervalRef.current = setInterval(() => {
        refresh();
      }, pollInterval);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [pollInterval, farmId, refresh]);

  return {
    // Data
    confidence,
    metrics,
    agents,
    history,

    // Computed
    averageScore,
    trend,
    overallLevel,

    // States
    isLoading,
    isSubscribed,
    error,

    // Actions
    subscribe,
    unsubscribe,
    refresh,
    fetchHistory,

    // Utilities
    getLevelColor: confidenzService.getLevelColor,
    formatScore: confidenzService.formatScore,
    getTrendIcon: confidenzService.getTrendIcon,
  };
}

/**
 * Simple hook for displaying confidence score in UI
 * Returns just the essential data for display
 */
export function useConfidenceDisplay(farmId: string) {
  const {
    averageScore,
    trend,
    overallLevel,
    isLoading,
    getLevelColor,
    formatScore,
    getTrendIcon,
  } = useConfidenceScore({ farmId, autoSubscribe: true });

  return {
    score: averageScore,
    scoreText: formatScore(averageScore),
    level: overallLevel,
    levelColor: getLevelColor(overallLevel),
    trend,
    trendIcon: getTrendIcon(trend),
    isLoading,
  };
}

export default useConfidenceScore;
