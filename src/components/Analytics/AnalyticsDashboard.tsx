import React, { useEffect, useState } from 'react';
import {Activity, DollarSign, Download, RefreshCw, TrendingUp, Users} from 'lucide-react';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useThemeStore } from '@/store/themeStore';
import { useFarmStore } from '@/store/farmStore';
import { analyticsService } from '@/services/analyticsService';
import { getAllAgentsFromFarms } from '@/utils/farmHelpers';
import { LineChart } from './Charts/LineChart';
import { PieChart } from './Charts/PieChart';
import { PerformanceMetrics } from './PerformanceMetrics';
import { ResourceUtilization } from './ResourceUtilization';
import { formatMetricValue } from '@/utils/dataAggregation';
import {TimeRange} from '@/types/analytics';
import toast from 'react-hot-toast';

export const AnalyticsDashboard: React.FC = () => {
  // const theme = useThemeStore((state) => state.theme); // Currently unused
  const farms = useFarmStore((state) => state.farms);
  const {
    metrics,
    timeSeriesData,
    agentPerformance,
    // taskCompletions,  // Currently unused
    errors,
    selectedTimeRange,
    refreshInterval,
    // isLoading,  // Currently unused
    setMetrics,
    updateTimeSeriesData,
    updateAgentPerformance,
    setTimeRange,
    // setRefreshInterval,  // Currently unused
    setLoading,
    setError,
  } = useAnalyticsStore();

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<'performance' | 'resources' | 'costs' | 'errors'>('performance');

  // Load initial data
  useEffect(() => {
    loadAnalyticsData();
  }, [selectedTimeRange]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadAnalyticsData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, selectedTimeRange]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);

      // Get all agents from farms
      const allAgents = getAllAgentsFromFarms(farms);

      // Load aggregated metrics
      const aggregatedMetrics = await analyticsService.calculateAggregatedMetrics(
        selectedTimeRange,
        farms,
        allAgents
      );
      setMetrics(aggregatedMetrics);

      // Load time series data
      const timeSeries = analyticsService.generateMockTimeSeriesData(selectedTimeRange);
      updateTimeSeriesData(timeSeries);

      // Load agent performance
      const performance = await analyticsService.getAgentPerformanceMetrics(
        allAgents,
        selectedTimeRange
      );
      updateAgentPerformance(performance);

      setLoading(false);
    } catch (error) {
      console.error('Failed to load analytics data:', error);
      setError('Failed to load analytics data');
      setLoading(false);
      toast.error('Failed to load analytics data');
    }
  };

  const handleTimeRangeChange = (preset: TimeRange['preset']) => {
    const now = new Date();
    let start: Date;

    switch (preset) {
      case '1h':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    setTimeRange({ start, end: now, preset });
  };

  const handleExportData = () => {
    if (metrics && agentPerformance.length > 0) {
      analyticsService.exportToCSV(agentPerformance, 'agent_performance_report');
      toast.success('Report exported successfully');
    }
  };

  const getMetricCard = (
    title: string,
    value: string | number,
    icon: React.ReactNode,
    color: string,
    change?: number
  ) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
          {change !== undefined && (
            <p className={`text-sm mt-2 flex items-center ${
              change >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              <TrendingUp className={`w-4 h-4 mr-1 ${change < 0 ? 'rotate-180' : ''}`} />
              {Math.abs(change).toFixed(1)}%
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Monitor performance, resources, and insights
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Time Range Selector */}
          <select
            value={selectedTimeRange.preset}
            onChange={(e) => handleTimeRangeChange(e.target.value as TimeRange['preset'])}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              autoRefresh
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </button>

          {/* Export Button */}
          <button
            onClick={handleExportData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {getMetricCard(
          'Total Tasks',
          metrics?.totalTasks || 0,
          <Activity className="w-6 h-6 text-white" />,
          'bg-blue-500',
          15.3
        )}
        {getMetricCard(
          'Success Rate',
          formatMetricValue(
            metrics ? (metrics.completedTasks / metrics.totalTasks) * 100 : 0,
            '%'
          ),
          <TrendingUp className="w-6 h-6 text-white" />,
          'bg-green-500',
          2.4
        )}
        {getMetricCard(
          'Total Cost',
          `$${metrics?.totalCost.total.toFixed(2) || '0.00'}`,
          <DollarSign className="w-6 h-6 text-white" />,
          'bg-purple-500',
          -5.2
        )}
        {getMetricCard(
          'Active Agents',
          metrics?.activeAgents || 0,
          <Users className="w-6 h-6 text-white" />,
          'bg-orange-500',
          0
        )}
      </div>

      {/* Metric Tabs */}
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700">
        {(['performance', 'resources', 'costs', 'errors'] as const).map((metric) => (
          <button
            key={metric}
            onClick={() => setSelectedMetric(metric)}
            className={`pb-2 px-4 capitalize transition-colors ${
              selectedMetric === metric
                ? 'border-b-2 border-emerald-500 text-emerald-500'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {metric}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time Series Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">
            {selectedMetric === 'performance' && 'Performance Trends'}
            {selectedMetric === 'resources' && 'Resource Usage'}
            {selectedMetric === 'costs' && 'Cost Analysis'}
            {selectedMetric === 'errors' && 'Error Rate'}
          </h3>
          <LineChart
            data={timeSeriesData.filter((series) => {
              switch (selectedMetric) {
                case 'performance':
                  return ['Task Completion Rate', 'CPU Usage'].includes(series.label);
                case 'resources':
                  return ['CPU Usage', 'Memory Usage'].includes(series.label);
                case 'costs':
                  return series.label === 'Cost per Hour';
                case 'errors':
                  return series.label === 'Error Rate';
                default:
                  return true;
              }
            })}
            height={300}
            showLegend={true}
            animate={true}
            timeRange={selectedTimeRange.preset === '1h' ? 'hour' : 'day'}
          />
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {selectedMetric === 'performance' && (
            <PerformanceMetrics
              agents={agentPerformance}
              timeRange={selectedTimeRange}
            />
          )}
          
          {selectedMetric === 'resources' && (
            <ResourceUtilization
              utilization={metrics?.resourceUtilization}
              agents={agentPerformance}
            />
          )}

          {selectedMetric === 'costs' && metrics && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Cost Breakdown</h3>
              <PieChart
                data={[
                  { label: 'Compute', value: metrics.totalCost.compute },
                  { label: 'Storage', value: metrics.totalCost.storage },
                  { label: 'Network', value: metrics.totalCost.network },
                  { label: 'API', value: metrics.totalCost.api },
                ]}
                height={300}
                innerRadius={60}
                animate={true}
              />
            </div>
          )}

          {selectedMetric === 'errors' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Recent Errors</h3>
              <div className="space-y-3">
                {errors.slice(0, 5).map((error) => (
                  <div
                    key={error.errorId}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{error.errorType}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {error.message}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        error.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        error.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                        error.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {error.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Agent Performance Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Agent Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4">Agent</th>
                <th className="text-right py-3 px-4">Tasks</th>
                <th className="text-right py-3 px-4">Success Rate</th>
                <th className="text-right py-3 px-4">Avg Response</th>
                <th className="text-right py-3 px-4">CPU</th>
                <th className="text-right py-3 px-4">Memory</th>
                <th className="text-right py-3 px-4">Cost/Hour</th>
              </tr>
            </thead>
            <tbody>
              {agentPerformance.slice(0, 10).map((agent) => (
                <tr
                  key={agent.agentId}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                >
                  <td className="py-3 px-4 font-medium">{agent.agentName}</td>
                  <td className="text-right py-3 px-4">{agent.tasksCompleted}</td>
                  <td className="text-right py-3 px-4">
                    <span className={`${
                      agent.successRate >= 90 ? 'text-green-600' :
                      agent.successRate >= 70 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {agent.successRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right py-3 px-4">
                    {agent.averageResponseTime.toFixed(1)}s
                  </td>
                  <td className="text-right py-3 px-4">
                    {agent.resourceUsage.cpu.toFixed(1)}%
                  </td>
                  <td className="text-right py-3 px-4">
                    {agent.resourceUsage.memory.toFixed(1)}%
                  </td>
                  <td className="text-right py-3 px-4">
                    ${agent.costMetrics.total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};