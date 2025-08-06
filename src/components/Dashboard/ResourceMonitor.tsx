import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cpu, 
  HardDrive, 
  Network, 
  Zap,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Activity
} from 'lucide-react';
import { clsx } from 'clsx';
import { useWebSocketStore } from '../../store/websocketStore';
import { format } from 'date-fns';

interface ResourceData {
  cpu: number;
  memory: number;
  network: number;
  disk: number;
  timestamp: Date;
}

interface Alert {
  id: string;
  type: 'warning' | 'critical';
  resource: 'cpu' | 'memory' | 'network' | 'disk';
  value: number;
  threshold: number;
  timestamp: Date;
}

interface ResourceMonitorProps {
  className?: string;
  showAlerts?: boolean;
  compact?: boolean;
}

export const ResourceMonitor: React.FC<ResourceMonitorProps> = ({ 
  className,
  showAlerts = true,
  compact = false
}) => {
  const [resources, setResources] = useState<ResourceData>({
    cpu: 0,
    memory: 0,
    network: 0,
    disk: 0,
    timestamp: new Date()
  });

  const [history, setHistory] = useState<ResourceData[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const { subscribe } = useWebSocketStore();

  useEffect(() => {
    const handleResourceUpdate = (data: ResourceData) => {
      setResources(data);
      setHistory(prev => [...prev.slice(-29), data].slice(-30));
      
      // Check for alerts
      const newAlerts: Alert[] = [];
      if (data.cpu > 90) {
        newAlerts.push({
          id: `cpu-${Date.now()}`,
          type: 'critical',
          resource: 'cpu',
          value: data.cpu,
          threshold: 90,
          timestamp: new Date()
        });
      } else if (data.cpu > 80) {
        newAlerts.push({
          id: `cpu-${Date.now()}`,
          type: 'warning',
          resource: 'cpu',
          value: data.cpu,
          threshold: 80,
          timestamp: new Date()
        });
      }

      if (data.memory > 85) {
        newAlerts.push({
          id: `memory-${Date.now()}`,
          type: data.memory > 95 ? 'critical' : 'warning',
          resource: 'memory',
          value: data.memory,
          threshold: 85,
          timestamp: new Date()
        });
      }

      if (newAlerts.length > 0) {
        setAlerts(prev => [...newAlerts, ...prev].slice(0, 5));
      }
    };

    const unsubscribeResource = subscribe('resource:usage', handleResourceUpdate);

    // Simulate initial data
    const mockData: ResourceData = {
      cpu: 45 + Math.random() * 30,
      memory: 60 + Math.random() * 20,
      network: Math.random() * 100,
      disk: 70 + Math.random() * 10,
      timestamp: new Date()
    };
    handleResourceUpdate(mockData);

    return () => {
      unsubscribeResource();
    };
  }, [subscribe]);

  const getTrend = (current: number, history: ResourceData[], key: keyof ResourceData) => {
    if (history.length < 2) return 0;
    const previous = history[history.length - 2][key] as number;
    return current - previous;
  };

  const ResourceCard = ({ 
    label, 
    value, 
    icon: Icon, 
    color,
    trend,
    threshold = { warning: 80, critical: 90 }
  }: {
    label: string;
    value: number;
    icon: React.FC<any>;
    color: string;
    trend: number;
    threshold?: { warning: number; critical: number };
  }) => {
    const status = value >= threshold.critical ? 'critical' : 
                   value >= threshold.warning ? 'warning' : 'normal';

    const statusColors = {
      normal: 'text-green-600 dark:text-green-400',
      warning: 'text-yellow-600 dark:text-yellow-400',
      critical: 'text-red-600 dark:text-red-400'
    };

    const progressColors = {
      normal: color,
      warning: '#eab308',
      critical: '#ef4444'
    };

    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        className={clsx(
          'bg-white dark:bg-gray-900 rounded-apple-lg p-4 shadow-apple border border-gray-200 dark:border-gray-800',
          compact && 'p-3'
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className={clsx(
              'p-2 rounded-apple',
              status === 'critical' ? 'bg-red-100 dark:bg-red-900/30' :
              status === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
              'bg-gray-100 dark:bg-gray-800'
            )}>
              <Icon className={clsx('w-5 h-5', statusColors[status])} />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                {label}
              </h4>
              {!compact && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {status === 'critical' ? 'Critical' : 
                   status === 'warning' ? 'Warning' : 'Normal'}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {value.toFixed(1)}%
            </p>
            <div className={clsx(
              'flex items-center justify-end space-x-1 text-sm',
              trend > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
            )}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <motion.div
            className="h-2 rounded-full transition-all duration-300"
            style={{ 
              width: `${value}%`,
              backgroundColor: progressColors[status]
            }}
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </motion.div>
    );
  };

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Resource Cards Grid */}
      <div className={clsx(
        'grid gap-4',
        compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
      )}>
        <ResourceCard
          label="CPU Usage"
          value={resources.cpu}
          icon={Cpu}
          color="#3b82f6"
          trend={getTrend(resources.cpu, history, 'cpu')}
        />
        <ResourceCard
          label="Memory"
          value={resources.memory}
          icon={HardDrive}
          color="#10b981"
          trend={getTrend(resources.memory, history, 'memory')}
          threshold={{ warning: 75, critical: 85 }}
        />
        <ResourceCard
          label="Network I/O"
          value={resources.network}
          icon={Network}
          color="#8b5cf6"
          trend={getTrend(resources.network, history, 'network')}
          threshold={{ warning: 85, critical: 95 }}
        />
        <ResourceCard
          label="Disk Usage"
          value={resources.disk}
          icon={HardDrive}
          color="#f59e0b"
          trend={getTrend(resources.disk, history, 'disk')}
          threshold={{ warning: 80, critical: 90 }}
        />
      </div>

      {/* Alerts Section */}
      {showAlerts && alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-900 rounded-apple-lg p-4 shadow-apple border border-gray-200 dark:border-gray-800"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Resource Alerts
          </h3>
          <div className="space-y-2">
            <AnimatePresence>
              {alerts.map((alert) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={clsx(
                    'flex items-center space-x-3 p-3 rounded-apple',
                    alert.type === 'critical' 
                      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  )}
                >
                  <AlertTriangle className={clsx(
                    'w-5 h-5',
                    alert.type === 'critical' 
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-yellow-600 dark:text-yellow-400'
                  )} />
                  <div className="flex-1">
                    <p className={clsx(
                      'font-medium',
                      alert.type === 'critical'
                        ? 'text-red-900 dark:text-red-100'
                        : 'text-yellow-900 dark:text-yellow-100'
                    )}>
                      {alert.resource.toUpperCase()} usage {alert.type === 'critical' ? 'critical' : 'high'}
                    </p>
                    <p className={clsx(
                      'text-sm',
                      alert.type === 'critical'
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-yellow-700 dark:text-yellow-300'
                    )}>
                      {alert.value.toFixed(1)}% - exceeds {alert.threshold}% threshold
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {format(alert.timestamp, 'HH:mm:ss')}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* System Health Summary */}
      {!compact && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-apple-lg p-4 border border-primary-200 dark:border-primary-800"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white dark:bg-gray-900 rounded-apple shadow-sm">
                <Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">
                  System Health
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {alerts.some(a => a.type === 'critical') ? 'Critical issues detected' :
                   alerts.length > 0 ? 'Some resources need attention' :
                   'All systems operating normally'}
                </p>
              </div>
            </div>
            <div className={clsx(
              'flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium',
              alerts.some(a => a.type === 'critical')
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : alerts.length > 0
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            )}>
              {alerts.some(a => a.type === 'critical') ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              <span>
                {alerts.some(a => a.type === 'critical') ? 'Critical' :
                 alerts.length > 0 ? 'Warning' : 'Healthy'}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};