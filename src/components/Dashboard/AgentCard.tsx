import React from 'react';
import { motion } from 'framer-motion';
import { 
  Bot, 
  Activity, 
  Cpu, 
  HardDrive,
  Clock,
  Zap,
  Pause,
  Play,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { Agent } from '../../types';

interface AgentCardProps {
  agent: Agent;
  onSelect?: (agent: Agent) => void;
  onAction?: (agent: Agent, action: 'pause' | 'resume' | 'restart') => void;
  className?: string;
}

export const AgentCard: React.FC<AgentCardProps> = ({ 
  agent, 
  onSelect, 
  onAction,
  className 
}) => {
  const statusColors: Record<string, string> = {
    idle: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    working: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    provisioning: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    starting: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    busy: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    stopping: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    stopped: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  };

  const typeIcons: Record<string, React.ReactElement> = {
    builder: <Bot className="w-5 h-5" />,
    reviewer: <Activity className="w-5 h-5" />,
    tester: <Zap className="w-5 h-5" />,
    documenter: <Clock className="w-5 h-5" />,
    custom: <Bot className="w-5 h-5" />
  };
  
  const agentIcon = typeIcons[agent.type] || <Bot className="w-5 h-5" />;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect?.(agent)}
      className={clsx(
        'bg-white dark:bg-gray-900 rounded-apple-lg p-4 shadow-apple border border-gray-200 dark:border-gray-800 cursor-pointer transition-all duration-200 hover:shadow-apple-lg',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-apple">
            {agentIcon}
          </div>
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              {agent.name}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {agent.type} Agent
            </p>
          </div>
        </div>
        <span className={clsx(
          'px-2.5 py-1 rounded-full text-xs font-medium capitalize',
          statusColors[agent.status]
        )}>
          {agent.status}
        </span>
      </div>

      {/* Current Task */}
      {agent.currentTask && (
        <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-apple">
          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
            {agent.currentTask}
          </p>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">Progress</span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {agent.progress}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <motion.div
            className="bg-primary-600 h-1.5 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${agent.progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Resource Usage */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-gray-400" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">CPU</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {agent.cpu}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-1">
              <div
                className={clsx(
                  'h-1 rounded-full transition-all duration-300',
                  agent.cpu > 80 ? 'bg-red-500' : agent.cpu > 60 ? 'bg-yellow-500' : 'bg-green-500'
                )}
                style={{ width: `${agent.cpu}%` }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <HardDrive className="w-4 h-4 text-gray-400" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">Memory</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {agent.memory}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-1">
              <div
                className={clsx(
                  'h-1 rounded-full transition-all duration-300',
                  agent.memory > 80 ? 'bg-red-500' : agent.memory > 60 ? 'bg-yellow-500' : 'bg-green-500'
                )}
                style={{ width: `${agent.memory}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Last active: {new Date(agent.lastActive).toLocaleTimeString()}
        </span>
        <div className="flex items-center space-x-1">
          {agent.status === 'working' && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(agent, 'pause');
              }}
              className="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              <Pause className="w-4 h-4" />
            </motion.button>
          )}
          {agent.status === 'paused' && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(agent, 'resume');
              }}
              className="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              <Play className="w-4 h-4" />
            </motion.button>
          )}
          {agent.status === 'error' && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(agent, 'restart');
              }}
              className="p-1.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
            >
              <AlertCircle className="w-4 h-4" />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};