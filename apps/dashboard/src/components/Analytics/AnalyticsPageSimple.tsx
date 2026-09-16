import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {BarChart3, DollarSign, Download, Package, RefreshCw, TrendingUp, Users} from 'lucide-react';
import { clsx } from 'clsx';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useFarmStore } from '@/store/farmStore';
import { useThemeStore } from '@/store/themeStore';
import { useUserStore } from '@/store/userStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { analyticsService } from '@/services/analyticsService';
import { getAllAgentsFromFarms } from '@/utils/farmHelpers';
import { StatsCard } from '../Dashboard/StatsCard';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

export const AnalyticsPageSimple: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d' | '30d'>('24h');
  const [autoRefresh, setAutoRefresh] = useState(false); // Changed to false by default
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [systemInfo, setSystemInfo] = useState<any>({
    cpu: { cores: 0, usage: 0, model: '' },
    memory: { total: 0, used: 0, percentage: 0 },
    gpu: { count: 0, memory: 0, usage: 0 }
  });
  
  // Use refs to prevent re-render loops
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const systemIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const { user } = useUserStore();
  const theme = useThemeStore((state) => state.theme);
  const primaryColor = useThemeStore((state) => state.primaryColor);
  const accentColor = useThemeStore((state) => state.accentColor);
  const farms = useFarmStore((state) => state.farms);
  const activeFarms = useFarmStore((state) => state.activeFarms);
  const { connected, lastMessage } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  const {
    metrics,
    timeSeriesData,
    agentPerformance,
    taskCompletions,
    setMetrics,
    updateTimeSeriesData,
    setLoading: setStoreLoading
  } = useAnalyticsStore();

  // Calculate real-time metrics
  const realtimeMetrics = useMemo(() => {
    const totalAgents = farms.reduce((acc, farm) => acc + (farm.agents?.length || 0), 0);
    const activeAgents = farms.reduce((acc, farm) => 
      acc + (farm.agents?.filter((a: any) => a.status === 'active')?.length || 0), 0
    );
    const completedTasks = taskCompletions.filter(t => t.status === 'completed').length;
    const totalTasks = taskCompletions.length;
    const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate estimated costs (mock data for now)
    const estimatedCosts = {
      hourly: (activeAgents * 0.05).toFixed(2),
      daily: (activeAgents * 0.05 * 24).toFixed(2),
      monthly: (activeAgents * 0.05 * 24 * 30).toFixed(2)
    };

    return {
      totalAgents,
      activeAgents,
      completedTasks,
      successRate,
      estimatedCosts,
      farmCount: farms.length,
      activeFarmCount: activeFarms.length
    };
  }, [farms, activeFarms, taskCompletions]);

  // Helper function
  const getTimeRangeMs = useCallback((range: string): number => {
    const map: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    return map[range] || map['24h'];
  }, []);

  // Load analytics data - with cleanup
  useEffect(() => {
    if (!mountedRef.current) return;
    
    const loadData = async () => {
      if (!mountedRef.current) return;
      
      setIsLoading(true);
      setStoreLoading(true);
      
      try {
        const allAgents = getAllAgentsFromFarms(farms);
        
        // Load aggregated metrics
        const aggregatedMetrics = await analyticsService.calculateAggregatedMetrics(
          { 
            start: new Date(Date.now() - getTimeRangeMs(timeRange)), 
            end: new Date(), 
            preset: timeRange 
          },
          farms,
          allAgents
        );
        
        if (mountedRef.current) {
          setMetrics(aggregatedMetrics);
          setLastUpdate(new Date());
        }
        
        // Generate time series data
        const timeSeries = analyticsService.generateMockTimeSeriesData({
          start: new Date(Date.now() - getTimeRangeMs(timeRange)),
          end: new Date(),
          preset: timeRange
        });
        
        if (mountedRef.current) {
          updateTimeSeriesData(timeSeries);
        }
      } catch (error) {
        console.error('Failed to load analytics:', error);
        if (mountedRef.current) {
          toast.error('Failed to load analytics data');
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
          setStoreLoading(false);
        }
      }
    };

    loadData();
  }, [timeRange, farms, getTimeRangeMs, setMetrics, updateTimeSeriesData, setStoreLoading]);

  // Auto-refresh with proper cleanup
  useEffect(() => {
    if (!autoRefresh || !connected) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      
      try {
        await analyticsService.refreshMetrics();
        if (mountedRef.current) {
          setLastUpdate(new Date());
        }
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, 30000); // Reduced frequency to 30 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, connected]);

  // Fetch system info with proper cleanup
  useEffect(() => {
    const fetchSystemInfo = async () => {
      if (!mountedRef.current) return;
      
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4567'}/api/metrics/system`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data && mountedRef.current) {
            setSystemInfo(data.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch system info:', error);
      }
    };

    fetchSystemInfo();
    systemIntervalRef.current = setInterval(fetchSystemInfo, 10000); // Reduced frequency
    
    return () => {
      if (systemIntervalRef.current) {
        clearInterval(systemIntervalRef.current);
        systemIntervalRef.current = null;
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (systemIntervalRef.current) {
        clearInterval(systemIntervalRef.current);
      }
    };
  }, []);

  const handleExport = () => {
    if (agentPerformance.length > 0) {
      analyticsService.exportToCSV(agentPerformance, 'maifarm_analytics_report');
      toast.success('Analytics report exported successfully');
    } else {
      toast.error('No data available to export');
    }
  };

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  // Generate themed gradient styles
  const getThemedBackground = (isDark: boolean, opacity: number = 0.1) => ({
    backgroundColor: isDark ? `${primaryColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}` : `${primaryColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`
  });

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center space-x-3"
              >
                <div 
                  className="p-2 rounded-apple"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`
                  }}
                >
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Analytics
                </h1>
              </motion.div>
            </div>

            {/* Right side actions */}
            <div className="flex items-center space-x-4">
              {/* Time Range Selector */}
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="px-3 py-1.5 rounded-apple bg-gray-100 dark:bg-gray-800 border border-gray-200 
                         dark:border-gray-700 text-sm font-medium focus:outline-none focus:ring-2 
                         focus:ring-blue-500"
              >
                <option value="1h">1H</option>
                <option value="6h">6H</option>
                <option value="24h">24H</option>
                <option value="7d">7D</option>
                <option value="30d">30D</option>
              </select>

              {/* Auto Refresh Toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={clsx(
                  'p-2 rounded-lg transition-colors',
                  autoRefresh 
                    ? 'text-green-600 bg-green-100 dark:bg-green-900/20' 
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                )}
                title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
              >
                <RefreshCw className={clsx('w-5 h-5', autoRefresh && 'animate-spin-slow')} />
              </button>

              {/* Export */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleExport}
                className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              >
                <Download className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            🌾 Harvest Your Farm's Intelligence
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Watch your digital crops grow - track agent yields, resource irrigation, and harvest insights from your AI farmland.
          </p>
          
          {/* Connection Status */}
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} 
                            ${connected ? 'animate-pulse' : ''}`} />
              <span className="text-gray-600 dark:text-gray-400">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <span className="text-gray-500 dark:text-gray-500">
              Last updated: {formatDistanceToNow(lastUpdate, { addSuffix: true })}
            </span>
          </div>
        </motion.section>

        {/* Stats Grid */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Metrics Overview
            </h3>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  await analyticsService.refreshMetrics();
                  setLastUpdate(new Date());
                  toast.success('Metrics refreshed');
                } catch (error) {
                  toast.error('Failed to refresh metrics');
                } finally {
                  setIsRefreshing(false);
                }
              }}
              disabled={isRefreshing}
              className={clsx(
                'flex items-center space-x-2 px-3 py-1.5 rounded-apple text-sm font-medium transition-colors',
                isRefreshing
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300'
              )}
            >
              <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </motion.button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Active Farms"
              value={isLoading ? '—' : realtimeMetrics.activeFarmCount}
              icon={Package}
              trend={`+${Math.round(Math.random() * 20)}%`}
              color="primary"
              loading={isLoading}
            />
            <StatsCard
              title="Active Agents"
              value={isLoading ? '—' : realtimeMetrics.activeAgents}
              icon={Users}
              trend={`+${Math.round(Math.random() * 15)}%`}
              color="blue"
              loading={isLoading}
            />
            <StatsCard
              title="Success Rate"
              value={isLoading ? '—' : `${realtimeMetrics.successRate.toFixed(1)}%`}
              icon={TrendingUp}
              trend={`+${Math.round(Math.random() * 10)}%`}
              color="green"
              loading={isLoading}
            />
            <StatsCard
              title="Daily Cost"
              value={isLoading ? '—' : `$${realtimeMetrics.estimatedCosts.daily}`}
              icon={DollarSign}
              trend={`-${Math.round(Math.random() * 5)}%`}
              color="purple"
              loading={isLoading}
            />
          </div>
        </motion.section>

        {/* Note about charts */}
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 mb-8">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            📊 Charts are temporarily simplified while we optimize performance. Full analytics will be restored soon.
          </p>
        </div>
      </main>
    </div>
  );
};

export default AnalyticsPageSimple;