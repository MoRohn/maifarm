import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle,
  Zap,
  Download,
  Save
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest } from '@/types/harvest';
import { Tooltip } from '../common/Tooltip';
import { YieldCard } from './YieldCard';
import { InsightsPanel } from './InsightsPanel';
import { SeedCreator } from './SeedCreator';
import { HarvestResults } from './HarvestResults';
import { HarvestHeadlineSummary } from './HarvestHeadlineSummary';
import { HarvestCompletionAnimation } from './HarvestCompletionAnimation';
import { SaveSeedModal } from './SaveSeedModal';
import { SeedQuickAction } from '../Seeds/SeedQuickAction';
import { YieldPreviewModal } from './YieldPreviewModal';
import { harvestService } from '@/services/harvestService';
import { farmService } from '@/services/farmService';
import { mapAgentNamesInHarvest } from '@/utils/agentNameMapper';
import { useActivityStore } from '@/store/activityStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { format } from 'date-fns';

interface HarvestDashboardProps {
  farmId: string;
  farmName: string;
  onComplete?: () => void;
}

export const HarvestDashboard: React.FC<HarvestDashboardProps> = ({
  farmId,
  farmName,
  onComplete
}) => {
  const [harvest, setHarvest] = useState<Harvest | null>(null);
  const [loading, setLoading] = useState(true);
  const [view] = useState<'grid' | 'list'>('grid'); // Keep for HarvestResults component
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [showSeedCreator, setShowSeedCreator] = useState(false);
  const [showSeedQuickAction, setShowSeedQuickAction] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
  const [realtimeAgents, setRealtimeAgents] = useState<any[]>([]);
  const [previewYieldItem, setPreviewYieldItem] = useState<any>(null);
  const { socket, isConnected } = useWebSocket();

  // Subscribe to terminal WebSocket events for real-time updates
  useEffect(() => {
    if (!socket || !isConnected || !farmId) {
      console.warn('[HarvestDashboard] Cannot subscribe to terminal - missing dependencies');
      return;
    }

    console.log('[HarvestDashboard] Subscribing to terminal updates for farm:', farmId);

    // Join the terminal session room using farmId
    socket.emit('terminal:join_session', {
      sessionId: `farm-${farmId.substring(0, 8)}`,
      farmId
    });

    // Request cached terminal output
    setTimeout(() => {
      socket.emit('terminal:request_cached', {
        sessionId: `farm-${farmId.substring(0, 8)}`,
        farmId
      });
    }, 100);

    // Poll for terminal output every 3 seconds
    const pollInterval = setInterval(() => {
      socket.emit('terminal:request_output', {
        sessionId: `farm-${farmId.substring(0, 8)}`,
        farmId
      });
    }, 3000);

    // Handle terminal output updates
    const handleTerminalOutput = (data: any) => {
      console.log('[HarvestDashboard] Received terminal output:', data);
      // Terminal output is now flowing - harvest will auto-refresh via other subscriptions
    };

    // Handle agent status updates
    const handleAgentInfo = (data: any) => {
      console.log('[HarvestDashboard] Received agent info:', data);
      if (data.agents) {
        setRealtimeAgents(data.agents);
      }
    };

    socket.on('terminal:output', handleTerminalOutput);
    socket.on('terminal:agent_info', handleAgentInfo);

    return () => {
      clearInterval(pollInterval);
      socket.off('terminal:output', handleTerminalOutput);
      socket.off('terminal:agent_info', handleAgentInfo);
      socket.emit('terminal:leave_session', {
        sessionId: `farm-${farmId.substring(0, 8)}`,
        farmId
      });
    };
  }, [socket, isConnected, farmId]);

  useEffect(() => {
    loadHarvest();

    // Join harvest room for real-time updates
    harvestService.joinHarvestRoom(farmId);

    // Subscribe to WebSocket events
    const unsubscribeHarvest = harvestService.onHarvestUpdate((update) => {
      console.log('Harvest update received:', update);
      if (update.harvestId === harvest?.id) {
        setHarvest(prev => ({ ...prev!, ...update }));
      }
    });

    const unsubscribeAgents = harvestService.onAgentsUpdate((agents) => {
      console.log('Agents update:', agents);
      setRealtimeAgents(agents);
    });

    const unsubscribeCompleted = harvestService.onWorkCompleted((completed) => {
      console.log('Work completed:', completed);
      // Trigger celebration when all work is done
      if (completed.length > 0 && !celebrating) {
        setShowCompletionAnimation(true);
        setCelebrating(true);

        // Log harvest completion activity
        const activityStore = useActivityStore.getState();
        activityStore.addActivity({
          type: 'harvest_created',
          title: 'Harvest Completed',
          description: `Harvest for "${farmName}" has been successfully completed`,
          farmId: farmId,
          metadata: {
            harvestId: harvest?.id,
            completedAt: new Date().toISOString()
          }
        });
      }
    });

    return () => {
      harvestService.leaveHarvestRoom(farmId);
      unsubscribeHarvest();
      unsubscribeAgents();
      unsubscribeCompleted();
    };
  }, [farmId, harvest?.id]);

  const loadHarvest = async () => {
    try {
      setLoading(true);
      const harvestData = await harvestService.getByFarmId(farmId);
      // Get the most recent harvest for this farm
      const latestHarvest = harvestData.length > 0 ? harvestData[0] : null;
      
      // Apply agent name mapping if we have harvest data
      if (latestHarvest) {
        try {
          const farmData = await farmService.getFarm(farmId);
          if (farmData) {
            const mappedHarvest = mapAgentNamesInHarvest(latestHarvest, farmData);
            setHarvest(mappedHarvest);
          } else {
            setHarvest(latestHarvest);
          }
        } catch (farmError) {
          console.warn('Could not fetch farm data for agent mapping:', farmError);
          setHarvest(latestHarvest);
        }
      } else {
        setHarvest(latestHarvest);
      }
      
      // Trigger celebration animation for completed harvests
      if (latestHarvest?.status === 'ready' && latestHarvest?.completedAt && !celebrating) {
        setShowCompletionAnimation(true);
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 3000);
      }
    } catch (error) {
      console.error('Failed to load harvest:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'json' | 'pdf' | 'markdown' | 'csv') => {
    if (!harvest) return;
    
    try {
      await harvestService.exportHarvest({
        harvestId: harvest.id,
        format,
        includeResults: true,
        includeInsights: true,
        includeYield: true
      });
    } catch (error) {
      console.error('Failed to export harvest:', error);
    }
  };

  const handleSaveSeed = useCallback(async (seedConfig: any) => {
    console.log('Saving seed configuration:', seedConfig);
    // TODO: Implement seed saving logic
    setShowSeedCreator(false);
  }, []);

  const handleSeedSuccess = useCallback((seed: any) => {
    console.log('Seed created successfully:', seed);
    // Show success notification or navigate to seed
    setShowSeedQuickAction(false);
    // You could show a toast notification here
  }, []);

  const handleYieldView = useCallback((yieldItem: any) => {
    console.log('Viewing yield item:', yieldItem);
    setPreviewYieldItem(yieldItem);
  }, []);

  const handleYieldDownload = useCallback(async (yieldItem: any) => {
    if (!harvest) return;
    await harvestService.downloadYield(harvest.id, yieldItem.id);
  }, [harvest]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Package className="w-16 h-16 text-primary-600 dark:text-primary-400" />
        </motion.div>
      </div>
    );
  }

  if (!harvest) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">No harvest found for this farm</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Celebration Animation */}
      <AnimatePresence>
        {celebrating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.5, 1] }}
                transition={{ duration: 0.6 }}
                className="text-primary-600 dark:text-primary-400"
              >
                <Sparkles className="w-32 h-32" />
              </motion.div>
            </div>
            {/* Confetti particles */}
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: '50%', 
                  y: '50%',
                  scale: 0 
                }}
                animate={{ 
                  x: `${50 + (Math.random() - 0.5) * 100}%`,
                  y: `${50 + (Math.random() - 0.5) * 100}%`,
                  scale: [0, 1, 0],
                  rotate: Math.random() * 360
                }}
                transition={{ 
                  duration: 2,
                  delay: i * 0.05,
                  ease: "easeOut"
                }}
                className="absolute w-4 h-4"
              >
                <div className={clsx(
                  "w-full h-full rounded-full",
                  i % 4 === 0 ? "bg-primary-500" :
                  i % 4 === 1 ? "bg-green-500" :
                  i % 4 === 2 ? "bg-blue-500" :
                  "bg-yellow-500"
                )} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header - More compact */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="relative"
              >
                <div className="p-3 bg-gradient-to-br from-primary-500 to-primary-600 rounded-apple-xl shadow-apple-lg">
                  <Package className="w-8 h-8 text-white" />
                </div>
                {harvest.status === 'ready' && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-900"
                  />
                )}
                {harvest.status === 'processing' && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full border-2 border-white dark:border-gray-900"
                  />
                )}
              </motion.div>
              
              <div>
                <motion.h1
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent"
                >
                  {farmName} Harvest
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-sm text-gray-600 dark:text-gray-400 mt-1"
                >
                  {harvest.status === 'ready' 
                    ? `Completed ${format(new Date(harvest.completedAt || harvest.createdAt), 'MMM d, yyyy • h:mm a')}`
                    : harvest.status === 'processing'
                    ? `Processing since ${format(new Date(harvest.createdAt), 'MMM d, yyyy • h:mm a')}`
                    : `Status: ${harvest.status}`}
                </motion.p>
              </div>
            </div>

            <div className="flex items-center space-x-2">

              {/* Save Seed - Updated to use new SeedQuickAction */}
              <Tooltip content="Save this harvest configuration as a reusable seed template" position="bottom">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowSeedQuickAction(true)}
                  className="flex items-center space-x-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-apple-lg shadow-apple transition-colors whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  <span>Create Seed</span>
                </motion.button>
              </Tooltip>

              {/* Export Menu */}
              <div className="relative group">
                <Tooltip content="Export harvest data in various formats" position="bottom">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-apple-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                  </motion.button>
                </Tooltip>
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-apple-xl shadow-apple-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform group-hover:scale-100 scale-95">
                  {['json', 'markdown', 'pdf', 'csv'].map((format) => (
                    <button
                      key={format}
                      onClick={() => handleExport(format as any)}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-apple-lg last:rounded-b-apple-lg transition-colors"
                    >
                      Export as {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Header Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap gap-4 items-center justify-center text-sm text-gray-600 dark:text-gray-400"
        >
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span>{harvest.summary?.filesGenerated || harvest.summary?.completedTasks || 0} files</span>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>{Math.floor((harvest.summary?.duration || 0) / 60)}m {(harvest.summary?.duration || 0) % 60}s</span>
          </div>
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <span>{harvest.summary?.efficiency || 0}%</span>
          </div>
        </motion.div>

      </div>

      {/* Main Content Container with better spacing */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Headline Summary - Compact */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <HarvestHeadlineSummary harvest={harvest} />
        </motion.div>

        {/* Yielded Items - Compact Grid */}
        {harvest.yield && harvest.yield.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Yielded Items
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {harvest.yield.map((yieldItem, index) => (
                <motion.div
                  key={yieldItem.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 * index }}
                >
                  <YieldCard
                    yieldItem={yieldItem}
                    onView={handleYieldView}
                    onDownload={handleYieldDownload}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Content Sections */}
        <div className="space-y-6">
          {/* Insights Panel - Compact */}
          {harvest.insights && harvest.insights.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                AI Insights
              </h2>
              <InsightsPanel insights={harvest.insights} />
            </motion.div>
          )}

          {/* Results Section - Compact */}
          {harvest.results && harvest.results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                Key Results
              </h2>
              <HarvestResults harvest={harvest} view={view} />
            </motion.div>
          )}
          
          {/* Empty State - Compact */}
          {(!harvest.insights || harvest.insights.length === 0) &&
           (!harvest.results || harvest.results.length === 0) &&
           (!harvest.yield || harvest.yield.length === 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 text-center"
            >
              <Sparkles className="w-10 h-10 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No insights or results yet. Check back soon.
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Completion Animation - Inline Mode */}
      <AnimatePresence>
        {showCompletionAnimation && (
          <div className="fixed top-4 right-4 z-40 max-w-md">
            <HarvestCompletionAnimation
              harvest={harvest}
              onComplete={() => setShowCompletionAnimation(false)}
              inline={true}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Save Seed Modal - Classic */}
      <AnimatePresence>
        {showSeedModal && (
          <SaveSeedModal
            harvest={harvest}
            onClose={() => setShowSeedModal(false)}
            onSave={() => {
              setShowSeedModal(false);
              // Show success notification
            }}
          />
        )}
      </AnimatePresence>

      {/* Seed Creator Modal - Enhanced */}
      <AnimatePresence>
        {showSeedCreator && (
          <SeedCreator
            harvest={harvest}
            isOpen={showSeedCreator}
            onClose={() => setShowSeedCreator(false)}
            onSave={handleSaveSeed}
          />
        )}
      </AnimatePresence>

      {/* Seed Quick Action Modal - New primary method */}
      <AnimatePresence>
        {showSeedQuickAction && (
          <SeedQuickAction
            harvest={harvest}
            isOpen={showSeedQuickAction}
            onClose={() => setShowSeedQuickAction(false)}
            onSuccess={handleSeedSuccess}
            context="harvest_completion"
          />
        )}
      </AnimatePresence>

      {/* Yield Preview Modal */}
      <AnimatePresence>
        {previewYieldItem && (
          <YieldPreviewModal
            yieldItem={previewYieldItem}
            harvestId={harvest?.id}
            onClose={() => setPreviewYieldItem(null)}
            onDownload={handleYieldDownload}
          />
        )}
      </AnimatePresence>
    </div>
  );
};