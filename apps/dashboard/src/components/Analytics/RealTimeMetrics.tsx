import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { clsx } from 'clsx';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface RealTimeMetricsProps {
  loading?: boolean;
  data?: any;
  timeRange?: string;
}

interface MetricCard {
  title: string;
  value: string | number;
  change: number;
  icon: React.ElementType;
  color: string;
  trend: 'up' | 'down' | 'neutral';
}

export const RealTimeMetrics: React.FC<RealTimeMetricsProps> = ({ 
  loading = false, 
  data,
  timeRange = '24h'
}) => {
  const [animatedValues, setAnimatedValues] = useState<any>({});
  const [chartData, setChartData] = useState<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Simulate real-time updates
  useEffect(() => {
    if (!loading && data) {
      // Animate metric values
      const targetValues = {
        activeFarms: data?.activeFarms || 0,
        totalAgents: data?.totalAgents || 0,
        tasksCompleted: data?.tasksCompleted || 0,
        successRate: data?.successRate || 0,
        avgResponseTime: data?.avgResponseTime || 0,
        throughput: data?.throughput || 0
      };

      // Smooth animation for numbers
      Object.keys(targetValues).forEach(key => {
        const start = (animatedValues as any)[key] || 0;
        const end = (targetValues as any)[key];
        const duration = 1000;
        const startTime = Date.now();

        const animate = () => {
          const now = Date.now();
          const progress = Math.min((now - startTime) / duration, 1);
          const value = start + (end - start) * easeOutCubic(progress);
          
          setAnimatedValues((prev: any) => ({
            ...prev,
            [key]: Math.round(value * 10) / 10
          }));

          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };
        
        animate();
      });

      // Update chart data
      updateChartData(data);
    }
  }, [data, loading]);

  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  const updateChartData = (metricsData: any) => {
    const labels = generateTimeLabels(timeRange);
    
    setChartData({
      labels,
      datasets: [
        {
          label: 'Tasks Completed',
          data: metricsData?.taskTrend || generateMockData(labels.length, 50, 150),
          borderColor: 'rgb(99, 102, 241)',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Success Rate (%)',
          data: metricsData?.successTrend || generateMockData(labels.length, 85, 100),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.4,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    });
  };

  const generateTimeLabels = (range: string): string[] => {
    const count = range === '1h' ? 12 : range === '24h' ? 24 : range === '7d' ? 7 : 30;
    const labels = [];
    
    for (let i = count - 1; i >= 0; i--) {
      if (range === '1h') {
        labels.push(`${i * 5}m ago`);
      } else if (range === '24h') {
        labels.push(`${i}h ago`);
      } else {
        labels.push(`${i}d ago`);
      }
    }
    
    return labels.reverse();
  };

  const generateMockData = (length: number, min: number, max: number): number[] => {
    return Array.from({ length }, () => 
      Math.floor(Math.random() * (max - min + 1)) + min
    );
  };

  const metrics: MetricCard[] = [
    {
      title: 'Active Farms',
      value: animatedValues.activeFarms || 0,
      change: 12.5,
      icon: Activity,
      color: 'primary',
      trend: 'up'
    },
    {
      title: 'Total Agents',
      value: animatedValues.totalAgents || 0,
      change: 8.3,
      icon: Users,
      color: 'green',
      trend: 'up'
    },
    {
      title: 'Tasks Completed',
      value: animatedValues.tasksCompleted || 0,
      change: 23.7,
      icon: CheckCircle2,
      color: 'blue',
      trend: 'up'
    },
    {
      title: 'Success Rate',
      value: `${animatedValues.successRate || 0}%`,
      change: 5.2,
      icon: TrendingUp,
      color: 'purple',
      trend: 'up'
    },
    {
      title: 'Avg Response Time',
      value: `${animatedValues.avgResponseTime || 0}ms`,
      change: -15.3,
      icon: Clock,
      color: 'yellow',
      trend: 'down'
    },
    {
      title: 'Throughput',
      value: `${animatedValues.throughput || 0}/s`,
      change: 18.9,
      icon: Zap,
      color: 'indigo',
      trend: 'up'
    }
  ];

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          font: {
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            size: 12
          },
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        titleFont: {
          size: 14,
          weight: 'bold' as const
        },
        bodyFont: {
          size: 13
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false
        },
        min: 0,
        max: 100
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          Real-Time Metrics
        </h3>
        <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
          <Clock className="w-4 h-4" />
          <span>Live updates every 5 seconds</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white dark:bg-gray-800 rounded-apple-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={clsx(
                'p-2 rounded-apple',
                metric.color === 'primary' && 'bg-primary/10 text-primary',
                metric.color === 'green' && 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
                metric.color === 'blue' && 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
                metric.color === 'purple' && 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
                metric.color === 'yellow' && 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
                metric.color === 'indigo' && 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
              )}>
                <metric.icon className="w-4 h-4" />
              </div>
              <div className={clsx(
                'flex items-center space-x-1 text-xs font-medium',
                metric.trend === 'up' ? 'text-green-600 dark:text-green-400' : 
                metric.trend === 'down' ? 'text-red-600 dark:text-red-400' : 
                'text-gray-500 dark:text-gray-400'
              )}>
                {metric.trend === 'up' ? (
                  <ArrowUp className="w-3 h-3" />
                ) : metric.trend === 'down' ? (
                  <ArrowDown className="w-3 h-3" />
                ) : null}
                <span>{Math.abs(metric.change)}%</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {metric.title}
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {loading ? '—' : metric.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Performance Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
      >
        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Performance Trends
        </h4>
        <div className="h-64">
          {chartData && (
            <Line data={chartData} options={chartOptions} />
          )}
        </div>
      </motion.div>
    </div>
  );
};