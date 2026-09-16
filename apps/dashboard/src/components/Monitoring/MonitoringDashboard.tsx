/**
 * Monitoring Dashboard Component
 * Real-time system metrics and health monitoring
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Server,
  TrendingUp,
  Wifi,
  XCircle
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatBytes, formatDuration } from '@/utils/formatters';

interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentUsed: number;
  };
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    websocket: ServiceHealth;
    tmux: ServiceHealth;
    aiProvider: ServiceHealth;
  };
  alerts: Alert[];
}

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency: number;
  lastCheck: Date;
  error?: string;
}

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

interface ApplicationMetrics {
  requests: {
    total: number;
    success: number;
    errors: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  farms: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    avgDuration: number;
  };
  agents: {
    total: number;
    active: number;
    idle: number;
    failed: number;
    recovered: number;
  };
  tasks: {
    quickTasks: number;
    quickTasksCompleted: number;
    quickTasksFailed: number;
    avgQuickTaskTime: number;
  };
}

export const MonitoringDashboard: React.FC = () => {
  const { socket, connected } = useWebSocket();
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [applicationMetrics, setApplicationMetrics] = useState<ApplicationMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'metrics' | 'health' | 'alerts'>('overview');

  useEffect(() => {
    if (!socket) return;

    // Subscribe to monitoring updates
    socket.emit('monitoring:subscribe', ['metrics', 'health', 'alerts']);

    // Handle initial data
    socket.on('monitoring:initial', (data: any) => {
      setSystemMetrics(data.system);
      setApplicationMetrics(data.application);
      setHealthStatus(data.health);
      setAlerts(data.alerts);
    });

    // Handle real-time updates
    socket.on('monitoring:metrics', (data: any) => {
      setSystemMetrics(data.system);
      setApplicationMetrics(data.application);
    });

    socket.on('monitoring:health', (health: HealthStatus) => {
      setHealthStatus(health);
    });

    socket.on('monitoring:alert', (alert: Alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50));
    });

    return () => {
      socket.off('monitoring:initial');
      socket.off('monitoring:metrics');
      socket.off('monitoring:health');
      socket.off('monitoring:alert');
    };
  }, [socket]);

  const acknowledgeAlert = (alertId: string) => {
    if (!socket) return;
    socket.emit('monitoring:acknowledge-alert', alertId);
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, acknowledged: true } : a
    ));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'up':
        return 'text-green-500';
      case 'degraded':
        return 'text-yellow-500';
      case 'unhealthy':
      case 'down':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'up':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'unhealthy':
      case 'down':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          System Monitoring Dashboard
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Real-time metrics and health monitoring
        </p>
      </div>

      {/* Connection Status */}
      <div className="mb-4">
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
          connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          <Wifi className="w-4 h-4 mr-2" />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {(['overview', 'metrics', 'health', 'alerts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-2 font-medium text-sm capitalize ${
              selectedTab === tab
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {selectedTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* System Status Card */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">System Status</h3>
              {healthStatus && getStatusIcon(healthStatus.status)}
            </div>
            <p className={`text-2xl font-bold ${healthStatus ? getStatusColor(healthStatus.status) : ''}`}>
              {healthStatus?.status || 'Unknown'}
            </p>
          </div>

          {/* CPU Usage Card */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">CPU Usage</h3>
              <Cpu className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {systemMetrics?.cpu.usage || 0}%
            </p>
            <p className="text-sm text-gray-500">
              {systemMetrics?.cpu.cores || 0} cores
            </p>
          </div>

          {/* Memory Usage Card */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">Memory</h3>
              <HardDrive className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {systemMetrics?.memory.percentUsed || 0}%
            </p>
            <p className="text-sm text-gray-500">
              {systemMetrics ? formatBytes(systemMetrics.memory.used) : '0 B'} /
              {systemMetrics ? formatBytes(systemMetrics.memory.total) : '0 B'}
            </p>
          </div>

          {/* Active Farms Card */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">Active Farms</h3>
              <Activity className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {applicationMetrics?.farms.active || 0}
            </p>
            <p className="text-sm text-gray-500">
              {applicationMetrics?.farms.total || 0} total
            </p>
          </div>
        </div>
      )}

      {selectedTab === 'metrics' && applicationMetrics && (
        <div className="space-y-6">
          {/* Request Metrics */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Request Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total Requests</p>
                <p className="text-xl font-bold">{applicationMetrics.requests.total}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Success Rate</p>
                <p className="text-xl font-bold">
                  {applicationMetrics.requests.total > 0
                    ? Math.round((applicationMetrics.requests.success / applicationMetrics.requests.total) * 100)
                    : 0}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg Response Time</p>
                <p className="text-xl font-bold">{applicationMetrics.requests.avgResponseTime.toFixed(2)}ms</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">P95 Response Time</p>
                <p className="text-xl font-bold">{applicationMetrics.requests.p95ResponseTime.toFixed(2)}ms</p>
              </div>
            </div>
          </div>

          {/* Farm Metrics */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Farm Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total Farms</p>
                <p className="text-xl font-bold">{applicationMetrics.farms.total}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-xl font-bold text-green-600">{applicationMetrics.farms.active}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Completed</p>
                <p className="text-xl font-bold text-blue-600">{applicationMetrics.farms.completed}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Failed</p>
                <p className="text-xl font-bold text-red-600">{applicationMetrics.farms.failed}</p>
              </div>
            </div>
          </div>

          {/* Agent Metrics */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Agent Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total Agents</p>
                <p className="text-xl font-bold">{applicationMetrics.agents.total}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-xl font-bold text-green-600">{applicationMetrics.agents.active}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Idle</p>
                <p className="text-xl font-bold text-yellow-600">{applicationMetrics.agents.idle}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Failed</p>
                <p className="text-xl font-bold text-red-600">{applicationMetrics.agents.failed}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Recovered</p>
                <p className="text-xl font-bold text-blue-600">{applicationMetrics.agents.recovered}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTab === 'health' && healthStatus && (
        <div className="space-y-4">
          {/* Overall Health */}
          <div className={`p-4 rounded-lg ${
            healthStatus.status === 'healthy' ? 'bg-green-50 dark:bg-green-900/20' :
            healthStatus.status === 'degraded' ? 'bg-yellow-50 dark:bg-yellow-900/20' :
            'bg-red-50 dark:bg-red-900/20'
          }`}>
            <div className="flex items-center">
              {getStatusIcon(healthStatus.status)}
              <div className="ml-3">
                <h3 className="font-semibold">Overall System Health</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Last checked: {new Date(healthStatus.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>

          {/* Service Health */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Service Health</h3>
            <div className="space-y-3">
              {Object.entries(healthStatus.services).map(([service, health]) => (
                <div key={service} className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 rounded">
                  <div className="flex items-center">
                    <Server className="w-5 h-5 text-gray-400 mr-3" />
                    <div>
                      <p className="font-medium capitalize">{service}</p>
                      {health.error && (
                        <p className="text-sm text-red-500">{health.error}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="text-sm text-gray-500 mr-3">
                      {health.latency}ms
                    </span>
                    {getStatusIcon(health.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedTab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No alerts at this time
            </div>
          ) : (
            alerts.filter(a => !a.acknowledged).map(alert => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg flex items-center justify-between ${
                  alert.level === 'critical' ? 'bg-red-50 dark:bg-red-900/20' :
                  alert.level === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20' :
                  'bg-blue-50 dark:bg-blue-900/20'
                }`}
              >
                <div className="flex items-center">
                  <AlertCircle className={`w-5 h-5 mr-3 ${
                    alert.level === 'critical' ? 'text-red-500' :
                    alert.level === 'warning' ? 'text-yellow-500' :
                    'text-blue-500'
                  }`} />
                  <div>
                    <p className="font-medium">{alert.message}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => acknowledgeAlert(alert.id)}
                  className="px-3 py-1 text-sm bg-white dark:bg-gray-800 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Acknowledge
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};