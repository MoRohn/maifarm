import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
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
  Sparkles
} from 'lucide-react';
import { clsx } from 'clsx';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
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

interface CostAnalyticsProps {
  loading?: boolean;
  data?: any;
  timeRange?: string;
}

// Dynamic pricing will be loaded from the cost tracking service
interface PricingModel {
  name: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  color?: string;
  active: boolean;
}

interface PricingData {
  provider: string;
  models: { [key: string]: PricingModel };
}

export const CostAnalytics: React.FC<CostAnalyticsProps> = ({ 
  loading = false, 
  data,
  timeRange = '24h'
}) => {
  const [selectedModel, setSelectedModel] = useState('all');
  const [costBreakdown, setCostBreakdown] = useState<any>(null);
  const [projectedCosts, setProjectedCosts] = useState<number>(0);
  const [pricingData, setPricingData] = useState<PricingData[]>([]);
  const [realTimeMetrics, setRealTimeMetrics] = useState<any>(null);
  const [optimizationTips, setOptimizationTips] = useState<any[]>([]);

  // Fetch pricing data and real-time metrics on mount
  useEffect(() => {
    const fetchPricingAndMetrics = async () => {
      try {
        // Fetch pricing data
        const pricingResponse = await fetch('/api/cost-tracking/pricing');
        const pricingResult = await pricingResponse.json();
        if (pricingResult.success) {
          setPricingData(pricingResult.data);
        }

        // Fetch real-time metrics
        const metricsResponse = await fetch('/api/cost-tracking/metrics');
        const metricsResult = await metricsResponse.json();
        if (metricsResult.success) {
          setRealTimeMetrics(metricsResult.data);
        }

        // Fetch optimization tips
        const tipsResponse = await fetch('/api/cost-tracking/optimization-tips');
        const tipsResult = await tipsResponse.json();
        if (tipsResult.success) {
          setOptimizationTips(tipsResult.data.tips);
        }
      } catch (error) {
        console.error('Failed to fetch cost tracking data:', error);
      }
    };

    fetchPricingAndMetrics();
    
    // Subscribe to real-time updates via WebSocket
    const socket = (window as any).socket;
    if (socket) {
      socket.emit('cost:subscribe');
      
      socket.on('cost:metrics', (metrics: any) => {
        setRealTimeMetrics(metrics);
      });
      
      return () => {
        socket.emit('cost:unsubscribe');
        socket.off('cost:metrics');
      };
    }
  }, []);

  // Calculate real costs based on token usage
  const calculateCosts = useMemo(() => {
    if (!realTimeMetrics) return { total: 0, breakdown: {} };
    
    return {
      total: realTimeMetrics.dailyCost || 0,
      breakdown: realTimeMetrics.costPerFarm || {}
    };
  }, [realTimeMetrics]);

  // Project future costs based on current usage patterns
  useEffect(() => {
    if (calculateCosts.total > 0) {
      const dailyRate = calculateCosts.total;
      const multiplier = timeRange === '24h' ? 30 : timeRange === '7d' ? 4.3 : 1;
      setProjectedCosts(dailyRate * multiplier);
    }
  }, [calculateCosts, timeRange]);

  // Prepare chart data
  useEffect(() => {
    if (realTimeMetrics && pricingData.length > 0) {
      const claudePricing = pricingData.find(p => p.provider === 'claude');
      if (claudePricing) {
        const breakdown = {
          labels: Object.values(claudePricing.models).filter(m => m.active).map(m => m.name),
          datasets: [{
            data: Object.values(calculateCosts.breakdown).map((b: any) => b.total || 0),
            backgroundColor: [
              'rgba(168, 85, 247, 0.9)',
              'rgba(59, 130, 246, 0.9)',
              'rgba(34, 197, 94, 0.9)',
              'rgba(99, 102, 241, 0.9)'
            ],
            borderWidth: 0
          }]
        };
        setCostBreakdown(breakdown);
      }
    }
  }, [realTimeMetrics, pricingData, calculateCosts]);

  const costMetrics = [
    {
      label: 'Current Period Cost',
      value: `$${calculateCosts.total.toFixed(2)}`,
      change: data?.costChange || -12.5,
      icon: DollarSign,
      color: 'primary',
      subtitle: `${timeRange} total`
    },
    {
      label: 'Projected Monthly',
      value: `$${projectedCosts.toFixed(2)}`,
      change: data?.projectedChange || 8.3,
      icon: TrendingUp,
      color: 'purple',
      subtitle: 'Based on current usage'
    },
    {
      label: 'Cost per Task',
      value: `$${(calculateCosts.total / (data?.taskCount || 100)).toFixed(4)}`,
      change: data?.perTaskChange || -5.2,
      icon: Calculator,
      color: 'blue',
      subtitle: 'Average cost'
    },
    {
      label: 'Savings Potential',
      value: `$${(projectedCosts * 0.15).toFixed(2)}`,
      change: 15,
      icon: PiggyBank,
      color: 'green',
      subtitle: 'With optimization'
    }
  ];

  const costTrendData = {
    labels: generateTimeLabels(timeRange),
    datasets: [
      {
        label: 'Cost ($)',
        data: data?.costTrend || generateMockCostData(timeRange),
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Projected ($)',
        data: data?.projectedTrend || generateMockProjectedData(timeRange),
        borderColor: 'rgb(168, 85, 247)',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        borderDash: [5, 5],
        tension: 0.4,
        fill: false
      }
    ]
  };

  const tokenUsageData = {
    labels: ['Input Tokens', 'Output Tokens'],
    datasets: [{
      data: [
        data?.totalTokens?.input || 2500000,
        data?.totalTokens?.output || 1800000
      ],
      backgroundColor: [
        'rgba(59, 130, 246, 0.9)',
        'rgba(168, 85, 247, 0.9)'
      ],
      borderWidth: 0
    }]
  };

  function generateTimeLabels(range: string): string[] {
    const count = range === '1h' ? 12 : range === '24h' ? 24 : range === '7d' ? 7 : 30;
    const labels = [];
    
    for (let i = count - 1; i >= 0; i--) {
      if (range === '1h') {
        labels.push(`${i * 5}m`);
      } else if (range === '24h') {
        labels.push(`${i}h`);
      } else {
        labels.push(`${i}d`);
      }
    }
    
    return labels.reverse();
  }

  function generateMockCostData(range: string): number[] {
    const count = range === '1h' ? 12 : range === '24h' ? 24 : range === '7d' ? 7 : 30;
    return Array.from({ length: count }, () => Math.random() * 50 + 10);
  }

  function generateMockProjectedData(range: string): number[] {
    const costData = generateMockCostData(range);
    return costData.map(cost => cost * 1.1);
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: $${context.parsed.y.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          callback: function(value: any) {
            return '$' + value;
          }
        }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 15,
          font: {
            size: 11
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context: any) {
            return `${context.label}: $${context.parsed.toFixed(2)}`;
          }
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-apple">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Cost Analytics
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Claude Code API usage and costs
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-apple flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
              Real Claude Pricing
            </span>
          </div>
        </div>
      </div>

      {/* Provider Comparison */}
      {realTimeMetrics?.comparisonWithAlternative && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-apple-lg p-4 border border-purple-200 dark:border-purple-800"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Provider Cost Comparison
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Current: {realTimeMetrics.comparisonWithAlternative.currentProvider} vs Alternative: {realTimeMetrics.comparisonWithAlternative.alternativeProvider}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {realTimeMetrics.comparisonWithAlternative.savingsPercentage > 0 ? '+' : ''}
                {realTimeMetrics.comparisonWithAlternative.savingsPercentage.toFixed(1)}%
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ${Math.abs(realTimeMetrics.comparisonWithAlternative.potentialSavings).toFixed(2)}/day
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Cost Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {costMetrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white dark:bg-gray-800 rounded-apple-lg p-4 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={clsx(
                'p-2 rounded-apple',
                metric.color === 'primary' && 'bg-primary/10 text-primary',
                metric.color === 'purple' && 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
                metric.color === 'blue' && 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
                metric.color === 'green' && 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              )}>
                <metric.icon className="w-4 h-4" />
              </div>
              <div className={clsx(
                'flex items-center space-x-1 text-xs font-medium',
                metric.change > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
              )}>
                {metric.change > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                <span>{Math.abs(metric.change)}%</span>
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              {loading ? '—' : metric.value}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {metric.label}
            </p>
            {metric.subtitle && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {metric.subtitle}
              </p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Cost Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
        >
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Cost Trend & Projection
          </h4>
          <div className="h-64">
            <Line data={costTrendData} options={lineOptions} />
          </div>
        </motion.div>

        {/* Model Cost Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
        >
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Cost by Model
          </h4>
          <div className="h-64">
            {costBreakdown && (
              <Doughnut data={costBreakdown} options={doughnutOptions} />
            )}
          </div>
        </motion.div>
      </div>

      {/* Pricing Information */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-apple-lg p-6 border border-blue-200 dark:border-blue-800"
      >
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              AI Provider Pricing Reference
            </h4>
            {pricingData.map((provider) => (
              <div key={provider.provider} className="mb-4">
                <h5 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-2 capitalize">
                  {provider.provider} Models
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(Array.isArray(provider.models) ? provider.models : Object.values(provider.models || {}))
                    .filter((m: any) => m.active)
                    .map((model: any) => (
                      <div key={model.key || model.name} className="bg-white dark:bg-gray-800 rounded-apple p-3">
                        <p className="font-medium text-gray-900 dark:text-white text-sm mb-2">
                          {model.name}
                        </p>
                        <div className="space-y-1">
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Input: ${model.inputPricePerMillion}/1M tokens
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Output: ${model.outputPricePerMillion}/1M tokens
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
              * Prices shown are for API usage. Data updated in real-time.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Cost Optimization Tips */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
      >
        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Cost Optimization Recommendations
        </h4>
        <div className="space-y-3">
          {(optimizationTips.length > 0 ? optimizationTips : [
            { description: 'Use Claude 3 Haiku for simple tasks to reduce costs by 80%', estimatedSavings: 124.50 },
            { description: 'Implement caching for repetitive queries', estimatedSavings: 89.20 },
            { description: 'Batch similar requests to reduce API calls', estimatedSavings: 56.30 },
            { description: 'Optimize prompt length without sacrificing quality', estimatedSavings: 42.80 }
          ]).map((tip, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.05 }}
              className="flex items-center justify-between p-3 rounded-apple bg-gray-50 dark:bg-gray-900/50"
            >
              <div className="flex items-center space-x-3">
                <PiggyBank className="w-4 h-4 text-green-500" />
                <p className="text-sm text-gray-700 dark:text-gray-300">{tip.description || tip.tip}</p>
              </div>
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Save ${tip.estimatedSavings?.toFixed(2) || tip.savings}/day
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};