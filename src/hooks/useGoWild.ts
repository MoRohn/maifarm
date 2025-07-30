import { useState, useEffect, useCallback, useRef } from 'react';
import { GoWildSession, GoWildConfig, GoWildUpdate } from '../types/goWild';
import { goWildService } from '../services/goWildService';

export const useGoWild = (farmId: string) => {
  const [session, setSession] = useState<GoWildSession | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection
    const ws = goWildService.connectWebSocket(farmId);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error');
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const update: GoWildUpdate = JSON.parse(event.data);
        handleUpdate(update);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    // Load existing session if any
    loadSession();

    return () => {
      ws.close();
    };
  }, [farmId]);

  const handleUpdate = (update: GoWildUpdate) => {
    switch (update.type) {
      case 'status-changed':
        setSession(prev => prev ? { ...prev, status: update.data.status } : null);
        break;
      case 'node-added':
        setSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            explorationPath: {
              ...prev.explorationPath,
              nodes: [...prev.explorationPath.nodes, update.data.node],
              edges: update.data.edges ? [...prev.explorationPath.edges, ...update.data.edges] : prev.explorationPath.edges,
              currentNodeId: update.data.node.id
            },
            stats: {
              ...prev.stats,
              nodesExplored: prev.stats.nodesExplored + 1,
              averageCreativity: (
                (prev.stats.averageCreativity * prev.stats.nodesExplored + update.data.node.creativity) /
                (prev.stats.nodesExplored + 1)
              )
            }
          };
        });
        break;
      case 'discovery-made':
        setSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            explorationPath: {
              ...prev.explorationPath,
              discoveries: [...prev.explorationPath.discoveries, update.data.discovery]
            },
            stats: {
              ...prev.stats,
              discoveriesMade: prev.stats.discoveriesMade + 1
            }
          };
        });
        break;
      case 'path-changed':
        setSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            explorationPath: update.data.path,
            stats: {
              ...prev.stats,
              backtrackCount: prev.stats.backtrackCount + (update.data.isBacktrack ? 1 : 0)
            }
          };
        });
        break;
    }
  };

  const loadSession = async () => {
    try {
      const sessionData = await goWildService.getSession(farmId);
      if (sessionData) {
        setSession(sessionData);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      setError('Failed to load session');
    }
  };

  const startExploration = useCallback(async (config: GoWildConfig) => {
    try {
      setError(null);
      const newSession = await goWildService.startExploration(farmId, config);
      setSession(newSession);
      return newSession;
    } catch (err) {
      console.error('Failed to start exploration:', err);
      setError('Failed to start exploration');
      throw err;
    }
  }, [farmId]);

  const pauseExploration = useCallback(async () => {
    if (!session) return;
    try {
      await goWildService.pauseExploration(session.id);
      setSession(prev => prev ? { ...prev, status: 'paused' } : null);
    } catch (err) {
      console.error('Failed to pause exploration:', err);
      setError('Failed to pause exploration');
    }
  }, [session]);

  const resumeExploration = useCallback(async () => {
    if (!session) return;
    try {
      await goWildService.resumeExploration(session.id);
      setSession(prev => prev ? { ...prev, status: 'exploring' } : null);
    } catch (err) {
      console.error('Failed to resume exploration:', err);
      setError('Failed to resume exploration');
    }
  }, [session]);

  const stopExploration = useCallback(async () => {
    if (!session) return;
    try {
      await goWildService.stopExploration(session.id);
      setSession(prev => prev ? { 
        ...prev, 
        status: 'completed',
        endTime: new Date()
      } : null);
    } catch (err) {
      console.error('Failed to stop exploration:', err);
      setError('Failed to stop exploration');
    }
  }, [session]);

  const updateConfig = useCallback(async (config: GoWildConfig) => {
    if (!session) return;
    try {
      await goWildService.updateConfig(session.id, config);
      setSession(prev => prev ? { ...prev, config } : null);
    } catch (err) {
      console.error('Failed to update config:', err);
      setError('Failed to update configuration');
    }
  }, [session]);

  const saveDiscovery = useCallback(async (discoveryId: string) => {
    if (!session) return;
    try {
      await goWildService.saveDiscovery(session.id, discoveryId);
      setSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          explorationPath: {
            ...prev.explorationPath,
            discoveries: prev.explorationPath.discoveries.map(d =>
              d.id === discoveryId ? { ...d, saved: true } : d
            )
          }
        };
      });
    } catch (err) {
      console.error('Failed to save discovery:', err);
      setError('Failed to save discovery');
    }
  }, [session]);

  return {
    session,
    isConnected,
    error,
    startExploration,
    pauseExploration,
    resumeExploration,
    stopExploration,
    updateConfig,
    saveDiscovery
  };
};