import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Cpu, 
  HardDrive,
  MemoryStick,
  Gauge,
  Activity,
  Server,
  Thermometer,
  Zap,
  AlertTriangle
} from 'lucide-react';
import { clsx } from 'clsx';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface SystemUsageProps {
  loading?: boolean;
  data?: any;
  timeRange?: string;
}

interface SystemMetric {
  label: string;
  value: number;
  max: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  icon: React.ElementType;
}

export const SystemUsage: React.FC<SystemUsageProps> = ({ 
  loading = false, 
  data,
  timeRange = '24h'
}) => {
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [gpuHistory, setGpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const animationRef = useRef<number>();

  // Simulate real-time system monitoring
  useEffect(() => {
    const updateHistory = () => {
      setCpuHistory(prev => {
        const newHistory = [...prev, data?.cpu?.current || Math.random() * 100];
        return newHistory.slice(-30);
      });
      
      setGpuHistory(prev => {
        const newHistory = [...prev, data?.gpu?.current || Math.random() * 100];
        return newHistory.slice(-30);
      });
      
      setMemoryHistory(prev => {
        const newHistory = [...prev, data?.memory?.current || Math.random() * 100];
        return newHistory.slice(-30);
      });
    };

    const interval = setInterval(updateHistory, 2000);
    return () => clearInterval(interval);
  }, [data]);

  const getStatusColor = (value: number, thresholds = { warning: 70, critical: 90 }) => {
    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.warning) return 'warning';
    return 'normal';
  };

  const systemMetrics: SystemMetric[] = [
    {
      label: 'CPU Usage',
      value: data?.cpu?.current || 45,
      max: 100,
      unit: '%',
      status: getStatusColor(data?.cpu?.current || 45),
      icon: Cpu
    },
    {
      label: 'GPU Usage',
      value: data?.gpu?.current || 62,
      max: 100,
      unit: '%',
      status: getStatusColor(data?.gpu?.current || 62),
      icon: Zap
    },
    {
      label: 'Memory',
      value: data?.memory?.used || 8.2,
      max: data?.memory?.total || 16,
      unit: 'GB',
      status: getStatusColor((data?.memory?.used || 8.2) / (data?.memory?.total || 16) * 100),
      icon: MemoryStick
    },
    {
      label: 'Storage',
      value: data?.storage?.used || 256,
      max: data?.storage?.total || 512,
      unit: 'GB',
      status: getStatusColor((data?.storage?.used || 256) / (data?.storage?.total || 512) * 100),
      icon: HardDrive
    }
  ];

  const cpuCoresData = {
    labels: data?.cpu?.cores?.map((_: any, i: number) => `Core ${i + 1}`) || 
             ['Core 1', 'Core 2', 'Core 3', 'Core 4', 'Core 5', 'Core 6', 'Core 7', 'Core 8'],
    datasets: [
      {
        label: 'CPU Core Usage (%)',
        data: data?.cpu?.cores || [45, 52, 38, 61, 47, 55, 42, 49],
        backgroundColor: [
          'rgba(99, 102, 241, 0.8)',
          'rgba(168, 85, 247, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(244, 63, 94, 0.8)',
          'rgba(163, 163, 163, 0.8)'
        ],
        borderWidth: 0,
        borderRadius: 8
      }
    ]
  };

  const gpuMemoryData = {
    labels: ['Used', 'Available'],
    datasets: [
      {
        data: [data?.gpu?.memoryUsed || 6.8, (data?.gpu?.memoryTotal || 12) - (data?.gpu?.memoryUsed || 6.8)],
        backgroundColor: [
          'rgba(168, 85, 247, 0.9)',
          'rgba(229, 231, 235, 0.5)'
        ],
        borderWidth: 0,
        cutout: '75%'
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8
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
        max: 100,
        ticks: {
          callback: function(value: any) {
            return value + '%';
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
        display: true,
        position: 'bottom' as const,
        labels: {
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context: any) {
            return context.label + ': ' + context.parsed.toFixed(1) + ' GB';
          }
        }
      }
    }
  };

  const CircularProgress = ({ value, max, size = 120, strokeWidth = 8 }: any) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (value / max) * circumference;

    return (
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-gray-200 dark:text-gray-700"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={clsx(
            value / max > 0.9 ? 'text-red-500' :
            value / max > 0.7 ? 'text-yellow-500' :
            'text-green-500'
          )}
        />
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          System Resource Usage
        </h3>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Thermometer className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Temperature: {data?.temperature || 65}°C
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {data?.serverCount || 4} Servers Active
            </span>
          </div>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {systemMetrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={clsx(
                  'p-2 rounded-apple',
                  metric.status === 'critical' && 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
                  metric.status === 'warning' && 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
                  metric.status === 'normal' && 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                )}>
                  <metric.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{metric.label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {loading ? '—' : `${metric.value}${metric.unit}`}
                  </p>
                </div>
              </div>
              {metric.status === 'critical' && (
                <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
              )}
            </div>
            <div className="relative">
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(metric.value / metric.max) * 100}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={clsx(
                    'h-full rounded-full',
                    metric.status === 'critical' && 'bg-red-500',
                    metric.status === 'warning' && 'bg-yellow-500',
                    metric.status === 'normal' && 'bg-green-500'
                  )}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {metric.value} / {metric.max}{metric.unit}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Detailed Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU Cores Usage */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              CPU Core Distribution
            </h4>
            <Cpu className="w-5 h-5 text-gray-400" />
          </div>
          <div className="h-64">
            <Bar data={cpuCoresData} options={barOptions} />
          </div>
        </motion.div>

        {/* GPU Memory Usage */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              GPU Memory Usage
            </h4>
            <Zap className="w-5 h-5 text-gray-400" />
          </div>
          <div className="h-64 flex items-center justify-center">
            <div className="relative">
              <Doughnut data={gpuMemoryData} options={doughnutOptions} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {((data?.gpu?.memoryUsed || 6.8) / (data?.gpu?.memoryTotal || 12) * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Used</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Live Activity Monitor */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white dark:bg-gray-800 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
            Live Activity Monitor
          </h4>
          <Activity className="w-5 h-5 text-green-500 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">CPU Activity</p>
            <div className="h-20 flex items-end space-x-1">
              {cpuHistory.map((value, index) => (
                <motion.div
                  key={index}
                  initial={{ height: 0 }}
                  animate={{ height: `${value}%` }}
                  className="flex-1 bg-blue-500 rounded-t"
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">GPU Activity</p>
            <div className="h-20 flex items-end space-x-1">
              {gpuHistory.map((value, index) => (
                <motion.div
                  key={index}
                  initial={{ height: 0 }}
                  animate={{ height: `${value}%` }}
                  className="flex-1 bg-purple-500 rounded-t"
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Memory Activity</p>
            <div className="h-20 flex items-end space-x-1">
              {memoryHistory.map((value, index) => (
                <motion.div
                  key={index}
                  initial={{ height: 0 }}
                  animate={{ height: `${value}%` }}
                  className="flex-1 bg-green-500 rounded-t"
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};