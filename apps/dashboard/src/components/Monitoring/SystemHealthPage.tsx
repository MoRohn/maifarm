import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Database,
  Server,
  Wifi,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Cpu,
  HardDrive,
  Zap,
  Users,
  Terminal,
  BarChart3,
  Loader2
} from 'lucide-react';
import { api } from '@/services/apiClient';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency?: number;
  message?: string;
  lastCheck?: string;
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime?: number;
  services?: ServiceHealth[];
  metrics?: {
    activeFarms?: number;
    activeAgents?: number;
    queueDepth?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
}

export function SystemHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const [healthRes, metricsRes] = await Promise.all([
        api.get('/health'),
        api.get('/api/system-health').catch(() => ({ data: null }))
      ]);

      const healthData = healthRes.data?.data || healthRes.data;
      const metricsData = metricsRes.data?.data || metricsRes.data;

      setHealth({
        status: healthData?.status || 'unknown',
        timestamp: healthData?.timestamp || new Date().toISOString(),
        uptime: healthData?.uptime,
        services: healthData?.services || healthData?.checks || [],
        metrics: {
          activeFarms: metricsData?.activeFarms || 0,
          activeAgents: metricsData?.activeAgents || 0,
          queueDepth: metricsData?.queueDepth || 0,
          memoryUsage: metricsData?.memoryUsage || 0,
          cpuUsage: metricsData?.cpuUsage || 0,
        }
      });
      setError(null);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Activity className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500/20 border-green-500/30 text-green-400';
      case 'degraded':
        return 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400';
      case 'unhealthy':
        return 'bg-red-500/20 border-red-500/30 text-red-400';
      default:
        return 'bg-gray-500/20 border-gray-500/30 text-gray-400';
    }
  };

  const getServiceIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('database') || lowerName.includes('postgres')) {
      return <Database className="w-4 h-4" />;
    }
    if (lowerName.includes('redis') || lowerName.includes('cache')) {
      return <Zap className="w-4 h-4" />;
    }
    if (lowerName.includes('websocket') || lowerName.includes('socket')) {
      return <Wifi className="w-4 h-4" />;
    }
    if (lowerName.includes('api') || lowerName.includes('server')) {
      return <Server className="w-4 h-4" />;
    }
    if (lowerName.includes('terminal') || lowerName.includes('tmux')) {
      return <Terminal className="w-4 h-4" />;
    }
    return <Activity className="w-4 h-4" />;
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center space-x-3">
            <Activity className="w-7 h-7 text-blue-400" />
            <span>System Health</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Real-time monitoring of MaiFarm services and infrastructure
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <span>Auto-refresh</span>
          </label>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* Overall Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl p-6 border ${getStatusColor(health?.status || 'unknown')}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {getStatusIcon(health?.status || 'unknown')}
            <div>
              <h2 className="text-xl font-bold capitalize">{health?.status || 'Unknown'}</h2>
              <p className="text-sm opacity-70">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{formatUptime(health?.uptime)}</div>
            <div className="text-sm opacity-70">Uptime</div>
          </div>
        </div>
      </motion.div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Active Farms</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {health?.metrics?.activeFarms || 0}
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <Terminal className="w-4 h-4" />
            <span className="text-sm">Active Agents</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {health?.metrics?.activeAgents || 0}
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm">Queue Depth</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {health?.metrics?.queueDepth || 0}
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <Cpu className="w-4 h-4" />
            <span className="text-sm">CPU Usage</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {health?.metrics?.cpuUsage || 0}%
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${health?.metrics?.cpuUsage || 0}%` }}
            />
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center space-x-2 text-gray-400 mb-2">
            <HardDrive className="w-4 h-4" />
            <span className="text-sm">Memory</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {health?.metrics?.memoryUsage || 0}%
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
            <div
              className={`h-1.5 rounded-full transition-all ${
                (health?.metrics?.memoryUsage || 0) > 80 ? 'bg-red-500' : 'bg-green-500'
              }`}
              style={{ width: `${health?.metrics?.memoryUsage || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
          <Server className="w-5 h-5 text-blue-400" />
          <span>Services</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {(health?.services || []).map((service, index) => (
              <motion.div
                key={service.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`rounded-lg p-4 border ${getStatusColor(service.status)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getServiceIcon(service.name)}
                    <span className="font-medium">{service.name}</span>
                  </div>
                  {getStatusIcon(service.status)}
                </div>
                {service.latency !== undefined && (
                  <div className="text-sm opacity-70">
                    Latency: {service.latency}ms
                  </div>
                )}
                {service.message && (
                  <div className="text-sm opacity-70 mt-1 truncate">
                    {service.message}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {(!health?.services || health.services.length === 0) && (
            <div className="col-span-full text-center text-gray-400 py-8">
              <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No service health data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => window.open('/api/health', '_blank')}
          className="flex items-center justify-center space-x-2 p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl border border-gray-700/50 transition-colors"
        >
          <Activity className="w-5 h-5 text-green-400" />
          <span className="text-gray-300">Health API</span>
        </button>

        <button
          onClick={() => window.open('/api/health/startup', '_blank')}
          className="flex items-center justify-center space-x-2 p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl border border-gray-700/50 transition-colors"
        >
          <Clock className="w-5 h-5 text-blue-400" />
          <span className="text-gray-300">Startup Diagnostics</span>
        </button>

        <button
          onClick={() => window.open('/api/metrics', '_blank')}
          className="flex items-center justify-center space-x-2 p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl border border-gray-700/50 transition-colors"
        >
          <BarChart3 className="w-5 h-5 text-purple-400" />
          <span className="text-gray-300">Metrics</span>
        </button>

        <button
          onClick={() => window.open('/api/websocket-health', '_blank')}
          className="flex items-center justify-center space-x-2 p-4 bg-gray-800/50 hover:bg-gray-700/50 rounded-xl border border-gray-700/50 transition-colors"
        >
          <Wifi className="w-5 h-5 text-yellow-400" />
          <span className="text-gray-300">WebSocket Health</span>
        </button>
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500">
        <p>Health data refreshes every 10 seconds when auto-refresh is enabled</p>
      </div>
    </div>
  );
}

export default SystemHealthPage;
