import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  RotateCw, 
  Trash2, 
  Settings,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Cpu,
  HardDrive,
  Zap
} from 'lucide-react';
import { clsx } from 'clsx';
import { Agent } from '@/types';
import { format } from 'date-fns';

interface AgentLifecycleProps {
  agents: Agent[];
  onStartAgent: (agentId: string) => void;
  onPauseAgent: (agentId: string) => void;
  onRestartAgent: (agentId: string) => void;
  onTerminateAgent: (agentId: string) => void;
  onConfigureAgent: (agentId: string) => void;
  className?: string;
}

const AgentCard: React.FC<{
  agent: Agent;
  onStart: () => void;
  onPause: () => void;
  onRestart: () => void;
  onTerminate: () => void;
  onConfigure: () => void;
}> = ({ agent, onStart, onPause, onRestart, onTerminate, onConfigure }) => {
  const [showDetails, setShowDetails] = useState(false);

  const statusColors: Record<string, string> = {
    idle: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    working: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    provisioning: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    starting: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    running: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    busy: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    stopping: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    stopped: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  };

  const statusIcons: Record<string, any> = {
    idle: Clock,
    working: Activity,
    completed: CheckCircle,
    error: XCircle,
    paused: Pause,
    provisioning: Settings,
    starting: Activity,
    running: Activity,
    busy: Zap,
    stopping: Pause,
    stopped: Clock,
    failed: XCircle
  };

  const StatusIcon = statusIcons[agent.status] || Clock;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2 }}
      className="bg-white dark:bg-gray-900 rounded-apple-lg shadow-apple hover:shadow-apple-lg transition-all duration-300 border border-gray-200 dark:border-gray-800"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                {agent.name}
              </h4>
              <span className={clsx(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                statusColors[agent.status]
              )}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {agent.status}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {agent.type.charAt(0).toUpperCase() + agent.type.slice(1)} Agent
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onConfigure}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Current Task */}
        {agent.currentTask && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-apple">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Current Task
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {agent.currentTask}
            </p>
          </div>
        )}

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Progress</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {agent.progress}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${agent.progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-primary-500 to-primary-600"
            />
          </div>
        </div>

        {/* Resource Usage */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-600 dark:text-gray-400">CPU</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {agent.cpu}%
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-600 dark:text-gray-400">Memory</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {agent.memory}MB
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center space-x-2">
            {agent.status === 'idle' || agent.status === 'paused' ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onStart}
                className="p-2 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-apple transition-colors"
              >
                <Play className="w-4 h-4" />
              </motion.button>
            ) : agent.status === 'working' ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onPause}
                className="p-2 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-apple transition-colors"
              >
                <Pause className="w-4 h-4" />
              </motion.button>
            ) : null}
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRestart}
              className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-apple transition-colors"
            >
              <RotateCw className="w-4 h-4" />
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onTerminate}
              className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-apple transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </motion.button>
          </div>
          
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
          >
            {showDetails ? 'Hide' : 'View'} Details
          </button>
        </div>
      </div>

      {/* Expandable Details */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-gray-200 dark:border-gray-800 overflow-hidden"
          >
            <div className="p-6 bg-gray-50 dark:bg-gray-800/50">
              <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Agent Details
              </h5>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Agent ID</dt>
                  <dd className="text-sm font-mono text-gray-900 dark:text-white">{agent.id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Type</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">{agent.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Last Update</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    {format(new Date(), 'HH:mm:ss')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600 dark:text-gray-400">Performance</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">
                    <div className="flex items-center space-x-1">
                      <Zap className="w-3 h-3 text-yellow-500" />
                      <span>High</span>
                    </div>
                  </dd>
                </div>
              </dl>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const AgentLifecycle: React.FC<AgentLifecycleProps> = ({
  agents,
  onStartAgent,
  onPauseAgent,
  onRestartAgent,
  onTerminateAgent,
  onConfigureAgent,
  className,
}) => {
  const [filter, setFilter] = useState<'all' | Agent['status']>('all');

  const filteredAgents = filter === 'all' 
    ? agents 
    : agents.filter(agent => agent.status === filter);

  const filters = [
    { key: 'all', label: 'All Agents', count: agents.length },
    { key: 'idle', label: 'Idle', count: agents.filter(a => a.status === 'idle').length },
    { key: 'working', label: 'Working', count: agents.filter(a => a.status === 'working').length },
    { key: 'paused', label: 'Paused', count: agents.filter(a => a.status === 'paused').length },
    { key: 'completed', label: 'Completed', count: agents.filter(a => a.status === 'completed').length },
    { key: 'error', label: 'Error', count: agents.filter(a => a.status === 'error').length },
  ];

  return (
    <div className={clsx('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          Agent Lifecycle Management
        </h3>
        <div className="flex items-center space-x-2">
          {filters.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className={clsx(
                'px-3 py-1.5 rounded-apple text-sm font-medium transition-colors',
                filter === key
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              )}
            >
              {label}
              {count > 0 && (
                <span className="ml-1.5 text-xs">({count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredAgents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onStart={() => onStartAgent(agent.id)}
              onPause={() => onPauseAgent(agent.id)}
              onRestart={() => onRestartAgent(agent.id)}
              onTerminate={() => onTerminateAgent(agent.id)}
              onConfigure={() => onConfigureAgent(agent.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {filteredAgents.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            No agents found matching the current filter
          </p>
        </motion.div>
      )}
    </div>
  );
};