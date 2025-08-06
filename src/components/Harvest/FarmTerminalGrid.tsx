import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Grid, List, Terminal, Users, Activity, Pause, Play, StopCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { AgentTerminal } from './AgentTerminal';
import { useWebSocket } from '../../hooks/useWebSocket';

interface FarmAgent {
  id: number;
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [farmStatus, setFarmStatus] = useState<'launching' | 'running' | 'paused' | 'stopped'>('launching');
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
        console.log('Farm not launched yet, showing stopped state');
      }
    } catch (error) {
      console.error('Error fetching farm status:', error);
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
      case 'running': return 'text-green-500 bg-green-500/10';
      case 'paused': return 'text-yellow-500 bg-yellow-500/10';
      case 'stopped': return 'text-red-500 bg-red-500/10';
      default: return 'text-blue-500 bg-blue-500/10';
    }
  };

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Terminal className="w-5 h-5 text-gray-500" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {farmName} - Terminal View
              </h3>
              <div className="flex items-center space-x-4 mt-1">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {agents.length} Agents
                  </span>
                </div>
                <div className={clsx('flex items-center space-x-2 px-2 py-0.5 rounded-full', getStatusColor(farmStatus))}>
                  <Activity className="w-3 h-3" />
                  <span className="text-xs font-medium capitalize">{farmStatus}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Farm Controls */}
            <div className="flex items-center space-x-1 mr-4">
              {farmStatus === 'stopped' ? (
                <button
                  onClick={() => handleFarmControl('start')}
                  className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                  title="Start Farm"
                >
                  <Play className="w-4 h-4" />
                </button>
              ) : farmStatus === 'paused' ? (
                <button
                  onClick={() => handleFarmControl('resume')}
                  className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                  title="Resume Farm"
                >
                  <Play className="w-4 h-4" />
                </button>
              ) : farmStatus === 'running' ? (
                <>
                  <button
                    onClick={() => handleFarmControl('pause')}
                    className="p-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors"
                    title="Pause Farm"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleFarmControl('stop')}
                    className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                    title="Stop Farm"
                  >
                    <StopCircle className="w-4 h-4" />
                  </button>
                </>
              ) : null}
            </div>

            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={clsx(
                  'p-1.5 rounded transition-colors',
                  viewMode === 'grid' 
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={clsx(
                  'p-1.5 rounded transition-colors',
                  viewMode === 'list' 
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Terminals */}
      <AnimatePresence mode="wait">
        {agents.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center"
          >
            <Terminal className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              {farmStatus === 'launching' 
                ? 'Launching agents...' 
                : 'No agents running. Start the farm to begin.'}
            </p>
          </motion.div>
        ) : viewMode === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={clsx(
              'grid gap-4',
              agents.length === 1 ? 'grid-cols-1' :
              agents.length === 2 ? 'grid-cols-1 lg:grid-cols-2' :
              'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
            )}
          >
            {agents.map((agent) => (
              <AgentTerminal
                key={agent.id}
                farmId={farmId}
                agentId={agent.id}
                agentUid={agent.uid}
                status={agent.status}
                className="h-96"
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {/* Agent selector tabs */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-2">
              <div className="flex space-x-1 overflow-x-auto">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={clsx(
                      'px-4 py-2 rounded-lg font-mono text-sm whitespace-nowrap transition-colors',
                      selectedAgent === agent.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    )}
                  >
                    Agent {agent.id}
                    <span className={clsx(
                      'ml-2 inline-block w-2 h-2 rounded-full',
                      agent.status === 'ready' ? 'bg-green-400' :
                      agent.status === 'working' ? 'bg-blue-400 animate-pulse' :
                      agent.status === 'error' ? 'bg-red-400' :
                      'bg-gray-400'
                    )} />
                  </button>
                ))}
              </div>
            </div>

            {/* Selected agent terminal */}
            {selectedAgent !== null && (
              <AgentTerminal
                farmId={farmId}
                agentId={selectedAgent}
                agentUid={agents.find(a => a.id === selectedAgent)?.uid}
                status={agents.find(a => a.id === selectedAgent)?.status}
                className="h-[600px]"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};