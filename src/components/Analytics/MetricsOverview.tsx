import React from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Cpu,
  HardDrive,
  Zap,
  DollarSign
} from 'lucide-react';
import { AggregatedMetrics } from '../../types/analytics';

interface MetricsOverviewProps {
  metrics: AggregatedMetrics | null;
  className?: string;
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({ metrics, className = '' }) => {
  if (!metrics) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Total Farms',
      value: metrics.totalFarms,
      subtitle: `${metrics.activeFarms} active`,
      icon: <Activity className="w-5 h-5" />,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      trend: metrics.farmGrowth
    },
    {
      title: 'Active Agents',
      value: metrics.activeAgents,
      subtitle: `${metrics.totalAgents} total`,
      icon: <Users className="w-5 h-5" />,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      trend: metrics.agentUtilization
    },
    {
      title: 'Task Success Rate',
      value: `${(metrics.taskSuccessRate ?? 0).toFixed(1)}%`,
      subtitle: `${metrics.completedTasks} completed`,
      icon: <CheckCircle className="w-5 h-5" />,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      trend: 5.2
    },
    {
      title: 'Avg Response Time',
      value: `${metrics.avgResponseTime ?? 0}ms`,
      subtitle: 'Last hour',
      icon: <Clock className="w-5 h-5" />,
      color: 'from-amber-500 to-amber-600',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      trend: -12.3
    },
    {
      title: 'CPU Usage',
      value: `${(metrics.cpuUsage ?? 0).toFixed(1)}%`,
      subtitle: 'System average',
      icon: <Cpu className="w-5 h-5" />,
      color: 'from-cyan-500 to-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-900/20'
    },
    {
      title: 'Memory Usage',
      value: `${(metrics.memoryUsage ?? 0).toFixed(1)}%`,
      subtitle: `${((metrics.memoryUsage ?? 0) * 16 / 100).toFixed(1)}GB / 16GB`,
      icon: <HardDrive className="w-5 h-5" />,
      color: 'from-indigo-500 to-indigo-600',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20'
    },
    {
      title: 'Error Rate',
      value: `${metrics.errorRate.toFixed(2)}%`,
      subtitle: `${metrics.totalErrors ?? 0} errors`,
      icon: <AlertCircle className="w-5 h-5" />,
      color: 'from-red-500 to-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      trend: metrics.errorRate > 1 ? 15.2 : -5.1
    },
    {
      title: 'Est. Monthly Cost',
      value: `$${(metrics.estimatedCost ?? 0).toFixed(2)}`,
      subtitle: 'Based on usage',
      icon: <DollarSign className="w-5 h-5" />,
      color: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      trend: -8.7
    }
  ];

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className={`${card.bgColor} backdrop-blur-xl rounded-xl p-6 
                     border border-gray-200/50 dark:border-gray-700/50
                     hover:shadow-lg transition-all duration-300 group`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className={`p-2.5 rounded-lg bg-gradient-to-br ${card.color} text-white
                          transform group-hover:scale-110 transition-transform duration-300`}>
              {card.icon}
            </div>
            {card.trend !== undefined && (
              <div className={`flex items-center gap-1 text-xs font-medium ${
                card.trend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                <TrendingUp className={`w-3 h-3 ${card.trend < 0 ? 'rotate-180' : ''}`} />
                {Math.abs(card.trend).toFixed(1)}%
              </div>
            )}
          </div>
          
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              {card.title}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {card.value}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {card.subtitle}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
};