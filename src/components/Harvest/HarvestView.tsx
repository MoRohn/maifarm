import React, { useState, useEffect } from 'react';
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
  Sparkles
} from 'lucide-react';
import { clsx } from 'clsx';
import { Harvest, HarvestInsight, HarvestResult, HarvestArtifact } from '../../types';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { harvestService } from '../../services/harvestService';
import { HarvestCompletionAnimation } from './HarvestCompletionAnimation';
import { HarvestAnalytics } from './HarvestAnalytics';
import { HarvestArtifactOrganizer } from './HarvestArtifactOrganizer';
import { SaveAsSeedModal } from './SaveAsSeedModal';
import { HarvestHeadlineSummary } from './HarvestHeadlineSummary';
import { FarmTerminalGrid } from './FarmTerminalGrid';
import { seedService } from '../../services/seedService';
import { SeedCreateInput } from '../../types/seed';

interface HarvestViewProps {
  harvest: Harvest;
  onClose?: () => void;
  onExport?: (format: 'json' | 'pdf' | 'markdown' | 'csv') => void;
  onArchive?: () => void;
}

export const HarvestView: React.FC<HarvestViewProps> = ({
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

  // Show completion animation if harvest just completed
  useEffect(() => {
    if (harvest.status === 'ready' && harvest.completedAt) {
      const completedRecently = new Date().getTime() - new Date(harvest.completedAt).getTime() < 5000;
      if (completedRecently) {
        setShowCompletionAnimation(true);
      }
    }
  }, [harvest.status, harvest.completedAt]);

  const toggleResultExpansion = (resultId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  };

  const getInsightIcon = (type: HarvestInsight['type']) => {
    switch (type) {
      case 'discovery': return <Lightbulb className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'recommendation': return <TrendingUp className="w-4 h-4" />;
      case 'pattern': return <Info className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getInsightColor = (importance: HarvestInsight['importance']) => {
    switch (importance) {
      case 'critical': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      case 'high': return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30';
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'low': return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
    }
  };

  // Filter results based on search and type
  const filteredResults = harvest.results.filter(result => {
    const matchesSearch = searchQuery === '' || 
      result.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      result.agentName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'all' || result.agentType === filterType;
    
    return matchesSearch && matchesType;
  });

  const agentTypes = [...new Set(harvest.results.map(r => r.agentType))];

  const handleSaveAsSeed = async (seed: SeedCreateInput) => {
    try {
      await seedService.create(seed);
      // Show success notification
    } catch (error) {
      console.error('Failed to save seed:', error);
    }
  };

  const handleArtifactDownload = async (artifactId: string) => {
    // Implementation for downloading artifacts
    console.log('Downloading artifact:', artifactId);
  };

  return (
    <>
      {/* Completion Animation */}
      {showCompletionAnimation && (
        <HarvestCompletionAnimation
          harvest={harvest}
          onComplete={() => setShowCompletionAnimation(false)}
        />
      )}

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
        {/* Header with enhanced design */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 rounded-t-apple-xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-apple-lg">
              <Package className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {harvest.farmName} Harvest
              </h2>
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center">
                  <Calendar className="w-4 h-4 mr-1" />
                  {format(new Date(harvest.createdAt), 'MMM d, yyyy h:mm a')}
                </span>
                <span className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  {formatDuration(intervalToDuration({ 
                    start: 0, 
                    end: harvest.summary.duration * 1000 
                  }))}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Save as Seed Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSaveAsSeedModal(true)}
              className="flex items-center space-x-2 px-3 py-1.5 bg-green-600 text-white rounded-apple text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <Flower2 className="w-4 h-4" />
              <span>Save as Seed</span>
            </motion.button>

            {onExport && (
              <div className="relative group">
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                >
                  <Download className="w-5 h-5" />
                </motion.button>
                <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-gray-800 rounded-apple shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  {harvest.exportFormats.map(format => (
                    <button
                      key={format}
                      onClick={() => onExport(format)}
                      className="block w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 rounded-apple transition-colors"
                    >
                      Export as {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {onArchive && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onArchive}
                className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                title="Archive harvest"
              >
                <Archive className="w-5 h-5" />
              </motion.button>
            )}
            
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center space-x-2">
          <span className={clsx(
            'px-3 py-1 rounded-full text-xs font-medium',
            harvest.status === 'ready' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
            harvest.status === 'processing' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
            harvest.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
            'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
          )}>
            {harvest.status.charAt(0).toUpperCase() + harvest.status.slice(1)}
          </span>
          
          {harvest.tags.map((tag, index) => (
            <span
              key={index}
              className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Enhanced Tabs with Analytics */}
      <div className="flex space-x-1 p-2 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
        {(['overview', 'headlines', 'analytics', 'results', 'insights', 'artifacts'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-2 rounded-apple text-sm font-medium transition-all flex items-center space-x-2',
              activeTab === tab
                ? 'bg-white dark:bg-gray-900 text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            )}
          >
            {tab === 'analytics' && <BarChart3 className="w-4 h-4" />}
            <span>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'results' && ` (${harvest.results.length})`}
              {tab === 'insights' && ` (${harvest.insights.length})`}
              {tab === 'artifacts' && ` (${harvest.artifacts.length})`}
            </span>
          </button>
        ))}
      </div>

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
            >
              {/* Enhanced Summary with Headlines */}
              <div className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-apple-lg p-6 border border-primary-200 dark:border-primary-800">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                    <Sparkles className="w-6 h-6 mr-2 text-primary-600 dark:text-primary-400" />
                    Executive Summary
                  </h3>
                  <span className="px-3 py-1 bg-primary-600 text-white text-sm font-medium rounded-full">
                    {harvest.quality.overallScore}% Quality
                  </span>
                </div>
                <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                  {harvest.summary.description}
                </p>
                <div className="mt-4 flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1 text-green-600 dark:text-green-400" />
                    {harvest.summary.completedTasks} tasks completed
                  </span>
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-1 text-blue-600 dark:text-blue-400" />
                    {Math.floor(harvest.summary.duration / 60)}m duration
                  </span>
                  <span className="flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1 text-purple-600 dark:text-purple-400" />
                    {harvest.summary.efficiency}% efficiency
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-apple-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {harvest.summary.completedTasks}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Completed Tasks</p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-apple-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {harvest.summary.failedTasks}
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
                      {Math.floor(harvest.summary.duration / 60)}m
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
              className="space-y-4"
            >
              {/* Search and Filter */}
              <div className="flex items-center space-x-4 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search results..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="pl-10 pr-8 py-2 border border-gray-300 dark:border-gray-700 rounded-apple bg-white dark:bg-gray-800 text-gray-900 dark:text-white appearance-none"
                  >
                    <option value="all">All Types</option>
                    {agentTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Results List */}
              <div className="space-y-2">
                {filteredResults.map((result) => (
                  <div
                    key={result.id}
                    className="border border-gray-200 dark:border-gray-800 rounded-apple-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleResultExpansion(result.id)}
                      className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
            >
              {harvest.insights.map((insight) => (
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
            >
              {harvest.artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="border border-gray-200 dark:border-gray-800 rounded-apple-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {artifact.name}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {artifact.description} • {(artifact.size / 1024).toFixed(2)} KB
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
            >
              <HarvestArtifactOrganizer
                artifacts={harvest.artifacts}
                onDownload={handleArtifactDownload}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
    </>
  );
};