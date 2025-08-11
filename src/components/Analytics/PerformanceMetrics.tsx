import React from 'react';
import { TrendingUp, TrendingDown, Minus, Clock, CheckCircle, XCircle } from 'lucide-react';
import { AgentPerformanceMetric, TimeRange } from '../../types/analytics';

interface PerformanceMetricsProps {
  agents: AgentPerformanceMetric[];
  timeRange: TimeRange;
}

export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({
  agents,
  timeRange
}) => {
  // Calculate aggregate metrics
  const totalTasks = agents.reduce((sum, agent) => sum + agent.tasksCompleted + agent.tasksFailed, 0);
  const completedTasks = agents.reduce((sum, agent) => sum + agent.tasksCompleted, 0);
  const failedTasks = agents.reduce((sum, agent) => sum + agent.tasksFailed, 0);
  const avgResponseTime = agents.reduce((sum, agent) => sum + agent.averageResponseTime, 0) / agents.length;
  const avgSuccessRate = agents.reduce((sum, agent) => sum + agent.successRate, 0) / agents.length;

  // Find top and bottom performers
  const topPerformers = [...agents]
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 3);
  
  const bottomPerformers = [...agents]
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 3);

  const MetricCard = ({ 
    label, 
    value, 
    trend, 
    icon 
  }: { 
    label: string; 
    value: string | number; 
    trend?: 'up' | 'down' | 'stable';
    icon: React.ReactNode;
  }) => (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        {icon}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-xl font-bold">{value}</span>
        {trend && (
          <span className={`flex items-center text-sm ${
            trend === 'up' ? 'text-green-600' : 
            trend === 'down' ? 'text-red-600' : 
            'text-gray-500'
          }`}>
            {trend === 'up' && <TrendingUp className="w-4 h-4" />}
            {trend === 'down' && <TrendingDown className="w-4 h-4" />}
            {trend === 'stable' && <Minus className="w-4 h-4" />}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Performance Summary</h3>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            label="Success Rate"
            value={`${avgSuccessRate.toFixed(1)}%`}
            trend={avgSuccessRate > 90 ? 'up' : avgSuccessRate < 80 ? 'down' : 'stable'}
            icon={<CheckCircle className="w-5 h-5 text-green-500" />}
          />
          <MetricCard
            label="Avg Response"
            value={`${avgResponseTime.toFixed(1)}s`}
            trend={avgResponseTime < 20 ? 'up' : avgResponseTime > 30 ? 'down' : 'stable'}
            icon={<Clock className="w-5 h-5 text-blue-500" />}
          />
          <MetricCard
            label="Completed"
            value={completedTasks}
            icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
          />
          <MetricCard
            label="Failed"
            value={failedTasks}
            icon={<XCircle className="w-5 h-5 text-red-500" />}
          />
        </div>
      </div>

      {/* Top Performers */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Top Performers</h3>
        <div className="space-y-3">
          {topPerformers.map((agent, index) => (
            <div key={agent.agentId} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  index === 0 ? 'bg-yellow-100 text-yellow-700' :
                  index === 1 ? 'bg-gray-100 text-gray-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  {index + 1}
                </div>
                <div>
                  <p className="font-medium text-sm">{agent.agentName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {agent.tasksCompleted} tasks
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-medium text-sm text-green-600">
                  {agent.successRate.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {agent.averageResponseTime.toFixed(1)}s avg
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agents Needing Attention */}
      {bottomPerformers.some(a => a.successRate < 80) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border-l-4 border-yellow-500">
          <h3 className="text-lg font-semibold mb-4 text-yellow-700 dark:text-yellow-400">
            Agents Needing Attention
          </h3>
          <div className="space-y-3">
            {bottomPerformers
              .filter(a => a.successRate < 80)
              .map((agent) => (
                <div key={agent.agentId} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{agent.agentName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {agent.tasksFailed} failed tasks
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-sm text-red-600">
                      {agent.successRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Success rate
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};