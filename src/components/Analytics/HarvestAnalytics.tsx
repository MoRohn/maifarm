import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Wheat,
  TrendingUp,
  Package,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Download,
  Filter
} from 'lucide-react';
import { clsx } from 'clsx';
import { Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { format } from 'date-fns';

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface HarvestAnalyticsProps {
  loading?: boolean;
  data?: any;
  timeRange?: string;
}

interface HarvestMetric {
  label: string;
  value: number | string;
  change?: number;
  icon: React.ElementType;
  color: string;
}

export const HarvestAnalytics: React.FC<HarvestAnalyticsProps> = ({ 
  loading = false, 
  data,
  timeRange = '24h'
}) => {
  const [selectedFarmType, setSelectedFarmType] = useState('all');
  const [harvestTrend, setHarvestTrend] = useState<any>(null);

  useEffect(() => {
    if (data) {
      // Process harvest trend data
      const trendData = processHarvestTrend(data.trend || [], timeRange);
      setHarvestTrend(trendData);
    }
  }, [data, timeRange]);

  const processHarvestTrend = (trend: any[], range: string) => {
    const labels = generateTimeLabels(range);
    
    return {
      labels,
      datasets: [
        {
          label: 'Successful Harvests',
          data: trend.map(t => t.successful) || generateMockData(labels.length, 20, 50),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Failed Harvests',
          data: trend.map(t => t.failed) || generateMockData(labels.length, 0, 10),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    };
  };

  const generateTimeLabels = (range: string): string[] => {
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
  };

  const generateMockData = (length: number, min: number, max: number): number[] => {
    return Array.from({ length }, () => 
      Math.floor(Math.random() * (max - min + 1)) + min
    );
  };

  const harvestMetrics: HarvestMetric[] = [
    {
      label: 'Total Harvests',
      value: data?.totalHarvests || 1247,
      change: 15.3,
      icon: Wheat,
      color: 'green'
    },
    {
      label: 'Success Rate',
      value: `${data?.successRate || 94.5}%`,
      change: 2.1,
      icon: CheckCircle2,
      color: 'blue'
    },
    {
      label: 'Avg Yield',
      value: data?.avgYield || '82.3 units',
      change: 8.7,
      icon: TrendingUp,
      color: 'purple'
    },
    {
      label: 'Processing Time',
      value: `${data?.avgProcessingTime || 3.2}s`,
      change: -12.5,
      icon: Clock,
      color: 'yellow'
    }
  ];

  const harvestByTypeData = {
    labels: data?.types?.map((t: any) => t.name) || 
            ['Text Generation', 'Code Analysis', 'Data Processing', 'Image Generation', 'Research'],
    datasets: [
      {
        data: data?.types?.map((t: any) => t.count) || [345, 278, 189, 156, 279],
        backgroundColor: [
          'rgba(99, 102, 241, 0.9)',
          'rgba(168, 85, 247, 0.9)',
          'rgba(34, 197, 94, 0.9)',
          'rgba(251, 146, 60, 0.9)',
          'rgba(239, 68, 68, 0.9)'
        ],
        borderWidth: 0
      }
    ]
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          padding: 15,
          font: {
            size: 12
          },
          generateLabels: (chart: any) => {
            const data = chart.data;
            return data.labels.map((label: string, i: number) => ({
              text: label,
              fillStyle: data.datasets[0].backgroundColor[i],
              hidden: false,
              index: i,
              datasetIndex: 0
            }));
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

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
        mode: 'index' as const,
        intersect: false
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
        }
      }
    }
  };

  const recentHarvests = data?.recent || [
    { id: '1', name: 'Code Review Farm', status: 'completed', yield: 95, time: '2m ago' },
    { id: '2', name: 'Data Analysis Farm', status: 'completed', yield: 87, time: '5m ago' },
    { id: '3', name: 'Content Generation Farm', status: 'failed', yield: 0, time: '8m ago' },
    { id: '4', name: 'Research Farm', status: 'completed', yield: 92, time: '12m ago' },
    { id: '5', name: 'Translation Farm', status: 'completed', yield: 88, time: '15m ago' }
  ];

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-apple">
            <Wheat className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Harvest Analytics
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Monitor and optimize your farm yields
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={selectedFarmType}
            onChange={(e) => setSelectedFarmType(e.target.value)}
            className="px-3 py-1.5 rounded-apple text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Farms</option>
            <option value="text">Text Generation</option>
            <option value="code">Code Analysis</option>
            <option value="data">Data Processing</option>
            <option value="image">Image Generation</option>
          </select>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <Filter className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {harvestMetrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white dark:bg-gray-800 rounded-apple-lg p-4 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-2">
              <metric.icon className={clsx(
                'w-5 h-5',
                metric.color === 'green' && 'text-green-500',
                metric.color === 'blue' && 'text-blue-500',
                metric.color === 'purple' && 'text-purple-500',
                metric.color === 'yellow' && 'text-yellow-500'
              )} />
              {metric.change && (
                <span className={clsx(
                  'text-xs font-medium',
                  metric.change > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {metric.change > 0 ? '+' : ''}{metric.change}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {loading ? '—' : metric.value}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {metric.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Harvest by Type */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
        >
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Harvest Distribution by Type
          </h4>
          <div className="h-64">
            <Pie data={harvestByTypeData} options={pieOptions} />
          </div>
        </motion.div>

        {/* Harvest Trend */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
        >
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Harvest Success Trend
          </h4>
          <div className="h-64">
            {harvestTrend && (
              <Line data={harvestTrend} options={lineOptions} />
            )}
          </div>
        </motion.div>
      </div>

      {/* Recent Harvests */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Harvests
          </h4>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="text-sm text-primary hover:text-primary-dark flex items-center space-x-1"
          >
            <span>View All</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
        <div className="space-y-3">
          {recentHarvests.map((harvest: any, index: number) => (
            <motion.div
              key={harvest.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center justify-between p-3 rounded-apple bg-gray-50 dark:bg-gray-900/50"
            >
              <div className="flex items-center space-x-3">
                <div className={clsx(
                  'w-2 h-2 rounded-full',
                  harvest.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
                )} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {harvest.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {harvest.time}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {harvest.yield} units
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Yield
                  </p>
                </div>
                {harvest.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};