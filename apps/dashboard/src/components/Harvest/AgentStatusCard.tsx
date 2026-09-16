import React from 'react';
import { motion } from 'framer-motion';
import { 
  Activity, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  TrendingUp,
  Zap,
  BarChart3,
  GitBranch
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface AgentStatusCardProps {
  agentId: number;
  agentName?: string;
  status: 'initializing' | 'active' | 'processing' | 'idle' | 'error' | 'completed';
  metrics?: {
    tasksCompleted: number;
    successRate: number;
    avgResponseTime: number;
    lastActive?: Date;
  };
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}

export const AgentStatusCard: React.FC<AgentStatusCardProps> = ({
  agentId,
  agentName,
  status,
  metrics,
  compact = false,
  onClick,
  className
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'active':
      case 'processing':
        return {
          icon: Activity,
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-50 dark:bg-blue-950/30',
          border: 'border-blue-200 dark:border-blue-800',
          pulse: true
        };
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'text-emerald-600 dark:text-emerald-400',
          bg: 'bg-emerald-50 dark:bg-emerald-950/30',
          border: 'border-emerald-200 dark:border-emerald-800',
          pulse: false
        };
      case 'error':
        return {
          icon: AlertCircle,
          color: 'text-red-600 dark:text-red-400',
          bg: 'bg-red-50 dark:bg-red-950/30',
          border: 'border-red-200 dark:border-red-800',
          pulse: false
        };
      case 'idle':
        return {
          icon: Clock,
          color: 'text-gray-500 dark:text-gray-400',
          bg: 'bg-gray-50 dark:bg-gray-950/30',
          border: 'border-gray-200 dark:border-gray-800',
          pulse: false
        };
      default:
        return {
          icon: Zap,
          color: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-50 dark:bg-amber-950/30',
          border: 'border-amber-200 dark:border-amber-800',
          pulse: true
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (compact) {
    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={cn(
          'relative group cursor-pointer',
          'flex items-center gap-3 p-3',
          'backdrop-blur-xl bg-white/80 dark:bg-gray-900/80',
          'border border-gray-200/50 dark:border-gray-700/50',
          'rounded-xl shadow-sm hover:shadow-md',
          'transition-all duration-200',
          className
        )}
      >
        <div className={cn(
          'flex items-center justify-center w-10 h-10 rounded-lg',
          config.bg,
          'border',
          config.border
        )}>
          <StatusIcon className={cn('w-5 h-5', config.color)} />
          {config.pulse && (
            <div className="absolute w-2 h-2 -top-0.5 -right-0.5">
              <div className="w-full h-full bg-blue-500 rounded-full animate-pulse" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {agentName || `Agent-${String(agentId + 1).padStart(2, '0')}`}
          </p>
          <p className={cn('text-xs', config.color)}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </p>
        </div>
        {metrics && (
          <div className="text-right">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {metrics.tasksCompleted} tasks
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {metrics.successRate}% success
            </p>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={cn(
        'relative group cursor-pointer',
        'backdrop-blur-xl bg-white/80 dark:bg-gray-900/80',
        'border border-gray-200/50 dark:border-gray-700/50',
        'rounded-2xl p-6',
        'shadow-sm hover:shadow-xl',
        'transition-all duration-300',
        className
      )}
    >
      {/* Glass overlay */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {agentName || `Agent-${String(agentId + 1).padStart(2, '0')}`}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <StatusIcon className={cn('w-4 h-4', config.color)} />
            <span className={cn('text-sm font-medium', config.color)}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            {config.pulse && (
              <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
            )}
          </div>
        </div>
        <div className="px-2.5 py-1 bg-gray-100/50 dark:bg-gray-800/50 rounded-lg">
          <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
            ID: {String(agentId + 1).padStart(3, '0')}
          </span>
        </div>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="space-y-3">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Task Progress</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {metrics.tasksCompleted} completed
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(metrics.tasksCompleted * 10, 100)}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Success</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {metrics.successRate}%
              </p>
            </div>
            <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <Zap className="w-4 h-4 text-amber-500 mx-auto mb-1" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Avg Time</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatResponseTime(metrics.avgResponseTime)}
              </p>
            </div>
            <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <BarChart3 className="w-4 h-4 text-blue-500 mx-auto mb-1" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Efficiency</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {Math.round((metrics.successRate * metrics.tasksCompleted) / 10)}%
              </p>
            </div>
          </div>

          {/* Last Active */}
          {metrics.lastActive && (
            <div className="pt-3 border-t border-gray-200/50 dark:border-gray-700/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last active: {new Date(metrics.lastActive).toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};