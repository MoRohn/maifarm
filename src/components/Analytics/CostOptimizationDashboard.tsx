import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calculator,
  PiggyBank,
  CreditCard,
  AlertTriangle,
  Info,
  Download,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Clock,
  Zap,
  Target,
  Activity,
  BarChart3,
  Lightbulb,
  Settings
} from 'lucide-react';
import { clsx } from 'clsx';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { format } from 'date-fns';
import { useCostTracking } from '../../hooks/useCostTracking';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface CostOptimizationDashboardProps {
  className?: string;
}

interface RealTimeMetric {
  label: string;
  value: string;
  change: number;
  icon: React.ElementType;
  color: string;
  trend: 'up' | 'down' | 'neutral';
}

export const CostOptimizationDashboard: React.FC<CostOptimizationDashboardProps> = ({ 
  className 
}) => {
  const {
    metrics,
    optimizationTips,
    loading,
    error,
    fetchHistoricalData,
    exportReport,
    getProviderComparison,
    currentSessionCost,
    dailyCost,
    monthlyCost,
    projectedMonthlyCost,
    potentialSavings,
    savingsPercentage
  } = useCostTracking();

  const [timeRange, setTimeRange] = useState('24h');
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);

  // Fetch historical data when time range changes
  useEffect(() => {
    const fetchData = async () => {
      const end = new Date();
      let start = new Date();
      
      switch (timeRange) {
        case '1h':
          start = new Date(end.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }
      
      const data = await fetchHistoricalData({ start, end, groupBy: 'hour' });
      setHistoricalData(data);
    };

    fetchData();
  }, [timeRange, fetchHistoricalData]);

  // Real-time metrics cards
  const realTimeMetrics: RealTimeMetric[] = useMemo(() => [
    {
      label: 'Current Session',
      value: `$${currentSessionCost.toFixed(4)}`,
      change: 0,
      icon: Activity,
      color: 'blue',
      trend: 'neutral'
    },
    {
      label: 'Today\'s Cost',
      value: `$${dailyCost.toFixed(2)}`,
      change: dailyCost > (metrics?.hourlyCost || 0) * 24 ? 15 : -8,
      icon: Clock,
      color: 'green',
      trend: dailyCost > (metrics?.hourlyCost || 0) * 24 ? 'up' : 'down'
    },
    {
      label: 'Monthly Cost',
      value: `$${monthlyCost.toFixed(2)}`,
      change: 12,
      icon: BarChart3,
      color: 'purple',
      trend: 'up'
    },
    {
      label: 'Projected Monthly',
      value: `$${projectedMonthlyCost.toFixed(2)}`,
      change: savingsPercentage,
      icon: TrendingUp,
      color: 'orange',
      trend: savingsPercentage > 0 ? 'up' : 'down'
    },
    {
      label: 'Potential Savings',
      value: `$${potentialSavings.toFixed(2)}`,
      change: savingsPercentage,
      icon: PiggyBank,
      color: 'emerald',
      trend: savingsPercentage > 0 ? 'up' : 'neutral'
    }
  ], [currentSessionCost, dailyCost, monthlyCost, projectedMonthlyCost, potentialSavings, savingsPercentage, metrics]);

  // Chart data for cost trends
  const costTrendData = useMemo(() => {
    const labels = historicalData.map(d => format(new Date(d.period), 'HH:mm'));
    const costs = historicalData.map(d => d.totalCost);
    
    return {
      labels,
      datasets: [
        {
          label: 'Cost Over Time',
          data: costs,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    };
  }, [historicalData]);

  // Provider comparison data
  const providerComparison = getProviderComparison();
  const providerData = useMemo(() => {
    if (!providerComparison) return null;
    
    return {
      labels: [providerComparison.currentProvider, providerComparison.alternativeProvider],
      datasets: [
        {
          data: [providerComparison.currentCost, providerComparison.alternativeCost],
          backgroundColor: ['#ef4444', '#10b981'],
          borderColor: ['#dc2626', '#059669'],
          borderWidth: 2
        }
      ]
    };
  }, [providerComparison]);

  // Optimization tips by priority
  const highPriorityTips = optimizationTips.filter(tip => tip.priority === 'high');
  const mediumPriorityTips = optimizationTips.filter(tip => tip.priority === 'medium');
  const lowPriorityTips = optimizationTips.filter(tip => tip.priority === 'low');

  const handleExport = async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    await exportReport({ start, end }, 'csv');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
          <span className="text-red-700">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Cost Optimization Dashboard
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Real-time cost tracking and optimization insights
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white dark:bg-gray-800"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          
          <button
            onClick={handleExport}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
          
          <button
            onClick={() => setShowOptimizationModal(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            Optimize
          </button>
        </div>
      </div>

      {/* Real-time Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {realTimeMetrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div className={clsx(
                'p-2 rounded-lg',
                `bg-${metric.color}-100 dark:bg-${metric.color}-900/20`
              )}>
                <metric.icon className={clsx('w-5 h-5', `text-${metric.color}-600`)} />
              </div>
              
              {metric.trend !== 'neutral' && (
                <div className={clsx(
                  'flex items-center text-sm',
                  metric.trend === 'up' ? 'text-red-600' : 'text-green-600'
                )}>
                  {metric.trend === 'up' ? (
                    <ArrowUp className="w-3 h-3 mr-1" />
                  ) : (
                    <ArrowDown className="w-3 h-3 mr-1" />
                  )}
                  {Math.abs(metric.change).toFixed(1)}%
                </div>
              )}
            </div>
            
            <div className="mt-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">{metric.label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {metric.value}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Trend Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Cost Trend
          </h3>
          <div className="h-64">
            <Line 
              data={costTrendData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: (value) => `$${value}`
                    }
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Provider Comparison */}
        {providerData && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Provider Comparison
            </h3>
            <div className="h-64">
              <Doughnut 
                data={providerData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom'
                    }
                  }
                }}
              />
            </div>
            {providerComparison && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  Switch to {providerComparison.alternativeProvider} to save{' '}
                  <span className="font-bold">
                    ${providerComparison.potentialSavings.toFixed(2)} 
                    ({providerComparison.savingsPercentage.toFixed(1)}%)
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Optimization Tips */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Optimization Recommendations
          </h3>
        </div>
        
        <div className="p-6 space-y-4">
          {/* High Priority Tips */}
          {highPriorityTips.length > 0 && (
            <div>
              <h4 className="text-red-600 font-medium mb-2 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2" />
                High Priority
              </h4>
              {highPriorityTips.map((tip, index) => (
                <div key={index} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-2">
                  <h5 className="font-medium text-red-900 dark:text-red-100">{tip.title}</h5>
                  <p className="text-sm text-red-700 dark:text-red-200 mt-1">{tip.description}</p>
                  <p className="text-sm text-red-600 dark:text-red-300 mt-2">
                    Potential savings: <span className="font-bold">${tip.estimatedSavings.toFixed(2)}</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Medium Priority Tips */}
          {mediumPriorityTips.length > 0 && (
            <div>
              <h4 className="text-yellow-600 font-medium mb-2 flex items-center">
                <Info className="w-4 h-4 mr-2" />
                Medium Priority
              </h4>
              {mediumPriorityTips.map((tip, index) => (
                <div key={index} className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-2">
                  <h5 className="font-medium text-yellow-900 dark:text-yellow-100">{tip.title}</h5>
                  <p className="text-sm text-yellow-700 dark:text-yellow-200 mt-1">{tip.description}</p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-2">
                    Potential savings: <span className="font-bold">${tip.estimatedSavings.toFixed(2)}</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Low Priority Tips */}
          {lowPriorityTips.length > 0 && (
            <div>
              <h4 className="text-blue-600 font-medium mb-2 flex items-center">
                <Sparkles className="w-4 h-4 mr-2" />
                Optimization Opportunities
              </h4>
              {lowPriorityTips.map((tip, index) => (
                <div key={index} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-2">
                  <h5 className="font-medium text-blue-900 dark:text-blue-100">{tip.title}</h5>
                  <p className="text-sm text-blue-700 dark:text-blue-200 mt-1">{tip.description}</p>
                  <p className="text-sm text-blue-600 dark:text-blue-300 mt-2">
                    Potential savings: <span className="font-bold">${tip.estimatedSavings.toFixed(2)}</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          {optimizationTips.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No optimization recommendations available at the moment.</p>
              <p className="text-sm">Your cost usage is already optimized!</p>
            </div>
          )}
        </div>
      </div>

      {/* Optimization Modal */}
      <AnimatePresence>
        {showOptimizationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowOptimizationModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                  <Settings className="w-6 h-6 mr-2" />
                  Cost Optimization Settings
                </h3>
                <button
                  onClick={() => setShowOptimizationModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Automatic Provider Switching
                  </label>
                  <div className="flex items-center space-x-3">
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Automatically switch to the most cost-effective provider
                    </span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cost Alerts
                  </label>
                  <div className="flex items-center space-x-3">
                    <input type="checkbox" className="rounded" defaultChecked />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Send alerts when daily cost exceeds $10
                    </span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Model Optimization
                  </label>
                  <div className="flex items-center space-x-3">
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Use cheaper models for simple tasks
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowOptimizationModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowOptimizationModal(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save Settings
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};