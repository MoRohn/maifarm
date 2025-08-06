import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  TrendingUp, 
  DollarSign, 
  Clock, 
  AlertTriangle,
  Users,
  Cpu,
  HardDrive,
  Download,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Zap,
  Target,
  Shield,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Grid3x3,
  Filter,
  Calendar,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Brain,
  Gauge
} from 'lucide-react';
import { useAnalyticsStore } from '../../store/analyticsStore';
import { useThemeStore } from '../../store/themeStore';
import { useFarmStore } from '../../store/farmStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { analyticsService } from '../../services/analyticsService';
import { LineChart } from './Charts/LineChart';
import { BarChart } from './Charts/BarChart';
import { PieChart } from './Charts/PieChart';
import { HeatMap } from './Charts/HeatMap';
import { PerformanceMetrics } from './PerformanceMetrics';
import { ResourceUtilization } from './ResourceUtilization';
import { PredictiveInsights } from './PredictiveInsights';
import { InsightsSummary } from './InsightsSummary';
import { formatMetricValue, calculateTrend } from '../../utils/dataAggregation';
import { TimeRange, ClaudeCodeMetrics } from '../../types/analytics';
import toast from 'react-hot-toast';
import clsx from 'clsx';

// Claude Code API pricing (as of 2024)
const CLAUDE_API_PRICING = {
  'claude-3-opus': { input: 0.015, output: 0.075 }, // per 1K tokens
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-2.1': { input: 0.008, output: 0.024 },
  'claude-instant': { input: 0.0008, output: 0.0024 }
};

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  gradient: string;
  change?: number;
  subtitle?: string;
  onClick?: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, 
  value, 
  icon, 
  gradient, 
  change, 
  subtitle,
  onClick 
}) => (
  <motion.div
    whileHover={{ scale: 1.02, y: -4 }}
    whileTap={{ scale: 0.98 }}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    onClick={onClick}
    className={clsx(
      "relative overflow-hidden rounded-2xl p-6",
      "bg-white dark:bg-gray-800",
      "shadow-lg hover:shadow-xl",
      "transition-all duration-300",
      "border border-gray-100 dark:border-gray-700",
      "cursor-pointer group"
    )}
  >
    {/* Background gradient */}
    <div className={clsx(
      "absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity",
      gradient
    )} />
    
    {/* Content */}
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-4">
        <div className={clsx(
          "p-3 rounded-xl",
          gradient,
          "bg-opacity-10 dark:bg-opacity-20"
        )}>
          {icon}
        </div>
        {change !== undefined && (
          <div className={clsx(
            "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium",
            change >= 0 
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          )}>
            {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</p>
        <p className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
    
    {/* Hover effect */}
    <div className="absolute bottom-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
      <ChevronRight className="w-4 h-4 text-gray-400" />
    </div>
  </motion.div>
);

export const Analytics: React.FC = () => {
  const theme = useThemeStore((state) => state.theme);
  const farms = useFarmStore((state) => state.farms);
  const {
    overview,
    metrics,
    timeSeriesData,
    agentPerformance,
    taskCompletions,
    errors,
    predictions,
    selectedTimeRange,
    refreshInterval,
    isLoading,
    setMetrics,
    updateTimeSeriesData,
    updateAgentPerformance,
    setTimeRange,
    setRefreshInterval,
    setLoading,
    setError,
    setOverview,
  } = useAnalyticsStore();

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedView, setSelectedView] = useState<'overview' | 'performance' | 'costs' | 'insights'>('overview');
  const [selectedMetric, setSelectedMetric] = useState<'farms' | 'agents' | 'resources' | 'costs'>('farms');
  const [claudeMetrics, setClaudeMetrics] = useState<ClaudeCodeMetrics | null>(null);

  // WebSocket connection for real-time updates
  const { connected, lastMessage } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567',
    reconnect: true,
    reconnectAttempts: 10,
    reconnectDelay: 2000
  });

  // Calculate real Claude Code costs
  const calculateClaudeCosts = useMemo(() => {
    if (!claudeMetrics) return { total: 0, breakdown: {} };
    
    const model = claudeMetrics.modelType || 'claude-3-sonnet';
    const pricing = CLAUDE_API_PRICING[model as keyof typeof CLAUDE_API_PRICING] || CLAUDE_API_PRICING['claude-3-sonnet'];
    
    const inputCost = (claudeMetrics.tokensUsed * 0.7) / 1000 * pricing.input; // Assume 70% input tokens
    const outputCost = (claudeMetrics.tokensUsed * 0.3) / 1000 * pricing.output; // Assume 30% output tokens
    
    return {
      total: inputCost + outputCost,
      breakdown: {
        input: inputCost,
        output: outputCost,
        apiCalls: claudeMetrics.apiCalls,
        avgLatency: claudeMetrics.averageLatency
      }
    };
  }, [claudeMetrics]);

  // Load initial data
  useEffect(() => {
    loadAnalyticsData();
  }, [selectedTimeRange]);

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (lastMessage) {
      const { type, payload } = lastMessage;
      
      switch (type) {
        case 'analytics:update':
          if (payload.overview) setOverview(payload.overview);
          if (payload.metrics) setMetrics(payload.metrics);
          break;
        
        case 'metrics:realtime':
          if (payload.timeSeries) updateTimeSeriesData(payload.timeSeries);
          if (payload.agentPerformance) updateAgentPerformance(payload.agentPerformance);
          break;
        
        case 'costs:update':
          if (payload.claudeMetrics) setClaudeMetrics(payload.claudeMetrics);
          break;
        
        default:
          break;
      }
    }
  }, [lastMessage]);

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
      const allAgents = farms.flatMap(farm => farm.agents || []);

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

      // Load Claude Code metrics (mock for now, replace with real API call)
      setClaudeMetrics({
        apiCalls: Math.floor(Math.random() * 10000) + 5000,
        tokensUsed: Math.floor(Math.random() * 1000000) + 500000,
        costPerToken: 0.000003,
        totalCost: 0,
        averageLatency: Math.random() * 2 + 0.5,
        errorRate: Math.random() * 0.05,
        modelType: 'claude-3-sonnet',
        timestamp: new Date()
      });

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
      analyticsService.exportToCSV(agentPerformance, 'maifarm_analytics_report');
      toast.success('Analytics report exported successfully');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 p-8 mb-8">
        <div className="absolute inset-0 bg-grid-white/10 bg-[size:20px_20px]" />
        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <BarChart3 className="w-10 h-10" />
                Analytics Dashboard
              </h1>
              <p className="text-white/80 text-lg">
                Real-time insights into your MaiFarm operations
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Time Range Selector */}
              <select
                value={selectedTimeRange.preset}
                onChange={(e) => handleTimeRangeChange(e.target.value as TimeRange['preset'])}
                className="px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <option value="1h">Last Hour</option>
                <option value="6h">Last 6 Hours</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>

              {/* Auto Refresh Toggle */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-all",
                  autoRefresh
                    ? "bg-white/20 backdrop-blur-sm text-white"
                    : "bg-white/10 text-white/60"
                )}
              >
                <RefreshCw className={clsx("w-4 h-4", autoRefresh && "animate-spin")} />
                Auto Refresh
              </motion.button>

              {/* Export Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleExportData}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* Animated background elements */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute -top-24 -right-24 w-48 h-48 bg-white/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            rotate: [360, 180, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute -bottom-16 -left-16 w-32 h-32 bg-white/10 rounded-full blur-2xl"
        />
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
        {(['overview', 'performance', 'costs', 'insights'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setSelectedView(view)}
            className={clsx(
              "flex-1 px-4 py-2 rounded-lg capitalize font-medium transition-all",
              selectedView === view
                ? "bg-white dark:bg-gray-700 shadow-sm text-emerald-600 dark:text-emerald-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            )}
          >
            {view === 'overview' && <Grid3x3 className="w-4 h-4 inline mr-2" />}
            {view === 'performance' && <Activity className="w-4 h-4 inline mr-2" />}
            {view === 'costs' && <DollarSign className="w-4 h-4 inline mr-2" />}
            {view === 'insights' && <Brain className="w-4 h-4 inline mr-2" />}
            {view}
          </button>
        ))}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Active Farms"
          value={farms.filter(f => f.status === 'active').length}
          icon={<Sparkles className="w-6 h-6 text-emerald-600" />}
          gradient="bg-gradient-to-br from-emerald-400 to-green-600"
          change={12.5}
          subtitle={`${farms.length} total farms`}
          onClick={() => setSelectedMetric('farms')}
        />
        
        <MetricCard
          title="Success Rate"
          value={metrics ? `${((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(1)}%` : '0%'}
          icon={<Target className="w-6 h-6 text-blue-600" />}
          gradient="bg-gradient-to-br from-blue-400 to-indigo-600"
          change={2.4}
          subtitle={`${metrics?.completedTasks || 0} completed tasks`}
          onClick={() => setSelectedMetric('agents')}
        />
        
        <MetricCard
          title="Total Cost"
          value={`$${calculateClaudeCosts.total.toFixed(2)}`}
          icon={<DollarSign className="w-6 h-6 text-purple-600" />}
          gradient="bg-gradient-to-br from-purple-400 to-pink-600"
          change={-5.2}
          subtitle={`${claudeMetrics?.apiCalls || 0} API calls`}
          onClick={() => setSelectedMetric('costs')}
        />
        
        <MetricCard
          title="System Health"
          value="98.5%"
          icon={<Shield className="w-6 h-6 text-orange-600" />}
          gradient="bg-gradient-to-br from-orange-400 to-red-600"
          change={0.8}
          subtitle="All systems operational"
          onClick={() => setSelectedMetric('resources')}
        />
      </div>

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {selectedView === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Farm Performance Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <LineChartIcon className="w-5 h-5 text-emerald-500" />
                  Farm Performance Trends
                </h3>
                <div className="flex gap-2">
                  {(['farms', 'agents', 'resources'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSelectedMetric(m)}
                      className={clsx(
                        "px-3 py-1 rounded-lg text-sm font-medium transition-all",
                        selectedMetric === m
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      )}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              
              <LineChart
                data={timeSeriesData.filter((series) => {
                  switch (selectedMetric) {
                    case 'farms':
                      return ['Task Completion Rate', 'Farm Efficiency'].includes(series.label);
                    case 'agents':
                      return ['Agent Performance', 'Success Rate'].includes(series.label);
                    case 'resources':
                      return ['CPU Usage', 'Memory Usage'].includes(series.label);
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

            {/* Side Metrics */}
            <div className="space-y-6">
              {/* Resource Utilization */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-blue-500" />
                  Resource Utilization
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">CPU</span>
                      <span className="font-medium">67%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '67%' }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Memory</span>
                      <span className="font-medium">45%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '45%' }}
                        transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
                        className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Storage</span>
                      <span className="font-medium">32%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '32%' }}
                        transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                        className="bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  Quick Stats
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Avg Response Time</span>
                    <span className="text-sm font-medium">{claudeMetrics?.averageLatency.toFixed(2) || '0'}s</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Error Rate</span>
                    <span className="text-sm font-medium text-red-600">{((claudeMetrics?.errorRate || 0) * 100).toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Active Agents</span>
                    <span className="text-sm font-medium">{metrics?.activeAgents || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Tasks/Hour</span>
                    <span className="text-sm font-medium">{Math.floor((metrics?.totalTasks || 0) / 24)}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {selectedView === 'performance' && (
          <motion.div
            key="performance"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <PerformanceMetrics
              agents={agentPerformance}
              timeRange={selectedTimeRange}
            />
            
            {/* Agent Performance Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-4">Agent Performance Details</h3>
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
                        className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium">{agent.agentName}</td>
                        <td className="text-right py-3 px-4">{agent.tasksCompleted}</td>
                        <td className="text-right py-3 px-4">
                          <span className={clsx(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium",
                            agent.successRate >= 90 
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : agent.successRate >= 70
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          )}>
                            {agent.successRate >= 90 ? <CheckCircle2 className="w-3 h-3" /> :
                             agent.successRate >= 70 ? <AlertCircle className="w-3 h-3" /> :
                             <XCircle className="w-3 h-3" />}
                            {agent.successRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-right py-3 px-4">
                          {agent.averageResponseTime.toFixed(1)}s
                        </td>
                        <td className="text-right py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <span>{agent.resourceUsage.cpu.toFixed(1)}%</span>
                            <div className="w-12 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div 
                                className="bg-blue-500 h-1.5 rounded-full"
                                style={{ width: `${agent.resourceUsage.cpu}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <span>{agent.resourceUsage.memory.toFixed(1)}%</span>
                            <div className="w-12 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div 
                                className="bg-green-500 h-1.5 rounded-full"
                                style={{ width: `${agent.resourceUsage.memory}%` }}
                              />
                            </div>
                          </div>
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
          </motion.div>
        )}

        {selectedView === 'costs' && (
          <motion.div
            key="costs"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Cost Breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-purple-500" />
                Cost Breakdown
              </h3>
              <PieChart
                data={[
                  { label: 'Claude API', value: calculateClaudeCosts.total },
                  { label: 'Compute', value: metrics?.totalCost.compute || 0 },
                  { label: 'Storage', value: metrics?.totalCost.storage || 0 },
                  { label: 'Network', value: metrics?.totalCost.network || 0 },
                ]}
                height={300}
                innerRadius={60}
                animate={true}
              />
            </div>

            {/* Claude Code Metrics */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-500" />
                Claude Code Metrics
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Model</span>
                    <span className="text-sm font-medium">{claudeMetrics?.modelType || 'claude-3-sonnet'}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">API Calls</span>
                    <span className="text-sm font-medium">{claudeMetrics?.apiCalls.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Tokens Used</span>
                    <span className="text-sm font-medium">{claudeMetrics?.tokensUsed.toLocaleString() || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Avg Latency</span>
                    <span className="text-sm font-medium">{claudeMetrics?.averageLatency.toFixed(2) || 0}s</span>
                  </div>
                </div>
                
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Input Cost</span>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      ${calculateClaudeCosts.breakdown.input?.toFixed(4) || '0.00'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Output Cost</span>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      ${calculateClaudeCosts.breakdown.output?.toFixed(4) || '0.00'}
                    </span>
                  </div>
                  <div className="border-t border-emerald-200 dark:border-emerald-800 pt-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Total Cost</span>
                      <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                        ${calculateClaudeCosts.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cost Trends */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-4">Cost Trends</h3>
              <BarChart
                data={[
                  { label: 'Mon', value: 45.2 },
                  { label: 'Tue', value: 52.8 },
                  { label: 'Wed', value: 48.3 },
                  { label: 'Thu', value: 61.5 },
                  { label: 'Fri', value: 55.7 },
                  { label: 'Sat', value: 42.1 },
                  { label: 'Sun', value: 38.9 },
                ]}
                height={250}
                animate={true}
              />
            </div>
          </motion.div>
        )}

        {selectedView === 'insights' && (
          <motion.div
            key="insights"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <PredictiveInsights
              insights={[]}
              onRefresh={async () => {
                await analyticsService.refreshData();
              }}
            />
            <InsightsSummary />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection Status */}
      {!connected && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 right-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">Offline - Using cached data</span>
        </motion.div>
      )}
    </div>
  );
};

export default Analytics;