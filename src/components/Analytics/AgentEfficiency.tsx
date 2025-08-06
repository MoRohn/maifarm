import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Activity, TrendingUp, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { BarChart } from './Charts/BarChart';
import { useWebSocket } from '../../hooks/useWebSocket';

interface AgentMetrics {
  agentId: string;
  agentName: string;
  tasksCompleted: number;
  tasksTotal: number;
  successRate: number;
  averageResponseTime: number;
  errorRate: number;
  costPerTask: number;
  efficiency: number;
  lastActive: Date;
}

interface AgentEfficiencyProps {
  timeRange?: string;
  className?: string;
}

export const AgentEfficiency: React.FC<AgentEfficiencyProps> = ({ 
  timeRange = '24h',
  className = '' 
}) => {
  const [agents, setAgents] = useState<AgentMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'efficiency' | 'tasks' | 'successRate'>('efficiency');
  
  const { socket, connected } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  useEffect(() => {
    loadAgentData();
    
    // Subscribe to real-time updates
    if (socket && connected) {
      socket.emit('analytics:subscribe', { metrics: ['efficiency'] });
      
      socket.on('analytics:update', (data: any) => {
        if (data.type === 'efficiency') {
          setAgents(data.data);
        }
      });
      
      return () => {
        socket.emit('analytics:unsubscribe', { metrics: ['efficiency'] });
        socket.off('analytics:update');
      };
    }
  }, [socket, connected, timeRange]);

  const loadAgentData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics/agent-efficiency?timeRange=${timeRange}`);
      const data = await response.json();
      
      if (data.success) {
        setAgents(data.data || []);
      }
    } catch (error) {
      console.error('Error loading agent data:', error);
      // Use mock data for development
      setAgents(getMockAgentData());
    } finally {
      setLoading(false);
    }
  };

  const getMockAgentData = (): AgentMetrics[] => {
    return Array.from({ length: 5 }, (_, i) => ({
      agentId: `agent-${i + 1}`,
      agentName: `Agent ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'][i]}`,
      tasksCompleted: Math.floor(Math.random() * 100 + 50),
      tasksTotal: Math.floor(Math.random() * 150 + 100),
      successRate: 75 + Math.random() * 20,
      averageResponseTime: Math.random() * 10 + 2,
      errorRate: Math.random() * 10,
      costPerTask: Math.random() * 0.5 + 0.1,
      efficiency: Math.random() * 0.9 + 0.1,
      lastActive: new Date(Date.now() - Math.random() * 3600000)
    }));
  };

  const sortedAgents = [...agents].sort((a, b) => {
    switch (sortBy) {
      case 'efficiency':
        return b.efficiency - a.efficiency;
      case 'tasks':
        return b.tasksCompleted - a.tasksCompleted;
      case 'successRate':
        return b.successRate - a.successRate;
      default:
        return 0;
    }
  });

  const topAgents = sortedAgents.slice(0, 5);
  
  // Prepare data for bar chart
  const barChartData = topAgents.map(agent => ({
    label: agent.agentName,
    value: agent.efficiency * 100
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-6 text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Active Agents</p>
              <p className="text-3xl font-bold mt-1">{agents.length}</p>
            </div>
            <Users className="w-8 h-8 opacity-80" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-emerald-500 to-green-500 rounded-xl p-6 text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm">Avg Success Rate</p>
              <p className="text-3xl font-bold mt-1">
                {agents.length > 0 
                  ? `${(agents.reduce((sum, a) => sum + a.successRate, 0) / agents.length).toFixed(1)}%`
                  : '0%'}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 opacity-80" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl p-6 text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Total Tasks</p>
              <p className="text-3xl font-bold mt-1">
                {agents.reduce((sum, a) => sum + a.tasksCompleted, 0).toLocaleString()}
              </p>
            </div>
            <Activity className="w-8 h-8 opacity-80" />
          </div>
        </motion.div>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Agent Performance</h3>
        <div className="flex space-x-2">
          {(['efficiency', 'tasks', 'successRate'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                sortBy === option
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {option === 'efficiency' ? 'Efficiency' :
               option === 'tasks' ? 'Tasks' : 'Success Rate'}
            </button>
          ))}
        </div>
      </div>

      {/* Performance Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
      >
        <h4 className="text-lg font-semibold mb-4">Top Performers</h4>
        <BarChart
          data={barChartData}
          height={300}
          showValues={true}
          animate={true}
          unit="%"
        />
      </motion.div>

      {/* Agent List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-lg font-semibold">All Agents</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-750">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tasks
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Success Rate
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Avg Response
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Efficiency
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cost/Task
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sortedAgents.map((agent) => {
                const isActive = (Date.now() - new Date(agent.lastActive).getTime()) < 300000; // 5 minutes
                return (
                  <tr key={agent.agentId} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`w-2 h-2 rounded-full mr-3 ${
                          isActive ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {agent.agentName}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {agent.agentId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {agent.tasksCompleted}/{agent.tasksTotal}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        agent.successRate >= 90 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        agent.successRate >= 75 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {agent.successRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {agent.averageResponseTime.toFixed(1)}s
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end">
                        <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                          <div 
                            className="bg-emerald-500 h-2 rounded-full"
                            style={{ width: `${agent.efficiency * 100}%` }}
                          />
                        </div>
                        <span className="text-sm">{(agent.efficiency * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      ${agent.costPerTask.toFixed(3)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {isActive ? (
                        <span className="flex items-center justify-center text-green-600 dark:text-green-400">
                          <Activity className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className="flex items-center justify-center text-gray-400">
                          <Clock className="w-4 h-4" />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Performance Tips */}
      {agents.some(a => a.efficiency < 0.5 || a.errorRate > 10) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6"
        >
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Performance Optimization Needed
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Some agents are showing lower efficiency or higher error rates. Consider:
              </p>
              <ul className="list-disc list-inside text-sm text-amber-600 dark:text-amber-400 mt-2 space-y-1">
                <li>Reviewing task distribution and load balancing</li>
                <li>Checking for resource constraints or bottlenecks</li>
                <li>Updating agent configurations for better performance</li>
              </ul>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};