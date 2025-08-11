import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Download,
  Settings,
  Bell,
  BarChart3,
  Gauge
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Tooltip } from '../../common/Tooltip';

interface MetricPoint {
  timestamp: number;
  value: number;
  label?: string;
}

interface MetricData {
  cpu: MetricPoint[];
  memory: MetricPoint[];
  network: MetricPoint[];
  disk: MetricPoint[];
  messageRate: MetricPoint[];
  errorRate: MetricPoint[];
}

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info';
  metric: string;
  message: string;
  timestamp: number;
  value: number;
  threshold: number;
}

interface Threshold {
  metric: string;
  warning: number;
  critical: number;
  enabled: boolean;
}

interface MetricsDashboardProps {
  farmId: string;
  agents: Array<{ id: string; name: string }>;
  className?: string;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  farmId,
  agents,
  className = ''
}) => {
  const [metricData, setMetricData] = useState<MetricData>({
    cpu: [],
    memory: [],
    network: [],
    disk: [],
    messageRate: [],
    errorRate: []
  });
  
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<keyof MetricData>('cpu');
  const [timeRange, setTimeRange] = useState<'1m' | '5m' | '15m' | '30m' | '1h'>('5m');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  
  const [thresholds, setThresholds] = useState<Threshold[]>([
    { metric: 'cpu', warning: 70, critical: 90, enabled: true },
    { metric: 'memory', warning: 80, critical: 95, enabled: true },
    { metric: 'network', warning: 1000, critical: 5000, enabled: true },
    { metric: 'disk', warning: 85, critical: 95, enabled: true },
    { metric: 'errorRate', warning: 5, critical: 10, enabled: true }
  ]);
  
  const [predictions, setPredictions] = useState<{
    cpu: number;
    memory: number;
    timeToThreshold: number;
  }>({
    cpu: 0,
    memory: 0,
    timeToThreshold: 0
  });

  const { socket } = useWebSocket();
  const metricsBufferRef = useRef<Map<string, MetricPoint[]>>(new Map());
  const lastUpdateRef = useRef<number>(Date.now());

  // Color scheme for charts
  const colors = {
    cpu: '#3b82f6',
    memory: '#8b5cf6',
    network: '#10b981',
    disk: '#f59e0b',
    messageRate: '#06b6d4',
    errorRate: '#ef4444',
    warning: '#f59e0b',
    critical: '#ef4444',
    success: '#10b981'
  };

  // Time range to data points mapping
  const getDataPoints = useCallback(() => {
    const ranges = {
      '1m': 60,
      '5m': 100,
      '15m': 180,
      '30m': 200,
      '1h': 240
    };
    return ranges[timeRange];
  }, [timeRange]);

  // Generate mock data for demo
  const generateMockData = useCallback(() => {
    const now = Date.now();
    const points = getDataPoints();
    const interval = (parseInt(timeRange) * 60 * 1000) / points;
    
    const generateMetricPoints = (baseValue: number, variance: number): MetricPoint[] => {
      return Array.from({ length: points }, (_, i) => ({
        timestamp: now - (points - i) * interval,
        value: Math.max(0, Math.min(100, baseValue + (Math.random() - 0.5) * variance))
      }));
    };

    return {
      cpu: generateMetricPoints(45, 30),
      memory: generateMetricPoints(60, 20),
      network: generateMetricPoints(500, 400),
      disk: generateMetricPoints(70, 10),
      messageRate: generateMetricPoints(100, 80),
      errorRate: generateMetricPoints(2, 5)
    };
  }, [timeRange, getDataPoints]);

  // Initialize with mock data
  useEffect(() => {
    setMetricData(generateMockData());
  }, [generateMockData]);

  // Handle WebSocket metrics updates
  useEffect(() => {
    if (!socket) return;

    const handleMetricsUpdate = (data: any) => {
      const now = Date.now();
      
      // Update metrics buffer
      Object.keys(data).forEach(metric => {
        if (!metricsBufferRef.current.has(metric)) {
          metricsBufferRef.current.set(metric, []);
        }
        
        const buffer = metricsBufferRef.current.get(metric)!;
        buffer.push({
          timestamp: now,
          value: data[metric]
        });
        
        // Keep buffer size limited
        const maxPoints = getDataPoints();
        if (buffer.length > maxPoints) {
          metricsBufferRef.current.set(metric, buffer.slice(-maxPoints));
        }
      });

      // Update state periodically to avoid too many re-renders
      if (now - lastUpdateRef.current > 1000) {
        setMetricData(prev => {
          const updated = { ...prev };
          metricsBufferRef.current.forEach((buffer, metric) => {
            if (metric in updated) {
              (updated as any)[metric] = [...buffer];
            }
          });
          return updated;
        });
        lastUpdateRef.current = now;
      }

      // Check thresholds and create alerts
      checkThresholds(data);
      
      // Update predictions
      updatePredictions(data);
    };

    socket.on('metrics:update', handleMetricsUpdate);
    socket.on('agent:metrics', handleMetricsUpdate);

    return () => {
      socket.off('metrics:update', handleMetricsUpdate);
      socket.off('agent:metrics', handleMetricsUpdate);
    };
  }, [socket, getDataPoints]);

  // Check thresholds and generate alerts
  const checkThresholds = useCallback((metrics: any) => {
    const newAlerts: Alert[] = [];
    
    thresholds.forEach(threshold => {
      if (!threshold.enabled) return;
      
      const value = metrics[threshold.metric];
      if (value === undefined) return;
      
      if (value >= threshold.critical) {
        newAlerts.push({
          id: `${threshold.metric}-${Date.now()}`,
          type: 'error',
          metric: threshold.metric,
          message: `${threshold.metric} exceeded critical threshold`,
          timestamp: Date.now(),
          value,
          threshold: threshold.critical
        });
      } else if (value >= threshold.warning) {
        newAlerts.push({
          id: `${threshold.metric}-${Date.now()}`,
          type: 'warning',
          metric: threshold.metric,
          message: `${threshold.metric} exceeded warning threshold`,
          timestamp: Date.now(),
          value,
          threshold: threshold.warning
        });
      }
    });

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 50)); // Keep last 50 alerts
    }
  }, [thresholds]);

  // Update predictions based on trends
  const updatePredictions = useCallback((currentMetrics: any) => {
    // Simple linear prediction based on recent trend
    const predictValue = (data: MetricPoint[]): number => {
      if (data.length < 2) return 0;
      
      const recent = data.slice(-10);
      const trend = (recent[recent.length - 1].value - recent[0].value) / recent.length;
      return Math.max(0, Math.min(100, recent[recent.length - 1].value + trend * 10));
    };

    setPredictions({
      cpu: predictValue(metricData.cpu),
      memory: predictValue(metricData.memory),
      timeToThreshold: Math.random() * 60 // Mock time to threshold in minutes
    });
  }, [metricData]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Simulate new data points
      setMetricData(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(metric => {
          const data = (updated as any)[metric] as MetricPoint[];
          if (data.length > 0) {
            const lastValue = data[data.length - 1].value;
            const newValue = Math.max(0, Math.min(100, 
              lastValue + (Math.random() - 0.5) * 10
            ));
            
            (updated as any)[metric] = [
              ...data.slice(1),
              {
                timestamp: Date.now(),
                value: newValue
              }
            ];
          }
        });
        return updated;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Export metrics data
  const exportMetrics = useCallback(() => {
    const data = {
      farmId,
      timestamp: new Date().toISOString(),
      timeRange,
      metrics: metricData,
      alerts: alerts
    };

    let content: string;
    let filename: string;
    let mimeType: string;

    if (exportFormat === 'json') {
      content = JSON.stringify(data, null, 2);
      filename = `metrics-${farmId}-${Date.now()}.json`;
      mimeType = 'application/json';
    } else {
      // Convert to CSV
      const csvRows: string[] = ['Timestamp,Metric,Value'];
      Object.entries(metricData).forEach(([metric, points]) => {
        points.forEach(point => {
          csvRows.push(`${new Date(point.timestamp).toISOString()},${metric},${point.value}`);
        });
      });
      content = csvRows.join('\n');
      filename = `metrics-${farmId}-${Date.now()}.csv`;
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [farmId, timeRange, metricData, alerts, exportFormat]);

  // Format data for charts
  const formatChartData = useCallback((data: MetricPoint[]) => {
    return data.map(point => ({
      time: new Date(point.timestamp).toLocaleTimeString(),
      value: point.value,
      timestamp: point.timestamp
    }));
  }, []);

  // Calculate summary stats
  const calculateStats = useCallback((data: MetricPoint[]) => {
    if (data.length === 0) return { avg: 0, min: 0, max: 0, current: 0 };
    
    const values = data.map(p => p.value);
    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      current: values[values.length - 1]
    };
  }, []);

  const cpuStats = calculateStats(metricData.cpu);
  const memoryStats = calculateStats(metricData.memory);
  const networkStats = calculateStats(metricData.network);
  const diskStats = calculateStats(metricData.disk);

  return (
    <div className={`bg-gray-900 rounded-lg p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-semibold text-white">Performance Metrics</h2>
          <span className="text-sm text-gray-400">
            {agents.length} agents • Last updated: {new Date().toLocaleTimeString()}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="bg-gray-800 text-white px-3 py-1.5 rounded text-sm"
          >
            <option value="1m">Last 1m</option>
            <option value="5m">Last 5m</option>
            <option value="15m">Last 15m</option>
            <option value="30m">Last 30m</option>
            <option value="1h">Last 1h</option>
          </select>

          {/* Auto Refresh Toggle */}
          <Tooltip content={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"}>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-2 rounded ${autoRefresh ? 'bg-green-600' : 'bg-gray-700'} hover:bg-opacity-80 transition-colors`}
            >
              <Activity className={`w-4 h-4 text-white ${autoRefresh ? 'animate-pulse' : ''}`} />
            </button>
          </Tooltip>

          {/* Alerts Toggle */}
          <Tooltip content={showAlerts ? "Hide alerts" : "Show alerts"}>
            <button
              onClick={() => setShowAlerts(!showAlerts)}
              className={`p-2 rounded ${showAlerts ? 'bg-yellow-600' : 'bg-gray-700'} hover:bg-opacity-80 transition-colors relative`}
            >
              <Bell className="w-4 h-4 text-white" />
              {alerts.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {alerts.length}
                </span>
              )}
            </button>
          </Tooltip>

          {/* Export Button */}
          <Tooltip content="Export metrics">
            <button
              onClick={exportMetrics}
              className="p-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
            >
              <Download className="w-4 h-4 text-white" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Alerts Panel */}
      <AnimatePresence>
        {showAlerts && alerts.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mb-4 space-y-2"
          >
            {alerts.slice(0, 3).map(alert => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg flex items-center justify-between ${
                  alert.type === 'error' ? 'bg-red-900/20 border border-red-700' :
                  alert.type === 'warning' ? 'bg-yellow-900/20 border border-yellow-700' :
                  'bg-blue-900/20 border border-blue-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${
                    alert.type === 'error' ? 'text-red-400' :
                    alert.type === 'warning' ? 'text-yellow-400' :
                    'text-blue-400'
                  }`} />
                  <span className="text-sm text-white">{alert.message}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <span className="text-sm font-mono text-white">
                  {alert.value.toFixed(1)}% / {alert.threshold}%
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* CPU Gauge */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-white">CPU</span>
            </div>
            <span className={`text-lg font-bold ${
              cpuStats.current > 90 ? 'text-red-400' :
              cpuStats.current > 70 ? 'text-yellow-400' :
              'text-green-400'
            }`}>
              {cpuStats.current.toFixed(1)}%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <LineChart data={formatChartData(metricData.cpu.slice(-20))}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={colors.cpu}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>Min: {cpuStats.min.toFixed(1)}%</span>
            <span>Avg: {cpuStats.avg.toFixed(1)}%</span>
            <span>Max: {cpuStats.max.toFixed(1)}%</span>
          </div>
        </div>

        {/* Memory Gauge */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-white">Memory</span>
            </div>
            <span className={`text-lg font-bold ${
              memoryStats.current > 95 ? 'text-red-400' :
              memoryStats.current > 80 ? 'text-yellow-400' :
              'text-green-400'
            }`}>
              {memoryStats.current.toFixed(1)}%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <AreaChart data={formatChartData(metricData.memory.slice(-20))}>
              <Area
                type="monotone"
                dataKey="value"
                stroke={colors.memory}
                fill={colors.memory}
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>Min: {memoryStats.min.toFixed(1)}%</span>
            <span>Avg: {memoryStats.avg.toFixed(1)}%</span>
            <span>Max: {memoryStats.max.toFixed(1)}%</span>
          </div>
        </div>

        {/* Network Gauge */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-white">Network</span>
            </div>
            <span className="text-lg font-bold text-green-400">
              {networkStats.current.toFixed(0)} KB/s
            </span>
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <BarChart data={formatChartData(metricData.network.slice(-10))}>
              <Bar dataKey="value" fill={colors.network} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>Min: {networkStats.min.toFixed(0)}</span>
            <span>Avg: {networkStats.avg.toFixed(0)}</span>
            <span>Max: {networkStats.max.toFixed(0)}</span>
          </div>
        </div>

        {/* Disk Gauge */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium text-white">Disk</span>
            </div>
            <span className={`text-lg font-bold ${
              diskStats.current > 95 ? 'text-red-400' :
              diskStats.current > 85 ? 'text-yellow-400' :
              'text-green-400'
            }`}>
              {diskStats.current.toFixed(1)}%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <RadialBarChart
              width={100}
              height={60}
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="90%"
              data={[{ value: diskStats.current, fill: colors.disk }]}
            >
              <RadialBar dataKey="value" />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>Used: {(diskStats.current * 5.12).toFixed(1)} GB</span>
            <span>Free: {((100 - diskStats.current) * 5.12).toFixed(1)} GB</span>
          </div>
        </div>
      </div>

      {/* Detailed Chart */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            {Object.keys(metricData).map(metric => (
              <button
                key={metric}
                onClick={() => setSelectedMetric(metric as keyof MetricData)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  selectedMetric === metric
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {metric.charAt(0).toUpperCase() + metric.slice(1)}
              </button>
            ))}
          </div>

          {/* Predictions */}
          {(selectedMetric === 'cpu' || selectedMetric === 'memory') && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-400">Predicted:</span>
              <span className={`font-bold ${
                predictions[selectedMetric] > 90 ? 'text-red-400' :
                predictions[selectedMetric] > 70 ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                {predictions[selectedMetric].toFixed(1)}%
              </span>
              {predictions[selectedMetric] > 70 && (
                <span className="text-yellow-400">
                  ⚠️ Threshold in ~{predictions.timeToThreshold.toFixed(0)}m
                </span>
              )}
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={formatChartData(metricData[selectedMetric])}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              stroke="#9ca3af"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem'
              }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={colors[selectedMetric]}
              fill={colors[selectedMetric]}
              fillOpacity={0.3}
              strokeWidth={2}
            />
            
            {/* Threshold lines */}
            {thresholds
              .filter(t => t.metric === selectedMetric && t.enabled)
              .map(threshold => (
                <React.Fragment key={threshold.metric}>
                  <Line
                    type="monotone"
                    dataKey={() => threshold.warning}
                    stroke={colors.warning}
                    strokeDasharray="5 5"
                    strokeWidth={1}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={() => threshold.critical}
                    stroke={colors.critical}
                    strokeDasharray="5 5"
                    strokeWidth={1}
                    dot={false}
                  />
                </React.Fragment>
              ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MetricsDashboard;