import React from 'react';
import { motion } from 'framer-motion';
import { Users, TrendingUp, CheckCircle, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import type { AgentPerformanceMetric } from '../../types/analytics';
import { formatPercentage } from '../../utils/format';

interface AgentEfficiencyMetricsProps {
  agents?: AgentPerformanceMetric[];
  detailed?: boolean;
}

export const AgentEfficiencyMetrics: React.FC<AgentEfficiencyMetricsProps> = ({ 
  agents = [],
  detailed = false 
}) => {
  const agentData = agents.length > 0 ? agents : generateMockAgentData();
  
  const avgSuccessRate = agentData.reduce((sum, a) => sum + a.successRate, 0) / agentData.length;
  const avgResponseTime = agentData.reduce((sum, a) => sum + a.averageResponseTime, 0) / agentData.length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.8 }}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Agent Efficiency
        </h3>
        <Users className="w-5 h-5 text-gray-400" />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Success Rate</span>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
            {formatPercentage(avgSuccessRate)}
          </p>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Avg Response</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
            {avgResponseTime.toFixed(0)}ms
          </p>
        </div>
      </div>

      {/* Agent List */}
      <div className="space-y-3">
        {agentData.slice(0, detailed ? undefined : 3).map((agent, index) => (
          <motion.div
            key={agent.agentId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.9 + index * 0.1 }}
            className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
          >
            <div className="flex items-center space-x-3">
              <div className={clsx(
                'w-2 h-2 rounded-full',
                agent.successRate >= 90 ? 'bg-green-500' :
                agent.successRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'
              )} />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {agent.agentName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {agent.tasksCompleted} files created, {agent.tasksInProgress} in progress
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {formatPercentage(agent.successRate)}
                </span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {agent.averageResponseTime.toFixed(0)}ms
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {!detailed && agentData.length > 3 && (
        <button className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline">
          View all {agentData.length} agents →
        </button>
      )}
    </motion.div>
  );
};

function generateMockAgentData(): AgentPerformanceMetric[] {
  return [
    {
      agentId: 'agent-1',
      agentName: 'Code Reviewer Alpha',
      tasksCompleted: 145,
      tasksInProgress: 3,
      tasksFailed: 2,
      averageResponseTime: 1250,
      successRate: 96.7,
      lastActive: new Date(),
      resourceUsage: {
        cpu: 45,
        memory: 62,
        storage: 30,
        network: 25,
        timestamp: new Date()
      },
      costMetrics: {
        total: 125.50,
        compute: 75.30,
        storage: 15.20,
        network: 10.00,
        api: 25.00,
        period: 'daily',
        currency: 'USD'
      }
    },
    {
      agentId: 'agent-2',
      agentName: 'Bug Hunter Beta',
      tasksCompleted: 89,
      tasksInProgress: 5,
      tasksFailed: 6,
      averageResponseTime: 2100,
      successRate: 89.0,
      lastActive: new Date(),
      resourceUsage: {
        cpu: 65,
        memory: 70,
        storage: 40,
        network: 30,
        timestamp: new Date()
      },
      costMetrics: {
        total: 98.75,
        compute: 55.50,
        storage: 12.25,
        network: 8.00,
        api: 23.00,
        period: 'daily',
        currency: 'USD'
      }
    },
    {
      agentId: 'agent-3',
      agentName: 'Test Runner Gamma',
      tasksCompleted: 234,
      tasksInProgress: 8,
      tasksFailed: 8,
      averageResponseTime: 850,
      successRate: 93.6,
      lastActive: new Date(),
      resourceUsage: {
        cpu: 55,
        memory: 48,
        storage: 25,
        network: 35,
        timestamp: new Date()
      },
      costMetrics: {
        total: 156.25,
        compute: 85.00,
        storage: 20.25,
        network: 15.00,
        api: 36.00,
        period: 'daily',
        currency: 'USD'
      }
    },
    {
      agentId: 'agent-4',
      agentName: 'Feature Builder Delta',
      tasksCompleted: 67,
      tasksInProgress: 2,
      tasksFailed: 3,
      averageResponseTime: 3500,
      successRate: 93.1,
      lastActive: new Date(),
      resourceUsage: {
        cpu: 70,
        memory: 75,
        storage: 50,
        network: 40,
        timestamp: new Date()
      },
      costMetrics: {
        total: 185.00,
        compute: 95.00,
        storage: 25.00,
        network: 20.00,
        api: 45.00,
        period: 'daily',
        currency: 'USD'
      }
    }
  ];
}