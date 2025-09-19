import { useEffect, useState } from 'react';
import {Activity, AlertTriangle, CheckCircle, DollarSign, TrendingDown, TrendingUp, Users} from 'lucide-react';
import { reportingService } from '@/services/reportingService';
import { predictiveAnalyticsService } from '@/services/predictiveAnalytics';
import { getAllAgentsFromFarms } from '@/utils/farmHelpers';
import { analyticsService } from '@/services/analyticsService';
import { useFarmStore } from '@/store/farmStore';
import { PerformanceMetrics, PredictiveInsight } from '@/types/reporting';
import { AgentPerformanceMetric } from '@/types/analytics';
import { PredictiveInsights } from './PredictiveInsights';
import { ReportGenerator } from './ReportGenerator';
import { PerformanceMetrics as PerformanceMetricsComponent } from './PerformanceMetrics';

export function AnalyticsOverview() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [insights, setInsights] = useState<PredictiveInsight[]>([]);
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformanceMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'insights' | 'reports'>('overview');
  const [timeframe, setTimeframe] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const { farms } = useFarmStore();

  useEffect(() => {
    loadAnalytics();
  }, [timeframe, farms]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const timeframes = {
        '1h': { hours: 1 },
        '24h': { hours: 24 },
        '7d': { days: 7 },
        '30d': { days: 30 }
      };
      
      const selectedTimeframe = timeframes[timeframe];
      const end = new Date();
      const start = new Date();
      
      if ('hours' in selectedTimeframe) {
        start.setHours(start.getHours() - selectedTimeframe.hours);
      } else {
        start.setDate(start.getDate() - selectedTimeframe.days);
      }

      const [metricsData, insightsData] = await Promise.all([
        reportingService.getPerformanceMetrics(undefined, { start, end }),
        predictiveAnalyticsService.getInsights()
      ]);

      setMetrics(metricsData);
      setInsights(insightsData);
      
      // Get agent performance data
      const allAgents = getAllAgentsFromFarms(farms);
      if (allAgents.length > 0) {
        const agentPerfData = await analyticsService.getAgentPerformanceMetrics(
          allAgents,
          { start, end, preset: timeframe }
        );
        setAgentPerformance(agentPerfData);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const MetricCard = ({ 
    title, 
    value, 
    unit, 
    change, 
    trend, 
    icon: Icon 
  }: { 
    title: string; 
    value: number | string; 
    unit?: string; 
    change?: number; 
    trend?: 'up' | 'down' | 'stable';
    icon: any;
  }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg">
          <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        {trend && (
          <div className={`flex items-center text-sm ${
            trend === 'up' ? 'text-green-600' : 
            trend === 'down' ? 'text-red-600' : 
            'text-gray-600'
          }`}>
            {trend === 'up' ? <TrendingUp className="h-4 w-4 mr-1" /> :
             trend === 'down' ? <TrendingDown className="h-4 w-4 mr-1" /> :
             null}
            {change !== undefined && `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}
          </div>
        )}
      </div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-semibold mt-1">
          {value}{unit && <span className="text-lg font-normal text-gray-500 dark:text-gray-400 ml-1">{unit}</span>}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Analytics Dashboard
        </h1>
        
        <div className="flex items-center space-x-4">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {(['1h', '24h', '7d', '30d'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {(['overview', 'performance', 'insights', 'reports'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm capitalize transition-colors ${
                activeTab === tab
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && metrics && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-4 gap-4">
              <MetricCard
                title="Total Tasks"
                value={metrics.taskMetrics.total}
                change={12.5}
                trend="up"
                icon={Activity}
              />
              <MetricCard
                title="Success Rate"
                value={((metrics.taskMetrics.completed / metrics.taskMetrics.total) * 100).toFixed(1)}
                unit="%"
                change={-2.3}
                trend="down"
                icon={CheckCircle}
              />
              <MetricCard
                title="Active Agents"
                value={metrics.agentMetrics.totalAgents}
                change={0}
                trend="stable"
                icon={Users}
              />
              <MetricCard
                title="Cost per Hour"
                value={`$${metrics.costMetrics.costPerHour.toFixed(2)}`}
                change={-5.8}
                trend="down"
                icon={DollarSign}
              />
            </div>

            {/* Performance Summary */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-medium mb-4">Resource Utilization</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-500 dark:text-gray-400">CPU</span>
                      <span className="text-sm font-medium">{metrics.resourceMetrics.avgCpu}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-emerald-500 h-2 rounded-full"
                        style={{ width: `${metrics.resourceMetrics.avgCpu}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Memory</span>
                      <span className="text-sm font-medium">{metrics.resourceMetrics.avgMemory}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-emerald-500 h-2 rounded-full"
                        style={{ width: `${metrics.resourceMetrics.avgMemory}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-medium mb-4">Task Performance</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Avg Duration</span>
                    <span className="font-medium">{metrics.taskMetrics.avgDuration}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Throughput</span>
                    <span className="font-medium">{metrics.taskMetrics.throughput}/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Error Rate</span>
                    <span className="font-medium">{metrics.agentMetrics.errorRate}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-medium mb-4">Cost Analysis</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Total Cost</span>
                    <span className="font-medium">${metrics.costMetrics.totalCost}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Cost per Task</span>
                    <span className="font-medium">${metrics.costMetrics.costPerTask.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Projected Monthly</span>
                    <span className="font-medium">${(metrics.costMetrics.costPerHour * 24 * 30).toFixed(0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Insights */}
            {insights.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-medium mb-4">Recent Insights</h3>
                <div className="space-y-3">
                  {insights.slice(0, 3).map((insight) => (
                    <div key={insight.id} className="flex items-start space-x-3">
                      <div className={`flex-shrink-0 p-1 rounded ${
                        insight.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/20' :
                        insight.severity === 'high' ? 'bg-orange-100 dark:bg-orange-900/20' :
                        'bg-yellow-100 dark:bg-yellow-900/20'
                      }`}>
                        <AlertTriangle className={`h-4 w-4 ${
                          insight.severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                          insight.severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
                          'text-yellow-600 dark:text-yellow-400'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{insight.title}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {insight.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'performance' && metrics && (
          <PerformanceMetricsComponent 
            agents={agentPerformance} 
            timeRange={{
              start: new Date(Date.now() - (timeframe === '1h' ? 3600000 : timeframe === '24h' ? 86400000 : timeframe === '7d' ? 604800000 : 2592000000)),
              end: new Date(),
              preset: timeframe
            }} 
          />
        )}

        {activeTab === 'insights' && (
          <PredictiveInsights insights={insights} onRefresh={loadAnalytics} />
        )}

        {activeTab === 'reports' && (
          <ReportGenerator />
        )}
      </div>
    </div>
  );
}