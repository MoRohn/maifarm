import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Pause,
  Play,
  RotateCw,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { clsx } from 'clsx';
import { AgentMonitoringData, TimeSeriesData } from '../../types/monitoring';
import { AgentStatus } from '../../types';
import { useMonitoring } from '../../hooks/useMonitoring';

interface LiveAgentStatusProps {
  farmId: string;
  className?: string;
}

export const LiveAgentStatus: React.FC<LiveAgentStatusProps> = ({ farmId, className }) => {
  const { agents, subscribeToAgentUpdates, sendControl } = useMonitoring(farmId);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAgentUpdates();
    return unsubscribe;
  }, [subscribeToAgentUpdates]);

  const statusConfig: Record<AgentStatus, {
    icon: typeof Activity;
    color: string;
    bgColor: string;
    pulseColor: string;
  }> = {
    idle: { 
      icon: Pause, 
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      pulseColor: 'bg-gray-400'
    },
    working: { 
      icon: Activity, 
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      pulseColor: 'bg-blue-500'
    },
    completed: { 
      icon: CheckCircle, 
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      pulseColor: 'bg-green-500'
    },
    error: { 
      icon: XCircle, 
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      pulseColor: 'bg-red-500'
    },
    paused: { 
      icon: Pause, 
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      pulseColor: 'bg-yellow-500'
    },
    busy: { 
      icon: Activity, 
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      pulseColor: 'bg-blue-500'
    },
    running: { 
      icon: Play, 
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      pulseColor: 'bg-green-500'
    },
    failed: { 
      icon: XCircle, 
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      pulseColor: 'bg-red-500'
    },
    provisioning: { 
      icon: RotateCw, 
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
      pulseColor: 'bg-indigo-500'
    },
    starting: { 
      icon: Zap, 
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
      pulseColor: 'bg-purple-500'
    },
    stopping: { 
      icon: RotateCw, 
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
      pulseColor: 'bg-orange-500'
    },
    stopped: { 
      icon: XCircle, 
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-900/30',
      pulseColor: 'bg-gray-500'
    },
    initializing: { 
      icon: RotateCw, 
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
      pulseColor: 'bg-cyan-500'
    },
    draining: { 
      icon: TrendingDown, 
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      pulseColor: 'bg-amber-500'
    },
    terminating: { 
      icon: XCircle, 
      color: 'text-red-700 dark:text-red-300',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      pulseColor: 'bg-red-600'
    },
    terminated: { 
      icon: XCircle, 
      color: 'text-gray-700 dark:text-gray-300',
      bgColor: 'bg-gray-100 dark:bg-gray-900/30',
      pulseColor: 'bg-gray-600'
    }
  };

  const selectedAgentData = useMemo(() => 
    agents.find(a => a.id === selectedAgent),
    [agents, selectedAgent]
  );

  const handleControl = (agentId: string, action: 'pause' | 'resume' | 'restart') => {
    sendControl({
      type: action,
      targetId: agentId
    });
  };

  return (
    <div className={clsx('space-y-4', className)}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Live Agent Status
        </h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {agents.length} agents active
          </span>
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-2 h-2 bg-green-500 rounded-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {agents.map(agent => {
            const config = statusConfig[agent.status] || statusConfig.idle;
            const StatusIcon = config.icon;
            const trend = getTrend(agent.resourceHistory.cpu);

            return (
              <motion.div
                key={agent.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ y: -2 }}
                onClick={() => {
                  setSelectedAgent(agent.id);
                  setShowDetails(true);
                }}
                className={clsx(
                  'relative cursor-pointer',
                  'bg-white dark:bg-gray-900 rounded-apple-lg',
                  'border border-gray-200 dark:border-gray-800',
                  'shadow-sm hover:shadow-apple transition-all duration-300',
                  'p-4 overflow-hidden'
                )}
              >
                {/* Animated background gradient */}
                <motion.div
                  className="absolute inset-0 opacity-5"
                  animate={{
                    background: [
                      'radial-gradient(circle at 0% 0%, currentColor 0%, transparent 50%)',
                      'radial-gradient(circle at 100% 100%, currentColor 0%, transparent 50%)',
                      'radial-gradient(circle at 0% 0%, currentColor 0%, transparent 50%)'
                    ]
                  }}
                  transition={{ duration: 10, repeat: Infinity }}
                  style={{ color: config.pulseColor }}
                />

                <div className="relative z-10">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className={clsx('p-2 rounded-apple', config.bgColor)}>
                        <StatusIcon className={clsx('w-5 h-5', config.color)} />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {agent.name}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {agent.type}
                        </p>
                      </div>
                    </div>
                    
                    {/* Status indicator */}
                    {agent.status === 'working' && (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className={clsx('w-2 h-2 rounded-full', config.pulseColor)}
                      />
                    )}
                  </div>

                  {/* Current Task */}
                  {agent.currentTask && (
                    <div className="mb-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {agent.currentTask}
                      </p>
                      {agent.progress > 0 && (
                        <div className="mt-2 h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${agent.progress}%` }}
                            transition={{ duration: 0.5 }}
                            className="h-full bg-gradient-to-r from-primary-500 to-primary-600"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-2">
                    <MetricCard
                      label="CPU"
                      value={agent.cpu}
                      trend={trend}
                      sparkline={agent.resourceHistory.cpu.slice(-10)}
                    />
                    <MetricCard
                      label="Memory"
                      value={agent.memory}
                      trend={getTrend(agent.resourceHistory.memory)}
                      sparkline={agent.resourceHistory.memory.slice(-10)}
                    />
                    <MetricCard
                      label="Tasks"
                      value={agent.performanceMetrics.taskCompletionRate}
                      suffix="%"
                      trend={agent.performanceMetrics.taskCompletionRate > 80 ? 'up' : 'down'}
                    />
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center justify-end space-x-1 mt-3">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleControl(agent.id, agent.status === 'paused' ? 'resume' : 'pause');
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {agent.status === 'paused' ? 
                        <Play className="w-4 h-4" /> : 
                        <Pause className="w-4 h-4" />
                      }
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleControl(agent.id, 'restart');
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <RotateCw className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Agent Details Modal */}
      <AnimatePresence>
        {showDetails && selectedAgentData && (
          <AgentDetailsModal
            agent={selectedAgentData}
            onClose={() => setShowDetails(false)}
            onControl={handleControl}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: number;
  trend?: 'up' | 'down' | 'stable';
  suffix?: string;
  sparkline?: TimeSeriesData[];
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  label, 
  value, 
  trend = 'stable', 
  suffix = '%',
  sparkline 
}) => {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <TrendIcon className={clsx('w-3 h-3', trendColor)} />
      </div>
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        {value}{suffix}
      </div>
      {sparkline && sparkline.length > 0 && (
        <Sparkline data={sparkline} className="mt-1" />
      )}
    </div>
  );
};

const Sparkline: React.FC<{ data: TimeSeriesData[]; className?: string }> = ({ data, className }) => {
  const values = data.map(d => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 20" className={clsx('w-full h-5', className)}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary-500"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface AgentDetailsModalProps {
  agent: AgentMonitoringData;
  onClose: () => void;
  onControl: (agentId: string, action: 'pause' | 'resume' | 'restart') => void;
}

const AgentDetailsModal: React.FC<AgentDetailsModalProps> = ({ agent, onClose, onControl }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {agent.name} Details
            </h3>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Content would go here - showing performance graphs, logs, etc. */}
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Detailed monitoring information for {agent.name}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Helper function to determine trend
function getTrend(history: TimeSeriesData[]): 'up' | 'down' | 'stable' {
  if (history.length < 2) return 'stable';
  
  const recent = history.slice(-5);
  const avg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
  const firstAvg = history.slice(0, 5).reduce((sum, d) => sum + d.value, 0) / 5;
  
  if (avg > firstAvg * 1.1) return 'up';
  if (avg < firstAvg * 0.9) return 'down';
  return 'stable';
}