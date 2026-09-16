import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Grid, 
  List, 
  Terminal, 
  Users, 
  Activity, 
  Pause, 
  Play, 
  StopCircle,
  Layers,
  Monitor,
  Cpu,
  Command
} from 'lucide-react';
import { AgentTerminal } from './AgentTerminal';
import { useWebSocket } from '@/hooks/useWebSocket';
import { premiumClasses, cn } from '@/styles/premium-design-system';

interface FarmAgent {
  id: number;
  name?: string;
  paneId: string;
  status: 'starting' | 'ready' | 'working' | 'idle' | 'error';
  uid?: string;
}

interface FarmTerminalGridProps {
  farmId: string;
  farmName: string;
  className?: string;
}

export const FarmTerminalGrid: React.FC<FarmTerminalGridProps> = ({
  farmId,
  farmName,
  className
}) => {
  const [agents, setAgents] = useState<FarmAgent[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'stack'>('grid');
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [farmStatus, setFarmStatus] = useState<'launching' | 'active' | 'paused' | 'stopped'>('launching');
  const { subscribe } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  useEffect(() => {
    // Subscribe to farm and agent status updates
    const handleFarmStatus = (data: any) => {
      // Handle both direct data and payload format
      const eventData = data.payload || data;
      if (eventData.farmId === farmId) {
        setFarmStatus(eventData.status);
      }
    };

    const handleAgentStatus = (data: any) => {
      // Handle both direct data and payload format
      const eventData = data.payload || data;
      if (eventData.farmId === farmId) {
        setAgents(prev => {
          const updated = [...prev];
          const agent = updated.find(a => a.id === eventData.agentId);
          if (agent) {
            agent.status = eventData.status;
            if (eventData.uid) agent.uid = eventData.uid;
          } else {
            updated.push({
              id: eventData.agentId,
              name: eventData.agentName,
              paneId: `farm_${farmId}:agents.${eventData.agentId}`,
              status: eventData.status,
              uid: eventData.uid
            });
          }
          return updated.sort((a, b) => a.id - b.id);
        });
      }
    };

    const unsubscribeFarmStatus = subscribe('farm:status', handleFarmStatus);
    const unsubscribeAgentStatus = subscribe('agent:status', handleAgentStatus);

    // Fetch initial farm status
    fetchFarmStatus();

    return () => {
      unsubscribeFarmStatus();
      unsubscribeAgentStatus();
    };
  }, [farmId, subscribe]);

  const fetchFarmStatus = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4567';
      
      // First try to get the full farm data with agents
      const farmResponse = await fetch(`${apiUrl}/api/farms/${farmId}`);
      if (farmResponse.ok) {
        const farmData = await farmResponse.json();
        if (farmData.success && farmData.data) {
          setFarmStatus(farmData.data.status || 'stopped');
          
          // Use agents from farm data if available
          if (farmData.data.agents && farmData.data.agents.length > 0) {
            const formattedAgents = farmData.data.agents.map((agent: any, index: number) => ({
              id: index,
              name: agent.name || `Agent ${index + 1}`,
              paneId: `farm_${farmId}:agents.${index}`,
              status: agent.status || 'starting',
              uid: agent.id
            }));
            setAgents(formattedAgents);
            return;
          }
        }
      }
      
      // Fallback to multi-claude status endpoint
      const response = await fetch(`${apiUrl}/api/farms/${farmId}/multi-claude/status`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setFarmStatus(data.data.status);
          if (data.data.agents) {
            setAgents(data.data.agents);
          }
        }
      } else if (response.status === 404) {
        // Farm hasn't been launched yet, show stopped state
        setFarmStatus('stopped');
      }
    } catch (error) {
      // Default to stopped state if there's an error
      setFarmStatus('stopped');
    }
  };

  const handleFarmControl = async (action: 'start' | 'stop' | 'pause' | 'resume') => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4567';
      const endpoint = action === 'start' ? 'launch' : action;
      const response = await fetch(`${apiUrl}/api/farms/${farmId}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: action === 'start' ? JSON.stringify({ numberOfAgents: 3 }) : undefined
      });

      if (response.ok) {
        fetchFarmStatus();
      }
    } catch (error) {
      console.error(`Error ${action}ing farm:`, error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-emerald-600 dark:text-emerald-400';
      case 'paused': return 'text-amber-600 dark:text-amber-400';
      case 'stopped': return 'text-gray-500 dark:text-gray-400';
      default: return 'text-blue-600 dark:text-blue-400';
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium';
    switch (status) {
      case 'active': 
        return `${baseClasses} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20`;
      case 'paused': 
        return `${baseClasses} bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20`;
      case 'stopped': 
        return `${baseClasses} bg-gray-100 text-gray-600 dark:bg-gray-500/10 dark:text-gray-400 border border-gray-200 dark:border-gray-500/20`;
      default: 
        return `${baseClasses} bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20`;
    }
  };

  // Always use professional grid view
  useEffect(() => {
    // Ensure valid view mode
    if (viewMode !== 'grid' && viewMode !== 'stack') {
      setViewMode('grid');
    }
  }, [viewMode]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Premium Header with Glass Morphism */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className={cn(premiumClasses.glassPanel, 'rounded-2xl shadow-lg p-6')}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Professional Icon Container */}
            <div className="p-3 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-xl">
              <Command className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">
                {farmName}
              </h3>
              <div className="flex items-center gap-6 mt-2">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    {agents.length} {agents.length === 1 ? 'Agent' : 'Agents'}
                  </span>
                </div>
                <div className={getStatusBadge(farmStatus)}>
                  <div className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    farmStatus === 'active' ? 'bg-emerald-500 animate-pulse' :
                    farmStatus === 'paused' ? 'bg-amber-500' :
                    'bg-gray-400'
                  )} />
                  <span className="capitalize">{farmStatus}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Premium Control Buttons */}
            <div className="flex items-center gap-2">
              {farmStatus === 'stopped' ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleFarmControl('start')}
                  className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-200 shadow-sm"
                  title="Start Agents"
                >
                  <Play className="w-4 h-4 inline mr-2" />
                  Start
                </motion.button>
              ) : farmStatus === 'paused' ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleFarmControl('resume')}
                  className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-200 shadow-sm"
                  title="Resume Agents"
                >
                  <Play className="w-4 h-4 inline mr-2" />
                  Resume
                </motion.button>
              ) : farmStatus === 'active' ? (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleFarmControl('pause')}
                    className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
                    title="Pause Agents"
                  >
                    <Pause className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleFarmControl('stop')}
                    className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
                    title="Stop Agents"
                  >
                    <StopCircle className="w-4 h-4" />
                  </motion.button>
                </>
              ) : null}
            </div>

            {/* Premium View Mode Selector */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                  viewMode === 'grid' 
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <Grid className="w-4 h-4 inline mr-1.5" />
                Grid
              </button>
              <button
                onClick={() => setViewMode('stack')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                  viewMode === 'stack' 
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <Layers className="w-4 h-4 inline mr-1.5" />
                Stack
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Premium Terminal Display */}
      <AnimatePresence mode="wait">
        {agents.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className={cn(premiumClasses.glassPanel, 'rounded-2xl shadow-lg p-16 text-center')}
          >
            <div className="max-w-sm mx-auto">
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-2xl inline-block mb-6">
                <Monitor className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {farmStatus === 'launching' 
                  ? 'Initializing Agents' 
                  : 'No Active Agents'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {farmStatus === 'launching' 
                  ? 'Setting up agent environments and establishing connections...' 
                  : 'Start the workflow to deploy AI agents and begin processing.'}
              </p>
            </div>
          </motion.div>
        ) : viewMode === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], staggerChildren: 0.1 }}
            className={cn(
              'grid gap-6',
              agents.length === 1 ? 'grid-cols-1' :
              agents.length === 2 ? 'grid-cols-1 lg:grid-cols-2' :
              'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
            )}
          >
            {agents.map((agent, index) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  premiumClasses.glassPanel,
                  'rounded-xl overflow-hidden hover:shadow-xl transition-all duration-300'
                )}
              >
                <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <Cpu className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {agent.name || `Agent ${agent.id + 1}`}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <div className={cn(
                            'w-2 h-2 rounded-full',
                            agent.status === 'ready' || agent.status === 'working' ? 'bg-emerald-500 animate-pulse' :
                            agent.status === 'error' ? 'bg-red-500' :
                            'bg-gray-400'
                          )} />
                          <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                            {agent.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <AgentTerminal
                  farmId={farmId}
                  agentId={agent.id}
                  agentName={agent.name}
                  agentUid={agent.uid}
                  status={agent.status}
                  className="h-[400px]"
                />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="stack"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Premium Agent Selector */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(premiumClasses.glassPanel, 'rounded-xl p-3')}
            >
              <div className="flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
                {agents.map((agent) => (
                  <motion.button
                    key={agent.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={cn(
                      'px-4 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition-all duration-200 flex items-center gap-2',
                      selectedAgent === agent.id
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-md'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    )}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    {agent.name || `Agent ${agent.id + 1}`}
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      agent.status === 'ready' || agent.status === 'working' ? 'bg-emerald-500' :
                      agent.status === 'error' ? 'bg-red-500' :
                      'bg-gray-400',
                      agent.status === 'working' && 'animate-pulse'
                    )} />
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Selected Agent Terminal with Premium Styling */}
            {selectedAgent !== null && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(premiumClasses.glassPanel, 'rounded-xl overflow-hidden')}
              >
                <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                        <Terminal className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {agents.find(a => a.id === selectedAgent)?.name || `Agent ${selectedAgent + 1}`}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Session ID: {agents.find(a => a.id === selectedAgent)?.uid || `${farmId}-${selectedAgent}`}
                        </p>
                      </div>
                    </div>
                    <div className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5',
                      agents.find(a => a.id === selectedAgent)?.status === 'working' 
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    )}>
                      <Activity className="w-3 h-3" />
                      {agents.find(a => a.id === selectedAgent)?.status || 'idle'}
                    </div>
                  </div>
                </div>
                <AgentTerminal
                  farmId={farmId}
                  agentId={selectedAgent}
                  agentName={agents.find(a => a.id === selectedAgent)?.name}
                  agentUid={agents.find(a => a.id === selectedAgent)?.uid}
                  status={agents.find(a => a.id === selectedAgent)?.status}
                  className="h-[600px]"
                />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};