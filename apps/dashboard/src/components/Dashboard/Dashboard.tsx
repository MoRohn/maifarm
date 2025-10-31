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
import { RecentActivity, ActivityItem } from './RecentActivity';
import { FarmChatWizard } from '../Farm/FarmChatWizardSafe';
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
  
  const { user } = useUserStore();
  const { farms, activeFarms, recentFarms, stats, fetchFarms, addFarm, updateFarm } = useFarmStore();
  const theme = useThemeStore((state) => state.theme);
  const { connected: isConnected, subscribe } = useWebSocketStore();
  
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
  const recentActivities = activities.slice(0, 10);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  useEffect(() => {
    fetchFarms().then(() => {
      // After fetching farms, refresh metrics to get accurate counts
      unifiedMetricsService.refreshMetrics().then(() => {
        setMetrics(unifiedMetricsService.getMetrics());
      });
    }).catch(error => {
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

  // Auto-redirect to Harvest page when farm becomes active
  useEffect(() => {
    if (!isConnected || !subscribe) return;

    const handleFarmStatusUpdate = (data: any) => {
      const farmId = data.farmId || data.id;
      const newStatus = data.status;
      
      console.log('[Dashboard] Farm status update:', { farmId, newStatus, currentPath: window.location.pathname });
      
      // Check if this farm just became active and hasn't been redirected yet
      if (farmId && (newStatus === 'active' || newStatus === 'running')) {
        // Don't redirect if we're already on a harvest page
        if (window.location.pathname.includes('/harvest/')) {
          console.log('[Dashboard] Already on harvest page, skipping redirect');
          return;
        }
        
        // Check if we haven't already redirected for this farm
        if (!redirectedFarmsRef.current.has(farmId)) {
          redirectedFarmsRef.current.add(farmId);
          
          // Find the farm in the store
          const farm = farms.find(f => f.id === farmId);
          if (farm) {
            // Show notification
            toast.success(`🚀 ${farm.name} is now active! Redirecting to Harvest view...`, {
              duration: 3000,
            });
            
            // Redirect through concept explainer after a short delay
            setTimeout(() => {
              const mode = farm?.metadata?.isQuickTask ? 'quicktask' : 'farm';
              const transitionUrl = `/farm/${farmId}/transition/${mode}`;
              console.log('[Dashboard] Redirecting to concept explainer:', transitionUrl);
              navigate(transitionUrl);
            }, 1500);
          }
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
  }, [isConnected, subscribe, farms, navigate]);

  // Initialize metrics fetching
  useEffect(() => {
    const initializeMetrics = async () => {
      try {
        setMetricsLoading(true);
        await unifiedMetricsService.refreshMetrics();
        setMetrics(unifiedMetricsService.getMetrics());
        setMetricsLoading(false);
      } catch (error) {
        // Don't log error for initial load if backend is not available
        // The apiClient already handles this and provides mock data
        if (isConnected) {
          console.error('Failed to load metrics:', error);
        }
        setMetricsLoading(false);
      }
    };

    initializeMetrics();
    
    // Start periodic updates with retry logic - more frequent updates
    unifiedMetricsService.startMetricsUpdates(3000); // Update every 3 seconds

    // Subscribe to WebSocket metrics updates
    if (isConnected) {
      console.log('Dashboard: WebSocket connected, ready for metrics updates');
    }

    // Refresh metrics when connection state changes
    if (isConnected) {
      initializeMetrics();
    }

    return () => {
      unifiedMetricsService.stopMetricsUpdates();
    };
  }, [isConnected]);

  // Handle WebSocket events to refresh metrics
  useEffect(() => {
    if (!socket) return;

    const handleFarmUpdate = () => {
      // Refresh metrics when farms are updated
      setTimeout(() => {
        unifiedMetricsService.refreshMetrics().then(() => {
          setMetrics(unifiedMetricsService.getMetrics());
        });
      }, 500); // Small delay to allow database to update
    };

    const handleHarvestUpdate = () => {
      // Refresh metrics when harvests are updated
      setTimeout(() => {
        unifiedMetricsService.refreshMetrics().then(() => {
          setMetrics(unifiedMetricsService.getMetrics());
        });
      }, 500);
    };

    // Listen to various events that should trigger metrics update
    socket.on('farm:created', handleFarmUpdate);
    socket.on('farm:status', handleFarmUpdate);
    socket.on('farm:deleted', handleFarmUpdate);
    socket.on('farm:completed', handleFarmUpdate);
    socket.on('agent:status', handleFarmUpdate);
    socket.on('agent:updated', handleFarmUpdate);
    socket.on('harvest:ready', handleHarvestUpdate);
    socket.on('harvest:completed', handleHarvestUpdate);
    socket.on('harvest:collected', handleHarvestUpdate);
    socket.on('metrics:update', (data: any) => {
      // Direct metrics update from server
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
      socket.off('farm:created', handleFarmUpdate);
      socket.off('farm:status', handleFarmUpdate);
      socket.off('farm:deleted', handleFarmUpdate);
      socket.off('farm:completed', handleFarmUpdate);
      socket.off('agent:status', handleFarmUpdate);
      socket.off('agent:updated', handleFarmUpdate);
      socket.off('harvest:ready', handleHarvestUpdate);
      socket.off('harvest:completed', handleHarvestUpdate);
      socket.off('harvest:collected', handleHarvestUpdate);
      socket.off('metrics:update');
    };
  }, [socket]);

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
        useFarmStore.getState().updateFarm(farmId, { status });
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
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
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome MaiFarmer!
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              MaiFarm is your AI cultivation ecosystem, plant your seeds and watch them grow.
            </p>
          </div>
        </motion.section>

        {/* Quick Actions */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <QuickActions />
        </motion.section>

        {/* Stats Overview */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
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
              className="bg-gray-100 dark:bg-gray-900 rounded-apple-lg p-8 text-center border border-gray-200 dark:border-gray-800"
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
          <HarvestSection />
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

      {/* Farm Creator Modal - Using FarmChatWizard for harvest mode */}
      <FarmChatWizard
        isOpen={showFarmCreator}
        onClose={() => setShowFarmCreator(false)}
      />
    </div>
  );
};