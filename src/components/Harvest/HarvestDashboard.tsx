import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle,
  Activity,
  Award,
  Zap,
  Grid,
  List,
  Download,
  Save
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest } from '../../types/harvest';
import { HarvestDisplay } from './HarvestDisplay';
import { ArtifactCard } from './ArtifactCard';
import { InsightsPanel } from './InsightsPanel';
import { SeedCreator } from './SeedCreator';
import { HarvestResults } from './HarvestResults';
import { HarvestArtifacts } from './HarvestArtifacts';
import { HarvestAnalytics } from './HarvestAnalytics';
import { HarvestHeadlineSummary } from './HarvestHeadlineSummary';
import { HarvestCompletionAnimation } from './HarvestCompletionAnimation';
import { SaveSeedModal } from './SaveSeedModal';
import { harvestService } from '../../services/harvestService';
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
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [showSeedCreator, setShowSeedCreator] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
  const [showEnhancedView, setShowEnhancedView] = useState(false);
  const [realtimeAgents, setRealtimeAgents] = useState<any[]>([]);

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
      setHarvest(latestHarvest);
      
      // Trigger celebration animation for completed harvests
      if (latestHarvest?.status === 'ready' && !celebrating) {
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
        includeArtifacts: true
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

  const handleArtifactView = useCallback((artifact: any) => {
    console.log('Viewing artifact:', artifact);
    // TODO: Implement artifact viewer
  }, []);

  const handleArtifactDownload = useCallback(async (artifact: any) => {
    if (!harvest) return;
    await harvestService.downloadArtifact(harvest.id, artifact.id);
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

      {/* Header */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
                  Completed {format(new Date(harvest.completedAt || harvest.createdAt), 'MMM d, yyyy • h:mm a')}
                </motion.p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* View Toggle */}
              <div className="bg-gray-100 dark:bg-gray-800 rounded-apple-lg p-1 flex">
                <button
                  onClick={() => setView('grid')}
                  className={clsx(
                    'p-2 rounded-apple transition-all',
                    view === 'grid' 
                      ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600 dark:text-primary-400' 
                      : 'text-gray-600 dark:text-gray-400'
                  )}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setView('list')}
                  className={clsx(
                    'p-2 rounded-apple transition-all',
                    view === 'list' 
                      ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-600 dark:text-primary-400' 
                      : 'text-gray-600 dark:text-gray-400'
                  )}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Enhanced View Toggle */}
              <button
                onClick={() => setShowEnhancedView(!showEnhancedView)}
                className={clsx(
                  'px-4 py-2 rounded-apple-lg transition-all',
                  showEnhancedView
                    ? 'bg-purple-600 text-white shadow-apple'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                )}
              >
                <Sparkles className="w-4 h-4 inline mr-2" />
                {showEnhancedView ? 'Classic View' : 'Enhanced View'}
              </button>

              {/* Save Seed */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowSeedCreator(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-apple-lg shadow-apple transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Save Seed</span>
              </motion.button>

              {/* Export Menu */}
              <div className="relative group">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-apple-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </motion.button>
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

      {/* Hero Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
        >
          {[
            {
              icon: CheckCircle,
              label: 'Tasks Completed',
              value: harvest.summary.completedTasks,
              total: harvest.summary.totalTasks,
              color: 'from-green-500 to-green-600'
            },
            {
              icon: TrendingUp,
              label: 'Efficiency',
              value: `${harvest.summary.efficiency}%`,
              color: 'from-blue-500 to-blue-600'
            },
            {
              icon: Clock,
              label: 'Duration',
              value: `${Math.floor(harvest.summary.duration / 60)}m`,
              subvalue: `${harvest.summary.duration % 60}s`,
              color: 'from-purple-500 to-purple-600'
            },
            {
              icon: Award,
              label: 'Quality Score',
              value: `${harvest.quality.overallScore}`,
              max: 100,
              color: 'from-yellow-500 to-orange-500'
            }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative overflow-hidden bg-white dark:bg-gray-900 rounded-apple-xl shadow-apple-lg p-6"
            >
              <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8">
                <div className={clsx(
                  'w-full h-full rounded-full opacity-10 bg-gradient-to-br',
                  stat.color
                )} />
              </div>
              
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <stat.icon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                  {stat.total && (
                    <span className="text-xs text-gray-500 dark:text-gray-500">
                      of {stat.total}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                    {stat.subvalue && (
                      <span className="text-lg font-normal text-gray-600 dark:text-gray-400 ml-1">
                        {stat.subvalue}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                </div>
                
                {stat.max && (
                  <div className="mt-3 w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(parseInt(stat.value) / stat.max) * 100}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className={clsx('h-1.5 rounded-full bg-gradient-to-r', stat.color)}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Headline Summary Section - New Apple-inspired design */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <HarvestHeadlineSummary harvest={harvest} />
        </motion.div>

        {/* Main Content - Conditional Enhanced/Classic View */}
        {showEnhancedView ? (
          <div className="space-y-8">
            {/* Enhanced Harvest Display */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <HarvestDisplay
                harvest={harvest}
                onSaveAsSeed={() => setShowSeedCreator(true)}
                onExport={handleExport}
              />
            </motion.div>

            {/* Insights Panel */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                AI Insights & Discoveries
              </h2>
              <InsightsPanel insights={harvest.insights} />
            </motion.div>

            {/* Artifacts Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Generated Artifacts
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {harvest.artifacts.map((artifact, index) => (
                  <motion.div
                    key={artifact.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * index }}
                  >
                    <ArtifactCard
                      artifact={artifact}
                      onView={handleArtifactView}
                      onDownload={handleArtifactDownload}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Classic View - Original Components */}
            {/* Analytics Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <div className="flex items-center space-x-2 mb-4">
                <Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Performance Analytics</h2>
              </div>
              <HarvestAnalytics harvest={harvest} />
            </motion.div>

            {/* Results Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="flex items-center space-x-2 mb-4">
                <Zap className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Key Results</h2>
              </div>
              <HarvestResults harvest={harvest} view={view} />
            </motion.div>

            {/* Artifacts Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex items-center space-x-2 mb-4">
                <Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Digital Artifacts</h2>
              </div>
              <HarvestArtifacts harvest={harvest} view={view} />
            </motion.div>
          </div>
        )}
      </div>

      {/* Completion Animation */}
      <AnimatePresence>
        {showCompletionAnimation && (
          <HarvestCompletionAnimation
            harvest={harvest}
            onComplete={() => setShowCompletionAnimation(false)}
          />
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
    </div>
  );
};