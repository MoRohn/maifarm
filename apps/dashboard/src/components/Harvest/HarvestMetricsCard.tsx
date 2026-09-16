import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  Cpu, 
  Activity,
  Zap,
  Award,
  Target
} from 'lucide-react';
import { clsx } from 'clsx';

interface HarvestMetric {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
}

interface HarvestMetricsCardProps {
  metrics: {
    tasksCompleted: number;
    totalTasks: number;
    successRate: number;
    avgCompletionTime: number;
    resourceUtilization: number;
    qualityScore: number;
    efficiency: number;
    activeAgents: number;
  };
  className?: string;
}

export const HarvestMetricsCard: React.FC<HarvestMetricsCardProps> = ({
  metrics,
  className
}) => {
  const metricsData: HarvestMetric[] = [
    {
      label: 'Task Completion',
      value: `${metrics.tasksCompleted}/${metrics.totalTasks}`,
      change: metrics.successRate,
      icon: CheckCircle,
      color: 'green',
      trend: metrics.successRate >= 80 ? 'up' : metrics.successRate >= 50 ? 'neutral' : 'down'
    },
    {
      label: 'Success Rate',
      value: `${metrics.successRate.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'blue',
      trend: metrics.successRate >= 90 ? 'up' : 'neutral'
    },
    {
      label: 'Avg Completion',
      value: `${metrics.avgCompletionTime.toFixed(1)}s`,
      icon: Clock,
      color: 'purple',
      trend: metrics.avgCompletionTime <= 30 ? 'up' : 'down'
    },
    {
      label: 'Resource Usage',
      value: `${metrics.resourceUtilization.toFixed(0)}%`,
      icon: Cpu,
      color: 'orange',
      trend: metrics.resourceUtilization <= 70 ? 'up' : 'down'
    },
    {
      label: 'Quality Score',
      value: `${metrics.qualityScore.toFixed(1)}/10`,
      icon: Award,
      color: 'indigo',
      trend: metrics.qualityScore >= 8 ? 'up' : 'neutral'
    },
    {
      label: 'Efficiency',
      value: `${metrics.efficiency.toFixed(0)}%`,
      icon: Zap,
      color: 'yellow',
      trend: metrics.efficiency >= 75 ? 'up' : 'neutral'
    },
    {
      label: 'Active Agents',
      value: metrics.activeAgents,
      icon: Activity,
      color: 'teal',
      trend: 'neutral'
    },
    {
      label: 'Target Achievement',
      value: `${((metrics.tasksCompleted / metrics.totalTasks) * 100).toFixed(0)}%`,
      icon: Target,
      color: 'pink',
      trend: metrics.tasksCompleted >= metrics.totalTasks * 0.8 ? 'up' : 'down'
    }
  ];

  const getColorClasses = (color: string, trend?: 'up' | 'down' | 'neutral') => {
    const colors: Record<string, string> = {
      green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
      pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className={clsx(
      'bg-white dark:bg-gray-900 rounded-apple-lg shadow-sm p-6',
      className
    )}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Performance Metrics
        </h3>
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="text-gray-400"
        >
          <Activity className="w-5 h-5" />
        </motion.div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metricsData.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="relative"
            >
              <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className={clsx(
                    'p-2 rounded-apple',
                    getColorClasses(metric.color, metric.trend)
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {metric.trend && (
                    <span className={clsx(
                      'text-xs px-2 py-1 rounded-full',
                      metric.trend === 'up' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      metric.trend === 'down' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                    )}>
                      {metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→'}
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                    {metric.label}
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {metric.value}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};