import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown,
  Activity,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart3,
  PieChart,
  Zap,
  Database,
  Cpu,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface ExecutiveDashboardProps {
  farmId: string;
  farmName: string;
  metrics?: {
    totalAgents: number;
    activeAgents: number;
    tasksCompleted: number;
    successRate: number;
    avgResponseTime: number;
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
  };
  className?: string;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  farmId,
  farmName,
  metrics = {
    totalAgents: 5,
    activeAgents: 3,
    tasksCompleted: 127,
    successRate: 94.5,
    avgResponseTime: 1250,
    cpuUsage: 65,
    memoryUsage: 72,
    uptime: 3600000
  },
  className
}) => {
  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const kpiCards = [
    {
      title: 'Active Agents',
      value: `${metrics.activeAgents}/${metrics.totalAgents}`,
      change: '+2',
      trend: 'up',
      icon: Users,
      color: 'blue'
    },
    {
      title: 'Tasks Completed',
      value: metrics.tasksCompleted,
      change: '+23%',
      trend: 'up',
      icon: CheckCircle,
      color: 'emerald'
    },
    {
      title: 'Success Rate',
      value: `${metrics.successRate}%`,
      change: '+1.2%',
      trend: 'up',
      icon: TrendingUp,
      color: 'green'
    },
    {
      title: 'Avg Response',
      value: formatResponseTime(metrics.avgResponseTime),
      change: '-15%',
      trend: 'down',
      icon: Zap,
      color: 'amber'
    }
  ];

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Executive Dashboard
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Real-time performance metrics and KPIs
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          const isPositiveTrend = kpi.trend === 'up';
          const TrendIcon = isPositiveTrend ? ArrowUp : ArrowDown;
          
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={cn(
                'relative group',
                'backdrop-blur-xl bg-white/80 dark:bg-gray-900/80',
                'border border-gray-200/50 dark:border-gray-700/50',
                'rounded-2xl p-6',
                'shadow-sm hover:shadow-lg',
                'transition-all duration-300'
              )}
            >
              {/* Icon */}
              <div className="flex items-center justify-between mb-4">
                <div className={cn(
                  'p-2.5 rounded-xl',
                  kpi.color === 'blue' && 'bg-blue-100 dark:bg-blue-900/30',
                  kpi.color === 'emerald' && 'bg-emerald-100 dark:bg-emerald-900/30',
                  kpi.color === 'green' && 'bg-green-100 dark:bg-green-900/30',
                  kpi.color === 'amber' && 'bg-amber-100 dark:bg-amber-900/30'
                )}>
                  <Icon className={cn(
                    'w-5 h-5',
                    kpi.color === 'blue' && 'text-blue-600 dark:text-blue-400',
                    kpi.color === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
                    kpi.color === 'green' && 'text-green-600 dark:text-green-400',
                    kpi.color === 'amber' && 'text-amber-600 dark:text-amber-400'
                  )} />
                </div>
                
                {/* Trend Badge */}
                <div className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium',
                  isPositiveTrend
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                )}>
                  <TrendIcon className="w-3 h-3" />
                  <span>{kpi.change}</span>
                </div>
              </div>

              {/* Metric */}
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {kpi.title}
                </p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {kpi.value}
                </p>
              </div>

              {/* Subtle hover effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </motion.div>
          );
        })}
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Resources */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className={cn(
            'backdrop-blur-xl bg-white/80 dark:bg-gray-900/80',
            'border border-gray-200/50 dark:border-gray-700/50',
            'rounded-2xl p-6',
            'shadow-sm'
          )}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              System Resources
            </h3>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>

          <div className="space-y-4">
            {/* CPU Usage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">CPU Usage</span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {metrics.cpuUsage}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${metrics.cpuUsage}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={cn(
                    'h-full',
                    metrics.cpuUsage < 60 && 'bg-gradient-to-r from-blue-500 to-cyan-500',
                    metrics.cpuUsage >= 60 && metrics.cpuUsage < 80 && 'bg-gradient-to-r from-amber-500 to-orange-500',
                    metrics.cpuUsage >= 80 && 'bg-gradient-to-r from-red-500 to-pink-500'
                  )}
                />
              </div>
            </div>

            {/* Memory Usage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Memory Usage</span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {metrics.memoryUsage}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${metrics.memoryUsage}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                  className={cn(
                    'h-full',
                    metrics.memoryUsage < 60 && 'bg-gradient-to-r from-purple-500 to-pink-500',
                    metrics.memoryUsage >= 60 && metrics.memoryUsage < 80 && 'bg-gradient-to-r from-amber-500 to-orange-500',
                    metrics.memoryUsage >= 80 && 'bg-gradient-to-r from-red-500 to-pink-500'
                  )}
                />
              </div>
            </div>

            {/* Uptime */}
            <div className="pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">System Uptime</span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatUptime(metrics.uptime)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Task Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className={cn(
            'backdrop-blur-xl bg-white/80 dark:bg-gray-900/80',
            'border border-gray-200/50 dark:border-gray-700/50',
            'rounded-2xl p-6',
            'shadow-sm'
          )}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Task Analytics
            </h3>
            <PieChart className="w-5 h-5 text-gray-400" />
          </div>

          <div className="space-y-4">
            {/* Success/Failure Breakdown */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Successful Tasks
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.round(metrics.tasksCompleted * (metrics.successRate / 100))} tasks
                  </p>
                </div>
              </div>
              <span className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                {metrics.successRate}%
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Failed Tasks
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.round(metrics.tasksCompleted * ((100 - metrics.successRate) / 100))} tasks
                  </p>
                </div>
              </div>
              <span className="text-xl font-semibold text-amber-600 dark:text-amber-400">
                {(100 - metrics.successRate).toFixed(1)}%
              </span>
            </div>

            {/* Performance Score */}
            <div className="pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Overall Performance</span>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={cn(
                          'w-2 h-8 rounded-sm',
                          i <= Math.round(metrics.successRate / 20)
                            ? 'bg-gradient-to-t from-emerald-500 to-emerald-400'
                            : 'bg-gray-200 dark:bg-gray-700'
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {Math.round(metrics.successRate / 20)}/5
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};