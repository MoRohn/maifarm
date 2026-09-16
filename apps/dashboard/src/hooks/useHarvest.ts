import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { harvestService } from '@/services/harvestService';
import { 
  Harvest, 
  HarvestFilter, 
  HarvestSummary,
  HarvestExport 
} from '@/types/harvest';
import { useToast } from './useToast';

// Keep existing hooks for backward compatibility
export function useHarvests(filter?: HarvestFilter) {
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useWebSocket({ 
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567' 
  });

  // Load harvests
  const loadHarvests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await harvestService.getAll(filter);
      setHarvests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load harvests');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Start harvest
  const startHarvest = useCallback(async (farmId: string, farmName: string) => {
    try {
      const newHarvest = await harvestService.startHarvest(farmId, farmName);
      setHarvests(prev => [newHarvest, ...prev]);
      return newHarvest;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to start harvest');
    }
  }, []);

  // Export harvest
  const exportHarvest = useCallback(async (exportConfig: HarvestExport) => {
    try {
      await harvestService.downloadExport(
        exportConfig.harvestId,
        exportConfig.format
      );
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to export harvest');
    }
  }, []);

  // Listen for WebSocket events
  useEffect(() => {
    if (!socket) return;

    const handleHarvestStarted = (data: any) => {
      loadHarvests(); // Refresh the list
    };

    const handleHarvestCompleted = (data: any) => {
      loadHarvests(); // Refresh the list
    };

    const handleHarvestProgress = (data: any) => {
      // Update specific harvest progress
      setHarvests(prev => prev.map(harvest => 
        harvest.id === data.harvestId 
          ? { ...harvest, summary: data.summary }
          : harvest
      ));
    };

    socket.on('harvest:started', handleHarvestStarted);
    socket.on('harvest:completed', handleHarvestCompleted);
    socket.on('harvest:progress', handleHarvestProgress);

    return () => {
      socket.off('harvest:started', handleHarvestStarted);
      socket.off('harvest:completed', handleHarvestCompleted);
      socket.off('harvest:progress', handleHarvestProgress);
    };
  }, [socket, loadHarvests]);

  // Initial load
  useEffect(() => {
    loadHarvests();
  }, [loadHarvests]);

  return {
    harvests,
    loading,
    error,
    startHarvest,
    exportHarvest,
    refresh: loadHarvests
  };
}

export function useHarvest(id: string) {
  const [harvest, setHarvest] = useState<Harvest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const { socket } = useWebSocket({ 
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567' 
  });

  useEffect(() => {
    const loadHarvest = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await harvestService.getById(id);
        setHarvest(data);
        
        // Calculate progress
        if (data.status === 'processing' && data.summary.totalTasks > 0) {
          setProgress((data.summary.completedTasks / data.summary.totalTasks) * 100);
        } else if (data.status === 'ready') {
          setProgress(100);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load harvest');
      } finally {
        setLoading(false);
      }
    };

    loadHarvest();
  }, [id]);

  // Subscribe to progress updates
  useEffect(() => {
    if (!socket || !harvest || harvest.status !== 'processing') return;

    const unsubscribe = harvestService.subscribeToHarvest(id, (newProgress, summary) => {
      setProgress(newProgress);
      setHarvest(prev => prev ? { ...prev, summary } : null);
    });

    return unsubscribe;
  }, [socket, id, harvest?.status]);

  return { harvest, loading, error, progress };
}

export function useHarvestSummaries() {
  const [summaries, setSummaries] = useState<HarvestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSummaries = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await harvestService.getSummaries();
        setSummaries(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load harvest summaries');
      } finally {
        setLoading(false);
      }
    };

    loadSummaries();
  }, []);

  return { summaries, loading, error };
}

// Hook for monitoring active harvests
export function useActiveHarvests() {
  const { harvests, loading, error, refresh } = useHarvests({
    status: ['processing']
  });

  return {
    activeHarvests: harvests,
    loading,
    error,
    refresh
  };
}

// ===== Enhanced Harvest Hook with Coordination Support =====

interface UseHarvestCoordinationOptions {
  farmId?: string;
  autoJoinRoom?: boolean;
  pollingInterval?: number;
}

interface CoordinationAgent {
  agent_id: string;
  status: 'active' | 'idle' | 'completed' | 'error';
  started: string;
  current_step?: number;
}

interface WorkClaim {
  agent_id: string;
  timestamp: string;
  claimed_steps: string[];
  status: string;
}

interface CompletedWork {
  agent_id: string;
  description: string;
  timestamp: string;
  results?: any;
}

interface HarvestCoordinationState {
  agents: CoordinationAgent[];
  workClaims: WorkClaim[];
  completedWork: CompletedWork[];
  terminalSessions: any[];
  terminalOutputs: Map<string, string[]>;
  harvestReports: any[];
}

export function useHarvestCoordination(options: UseHarvestCoordinationOptions = {}) {
  const { farmId, autoJoinRoom = true, pollingInterval = 5000 } = options;
  const { showToast } = useToast();
  
  const [state, setState] = useState<HarvestCoordinationState>({
    agents: [],
    workClaims: [],
    completedWork: [],
    terminalSessions: [],
    terminalOutputs: new Map(),
    harvestReports: []
  });

  const unsubscribeCallbacks = useRef<(() => void)[]>([]);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch coordination data
  const fetchCoordinationData = useCallback(async () => {
    try {
      const [agents, claims, completed, reports] = await Promise.all([
        harvestService.getCoordinationAgents(),
        harvestService.getWorkClaims(),
        harvestService.getCompletedWork(),
        farmId ? harvestService.getHarvestReports(farmId) : Promise.resolve([])
      ]);

      setState(prev => ({
        ...prev,
        agents,
        workClaims: claims,
        completedWork: completed,
        harvestReports: reports
      }));
    } catch (error) {
      console.error('Failed to fetch coordination data:', error);
    }
  }, [farmId]);

  // Fetch terminal sessions
  const fetchTerminalSessions = useCallback(async () => {
    try {
      const sessions = await harvestService.getTerminalSessions();
      setState(prev => ({ ...prev, terminalSessions: sessions }));
    } catch (error) {
      console.error('Failed to fetch terminal sessions:', error);
    }
  }, []);

  // Get terminal output
  const getTerminalOutput = useCallback(async (
    sessionName: string, 
    agentId: string, 
    lines: number = 100
  ) => {
    try {
      const output = await harvestService.getTerminalOutput(sessionName, agentId, lines);
      const key = `${sessionName}:${agentId}`;
      
      setState(prev => {
        const newOutputs = new Map(prev.terminalOutputs);
        newOutputs.set(key, output.terminal || []);
        return { ...prev, terminalOutputs: newOutputs };
      });
      
      return output;
    } catch (error) {
      console.error('Failed to get terminal output:', error);
      throw error;
    }
  }, []);

  // Send terminal command
  const sendTerminalCommand = useCallback(async (
    sessionName: string,
    agentId: string,
    command: string
  ) => {
    try {
      await harvestService.sendTerminalCommand(sessionName, agentId, command);
      showToast('Command sent successfully', 'success');
      
      // Refresh terminal output after command
      setTimeout(() => {
        getTerminalOutput(sessionName, agentId);
      }, 500);
    } catch (error) {
      showToast('Failed to send command', 'error');
      throw error;
    }
  }, [getTerminalOutput, showToast]);

  // Create harvest report
  const createHarvestReport = useCallback(async (results: any[]) => {
    if (!farmId) {
      showToast('Farm ID is required to create report', 'error');
      return;
    }
    
    try {
      const report = await harvestService.createHarvestReport(farmId, results);
      setState(prev => ({
        ...prev,
        harvestReports: [...prev.harvestReports, report]
      }));
      showToast('Harvest report created successfully', 'success');
      return report;
    } catch (error) {
      showToast('Failed to create harvest report', 'error');
      throw error;
    }
  }, [farmId, showToast]);

  // Setup WebSocket subscriptions
  useEffect(() => {
    if (!farmId || !autoJoinRoom) return;

    // Join harvest room
    harvestService.joinHarvestRoom(farmId);

    // Subscribe to events
    const unsubscribeUpdate = harvestService.onHarvestUpdate((update) => {
      console.log('Harvest update:', update);
      // Handle different update types
      switch (update.type) {
        case 'agent_update':
          fetchCoordinationData();
          break;
        case 'data_collected':
          // Update completed work
          setState(prev => ({
            ...prev,
            completedWork: [...prev.completedWork, update.data]
          }));
          break;
        case 'completed':
          showToast('Harvest completed!', 'success');
          break;
        case 'error':
          showToast(`Harvest error: ${update.data.message}`, 'error');
          break;
      }
    });

    const unsubscribeAgents = harvestService.onAgentsUpdate((agents) => {
      setState(prev => ({ ...prev, agents }));
    });

    const unsubscribeWork = harvestService.onWorkCompleted((completed) => {
      setState(prev => ({
        ...prev,
        completedWork: [...prev.completedWork, ...completed]
      }));
    });

    const unsubscribeTerminal = harvestService.onTerminalOutput((output) => {
      const key = `${output.sessionName}:${output.agentId}`;
      setState(prev => {
        const newOutputs = new Map(prev.terminalOutputs);
        newOutputs.set(key, output.lines || []);
        return { ...prev, terminalOutputs: newOutputs };
      });
    });

    const unsubscribeInitial = harvestService.onInitialData((data) => {
      setState(prev => ({
        ...prev,
        agents: data.agents || [],
        workClaims: data.claims || [],
        completedWork: data.completed || [],
        harvestReports: data.reports || []
      }));
    });

    // Store unsubscribe callbacks
    unsubscribeCallbacks.current = [
      unsubscribeUpdate,
      unsubscribeAgents,
      unsubscribeWork,
      unsubscribeTerminal,
      unsubscribeInitial
    ];

    // Cleanup
    return () => {
      harvestService.leaveHarvestRoom(farmId);
      unsubscribeCallbacks.current.forEach(fn => fn());
      unsubscribeCallbacks.current = [];
    };
  }, [farmId, autoJoinRoom, fetchCoordinationData, showToast]);

  // Setup polling for coordination data
  useEffect(() => {
    if (!farmId || !pollingInterval) return;

    // Initial fetch
    fetchCoordinationData();
    fetchTerminalSessions();

    // Setup polling
    pollingTimer.current = setInterval(() => {
      fetchCoordinationData();
    }, pollingInterval);

    return () => {
      if (pollingTimer.current) {
        clearInterval(pollingTimer.current);
        pollingTimer.current = null;
      }
    };
  }, [farmId, pollingInterval, fetchCoordinationData, fetchTerminalSessions]);

  return {
    // State
    agents: state.agents,
    workClaims: state.workClaims,
    completedWork: state.completedWork,
    terminalSessions: state.terminalSessions,
    terminalOutputs: state.terminalOutputs,
    harvestReports: state.harvestReports,
    
    // Actions
    fetchCoordinationData,
    fetchTerminalSessions,
    getTerminalOutput,
    sendTerminalCommand,
    createHarvestReport,
    
    // Computed values
    activeAgentsCount: state.agents.filter(a => a.status === 'active').length,
    completedTasksCount: state.completedWork.length
  };
}