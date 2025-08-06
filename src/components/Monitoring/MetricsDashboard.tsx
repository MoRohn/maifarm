import React, { useState, useEffect } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Activity, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react';
import { useMetrics } from '../../hooks/useMetrics';
import { MetricType, TimeSeries, AggregationType, FarmMetricsData } from '../../types/metrics';
import { formatDistanceToNow } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MetricsCardProps {
  title: string;
  value: number | string;
  unit?: string;
  change?: number;
  status?: 'good' | 'warning' | 'critical';
  icon?: React.ReactNode;
}

const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  unit,
  change,
  status = 'good',
  icon
}) => {
  const statusColors = {
    good: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10',
    warning: 'border-amber-500 bg-amber-50 dark:bg-amber-500/10',
    critical: 'border-red-500 bg-red-50 dark:bg-red-500/10'
  };

  const changeColors = {
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-red-600 dark:text-red-400',
    neutral: 'text-slate-600 dark:text-slate-400'
  };

  const getChangeColor = () => {
    if (!change) return changeColors.neutral;
    return change > 0 ? changeColors.positive : changeColors.negative;
  };

  return (
    <div className={`glass rounded-lg p-6 border ${statusColors[status]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</p>
          <div className="mt-2 flex items-baseline">
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">
              {value}
            </p>
            {unit && (
              <span className="ml-1 text-sm text-slate-600 dark:text-slate-400">{unit}</span>
            )}
          </div>
          {change !== undefined && (
            <p className={`mt-2 text-sm ${getChangeColor()}`}>
              {change > 0 ? <TrendingUp className="inline w-4 h-4 mr-1" /> : <TrendingDown className="inline w-4 h-4 mr-1" />}
              {Math.abs(change).toFixed(1)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="ml-4">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export const MetricsDashboard: React.FC = () => {
  const { 
    metrics, 
    systemMetrics, 
    farmMetrics, 
    agentMetrics,
    loading,
    error,
    refreshMetrics,
    getTimeSeries,
    aggregateMetrics
  } = useMetrics();

  const [selectedTimeRange, setSelectedTimeRange] = useState('1h');
  const [selectedMetric, setSelectedMetric] = useState('system.cpu');
  const [refreshInterval, setRefreshInterval] = useState(30000);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshMetrics();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, refreshMetrics]);

  // Calculate overview metrics
  const overviewMetrics = {
    systemHealth: (systemMetrics?.cpu ?? 0) < 80 && (systemMetrics?.memory ?? 0) < 80 ? 'good' : 
                  (systemMetrics?.cpu ?? 0) < 90 && (systemMetrics?.memory ?? 0) < 90 ? 'warning' : 'critical',
    totalAgents: farmMetrics.reduce((sum: number, fm: FarmMetricsData) => sum + fm.totalAgents, 0),
    activeAgents: farmMetrics.reduce((sum: number, fm: FarmMetricsData) => sum + fm.activeAgents, 0),
    avgResponseTime: farmMetrics.reduce((sum: number, fm: FarmMetricsData) => sum + fm.avgResponseTime, 0) / (farmMetrics.length || 1),
    errorRate: systemMetrics?.apiErrorRate || 0,
    throughput: systemMetrics?.apiRequestRate || 0
  };

  // Prepare chart data
  const cpuMemoryData = {
    labels: getTimeSeries('system.cpu', selectedTimeRange).map((p: any) => 
      new Date(p.timestamp).toLocaleTimeString()
    ),
    datasets: [
      {
        label: 'CPU Usage',
        data: getTimeSeries('system.cpu', selectedTimeRange).map((p: any) => p.value),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Memory Usage',
        data: getTimeSeries('system.memory', selectedTimeRange).map((p: any) => p.value),
        borderColor: 'rgb(168, 85, 247)',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        tension: 0.4,
        fill: true
      }
    ]
  };

  const throughputData = {
    labels: getTimeSeries('system.api_request_rate', selectedTimeRange).map((p: any) =>
      new Date(p.timestamp).toLocaleTimeString()
    ),
    datasets: [
      {
        label: 'API Request Rate',
        data: getTimeSeries('system.api_request_rate', selectedTimeRange).map((p: any) => p.value),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.4,
        fill: true
      }
    ]
  };

  const agentDistribution = {
    labels: ['Active', 'Idle', 'Error'],
    datasets: [{
      data: [
        overviewMetrics.activeAgents,
        overviewMetrics.totalAgents - overviewMetrics.activeAgents,
        agentMetrics.filter((a: any) => a.errorRate > 5).length
      ],
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(239, 68, 68, 0.8)'
      ],
      borderWidth: 0
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: 'rgb(148, 163, 184)'
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: 'rgb(148, 163, 184)'
        }
      },
      y: {
        grid: {
          color: 'rgba(148, 163, 184, 0.1)'
        },
        ticks: {
          color: 'rgb(148, 163, 184)'
        }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: 'rgb(148, 163, 184)'
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-lg p-6 border border-red-500 bg-red-50 dark:bg-red-500/10">
        <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Metrics Dashboard
        </h2>
        <div className="flex items-center gap-4">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="glass px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <option value="5m">Last 5 minutes</option>
            <option value="15m">Last 15 minutes</option>
            <option value="1h">Last hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
          </select>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="glass px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <option value={10000}>10s refresh</option>
            <option value={30000}>30s refresh</option>
            <option value={60000}>1m refresh</option>
            <option value={300000}>5m refresh</option>
          </select>
          <button
            onClick={refreshMetrics}
            className="btn btn-primary"
          >
            <Activity className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricsCard
          title="System Health"
          value={overviewMetrics.systemHealth === 'good' ? 'Healthy' : 
                 overviewMetrics.systemHealth === 'warning' ? 'Degraded' : 'Critical'}
          status={overviewMetrics.systemHealth as 'critical' | 'warning' | 'good' | undefined}
          icon={overviewMetrics.systemHealth === 'good' ? 
                <CheckCircle className="w-8 h-8 text-emerald-500" /> :
                <AlertCircle className="w-8 h-8 text-amber-500" />}
        />
        <MetricsCard
          title="Active Agents"
          value={overviewMetrics.activeAgents}
          unit={`/ ${overviewMetrics.totalAgents}`}
          change={((overviewMetrics.activeAgents / overviewMetrics.totalAgents) * 100) - 100}
          status="good"
        />
        <MetricsCard
          title="Avg Response Time"
          value={overviewMetrics.avgResponseTime.toFixed(2)}
          unit="ms"
          status={overviewMetrics.avgResponseTime < 100 ? 'good' : 
                  overviewMetrics.avgResponseTime < 200 ? 'warning' : 'critical'}
        />
        <MetricsCard
          title="Throughput"
          value={overviewMetrics.throughput.toFixed(0)}
          unit="req/s"
          change={10.5}
          status="good"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            System Resources
          </h3>
          <div className="h-64">
            <Line data={cpuMemoryData} options={chartOptions} />
          </div>
        </div>

        <div className="glass rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            API Throughput
          </h3>
          <div className="h-64">
            <Line data={throughputData} options={chartOptions} />
          </div>
        </div>

        <div className="glass rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Agent Distribution
          </h3>
          <div className="h-64">
            <Doughnut data={agentDistribution} options={doughnutOptions} />
          </div>
        </div>

        <div className="glass rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Top Agents by CPU
          </h3>
          <div className="space-y-2">
            {agentMetrics
              .sort((a: any, b: any) => b.cpu - a.cpu)
              .slice(0, 5)
              .map((agent: any) => (
                <div key={agent.agentId} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {agent.agentId}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          agent.cpu > 80 ? 'bg-red-500' :
                          agent.cpu > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${agent.cpu}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {agent.cpu.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Last Update */}
      <div className="text-sm text-slate-600 dark:text-slate-400 text-right">
        Last updated: {formatDistanceToNow(new Date(), { addSuffix: true })}
      </div>
    </div>
  );
};