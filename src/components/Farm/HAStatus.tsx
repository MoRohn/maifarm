import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  BarChart3,
  Zap,
  Shield,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHighAvailability } from '../../hooks/useHighAvailability';

interface HAStatusProps {
  farmId: string;
  minimal?: boolean;
  showMetrics?: boolean;
  className?: string;
}

interface NodeStatusBadgeProps {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'initializing';
  size?: 'sm' | 'md' | 'lg';
}

const NodeStatusBadge: React.FC<NodeStatusBadgeProps> = ({ status, size = 'sm' }) => {
  const statusConfig = {
    healthy: { color: 'bg-green-500', icon: CheckCircle, text: 'Healthy' },
    unhealthy: { color: 'bg-red-500', icon: XCircle, text: 'Unhealthy' },
    degraded: { color: 'bg-yellow-500', icon: AlertTriangle, text: 'Degraded' },
    initializing: { color: 'bg-blue-500', icon: RefreshCw, text: 'Initializing' }
  };

  const config = statusConfig[status] || statusConfig.initializing;
  const Icon = config.icon;
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`${config.color} rounded-full p-0.5`}>
        <Icon className={`${sizeClasses[size]} text-white`} />
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {config.text}
      </span>
    </div>
  );
};

export const HAStatus: React.FC<HAStatusProps> = ({
  farmId,
  minimal = false,
  showMetrics = true,
  className = ''
}) => {
  const { 
    nodes, 
    metrics, 
    redundancyLevel,
    isHealthy,
    failoverHistory,
    refreshNodes
  } = useHighAvailability(farmId);

  const [expanded, setExpanded] = useState(!minimal);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    // Refresh nodes periodically
    const interval = setInterval(refreshNodes, 30000);
    return () => clearInterval(interval);
  }, [refreshNodes]);

  const getHealthyNodeCount = () => {
    return nodes.filter(node => node.status === 'healthy').length;
  };

  const getTotalCapacity = () => {
    return nodes.reduce((total, node) => {
      const available = 100 - ((node.cpuUsage + node.memoryUsage) / 2);
      return total + available;
    }, 0);
  };

  const getRedundancyColor = () => {
    if (redundancyLevel >= 3) return 'text-green-500';
    if (redundancyLevel >= 2) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md ${className}`}>
      {/* Header */}
      <div 
        className={`p-4 flex items-center justify-between ${minimal ? 'cursor-pointer' : ''}`}
        onClick={() => minimal && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isHealthy ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
            <Shield className={`w-5 h-5 ${isHealthy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              High Availability Status
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {getHealthyNodeCount()} of {nodes.length} nodes healthy
            </p>
          </div>
        </div>

        {minimal && (
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-gray-500" />
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            {/* Metrics Overview */}
            {showMetrics && (
              <div className="px-4 pb-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Server className="w-4 h-4 text-gray-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Active Nodes</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {getHealthyNodeCount()}/{nodes.length}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-4 h-4 text-gray-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Avg Response Time</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {metrics?.averageResponseTime?.toFixed(0) || 0}ms
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-gray-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Total Capacity</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {getTotalCapacity().toFixed(0)}%
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-4 h-4 text-gray-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Redundancy</span>
                  </div>
                  <p className={`text-2xl font-bold ${getRedundancyColor()}`}>
                    {redundancyLevel}x
                  </p>
                </div>
              </div>
            )}

            {/* Node List */}
            <div className="border-t border-gray-200 dark:border-gray-700">
              <div className="p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Agent Nodes
                </h4>
                <div className="space-y-2">
                  {nodes.map((node) => (
                    <motion.div
                      key={node.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`
                        p-3 rounded-lg border cursor-pointer transition-all
                        ${selectedNode === node.id 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }
                      `}
                      onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <NodeStatusBadge status={node.status} />
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {node.endpoint}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {node.metadata.region} - {node.metadata.zone}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs">
                          <div className="text-right">
                            <p className="text-gray-600 dark:text-gray-400">CPU</p>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {node.cpuUsage.toFixed(0)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-600 dark:text-gray-400">Memory</p>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {node.memoryUsage.toFixed(0)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-gray-600 dark:text-gray-400">Connections</p>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {node.activeConnections}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Node Details */}
                      <AnimatePresence>
                        {selectedNode === node.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"
                          >
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <p className="text-gray-600 dark:text-gray-400">Response Time</p>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {node.responseTime.toFixed(0)}ms
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600 dark:text-gray-400">Task Queue</p>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {node.taskQueue} pending
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600 dark:text-gray-400">Version</p>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {node.metadata.version}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600 dark:text-gray-400">Last Health Check</p>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {new Date(node.lastHealthCheck).toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                            
                            <div className="mt-3">
                              <p className="text-gray-600 dark:text-gray-400 mb-1">Capabilities</p>
                              <div className="flex flex-wrap gap-1">
                                {node.metadata.capabilities.map((cap) => (
                                  <span
                                    key={cap}
                                    className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300"
                                  >
                                    {cap}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Failover History */}
            {failoverHistory.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Recent Failovers
                </h4>
                <div className="space-y-2">
                  {failoverHistory.slice(0, 5).map((event, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        <span className="text-gray-700 dark:text-gray-300">
                          {event.fromNode} → {event.toNode}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};