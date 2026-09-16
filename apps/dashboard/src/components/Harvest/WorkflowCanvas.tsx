import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Cpu, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Zap,
  TrendingUp,
  Layers,
  GitBranch,
  Server,
  Database,
  Cloud,
  Command
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface WorkflowAgent {
  id: number;
  name?: string;
  status: 'initializing' | 'active' | 'processing' | 'idle' | 'error' | 'completed';
  uid?: string;
  performance?: {
    cpu: number;
    memory: number;
    tasksCompleted: number;
    successRate: number;
  };
}

interface WorkflowCanvasProps {
  farmId: string;
  farmName: string;
  agents: WorkflowAgent[];
  className?: string;
  onLaunchAgents?: () => void;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  farmId,
  farmName,
  agents,
  className,
  onLaunchAgents
}) => {
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [animationPhase, setAnimationPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationPhase(prev => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'processing':
        return <Activity className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      case 'idle':
        return <Clock className="w-4 h-4" />;
      default:
        return <Cpu className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'processing':
        return 'text-blue-500 dark:text-blue-400';
      case 'completed':
        return 'text-emerald-500 dark:text-emerald-400';
      case 'error':
        return 'text-red-500 dark:text-red-400';
      case 'idle':
        return 'text-gray-400 dark:text-gray-500';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  const getGlassBackground = (status: string) => {
    switch (status) {
      case 'active':
      case 'processing':
        return 'bg-blue-500/5 dark:bg-blue-400/5';
      case 'completed':
        return 'bg-emerald-500/5 dark:bg-emerald-400/5';
      case 'error':
        return 'bg-red-500/5 dark:bg-red-400/5';
      default:
        return 'bg-gray-500/5 dark:bg-gray-400/5';
    }
  };

  return (
    <div className={cn(
      'relative w-full h-full min-h-[600px] overflow-hidden',
      'bg-gradient-to-br from-gray-50 via-white to-gray-50',
      'dark:from-gray-950 dark:via-gray-900 dark:to-gray-950',
      className
    )}>
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]" />
      
      {/* Gradient Orbs for depth */}
      <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 rounded-full blur-3xl" />

      {/* Header Section with Glass Effect */}
      <div className="relative z-10 p-8">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="backdrop-blur-xl bg-white/70 dark:bg-gray-900/70 rounded-3xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-2xl mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">
                Workflow Overview
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Real-time agent orchestration and task processing
              </p>
            </div>
            
            {/* Status Overview with Glass Pills */}
            <div className="flex items-center gap-4">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-2 px-4 py-2 backdrop-blur-xl bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl border border-emerald-500/20"
              >
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {agents.filter(a => ['active', 'processing'].includes(a.status)).length} Active
                </span>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-2 px-4 py-2 backdrop-blur-xl bg-blue-500/10 dark:bg-blue-500/20 rounded-2xl border border-blue-500/20"
              >
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  {agents.length} Total Agents
                </span>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {agents.map((agent, index) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                transition={{ 
                  duration: 0.3, 
                  delay: index * 0.05,
                  ease: [0.23, 1, 0.32, 1] 
                }}
                whileHover={{ scale: 1.02 }}
                onClick={() => setSelectedAgent(agent.id)}
                className={cn(
                  'relative group cursor-pointer',
                  'backdrop-blur-xl bg-white/70 dark:bg-gray-900/70',
                  'border border-gray-200/50 dark:border-gray-700/50',
                  'rounded-2xl p-5',
                  'shadow-sm hover:shadow-lg',
                  'transition-all duration-300',
                  selectedAgent === agent.id && 'ring-2 ring-blue-500/50'
                )}
              >
                {/* Glass overlay effect */}
                <div className={cn(
                  'absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                  'bg-gradient-to-br from-white/10 to-white/5',
                  'dark:from-white/5 dark:to-white/[0.02]'
                )} />

                {/* Status Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                    getGlassBackground(agent.status),
                    'backdrop-blur-sm'
                  )}>
                    <div className={getStatusColor(agent.status)}>
                      {getStatusIcon(agent.status)}
                    </div>
                    <span className={cn('text-xs font-medium', getStatusColor(agent.status))}>
                      {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                    </span>
                  </div>
                  
                  {/* Agent ID Badge */}
                  <div className="px-2 py-1 bg-gray-100/50 dark:bg-gray-800/50 rounded-md">
                    <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                      #{String(agent.id + 1).padStart(2, '0')}
                    </span>
                  </div>
                </div>

                {/* Agent Name */}
                <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                  {agent.name || `Agent-${String(agent.id + 1).padStart(2, '0')}`}
                </h3>

                {/* Performance Metrics */}
                {agent.performance && (
                  <div className="space-y-2">
                    {/* CPU Usage */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">CPU</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.max(0, agent.performance.cpu))}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                          {Math.min(100, Math.max(0, Math.round(agent.performance.cpu)))}%
                        </span>
                      </div>
                    </div>

                    {/* Memory Usage */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Memory</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.max(0, agent.performance.memory))}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
                          {Math.min(100, Math.max(0, Math.round(agent.performance.memory)))}%
                        </span>
                      </div>
                    </div>

                    {/* Task Stats */}
                    <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Tasks</span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {agent.performance.tasksCompleted} completed
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Success</span>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {agent.performance.successRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Active Indicator */}
                {(agent.status === 'active' || agent.status === 'processing') && (
                  <div className="absolute top-2 right-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* No Agents State */}
        {agents.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="p-4 bg-gray-100/50 dark:bg-gray-800/50 rounded-2xl mb-4">
              <Layers className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
              No Active Agents
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Launch agents to begin workflow processing
            </p>
            {onLaunchAgents && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onLaunchAgents}
                className={cn(
                  'px-6 py-2.5 rounded-xl',
                  'bg-gradient-to-r from-blue-600 to-blue-500',
                  'text-white font-medium text-sm',
                  'shadow-sm hover:shadow-md',
                  'transition-all duration-200'
                )}
              >
                Launch Agents
              </motion.button>
            )}
          </motion.div>
        )}
      </div>

      {/* Floating Connection Lines (subtle) */}
      {agents.length > 1 && (
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="rgb(147, 51, 234)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {agents.slice(0, -1).map((agent, index) => {
            if (index < agents.length - 1) {
              return (
                <motion.line
                  key={`line-${agent.id}`}
                  x1={`${25 + (index % 4) * 25}%`}
                  y1={`${30 + Math.floor(index / 4) * 30}%`}
                  x2={`${25 + ((index + 1) % 4) * 25}%`}
                  y2={`${30 + Math.floor((index + 1) / 4) * 30}%`}
                  stroke="url(#lineGradient)"
                  strokeWidth="1"
                  strokeDasharray="5 5"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 2, delay: index * 0.2 }}
                />
              );
            }
            return null;
          })}
        </svg>
      )}
    </div>
  );
};