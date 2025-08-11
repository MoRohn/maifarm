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
  AlertCircle,
  Wheat
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmCard } from './FarmCard';
import { FarmBlueprint } from './FarmBlueprint';
import { ThemedAccent } from '../common/ThemedLayout';
import { StatsCard } from './StatsCard';
import { QuickActions } from './QuickActions';
import { RecentActivity, ActivityItem } from './RecentActivity';
import { FarmCreator } from '../Farm/FarmCreator';
import { HarvestSection } from '../Harvest/HarvestSection';
import { DynamicLogo } from '../common/DynamicLogo';
import CompactorAnimation from '../common/CompactorAnimation';
import { useFarmStore } from '../../store/farmStore';
import { useUserStore } from '../../store/userStore';
import { useThemeStore } from '../../store/themeStore';
import { useWebSocketStore } from '../../store/websocketStore';
import { useActivityStore } from '../../store/activityStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { unifiedMetricsService } from '../../services/unifiedMetricsService';
import { MetricName, formatMetricValue, getMetricUnit } from '../../types/metrics';
import { createMockFarm } from '../../utils/mockFarmData';

interface DashboardProps {
  className?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ className }) => {
  const [greeting, setGreeting] = useState('');
  const [showFarmCreator, setShowFarmCreator] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [metrics, setMetrics] = useState(unifiedMetricsService.getMetrics());
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  
  const { user } = useUserStore();
  const { farms, activeFarms, recentFarms, stats, fetchFarms, addFarm } = useFarmStore();
  const theme = useThemeStore((state) => state.theme);
  const { connected: isConnected } = useWebSocketStore();
  
  // Subscribe to activity store changes - this will make it reactive
  const activities = useActivityStore(state => state.activities);
  const getRecentActivities = useActivityStore(state => state.getRecentActivities);
  
  // Initialize WebSocket connection
  const { lastMessage, socket } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  // Set up unified metrics
  useEffect(() => {
    // Subscribe to metrics updates
    const handleMetricsUpdate = (updatedMetrics: any) => {
      setMetrics(updatedMetrics);
    };
    
    unifiedMetricsService.on('metrics:updated', handleMetricsUpdate);
    
    // Connect WebSocket to metrics service
    if (socket) {
      unifiedMetricsService.connectWebSocket(socket);
      
      // Subscribe to metrics updates via WebSocket
      socket.emit('metrics:subscribe');
    }
    
    // Start periodic updates
    unifiedMetricsService.startPeriodicUpdates(30000); // 30 seconds
    
    // Initial fetch
    setMetricsLoading(true);
    setMetricsError(null);
    unifiedMetricsService.fetchMetrics()
      .then(() => {
        setMetrics(unifiedMetricsService.getMetrics());
        setMetricsLoading(false);
      })
      .catch((error) => {
        console.error('Failed to fetch metrics:', error);
        setMetricsError('Failed to load metrics. Please try again later.');
        setMetricsLoading(false);
      });
    
    return () => {
      unifiedMetricsService.off('metrics:updated', handleMetricsUpdate);
      if (socket) {
        socket.emit('metrics:unsubscribe');
      }
    };
  }, [socket]);

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

  // Get recent activities from the activity store - now reactive to changes
  const recentActivities = activities.slice(0, 10) as ActivityItem[];

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

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
      try {
        await unifiedMetricsService.refreshMetrics();
      } catch (error) {
        // Don't log error for initial load if backend is not available
        // The apiClient already handles this and provides mock data
        if (isConnected) {
          console.error('Failed to load metrics:', error);
        }
      }
    };

    initializeMetrics();
    
    // Start periodic updates with retry logic
    unifiedMetricsService.startMetricsUpdates(5000);

    // Subscribe to WebSocket metrics updates
    if (isConnected) {
      console.log('Dashboard: WebSocket connected, ready for metrics updates');
    }

    return () => {
      unifiedMetricsService.stopMetricsUpdates();
    };
  }, [isConnected]);

  // Handle WebSocket metrics updates
  useEffect(() => {
    if (lastMessage) {
      unifiedMetricsService.handleWebSocketMetrics(lastMessage);
    }
  }, [lastMessage]);

  // Handle WebSocket farm and agent updates
  useEffect(() => {
    if (!socket) return;

    // Handle farm status updates
    const handleFarmStatus = (data: any) => {
      const { farmId, status, farm } = data;
      const farmName = farm?.name || farmId;
      
      // Update farm in store
      if (farmId) {
        useFarmStore.getState().updateFarm(farmId, { status });
      }
      
      // Add activity based on status
      const activityStore = useActivityStore.getState();
      switch (status) {
        case 'created':
        case 'launching':
          activityStore.addActivity({
            type: 'farm_created',
            title: 'Farm Created',
            description: `Farm "${farmName}" has been created`,
            farmId
          });
          break;
        case 'running':
        case 'active':
          activityStore.addActivity({
            type: 'agent_started',
            title: 'Farm Started',
            description: `Farm "${farmName}" is now running`,
            farmId
          });
          break;
        case 'completed':
          activityStore.addActivity({
            type: 'farm_completed',
            title: 'Farm Completed',
            description: `Farm "${farmName}" has completed successfully`,
            farmId
          });
          break;
        case 'failed':
        case 'error':
          activityStore.addActivity({
            type: 'agent_error',
            title: 'Farm Error',
            description: `Farm "${farmName}" encountered an error`,
            farmId
          });
          break;
        case 'paused':
          activityStore.addActivity({
            type: 'farm_paused',
            title: 'Farm Paused',
            description: `Farm "${farmName}" has been paused`,
            farmId
          });
          break;
      }
    };

    // Handle agent status updates
    const handleAgentStatus = (data: any) => {
      const { agentId, status, agentName, farmId } = data;
      
      if (status === 'error' || status === 'failed') {
        const activityStore = useActivityStore.getState();
        activityStore.addActivity({
          type: 'agent_error',
          title: 'Agent Error',
          description: `Agent "${agentName || agentId}" encountered an error`,
          agentId,
          farmId
        });
      }
    };

    // Handle harvest events
    const handleHarvestReady = (data: any) => {
      const { harvestId, farmId, farmName } = data;
      const activityStore = useActivityStore.getState();
      activityStore.addActivity({
        type: 'harvest_created',
        title: 'Harvest Ready',
        description: `Harvest ready for farm "${farmName || farmId}"`,
        farmId,
        metadata: { harvestId }
      });
    };

    // Subscribe to WebSocket events
    socket.on('farm:status', handleFarmStatus);
    socket.on('farm:state', handleFarmStatus);
    socket.on('agent:status', handleAgentStatus);
    socket.on('agent:error', handleAgentStatus);
    socket.on('harvest:ready', handleHarvestReady);

    // Also handle legacy message format
    if (lastMessage?.type === 'farm_update') {
      const { event, farm, farmId } = lastMessage.payload;
      handleFarmStatus({ farmId, status: event, farm });
    }

    return () => {
      socket.off('farm:status', handleFarmStatus);
      socket.off('farm:state', handleFarmStatus);
      socket.off('agent:status', handleAgentStatus);
      socket.off('agent:error', handleAgentStatus);
      socket.off('harvest:ready', handleHarvestReady);
    };
  }, [socket, lastMessage]);



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
          <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-apple">
            <Wheat className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            MaiFarm Dashboard
          </h1>
        </motion.div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        {/* Hero Section with Welcome */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome to Your AI Farm! 🌾
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Plant your seeds, cultivate with AI agents, and harvest amazing results
            </p>
          </div>
        </motion.section>

        {/* Farm Blueprint Visualization */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <FarmBlueprint 
            metrics={{
              activeFarms: metrics.activeFarms,
              totalFarms: metrics.totalFarms,
              activeAgents: metrics.activeAgents,
              uniqueAgents: metrics.uniqueAgents,
              completedTasks: metrics.completedTasks,
              successRate: metrics.successRate,
              totalSeeds: 15,
              activeHarvests: 5,
              barnItems: 48
            }}
          />
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