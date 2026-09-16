import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { CentralTerminalView, CentralTerminalViewWithErrorBoundary } from './CentralTerminalView';
import { HarvestDashboard } from './HarvestDashboard';
import { WorkflowCanvas } from './WorkflowCanvas';
import { PremiumTerminalView } from './PremiumTerminalView';
import { PremiumWorkflowView } from './PremiumWorkflowView';
import { PremiumHarvestView } from './PremiumHarvestView';
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
  Layers,
  Terminal,
  GitBranch,
  Activity,
  Settings,
  Sparkles,
  ChevronDown,
  Menu,
  MoreVertical
} from 'lucide-react';
import { useResponsive } from '@/hooks/useResponsive';
import { useFarmStore } from '@/store/farmStore';
import { useWebSocketStore } from '@/store/websocketStore';
import { farmService } from '@/services/farmService';
import { harvestService } from '@/services/harvestService';
import { mapAgentNamesInHarvest } from '@/utils/agentNameMapper';
import { Tooltip } from '../common/Tooltip';
import { GlassPanel } from '../common/GlassPanel';
import { useHarvestElapsed } from '@/hooks/useTimeElapsed';
import { ConceptExplainerModal } from './ConceptExplainerModal';
import { FarmerRatingModal } from '../Farmers/FarmerRatingModal';
import { useRatingPrompt } from '@/hooks/useRatingPrompt';
import { premiumClasses, premiumDesign, cn } from '@/styles/premium-design-system';

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
  const [showConceptModal, setShowConceptModal] = useState(false);
  const [showYaml, setShowYaml] = useState(false); // State for YAML expansion
  const [isQuickTask, setIsQuickTask] = useState(false); // State to detect Quick Tasks
  const [usePremiumUI, setUsePremiumUI] = useState(true); // Enable premium Apple-style UI by default
  const farms = useFarmStore(state => state.farms);
  const updateFarm = useFarmStore(state => state.updateFarm);
  const activeFarms = farms.filter(f => ['active', 'running', 'harvesting'].includes(f.status));
  const { subscribe, connected } = useWebSocketStore();
  const prevFarmRef = useRef<any>(null);
  // FIX: Track error navigation timeout to prevent memory leak on unmount
  const errorNavigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Responsive design hooks
  const { isMobile, isTablet, isDesktop } = useResponsive();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showMobileFarmSelector, setShowMobileFarmSelector] = useState(false);

  // Rating prompt for farmer templates
  const { ratingPrompt, showRatingPrompt, closeRatingPrompt } = useRatingPrompt();
  
  // Add time elapsed tracking - ensure we pass the right data structure
  const { timeElapsed, isRunning } = useHarvestElapsed(
    farm ? {
      started_at: farm.createdAt || farm.created_at,
      status: farm.status,
      createdAt: farm.createdAt || farm.created_at
    } : harvest
  );

  // Show rating prompt when farm completes (if it used a farmer template)
  useEffect(() => {
    if (!farm) return;

    // Check if farm just completed and has a farmer template
    const isCompleted = farm.status === 'completed';
    const farmerTemplateId = farm.farmerTemplateId || farm.metadata?.farmerTemplateId;
    const farmerTemplateName = farm.farmerTemplateName || farm.metadata?.farmerTemplateName || 'Farmer';
    const farmerTemplateIcon = farm.farmerTemplateIcon || farm.metadata?.farmerTemplateIcon;

    if (isCompleted && farmerTemplateId && farm.id) {
      // Small delay to let the completion animation play first
      const timer = setTimeout(() => {
        showRatingPrompt(farm.id, farmerTemplateId, farmerTemplateName, farmerTemplateIcon);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [farm?.status, farm?.id, farm?.farmerTemplateId, showRatingPrompt]);

  // FIX: Cleanup error navigation timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (errorNavigateTimeoutRef.current) {
        clearTimeout(errorNavigateTimeoutRef.current);
        errorNavigateTimeoutRef.current = null;
      }
    };
  }, []);

  // Fetch data on mount and when IDs change
  useEffect(() => {
    if (harvestId) {
      // If we have a harvestId, fetch the harvest first to get the farmId
      fetchHarvestById(harvestId);
    } else if (selectedFarmId || farmId) {
      // Fetch from server if not in store
      fetchFarm();
    }
  }, [selectedFarmId, farmId, harvestId]);

  // Separate effect to sync farm from store (with proper dependency tracking)
  useEffect(() => {
    const targetFarmId = selectedFarmId || farmId;
    if (!targetFarmId) return;

    const localFarm = farms.find(f => f.id === targetFarmId);
    if (!localFarm) return;

    // FIX: Use ID comparison instead of reference to prevent infinite loops
    // Reference comparison fails when store creates new array on each update
    const prevFarmId = prevFarmRef.current?.id;
    const prevFarmUpdatedAt = prevFarmRef.current?.updatedAt;
    const farmChanged = prevFarmId !== localFarm.id ||
                        prevFarmUpdatedAt !== localFarm.updatedAt;

    if (farmChanged) {
      setFarm(localFarm);
      prevFarmRef.current = localFarm;

      // Detect Quick Task farms
      const isQuickTaskFarm = localFarm.metadata?.isQuickTask ||
                              localFarm.name?.includes('Quick Task');
      setIsQuickTask(isQuickTaskFarm);

      checkHarvestAvailability();

      // Check if this is a fresh navigation from farm creation (within last 30 seconds)
      // FIX: Validate date before calculation to prevent NaN
      const createdDate = new Date(localFarm.createdAt);
      const isValidDate = !isNaN(createdDate.getTime());
      const farmAge = isValidDate ? Date.now() - createdDate.getTime() : Infinity;
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
    }
  }, [farms, selectedFarmId, farmId]); // Add all dependencies for proper tracking

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
        toast.error('Harvest not found');
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error fetching harvest:', error);
      toast.error('Failed to load harvest data');
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
      // UX FIX: Show user-facing error instead of just logging
      if (error instanceof TypeError && error.message === 'Load failed') {
        console.error('Error fetching terminal sessions - Network error: The API server may be unavailable');
        // Only show toast if user might be expecting terminal data
        if (navigator.onLine === false) {
          toast.error('Unable to load terminal sessions - check your internet connection');
        }
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

      // UX FIX: Show error toast so user knows why they're being redirected
      toast.error('Failed to load farm data. Redirecting to home...', {
        duration: 2000,
        icon: '⚠️'
      });

      // FIX: Don't navigate away immediately, show error state
      // Store timeout in ref so it can be cleaned up on unmount
      errorNavigateTimeoutRef.current = setTimeout(() => {
        navigate('/home');
        errorNavigateTimeoutRef.current = null;
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
          // FIX: Only spread data.harvest if it exists to prevent undefined spread
          const harvestUpdate = data.harvest || {};
          return {
            ...prev,
            ...harvestUpdate,
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
      {/* Premium Header with Glass Morphism - Apple Style - Responsive */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="sticky top-16 z-40 backdrop-blur-2xl bg-gray-50/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50 shadow-lg"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-10 py-3 sm:py-4">
          {/* Mobile Layout */}
          {(isMobile || isTablet) ? (
            <div className="space-y-3">
              {/* Top row: Back button, Farm name, Status, Menu */}
              <div className="flex items-center justify-between gap-2">
                {/* Back Button */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/dashboard')}
                  className="p-2 backdrop-blur-xl bg-gray-50/80 dark:bg-gray-800/80 rounded-xl transition-all duration-300 border border-gray-200/50 dark:border-gray-700/50 shadow-md touch-manipulation"
                  aria-label="Back to Dashboard"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </motion.button>

                {/* Farm Name - Centered, truncated on mobile */}
                <div className="flex-1 min-w-0 mx-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-shrink-0">
                      <div className="p-1.5 backdrop-blur-xl bg-gray-50/80 dark:bg-gray-800/80 rounded-lg border border-gray-200/50 dark:border-gray-700/50">
                        <Command className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                      </div>
                      <div className={cn(
                        'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900',
                        farm.status === 'active' || farm.status === 'running' ? 'bg-emerald-500' :
                        farm.status === 'harvesting' ? 'bg-blue-500' :
                        farm.status === 'completed' ? 'bg-gray-400' :
                        'bg-amber-500',
                        (farm.status === 'active' || farm.status === 'running') && 'animate-pulse'
                      )} />
                    </div>
                    <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate">
                      {farm.name}
                    </h1>
                  </div>
                </div>

                {/* Status Badge - Compact */}
                <motion.div
                  className={cn(
                    'px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 backdrop-blur-xl border',
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
                >
                  <motion.div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
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
                  <span className="capitalize">{farm.status}</span>
                </motion.div>

                {/* Mobile Menu Button */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="p-2 backdrop-blur-xl bg-gray-50/80 dark:bg-gray-800/80 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-md touch-manipulation"
                >
                  <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </motion.button>
              </div>

              {/* Mobile Menu Dropdown */}
              <AnimatePresence>
                {showMobileMenu && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 backdrop-blur-xl bg-white/90 dark:bg-gray-800/90 rounded-xl border border-gray-200/50 dark:border-gray-700/50 space-y-3">
                      {/* Farm Info */}
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5" />
                          <span>{farm.config?.orchestratorType === 'xenosync' ? 'XenoSync' : 'MaiFarmer'}</span>
                        </div>
                        {activeAgentCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            <span>{activeAgentCount} Agent{activeAgentCount !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                        {(isRunning || timeElapsed) && (
                          <div className="flex items-center gap-1.5">
                            <Clock className={`w-3.5 h-3.5 ${!isRunning ? 'text-green-600' : ''}`} />
                            <span className="font-mono">{timeElapsed}</span>
                          </div>
                        )}
                      </div>

                      {/* Premium UI Toggle */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Premium UI</span>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setUsePremiumUI(!usePremiumUI)}
                          className={cn(
                            'p-2 rounded-lg transition-all touch-manipulation',
                            usePremiumUI
                              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                          )}
                        >
                          <Sparkles className="w-4 h-4" />
                        </motion.button>
                      </div>

                      {/* Farm Selector (if multiple farms) */}
                      {activeFarms.length > 1 && (
                        <div className="pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">Switch Farm</label>
                          <select
                            value={selectedFarmId || farmId}
                            onChange={(e) => {
                              setSelectedFarmId(e.target.value);
                              navigate(`/harvest/${e.target.value}`);
                              setShowMobileMenu(false);
                            }}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg border border-gray-200 dark:border-gray-600 text-sm touch-manipulation"
                          >
                            {activeFarms.map(f => (
                              <option key={f.id} value={f.id}>
                                {f.name} ({f.status})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bottom row: View Mode Toggle - Icon-only on mobile */}
              <div className="flex items-center justify-center gap-1.5">
                <div className="flex items-center backdrop-blur-2xl bg-white/80 dark:bg-gray-800/80 rounded-xl p-1 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode('terminal')}
                    className={cn(
                      'p-2.5 sm:px-3 sm:py-2 rounded-lg transition-all duration-300 flex items-center gap-2 touch-manipulation',
                      viewMode === 'terminal'
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-700/80'
                    )}
                    aria-label="Terminal View"
                  >
                    <Terminal className="w-4 h-4" />
                    {isTablet && <span className="text-xs font-medium">Terminal</span>}
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode('workflow')}
                    className={cn(
                      'p-2.5 sm:px-3 sm:py-2 rounded-lg transition-all duration-300 flex items-center gap-2 touch-manipulation',
                      viewMode === 'workflow'
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-700/80'
                    )}
                    aria-label="Workflow View"
                  >
                    <GitBranch className="w-4 h-4" />
                    {isTablet && <span className="text-xs font-medium">Workflow</span>}
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode('dashboard')}
                    className={cn(
                      'p-2.5 sm:px-3 sm:py-2 rounded-lg transition-all duration-300 flex items-center gap-2 touch-manipulation',
                      viewMode === 'dashboard'
                        ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-700/80'
                    )}
                    aria-label="Harvest Dashboard"
                  >
                    <Package className="w-4 h-4" />
                    {isTablet && <span className="text-xs font-medium">Harvest</span>}
                  </motion.button>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop Layout - Original */
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
                {/* Premium Apple-Style View Mode Toggle */}
                <div className="flex items-center backdrop-blur-2xl bg-white/80 dark:bg-gray-800/80 rounded-2xl p-1.5 border border-gray-200/50 dark:border-gray-700/50 shadow-xl">
                  <Tooltip content="Terminal Console" position="bottom">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setViewMode('terminal')}
                      className={cn(
                        'px-4 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2.5',
                        viewMode === 'terminal'
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-gray-700/80'
                      )}
                    >
                      <Terminal className="w-4 h-4" />
                      <span className="text-sm font-semibold">Terminal</span>
                      {viewMode === 'terminal' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-1.5 h-1.5 rounded-full bg-white/80"
                        />
                      )}
                    </motion.button>
                  </Tooltip>

                  <Tooltip content="Workflow View" position="bottom">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setViewMode('workflow')}
                      className={cn(
                        'px-4 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2.5',
                        viewMode === 'workflow'
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-gray-700/80'
                      )}
                    >
                      <GitBranch className="w-4 h-4" />
                      <span className="text-sm font-semibold">Workflow</span>
                      {viewMode === 'workflow' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-1.5 h-1.5 rounded-full bg-white/80"
                        />
                      )}
                    </motion.button>
                  </Tooltip>

                  <Tooltip content="Harvest Dashboard" position="bottom">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setViewMode('dashboard')}
                      className={cn(
                        'px-4 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2.5',
                        viewMode === 'dashboard'
                          ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/25'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-gray-700/80'
                      )}
                    >
                      <Package className="w-4 h-4" />
                      <span className="text-sm font-semibold">Harvest</span>
                      {viewMode === 'dashboard' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-1.5 h-1.5 rounded-full bg-white/80"
                        />
                      )}
                    </motion.button>
                  </Tooltip>
                </div>

                {/* Premium UI Toggle */}
                <Tooltip content={usePremiumUI ? "Using Premium UI" : "Using Classic UI"} position="bottom">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setUsePremiumUI(!usePremiumUI)}
                    className={cn(
                      'p-2.5 rounded-xl transition-all duration-300',
                      usePremiumUI
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    )}
                  >
                    <Sparkles className="w-4 h-4" />
                  </motion.button>
                </Tooltip>


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
          )}
        </div>

        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-50/30 dark:to-gray-900/30 pointer-events-none" />
      </motion.div>

      {/* Main Content - Conditionally render Premium or Classic UI */}
      {viewMode === 'workflow' ? (
        usePremiumUI ? (
          <div className="relative w-full min-h-screen">
            <PremiumWorkflowView
              farmId={(selectedFarmId || farmId)!}
              farmName={farm.name}
              agents={farm.agents?.map((agent: any, index: number) => ({
                id: index,
                name: agent.name || `Agent-${String(index + 1).padStart(2, '0')}`,
                status: agent.status || 'idle',
                uid: agent.id,
                performance: {
                  cpu: agent.performance?.cpuUsage || agent.resources?.cpu?.usage || 0,
                  memory: (() => {
                    const memPercent = agent.performance?.memoryUsage || agent.resources?.memory?.percentage;
                    if (memPercent !== undefined) return Math.min(100, Math.max(0, memPercent));
                    const rawValue = agent.resources?.memory?.usage || 0;
                    return rawValue > 100 ? Math.min(100, (rawValue / 4096) * 100) : rawValue;
                  })(),
                  tasksCompleted: agent.metrics?.tasksCompleted || 0,
                  successRate: agent.metrics?.successRate || 0
                },
                currentTask: agent.currentTask
              })) || []}
              onAgentClick={(agentId) => console.log('Agent clicked:', agentId)}
            />
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-10 py-4 sm:py-8 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              className="backdrop-blur-xl bg-gray-50/70 dark:bg-gray-800/70 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50"
            >
              <WorkflowCanvas
                farmId={(selectedFarmId || farmId)!}
                farmName={farm.name}
                agents={farm.agents?.map((agent: any, index: number) => ({
                  id: index,
                  name: agent.name || `Agent-${String(index + 1).padStart(2, '0')}`,
                  status: agent.status || 'idle',
                  uid: agent.id,
                  performance: {
                    cpu: agent.performance?.cpuUsage || agent.resources?.cpu?.usage || 0,
                    memory: (() => {
                      const memPercent = agent.performance?.memoryUsage || agent.resources?.memory?.percentage;
                      if (memPercent !== undefined) return Math.min(100, Math.max(0, memPercent));
                      const rawValue = agent.resources?.memory?.usage || 0;
                      return rawValue > 100 ? Math.min(100, (rawValue / 4096) * 100) : rawValue;
                    })(),
                    tasksCompleted: agent.metrics?.tasksCompleted || 0,
                    successRate: agent.metrics?.successRate || 0
                  }
                })) || []}
              />
            </motion.div>
          </div>
        )
      ) : viewMode === 'terminal' ? (
        usePremiumUI ? (
          <div className="relative w-full min-h-screen">
            <PremiumTerminalView
              farmId={selectedFarmId || farmId || 'loading'}
              sessionName={farm?.sessionName || farm?.tmuxSession || `farm-${(selectedFarmId || farmId || '').substring(0, 8)}` || 'loading'}
              farmName={farm?.name || 'Loading Farm...'}
              agents={farm?.agents?.map((agent: any, index: number) => ({
                id: index,
                name: agent.name || `Agent-${String(index + 1).padStart(2, '0')}`,
                status: agent.status || 'active',
                output: [],
                metrics: {
                  cpu: agent.performance?.cpuUsage || agent.resources?.cpu?.usage || 0,
                  memory: agent.performance?.memoryUsage || agent.resources?.memory?.usage || 0,
                  tasksCompleted: agent.performance?.tasksCompleted || 0,
                  successRate: agent.performance?.successRate || 95,
                  avgResponseTime: agent.performance?.avgResponseTime || 1250
                }
              })) || []}
              onClose={() => navigate('/dashboard')}
            />
          </div>
        ) : (
          <div className="relative w-full min-h-screen">
            <CentralTerminalViewWithErrorBoundary
              farmId={selectedFarmId || farmId || 'loading'}
              sessionName={farm?.sessionName || farm?.tmuxSession || `farm-${(selectedFarmId || farmId || '').substring(0, 8)}` || 'loading'}
              farmName={farm?.name || 'Loading Farm...'}
              agents={farm?.agents?.map((agent: any, index: number) => ({
                id: index,
                name: agent.name || `Agent-${String(index + 1).padStart(2, '0')}`,
                status: agent.status || 'active',
                output: [],
                metrics: {
                  cpu: agent.performance?.cpuUsage || agent.resources?.cpu?.usage || Math.round(Math.random() * 100),
                  memory: agent.performance?.memoryUsage || agent.resources?.memory?.usage || Math.round(Math.random() * 100),
                  tasksCompleted: agent.performance?.tasksCompleted || 0,
                  successRate: agent.performance?.successRate || 95,
                  avgResponseTime: agent.performance?.avgResponseTime || 1250
                }
              })) || []}
              harvest={harvest}
              onClose={() => navigate('/dashboard')}
            />
          </div>
        )
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
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-12">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                  className="backdrop-blur-xl bg-gray-50/70 dark:bg-gray-800/70 rounded-2xl sm:rounded-3xl shadow-2xl p-6 sm:p-12 text-center border border-gray-200/50 dark:border-gray-700/50"
                >
              <div className="text-gray-500 dark:text-gray-400">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                  className="inline-flex p-4 sm:p-6 backdrop-blur-xl bg-gray-50/50 dark:bg-gray-800/50 rounded-2xl sm:rounded-3xl mb-4 sm:mb-6 border border-gray-200/30 dark:border-gray-700/30"
                >
                  <Package className="w-10 h-10 sm:w-16 sm:h-16 text-gray-400 dark:text-gray-500" />
                </motion.div>
                <motion.h3
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3"
                >
                  No Harvest Available
                </motion.h3>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 sm:mb-6 max-w-md mx-auto leading-relaxed px-2"
                >
                  The task is still running. Switch to Terminal view to monitor real-time progress and agent activity.
                </motion.p>
                <motion.button
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setViewMode('terminal')}
                  className="w-full sm:w-auto px-6 py-3 bg-apple-blue-DEFAULT text-white rounded-xl hover:bg-apple-blue-dark transition-all duration-200 shadow-apple-sm font-medium touch-manipulation"
                  aria-label="Switch to terminal view"
                >
                  View Terminal
                </motion.button>
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

      {/* Farmer Rating Modal - shown after farm completion */}
      {ratingPrompt.isOpen && ratingPrompt.farmerId && ratingPrompt.farmerName && (
        <FarmerRatingModal
          isOpen={ratingPrompt.isOpen}
          onClose={closeRatingPrompt}
          farmerId={ratingPrompt.farmerId}
          farmerName={ratingPrompt.farmerName}
          farmerIcon={ratingPrompt.farmerIcon || undefined}
          farmId={ratingPrompt.farmId || undefined}
        />
      )}
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