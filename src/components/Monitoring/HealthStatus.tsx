import React, { useEffect, useState } from 'react';
import { Heart, CheckCircle, AlertCircle, XCircle, Clock, Database, Globe, Server, Wifi, WifiOff, Activity } from 'lucide-react';
import { useWebSocketStore } from '@/store/websocketStore';
import { api } from '@/services/apiClient';
import { connectionMonitor, ConnectionHealth } from '@/services/monitoring/connectionMonitor';
import { websocketService } from '@/services/websocket';

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  componentType: 'system' | 'datastore' | 'service' | 'external';
  observedValue?: any;
  observedUnit?: string;
  threshold?: any;
  message?: string;
  time: number;
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: HealthCheck[];
}

export const HealthStatus: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const { sendMessage, addMessageHandler, removeMessageHandler } = useWebSocketStore();

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await api.health();
        setHealth(response.data);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch health status:', error);
        // Create fallback health data when API is unavailable
        setHealth({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: 0,
          version: 'Unknown',
          checks: [
            {
              name: 'API Server',
              status: 'fail',
              componentType: 'service',
              message: 'Unable to connect to API server',
              time: 0
            }
          ]
        });
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchHealth();

    // Set up periodic refresh
    const interval = setInterval(fetchHealth, 30000); // Every 30 seconds

    // Start connection monitoring
    connectionMonitor.start();
    
    // Subscribe to connection health updates
    const unsubscribe = connectionMonitor.onHealthChange((health) => {
      setConnectionHealth(health);
    });

    // WebSocket updates
    const handleHealthUpdate = (message: any) => {
      if (message.type === 'monitoring:health:update') {
        setHealth(message.payload);
        setLastUpdate(new Date());
      }
    };

    addMessageHandler('health', handleHealthUpdate);

    return () => {
      clearInterval(interval);
      removeMessageHandler('health', handleHealthUpdate);
      unsubscribe();
      connectionMonitor.stop();
    };
  }, [sendMessage, addMessageHandler, removeMessageHandler]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return 'text-green-500';
      case 'degraded':
      case 'warn':
        return 'text-yellow-500';
      case 'unhealthy':
      case 'fail':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warn':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getComponentIcon = (type: string) => {
    switch (type) {
      case 'system':
        return <Server className="w-4 h-4" />;
      case 'datastore':
        return <Database className="w-4 h-4" />;
      case 'external':
        return <Globe className="w-4 h-4" />;
      default:
        return <Server className="w-4 h-4" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.join(' ') || '0m';
  };

  if (loading) {
    return (
      <div className="glass rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="glass rounded-lg p-6">
        <div className="text-center text-gray-500 dark:text-gray-400">
          Failed to load health status
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Heart className={`w-6 h-6 ${getStatusColor(health.status)}`} />
          <h2 className="text-xl font-semibold">System Health</h2>
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            health.status === 'healthy' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
            health.status === 'degraded' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' :
            'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
          }`}>
            {health.status.toUpperCase()}
          </span>
        </div>
        
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Updated {lastUpdate.toLocaleTimeString()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Uptime</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatUptime(health.uptime)}
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Version</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {health.version}
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Checks</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-green-500">
              {health.checks.filter(c => c.status === 'pass').length}
            </span>
            <span className="text-sm text-gray-500">/</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {health.checks.length}
            </span>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      {connectionHealth && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Connection Status
            </h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              connectionHealth.overall === 'healthy' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
              connectionHealth.overall === 'degraded' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' :
              'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
            }`}>
              {connectionHealth.overall.toUpperCase()}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              {connectionHealth.websocket.connected ? (
                <Wifi className="w-5 h-5 text-green-500" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-500" />
              )}
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  WebSocket
                </div>
                <div className="text-xs text-gray-500">
                  {connectionHealth.websocket.connected ? 'Connected' : 'Disconnected'}
                  {connectionHealth.websocket.latency > 0 && ` (${connectionHealth.websocket.latency}ms)`}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {connectionHealth.api.available ? (
                <Server className="w-5 h-5 text-green-500" />
              ) : (
                <Server className="w-5 h-5 text-red-500" />
              )}
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  API Server
                </div>
                <div className="text-xs text-gray-500">
                  {connectionHealth.api.available ? 'Available' : 'Unavailable'}
                  {connectionHealth.api.latency > 0 && ` (${connectionHealth.api.latency}ms)`}
                </div>
              </div>
            </div>
          </div>
          
          {(connectionHealth.websocket.reconnectAttempts > 0 || connectionHealth.websocket.errorCount > 0) && (
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {connectionHealth.websocket.reconnectAttempts > 0 && (
                <span>Reconnect attempts: {connectionHealth.websocket.reconnectAttempts}</span>
              )}
              {connectionHealth.websocket.errorCount > 0 && (
                <span className="ml-3">Errors: {connectionHealth.websocket.errorCount}</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Health Checks
        </h3>
        
        {health.checks.map((check, index) => (
          <div
            key={`${check.name}-${index}`}
            className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg"
          >
            <div className="flex items-center gap-3">
              {getStatusIcon(check.status)}
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                {getComponentIcon(check.componentType)}
                <span className="font-medium">{check.name}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {check.observedValue !== undefined && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">{check.observedValue}</span>
                  {check.observedUnit && <span> {check.observedUnit}</span>}
                  {check.threshold !== undefined && (
                    <span className="text-gray-500"> / {check.threshold}</span>
                  )}
                </div>
              )}
              
              <div className="text-sm text-gray-500">
                {check.time}ms
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};