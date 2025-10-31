import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Cpu, HardDrive, Network } from 'lucide-react';
import { cn } from '@/utils/cn';
import { GlassPanel } from '../common/GlassPanel';
import { StatusIndicator } from '../common/StatusIndicator';

interface AgentLoad {
  id: string;
  name: string;
  load: number;
  activeTasks: number;
  utilization: number;
  status: 'idle' | 'active' | 'overloaded';
}

interface LoadBalancerProps {
  agents: AgentLoad[];
  strategy: 'roundRobin' | 'leastLoaded' | 'priority' | 'adaptive';
  onStrategyChange?: (strategy: string) => void;
  className?: string;
}

export const LoadBalancer: React.FC<LoadBalancerProps> = ({
  agents,
  strategy,
  onStrategyChange,
  className
}) => {
  const getUtilizationColor = (utilization: number) => {
    if (utilization < 30) return 'text-green-500';
    if (utilization < 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getProgressColor = (utilization: number) => {
    if (utilization < 30) return 'bg-green-500';
    if (utilization < 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <GlassPanel variant="card" className={cn('p-6', className)}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Agent Load Balancing
          </h3>
          
          <select
            value={strategy}
            onChange={(e) => onStrategyChange?.(e.target.value)}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"
          >
            <option value="roundRobin">Round Robin</option>
            <option value="leastLoaded">Least Loaded</option>
            <option value="priority">Priority Based</option>
            <option value="adaptive">Adaptive</option>
          </select>
        </div>

        <div className="space-y-3">
          {agents.map((agent, index) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <StatusIndicator 
                    status={agent.status === 'overloaded' ? 'error' : agent.status}
                    size="sm"
                  />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {agent.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {agent.activeTasks} active tasks
                    </p>
                  </div>
                </div>
                
                <div className={cn('text-2xl font-bold', getUtilizationColor(agent.utilization))}>
                  {agent.utilization}%
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400">CPU Load</span>
                  <span className="text-gray-900 dark:text-white">{agent.load}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                  <motion.div
                    className={cn('h-full', getProgressColor(agent.utilization))}
                    initial={{ width: 0 }}
                    animate={{ width: `${agent.utilization}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Agents</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {agents.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                {agents.filter(a => a.status === 'active').length}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Avg Load</p>
              <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                {Math.round(agents.reduce((sum, a) => sum + a.utilization, 0) / agents.length)}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
};