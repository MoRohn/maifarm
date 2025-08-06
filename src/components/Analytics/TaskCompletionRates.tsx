import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import type { TaskCompletion } from '../../types/analytics';
import { formatNumber, formatPercentage } from '../../utils/format';

interface TaskCompletionRatesProps {
  tasks?: TaskCompletion[];
}

export const TaskCompletionRates: React.FC<TaskCompletionRatesProps> = ({ tasks = [] }) => {
  const taskData = tasks.length > 0 ? tasks : generateMockTaskData();
  
  const completedTasks = taskData.filter(t => t.status === 'completed').length;
  const inProgressTasks = taskData.filter(t => t.status === 'in_progress').length;
  const failedTasks = taskData.filter(t => t.status === 'failed').length;
  const totalTasks = taskData.length;
  
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const avgDuration = taskData
    .filter(t => t.duration)
    .reduce((sum, t) => sum + (t.duration || 0), 0) / completedTasks || 0;

  const statusColors = {
    completed: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
    in_progress: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
    failed: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
    pending: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30'
  };

  const recentTasks = taskData
    .sort((a, b) => (b.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0))
    .slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.9 }}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Task Completion
        </h3>
        <div className="flex items-center space-x-2">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatPercentage(completionRate)}
          </span>
          {completionRate > 90 ? (
            <TrendingUp className="w-5 h-5 text-green-500" />
          ) : completionRate < 70 ? (
            <TrendingDown className="w-5 h-5 text-red-500" />
          ) : null}
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {completedTasks}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Completed</p>
        </div>
        
        <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {inProgressTasks}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">In Progress</p>
        </div>
        
        <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mx-auto mb-1" />
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {failedTasks}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Failed</p>
        </div>
      </div>

      {/* Average Duration */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Avg Duration</span>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatDuration(avgDuration)}
          </span>
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          Recent Tasks
        </p>
        {recentTasks.map((task, index) => (
          <motion.div
            key={task.taskId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.0 + index * 0.05 }}
            className="flex items-center justify-between py-1.5"
          >
            <div className="flex items-center space-x-2 flex-1">
              <span className={clsx(
                'px-2 py-0.5 text-xs font-medium rounded-full',
                statusColors[task.status]
              )}>
                {task.status}
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                {task.taskName}
              </span>
            </div>
            {task.duration && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDuration(task.duration)}
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

function generateMockTaskData(): TaskCompletion[] {
  const now = new Date();
  const statuses: TaskCompletion['status'][] = ['completed', 'completed', 'completed', 'in_progress', 'failed'];
  const taskNames = [
    'Code Review for PR #142',
    'Bug Fix: Login Issue',
    'Feature: Dark Mode Toggle',
    'Test Suite Update',
    'Documentation Update',
    'Performance Optimization',
    'Security Patch',
    'Database Migration',
    'API Integration',
    'UI Component Refactor'
  ];

  return Array.from({ length: 20 }, (_, i) => {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const startTime = new Date(now.getTime() - Math.random() * 86400000);
    const duration = status === 'completed' ? Math.floor(Math.random() * 3600000) : undefined;
    const endTime = status === 'completed' && startTime 
      ? new Date(startTime.getTime() + (duration || 0))
      : undefined;

    return {
      taskId: `task-${i + 1}`,
      taskName: taskNames[Math.floor(Math.random() * taskNames.length)],
      startTime,
      endTime,
      duration,
      status,
      agentId: `agent-${Math.floor(Math.random() * 4) + 1}`,
      resourcesUsed: {
        cpu: Math.random() * 100,
        memory: Math.random() * 100
      },
      cost: Math.random() * 50
    };
  });
}