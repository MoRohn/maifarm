import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CpuChipIcon,
  ArrowPathIcon,
  EyeIcon,
  PlayIcon,
  PauseIcon
} from '@heroicons/react/24/outline';

/**
 * Session progress data from activity parser
 */
interface SessionProgress {
  overallProgress: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  errorCount: number;
}

/**
 * Agent activity summary for dashboard
 */
interface AgentSummary {
  agentId: number;
  agentName: string;
  status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'completed' | 'error';
  currentTask?: string;
  progress?: number;
  lastUpdate: Date;
}

interface ProgressDashboardProps {
  sessionName: string;
  farmId?: string;
  farmName?: string;
  startTime?: Date;
  onShowActivityFeed?: () => void;
  onShowAgent?: (agentId: number) => void;
  onPauseFarm?: () => void;
  onResumeFarm?: () => void;
  isPaused?: boolean;
}

/**
 * Get status color for progress ring
 */
function getProgressColor(progress: number, errorCount: number): string {
  if (errorCount > 0) return 'text-red-500';
  if (progress === 100) return 'text-green-500';
  if (progress > 50) return 'text-blue-500';
  return 'text-yellow-500';
}

/**
 * Format duration from start time
 */
function formatDuration(startTime?: Date): string {
  if (!startTime) return 'Unknown';
  
  const now = new Date();
  const diffMs = now.getTime() - startTime.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  
  if (diffHours > 0) {
    const remainingMins = diffMins % 60;
    return `${diffHours}h ${remainingMins}m`;
  }
  return `${diffMins}m`;
}

/**
 * Progress Dashboard Component
 */
export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  sessionName,
  farmId,
  farmName,
  startTime,
  onShowActivityFeed,
  onShowAgent,
  onPauseFarm,
  onResumeFarm,
  isPaused = false
}) => {
  // State
  const [sessionProgress, setSessionProgress] = useState<SessionProgress>({
    overallProgress: 0,
    activeAgents: 0,
    totalTasks: 0,
    completedTasks: 0,
    errorCount: 0
  });
  const [agentSummaries, setAgentSummaries] = useState<AgentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // WebSocket connection
  const { socket, isConnected } = useWebSocket();

  // Connect to session progress events
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Join session room for updates
    socket.emit('terminal:join_session', { sessionId: sessionName, farmId });

    // Listen for session progress updates
    const handleSessionProgress = (data: {
      progress: SessionProgress;
    }) => {
      setSessionProgress(data.progress);
      setLastUpdate(new Date());
      setIsLoading(false);
    };

    // Listen for agent status updates to build summaries
    const handleAgentStatus = (data: {
      agentActivity: {
        agentId: number;
        agentName: string;
        status: AgentSummary['status'];
        currentTask?: { description: string; progress?: number };
        lastUpdate: string;
      };
    }) => {
      setAgentSummaries(prev => {
        const updated = [...prev];
        const existingIndex = updated.findIndex(a => a.agentId === data.agentActivity.agentId);
        
        const summary: AgentSummary = {
          agentId: data.agentActivity.agentId,
          agentName: data.agentActivity.agentName,
          status: data.agentActivity.status,
          currentTask: data.agentActivity.currentTask?.description,
          progress: data.agentActivity.currentTask?.progress,
          lastUpdate: new Date(data.agentActivity.lastUpdate)
        };

        if (existingIndex >= 0) {
          updated[existingIndex] = summary;
        } else {
          updated.push(summary);
        }

        return updated.sort((a, b) => a.agentId - b.agentId);
      });
      setIsLoading(false);
    };

    socket.on('session:progress', handleSessionProgress);
    socket.on('agent:status', handleAgentStatus);

    // Request initial data after a short delay
    setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    // Cleanup
    return () => {
      socket.off('session:progress', handleSessionProgress);
      socket.off('agent:status', handleAgentStatus);
    };
  }, [socket, isConnected, sessionName, farmId]);

  // Calculate derived metrics
  const metrics = useMemo(() => {
    const totalAgents = agentSummaries.length;
    const idleAgents = agentSummaries.filter(a => a.status === 'idle').length;
    const completedAgents = agentSummaries.filter(a => a.status === 'completed').length;
    const errorAgents = agentSummaries.filter(a => a.status === 'error').length;
    
    return {
      totalAgents,
      idleAgents,
      completedAgents,
      errorAgents,
      efficiency: totalAgents > 0 ? Math.round(((totalAgents - idleAgents) / totalAgents) * 100) : 0
    };
  }, [agentSummaries]);

  // Get status distribution for pie chart visualization
  const statusDistribution = useMemo(() => {
    const counts = agentSummaries.reduce((acc, agent) => {
      acc[agent.status] = (acc[agent.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return [
      { status: 'executing', count: counts.executing || 0, color: 'bg-green-500' },
      { status: 'thinking', count: counts.thinking || 0, color: 'bg-blue-500' },
      { status: 'waiting', count: counts.waiting || 0, color: 'bg-yellow-500' },
      { status: 'idle', count: counts.idle || 0, color: 'bg-gray-400' },
      { status: 'completed', count: counts.completed || 0, color: 'bg-green-600' },
      { status: 'error', count: counts.error || 0, color: 'bg-red-500' }
    ].filter(item => item.count > 0);
  }, [agentSummaries]);

  return (
    <div className="w-full space-y-6">
      {/* Main Progress Card with Glass Effect */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="backdrop-blur-xl bg-white/70 dark:bg-gray-800/70 rounded-3xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                {farmName || `Farm ${sessionName}`}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Runtime: {formatDuration(startTime)} • Last update: {lastUpdate.toLocaleTimeString()}
              </p>
            </div>
            
            {/* Connection & Controls */}
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              
              {/* Farm Controls with Glass Effect */}
              <div className="flex gap-2">
                {isPaused ? (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onResumeFarm}
                    className="px-4 py-2 backdrop-blur-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-xl border border-emerald-500/30 transition-all duration-300 flex items-center gap-2 shadow-lg"
                  >
                    <PlayIcon className="h-4 w-4" />
                    Resume
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onPauseFarm}
                    className="px-4 py-2 backdrop-blur-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl border border-amber-500/30 transition-all duration-300 flex items-center gap-2 shadow-lg"
                  >
                    <PauseIcon className="h-4 w-4" />
                    Pause
                  </motion.button>
                )}
                
                {onShowActivityFeed && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onShowActivityFeed}
                    className="px-4 py-2 backdrop-blur-xl bg-white/80 hover:bg-white/90 dark:bg-gray-700/80 dark:hover:bg-gray-700/90 text-gray-700 dark:text-gray-300 rounded-xl border border-gray-200/50 dark:border-gray-600/50 transition-all duration-300 flex items-center gap-2 shadow-lg"
                  >
                    <EyeIcon className="h-4 w-4" />
                    Activity
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Main Progress Ring */}
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="w-32 h-32">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                  {/* Background circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-gray-200"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={`${2 * Math.PI * 54}`}
                    strokeDashoffset={`${2 * Math.PI * 54 * (1 - sessionProgress.overallProgress / 100)}`}
                    className={`transition-all duration-1000 ${getProgressColor(sessionProgress.overallProgress, sessionProgress.errorCount)}`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              
              {/* Center text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${getProgressColor(sessionProgress.overallProgress, sessionProgress.errorCount)}`}>
                    {sessionProgress.overallProgress}%
                  </div>
                  <div className="text-xs text-gray-500">Complete</div>
                </div>
              </div>
            </div>
          </div>

          {/* Key Metrics with Glass Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="text-center p-3 backdrop-blur-xl bg-white/60 dark:bg-gray-800/60 rounded-2xl border border-gray-200/30 dark:border-gray-700/30 shadow-lg"
            >
              <CpuChipIcon className="h-5 w-5 mx-auto mb-1 text-gray-600 dark:text-gray-400" />
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{metrics.totalAgents}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Total Agents</div>
            </motion.div>
            
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="text-center p-3 backdrop-blur-xl bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl border border-emerald-500/20 dark:border-emerald-500/30 shadow-lg"
            >
              <ArrowPathIcon className="h-5 w-5 mx-auto mb-1 text-emerald-600 dark:text-emerald-400" />
              <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">{sessionProgress.activeAgents}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Active</div>
            </motion.div>
            
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="text-center p-3 backdrop-blur-xl bg-blue-500/10 dark:bg-blue-500/20 rounded-2xl border border-blue-500/20 dark:border-blue-500/30 shadow-lg"
            >
              <CheckCircleIcon className="h-5 w-5 mx-auto mb-1 text-blue-600 dark:text-blue-400" />
              <div className="text-lg font-semibold text-blue-700 dark:text-blue-400">{sessionProgress.completedTasks}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Tasks Done</div>
            </motion.div>
            
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="text-center p-3 backdrop-blur-xl bg-red-500/10 dark:bg-red-500/20 rounded-2xl border border-red-500/20 dark:border-red-500/30 shadow-lg"
            >
              <ExclamationTriangleIcon className="h-5 w-5 mx-auto mb-1 text-red-600 dark:text-red-400" />
              <div className="text-lg font-semibold text-red-700 dark:text-red-400">{sessionProgress.errorCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Errors</div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Agent Status Overview */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Status Distribution with Glass Effect */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="backdrop-blur-xl bg-white/70 dark:bg-gray-800/70 rounded-3xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Status</h3>
          </div>
          <div className="p-6">
            {isLoading ? (
              <div className="text-center py-4">
                <ArrowPathIcon className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500">Loading agent data...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {statusDistribution.map((item) => (
                  <div key={item.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${item.color}`} />
                      <span className="text-sm capitalize">{item.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.count}</span>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${item.color}`}
                          style={{ width: `${(item.count / metrics.totalAgents) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                
                {statusDistribution.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No agents active yet
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Recent Agent Activity with Glass Effect */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="backdrop-blur-xl bg-white/70 dark:bg-gray-800/70 rounded-3xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Activity</h3>
          </div>
          <div className="p-6">
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {agentSummaries
                .filter(agent => agent.status !== 'idle')
                .slice(0, 6)
                .map((agent) => (
                  <motion.div
                    key={agent.agentId}
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center justify-between p-3 backdrop-blur-xl bg-white/50 dark:bg-gray-800/50 rounded-2xl cursor-pointer hover:bg-white/70 dark:hover:bg-gray-700/70 transition-all duration-300 border border-gray-200/30 dark:border-gray-700/30"
                    onClick={() => onShowAgent?.(agent.agentId)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        agent.status === 'executing' ? 'bg-green-500' :
                        agent.status === 'thinking' ? 'bg-blue-500' :
                        agent.status === 'error' ? 'bg-red-500' :
                        'bg-yellow-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium">{agent.agentName}</p>
                        {agent.currentTask && (
                          <p className="text-xs text-gray-500 truncate max-w-48">
                            {agent.currentTask}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {agent.progress !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        {agent.progress}%
                      </Badge>
                    )}
                  </motion.div>
                ))}
              
              {agentSummaries.filter(a => a.status !== 'idle').length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  All agents are idle
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Performance Metrics with Glass Effect */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="backdrop-blur-xl bg-white/70 dark:bg-gray-800/70 rounded-3xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ChartBarIcon className="h-5 w-5" />
            Performance Overview
          </h3>
        </div>
        <div className="p-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Agent Efficiency</span>
                <span className="text-sm font-medium">{metrics.efficiency}%</span>
              </div>
              <Progress value={metrics.efficiency} className="h-2" />
              <p className="text-xs text-gray-500 mt-1">
                {metrics.totalAgents - metrics.idleAgents} of {metrics.totalAgents} agents working
              </p>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Task Progress</span>
                <span className="text-sm font-medium">{sessionProgress.overallProgress}%</span>
              </div>
              <Progress value={sessionProgress.overallProgress} className="h-2" />
              <p className="text-xs text-gray-500 mt-1">
                {sessionProgress.completedTasks} tasks completed
              </p>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Success Rate</span>
                <span className="text-sm font-medium">
                  {sessionProgress.totalTasks > 0 
                    ? Math.round(((sessionProgress.totalTasks - sessionProgress.errorCount) / sessionProgress.totalTasks) * 100)
                    : 100
                  }%
                </span>
              </div>
              <Progress 
                value={sessionProgress.totalTasks > 0 
                  ? ((sessionProgress.totalTasks - sessionProgress.errorCount) / sessionProgress.totalTasks) * 100
                  : 100
                } 
                className="h-2" 
              />
              <p className="text-xs text-gray-500 mt-1">
                {sessionProgress.errorCount} errors encountered
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ProgressDashboard;