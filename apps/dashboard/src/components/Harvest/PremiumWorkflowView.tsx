/**
 * PremiumWorkflowView - Apple-inspired professional workflow visualization
 *
 * Features:
 * - Glass morphism design with smooth animations
 * - Real-time agent status tracking with live indicators
 * - Interactive agent cards with performance metrics
 * - Elegant connection lines between agents
 * - Professional status overview dashboard
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import {
  Activity,
  CheckCircle,
  AlertCircle,
  Clock,
  Cpu,
  Database,
  Zap,
  TrendingUp,
  Layers,
  GitBranch,
  Server,
  Bot,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Circle,
  BarChart3,
  Timer,
  Target
} from 'lucide-react';
import { cn } from '@/utils/cn';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface WorkflowAgent {
  id: number;
  name: string;
  status: 'initializing' | 'active' | 'processing' | 'idle' | 'error' | 'completed';
  uid?: string;
  performance?: {
    cpu: number;
    memory: number;
    tasksCompleted: number;
    successRate: number;
  };
  currentTask?: string;
  lastActivity?: number;
}

interface PremiumWorkflowViewProps {
  farmId: string;
  farmName: string;
  agents: WorkflowAgent[];
  className?: string;
  onAgentClick?: (agentId: number) => void;
  onLaunchAgents?: () => void;
}

// ============================================================================
// Animation Variants
// ============================================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25
    }
  },
  hover: {
    scale: 1.02,
    y: -4,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25
    }
  }
};

// ============================================================================
// Component
// ============================================================================

export const PremiumWorkflowView: React.FC<PremiumWorkflowViewProps> = ({
  farmId,
  farmName,
  agents,
  className,
  onAgentClick,
  onLaunchAgents
}) => {
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [animationPhase, setAnimationPhase] = useState(0);

  // Animation phase cycling
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationPhase(prev => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Statistics
  // FIX: Prevent division by zero when agents array is empty
  const stats = useMemo(() => {
    const agentCount = agents.length;
    return {
      total: agentCount,
      active: agents.filter(a => ['active', 'processing'].includes(a.status)).length,
      completed: agents.filter(a => a.status === 'completed').length,
      error: agents.filter(a => a.status === 'error').length,
      idle: agents.filter(a => a.status === 'idle').length,
      avgCpu: agentCount > 0 ? agents.reduce((acc, a) => acc + (a.performance?.cpu || 0), 0) / agentCount : 0,
      avgMemory: agentCount > 0 ? agents.reduce((acc, a) => acc + (a.performance?.memory || 0), 0) / agentCount : 0,
      totalTasks: agents.reduce((acc, a) => acc + (a.performance?.tasksCompleted || 0), 0),
      avgSuccessRate: agentCount > 0 ? agents.reduce((acc, a) => acc + (a.performance?.successRate || 0), 0) / agentCount : 0
    };
  }, [agents]);

  // ============================================================================
  // Helpers
  // ============================================================================

  interface StatusConfig {
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    borderColor: string;
    glowColor: string;
    label: string;
  }

  const getStatusConfig = (status: string): StatusConfig => {
    const defaultConfig: StatusConfig = {
      icon: <Clock className="w-4 h-4" />,
      color: 'text-gray-400',
      bgColor: 'bg-gray-500/10',
      borderColor: 'border-gray-500/30',
      glowColor: 'shadow-gray-500/20',
      label: 'Idle'
    };

    const configs: Record<string, StatusConfig> = {
      active: {
        icon: <Activity className="w-4 h-4" />,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30',
        glowColor: 'shadow-emerald-500/20',
        label: 'Active'
      },
      processing: {
        icon: <Activity className="w-4 h-4 animate-pulse" />,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        glowColor: 'shadow-blue-500/20',
        label: 'Processing'
      },
      completed: {
        icon: <CheckCircle className="w-4 h-4" />,
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        glowColor: 'shadow-green-500/20',
        label: 'Completed'
      },
      error: {
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        glowColor: 'shadow-red-500/20',
        label: 'Error'
      },
      idle: defaultConfig,
      initializing: {
        icon: <RotateCcw className="w-4 h-4 animate-spin" />,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        glowColor: 'shadow-amber-500/20',
        label: 'Initializing'
      }
    };
    return configs[status] ?? defaultConfig;
  };

  const handleAgentClick = useCallback((agentId: number) => {
    setSelectedAgent(agentId === selectedAgent ? null : agentId);
    onAgentClick?.(agentId);
  }, [selectedAgent, onAgentClick]);

  // ============================================================================
  // Render Agent Card
  // ============================================================================

  const renderAgentCard = (agent: WorkflowAgent, index: number) => {
    const config = getStatusConfig(agent.status);
    const isSelected = selectedAgent === agent.id;

    return (
      <motion.div
        key={agent.id}
        variants={cardVariants}
        whileHover="hover"
        onClick={() => handleAgentClick(agent.id)}
        className={cn(
          'relative group cursor-pointer',
          'backdrop-blur-xl bg-white/5 dark:bg-gray-900/50',
          'border rounded-2xl p-5',
          config.borderColor,
          `shadow-lg ${config.glowColor}`,
          'transition-all duration-300',
          isSelected && 'ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-transparent'
        )}
      >
        {/* Glass Overlay */}
        <div className={cn(
          'absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          'bg-gradient-to-br from-white/10 to-white/5'
        )} />

        {/* Status Badge & Agent ID */}
        <div className="flex items-center justify-between mb-4 relative z-10">
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-xl',
            config.bgColor,
            'backdrop-blur-sm'
          )}>
            <span className={config.color}>{config.icon}</span>
            <span className={cn('text-xs font-medium', config.color)}>
              {config.label}
            </span>
          </div>
          <div className="px-2 py-1 bg-white/10 dark:bg-gray-800/50 rounded-lg">
            <span className="text-xs font-mono text-gray-400">
              #{String(agent.id + 1).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Agent Info */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(
              'p-2 rounded-xl',
              'bg-gradient-to-br',
              agent.status === 'active' || agent.status === 'processing'
                ? 'from-emerald-500/20 to-emerald-600/10'
                : 'from-gray-500/20 to-gray-600/10'
            )}>
              <Bot className={cn(
                'w-5 h-5',
                agent.status === 'active' || agent.status === 'processing'
                  ? 'text-emerald-400'
                  : 'text-gray-400'
              )} />
            </div>
            <div>
              <h3 className="font-semibold text-white">
                {agent.name || `Agent-${String(agent.id + 1).padStart(2, '0')}`}
              </h3>
              {agent.currentTask && (
                <p className="text-xs text-gray-400 truncate max-w-[180px]">
                  {agent.currentTask}
                </p>
              )}
            </div>
          </div>

          {/* Performance Metrics */}
          {agent.performance && (
            <div className="space-y-3 mt-4">
              {/* CPU */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-gray-400">CPU</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, agent.performance.cpu))}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-400 w-8 text-right">
                    {Math.round(Math.min(100, Math.max(0, agent.performance.cpu)))}%
                  </span>
                </div>
              </div>

              {/* Memory */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-xs text-gray-400">Memory</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, agent.performance.memory))}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-400 w-8 text-right">
                    {Math.round(Math.min(100, Math.max(0, agent.performance.memory)))}%
                  </span>
                </div>
              </div>

              {/* Task Stats */}
              <div className="pt-3 mt-3 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs text-gray-400">Tasks</span>
                  </div>
                  <span className="text-xs font-medium text-white">
                    {agent.performance.tasksCompleted}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs text-gray-400">Success</span>
                  </div>
                  <span className="text-xs font-medium text-emerald-400">
                    {agent.performance.successRate}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Active Pulse */}
        {(agent.status === 'active' || agent.status === 'processing') && (
          <motion.div
            className="absolute top-3 right-3"
            animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
          </motion.div>
        )}
      </motion.div>
    );
  };

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div className={cn(
      'relative w-full min-h-[600px] overflow-hidden',
      'bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950',
      className
    )}>
      {/* Background Effects */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
      <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl" />

      {/* Content */}
      <div className="relative z-10 p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 mb-8 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-3">
                <Layers className="w-6 h-6 text-emerald-400" />
                Workflow Overview
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Real-time agent orchestration for {farmName}
              </p>
            </div>

            {/* Status Pills */}
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.05 }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl',
                  'bg-emerald-500/10 border border-emerald-500/20'
                )}
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">
                  {stats.active} Active
                </span>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl',
                  'bg-blue-500/10 border border-blue-500/20'
                )}
              >
                <Bot className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-400">
                  {stats.total} Total
                </span>
              </motion.div>
              {stats.completed > 0 && (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl',
                    'bg-green-500/10 border border-green-500/20'
                  )}
                >
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-green-400">
                    {stats.completed} Done
                  </span>
                </motion.div>
              )}
            </div>
          </div>

          {/* Statistics Bar */}
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span className="text-2xl font-bold text-white">{Math.round(stats.avgCpu)}%</span>
              </div>
              <span className="text-xs text-gray-400">Avg CPU</span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Database className="w-4 h-4 text-purple-400" />
                <span className="text-2xl font-bold text-white">{Math.round(stats.avgMemory)}%</span>
              </div>
              <span className="text-xs text-gray-400">Avg Memory</span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Target className="w-4 h-4 text-amber-400" />
                <span className="text-2xl font-bold text-white">{stats.totalTasks}</span>
              </div>
              <span className="text-xs text-gray-400">Total Tasks</span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-2xl font-bold text-white">{Math.round(stats.avgSuccessRate)}%</span>
              </div>
              <span className="text-xs text-gray-400">Success Rate</span>
            </div>
          </div>
        </motion.div>

        {/* Agent Grid */}
        {agents.length > 0 ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {agents.map((agent, index) => renderAgentCard(agent, index))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="p-6 bg-white/5 rounded-3xl mb-6 border border-white/10">
              <Layers className="w-12 h-12 text-gray-500" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">
              No Active Agents
            </h3>
            <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
              Launch agents to begin workflow processing. Each agent will handle tasks in parallel for maximum efficiency.
            </p>
            {onLaunchAgents && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onLaunchAgents}
                className={cn(
                  'px-6 py-3 rounded-xl',
                  'bg-gradient-to-r from-emerald-600 to-emerald-500',
                  'text-white font-medium text-sm',
                  'shadow-lg shadow-emerald-500/25',
                  'hover:shadow-xl hover:shadow-emerald-500/30',
                  'transition-all duration-200',
                  'flex items-center gap-2'
                )}
              >
                <Play className="w-4 h-4" />
                Launch Agents
              </motion.button>
            )}
          </motion.div>
        )}
      </div>

      {/* Connection Lines SVG (subtle) */}
      {agents.length > 1 && (
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          <defs>
            <linearGradient id="flowLineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="rgb(6, 182, 212)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </div>
  );
};

export default PremiumWorkflowView;
