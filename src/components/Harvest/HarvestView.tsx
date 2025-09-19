import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  Calendar, 
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Download,
  Archive,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  Info,
  Filter,
  Search,
  Flower2,
  BarChart3,
  Sparkles,
  X
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest, HarvestInsight } from '@/types/harvest';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { HarvestCompletionAnimation } from './HarvestCompletionAnimation';
import { HarvestCompletionEpic } from './HarvestCompletionEpic';
import { HarvestAnalytics } from './HarvestAnalytics';
// import { HarvestArtifactOrganizer } from './HarvestArtifactOrganizer'; // Component does not exist
import { SaveAsSeedModal } from './SaveAsSeedModal';
import { HarvestHeadlineSummary } from './HarvestHeadlineSummary';
import { seedService } from '@/services/seedService';
import { SeedCreateInput } from '@/types/seed';
import { Tooltip } from '../common/Tooltip';

interface HarvestViewProps {
  harvest: Harvest;
  onClose?: () => void;
  onExport?: (format: 'json' | 'pdf' | 'markdown' | 'csv') => void;
  onArchive?: () => void;
}

export const HarvestView: React.FC<HarvestViewProps> = memo(({
  harvest,
  onClose,
  onExport,
  onArchive
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'terminals' | 'headlines' | 'analytics' | 'results' | 'insights' | 'artifacts'>('overview');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
  const [showSaveAsSeedModal, setShowSaveAsSeedModal] = useState(false);
  const [useEpicAnimation, setUseEpicAnimation] = useState(true); // Default to epic animation

  // Show completion animation if harvest just completed
  useEffect(() => {
    if (harvest?.status === 'ready' && harvest?.completedAt) {
      const completedRecently = new Date().getTime() - new Date(harvest.completedAt).getTime() < 5000;
      if (completedRecently) {
        setShowCompletionAnimation(true);
      }
    }
  }, [harvest?.status, harvest?.completedAt]);

  const toggleResultExpansion = useCallback((resultId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  }, [expandedResults]);

  const getInsightIcon = useCallback((type: HarvestInsight['type']) => {
    switch (type) {
      case 'discovery': return <Lightbulb className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'recommendation': return <TrendingUp className="w-4 h-4" />;
      case 'pattern': return <Info className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  }, []);

  const getInsightColor = useCallback((importance: HarvestInsight['importance']) => {
    switch (importance) {
      case 'critical': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      case 'high': return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30';
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'low': return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    }
  }, []);

  // Memoize filtered results to prevent unnecessary recalculation
  const filteredResults = useMemo(() => {
    return (harvest?.results || []).filter(result => {
      if (!result) return false;
      
      const matchesSearch = searchQuery === '' || 
        (result.content && result.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (result.agentName && result.agentName.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesType = filterType === 'all' || result.agentType === filterType;
      
      return matchesSearch && matchesType;
    });
  }, [harvest?.results, searchQuery, filterType]);

  // Memoize agent types array
  const agentTypes = useMemo(() => {
    return [...new Set((harvest?.results || []).map(r => r?.agentType).filter(Boolean))];
  }, [harvest?.results]);

  const handleSaveAsSeed = useCallback(async (seed: SeedCreateInput) => {
    try {
      await seedService.create(seed);
      // Show success notification
    } catch (error) {
      console.error('Failed to save seed:', error);
    }
  }, []);

  // const handleArtifactDownload = useCallback(async (artifactId: string) => {
  //   // Implementation for downloading artifacts
  //   console.log('Downloading artifact:', artifactId);
  // }, []);

  // Enhanced keyboard navigation for tabs
  const handleTabKeyDown = useCallback((event: React.KeyboardEvent, currentIndex: number, tabs: readonly string[]) => {
    let newIndex = currentIndex;
    
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        break;
      case 'ArrowRight':
        event.preventDefault();
        newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        event.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    
    setActiveTab(tabs[newIndex] as typeof activeTab);
  }, []);

  // Early return with error handling if harvest is null/undefined
  if (!harvest) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-apple-lg max-w-7xl mx-auto p-6">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          <p>No harvest data available</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Completion Animation - Choose between Epic or Standard */}
      {showCompletionAnimation && useEpicAnimation ? (
        <HarvestCompletionEpic
          harvest={harvest}
          onComplete={() => setShowCompletionAnimation(false)}
          onViewInBarn={() => {
            setShowCompletionAnimation(false);
            // Navigate to barn or trigger barn view
            window.location.href = '/barn';
          }}
          enableSound={true}
        />
      ) : showCompletionAnimation ? (
        <div className="fixed top-4 right-4 z-40 max-w-md">
          <HarvestCompletionAnimation
            harvest={harvest}
            onComplete={() => setShowCompletionAnimation(false)}
            inline={true}
          />
        </div>
      ) : null}

      {/* Save as Seed Modal */}
      <SaveAsSeedModal
        harvest={harvest}
        isOpen={showSaveAsSeedModal}
        onClose={() => setShowSaveAsSeedModal(false)}
        onSave={handleSaveAsSeed}
      />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-900 rounded-apple-xl shadow-apple-lg max-w-7xl mx-auto"
      >
        {/* Header with Apple-inspired design */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="p-8 border-b border-gray-200/50 dark:border-gray-800/50 bg-gradient-to-r from-apple-gray-50 via-white to-apple-gray-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 rounded-t-apple-xl"
        >
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center space-x-6">
            {/* Icon with status indicator */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
              className="relative"
            >
              <div className="p-4 bg-gradient-to-br from-apple-blue-light to-apple-blue-DEFAULT rounded-apple-xl shadow-apple-lg">
                <Package className="w-10 h-10 text-white" />
              </div>
              <motion.div
                className={`absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-white dark:border-gray-900 ${
                  harvest.status === 'ready' ? 'bg-apple-green-light' :
                  harvest.status === 'processing' ? 'bg-apple-yellow-DEFAULT' :
                  'bg-apple-red-DEFAULT'
                }`}
                animate={harvest.status === 'processing' ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </motion.div>
            
            <div className="space-y-2">
              <motion.h2
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent"
              >
                {harvest.farmName} Harvest
              </motion.h2>
              
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="flex items-center space-x-4 text-sm"
              >
                <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-apple-lg">
                  <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                    {format(new Date(harvest.createdAt), 'MMM d, yyyy h:mm a')}
                  </span>
                </div>
                
                <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-apple-lg">
                  <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                    {(() => {
                      // Check if this is a Quick Task (duration might be in milliseconds)
                      const isQuickTask = harvest.farmId?.startsWith('quick-task-');
                      let durationMs = harvest.summary.duration;
                      
                      // If it's a Quick Task and duration looks like milliseconds (> 10000), use it as-is
                      // Otherwise treat it as seconds and convert to milliseconds
                      if (!isQuickTask || durationMs < 10000) {
                        durationMs = durationMs * 1000;
                      }
                      
                      // For Quick Tasks, cap display at 5 minutes max
                      if (isQuickTask && durationMs > 300000) {
                        durationMs = 300000; // 5 minutes max for Quick Tasks
                      }
                      
                      return formatDuration(intervalToDuration({ 
                        start: 0, 
                        end: durationMs 
                      }));
                    })()}
                  </span>
                </div>
              </motion.div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Save as Seed Button */}
            <Tooltip content="Create a reusable seed template from this harvest" position="bottom">
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowSaveAsSeedModal(true)}
                className="flex items-center space-x-2 px-4 py-2.5 bg-apple-green-DEFAULT text-white rounded-apple-lg text-sm font-semibold hover:bg-apple-green-dark transition-all duration-200 shadow-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-green-DEFAULT focus:ring-offset-2"
                aria-label="Save harvest as seed template"
                tabIndex={0}
              >
                <Flower2 className="w-4 h-4" />
                <span>Save as Seed</span>
              </motion.button>
            </Tooltip>

            {onExport && (
              <Tooltip content="Export harvest data in various formats" position="bottom">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 }}
                  className="relative group"
                >
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-apple-lg transition-all duration-200 shadow-apple-sm"
                  >
                    <Download className="w-5 h-5" />
                  </motion.button>
                <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-apple-xl shadow-apple-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform group-hover:scale-100 scale-95 border border-gray-200 dark:border-gray-700">
                  {harvest.exportFormats.map(format => (
                    <button
                      key={format}
                      onClick={() => onExport(format)}
                      className="block w-full px-4 py-3 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-apple-xl last:rounded-b-apple-xl transition-colors font-medium"
                    >
                      Export as {format.toUpperCase()}
                    </button>
                  ))}
                </div>
                </motion.div>
              </Tooltip>
            )}
            
            {onArchive && (
              <Tooltip content="Archive this harvest for long-term storage" position="bottom">
                <motion.button
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onArchive}
                  className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-apple-lg transition-all duration-200 shadow-apple-sm"
                  aria-label="Archive harvest"
                >
                  <Archive className="w-5 h-5" />
                </motion.button>
              </Tooltip>
            )}
            
            {onClose && (
              <Tooltip content="Close harvest view" position="bottom">
                <motion.button
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-apple-lg transition-all duration-200"
                  aria-label="Close harvest view"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Status Badge and Tags */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex items-center space-x-3"
        >
          <div className={clsx(
            'px-4 py-2 rounded-apple-lg text-sm font-semibold shadow-apple-sm border flex items-center space-x-2',
            harvest.status === 'ready' 
              ? 'bg-apple-green-light/10 text-apple-green-DEFAULT border-apple-green-light/20 dark:bg-apple-green-DEFAULT/10 dark:text-apple-green-light' :
            harvest.status === 'processing' 
              ? 'bg-apple-yellow-DEFAULT/10 text-apple-yellow-DEFAULT border-apple-yellow-DEFAULT/20 dark:bg-apple-yellow-light/10 dark:text-apple-yellow-light' :
            harvest.status === 'failed' 
              ? 'bg-apple-red-DEFAULT/10 text-apple-red-DEFAULT border-apple-red-DEFAULT/20 dark:bg-apple-red-light/10 dark:text-apple-red-light' :
              'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
          )}>
            <div className={`w-2 h-2 rounded-full ${
              harvest.status === 'ready' ? 'bg-apple-green-DEFAULT' :
              harvest.status === 'processing' ? 'bg-apple-yellow-DEFAULT' :
              harvest.status === 'failed' ? 'bg-apple-red-DEFAULT' :
              'bg-gray-500'
            }`} />
            <span className="capitalize">{harvest.status}</span>
          </div>
          
          {harvest.tags.map((tag, index) => (
            <motion.span
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + index * 0.1 }}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400 rounded-apple border border-gray-200 dark:border-gray-700"
            >
              {tag}
            </motion.span>
          ))}
        </motion.div>
      </motion.div>

      {/* Apple-style Enhanced Tabs */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-100/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50"
      >
        <div className="flex items-center p-4">
          <div 
            className="flex items-center bg-white dark:bg-gray-800 rounded-apple-xl p-1.5 shadow-inner"
            role="tablist"
            aria-label="Harvest content tabs"
          >
            {(['overview', 'headlines', 'analytics', 'results', 'insights', 'artifacts'] as const).map((tab, index) => {
              const tabs = ['overview', 'headlines', 'analytics', 'results', 'insights', 'artifacts'] as const;
              const isActive = activeTab === tab;
              const tabIcons = {
                overview: Sparkles,
                headlines: FileText,
                analytics: BarChart3,
                results: CheckCircle,
                insights: TrendingUp,
                artifacts: Package
              };
              const TabIcon = tabIcons[tab];
              
              return (
                <motion.button
                  key={tab}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  onClick={() => setActiveTab(tab)}
                  onKeyDown={(e) => handleTabKeyDown(e, index, tabs)}
                  whileHover={{ scale: isActive ? 1 : 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={clsx(
                    'relative px-4 py-2.5 rounded-apple-lg text-sm font-semibold transition-all duration-300 flex items-center space-x-2 min-w-0 focus:outline-none focus:ring-2 focus:ring-apple-blue-DEFAULT focus:ring-offset-2',
                    isActive
                      ? 'bg-apple-blue-DEFAULT text-white shadow-apple-sm'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  )}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`tabpanel-${tab}`}
                  tabIndex={isActive ? 0 : -1}
                  id={`tab-${tab}`}
                >
                  <TabIcon className={`w-4 h-4 ${isActive ? 'text-white' : ''}`} />
                  <span className="truncate">
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === 'results' && (
                      <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                        isActive 
                          ? 'bg-white/20 text-white' 
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                      }`}>
                        {harvest.results?.length || 0}
                      </span>
                    )}
                    {tab === 'insights' && (
                      <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                        isActive 
                          ? 'bg-white/20 text-white' 
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                      }`}>
                        {harvest.insights?.length || 0}
                      </span>
                    )}
                    {tab === 'artifacts' && (
                      <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                        isActive 
                          ? 'bg-white/20 text-white' 
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                      }`}>
                        {harvest.yield?.length || 0}
                      </span>
                    )}
                  </span>
                  
                  {/* Active tab indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-apple-blue-DEFAULT rounded-apple-lg -z-10"
                      transition={{ type: "spring", damping: 30, stiffness: 400 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
          
          {/* Tab controls */}
          <div className="ml-auto flex items-center space-x-3">
            {/* Search within current tab */}
            {(activeTab === 'results' || activeTab === 'artifacts') && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${activeTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-apple-lg text-sm focus:outline-none focus:ring-2 focus:ring-apple-blue-DEFAULT focus:border-apple-blue-DEFAULT transition-all"
                  aria-label={`Search ${activeTab}`}
                  autoComplete="off"
                />
              </div>
            )}
            
            {/* Filter dropdown for results */}
            {activeTab === 'results' && agentTypes.length > 1 && (
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="pl-10 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-apple-lg text-sm focus:outline-none focus:ring-2 focus:ring-apple-blue-DEFAULT focus:border-apple-blue-DEFAULT appearance-none transition-all"
                  aria-label="Filter results by agent type"
                >
                  <option value="all">All Types</option>
                  {agentTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Tab Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
                role="tabpanel"
                id="tabpanel-overview"
                aria-labelledby="tab-overview"
              >
              {/* Enhanced Summary with Headlines */}
              <div className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-apple-lg p-6 border border-primary-200 dark:border-primary-800">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                    <Sparkles className="w-6 h-6 mr-2 text-primary-600 dark:text-primary-400" />
                    Executive Summary
                  </h3>
                  <span className="px-3 py-1 bg-primary-600 text-white text-sm font-medium rounded-full">
                    {harvest.quality?.overallScore || 0}% Quality
                  </span>
                </div>
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                  {harvest.summary?.description || 'No description available'}
                </p>
                <div className="mt-4 flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1 text-green-600 dark:text-green-400" />
                    {harvest.summary?.completedTasks || 0} tasks completed
                  </span>
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-1 text-blue-600 dark:text-blue-400" />
                    {(() => {
                      const isQuickTask = harvest.farmId?.startsWith('quick-task-');
                      let duration = harvest.summary?.duration || 0;
                      
                      // For Quick Tasks, if duration > 10000, it's likely in milliseconds
                      if (isQuickTask && duration > 10000) {
                        duration = duration / 1000; // Convert to seconds
                      }
                      
                      // Cap Quick Tasks at 5 minutes
                      if (isQuickTask && duration > 300) {
                        duration = 300;
                      }
                      
                      const minutes = Math.floor(duration / 60);
                      if (minutes === 0) {
                        return `${Math.floor(duration)}s`;
                      }
                      return `${minutes}m`;
                    })()} duration
                  </span>
                  <span className="flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1 text-purple-600 dark:text-purple-400" />
                    {harvest.summary?.efficiency || 0}% efficiency
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-apple-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {harvest.summary?.completedTasks || 0}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Completed Tasks</p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-apple-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {harvest.summary?.failedTasks || 0}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Failed Tasks</p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-apple-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {harvest.summary.efficiency}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Efficiency</p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-apple-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {(() => {
                        const isQuickTask = harvest.farmId?.startsWith('quick-task-');
                        let duration = harvest.summary.duration;
                        
                        // For Quick Tasks, if duration > 10000, it's likely in milliseconds
                        if (isQuickTask && duration > 10000) {
                          duration = duration / 1000; // Convert to seconds
                        }
                        
                        // Cap Quick Tasks at 5 minutes
                        if (isQuickTask && duration > 300) {
                          duration = 300;
                        }
                        
                        const minutes = Math.floor(duration / 60);
                        const seconds = Math.floor(duration % 60);
                        
                        // Show minutes and seconds for short durations
                        if (minutes === 0) {
                          return `${seconds}s`;
                        } else if (seconds === 0) {
                          return `${minutes}m`;
                        } else {
                          return `${minutes}m ${seconds}s`;
                        }
                      })()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Duration</p>
                </div>
              </div>

              {/* Quality Scores */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Quality Metrics</h3>
                <div className="space-y-3">
                  {Object.entries(harvest.quality).map(([key, value]) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {value.toFixed(0)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${value}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                          className={clsx(
                            'h-2 rounded-full',
                            value >= 90 ? 'bg-green-500' :
                            value >= 70 ? 'bg-yellow-500' :
                            'bg-red-500'
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
              role="tabpanel"
              id="tabpanel-results"
              aria-labelledby="tab-results"
            >
              {/* Results List */}
              <div className="space-y-2">
                {filteredResults.map((result) => (
                  <div
                    key={result.id}
                    className="border border-gray-200 dark:border-gray-800 rounded-apple-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleResultExpansion(result.id)}
                      className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-800 focus:ring-2 focus:ring-apple-blue-DEFAULT focus:ring-inset"
                      aria-expanded={expandedResults.has(result.id)}
                      aria-controls={`result-content-${result.id}`}
                      aria-label={`${expandedResults.has(result.id) ? 'Collapse' : 'Expand'} result from ${result.agentName}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {result.success ? (
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                          )}
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              {result.agentName} - {result.taskType}
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {format(new Date(result.timestamp), 'h:mm:ss a')} • {result.processingTime}s
                            </p>
                          </div>
                        </div>
                        {expandedResults.has(result.id) ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>
                    
                    <AnimatePresence>
                      {expandedResults.has(result.id) && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                          id={`result-content-${result.id}`}
                        >
                          <div className="p-4 pt-0">
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-apple p-4">
                              <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {result.content}
                              </pre>
                              {result.error && (
                                <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-sm text-red-700 dark:text-red-300">
                                  Error: {result.error}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
              role="tabpanel"
              id="tabpanel-insights"
              aria-labelledby="tab-insights"
            >
              {(harvest.insights || []).map((insight) => (
                <div
                  key={insight.id}
                  className="border border-gray-200 dark:border-gray-800 rounded-apple-lg p-4"
                >
                  <div className="flex items-start space-x-3">
                    <div className={clsx(
                      'p-2 rounded-apple',
                      getInsightColor(insight.importance)
                    )}>
                      {getInsightIcon(insight.type)}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                        {insight.title}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {insight.description}
                      </p>
                      {insight.source.agentName && (
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          Source: {insight.source.agentName}
                        </p>
                      )}
                    </div>
                    <span className={clsx(
                      'px-2 py-1 rounded text-xs font-medium',
                      getInsightColor(insight.importance)
                    )}>
                      {insight.importance}
                    </span>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'artifacts' && (
            <motion.div
              key="artifacts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
              role="tabpanel"
              id="tabpanel-artifacts"
              aria-labelledby="tab-artifacts"
            >
              {(harvest.yield || []).map((yieldItem) => (
                <div
                  key={yieldItem.id}
                  className="border border-gray-200 dark:border-gray-800 rounded-apple-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {yieldItem.name}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {yieldItem.description} • {yieldItem.size ? `${(yieldItem.size / 1024).toFixed(2)} KB` : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <button className="p-2 text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'headlines' && (
            <motion.div
              key="headlines"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              role="tabpanel"
              id="tabpanel-headlines"
              aria-labelledby="tab-headlines"
            >
              <HarvestHeadlineSummary harvest={harvest} />
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              role="tabpanel"
              id="tabpanel-analytics"
              aria-labelledby="tab-analytics"
            >
              <HarvestAnalytics harvest={harvest} />
            </motion.div>
          )}

          {activeTab === 'artifacts' && (
            <motion.div
              key="artifacts-enhanced"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              role="tabpanel"
              id="tabpanel-artifacts-enhanced"
              aria-labelledby="tab-artifacts"
            >
              {/* <HarvestArtifactOrganizer
                artifacts={harvest.yield || []}
                onDownload={handleArtifactDownload}
              /> */}
              <div className="text-center text-gray-500 p-4">
                <FileText className="w-8 h-8 mx-auto mb-2" />
                <p>Artifact organizer component not yet implemented</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
    </>
  );
});

HarvestView.displayName = 'HarvestView';