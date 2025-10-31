import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  Activity,
  Users,
  Clock,
  Zap,
  Target,
  Award
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest } from '@/types/harvest';

interface HarvestAnalyticsProps {
  harvest: Harvest;
}

export const HarvestAnalytics: React.FC<HarvestAnalyticsProps> = ({ harvest }) => {
  // Calculate performance metrics
  const tasksPerMinute = harvest.summary.duration > 60 
    ? (harvest.summary.completedTasks / (harvest.summary.duration / 60)).toFixed(1)
    : harvest.summary.completedTasks;

  const agentPerformance = (harvest.results && harvest.results.length > 0) 
    ? harvest.results.reduce((acc, result) => {
        if (!acc[result.agentName]) {
          acc[result.agentName] = {
            tasks: 0,
            successes: 0,
            totalTime: 0,
            avgTime: 0
          };
        }
        acc[result.agentName].tasks++;
        if (result.success) acc[result.agentName].successes++;
        acc[result.agentName].totalTime += result.processingTime;
        return acc;
      }, {} as Record<string, any>)
    : {};

  // Calculate averages
  Object.keys(agentPerformance).forEach(agent => {
    const perf = agentPerformance[agent];
    perf.avgTime = (perf.totalTime / perf.tasks).toFixed(1);
    perf.successRate = ((perf.successes / perf.tasks) * 100).toFixed(0);
  });

  // Sort agents by performance
  const topAgents = Object.entries(agentPerformance)
    .sort((a: any, b: any) => b[1].successRate - a[1].successRate)
    .slice(0, 3);

  const metrics = [
    {
      icon: Activity,
      label: 'Tasks/Minute',
      value: tasksPerMinute,
      trend: '+12%',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      icon: Zap,
      label: 'Efficiency Score',
      value: `${harvest.summary.efficiency}%`,
      trend: harvest.summary.efficiency > 85 ? 'Excellent' : 'Good',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30'
    },
    {
      icon: Target,
      label: 'Success Rate',
      value: `${harvest.summary.totalTasks > 0 ? Math.round((harvest.summary.completedTasks / harvest.summary.totalTasks) * 100) : 0}%`,
      trend: harvest.summary.failedTasks === 0 ? 'Perfect' : `${harvest.summary.failedTasks} failed`,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      icon: Users,
      label: 'Active Agents',
      value: harvest.results && harvest.results.length > 0 
        ? new Set(harvest.results.map(r => r.agentId)).size 
        : 0,
      trend: 'Participated',
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Performance Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-900 rounded-apple-lg p-5 border border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={clsx('p-2 rounded-apple', metric.bgColor)}>
                <metric.icon className={clsx('w-5 h-5', metric.color)} />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {metric.trend}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {metric.value}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {metric.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Task Distribution Chart */}
      {harvest.results && harvest.results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-gray-600 dark:text-gray-400" />
              Task Distribution by Type
            </h3>
          </div>
          
          <div className="space-y-3">
            {Object.entries(
              harvest.results.reduce((acc, result) => {
                acc[result.taskType] = (acc[result.taskType] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([type, count]) => {
              const percentage = (count / harvest.results.length) * 100;
            return (
              <div key={type}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {count} tasks ({percentage.toFixed(0)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-600"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
      )}

      {/* Top Performing Agents */}
      {topAgents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Award className="w-5 h-5 mr-2 text-gray-600 dark:text-gray-400" />
              Top Performing Agents
            </h3>
          </div>
          
          <div className="space-y-4">
            {topAgents.map(([agentName, stats]: [string, any], index) => (
            <motion.div
              key={agentName}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 + index * 0.1 }}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-apple"
            >
              <div className="flex items-center space-x-3">
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold',
                  index === 0 ? 'bg-amber-500' :
                  index === 1 ? 'bg-gray-400' :
                  'bg-orange-600'
                )}>
                  {index + 1}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {agentName}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {stats.tasks} tasks • {stats.avgTime}s avg
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {stats.successRate}%
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Success Rate
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
      )}

      {/* Time Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-apple-lg p-6 border border-primary-200 dark:border-primary-800"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Time Efficiency Analysis
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This harvest completed {harvest.summary.efficiency > 85 ? 'ahead of' : 'within'} schedule
            </p>
            <div className="mt-3 flex items-center space-x-4">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Total Duration</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {harvest.summary.duration ? `${Math.floor(harvest.summary.duration / 60)}m ${harvest.summary.duration % 60}s` : '0m 0s'}
                </p>
              </div>
              <div className="w-px h-12 bg-gray-300 dark:bg-gray-700" />
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Avg Task Time</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {(harvest.summary.duration / harvest.summary.completedTasks).toFixed(1)}s
                </p>
              </div>
            </div>
          </div>
          <Clock className="w-12 h-12 text-primary-600 dark:text-primary-400 opacity-20" />
        </div>
      </motion.div>
    </div>
  );
};