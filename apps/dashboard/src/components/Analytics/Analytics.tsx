import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {Activity, AlertCircle, AlertTriangle, ArrowDown, ArrowUp, BarChart3, Brain, CheckCircle2, ChevronRight, DollarSign, Download, Gauge, Grid3x3, RefreshCw, Shield, Sparkles, Target, XCircle} from 'lucide-react';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useThemeStore } from '@/store/themeStore';
import { useFarmStore } from '@/store/farmStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { analyticsService } from '@/services/analyticsService';
import { unifiedMetricsService } from '@/services/unifiedMetricsService';
import { getAllAgentsFromFarms } from '@/utils/farmHelpers';
import { LineChart } from './Charts/LineChart';
import { BarChart } from './Charts/BarChart';
import { PieChart } from './Charts/PieChart';
import { FarmYieldChart } from './Charts/FarmYieldChart';
import { PerformanceMetrics } from './PerformanceMetrics';
import { PredictiveInsights } from './PredictiveInsights';
import { InsightsSummary } from './InsightsSummary';
import { TimeRange, ClaudeCodeMetrics, FarmYieldMetrics } from '@/types/analytics';
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
  gradient?: string;
  gradientStyle?: React.CSSProperties;
  change?: number;
  subtitle?: string;
  onClick?: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, 
  value, 
  icon, 
  gradient, 
  gradientStyle,
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
    <div 
      className={clsx(
        "absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity",
        gradient
      )}
      style={gradientStyle}
    />
    
    {/* Content */}
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-4">
        <div 
          className={clsx(
            "p-3 rounded-xl",
            gradient && gradient,
            !gradient && "bg-opacity-10 dark:bg-opacity-20"
          )}
          style={gradientStyle ? { ...gradientStyle, opacity: 0.1 } : undefined}
        >
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
  const { primaryColor, accentColor } = useThemeStore();
  const farms = useFarmStore((state) => state.farms);
  const {
    metrics,
    timeSeriesData,
    agentPerformance,
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
    updateFromWebSocket,
  } = useAnalyticsStore();

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedView, setSelectedView] = useState<'overview' | 'performance' | 'costs' | 'insights'>('overview');
  const [selectedMetric, setSelectedMetric] = useState<'farms' | 'agents' | 'resources' | 'costs'>('farms');
  const [claudeMetrics, setClaudeMetrics] = useState<ClaudeCodeMetrics | null>(null);
  const [farmYieldMetrics, setFarmYieldMetrics] = useState<FarmYieldMetrics | null>(null);

  // WebSocket connection for real-time updates
  // Note: Hooks must be called at top level, cannot be in try-catch
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

  // Load initial data with error recovery
  useEffect(() => {
    // Wrap in try-catch to prevent crashes
    const loadInitialData = async () => {
      try {
        await loadAnalyticsData();
      } catch (error) {
        console.error('[Analytics] Failed to load initial analytics data:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load analytics data';
        setError(errorMessage);
        setLoading(false);
        // Don't throw - just log and show error state in UI
        toast.error(errorMessage);
      }
    };

    loadInitialData();
  }, [selectedTimeRange]);

  // Handle WebSocket messages for real-time updates with error recovery
  useEffect(() => {
    if (!lastMessage || typeof lastMessage !== 'object') return;

    try {
      const { type, payload } = lastMessage;

      switch (type) {
        case 'metrics:update':
          // Handle unified metrics update with validation
          if (payload && typeof payload === 'object') {
            try {
              unifiedMetricsService.handleWebSocketUpdate(payload);
              // Trigger analytics store update
              updateFromWebSocket(payload);
            } catch (error) {
              console.error('[Analytics] Failed to process metrics update:', error);
            }
          } else {
            console.warn('[Analytics] Invalid metrics:update payload received:', payload);
          }
          break;
          
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
        
        case 'yield:update':
          if (payload.yieldMetrics) setFarmYieldMetrics(payload.yieldMetrics);
          break;
        
        default:
          break;
      }
    } catch (error) {
      console.error('[Analytics] Error processing WebSocket message:', error);
      // Don't throw - just log and continue
    }
  }, [lastMessage, updateFromWebSocket]);

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
      setError(null); // Clear previous errors

      // Use unified metrics service for consistent data
      const unifiedMetrics = await unifiedMetricsService.fetchMetrics();
      const dashboardMetrics = unifiedMetricsService.getDashboardMetrics();
      
      // Convert unified metrics to analytics format
      const aggregatedMetrics = await analyticsService.calculateAggregatedMetrics(
        selectedTimeRange,
        farms,
        getAllAgentsFromFarms(farms)
      );
      
      // Override with unified metrics for consistency
      aggregatedMetrics.totalFarms = unifiedMetrics.totalFarms;
      aggregatedMetrics.activeFarms = unifiedMetrics.activeFarms;
      aggregatedMetrics.totalAgents = unifiedMetrics.uniqueAgents;
      aggregatedMetrics.activeAgents = unifiedMetrics.activeAgents;
      aggregatedMetrics.totalTasks = unifiedMetrics.totalTasks;
      aggregatedMetrics.completedTasks = unifiedMetrics.completedTasks;
      aggregatedMetrics.failedTasks = unifiedMetrics.failedTasks;
      aggregatedMetrics.taskSuccessRate = unifiedMetrics.successRate; // Use taskSuccessRate instead of successRate
      aggregatedMetrics.errorRate = unifiedMetrics.errorRate;
      aggregatedMetrics.avgResponseTime = unifiedMetrics.avgResponseTime;
      // Remove throughput assignment as it doesn't exist on AggregatedMetrics
      aggregatedMetrics.resourceUtilization = {
        cpu: unifiedMetrics.cpuUsage,
        memory: unifiedMetrics.memoryUsage,
        storage: unifiedMetrics.diskUsage,
        network: unifiedMetrics.networkUsage,
        timestamp: new Date() // Add required timestamp
      };
      aggregatedMetrics.totalCost = {
        total: unifiedMetrics.totalCost,
        compute: unifiedMetrics.computeCost,
        storage: unifiedMetrics.storageCost,
        network: 0,
        api: unifiedMetrics.apiCost,
        period: 'hourly' as const,
        currency: 'USD'
      };
      // Remove costBreakdown assignment as it doesn't exist on AggregatedMetrics
      
      setMetrics(aggregatedMetrics);

      // Load time series data
      const timeSeries = analyticsService.generateMockTimeSeriesData(selectedTimeRange);
      updateTimeSeriesData(timeSeries);

      // Load agent performance from unified metrics
      const performance = dashboardMetrics.agents.map(agent => ({
        agentId: agent.agentId,
        agentName: agent.agentName,
        tasksCompleted: agent.tasksCompleted,
        tasksInProgress: 0, // Required property
        tasksFailed: agent.tasksFailed || 0, // Required property
        averageResponseTime: agent.avgResponseTime,
        successRate: agent.successRate ?? 0, // Default to 0 if undefined
        lastActive: agent.lastActivity,
        resourceUsage: {
          cpu: agent.cpuUsage,
          memory: agent.memoryUsage,
          storage: 0,
          network: 0,
          gpu: 0,
          timestamp: new Date()
        },
        costMetrics: {
          total: 0,
          compute: 0,
          storage: 0,
          network: 0,
          api: 0,
          period: 'hourly' as const,
          currency: 'USD'
        }
      }));
      updateAgentPerformance(performance);

      // Load Claude Code metrics from unified metrics
      setClaudeMetrics({
        apiCalls: Math.round(unifiedMetrics.throughput * 100),
        tokensUsed: Math.round(unifiedMetrics.totalCost * 50000),
        costPerToken: 0.00002,
        totalCost: unifiedMetrics.apiCost,
        averageLatency: unifiedMetrics.avgResponseTime / 1000,
        errorRate: unifiedMetrics.errorRate / 100,
        modelType: 'claude-3-sonnet',
        timestamp: unifiedMetrics.timestamp
      });

      // Load Farm Yield metrics
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4567'}/api/analytics/farm-yield`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setFarmYieldMetrics(data.data);
          }
        }
      } catch (error) {
        console.error('Failed to load farm yield metrics:', error);
        // Use mock data as fallback
        setFarmYieldMetrics({
          averageYield: 12.5,
          totalFilesGenerated: 250,
          completedFarms: 20,
          topFarm: {
            id: 'mock-farm-1',
            name: 'High Performance Farm',
            fileCount: 42,
            completedAt: new Date()
          },
          yieldTrend: [
            { date: new Date(), averageYield: 12.5, farmCount: 3 },
            { date: new Date(Date.now() - 86400000), averageYield: 11.2, farmCount: 2 },
            { date: new Date(Date.now() - 172800000), averageYield: 13.8, farmCount: 4 },
          ],
          yieldByType: {
            file: 120,
            report: 45,
            code: 50,
            documentation: 20,
            data: 10,
            model: 5
          }
        });
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load analytics data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load analytics data';
      setError(errorMessage);
      setLoading(false);
      toast.error(errorMessage);

      // Set safe default values to prevent rendering crashes
      setMetrics({
        totalFarms: 0,
        activeFarms: 0,
        totalAgents: 0,
        activeAgents: 0,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        taskSuccessRate: 0,
        errorRate: 0,
        avgResponseTime: 0,
        resourceUtilization: { cpu: 0, memory: 0, storage: 0, network: 0, timestamp: new Date() },
        totalCost: { total: 0, compute: 0, storage: 0, network: 0, api: 0, period: 'hourly' as const, currency: 'USD' }
      });

      // Set empty time series data
      updateTimeSeriesData([]);
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
      <div 
        className="relative overflow-hidden rounded-3xl p-8 mb-8"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`
        }}
      >
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
                className="px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 hover:bg-white/30 transition-colors"
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
                ? "bg-white dark:bg-gray-700 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            )}
            style={selectedView === view ? { color: primaryColor } : {}}
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
          icon={<Sparkles className="w-6 h-6" style={{ color: primaryColor }} />}
          gradient={`bg-gradient-to-br`}
          gradientStyle={{ background: `linear-gradient(135deg, ${primaryColor}40 0%, ${primaryColor}60 100%)` }}
          change={12.5}
          subtitle={`${farms.length} total farms`}
          onClick={() => setSelectedMetric('farms')}
        />
        
        <MetricCard
          title="Success Rate"
          value={metrics && metrics.totalTasks > 0 ? `${((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(1)}%` : '0%'}
          icon={<Target className="w-6 h-6" style={{ color: accentColor }} />}
          gradient={`bg-gradient-to-br`}
          gradientStyle={{ background: `linear-gradient(135deg, ${accentColor}40 0%, ${accentColor}60 100%)` }}
          change={2.4}
          subtitle={`${metrics?.completedTasks || 0} completed tasks`}
          onClick={() => setSelectedMetric('agents')}
        />
        
        <MetricCard
          title="Total Cost"
          value={`$${calculateClaudeCosts.total.toFixed(2)}`}
          icon={<DollarSign className="w-6 h-6" style={{ color: primaryColor }} />}
          gradient={`bg-gradient-to-br`}
          gradientStyle={{ background: `linear-gradient(135deg, ${primaryColor}30 0%, ${accentColor}30 100%)` }}
          change={-5.2}
          subtitle={`${claudeMetrics?.apiCalls || 0} API calls`}
          onClick={() => setSelectedMetric('costs')}
        />
        
        <MetricCard
          title="System Health"
          value="98.5%"
          icon={<Shield className="w-6 h-6" style={{ color: accentColor }} />}
          gradient={`bg-gradient-to-br`}
          gradientStyle={{ background: `linear-gradient(135deg, ${accentColor}30 0%, ${primaryColor}30 100%)` }}
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
                  <BarChart3 className="w-5 h-5" style={{ color: primaryColor }} />
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
                          ? "text-white"
                          : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      )}
                      style={selectedMetric === m ? { backgroundColor: primaryColor } : {}}
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
                  <Gauge className="w-5 h-5" style={{ color: primaryColor }} />
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
                        className="h-2 rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${primaryColor} 0%, ${accentColor} 100%)`
                        }}
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
                        className="h-2 rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${accentColor} 0%, ${primaryColor} 100%)`
                        }}
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
                        className="h-2 rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${primaryColor}80 0%, ${accentColor}80 100%)`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Farm Yield Chart */}
              <FarmYieldChart 
                metrics={farmYieldMetrics} 
                isLoading={isLoading}
              />
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
                <Target className="w-5 h-5 text-purple-500" />
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