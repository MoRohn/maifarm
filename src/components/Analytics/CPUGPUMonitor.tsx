import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Cpu, HardDrive, Zap, Server, Activity, AlertTriangle } from 'lucide-react';
import { LineChart } from './Charts/LineChart';
import { useWebSocket } from '../../hooks/useWebSocket';

interface ResourceMetrics {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  gpu?: {
    usage: number;
    memory: number;
    temperature?: number;
    name?: string;
  };
}

interface CPUGPUMonitorProps {
  className?: string;
}

export const CPUGPUMonitor: React.FC<CPUGPUMonitorProps> = ({ className = '' }) => {
  const [metrics, setMetrics] = useState<ResourceMetrics | null>(null);
  const [history, setHistory] = useState<Array<{ timestamp: Date; cpu: number; memory: number; gpu?: number }>>([]);
  const [loading, setLoading] = useState(true);
  
  const { socket, connected } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  useEffect(() => {
    loadResourceMetrics();
    
    // Subscribe to real-time updates
    if (socket && connected) {
      socket.emit('analytics:subscribe', { metrics: ['resources'] });
      
      socket.on('analytics:update', (data: any) => {
        if (data.type === 'resources') {
          const newMetrics = data.data;
          setMetrics(newMetrics);
          
          // Update history
          setHistory(prev => {
            const newEntry = {
              timestamp: new Date(),
              cpu: newMetrics.cpu.usage,
              memory: newMetrics.memory.percentage,
              gpu: newMetrics.gpu?.usage || 0
            };
            
            // Keep last 60 data points (5 minutes at 5-second intervals)
            const updated = [...prev, newEntry];
            return updated.slice(-60);
          });
        }
      });
      
      return () => {
        socket.emit('analytics:unsubscribe', { metrics: ['resources'] });
        socket.off('analytics:update');
      };
    }
  }, [socket, connected]);

  const loadResourceMetrics = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/analytics/cpu-gpu');
      const data = await response.json();
      
      if (data.success) {
        setMetrics(data.data);
        
        // Initialize history with current data
        setHistory([{
          timestamp: new Date(),
          cpu: data.data.cpu.usage,
          memory: data.data.memory.percentage,
          gpu: data.data.gpu?.usage || 0
        }]);
      }
    } catch (error) {
      console.error('Error loading resource metrics:', error);
      // Use mock data for development
      const mockMetrics: ResourceMetrics = {
        cpu: {
          usage: 45 + Math.random() * 20,
          cores: 8,
          model: 'Apple M1 Pro',
          temperature: 45 + Math.random() * 15
        },
        memory: {
          total: 16 * 1024 * 1024 * 1024, // 16GB
          used: 10 * 1024 * 1024 * 1024, // 10GB
          free: 6 * 1024 * 1024 * 1024, // 6GB
          percentage: 62.5
        },
        gpu: {
          usage: 30 + Math.random() * 20,
          memory: 50,
          temperature: 50 + Math.random() * 10,
          name: 'Apple M1 Pro GPU'
        }
      };
      setMetrics(mockMetrics);
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

  if (!metrics) {
    return (
      <div className="text-center p-8 text-gray-500">
        No resource metrics available
      </div>
    );
  }

  // Prepare data for line chart
  const lineChartData = [
    {
      label: 'CPU Usage',
      data: history.map(h => ({
        timestamp: h.timestamp,
        value: h.cpu
      })),
      color: '#06b6d4'
    },
    {
      label: 'Memory Usage',
      data: history.map(h => ({
        timestamp: h.timestamp,
        value: h.memory
      })),
      color: '#8b5cf6'
    }
  ];

  if (metrics.gpu) {
    lineChartData.push({
      label: 'GPU Usage',
      data: history.map(h => ({
        timestamp: h.timestamp,
        value: h.gpu || 0
      })),
      color: '#f59e0b'
    });
  }

  const formatBytes = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const getUsageColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 70) return 'text-yellow-500';
    return 'text-emerald-500';
  };

  const getUsageBgColor = (percentage: number): string => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Resource Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CPU Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                <Cpu className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <h3 className="font-semibold">CPU</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {metrics.cpu.cores} cores • {metrics.cpu.model}
                </p>
              </div>
            </div>
          </div>
          
          <div className="relative h-32">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className={`text-4xl font-bold ${getUsageColor(metrics.cpu.usage)}`}>
                  {metrics.cpu.usage.toFixed(0)}%
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Usage</p>
              </div>
            </div>
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 56}`}
                strokeDashoffset={`${2 * Math.PI * 56 * (1 - metrics.cpu.usage / 100)}`}
                className={getUsageColor(metrics.cpu.usage)}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
          </div>
          
          {metrics.cpu.temperature && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Temperature</span>
                <span className={metrics.cpu.temperature > 70 ? 'text-red-500' : ''}>
                  {metrics.cpu.temperature.toFixed(0)}°C
                </span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Memory Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <HardDrive className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold">Memory</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatBytes(metrics.memory.total)} Total
                </p>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Used</span>
                <span>{formatBytes(metrics.memory.used)}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${getUsageBgColor(metrics.memory.percentage)}`}
                  style={{ width: `${metrics.memory.percentage}%` }}
                />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Free</span>
                <span>{formatBytes(metrics.memory.free)}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-gray-400 h-2 rounded-full"
                  style={{ width: `${100 - metrics.memory.percentage}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center">
              <span className={`text-2xl font-bold ${getUsageColor(metrics.memory.percentage)}`}>
                {metrics.memory.percentage.toFixed(0)}%
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">Used</span>
            </div>
          </div>
        </motion.div>

        {/* GPU Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
        >
          {metrics.gpu ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <Zap className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">GPU</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {metrics.gpu.name || 'Graphics Processor'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Usage</span>
                    <span className={getUsageColor(metrics.gpu.usage)}>
                      {metrics.gpu.usage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${getUsageBgColor(metrics.gpu.usage)}`}
                      style={{ width: `${metrics.gpu.usage}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Memory</span>
                    <span>{metrics.gpu.memory.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-amber-500 h-2 rounded-full"
                      style={{ width: `${metrics.gpu.memory}%` }}
                    />
                  </div>
                </div>
              </div>
              
              {metrics.gpu.temperature && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Temperature</span>
                    <span className={metrics.gpu.temperature > 80 ? 'text-red-500' : ''}>
                      {metrics.gpu.temperature.toFixed(0)}°C
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Server className="w-12 h-12 mb-2" />
              <p className="text-sm">GPU Not Available</p>
              <p className="text-xs mt-1">No GPU detected or monitoring disabled</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Real-time Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Resource Usage History</h3>
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Last 5 minutes • Live
            </span>
          </div>
        </div>
        
        {history.length > 1 ? (
          <LineChart
            data={lineChartData}
            height={250}
            showLegend={true}
            animate={true}
            timeRange="hour"
          />
        ) : (
          <div className="h-[250px] flex items-center justify-center text-gray-400">
            <p>Collecting data...</p>
          </div>
        )}
      </motion.div>

      {/* Alerts */}
      {(metrics.cpu.usage > 80 || metrics.memory.percentage > 85 || (metrics.gpu && metrics.gpu.usage > 80)) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4"
        >
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                High Resource Usage Detected
              </h4>
              <ul className="text-sm text-amber-700 dark:text-amber-300 mt-1 space-y-1">
                {metrics.cpu.usage > 80 && (
                  <li>• CPU usage is at {metrics.cpu.usage.toFixed(0)}%</li>
                )}
                {metrics.memory.percentage > 85 && (
                  <li>• Memory usage is at {metrics.memory.percentage.toFixed(0)}%</li>
                )}
                {metrics.gpu && metrics.gpu.usage > 80 && (
                  <li>• GPU usage is at {metrics.gpu.usage.toFixed(0)}%</li>
                )}
              </ul>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Consider optimizing resource-intensive tasks or scaling resources.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};