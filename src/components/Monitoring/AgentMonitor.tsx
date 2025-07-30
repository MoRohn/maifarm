import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Network,
  Play,
  Pause,
  RotateCw,
  AlertCircle,
  CheckCircle,
  Clock,
  MoreVertical
} from 'lucide-react';
import { clsx } from 'clsx';
import { AgentStatus } from '../../services/websocket';
import { websocketService } from '../../services/websocket';

interface AgentMonitorProps {
  agent: AgentStatus;
  farmId: string;
  className?: string;
}

export const AgentMonitor: React.FC<AgentMonitorProps> = ({ 
  agent, 
  farmId,
  className 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [resourceHistory, setResourceHistory] = useState<{
    cpu: number[];
    memory: number[];
    network: number[];
  }>({
    cpu: [],
    memory: [],
    network: []
  });

  useEffect(() => {
    // Keep history of last 20 data points
    setResourceHistory(prev => ({
      cpu: [...prev.cpu.slice(-19), agent.resources.cpu],
      memory: [...prev.memory.slice(-19), agent.resources.memory],
      network: [...prev.network.slice(-19), agent.resources.network]
    }));
  }, [agent.resources]);

  const statusColors = {
    idle: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const statusIcons = {
    idle: Clock,
    active: Activity,
    completed: CheckCircle,
    error: AlertCircle,
  };

  const StatusIcon = statusIcons[agent.status];

  const handleRestart = () => {
    websocketService.restartAgent(farmId, agent.id);
  };

  return (
    <motion.div
      layout
      className={clsx(
        'bg-white dark:bg-gray-900 rounded-apple-lg',
        'border border-gray-200 dark:border-gray-800',
        'shadow-sm hover:shadow-apple transition-all duration-300',
        className
      )}
    >
      {/* Header */}
      <div 
        className="p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <motion.div
              animate={{ rotate: agent.status === 'active' ? 360 : 0 }}
              transition={{ duration: 2, repeat: agent.status === 'active' ? Infinity : 0, ease: 'linear' }}
              className={clsx(
                'p-2 rounded-apple',
                statusColors[agent.status]
              )}
            >
              <StatusIcon className="w-5 h-5" />
            </motion.div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                {agent.name}
              </h4>
              {agent.currentTask && (
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[300px]">
                  {agent.currentTask}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Resource Indicators */}
            <div className="flex items-center space-x-4 mr-4">
              <ResourceIndicator
                icon={Cpu}
                value={agent.resources.cpu}
                label="CPU"
                color="blue"
              />
              <ResourceIndicator
                icon={HardDrive}
                value={agent.resources.memory}
                label="Memory"
                color="purple"
              />
              <ResourceIndicator
                icon={Network}
                value={agent.resources.network}
                label="Network"
                color="green"
              />
            </div>

            {/* Actions */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                handleRestart();
              }}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <RotateCw className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Progress Bar */}
        {agent.progress !== undefined && (
          <div className="mt-3">
            <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${agent.progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-primary-500 to-primary-600"
              />
            </div>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-gray-200 dark:border-gray-800"
          >
            <div className="p-4">
              {/* Resource Charts */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <ResourceChart
                  title="CPU Usage"
                  data={resourceHistory.cpu}
                  color="blue"
                />
                <ResourceChart
                  title="Memory Usage"
                  data={resourceHistory.memory}
                  color="purple"
                />
                <ResourceChart
                  title="Network I/O"
                  data={resourceHistory.network}
                  color="green"
                />
              </div>

              {/* Agent Details */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Status</span>
                  <span className={clsx(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    statusColors[agent.status]
                  )}>
                    {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Last Update</span>
                  <span className="text-gray-900 dark:text-white">
                    {new Date(agent.lastUpdate).toLocaleTimeString()}
                  </span>
                </div>
                {agent.currentTask && (
                  <div className="text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Current Task</span>
                    <p className="text-gray-900 dark:text-white mt-1">
                      {agent.currentTask}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface ResourceIndicatorProps {
  icon: LucideIcon;
  value: number;
  label: string;
  color: 'blue' | 'purple' | 'green';
}

const ResourceIndicator: React.FC<ResourceIndicatorProps> = ({
  icon: Icon,
  value,
  label,
  color
}) => {
  const colorClasses = {
    blue: 'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
    green: 'text-green-600 dark:text-green-400',
  };

  return (
    <div className="flex items-center space-x-1">
      <Icon className={clsx('w-4 h-4', colorClasses[color])} />
      <span className="text-sm font-medium text-gray-900 dark:text-white">
        {value}%
      </span>
    </div>
  );
};

interface ResourceChartProps {
  title: string;
  data: number[];
  color: 'blue' | 'purple' | 'green';
}

const ResourceChart: React.FC<ResourceChartProps> = ({ title, data, color }) => {
  const colorClasses = {
    blue: 'stroke-blue-500',
    purple: 'stroke-purple-500',
    green: 'stroke-green-500',
  };

  const max = Math.max(...data, 100);
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - (value / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-3">
      <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
        {title}
      </h5>
      <svg viewBox="0 0 100 60" className="w-full h-12">
        <polyline
          points={points}
          fill="none"
          className={clsx(colorClasses[color], 'stroke-2')}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="text-right text-xs font-medium text-gray-900 dark:text-white mt-1">
        {data[data.length - 1] || 0}%
      </div>
    </div>
  );
};