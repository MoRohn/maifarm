import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TerminalContainer } from '../Terminal/TerminalContainer';
import { HarvestTerminal } from './HarvestTerminal';
import { HarvestDashboard } from './HarvestDashboard';
import { Package, ArrowLeft, Loader2, Terminal, LayoutDashboard, Clock } from 'lucide-react';
import { useFarmStore } from '../../store/farmStore';
import { useWebSocketStore } from '../../store/websocketStore';
import { farmService } from '../../services/farmService';
import { harvestService } from '../../services/harvestService';
import { mapAgentNamesInHarvest } from '../../utils/agentNameMapper';
import { Tooltip } from '../common/Tooltip';
import { useHarvestElapsed } from '../../hooks/useTimeElapsed';
import { ConceptExplainerModal } from './ConceptExplainerModal';

export const HarvestPage: React.FC = () => {
  const { farmId, harvestId } = useParams<{ farmId?: string; harvestId?: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [farm, setFarm] = useState<any>(null);
  const [harvest, setHarvest] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'terminal' | 'dashboard' | 'grid'>('terminal'); // Default to terminal view
  const [hasHarvest, setHasHarvest] = useState(false);
  const [goWildSession, setGoWildSession] = useState<any>(null);
  const [terminalSessions, setTerminalSessions] = useState<any[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | undefined>(farmId);
  const [activeAgentCount, setActiveAgentCount] = useState<number>(0);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [showConceptModal, setShowConceptModal] = useState(false);
  const farms = useFarmStore(state => state.farms);
  const activeFarms = farms.filter(f => ['running', 'active', 'harvesting'].includes(f.status));
  const { subscribe, connected } = useWebSocketStore();
  
  // Add time elapsed tracking
  const { timeElapsed, isRunning } = useHarvestElapsed(farm || harvest);

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
          checkHarvestAvailability();
          
          // Check if this is a fresh navigation from farm creation (within last 30 seconds)
          const farmAge = Date.now() - new Date(localFarm.createdAt).getTime();
          const isRecentlyCreated = farmAge < 30000; // 30 seconds
          const hasSeenModal = sessionStorage.getItem(`concept-modal-seen-${targetFarmId}`);
          
          if (isRecentlyCreated && !hasSeenModal) {
            setShowConceptModal(true);
          }
          
          // Check if this is a Go Wild farm
          if (localFarm.type === 'autonomous' && localFarm.config?.goWildMode?.enabled) {
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
  }, [selectedFarmId, farmId, harvestId, farms]);

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
              // Apply agent name mapping before setting harvest
              const mappedHarvest = mapAgentNamesInHarvest(harvestInfo, localFarm);
              setHarvest(mappedHarvest);
              setHasHarvest(true);
              fetchTerminalSessions(harvestInfo.farmId);
            } else {
              // Fetch farm from server
              const farmData = await fetchFarmById(harvestInfo.farmId);
              if (farmData) {
                // Apply agent name mapping after farm is fetched
                const mappedHarvest = mapAgentNamesInHarvest(harvestInfo, farmData);
                setHarvest(mappedHarvest);
                setHasHarvest(true);
              } else {
                // Fallback: set harvest without mapping
                setHarvest(harvestInfo);
                setHasHarvest(true);
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
        navigate('/home');
      }
    } catch (error) {
      console.error('Error fetching harvest:', error);
      navigate('/home');
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
      const response = await fetch(`/api/harvest/terminal/sessions?farmId=${encodeURIComponent(targetFarmId)}`);
      if (response.ok) {
        const data = await response.json();
        const sessions = data.data || [];
        setTerminalSessions(sessions);
        
        // Update active agent count based on terminal sessions
        if (sessions.length > 0) {
          const totalAgents = sessions.reduce((sum: number, session: any) => sum + (session.paneCount || 0), 0);
          setActiveAgentCount(totalAgents);
        }
      }
    } catch (error) {
      console.error('Error fetching terminal sessions:', error);
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
    if (!targetFarmId) return;
    
    try {
      const farmData = await farmService.getFarm(targetFarmId);
      setFarm(farmData);
      await checkHarvestAvailability();
      
      // Check if this is a fresh navigation from farm creation (within last 30 seconds)
      const farmAge = Date.now() - new Date(farmData.createdAt).getTime();
      const isRecentlyCreated = farmAge < 30000; // 30 seconds
      const hasSeenModal = sessionStorage.getItem(`concept-modal-seen-${targetFarmId}`);
      
      if (isRecentlyCreated && !hasSeenModal) {
        setShowConceptModal(true);
      }
      
      // Check if this is a Go Wild farm
      if (farmData.type === 'autonomous' && farmData.config?.goWildMode?.enabled) {
        fetchGoWildSession();
      }
      // Fetch terminal sessions for this farm
      fetchTerminalSessions(targetFarmId);
    } catch (error) {
      console.error('Error fetching farm:', error);
      // Navigate back to dashboard if farm not found
      navigate('/home');
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

    const handleGoWildUpdate = (data: any) => {
      if (data.farmId === farmId) {
        console.log('Go Wild update:', data);
        if (data.type === 'status-changed' && data.data?.status === 'completed') {
          // Fetch the latest harvest data
          checkHarvestAvailability();
        }
      }
    };
    
    const handleFarmStatus = (data: any) => {
      const eventFarmId = data.farmId || data.payload?.farmId;
      if (eventFarmId === farmId || eventFarmId?.startsWith(farmId?.substring(0, 8))) {
        console.log('Farm status update:', data);
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
    
    // Subscribe to additional events for better synchronization
    const unsubscribeFarmStatus = subscribe('farm:status', handleFarmStatus);
    const unsubscribeFarmLaunched = subscribe('farm:launched', handleFarmStatus);
    const unsubscribeAgentsLaunching = subscribe('farm:agents:launching', handleFarmStatus);
    const unsubscribeMultiClaude = subscribe('multi-claude:status', handleFarmStatus);
    const unsubscribeAgentUpdate = subscribe('agent:updated', handleAgentUpdate);
    const unsubscribeTaskProgress = subscribe('task:progress', handleAgentUpdate);

    return () => {
      unsubscribeHarvest();
      unsubscribeGoWild();
      unsubscribeFarmStatus();
      unsubscribeFarmLaunched();
      unsubscribeAgentsLaunching();
      unsubscribeMultiClaude();
      unsubscribeAgentUpdate();
      unsubscribeTaskProgress();
    };
  }, [farmId, subscribe, connected]);

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

  if (!farm) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">Farm not found</p>
          <button
            onClick={() => navigate('/home')}
            className="px-4 py-2 bg-primary-600 text-white rounded-apple hover:bg-primary-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header - Apple-style with improved hierarchy */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 relative z-[5]"
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              {/* Back button with better styling */}
              <Tooltip content="Return to home dashboard" position="bottom">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/home')}
                  className="p-3 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-apple-lg transition-all duration-200 shadow-apple-sm"
                  aria-label="Return to home dashboard"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </motion.button>
              </Tooltip>
              
              {/* Farm icon and info */}
              <div className="flex items-center space-x-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                  className="relative"
                >
                  <div className="p-3 bg-gradient-to-br from-apple-green-light to-apple-green-DEFAULT rounded-apple-lg shadow-apple-sm">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  {/* Status indicator */}
                  <motion.div
                    className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 ${
                      farm.status === 'running' || farm.status === 'active' ? 'bg-apple-green-light' :
                      farm.status === 'harvesting' ? 'bg-apple-blue-light' :
                      farm.status === 'completed' ? 'bg-gray-500' :
                      'bg-apple-yellow-DEFAULT'
                    }`}
                    animate={
                      farm.status === 'running' || farm.status === 'active' 
                        ? { scale: [1, 1.2, 1] }
                        : {}
                    }
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                </motion.div>
                
                <div>
                  <motion.h1
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent"
                  >
                    {farm.name}
                  </motion.h1>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                    className="flex items-center space-x-2 mt-2"
                  >
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Live Harvest
                    </span>
                    <div className="w-1 h-1 bg-gray-400 rounded-full" />
                    {activeAgentCount > 0 && (
                      <>
                        <span className="text-sm text-apple-blue-DEFAULT dark:text-apple-blue-light font-medium">
                          {activeAgentCount} agents
                        </span>
                        <div className="w-1 h-1 bg-gray-400 rounded-full" />
                      </>
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
                                {farm.config.timeout < 60 
                                  ? `${farm.config.timeout}s`
                                  : farm.config.timeout < 3600 
                                  ? `${Math.floor(farm.config.timeout / 60)}m`
                                  : farm.config.timeout === 3600
                                  ? '1hr'
                                  : farm.config.timeout < 86400
                                  ? `${Math.floor(farm.config.timeout / 3600)}hr`
                                  : `${Math.floor(farm.config.timeout / 86400)}d`
                                }
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="w-1 h-1 bg-gray-400 rounded-full" />
                      </>
                    )}
                    {terminalSessions.length > 0 && (
                      <>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {terminalSessions.length} session{terminalSessions.length > 1 ? 's' : ''}
                        </span>
                        <div className="w-1 h-1 bg-gray-400 rounded-full" />
                      </>
                    )}
                    {activeTasks.length > 0 && (
                      <span className="text-sm text-apple-purple-DEFAULT dark:text-apple-purple-light font-medium">
                        {activeTasks.length} active task{activeTasks.length > 1 ? 's' : ''}
                      </span>
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
              {/* View Mode Toggle with Apple-style design */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-apple-lg p-1 shadow-inner"
              >
                <Tooltip content="View harvest analytics and summary" position="bottom">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode('dashboard')}
                    className={`px-4 py-2.5 rounded-apple transition-all duration-200 flex items-center space-x-2 ${
                      viewMode === 'dashboard'
                        ? 'bg-white dark:bg-gray-700 text-apple-blue-DEFAULT dark:text-apple-blue-light shadow-apple-sm' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                    aria-label="Harvest View"
                  >
                    <Package className="w-4 h-4" />
                    <span className="text-sm font-medium">Harvest</span>
                  </motion.button>
                </Tooltip>
                <Tooltip content="View live terminal output and agent activity" position="bottom">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode('terminal')}
                    className={`px-4 py-2.5 rounded-apple transition-all duration-200 flex items-center space-x-2 ${
                      viewMode === 'terminal'
                        ? 'bg-white dark:bg-gray-700 text-apple-blue-DEFAULT dark:text-apple-blue-light shadow-apple-sm' 
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                    aria-label="Terminal View"
                  >
                    <Terminal className="w-4 h-4" />
                    <span className="text-sm font-medium">Terminal</span>
                  </motion.button>
                </Tooltip>
              </motion.div>
              
              {/* Status badge with better styling and centering */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7 }}
                className={`px-4 py-2 rounded-apple-lg text-sm font-semibold shadow-apple-sm border flex items-center justify-center ${
                  farm.status === 'running' || farm.status === 'active' 
                    ? 'bg-apple-green-light/10 text-apple-green-DEFAULT border-apple-green-light/20 dark:bg-apple-green-DEFAULT/10 dark:text-apple-green-light' :
                  farm.status === 'preparing' || farm.status === 'planting' || farm.status === 'launching'
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-apple-yellow-light/10 dark:text-apple-yellow-light dark:border-apple-yellow-light/20' :
                  farm.status === 'harvesting' 
                    ? 'bg-apple-blue-DEFAULT/10 text-apple-blue-DEFAULT border-apple-blue-DEFAULT/20 dark:bg-apple-blue-light/10 dark:text-apple-blue-light' :
                  farm.status === 'completed' 
                    ? 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' :
                    'bg-apple-red-DEFAULT/10 text-apple-red-DEFAULT border-apple-red-DEFAULT/20 dark:bg-apple-red-light/10 dark:text-apple-red-light'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    farm.status === 'running' || farm.status === 'active' ? 'bg-apple-green-DEFAULT' :
                    farm.status === 'preparing' || farm.status === 'planting' || farm.status === 'launching' ? 'bg-yellow-600 dark:bg-apple-yellow-DEFAULT' :
                    farm.status === 'harvesting' ? 'bg-apple-blue-DEFAULT' :
                    farm.status === 'completed' ? 'bg-gray-500' :
                    'bg-apple-red-DEFAULT'
                  }`} />
                  <span className="capitalize">{farm.status}</span>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
        
        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-50/30 dark:to-gray-900/30 pointer-events-none" />
      </motion.div>

      {/* Main Content */}
      {viewMode === 'dashboard' ? (
        hasHarvest ? (
          <HarvestDashboard 
            farmId={(selectedFarmId || farmId)!}
            farmName={farm.name}
            onComplete={() => navigate('/home')}
          />
        ) : (
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-12 relative z-[1]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-apple-xl shadow-apple-lg p-12 text-center border border-gray-200/50 dark:border-gray-800/50"
            >
              <div className="text-gray-500 dark:text-gray-400">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
                  className="inline-flex p-6 bg-gray-100 dark:bg-gray-800 rounded-apple-xl mb-6"
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
        )
      ) : viewMode === 'terminal' ? (
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-12 relative z-[1]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="space-y-8"
          >
            {/* Terminal View - Using HarvestTerminal for better grid display */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-apple-xl shadow-apple-lg border border-gray-200/50 dark:border-gray-800/50 p-6"
            >
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-apple-blue-DEFAULT/10 dark:bg-apple-blue-light/10 rounded-apple">
                  <Terminal className="w-5 h-5 text-apple-blue-DEFAULT dark:text-apple-blue-light" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Harvesting...
                </h2>
              </div>
              <HarvestTerminal 
                farmId={selectedFarmId || farmId}
                className="w-full"
              />
            </motion.div>

            {/* Farm Info Card with Apple styling */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-apple-xl shadow-apple-lg border border-gray-200/50 dark:border-gray-800/50 p-8"
            >
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-apple-green-DEFAULT/10 dark:bg-apple-green-light/10 rounded-apple">
                  <Package className="w-5 h-5 text-apple-green-DEFAULT dark:text-apple-green-light" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Farm Information
                </h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                    {farm.type}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Agents</p>
                  <p className="text-lg font-semibold text-apple-blue-DEFAULT dark:text-apple-blue-light">
                    {farm.agents?.length || 0} Active
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {new Date(farm.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {new Date(farm.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              
              {farm.description && (
                <div className="mt-8 pt-6 border-t border-gray-200/50 dark:border-gray-700/50">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Description</p>
                  <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                    {farm.description}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        </div>
      ) : (
        // Default fallback view
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Select a view mode to continue</p>
          </div>
        </div>
      )}

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