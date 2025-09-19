import React, { useState, useEffect } from 'react';
import { useHighAvailability } from '@/hooks/useHighAvailability';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { 
  Server, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  Zap,
  Shield,
  Database,
  Users
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const HADashboard: React.FC = () => {
  const {
    cluster,
    isLeader,
    nodeHealth,
    metrics,
    triggerFailover,
    rebalance,
    isFailoverInProgress,
  } = useHighAvailability();

  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const getNodeStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-500';
      case 'standby':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getNodeStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-5 h-5" />;
      case 'standby':
        return <Activity className="w-5 h-5" />;
      case 'failed':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Server className="w-5 h-5" />;
    }
  };

  const formatUptime = (lastHeartbeat: number) => {
    const uptime = Date.now() - lastHeartbeat;
    const days = Math.floor(uptime / (24 * 60 * 60 * 1000));
    const hours = Math.floor((uptime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (!cluster) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">High Availability not configured</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cluster Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              High Availability Cluster
            </span>
            <div className="flex items-center gap-2">
              {isLeader && (
                <Badge variant="success">Leader</Badge>
              )}
              <Badge variant={cluster.strategy === 'active-active' ? 'info' : 'secondary'}>
                {cluster.strategy}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Total Nodes</p>
              <p className="text-2xl font-bold">{cluster.nodes.length}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Active Nodes</p>
              <p className="text-2xl font-bold text-green-600">
                {cluster.nodes.filter(n => n.status === 'active').length}
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Failed Nodes</p>
              <p className="text-2xl font-bold text-red-600">
                {cluster.nodes.filter(n => n.status === 'failed').length}
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Cluster Health</p>
              <div className="flex items-center gap-2">
                <Progress 
                  value={nodeHealth} 
                  className="flex-1"
                />
                <span className="text-sm font-medium">{nodeHealth}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Node Status Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Node Status</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={rebalance}
                disabled={cluster.strategy !== 'active-active'}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Rebalance
              </Button>
              {isLeader && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={triggerFailover}
                  disabled={isFailoverInProgress}
                >
                  <Zap className="w-4 h-4 mr-1" />
                  Trigger Failover
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cluster.nodes.map((node) => (
              <div
                key={node.id}
                className={`
                  p-4 border rounded-lg cursor-pointer transition-all
                  ${selectedNode === node.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}
                  ${node.status === 'failed' ? 'border-red-200 bg-red-50 dark:bg-red-900/20' : ''}
                `}
                onClick={() => setSelectedNode(node.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={getNodeStatusColor(node.status)}>
                      {getNodeStatusIcon(node.status)}
                    </span>
                    <div>
                      <p className="font-medium">{node.id}</p>
                      <p className="text-xs text-gray-500">{node.url}</p>
                    </div>
                  </div>
                  {node.role === 'primary' && (
                    <Badge variant="default" size="sm">Primary</Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Load</span>
                    <span className="font-medium">{node.load}%</span>
                  </div>
                  <Progress value={node.load} className="h-2" />
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Uptime</span>
                    <span className="font-medium">{formatUptime(node.lastHeartbeat)}</span>
                  </div>
                  
                  {node.region && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Region</span>
                      <span className="font-medium">{node.region}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Response Time Chart */}
              <div>
                <h4 className="text-sm font-medium mb-4">Average Response Time</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={metrics.responseTimeHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3B82F6" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Node Utilization Chart */}
              <div>
                <h4 className="text-sm font-medium mb-4">Node Utilization</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={Object.entries(metrics.nodeUtilization).map(([node, util]) => ({
                    node: node.split('-').pop(),
                    utilization: util,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="node" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="utilization" fill="#10B981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 text-gray-500 mb-2">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Total Connections</span>
                </div>
                <p className="text-2xl font-bold">{metrics.totalConnections}</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 text-gray-500 mb-2">
                  <Activity className="w-4 h-4" />
                  <span className="text-sm">Avg Response Time</span>
                </div>
                <p className="text-2xl font-bold">{metrics.averageResponseTime.toFixed(0)}ms</p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 text-gray-500 mb-2">
                  <Database className="w-4 h-4" />
                  <span className="text-sm">Requests/sec</span>
                </div>
                <p className="text-2xl font-bold">{metrics.requestsPerSecond}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};