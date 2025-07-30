import React from 'react';
import { motion } from 'framer-motion';
import { 
  MoreVertical, 
  Pause, 
  Play, 
  RotateCw,
  Users,
  Activity,
  Clock,
  ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmStatus } from '../../services/websocket';
import { formatDistanceToNow } from 'date-fns';

interface FarmCardProps {
  farm: FarmStatus;
  className?: string;
}

export const FarmCard: React.FC<FarmCardProps> = ({ farm, className }) => {
  const statusColors = {
    preparing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    running: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const progressPercentage = farm.metrics.totalTasks > 0
    ? (farm.metrics.completedTasks / farm.metrics.totalTasks) * 100
    : 0;

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={clsx(
        'bg-white dark:bg-gray-900 rounded-apple-lg shadow-apple hover:shadow-apple-lg transition-all duration-300',
        'border border-gray-200 dark:border-gray-800',
        className
      )}
    >
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {farm.name}
            </h4>
            <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
              <span className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{farm.agents.length} agents</span>
              </span>
              <span className="flex items-center space-x-1">
                <Clock className="w-4 h-4" />
                <span>{formatDistanceToNow(farm.startTime, { addSuffix: true })}</span>
              </span>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <MoreVertical className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Status Badge */}
        <div className="flex items-center justify-between mb-4">
          <span className={clsx(
            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            statusColors[farm.status]
          )}>
            {farm.status.charAt(0).toUpperCase() + farm.status.slice(1)}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {farm.metrics.efficiency}% efficiency
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Progress</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {Math.round(progressPercentage)}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-primary-500 to-primary-600"
            />
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.metrics.completedTasks}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.metrics.totalTasks - farm.metrics.completedTasks - farm.metrics.failedTasks}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {farm.metrics.failedTasks}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Failed</div>
          </div>
        </div>

        {/* Active Agents Preview */}
        <div className="space-y-2">
          {farm.agents.slice(0, 2).map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-apple"
            >
              <div className="flex items-center space-x-2">
                <div className={clsx(
                  'w-2 h-2 rounded-full',
                  agent.status === 'active' ? 'bg-green-500' : 
                  agent.status === 'error' ? 'bg-red-500' : 'bg-gray-400'
                )} />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {agent.name}
                </span>
              </div>
              {agent.currentTask && (
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                  {agent.currentTask}
                </span>
              )}
            </div>
          ))}
          {farm.agents.length > 2 && (
            <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
              +{farm.agents.length - 2} more agents
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800 rounded-b-apple-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {farm.status === 'running' ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-apple transition-colors"
              >
                <Pause className="w-4 h-4" />
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-apple transition-colors"
              >
                <Play className="w-4 h-4" />
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-apple transition-colors"
            >
              <RotateCw className="w-4 h-4" />
            </motion.button>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center space-x-1 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            <span>View Details</span>
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};