import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Activity, 
  Plus, 
  Grid3x3, 
  User,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Home
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmCard } from './FarmCard';
import { ThemedAccent } from '../common/ThemedLayout';
import { StatsCard } from './StatsCard';
import { QuickActions } from './QuickActions';
import { CapabilitiesSection } from './CapabilitiesSection';
import { RecentActivity, ActivityItem } from './RecentActivity';
import { UnifiedFarmChatWizard } from '../Farm/UnifiedFarmChatWizard';
import { HarvestSection } from '../Harvest/HarvestSection';
import { DynamicLogo } from '../common/DynamicLogo';
import CompactorAnimation from '../common/CompactorAnimation';
import { useFarmStore } from '@/store/farmStore';
import { useUserStore } from '@/store/userStore';
import { useThemeStore } from '@/store/themeStore';
import { useWebSocketStore } from '@/store/websocketStore';
import { useActivityStore } from '@/store/activityStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { unifiedMetricsService } from '@/services/unifiedMetricsService';
import { MetricName, formatMetricValue, getMetricUnit } from '@/types/metrics';
import { createMockFarm } from '@/utils/mockFarmData';
import { toast } from 'react-hot-toast';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AIEngineQuickSetupModal } from '../Onboarding/AIEngineQuickSetupModal';
// ConceptQuadExplainer moved to Settings Info section

interface DashboardProps {
  className?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ className }) => {
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');
  const [showFarmCreator, setShowFarmCreator] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [metrics, setMetrics] = useState(unifiedMetricsService.getMetrics());
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const redirectedFarmsRef = useRef<Set<string>>(new Set());

  // Prevent redirect loops by tracking component mount
  useEffect(() => {
    console.log('[Dashboard] Mounted successfully');
    return () => console.log('[Dashboard] Unmounting');
  }, []);
  
  const { user } = useUserStore();
  const { farms, activeFarms, recentFarms, stats, fetchFarms, addFarm, updateFarm, error: farmsError, loading: farmsLoading } = useFarmStore();
  const theme = useThemeStore((state) => state.theme);
  const { connected: isConnected, subscribe } = useWebSocketStore();
  
  // Subscribe to activity store changes - this will make it reactive
  const activities = useActivityStore(state => state.activities);
  const getRecentActivities = useActivityStore(state => state.getRecentActivities);
  
  // Initialize WebSocket connection
  const { lastMessage, socket } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  // Set up unified metrics - DISABLED to prevent refresh loop
  // Metrics will be fetched once on mount and updated via WebSocket events only
  useEffect(() => {
    if (!socket) return;

    // Initial fetch only
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

    // No periodic updates - only WebSocket events will update metrics
    return () => {
      // Cleanup
    };
  }, []); // Empty deps - run once only

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
  const recentActivities = activities.slice(0, 10);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  useEffect(() => {
    // Fetch farms once on mount
    fetchFarms().then(() => {
      // After fetching farms, refresh metrics to get accurate counts
      unifiedMetricsService.refreshMetrics().then(() => {
        setMetrics(unifiedMetricsService.getMetrics());
      });
    }).catch(error => {
      console.error('Failed to fetch farms:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

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

  // Auto-redirect disabled to prevent navigation loops
  // Users can manually navigate to harvest pages by clicking farm cards
  useEffect(() => {
    if (!isConnected || !subscribe) return;

    const handleFarmStatusUpdate = (data: any) => {
      const farmId = data.farmId || data.id;
      const newStatus = data.status;

      console.log('[Dashboard] Farm status update:', { farmId, newStatus });

      // Just show a notification, don't auto-redirect
      if (farmId && (newStatus === 'active' || newStatus === 'running')) {
        // Get current farms from store to avoid dependency
        const currentFarms = useFarmStore.getState().farms;
        const farm = currentFarms.find(f => f.id === farmId);
        if (farm && !redirectedFarmsRef.current.has(farmId)) {
          redirectedFarmsRef.current.add(farmId);
          // FIX: Ensure farm.name exists to avoid "undefined is now active!" toast
          const displayName = farm.name || 'Your farm';
          toast.success(`🚀 ${displayName} is now active!`, {
            duration: 3000,
          });
        }
      }
    };

    // Subscribe to farm status updates
    const unsubscribeFarmStatus = subscribe('farm:status', handleFarmStatusUpdate);
    const unsubscribeFarmActive = subscribe('farm:active', handleFarmStatusUpdate);
    const unsubscribeFarmRunning = subscribe('farm:running', handleFarmStatusUpdate);
    const unsubscribeFarmLaunched = subscribe('farm:launched', handleFarmStatusUpdate);

    return () => {
      unsubscribeFarmStatus();
      unsubscribeFarmActive();
      unsubscribeFarmRunning();
      unsubscribeFarmLaunched();
    };
  }, [isConnected, subscribe]); // Removed farms and navigate dependencies

  // REMOVED: Duplicate metrics initialization that was causing refresh loop
  // Metrics are now initialized once in the first useEffect above

  // Handle WebSocket events to refresh metrics - THROTTLED to prevent loops
  useEffect(() => {
    if (!socket) return;

    let metricsUpdateTimeout: NodeJS.Timeout | null = null;

    const throttledMetricsUpdate = () => {
      // Throttle metrics updates to max once per 5 seconds
      if (metricsUpdateTimeout) return;

      metricsUpdateTimeout = setTimeout(() => {
        unifiedMetricsService.refreshMetrics()
          .then(() => {
            setMetrics(unifiedMetricsService.getMetrics());
          })
          .catch(err => console.error('Metrics refresh error:', err))
          .finally(() => {
            metricsUpdateTimeout = null;
          });
      }, 5000); // 5 second throttle
    };

    // Listen to ONLY critical events
    socket.on('farm:created', throttledMetricsUpdate);
    socket.on('farm:completed', throttledMetricsUpdate);
    socket.on('harvest:completed', throttledMetricsUpdate);
    socket.on('metrics:update', (data: any) => {
      // Direct metrics update from server - no throttle needed
      if (data.dashboard) {
        setMetrics(prev => ({
          ...prev,
          activeFarms: data.dashboard.liveFarms ?? prev.activeFarms,
          activeAgents: data.dashboard.agentsWorking ?? prev.activeAgents,
          completedHarvests: data.dashboard.harvestsCompleted ?? prev.completedHarvests,
          yieldedItems: data.dashboard.yieldedItems ?? prev.yieldedItems
        }));
      }
    });

    return () => {
      if (metricsUpdateTimeout) clearTimeout(metricsUpdateTimeout);
      socket.off('farm:created', throttledMetricsUpdate);
      socket.off('farm:completed', throttledMetricsUpdate);
      socket.off('harvest:completed', throttledMetricsUpdate);
      socket.off('metrics:update');
    };
  }, [socket]);

  // REMOVED: Duplicate lastMessage handler causing refresh loop
  // WebSocket events are already handled in the useEffect above

  // Handle WebSocket farm and agent updates
  useEffect(() => {
    if (!socket) return;

    // Handle farm status updates
    const handleFarmStatus = (data: any) => {
      const { farmId, status, farm } = data;
      
      // Format the farm name properly, especially for Quick Tasks
      let farmName = farm?.name || farmId;
      
      // Special handling for Quick Tasks
      if (farmId?.startsWith('quick-task-')) {
        // If the farm has a name that looks like "Quick Task HH:MM:SS", use it
        // Otherwise, if farm.name contains the actual task title, use that
        if (farm?.name && !farm.name.includes('quick-task-')) {
          farmName = farm.name;
        } else {
          // Extract just "Quick Task" for display if we only have the ID
          farmName = 'Quick Task';
        }
      }
      
      // Update farm in store
      if (farmId) {
        // FIX: Wrap store update in try-catch to prevent handler crash
        try {
          useFarmStore.getState().updateFarm(farmId, { status });
        } catch (storeError) {
          console.error('[Dashboard] Failed to update farm in store:', storeError);
        }
      }

      // Add activity based on status
      const activityStore = useActivityStore.getState();
      switch (status) {
        case 'created':
        case 'launching':
          activityStore.addActivity({
            type: 'farm_created',
            title: farmId?.startsWith('quick-task-') ? 'Quick Task Created' : 'Farm Created',
            description: `${farmName} has been created`,
            farmId
          });
          break;
        case 'active':
          activityStore.addActivity({
            type: 'agent_started',
            title: farmId?.startsWith('quick-task-') ? 'Quick Task Started' : 'Farm Started',
            description: `${farmName} is now running`,
            farmId
          });
          break;
        case 'completed':
          activityStore.addActivity({
            type: 'farm_completed',
            title: farmId?.startsWith('quick-task-') ? 'Quick Task Completed' : 'Farm Completed',
            description: `${farmName} has completed successfully`,
            farmId
          });
          break;
        case 'failed':
        case 'error':
          activityStore.addActivity({
            type: 'agent_error',
            title: farmId?.startsWith('quick-task-') ? 'Quick Task Error' : 'Farm Error',
            description: `${farmName} encountered an error`,
            farmId
          });
          break;
        case 'paused':
          activityStore.addActivity({
            type: 'farm_paused',
            title: farmId?.startsWith('quick-task-') ? 'Quick Task Paused' : 'Farm Paused',
            description: `${farmName} has been paused`,
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
          <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg">
            <Home className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            Home
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
          <div className="text-left mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome MaiFarmer!
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              MaiFarm is your AI cultivation ecosystem, plant your seeds and watch them grow.
            </p>
          </div>
        </motion.section>

        {/* Capabilities Sections - Device & App */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.15 }}
          className="mb-8"
        >
          <CapabilitiesSection />
        </motion.section>

        {/* User Profile and Quick Actions Grid */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <div className="w-full">
            {/* Quick Actions - now spans full width */}
            <QuickActions />
          </div>
        </motion.section>

        {/* Stats Overview */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          {/* UX FIX: Display metrics error with retry button */}
          {metricsError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-apple-lg p-4 mb-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-amber-800 dark:text-amber-200">Failed to load metrics</h4>
                    <p className="text-sm text-amber-600 dark:text-amber-300">{metricsError}</p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setMetricsLoading(true);
                    setMetricsError(null);
                    unifiedMetricsService.fetchMetrics()
                      .then(() => {
                        setMetrics(unifiedMetricsService.getMetrics());
                        setMetricsLoading(false);
                        toast.success('Metrics loaded successfully');
                      })
                      .catch((error) => {
                        console.error('Failed to fetch metrics:', error);
                        setMetricsError('Failed to load metrics. Please try again later.');
                        setMetricsLoading(false);
                      });
                  }}
                  disabled={metricsLoading}
                  className="px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors disabled:opacity-50"
                >
                  {metricsLoading ? 'Retrying...' : 'Retry'}
                </motion.button>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Live Farms"
              value={metrics.activeFarms || 0}
              icon={Activity}
              color="blue"
              loading={metricsLoading}
            />
            <StatsCard
              title="Agents Working"
              value={metrics.activeAgents || 0}
              icon={User}
              color="green"
              loading={metricsLoading}
            />
            <StatsCard
              title="Harvests Completed"
              value={metrics.completedHarvests || 0}
              icon={CheckCircle2}
              color="purple"
              loading={metricsLoading}
            />
            <StatsCard
              title="Yielded Items"
              value={metrics.yieldedItems || 0}
              icon={TrendingUp}
              color="yellow"
              loading={metricsLoading}
            />
          </div>
        </motion.section>

        {/* Concept Explainer removed - now available in Settings > Info */}

        {/* All Farms */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.4 }}
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
                className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-apple-green to-apple-green-dark text-white rounded-apple-lg hover:shadow-apple-lg transition-all duration-200 shadow-apple font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>New Farm</span>
              </motion.button>
            </div>
          </div>

          {/* Error State Display */}
          {farmsError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-apple-lg p-4 mb-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-red-800 dark:text-red-200">Failed to load farms</h4>
                    <p className="text-sm text-red-600 dark:text-red-300">{farmsError}</p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => fetchFarms()}
                  disabled={farmsLoading}
                  className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors disabled:opacity-50"
                >
                  {farmsLoading ? 'Retrying...' : 'Retry'}
                </motion.button>
              </div>
            </motion.div>
          )}

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
              className="bg-gray-100/70 dark:bg-gray-800/50 backdrop-blur-xl rounded-apple-lg p-8 text-center border border-gray-200/40 dark:border-gray-700/40"
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
                className="px-5 py-2.5 bg-gradient-to-r from-apple-green to-apple-green-dark text-white rounded-apple-lg hover:shadow-apple-lg transition-all duration-200 shadow-apple font-medium"
              >
                Create Your First Farm
              </motion.button>
            </motion.div>
          )}
        </motion.section>

        {/* Harvests Section */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.45 }}
          className="mb-8"
        >
          <ErrorBoundary>
            <HarvestSection />
          </ErrorBoundary>
        </motion.section>

        {/* Recent Activity */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.5 }}
          className="mb-8"
        >
          <RecentActivity activities={recentActivities as ActivityItem[]} />
        </motion.section>

        {/* Compactor Animation */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.55 }}
          className="mb-8"
        >
          <CompactorAnimation 
            className="rounded-lg overflow-hidden shadow-lg"
          />
        </motion.section>
      </div>

      {/* Farm Creator Modal - Using UnifiedFarmChatWizard for enhanced experience */}
      <UnifiedFarmChatWizard
        isOpen={showFarmCreator}
        onClose={() => setShowFarmCreator(false)}
        initialMode="new-farm"
      />

      {/* AI Engine Quick Setup Modal - Appears on first load */}
      <AIEngineQuickSetupModal />
    </div>
  );
};