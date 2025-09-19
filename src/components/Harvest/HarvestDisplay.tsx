import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  Sparkles, 
  TrendingUp, 
  FileCode, 
  AlertCircle,
  CheckCircle,
  Download,
  Save,
  Share2,
  Zap,
  Brain,
  Trophy,
  ChevronRight,
  Eye,
  Clock,
  Activity,
  FolderTree
} from 'lucide-react';
import { Harvest, HarvestYield, HarvestInsight } from '@/types/harvest';
import { formatDistanceToNow } from 'date-fns';
import { HarvestFileTree, FileTreeNode } from './HarvestFileTree';

interface HarvestDisplayProps {
  harvest: Harvest;
  onSaveAsSeed?: () => void;
  onExport?: (format: 'json' | 'pdf' | 'markdown' | 'csv') => void;
}

export const HarvestDisplay: React.FC<HarvestDisplayProps> = ({ 
  harvest, 
  onSaveAsSeed,
  onExport 
}) => {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'yield' | 'insights' | 'files'>('overview');
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  const [fileTreeLoading, setFileTreeLoading] = useState(false);
  
  const fetchFileTree = async () => {
    if (!harvest.id) return;
    setFileTreeLoading(true);
    try {
      const response = await fetch(`/api/harvests/${harvest.id}/files`);
      if (response.ok) {
        const data = await response.json();
        setFileTree(data);
      }
    } catch (error) {
      console.error('Failed to fetch file tree:', error);
    } finally {
      setFileTreeLoading(false);
    }
  };
  
  useEffect(() => {
    if (harvest.status === 'ready' && selectedTab === 'files') {
      fetchFileTree();
    }
  }, [harvest.status, selectedTab]);

  // Calculate headline metrics
  const successRate = harvest.summary.totalTasks > 0 
    ? ((harvest.summary.completedTasks / harvest.summary.totalTasks) * 100).toFixed(1)
    : '0';

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getInsightIcon = (type: HarvestInsight['type']) => {
    switch (type) {
      case 'discovery': return <Sparkles className="w-4 h-4" />;
      case 'pattern': return <Activity className="w-4 h-4" />;
      case 'recommendation': return <Brain className="w-4 h-4" />;
      case 'warning': return <AlertCircle className="w-4 h-4" />;
      default: return <CheckCircle className="w-4 h-4" />;
    }
  };

  const getImportanceColor = (importance: HarvestInsight['importance']) => {
    switch (importance) {
      case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Hero Section with Gradient */}
      <div className="relative bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 p-8">
        <div className="absolute inset-0 bg-black/20" />
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="relative z-10"
        >
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <Trophy className="w-10 h-10 text-yellow-300" />
                Harvest Complete
              </h1>
              <p className="text-white/90 text-lg">
                {harvest.farmName} • {formatDistanceToNow(harvest.createdAt, { addSuffix: true })}
              </p>
              <p className="text-white/80 mt-2 max-w-2xl">
                {harvest.description || harvest.summary.description}
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onSaveAsSeed}
                className="p-3 bg-white/20 backdrop-blur rounded-xl hover:bg-white/30 transition-colors text-white"
                title="Save as Seed"
              >
                <Save className="w-5 h-5" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onExport?.('json')}
                className="p-3 bg-white/20 backdrop-blur rounded-xl hover:bg-white/30 transition-colors text-white"
                title="Export"
              >
                <Download className="w-5 h-5" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-3 bg-white/20 backdrop-blur rounded-xl hover:bg-white/30 transition-colors text-white"
                title="Share"
              >
                <Share2 className="w-5 h-5" />
              </motion.button>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-4 mt-8">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-white/20 backdrop-blur rounded-xl p-4"
            >
              <div className="flex items-center gap-2 text-white/80 mb-1">
                <Zap className="w-4 h-4" />
                <span className="text-sm">Success Rate</span>
              </div>
              <div className="text-3xl font-bold text-white">{successRate}%</div>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="bg-white/20 backdrop-blur rounded-xl p-4"
            >
              <div className="flex items-center gap-2 text-white/80 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">Quality Score</span>
              </div>
              <div className="text-3xl font-bold text-white">{harvest.quality.overallScore}</div>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="bg-white/20 backdrop-blur rounded-xl p-4"
            >
              <div className="flex items-center gap-2 text-white/80 mb-1">
                <Package className="w-4 h-4" />
                <span className="text-sm">Artifacts</span>
              </div>
              <div className="text-3xl font-bold text-white">{harvest.yield.length}</div>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="bg-white/20 backdrop-blur rounded-xl p-4"
            >
              <div className="flex items-center gap-2 text-white/80 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Duration</span>
              </div>
              <div className="text-3xl font-bold text-white">
                {Math.floor(harvest.summary.duration / 60)}m
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-800">
        <div className="flex">
          {(['overview', 'yield', 'insights', 'files'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`px-6 py-4 text-sm font-medium capitalize transition-colors relative ${
                selectedTab === tab
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {tab}
              {selectedTab === tab && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {selectedTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Quality Breakdown */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Quality Metrics
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Completeness</span>
                      <span className={`font-medium ${getQualityColor(harvest.quality.completeness)}`}>
                        {harvest.quality.completeness}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${harvest.quality.completeness}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Accuracy</span>
                      <span className={`font-medium ${getQualityColor(harvest.quality.accuracy)}`}>
                        {harvest.quality.accuracy}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${harvest.quality.accuracy}%` }}
                        transition={{ duration: 1, delay: 0.1, ease: 'easeOut' }}
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Relevance</span>
                      <span className={`font-medium ${getQualityColor(harvest.quality.relevance)}`}>
                        {harvest.quality.relevance}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${harvest.quality.relevance}%` }}
                        transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
                        className="bg-gradient-to-r from-cyan-500 to-green-500 h-2 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Agent Summary */}
              {harvest.summary.agents && harvest.summary.agents.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Agent Performance
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {harvest.summary.agents.slice(0, 4).map((agent, index) => (
                      <motion.div
                        key={agent.id || index}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                      >
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          {agent.name}
                        </div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                          {agent.tasksCompleted || 0}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500">
                          tasks completed
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {selectedTab === 'yield' && (
            <motion.div
              key="yield"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {harvest.yield.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No yield generated yet</p>
                </div>
              ) : (
                harvest.yield.map((yieldItem, index) => (
                  <motion.div
                    key={yieldItem.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                          <FileCode className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {yieldItem.name}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {yieldItem.description}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-500">
                            <span>{yieldItem.type}</span>
                            <span>•</span>
                            <span>{yieldItem.size ? `${(yieldItem.size / 1024).toFixed(1)} KB` : 'N/A'}</span>
                            <span>•</span>
                            <span>By {yieldItem.createdBy?.agentName || 'Unknown'}</span>
                          </div>
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Eye className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      </motion.button>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {selectedTab === 'insights' && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {harvest.insights.length === 0 ? (
                <div className="text-center py-12">
                  <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No insights generated yet</p>
                </div>
              ) : (
                harvest.insights.map((insight, index) => (
                  <motion.div
                    key={insight.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${getImportanceColor(insight.importance)}`}>
                        {getInsightIcon(insight.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {insight.title}
                          </h4>
                          <span className={`text-xs px-2 py-1 rounded-full ${getImportanceColor(insight.importance)}`}>
                            {insight.importance}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {insight.description}
                        </p>
                        {insight.source.agentName && (
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                            Source: {insight.source.agentName}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {selectedTab === 'files' && (
            <motion.div
              key="files"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {fileTreeLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                </div>
              ) : fileTree ? (
                <HarvestFileTree
                  fileTree={fileTree}
                  onFileSelect={(file) => {
                    // Handle file selection (preview)
                    window.open(`/api/harvests/${harvest.id}/files/content?path=${encodeURIComponent(file.path)}`, '_blank');
                  }}
                  onFileDownload={(file) => {
                    // Handle file download
                    window.location.href = `/api/harvests/${harvest.id}/files/download?path=${encodeURIComponent(file.path)}`;
                  }}
                  onFilePreview={(file) => {
                    // Handle file preview in modal (future enhancement)
                    window.open(`/api/harvests/${harvest.id}/files/content?path=${encodeURIComponent(file.path)}`, '_blank');
                  }}
                />
              ) : (
                <div className="text-center py-12">
                  <FolderTree className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    No files collected for this harvest yet
                  </p>
                  <button
                    onClick={fetchFileTree}
                    className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Refresh Files
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};