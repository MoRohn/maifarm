import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CentralTerminalView } from './CentralTerminalView';
import { HarvestDashboard } from './HarvestDashboard';
import { WorkflowCanvas } from './WorkflowCanvas';
import { 
  Package, 
  ArrowLeft, 
  Loader2, 
  LayoutDashboard, 
  Clock, 
  Command,
  Monitor,
  Cpu,
  Users,
  Layers
} from 'lucide-react';
import { useFarmStore } from '@/store/farmStore';
import { useWebSocketStore } from '@/store/websocketStore';
import { farmService } from '@/services/farmService';
import { harvestService } from '@/services/harvestService';
import { mapAgentNamesInHarvest, resolveAgentDisplayName } from '@/utils/agentNameMapper';
import { Tooltip } from '../common/Tooltip';
import { GlassPanel } from '../common/GlassPanel';
import { useHarvestElapsed } from '@/hooks/useTimeElapsed';
import { ConceptExplainerModal } from './ConceptExplainerModal';
import { premiumClasses, premiumDesign, cn } from '@/styles/premium-design-system';

type FrontendAgentStatus = 'initializing' | 'active' | 'processing' | 'idle' | 'error' | 'completed';

const parseNumericId = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const digits = value.match(/\d+/g);
    if (digits && digits.length > 0) {
      const parsed = parseInt(digits[digits.length - 1], 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
};

const derivePaneId = (agent: any, index: number): number | undefined => {
  if (!agent) {
    return index;
  }

  if (typeof agent.paneId === 'number' && Number.isFinite(agent.paneId)) {
    return agent.paneId;
  }

  if (typeof agent.pane === 'string') {
    const paneValue = parseNumericId(agent.pane);
    if (paneValue !== undefined) {
      return paneValue;
    }
  }

  if (typeof agent.agentNumber === 'number' && Number.isFinite(agent.agentNumber)) {
    return Math.max(0, agent.agentNumber - 1);
  }

  const fallbackId = parseNumericId(agent.id || agent.uid || agent.agentId);
  if (fallbackId !== undefined) {
    return fallbackId;
  }

  return index;
};

const deriveAgentNumber = (agent: any, index: number): number => {
  if (typeof agent?.agentNumber === 'number' && Number.isFinite(agent.agentNumber)) {
    return agent.agentNumber;
  }

  const paneId = derivePaneId(agent, index);
  if (paneId !== undefined) {
    return paneId + 1;
  }

  return index + 1;
};

const parseAgentData = (agent: any): Record<string, any> | null => {
  if (!agent) {
    return null;
  }

  if (typeof agent === 'string') {
    try {
      return JSON.parse(agent);
    } catch {
      return null;
    }
  }

  if (typeof agent === 'object') {
    return agent as Record<string, any>;
  }

  return null;
};

const clampPercentage = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
};

const computeMemoryUsage = (agent: Record<string, any> | null): number => {
  if (!agent) {
    return 0;
  }

  const percent = agent.performance?.memoryUsage ??
    agent.resources?.memory?.percentage ??
    agent.resources?.memoryPercentage;

  if (typeof percent === 'number') {
    return clampPercentage(percent);
  }

  if (agent.resources?.memory?.used && agent.resources?.memory?.total) {
    const ratio = (agent.resources.memory.used / agent.resources.memory.total) * 100;
    return clampPercentage(ratio);
  }

  const rawValue = agent.resources?.memory?.usage ??
    agent.resources?.memoryUsage ??
    agent.memory ?? 0;

  if (typeof rawValue === 'number' && rawValue > 100) {
    return clampPercentage((rawValue / 4096) * 100);
  }

  return clampPercentage(rawValue || 0);
};

const computeAgentMetrics = (agent: Record<string, any> | null) => {
  if (!agent) {
    return {
      cpu: 0,
      memory: 0,
      tasksCompleted: 0,
      successRate: 0,
      avgResponseTime: 1250
    };
  }

  const cpu = agent.performance?.cpuUsage ??
    agent.resources?.cpu?.usage ??
    agent.resources?.cpuUsage ??
    agent.cpu ??
    0;

  const memory = computeMemoryUsage(agent);

  const tasksCompleted = agent.metrics?.tasksCompleted ??
    agent.performance?.tasksCompleted ??
    0;

  const successRate = agent.metrics?.successRate ??
    agent.performance?.successRate ??
    0;

  const avgResponseTime = agent.performance?.avgResponseTime ?? 1250;

  return {
    cpu,
    memory,
    tasksCompleted,
    successRate,
    avgResponseTime
  };
};

const normalizeAgentStatus = (agent: Record<string, any> | null): FrontendAgentStatus => {
  if (!agent) {
    return 'idle';
  }

  const rawStatus = agent.status ??
    agent.state?.current ??
    agent.lifecycle?.state ??
    agent.lifecycle?.phase ??
    agent.state ??
    agent.lifecycle;

  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : '';

  switch (status) {
    case 'initializing':
    case 'starting':
    case 'booting':
      return 'initializing';
    case 'processing':
    case 'working':
    case 'busy':
    case 'executing':
      return 'processing';
    case 'active':
    case 'running':
    case 'live':
      return 'active';
    case 'completed':
    case 'done':
    case 'finished':
      return 'completed';
    case 'error':
    case 'failed':
    case 'broken':
      return 'error';
    case 'idle':
    default:
      return 'idle';
  }
};

const ensureUniqueName = (
  rawName: string | undefined,
  fallbackName: string,
  index: number,
  seen: Map<string, number>
): string => {
  const base = (rawName || fallbackName || '').trim();
  const key = base.toLowerCase();
  const count = seen.get(key) ?? 0;
  seen.set(key, count + 1);

  if (count === 0) {
    return base || fallbackName;
  }

  if (base === fallbackName) {
    return `${fallbackName}-${String(index + 1).padStart(2, '0')}`;
  }

  return `${base} #${count + 1}`;
};

const extractPaneIndexFromCoordination = (agent: Record<string, any>): number | undefined => {
  if (!agent) {
    return undefined;
  }

  const candidates = [
    agent.paneIndex,
    agent.pane_id,
    agent.paneId,
    agent.agent_index,
    agent.agentIndex
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return (
    parseNumericId(agent.pane) ??
    parseNumericId(agent.id) ??
    parseNumericId(agent.uid) ??
    parseNumericId(agent.agent_id) ??
    parseNumericId(agent.agentId)
  );
};

export const HarvestPage: React.FC = () => {
  const { farmId, harvestId } = useParams<{ farmId?: string; harvestId?: string }>();
  const navigate = useNavigate();
  
  // Early return if no farmId or harvestId to prevent infinite loops
  if (!farmId && !harvestId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">No farm or harvest specified</p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-4 py-2 bg-primary-500 text-white rounded hover:bg-primary-600"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  const [loading, setLoading] = useState(true);
  
  // Remove debug log that was causing console spam
  // console.log('[HarvestPage] Component mounted with farmId:', farmId, 'harvestId:', harvestId);
  const [farm, setFarm] = useState<any>(null);
  const [harvest, setHarvest] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'workflow' | 'terminal' | 'dashboard'>('terminal'); // Default to terminal view
  const [hasHarvest, setHasHarvest] = useState(false);
  const [goWildSession, setGoWildSession] = useState<any>(null);
  const [terminalSessions, setTerminalSessions] = useState<any[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | undefined>(farmId);
  const [activeAgentCount, setActiveAgentCount] = useState<number>(0);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [coordinationAgents, setCoordinationAgents] = useState<any[]>([]);
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [showYaml, setShowYaml] = useState(false); // State for YAML expansion
  const [isQuickTask, setIsQuickTask] = useState(false); // State to detect Quick Tasks
  const farms = useFarmStore(state => state.farms);
  const updateFarm = useFarmStore(state => state.updateFarm);
  const activeFarms = farms.filter(f => ['active', 'running', 'harvesting'].includes(f.status));
  const { subscribe, connected } = useWebSocketStore();
  
  // Add time elapsed tracking - ensure we pass the right data structure
  const { timeElapsed, isRunning } = useHarvestElapsed(
    farm ? { 
      started_at: farm.createdAt || farm.created_at,
      status: farm.status,
      createdAt: farm.createdAt || farm.created_at
    } : harvest
  );

  useEffect(() => {
    if (harvestId) {
      // If we have a harvestId, fetch the harvest first to get the farmId
      fetchHarvestById(harvestId);
    } else {
      const targetFarmId = selectedFarmId || farmId;
      if (targetFarmId) {
        // First check local store
        const localFarm = farms.find(f => f.id === targetFarmId);
        if (localFarm) {
          setFarm(localFarm);
          
          // Detect Quick Task farms
          const isQuickTaskFarm = localFarm.metadata?.isQuickTask || 
                                  localFarm.name?.includes('Quick Task');
          setIsQuickTask(isQuickTaskFarm);
          
          checkHarvestAvailability();
          
          // Check if this is a fresh navigation from farm creation (within last 30 seconds)
          const farmAge = Date.now() - new Date(localFarm.createdAt).getTime();
          const isRecentlyCreated = farmAge < 30000; // 30 seconds
          const hasSeenModal = sessionStorage.getItem(`concept-modal-seen-${targetFarmId}`);
          
          if (isRecentlyCreated && !hasSeenModal) {
            setShowConceptModal(true);
          }
          
          // Check if this is a Go Wild farm
          if (localFarm.type === 'autonomous' || localFarm.metadata?.isGoWild) {
            fetchGoWildSession();
          }
          // Fetch terminal sessions for this farm
          fetchTerminalSessions(targetFarmId);
        } else {
          // Fetch from server if not in store
          fetchFarm();
        }
      }
    }
  }, [selectedFarmId, farmId, harvestId]); // Removed 'farms' from dependencies to prevent infinite re-renders

  // Separate effect to update farm when farms change
  useEffect(() => {
    if (farm && farm.id) {
      const updatedFarm = farms.find(f => f.id === farm.id);
      if (updatedFarm && JSON.stringify(updatedFarm) !== JSON.stringify(farm)) {
        setFarm(updatedFarm);
      }
    }
  }, [farms, farm?.id]); // Only update if farm actually changed

  useEffect(() => {
    let isMounted = true;

    if (!selectedFarmId) {
      setCoordinationAgents([]);
      return () => {
        isMounted = false;
      };
    }

    const fetchCoordinationAgents = async () => {
      try {
        const agents = await harvestService.getCoordinationAgents(selectedFarmId);
        if (isMounted) {
          setCoordinationAgents(agents || []);
        }
      } catch (error) {
        console.error('Failed to fetch coordination agents:', error);
      }
    };

    fetchCoordinationAgents();
    const interval = setInterval(fetchCoordinationAgents, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedFarmId]);

  const fetchHarvestById = async (harvestId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/harvests/${harvestId}`);
      if (response.ok) {
        const harvestData = await response.json();
        if (harvestData.success && harvestData.data) {
          const harvestInfo = harvestData.data;
          
          // Set the view mode based on harvest status
          if (harvestInfo.status === 'ready') {
            setViewMode('dashboard');
          }
          
          // Now fetch the farm using the farmId from the harvest
          if (harvestInfo.farmId) {
            setSelectedFarmId(harvestInfo.farmId);
            const localFarm = farms.find(f => f.id === harvestInfo.farmId);
            if (localFarm) {
              setFarm(localFarm);
              
              // Detect Quick Task farms
              const isQuickTaskFarm = localFarm.metadata?.isQuickTask || 
                                      localFarm.name?.includes('Quick Task');
              setIsQuickTask(isQuickTaskFarm);
              
              // Apply agent name mapping before setting harvest
              const mappedHarvest = mapAgentNamesInHarvest(harvestInfo, localFarm);
              setHarvest(mappedHarvest);
              setHasHarvest(true);
              fetchTerminalSessions(harvestInfo.farmId);
            } else {
              // Fetch farm from server
              const farmData = await fetchFarmById(harvestInfo.farmId);
              if (farmData) {
                setFarm(farmData); // Ensure farm is set
                // Apply agent name mapping after farm is fetched
                const mappedHarvest = mapAgentNamesInHarvest(harvestInfo, farmData);
                setHarvest(mappedHarvest);
                setHasHarvest(true);
              } else {
                // Fallback: set harvest without mapping, but still try to set a basic farm object
                setHarvest(harvestInfo);
                setHasHarvest(true);
                // Create a minimal farm object from harvest info
                setFarm({
                  id: harvestInfo.farmId,
                  name: harvestInfo.farmName || 'Quick Task',
                  status: 'active',
                  agents: []
                });
              }
            }
          } else {
            // No farm ID - set harvest without mapping
            setHarvest(harvestInfo);
            setHasHarvest(true);
          }
        }
      } else {
        console.error('Harvest not found');
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching harvest:', error);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchFarmById = async (farmId: string) => {
    try {
      const farmData = await farmService.getFarm(farmId);
      setFarm(farmData);
      fetchTerminalSessions(farmId);
      return farmData;
    } catch (error) {
      console.error('Error fetching farm by ID:', error);
      return null;
    }
  };

  const fetchTerminalSessions = async (targetFarmId: string) => {
    try {
      // Add base URL handling for API calls
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/harvest/terminal/sessions?farmId=${encodeURIComponent(targetFarmId)}`);
      
      if (!response.ok) {
        // Don't throw for 404 or expected errors, just log
        if (response.status !== 404) {
          console.warn(`Failed to fetch terminal sessions: ${response.status} ${response.statusText}`);
        }
        setTerminalSessions([]);
        return;
      }
      
      const data = await response.json();
      const sessions = data.data || [];
      setTerminalSessions(sessions);
      
      // Update active agent count based on terminal sessions
      if (sessions.length > 0) {
        const totalAgents = sessions.reduce((sum: number, session: any) => sum + (session.paneCount || 0), 0);
        setActiveAgentCount(totalAgents);
      }
    } catch (error) {
      // More informative error logging
      if (error instanceof TypeError && error.message === 'Load failed') {
        console.error('Error fetching terminal sessions - Network error: The API server may be unavailable');
      } else {
        console.error('Error fetching terminal sessions:', error);
      }
      setTerminalSessions([]);
    }
  };

  const checkHarvestAvailability = async () => {
    const targetFarmId = selectedFarmId || farmId;
    if (!targetFarmId) return;
    try {
      const harvests = await harvestService.getByFarmId(targetFarmId);
      setHasHarvest(harvests.length > 0);
      // Default to dashboard view if harvest is available
      if (harvests.length > 0 && harvests[0].status === 'ready') {
        setViewMode('dashboard');
      }
    } catch (error) {
      console.error('Error checking harvest:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFarm = async () => {
    const targetFarmId = selectedFarmId || farmId;
    if (!targetFarmId) {
      setLoading(false);
      return;
    }
    
    try {
      console.log('[HarvestPage] Fetching farm:', targetFarmId);
      const farmData = await farmService.getFarm(targetFarmId);
      console.log('[HarvestPage] Farm data received:', farmData);
      setFarm(farmData);
      
      // Detect Quick Task farms
      const isQuickTaskFarm = farmData.metadata?.isQuickTask || 
                              farmData.name?.includes('Quick Task');
      setIsQuickTask(isQuickTaskFarm);
      
      await checkHarvestAvailability();
      
      // Check if this is a fresh navigation from farm creation (within last 30 seconds)
      const farmAge = Date.now() - new Date(farmData.createdAt).getTime();
      const isRecentlyCreated = farmAge < 30000; // 30 seconds
      const hasSeenModal = sessionStorage.getItem(`concept-modal-seen-${targetFarmId}`);
      
      if (isRecentlyCreated && !hasSeenModal) {
        setShowConceptModal(true);
      }
      
      // Check if this is a Go Wild farm
      if (farmData.type === 'autonomous' || farmData.metadata?.isGoWild) {
        fetchGoWildSession();
      }
      // Fetch terminal sessions for this farm
      fetchTerminalSessions(targetFarmId);
    } catch (error) {
      console.error('[HarvestPage] Error fetching farm:', error);
      // Set loading to false even on error to show error state
      setLoading(false);
      // Don't navigate away immediately, show error state
      setTimeout(() => {
        navigate('/home');
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const fetchGoWildSession = async () => {
    if (!farmId) return;
    
    try {
      const response = await fetch(`/api/go-wild/session/${farmId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setGoWildSession(data.data);
          console.log('Go Wild session loaded:', data.data);
        }
      }
    } catch (error) {
      console.error('Error fetching Go Wild session:', error);
    }
  };

  // Auto-refresh polling for farm and terminal updates - ENHANCED for smoother updates
  useEffect(() => {
    const targetFarmId = selectedFarmId || farmId;
    if (!targetFarmId) return;

    console.log('[HarvestPage] Starting auto-refresh polling for farm:', targetFarmId);

    // Initial fetch
    fetchTerminalSessions(targetFarmId);

    // Poll every 2 seconds for faster updates (reduced from 3s)
    const pollInterval = setInterval(async () => {
      try {
        // Refresh farm data from API (not just store) to get latest status
        const freshFarm = await farmService.getFarm(targetFarmId);
        if (freshFarm && JSON.stringify(freshFarm) !== JSON.stringify(farm)) {
          console.log('[HarvestPage] Farm updated via API poll:', freshFarm.status);
          setFarm(freshFarm);

          // Update store so other components see changes
          updateFarm(targetFarmId, freshFarm);
        }

        // Refresh terminal sessions to detect new panes
        await fetchTerminalSessions(targetFarmId);

        // Check harvest availability (in case harvest completed)
        if (freshFarm?.status === 'completed' || freshFarm?.status === 'harvesting') {
          await checkHarvestAvailability();
        }
      } catch (error) {
        console.error('[HarvestPage] Auto-refresh error:', error);
      }
    }, 2000); // 2 seconds for smoother updates

    return () => {
      console.log('[HarvestPage] Stopping auto-refresh polling');
      clearInterval(pollInterval);
    };
  }, [selectedFarmId, farmId]);

  // Listen for WebSocket events for real-time updates
  useEffect(() => {
    if (!farmId || !connected) return;

    const handleHarvestReady = (data: any) => {
      if (data.farmId === farmId && data.type === 'goWild') {
        console.log('Go Wild harvest ready:', data);
        setGoWildSession((prev: any) => ({
          ...prev,
          status: 'completed',
          summary: data.summary
        }));
        // Switch to dashboard view to show results
        setViewMode('dashboard');
        setHasHarvest(true);
      }
    };

    // CRITICAL: Add missing harvest status event handlers
    const handleHarvestStarted = (data: any) => {
      const eventFarmId = data.farmId || data.payload?.farmId;
      if (eventFarmId === farmId || eventFarmId?.startsWith(farmId?.substring(0, 8))) {
        console.log('Harvest started:', data);
        setHasHarvest(true);
        // Refresh harvest data
        if (data.harvestId || data.harvest) {
          const harvestData = data.harvest || { id: data.harvestId, status: 'processing' };
          setHarvest(harvestData);
        }
        // Keep in terminal view to show progress
        if (viewMode === 'dashboard') {
          setViewMode('terminal');
        }
      }
    };

    const handleHarvestCompleted = (data: any) => {
      const eventFarmId = data.farmId || data.payload?.farmId;
      const eventHarvestId = data.harvestId || data.harvest?.id;
      if ((eventFarmId === farmId || eventFarmId?.startsWith(farmId?.substring(0, 8))) || 
          (harvestId && eventHarvestId === harvestId)) {
        console.log('Harvest completed:', data);
        setHasHarvest(true);
        // Refresh harvest data
        if (data.harvest) {
          const mappedHarvest = farm ? mapAgentNamesInHarvest(data.harvest, farm) : data.harvest;
          setHarvest(mappedHarvest);
        }
        // Switch to dashboard view to show results
        setViewMode('dashboard');
        // Refresh harvest availability
        checkHarvestAvailability();
      }
    };

    const handleHarvestStatusUpdate = (data: any) => {
      const eventFarmId = data.farmId || data.payload?.farmId;
      const eventHarvestId = data.harvestId || data.harvest?.id;
      if ((eventFarmId === farmId || eventFarmId?.startsWith(farmId?.substring(0, 8))) || 
          (harvestId && eventHarvestId === harvestId)) {
        console.log('Harvest status update:', data);
        // Update harvest status in real-time
        if (data.status) {
          setHarvest((prev: any) => prev ? { ...prev, status: data.status } : prev);
        }
        if (data.harvest) {
          const mappedHarvest = farm ? mapAgentNamesInHarvest(data.harvest, farm) : data.harvest;
          setHarvest(mappedHarvest);
        }
        // Update hasHarvest flag
        setHasHarvest(true);
      }
    };

    const handleHarvestUpdate = (data: any) => {
      const eventFarmId = data.farmId || data.payload?.farmId;
      if (eventFarmId === farmId || eventFarmId?.startsWith(farmId?.substring(0, 8))) {
        console.log('Harvest update:', data);
        setHarvest((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            ...data.harvest,
            status: data.status || prev.status
          };
        });
      }
    };
    
    // Handle harvest yield updates (items being collected)
    const handleHarvestYieldUpdate = (data: any) => {
      if (data.farmId === farmId || data.harvestId === harvestId) {
        // Removed duplicate console.log to prevent console spam
        setHarvest((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            yield: data.yield || prev.yield
          };
        });
      }
    };
    
    // Handle individual item downloads
    const handleHarvestItemUpdate = (data: any) => {
      if (data.farmId === farmId || data.harvestId === harvestId) {
        setHarvest((prev: any) => {
          if (!prev || !prev.yield) return prev;
          return {
            ...prev,
            yield: prev.yield.map((item: any) => 
              item.id === data.itemId 
                ? { ...item, status: data.status, size: data.size }
                : item
            )
          };
        });
      }
    };

    const handleGoWildUpdate = (data: any) => {
      if (data.farmId === farmId) {
        if (data.type === 'status-changed' && data.data?.status === 'completed') {
          // Fetch the latest harvest data
          checkHarvestAvailability();
        }
      }
    };
    
    const handleFarmStatus = (data: any) => {
      const eventFarmId = data.farmId || data.payload?.farmId;
      if (eventFarmId === farmId || eventFarmId?.startsWith(farmId?.substring(0, 8))) {
        // Update farm status and orchestrator type if provided
        const newStatus = data.status || data.payload?.status;
        const orchestratorType = data.orchestratorType || data.payload?.orchestratorType;

        console.log('[HarvestPage] Farm status event received:', { newStatus, orchestratorType, data });

        // Trigger terminal session refresh when farm becomes active
        if (newStatus === 'active' || newStatus === 'running') {
          console.log('[HarvestPage] Farm is now active, refreshing terminal sessions');
          fetchTerminalSessions(farmId);
        }

        if ((newStatus || orchestratorType) && farm) {
          console.log(`[HarvestPage] Updating farm: status=${newStatus}, orchestrator=${orchestratorType}`);

          // Update local state - store orchestratorType in config
          setFarm((prevFarm: any) => ({
            ...prevFarm,
            ...(newStatus && { status: newStatus }),
            ...(orchestratorType && {
              config: {
                ...prevFarm.config,
                orchestratorType
              }
            })
          }));
          
          // Update global store so other components see the change
          const updates: any = {};
          if (newStatus) updates.status = newStatus;
          if (orchestratorType) {
            updates.config = {
              ...farm.config,
              orchestratorType
            };
          }
          updateFarm(farmId, updates);
        }
        
        if (data.agentCount) {
          setActiveAgentCount(data.agentCount);
        }
        // Refresh terminal sessions when farm status changes
        fetchTerminalSessions(farmId);
      }
    };
    
    const handleAgentUpdate = (data: any) => {
      const eventFarmId = data.farmId || data.payload?.farmId;
      if (eventFarmId === farmId || eventFarmId?.startsWith(farmId?.substring(0, 8))) {
        console.log('Agent update:', data);
        if (data.agents) {
          setActiveAgentCount(data.agents.length || data.agents);
        }
        if (data.tasks) {
          setActiveTasks(data.tasks);
        }
      }
    };

    const unsubscribeHarvest = subscribe('harvest:ready', handleHarvestReady);
    const unsubscribeGoWild = subscribe('goWild:status-changed', handleGoWildUpdate);
    
    // CRITICAL: Subscribe to missing harvest status events
    const unsubscribeHarvestStarted = subscribe('harvest:started', handleHarvestStarted);
    const unsubscribeHarvestCompleted = subscribe('harvest:completed', handleHarvestCompleted);
    const unsubscribeHarvestStatus = subscribe('harvest:status', handleHarvestStatusUpdate);
    const unsubscribeHarvestUpdated = subscribe('harvest:updated', handleHarvestUpdate);
    
    // Subscribe to harvest yield events (removed duplicate harvest:progress subscription)
    const unsubscribeYieldUpdate = subscribe('harvest:yield:updated', handleHarvestYieldUpdate);
    const unsubscribeItemUpdate = subscribe('harvest:item:updated', handleHarvestItemUpdate);
    
    // Subscribe to additional events for better synchronization
    const unsubscribeFarmStatus = subscribe('farm:status', handleFarmStatus);
    const unsubscribeFarmLaunched = subscribe('farm:launched', handleFarmStatus);
    const unsubscribeFarmOrchestrator = subscribe('farm:orchestrator', handleFarmStatus);
    const unsubscribeAgentsLaunching = subscribe('farm:agents:launching', handleFarmStatus);
    const unsubscribeMultiClaude = subscribe('multi-claude:status', handleFarmStatus);
    const unsubscribeAgentUpdate = subscribe('agent:updated', handleAgentUpdate);
    const unsubscribeTaskProgress = subscribe('task:progress', handleAgentUpdate);

    return () => {
      unsubscribeHarvest();
      unsubscribeGoWild();
      // CRITICAL: Cleanup missing harvest status event subscriptions
      unsubscribeHarvestStarted();
      unsubscribeHarvestCompleted();
      unsubscribeHarvestStatus();
      unsubscribeHarvestUpdated();
      unsubscribeYieldUpdate();
      unsubscribeItemUpdate();
      unsubscribeFarmStatus();
      unsubscribeFarmLaunched();
      unsubscribeFarmOrchestrator();
      unsubscribeAgentsLaunching();
      unsubscribeMultiClaude();
      unsubscribeAgentUpdate();
      unsubscribeTaskProgress();
    };
  }, [farmId, harvestId, subscribe, connected]);

  const coordinationAgentMap = useMemo(() => {
    const map = new Map<number, Record<string, any>>();

    coordinationAgents.forEach(agent => {
      if (!agent) return;
      const agentFarmId = agent.farm_id || agent.farmId;
      if (selectedFarmId && agentFarmId && agentFarmId !== selectedFarmId) {
        return;
      }

      const paneIndex = extractPaneIndexFromCoordination(agent as Record<string, any>);
      if (paneIndex !== undefined) {
        map.set(paneIndex, agent as Record<string, any>);
      }
    });

    return map;
  }, [coordinationAgents, selectedFarmId]);

  const rawFarmAgents = Array.isArray(farm?.agents) ? farm?.agents : [];
  const rawFarmAgentCount = rawFarmAgents.length;
  const coordinationAgentCount = coordinationAgentMap.size;

  const primaryTerminalSession = Array.isArray(terminalSessions) && terminalSessions.length > 0
    ? terminalSessions[0]
    : undefined;

  const terminalPaneCountRaw = primaryTerminalSession?.paneCount;
  const terminalPaneCount = typeof terminalPaneCountRaw === 'number' && Number.isFinite(terminalPaneCountRaw)
    ? terminalPaneCountRaw
    : 0;

  const normalizedActiveAgentCount = typeof activeAgentCount === 'number' && Number.isFinite(activeAgentCount)
    ? activeAgentCount
    : 0;

  const totalAgentCount = Math.max(
    rawFarmAgentCount,
    coordinationAgentCount,
    terminalPaneCount,
    normalizedActiveAgentCount,
    1
  );

  const normalizedAgents = useMemo(() => {
    const seenNames = new Map<string, number>();

    const agentsList = [] as Array<{
      id: number;
      index: number;
      paneId?: number;
      agentNumber: number;
      name: string;
      status: FrontendAgentStatus;
      uid?: string;
      raw: Record<string, any> | null;
      coordination: Record<string, any> | null;
      workspacePath?: string;
    }>;

    for (let index = 0; index < totalAgentCount; index++) {
      const rawAgent = rawFarmAgents[index];
      const parsedAgent = parseAgentData(rawAgent);
      const coordinationInfo = coordinationAgentMap.get(index) || null;

      const fallbackName = isQuickTask
        ? `Quick Task Agent ${index + 1}`
        : `Agent-${String(index + 1).padStart(2, '0')}`;

      const coordinationName = coordinationInfo?.displayName || coordinationInfo?.name;
      const resolvedName = resolveAgentDisplayName(parsedAgent ?? rawAgent, fallbackName);
      const displayName = ensureUniqueName(coordinationName || resolvedName, fallbackName, index, seenNames);

      const paneFromCoord = coordinationInfo
        ? extractPaneIndexFromCoordination(coordinationInfo)
        : undefined;
      const derivedPaneId = paneFromCoord ?? derivePaneId(parsedAgent ?? rawAgent, index);

      const agentNumber = coordinationInfo?.agentNumber ?? (
        typeof derivedPaneId === 'number'
          ? derivedPaneId + 1
          : deriveAgentNumber(parsedAgent ?? rawAgent, index)
      );

      const statusFromCoord = coordinationInfo?.status
        ? normalizeAgentStatus({ status: coordinationInfo.status } as Record<string, any>)
        : undefined;
      const normalizedStatus = statusFromCoord ?? normalizeAgentStatus(parsedAgent);
      const workspacePath = coordinationInfo?.metadata?.workspacePath
        || coordinationInfo?.workspacePath
        || parsedAgent?.workspacePath
        || parsedAgent?.paths?.workspace
        || undefined;

      agentsList.push({
        id: typeof derivedPaneId === 'number' ? derivedPaneId : index,
        index,
        paneId: derivedPaneId,
        agentNumber,
        name: displayName,
        status: normalizedStatus,
        uid: parsedAgent?.id || parsedAgent?.uid,
        raw: parsedAgent,
        coordination: coordinationInfo,
        workspacePath
      });
    }

    return agentsList;
  }, [
    rawFarmAgents,
    coordinationAgentMap,
    isQuickTask,
    totalAgentCount
  ]);

  const workflowAgents = useMemo(() => {
    const workflowCount = Math.max(rawFarmAgentCount, coordinationAgentCount);

    return normalizedAgents.slice(0, workflowCount).map(agent => {
      const metrics = computeAgentMetrics(agent.raw);
      return {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        uid: agent.uid,
        paneId: agent.paneId,
        agentNumber: agent.agentNumber,
        workspacePath: agent.workspacePath,
        performance: {
          cpu: metrics.cpu,
          memory: metrics.memory,
          tasksCompleted: metrics.tasksCompleted,
          successRate: metrics.successRate
        }
      };
    });
  }, [normalizedAgents, rawFarmAgentCount, coordinationAgentCount]);

  const terminalAgents = useMemo(() => {
    return normalizedAgents.map(agent => {
      const metrics = computeAgentMetrics(agent.raw);
      const successRate = metrics.successRate || 95;

      return {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        output: [] as string[],
        paneId: agent.paneId,
        agentNumber: agent.agentNumber,
        workspacePath: agent.workspacePath,
        metrics: {
          cpu: metrics.cpu,
          memory: metrics.memory,
          tasksCompleted: metrics.tasksCompleted,
          successRate,
          avgResponseTime: metrics.avgResponseTime
        }
      };
    });
  }, [normalizedAgents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading harvest view...</p>
        </div>
      </div>
    );
  }

  // Remove early return for terminal view - handle it in the main layout below
  // This ensures consistent header and navigation for all view modes

  // Don't show "Farm not found" if we're still loading or if we have a harvestId we're processing
  if (!farm && !loading && !harvestId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">Farm not found</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  // If we're still loading or processing harvest, show loading state
  if (!farm && (loading || harvestId)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading harvest view...</p>
        </div>
      </div>
    );
  }

  // Remove early return for enhanced UI - handle it in the main layout below
  // This ensures consistent header and navigation

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen relative bg-gray-50 dark:bg-gray-950">
      {/* Premium subtle gradient background */}
      {/* Premium Header with Glass Morphism - Apple Style */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="sticky top-16 z-40 backdrop-blur-2xl bg-gray-50/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50 shadow-lg"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Premium Back Button with Glass Effect */}
              <Tooltip content="Back to Dashboard" position="bottom">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/dashboard')}
                  className="p-2.5 backdrop-blur-xl bg-gray-50/80 hover:bg-gray-50/90 dark:bg-gray-800/80 dark:hover:bg-gray-800/90 rounded-2xl transition-all duration-300 border border-gray-200/50 dark:border-gray-700/50 shadow-lg hover:shadow-xl"
                  aria-label="Back to Dashboard"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </motion.button>
              </Tooltip>
              
              {/* Professional Farm Info with Glass */}
              <div className="flex items-center gap-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                  className="relative"
                >
                  <div className="p-3 backdrop-blur-xl bg-gray-50/80 dark:bg-gray-800/80 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                    <Command className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                  </div>
                  {/* Status dot */}
                  <div className={cn(
                    'absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 shadow-lg',
                    farm.status === 'active' || farm.status === 'running' ? 'bg-emerald-500' :
                    farm.status === 'harvesting' ? 'bg-blue-500' :
                    farm.status === 'completed' ? 'bg-gray-400' :
                    'bg-amber-500',
                    (farm.status === 'active' || farm.status === 'running') && 'animate-pulse'
                  )} />
                </motion.div>
                
                <div>
                  <motion.h1
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight"
                  >
                    {farm.name}
                  </motion.h1>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                    className="flex items-center gap-4 mt-2"
                  >
                    {/* Professional Metadata */}
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {farm.config?.orchestratorType === 'xenosync' ? 'XenoSync' : 'MaiFarmer'}
                      </span>
                    </div>
                    
                    {activeAgentCount > 0 && (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {activeAgentCount} {activeAgentCount === 1 ? 'Agent' : 'Agents'}
                        </span>
                      </div>
                    )}
                    {(isRunning || timeElapsed) && (
                      <>
                        <div className="flex items-center space-x-1.5 text-sm text-gray-600 dark:text-gray-400">
                          <Clock className={`w-4 h-4 ${!isRunning ? 'text-green-600' : ''}`} />
                          <span className="font-mono font-medium">
                            {timeElapsed}
                            {!isRunning && farm?.status === 'completed' && (
                              <span className="text-green-600 ml-1">(Final)</span>
                            )}
                            {isRunning && farm?.config?.timeout && farm.config.timeout > 0 && (
                              <span className="text-gray-500 dark:text-gray-500">
                                {' / '}
                                {(() => {
                                  // Quick Tasks have timeout in milliseconds, regular farms in seconds
                                  const isQuickTask = farm.metadata?.isQuickTask || farm.config?.quickTask;
                                  const timeoutValue = isQuickTask 
                                    ? Math.floor(farm.config.timeout / 1000) // Convert ms to seconds for Quick Tasks
                                    : farm.config.timeout; // Regular farms already in seconds
                                  
                                  if (timeoutValue < 60) {
                                    return `${timeoutValue}s`;
                                  } else if (timeoutValue < 3600) {
                                    return `${Math.floor(timeoutValue / 60)}m`;
                                  } else if (timeoutValue === 3600) {
                                    return '1hr';
                                  } else if (timeoutValue < 86400) {
                                    return `${Math.floor(timeoutValue / 3600)}hr`;
                                  } else {
                                    return `${Math.floor(timeoutValue / 86400)}d`;
                                  }
                                })()}
                              </span>
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </motion.div>
                </div>
              </div>
              
              {/* Farm Selector with better design */}
              {activeFarms.length > 1 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 }}
                  className="relative"
                >
                  <select
                    value={selectedFarmId || farmId}
                    onChange={(e) => {
                      setSelectedFarmId(e.target.value);
                      navigate(`/harvest/${e.target.value}`);
                    }}
                    className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-apple-lg border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-apple-blue-DEFAULT focus:border-apple-blue-DEFAULT transition-all shadow-apple-sm hover:shadow-apple-md appearance-none pr-10"
                  >
                    {activeFarms.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.status})
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </motion.div>
              )}
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Professional View Mode Toggle with Glass Effect */}
              <div className="flex items-center backdrop-blur-xl bg-gray-50/70 dark:bg-gray-800/70 rounded-2xl p-1 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                <Tooltip content="Terminal output" position="bottom">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setViewMode('terminal')}
                    className={cn(
                      'px-3.5 py-2 rounded-xl transition-all duration-300 flex items-center gap-2',
                      viewMode === 'terminal'
                        ? 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
                    )}
                  >
                    <Monitor className="w-4 h-4" />
                    <span className="text-sm font-medium">Terminal</span>
                  </motion.button>
                </Tooltip>
                
                <Tooltip content="Workflow visualization" position="bottom">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setViewMode('workflow')}
                    className={cn(
                      'px-3.5 py-2 rounded-xl transition-all duration-300 flex items-center gap-2',
                      viewMode === 'workflow'
                        ? 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
                    )}
                  >
                    <Layers className="w-4 h-4" />
                    <span className="text-sm font-medium">Workflow</span>
                  </motion.button>
                </Tooltip>
                
                <Tooltip content="Harvest results" position="bottom">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setViewMode('dashboard')}
                    className={cn(
                      'px-3.5 py-2 rounded-xl transition-all duration-300 flex items-center gap-2',
                      viewMode === 'dashboard'
                        ? 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
                    )}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span className="text-sm font-medium">Dashboard</span>
                  </motion.button>
                </Tooltip>
              </div>
              
              
              {/* Status badge with Apple glass styling */}
              <motion.div
                className={cn(
                  'px-4 py-2 rounded-2xl text-sm font-semibold flex items-center justify-center backdrop-blur-xl border shadow-lg',
                  farm.status === 'active' || farm.status === 'running' 
                    ? 'bg-emerald-500/20 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-400 border-emerald-500/30' :
                  farm.status === 'preparing' || farm.status === 'planting' || farm.status === 'launching'
                    ? 'bg-amber-500/20 text-amber-700 dark:bg-amber-500/30 dark:text-amber-400 border-amber-500/30' :
                  farm.status === 'harvesting' 
                    ? 'bg-blue-500/20 text-blue-700 dark:bg-blue-500/30 dark:text-blue-400 border-blue-500/30' :
                  farm.status === 'completed' 
                    ? 'bg-gray-500/20 text-gray-700 dark:bg-gray-500/30 dark:text-gray-400 border-gray-500/30' :
                    'bg-red-500/20 text-red-700 dark:bg-red-500/30 dark:text-red-400 border-red-500/30'
                )}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7 }}
              >
                <div className="flex items-center justify-center space-x-2">
                  <motion.div 
                    className={cn(
                      'w-2 h-2 rounded-full',
                      farm.status === 'active' || farm.status === 'running' ? 'bg-green-500' :
                      farm.status === 'preparing' || farm.status === 'planting' || farm.status === 'launching' ? 'bg-amber-500' :
                      farm.status === 'harvesting' ? 'bg-blue-500' :
                      farm.status === 'completed' ? 'bg-gray-500' :
                      'bg-red-500'
                    )}
                    animate={
                      (farm.status === 'active' || farm.status === 'running')
                        ? { opacity: [1, 0.5, 1] }
                        : {}
                    }
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <span className="capitalize font-medium">{farm.status}</span>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
        
        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-50/30 dark:to-gray-900/30 pointer-events-none" />
      </motion.div>

      {/* Main Content */}
      {viewMode === 'workflow' ? (
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="backdrop-blur-xl bg-gray-50/70 dark:bg-gray-800/70 rounded-3xl shadow-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50"
          >
            <WorkflowCanvas
              farmId={(selectedFarmId || farmId)!}
              farmName={farm.name}
              agents={workflowAgents}
            />
          </motion.div>
        </div>
      ) : viewMode === 'terminal' ? (
        <div className="relative w-full min-h-screen">
          <CentralTerminalView 
            farmId={selectedFarmId || farmId || 'loading'}
            sessionName={
              // All farms use 'farm-' prefix, including Quick Tasks
              farm?.sessionName || farm?.tmuxSession || `farm-${(selectedFarmId || farmId || '').substring(0, 8)}` || 'loading'
            }
            farmName={farm?.name || 'Loading Farm...'}
            agents={terminalAgents}
            harvest={harvest}
            onClose={() => navigate('/dashboard')}
          />
        </div>
      ) : viewMode === 'dashboard' ? (
        <div className="relative w-full h-full min-h-screen overflow-hidden">
          {/* Subtle Grid Background */}
          <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]" />
          
          {/* Gradient Orbs for depth */}
          <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-full blur-3xl" />

          <div className="relative z-10">
            {hasHarvest ? (
              <HarvestDashboard 
                farmId={(selectedFarmId || farmId)!}
                farmName={farm.name}
                onComplete={() => navigate('/dashboard')}
              />
            ) : (
              <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-12">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                  className="backdrop-blur-xl bg-gray-50/70 dark:bg-gray-800/70 rounded-3xl shadow-2xl p-12 text-center border border-gray-200/50 dark:border-gray-700/50"
                >
              <div className="text-gray-500 dark:text-gray-400">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                  className="inline-flex p-6 backdrop-blur-xl bg-gray-50/50 dark:bg-gray-800/50 rounded-3xl mb-6 border border-gray-200/30 dark:border-gray-700/30"
                >
                  <Package className="w-16 h-16 text-gray-400 dark:text-gray-500" />
                </motion.div>
                <motion.h3
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-bold text-gray-900 dark:text-white mb-3"
                >
                  No Harvest Available
                </motion.h3>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto leading-relaxed"
                >
                  The task is still running. Switch to Terminal view to monitor real-time progress and agent activity.
                </motion.p>
                <Tooltip content="Switch to terminal view to monitor live agent activity" position="bottom">
                  <motion.button
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode('terminal')}
                    className="px-6 py-3 bg-apple-blue-DEFAULT text-white rounded-apple-lg hover:bg-apple-blue-dark transition-all duration-200 shadow-apple-sm font-medium"
                    aria-label="Switch to terminal view"
                  >
                    View Terminal
                  </motion.button>
                </Tooltip>
                </div>
              </motion.div>
            </div>
            )}
          </div>
        </div>
      ) : null}
      {/* Terminal view is now handled earlier in the component */}

      {/* Concept Explainer Modal */}
      <ConceptExplainerModal
        isOpen={showConceptModal}
        onClose={() => handleModalClose()}
        onContinue={() => handleModalContinue()}
        farmName={farm?.name}
      />
    </motion.div>
  );

  // Modal handler functions
  function handleModalClose() {
    const targetFarmId = selectedFarmId || farmId;
    if (targetFarmId) {
      sessionStorage.setItem(`concept-modal-seen-${targetFarmId}`, 'true');
    }
    setShowConceptModal(false);
  }

  function handleModalContinue() {
    handleModalClose();
  }
};
