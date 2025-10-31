import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sprout,
  Users,
  TrendingUp,
  CheckCircle2,
  Plus,
  Trees,
  Wheat
} from 'lucide-react';
import { clsx } from 'clsx';
import { FarmingHero } from './FarmingHero';
import { FarmCard } from './FarmCard';
import { FarmingStatsCard } from './FarmingStatsCard';
import { QuickActions } from './QuickActions';
import { RecentActivity, ActivityItem } from './RecentActivity';
import { GlassyFarmCreator } from '../Farm/GlassyFarmCreator';
import { HarvestSection } from '../Harvest/HarvestSection';
import CompactorAnimation from '../common/CompactorAnimation';
import { AppleCard } from '../ui/AppleCard';
import { useFarmStore } from '@/store/farmStore';
import { useUserStore } from '@/store/userStore';
import { useThemeStore } from '@/store/themeStore';
import { useWebSocketStore } from '@/store/websocketStore';
import { useActivityStore } from '@/store/activityStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { unifiedMetricsService } from '@/services/unifiedMetricsService';

interface EnhancedDashboardProps {
  className?: string;
}

export const EnhancedDashboard: React.FC<EnhancedDashboardProps> = ({ className }) => {
  const [showFarmCreator, setShowFarmCreator] = useState(false);
  const [metrics, setMetrics] = useState(unifiedMetricsService.getMetrics());
  
  const { user } = useUserStore();
  const { farms, activeFarms, fetchFarms } = useFarmStore();
  const theme = useThemeStore((state) => state.theme);
  const { connected: isConnected } = useWebSocketStore();
  const activities = useActivityStore(state => state.activities);
  
  // Initialize WebSocket connection
  const { lastMessage, socket } = useWebSocket({
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });

  const recentActivities = activities.slice(0, 5);

  // Set up unified metrics
  useEffect(() => {
    const handleMetricsUpdate = (updatedMetrics: any) => {
      setMetrics(updatedMetrics);
    };
    
    unifiedMetricsService.on('metrics:updated', handleMetricsUpdate);
    
    if (socket) {
      unifiedMetricsService.connectWebSocket(socket);
      socket.emit('metrics:subscribe');
    }
    
    unifiedMetricsService.startPeriodicUpdates(30000);
    unifiedMetricsService.fetchMetrics()
      .then(() => setMetrics(unifiedMetricsService.getMetrics()))
      .catch(console.error);
    
    return () => {
      unifiedMetricsService.off('metrics:updated', handleMetricsUpdate);
      if (socket) {
        socket.emit('metrics:unsubscribe');
      }
    };
  }, [socket]);

  useEffect(() => {
    fetchFarms().catch(console.error);
  }, [fetchFarms]);

  // Handle WebSocket farm updates
  useEffect(() => {
    if (!socket) return;

    const handleFarmStatus = (data: any) => {
      const { farmId, status, farm } = data;
      
      if (farmId) {
        useFarmStore.getState().updateFarm(farmId, { status });
      }
      
      const activityStore = useActivityStore.getState();
      const farmName = farm?.name || farmId;
      
      switch (status) {
        case 'created':
        case 'launching':
          activityStore.addActivity({
            type: 'farm_created',
            title: 'Seeds Planted',
            description: `${farmName} is being planted`,
            farmId
          });
          break;
        case 'active':
          activityStore.addActivity({
            type: 'agent_started',
            title: 'Farm Growing',
            description: `${farmName} is flourishing`,
            farmId
          });
          break;
        case 'completed':
          activityStore.addActivity({
            type: 'farm_completed',
            title: 'Harvest Ready',
            description: `${farmName} is ready for harvest`,
            farmId
          });
          break;
      }
    };

    socket.on('farm:status', handleFarmStatus);
    socket.on('farm:state', handleFarmStatus);

    return () => {
      socket.off('farm:status', handleFarmStatus);
      socket.off('farm:state', handleFarmStatus);
    };
  }, [socket]);

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  const staggerChildren = {
    animate: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  return (
    <div className={clsx('min-h-screen', className)}>
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-12"
      >
        <FarmingHero
          userName={user?.name || 'Farmer'}
          farmCount={farms.length}
          onPrimaryAction={() => setShowFarmCreator(true)}
        />
      </motion.section>

      {/* Main Content Grid */}
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Quick Actions - Primary CTAs */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.2 }}
        >
          <QuickActions />
        </motion.section>

        {/* Stats Overview - Key Metrics */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.3 }}
        >
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Your Farm Overview
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Track your digital harvest progress
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FarmingStatsCard
              title="Active Fields"
              value={metrics.activeFarms}
              icon={Sprout}
              category="seeds"
              trend={metrics.activeFarms > 0 ? '+12%' : undefined}
              sparkle={metrics.activeFarms > 5}
            />
            <FarmingStatsCard
              title="Farm Workers"
              value={metrics.activeAgents}
              icon={Users}
              category="water"
              subtitle={`${activeFarms.length} farms active`}
            />
            <FarmingStatsCard
              title="Harvested"
              value={metrics.completedTasks}
              icon={CheckCircle2}
              category="harvest"
              trend="+25%"
              sparkle={metrics.completedTasks > 100}
            />
            <FarmingStatsCard
              title="Growth Rate"
              value={Math.round(metrics.successRate ?? 0)}
              icon={TrendingUp}
              category="growth"
              subtitle="Last 24 hours"
            />
          </div>
        </motion.section>

        {/* Active Farms - Clean Grid */}
        {farms && farms.length > 0 && (
          <motion.section
            {...fadeIn}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                  Your Digital Farms
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {activeFarms.length} actively growing
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowFarmCreator(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-leaf-500 to-leaf-600 text-white rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Plant New Seeds</span>
              </motion.button>
            </div>

            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={staggerChildren}
              initial="initial"
              animate="animate"
            >
              <AnimatePresence mode="popLayout">
                {farms.slice(0, 6).map((farm, index) => (
                  <motion.div
                    key={`farm-${farm.id}`}
                    layout
                    layoutId={`farm-${farm.id}`}
                    {...fadeIn}
                    transition={{ delay: 0.05 * index }}
                  >
                    <FarmCard farm={farm} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
            
            {farms.length > 6 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-center"
              >
                <button className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  View all {farms.length} farms →
                </button>
              </motion.div>
            )}
          </motion.section>
        )}

        {/* Empty State */}
        {(!farms || farms.length === 0) && (
          <motion.section {...fadeIn}>
            <AppleCard variant="glass" className="text-center py-16">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", duration: 0.5 }}
              >
                <Trees className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              </motion.div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Your Field is Ready
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Plant your first digital seeds and watch your AI agents cultivate amazing results
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowFarmCreator(true)}
                className="px-6 py-3 bg-gradient-to-r from-leaf-500 to-leaf-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all"
              >
                Plant Your First Seeds
              </motion.button>
            </AppleCard>
          </motion.section>
        )}

        {/* Harvest Section - Simplified */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.5 }}
        >
          <HarvestSection />
        </motion.section>

        {/* Recent Activity - Compact */}
        {recentActivities.length > 0 && (
          <motion.section
            {...fadeIn}
            transition={{ delay: 0.6 }}
          >
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                Farm Activity
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Latest updates from your fields
              </p>
            </div>
            <AppleCard variant="glass" padding="none">
              <RecentActivity activities={recentActivities as ActivityItem[]} />
            </AppleCard>
          </motion.section>
        )}

        {/* Compactor Animation - Bottom */}
        <motion.section
          {...fadeIn}
          transition={{ delay: 0.7 }}
          className="pb-12"
        >
          <AppleCard variant="glass" padding="none" className="overflow-hidden">
            <CompactorAnimation />
          </AppleCard>
        </motion.section>
      </div>

      {/* Farm Creator Modal */}
      <AnimatePresence>
        {showFarmCreator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <GlassyFarmCreator
                onClose={() => setShowFarmCreator(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};