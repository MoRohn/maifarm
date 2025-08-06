import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Server, Wifi, HardDrive, AlertTriangle, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import type { SystemHealthMetric } from '../../types/analytics';
import { formatPercentage, formatNumber } from '../../utils/format';

interface SystemHealthSummaryProps {
  health?: SystemHealthMetric;
}

export const SystemHealthSummary: React.FC<SystemHealthSummaryProps> = ({ health }) => {
  const healthData = health || generateMockHealthData();
  
  const overallHealth = calculateOverallHealth(healthData);
  const healthStatus = getHealthStatus(overallHealth);
  
  const metrics = [
    {
      label: 'Uptime',
      value: healthData.uptime,
      icon: Activity,
      format: 'percent',
      threshold: 99.9,
      inverse: false
    },
    {
      label: 'CPU Usage',
      value: healthData.cpuUsage,
      icon: Server,
      format: 'percent',
      threshold: 80,
      inverse: true
    },
    {
      label: 'Memory',
      value: healthData.memoryUsage,
      icon: HardDrive,
      format: 'percent',
      threshold: 75,
      inverse: true
    },
    {
      label: 'Network',
      value: healthData.networkLatency,
      icon: Wifi,
      format: 'ms',
      threshold: 100,
      inverse: true
    }
  ];

  const services = Object.entries(healthData.serviceStatus);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.0 }}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          System Health
        </h3>
        <div className={clsx(
          'flex items-center space-x-2 px-3 py-1 rounded-full',
          healthStatus.color === 'green' && 'bg-green-100 dark:bg-green-900/30',
          healthStatus.color === 'yellow' && 'bg-yellow-100 dark:bg-yellow-900/30',
          healthStatus.color === 'red' && 'bg-red-100 dark:bg-red-900/30'
        )}>
          {healthStatus.icon}
          <span className={clsx(
            'text-sm font-medium',
            healthStatus.color === 'green' && 'text-green-700 dark:text-green-300',
            healthStatus.color === 'yellow' && 'text-yellow-700 dark:text-yellow-300',
            healthStatus.color === 'red' && 'text-red-700 dark:text-red-300'
          )}>
            {healthStatus.label}
          </span>
        </div>
      </div>

      {/* Overall Health Score */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Overall Health Score</span>
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            {overallHealth.toFixed(0)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${overallHealth}%` }}
            transition={{ duration: 1, delay: 1.1 }}
            className={clsx(
              'h-2 rounded-full',
              overallHealth >= 90 && 'bg-green-500',
              overallHealth >= 70 && overallHealth < 90 && 'bg-yellow-500',
              overallHealth < 70 && 'bg-red-500'
            )}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const isHealthy = metric.inverse 
            ? metric.value <= metric.threshold
            : metric.value >= metric.threshold;
          
          return (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 + index * 0.05 }}
              className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <Icon className={clsx(
                  'w-4 h-4',
                  isHealthy ? 'text-green-500' : 'text-yellow-500'
                )} />
                <span className={clsx(
                  'text-xs font-medium',
                  isHealthy ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
                )}>
                  {isHealthy ? 'Good' : 'Warning'}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {metric.label}
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {metric.format === 'percent' 
                  ? formatPercentage(metric.value)
                  : `${metric.value}${metric.format}`}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Service Status */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          Service Status
        </p>
        <div className="space-y-1">
          {services.slice(0, 4).map(([name, status], index) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.3 + index * 0.05 }}
              className="flex items-center justify-between py-1"
            >
              <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                {name.replace(/_/g, ' ')}
              </span>
              <span className={clsx(
                'flex items-center space-x-1 text-xs font-medium',
                status === 'healthy' && 'text-green-600 dark:text-green-400',
                status === 'degraded' && 'text-yellow-600 dark:text-yellow-400',
                status === 'down' && 'text-red-600 dark:text-red-400'
              )}>
                {status === 'healthy' && <CheckCircle className="w-3 h-3" />}
                {status === 'degraded' && <AlertTriangle className="w-3 h-3" />}
                {status === 'down' && <AlertTriangle className="w-3 h-3" />}
                <span>{status}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

function calculateOverallHealth(health: SystemHealthMetric): number {
  const weights = {
    uptime: 0.3,
    cpu: 0.2,
    memory: 0.2,
    network: 0.1,
    services: 0.2
  };
  
  const uptimeScore = health.uptime;
  const cpuScore = Math.max(0, 100 - health.cpuUsage);
  const memoryScore = Math.max(0, 100 - health.memoryUsage);
  const networkScore = Math.max(0, 100 - (health.networkLatency / 2));
  
  const serviceValues = Object.values(health.serviceStatus);
  const healthyServices = serviceValues.filter(s => s === 'healthy').length;
  const serviceScore = (healthyServices / serviceValues.length) * 100;
  
  return (
    uptimeScore * weights.uptime +
    cpuScore * weights.cpu +
    memoryScore * weights.memory +
    networkScore * weights.network +
    serviceScore * weights.services
  );
}

function getHealthStatus(score: number) {
  if (score >= 90) {
    return {
      label: 'Healthy',
      color: 'green' as const,
      icon: <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
    };
  }
  if (score >= 70) {
    return {
      label: 'Degraded',
      color: 'yellow' as const,
      icon: <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
    };
  }
  return {
    label: 'Critical',
    color: 'red' as const,
    icon: <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
  };
}

function generateMockHealthData(): SystemHealthMetric {
  return {
    uptime: 99.95,
    errorRate: 0.12,
    avgResponseTime: 145,
    activeConnections: 42,
    memoryUsage: 62.5,
    cpuUsage: 45.8,
    diskUsage: 38.2,
    networkLatency: 23,
    serviceStatus: {
      api_server: 'healthy',
      websocket: 'healthy',
      database: 'healthy',
      cache: 'healthy',
      orchestrator: 'healthy',
      monitoring: 'degraded'
    }
  };
}