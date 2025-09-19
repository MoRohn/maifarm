import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, TrendingDown, Activity, PieChart } from 'lucide-react';
import { claudeCodeService, ClaudeCodeCosts } from '@/services/claudeCodeService';
import { LineChart } from './Charts/LineChart';
import { PieChart as PieChartComponent } from './Charts/PieChart';
import { formatMetricValue } from '@/utils/dataAggregation';

interface FarmingCostsProps {
  timeRange?: string;
  className?: string;
}

export const FarmingCosts: React.FC<FarmingCostsProps> = ({ 
  timeRange = '30d',
  className = '' 
}) => {
  const [costs, setCosts] = useState<ClaudeCodeCosts | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<'daily' | 'breakdown' | 'agents'>('daily');

  useEffect(() => {
    loadCostData();
  }, [timeRange]);

  const loadCostData = async () => {
    setLoading(true);
    try {
      const costData = await claudeCodeService.getCostAnalytics(timeRange);
      setCosts(costData);
    } catch (error) {
      console.error('Error loading cost data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!costs) {
    return (
      <div className="text-center p-8 text-gray-500">
        No cost data available
      </div>
    );
  }

  // Calculate cost trend
  const lastDayCost = costs.dailyCosts[costs.dailyCosts.length - 1]?.cost || 0;
  const previousDayCost = costs.dailyCosts[costs.dailyCosts.length - 2]?.cost || lastDayCost;
  const costTrend = previousDayCost > 0 
    ? ((lastDayCost - previousDayCost) / previousDayCost) * 100 
    : 0;

  // Prepare data for line chart
  const lineChartData = [{
    label: 'Daily Cost',
    data: costs.dailyCosts.map(day => ({
      timestamp: new Date(day.date),
      value: day.cost
    })),
    color: '#8b5cf6'
  }, {
    label: 'API Calls (÷100)',
    data: costs.dailyCosts.map(day => ({
      timestamp: new Date(day.date),
      value: day.apiCalls / 100 // Scale down for visibility
    })),
    color: '#06b6d4'
  }];

  // Prepare data for pie chart
  const pieChartData = [
    { label: 'API', value: costs.costBreakdown.api, color: '#8b5cf6' },
    { label: 'Compute', value: costs.costBreakdown.compute, color: '#06b6d4' },
    { label: 'Storage', value: costs.costBreakdown.storage, color: '#10b981' },
    { label: 'Network', value: costs.costBreakdown.network, color: '#f59e0b' }
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with total cost */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 text-white"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-purple-100 text-sm font-medium">Total Claude Code Costs</p>
            <h2 className="text-4xl font-bold mt-2">
              ${costs.totalCost.toFixed(2)}
            </h2>
            <div className="flex items-center mt-3 space-x-2">
              {costTrend >= 0 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              <span className="text-sm">
                {Math.abs(costTrend).toFixed(1)}% from yesterday
              </span>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
            <DollarSign className="w-8 h-8" />
          </div>
        </div>
      </motion.div>

      {/* View Selector */}
      <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700">
        {(['daily', 'breakdown', 'agents'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setSelectedView(view)}
            className={`pb-2 px-4 capitalize transition-colors ${
              selectedView === view
                ? 'border-b-2 border-emerald-500 text-emerald-500'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {view === 'daily' ? 'Daily Trends' : 
             view === 'breakdown' ? 'Cost Breakdown' : 
             'By Agent'}
          </button>
        ))}
      </div>

      {/* Content based on selected view */}
      <motion.div
        key={selectedView}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
      >
        {selectedView === 'daily' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Daily Cost Trends</h3>
            <LineChart
              data={lineChartData}
              height={300}
              showLegend={true}
              animate={true}
              timeRange="day"
            />
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Average Daily</p>
                <p className="text-xl font-semibold">
                  ${(costs.totalCost / costs.dailyCosts.length).toFixed(2)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Peak Day</p>
                <p className="text-xl font-semibold">
                  ${Math.max(...costs.dailyCosts.map(d => d.cost)).toFixed(2)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Total API Calls</p>
                <p className="text-xl font-semibold">
                  {costs.dailyCosts.reduce((sum, d) => sum + d.apiCalls, 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {selectedView === 'breakdown' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Cost Breakdown</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <PieChartComponent
                  data={pieChartData}
                  height={300}
                  innerRadius={60}
                  animate={true}
                />
              </div>
              <div className="space-y-4">
                {pieChartData.map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-750">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${item.value.toFixed(2)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {((item.value / costs.totalCost) * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedView === 'agents' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Cost by Agent</h3>
            {Object.keys(costs.costByAgent).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(costs.costByAgent)
                  .sort(([, a], [, b]) => b - a)
                  .map(([agentId, cost]) => (
                    <div key={agentId} className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <div className="flex items-center space-x-3">
                        <Activity className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="font-medium">{agentId}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {((cost / costs.totalCost) * 100).toFixed(1)}% of total
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-lg">${cost.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No agent-specific cost data available</p>
                <p className="text-sm mt-2">Costs will appear here once agents start processing tasks</p>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Cost Optimization Tips */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20 rounded-xl p-6 border border-emerald-200 dark:border-emerald-800"
      >
        <h3 className="text-lg font-semibold mb-3 flex items-center">
          <PieChart className="w-5 h-5 mr-2 text-emerald-600" />
          Cost Optimization Tips
        </h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-start">
            <span className="text-emerald-500 mr-2">•</span>
            Batch similar tasks together to reduce API calls
          </li>
          <li className="flex items-start">
            <span className="text-emerald-500 mr-2">•</span>
            Use caching for frequently accessed data
          </li>
          <li className="flex items-start">
            <span className="text-emerald-500 mr-2">•</span>
            Schedule non-urgent tasks during off-peak hours
          </li>
          <li className="flex items-start">
            <span className="text-emerald-500 mr-2">•</span>
            Monitor agent efficiency to identify optimization opportunities
          </li>
        </ul>
      </motion.div>
    </div>
  );
};