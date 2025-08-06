import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Plus, 
  Grid3x3, 
  History, 
  Settings,
  Home,
  User,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmCard } from './FarmCard';
import { ThemedAccent } from '../common/ThemedLayout';
import { StatsCard } from './StatsCard';
import { QuickActions } from './QuickActions';
import { RecentActivity } from './RecentActivity';
import { FarmCreator } from '../Farm/FarmCreator';
import { HarvestSection } from '../Harvest/HarvestSection';
import { DynamicLogo } from '../common/DynamicLogo';
import CompactorAnimation from '../common/CompactorAnimation';
import { useFarmStore } from '../../store/farmStore';
import { useUserStore } from '../../store/userStore';
import { useThemeStore } from '../../store/themeStore';
import { useWebSocketStore } from '../../store/websocketStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { metricsService } from '../../services/metricsService';
import { createMockFarm } from '../../utils/mockFarmData';

interface DashboardProps {
  className?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ className }) => {
  const [greeting, setGreeting] = useState('');
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [showFarmCreator, setShowFarmCreator] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const { user } = useUserStore();
  const { farms, activeFarms, recentFarms, stats, fetchFarms, addFarm } = useFarmStore();
  const theme = useThemeStore((state) => state.theme);
  const { connected: isConnected } = useWebSocketStore();
  
  // Initialize WebSocket connection
  const { lastMessage, socket } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  // Set up WebSocket alerts
  useEffect(() => {
    if (!socket) return;

    const handleError = (error: any) => {
      console.error('WebSocket error:', error);
    };

    const handleConnect = () => {
      console.log('WebSocket connected in Dashboard');
    };

    const handleDisconnect = () => {
      console.log('WebSocket disconnected in Dashboard');
    };

    socket.on('error', handleError);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('error', handleError);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  // Convert farms to activity items with unique IDs
  const recentActivities = recentFarms.map((farm, index) => ({
    id: farm.id || `farm-activity-${index}-${Date.now()}`,
    type: farm.status === 'completed' ? 'farm_completed' as const : 
          farm.status === 'paused' ? 'farm_paused' as const : 
          farm.status === 'failed' ? 'agent_error' as const : 
          'farm_created' as const,
    title: farm.name,
    description: `Farm ${farm.status} - ${farm.agents?.length || 0} agents`,
    timestamp: farm.updatedAt
  }));

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  // Fetch farms on component mount
  useEffect(() => {
    fetchFarms().catch(error => {
      console.error('Failed to fetch farms:', error);
    });
  }, [fetchFarms]);

  useEffect(() => {
    const checkDarkMode = () => {
      if (theme === 'dark') {
        setIsDarkMode(true);
        console.log('Dashboard: Theme is dark, using dark favicon');
      } else if (theme === 'light') {
        setIsDarkMode(false);
        console.log('Dashboard: Theme is light, using light favicon');
      } else {
        // System theme
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setIsDarkMode(isSystemDark);
        console.log('Dashboard: Theme is system, detected:', isSystemDark ? 'dark' : 'light');
      }
    };
    
    checkDarkMode();
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => checkDarkMode();
    mediaQuery.addEventListener('change', handleChange);
    
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Initialize metrics fetching
  useEffect(() => {
    const initializeMetrics = async () => {
      setMetricsLoading(true);
      try {
        await metricsService.refreshMetrics();
        setMetricsError(null);
      } catch (error) {
        // Don't log error for initial load if backend is not available
        // The apiClient already handles this and provides mock data
        if (isConnected) {
          console.error('Failed to load metrics:', error);
          setMetricsError('Failed to load metrics. Using cached data.');
        }
      } finally {
        setMetricsLoading(false);
      }
    };

    initializeMetrics();
    
    // Start periodic updates with retry logic
    metricsService.startMetricsUpdates(5000);

    // Subscribe to WebSocket metrics updates
    if (isConnected) {
      console.log('Dashboard: WebSocket connected, ready for metrics updates');
    }

    return () => {
      metricsService.stopMetricsUpdates();
    };
  }, [isConnected]);

  // Handle WebSocket metrics updates
  useEffect(() => {
    if (lastMessage) {
      metricsService.handleWebSocketMetrics(lastMessage);
    }
  }, [lastMessage]);

  // Handle WebSocket farm updates
  useEffect(() => {
    if (lastMessage?.type === 'farm_update') {
      const { event, farm, farmId } = lastMessage.payload;
      
      switch (event) {
        case 'created':
          useFarmStore.getState().addFarm(farm);
          break;
        case 'updated':
          useFarmStore.getState().updateFarm(farm.id, farm);
          break;
        case 'deleted':
          useFarmStore.getState().removeFarm(farmId);
          break;
        case 'started':
        case 'stopped':
          useFarmStore.getState().updateFarm(farm.id, { status: event === 'started' ? 'active' : 'completed' });
          break;
      }
    }
  }, [lastMessage]);



  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  return (
    <div className={className}>
      {/* Page Title */}
      <div className="mb-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center space-x-3"
        >
          <div className="p-2 bg-gradient-to-br from-orange-400 to-orange-700 rounded-apple">
            <Home className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Home
          </h1>
        </motion.div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome MaiFarmer!
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            This is your AI cultivation ecosystem, plant your seeds and watch them grow.
          </p>
        </motion.section>

        {/* Stats Grid */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Metrics Overview
          </h3>

          {metricsError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-apple-lg"
            >
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">{metricsError}</p>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Total Farms"
              value={metricsLoading ? '—' : (farms?.length || 0)}
              icon={Activity}
              trend="+12%"
              color="primary"
              loading={metricsLoading}
            />
            <StatsCard
              title="Total Agents"
              value={metricsLoading ? '—' : (farms?.reduce((sum, farm) => sum + (farm.agents?.length || 0), 0) || 0)}
              icon={Grid3x3}
              trend="+8%"
              color="green"
              loading={metricsLoading}
            />
            <StatsCard
              title="Tasks Completed"
              value={metricsLoading ? '—' : (farms?.reduce((sum, farm) => sum + (farm.metrics?.completedTasks || 0), 0) || 0)}
              icon={CheckCircle2}
              trend="+23%"
              color="blue"
              loading={metricsLoading}
            />
            <StatsCard
              title="Success Rate"
              value={metricsLoading ? '—' : farms && farms.length > 0 
                ? `${Math.round(farms.reduce((sum, farm) => 
                    sum + ((farm.metrics?.completedTasks || 0) / (farm.metrics?.totalTasks || 1) * 100), 0
                  ) / farms.length)}%`
                : '100%'}
              icon={TrendingUp}
              trend="+5%"
              color="purple"
              loading={metricsLoading}
            />
          </div>
        </motion.section>

        {/* Quick Actions */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <QuickActions />
        </motion.section>


        {/* All Farms */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.45 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Your Farms
            </h3>
            <div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowFarmCreator(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-[var(--color-primary)] text-white rounded-apple hover:bg-[var(--color-primary-dark)] transition-colors shadow-sm hover:shadow-[rgba(var(--color-primary-rgb),0.25)]"
              >
                <Plus className="w-4 h-4" />
                <span>New Farm</span>
              </motion.button>
            </div>
          </div>

          {farms && farms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {farms.map((farm, index) => (
                  <motion.div
                    key={`farm-${farm.id || index}`}
                    layout
                    layoutId={`farm-${farm.id || index}`}
                    {...fadeIn}
                    transition={{ delay: 0.1 * index }}
                  >
                    <FarmCard farm={farm} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div
              {...fadeIn}
              className="bg-white dark:bg-gray-900 rounded-apple-lg p-8 text-center border border-gray-200 dark:border-gray-800"
            >
              <Grid3x3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No farms yet
              </h4>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Start your first farm to see it here
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowFarmCreator(true)}
                className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-apple hover:bg-[var(--color-primary-dark)] transition-colors shadow-sm hover:shadow-[rgba(var(--color-primary-rgb),0.25)]"
              >
                Create Your First Farm
              </motion.button>
            </motion.div>
          )}
        </motion.section>

        {/* Harvests Section */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.5 }}
          className="mb-8"
        >
          <HarvestSection />
        </motion.section>

        {/* Recent Activity */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.55 }}
          className="mb-8"
        >
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Recent Activity
          </h3>
          <RecentActivity activities={recentActivities} />
        </motion.section>

        {/* Compactor Animation */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.6 }}
          className="mb-8"
        >
          <CompactorAnimation 
            className="rounded-lg overflow-hidden shadow-lg"
          />
        </motion.section>
      </div>

      {/* Farm Creator Modal */}
      {showFarmCreator && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <FarmCreator
              onClose={() => setShowFarmCreator(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};