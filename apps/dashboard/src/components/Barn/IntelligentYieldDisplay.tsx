/**
 * Intelligent Yield Display Component
 *
 * Advanced yield visualization with quality metrics, incubation suggestions,
 * and relationship mapping.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  FileCode,
  FileText,
  Database,
  TestTube,
  Settings,
  BarChart3,
  GitBranch,
  Sparkles,
  TrendingUp,
  Award,
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  Download,
  Share2,
  MoreVertical,
  ChevronRight,
  Layers,
  Zap,
  Brain,
  RefreshCw,
  Play,
  ArrowUpRight,
  Code,
  Hash,
  Globe,
  Shield,
  Cpu
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { barnService } from '@/services/barnService';
import { formatDistanceToNow } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface IntelligentYield {
  id: string;
  farmId: string;
  harvestId?: string;
  agentId: number;
  agentName: string;
  type: 'code' | 'test' | 'documentation' | 'configuration' | 'data' | 'api' | 'ui_component' | 'database' | 'deployment' | 'analysis';
  category: 'implementation' | 'testing' | 'documentation' | 'infrastructure' | 'research' | 'optimization';
  title: string;
  description: string;
  path: string;
  content?: string;
  preview: string;
  quality: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    confidence: number;
    completeness: number;
    correctness: number;
    readability: number;
    performance: number;
  };
  metadata: {
    size: number;
    language?: string;
    framework?: string;
    dependencies?: string[];
    linesOfCode?: number;
    complexity?: number;
    createdAt: Date;
    modifiedAt?: Date;
    checksum: string;
    mimeType?: string;
    encoding?: string;
  };
  correlation: {
    promptKeywords: string[];
    matchedKeywords: string[];
    contextSnippets: string[];
    relevanceScore: number;
    confidence: number;
    reasoning: string;
  };
  relationships: {
    dependsOn?: string[];
    usedBy?: string[];
    relatedTo?: string[];
    parentYield?: string;
  };
  tags: string[];
  autoTags: string[];
  userTags?: string[];
  incubation: {
    canIncubate: boolean;
    suggestedPrompts: string[];
    improvementAreas: string[];
    estimatedEffort: 'low' | 'medium' | 'high';
  };
}

interface IntelligentYieldDisplayProps {
  yields: IntelligentYield[];
  harvestId: string;
  farmName: string;
  onIncubate?: (yieldId: string, prompt: string) => void;
  className?: string;
}

// ============================================================================
// Intelligent Yield Display Component
// ============================================================================

export const IntelligentYieldDisplay: React.FC<IntelligentYieldDisplayProps> = ({
  yields,
  harvestId,
  farmName,
  onIncubate,
  className
}) => {
  const [selectedYield, setSelectedYield] = useState<IntelligentYield | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'graph'>('grid');
  const [sortBy, setSortBy] = useState<'quality' | 'relevance' | 'recent' | 'size'>('quality');
  const [filterType, setFilterType] = useState<string>('all');
  const [showIncubationModal, setShowIncubationModal] = useState(false);
  const [incubationPrompt, setIncubationPrompt] = useState('');
  const [expandedYields, setExpandedYields] = useState<Set<string>>(new Set());

  // Sort yields
  const sortedYields = [...yields].sort((a, b) => {
    switch (sortBy) {
      case 'quality':
        return b.quality.score - a.quality.score;
      case 'relevance':
        return b.correlation.relevanceScore - a.correlation.relevanceScore;
      case 'recent':
        return new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime();
      case 'size':
        return b.metadata.size - a.metadata.size;
      default:
        return 0;
    }
  });

  // Filter yields
  const filteredYields = sortedYields.filter(y =>
    filterType === 'all' || y.type === filterType
  );

  // Get type icon
  const getTypeIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      'code': <Code className="w-4 h-4" />,
      'test': <TestTube className="w-4 h-4" />,
      'documentation': <FileText className="w-4 h-4" />,
      'configuration': <Settings className="w-4 h-4" />,
      'data': <Database className="w-4 h-4" />,
      'api': <Globe className="w-4 h-4" />,
      'ui_component': <Layers className="w-4 h-4" />,
      'database': <Database className="w-4 h-4" />,
      'deployment': <Shield className="w-4 h-4" />,
      'analysis': <BarChart3 className="w-4 h-4" />
    };
    return icons[type] || <FileCode className="w-4 h-4" />;
  };

  // Get quality color
  const getQualityColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30';
      case 'B': return 'text-green-600 bg-green-100 dark:bg-green-900/30';
      case 'C': return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
      case 'D': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30';
      case 'F': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle incubation
  const handleIncubate = (yield: IntelligentYield, prompt: string) => {
    if (onIncubate) {
      onIncubate(yield.id, prompt);
      toast.success(`Starting incubation for ${yield.title}`);
      setShowIncubationModal(false);
      setIncubationPrompt('');
    }
  };

  // Download yield
  const downloadYield = async (yield: IntelligentYield) => {
    try {
      const blob = new Blob([yield.content || yield.preview], { type: yield.metadata.mimeType || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = yield.path.split('/').pop() || 'yield.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Downloaded successfully');
    } catch (error) {
      toast.error('Failed to download');
    }
  };

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* View Mode */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              )}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              )}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                viewMode === 'graph'
                  ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              )}
            >
              Graph
            </button>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
          >
            <option value="quality">Quality</option>
            <option value="relevance">Relevance</option>
            <option value="recent">Recent</option>
            <option value="size">Size</option>
          </select>

          {/* Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Types</option>
            <option value="code">Code</option>
            <option value="test">Tests</option>
            <option value="documentation">Documentation</option>
            <option value="api">APIs</option>
            <option value="ui_component">UI Components</option>
            <option value="configuration">Configuration</option>
          </select>
        </div>

        {/* Summary Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Package className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600 dark:text-gray-400">
              {filteredYields.length} yields
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Award className="w-4 h-4 text-emerald-500" />
            <span className="text-gray-600 dark:text-gray-400">
              {filteredYields.filter(y => y.quality.grade === 'A').length} excellent
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Brain className="w-4 h-4 text-purple-500" />
            <span className="text-gray-600 dark:text-gray-400">
              {filteredYields.filter(y => y.incubation.canIncubate).length} can incubate
            </span>
          </div>
        </div>
      </div>

      {/* Yields Display */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {filteredYields.map((yield) => (
              <motion.div
                key={yield.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={clsx(
                  'relative group rounded-xl border overflow-hidden',
                  'bg-white dark:bg-gray-800',
                  'border-gray-200 dark:border-gray-700',
                  'hover:shadow-lg transition-all duration-300',
                  selectedYield?.id === yield.id && 'ring-2 ring-primary-500'
                )}
                onClick={() => setSelectedYield(yield)}
              >
                {/* Quality Badge */}
                <div className={clsx(
                  'absolute top-3 right-3 z-10 px-2 py-1 rounded-lg font-bold text-xs',
                  getQualityColor(yield.quality.grade)
                )}>
                  {yield.quality.grade}
                </div>

                {/* Header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={clsx(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      'bg-gradient-to-br from-gray-100 to-gray-200',
                      'dark:from-gray-700 dark:to-gray-800'
                    )}>
                      {getTypeIcon(yield.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {yield.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        by {yield.agentName}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {yield.description}
                  </p>

                  {/* Metadata */}
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                    {yield.metadata.language && (
                      <span className="flex items-center gap-1">
                        <Code className="w-3 h-3" />
                        {yield.metadata.language}
                      </span>
                    )}
                    <span>{formatSize(yield.metadata.size)}</span>
                    {yield.metadata.linesOfCode && (
                      <span>{yield.metadata.linesOfCode} lines</span>
                    )}
                  </div>

                  {/* Quality Metrics */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Relevance</span>
                      <div className="flex-1 mx-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
                          style={{ width: `${yield.correlation.relevanceScore}%` }}
                        />
                      </div>
                      <span className="text-gray-700 dark:text-gray-300">
                        {yield.correlation.relevanceScore}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Quality</span>
                      <div className="flex-1 mx-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full"
                          style={{ width: `${yield.quality.score}%` }}
                        />
                      </div>
                      <span className="text-gray-700 dark:text-gray-300">
                        {yield.quality.score}%
                      </span>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {yield.tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                    {yield.tags.length > 3 && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        +{yield.tags.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Incubation */}
                  {yield.incubation.canIncubate && (
                    <div className="mt-3 p-2 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Brain className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Can Incubate
                          </span>
                        </div>
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-xs',
                          yield.incubation.estimatedEffort === 'low' && 'bg-green-100 text-green-700',
                          yield.incubation.estimatedEffort === 'medium' && 'bg-amber-100 text-amber-700',
                          yield.incubation.estimatedEffort === 'high' && 'bg-red-100 text-red-700'
                        )}>
                          {yield.incubation.estimatedEffort} effort
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-850 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadYield(yield);
                        }}
                        className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Share functionality
                        }}
                        className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>

                    {yield.incubation.canIncubate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedYield(yield);
                          setIncubationPrompt(yield.incubation.suggestedPrompts[0] || '');
                          setShowIncubationModal(true);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium hover:from-purple-600 hover:to-indigo-600 transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        Incubate
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="space-y-2">
          <AnimatePresence>
            {filteredYields.map((yield, index) => (
              <motion.div
                key={yield.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={clsx(
                  'p-4 rounded-xl border',
                  'bg-white dark:bg-gray-800',
                  'border-gray-200 dark:border-gray-700',
                  'hover:shadow-md transition-all duration-300',
                  selectedYield?.id === yield.id && 'ring-2 ring-primary-500'
                )}
                onClick={() => setSelectedYield(yield)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className={clsx(
                      'w-12 h-12 rounded-lg flex items-center justify-center',
                      'bg-gradient-to-br from-gray-100 to-gray-200',
                      'dark:from-gray-700 dark:to-gray-800'
                    )}>
                      {getTypeIcon(yield.type)}
                    </div>

                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {yield.title}
                        </h3>
                        <span className={clsx(
                          'px-2 py-0.5 rounded-lg text-xs font-bold',
                          getQualityColor(yield.quality.grade)
                        )}>
                          {yield.quality.grade}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {yield.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>{yield.agentName}</span>
                        <span>{yield.metadata.language}</span>
                        <span>{formatSize(yield.metadata.size)}</span>
                        <span>Relevance: {yield.correlation.relevanceScore}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {yield.incubation.canIncubate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedYield(yield);
                          setIncubationPrompt(yield.incubation.suggestedPrompts[0] || '');
                          setShowIncubationModal(true);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-medium hover:from-purple-600 hover:to-indigo-600 transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        Incubate
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedYields(prev => {
                          const next = new Set(prev);
                          if (next.has(yield.id)) {
                            next.delete(yield.id);
                          } else {
                            next.add(yield.id);
                          }
                          return next;
                        });
                      }}
                      className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                    >
                      <ChevronRight className={clsx(
                        'w-4 h-4 transition-transform',
                        expandedYields.has(yield.id) && 'rotate-90'
                      )} />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {expandedYields.has(yield.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
                    >
                      {/* Preview */}
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Preview
                        </h4>
                        <pre className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                          {yield.preview}
                        </pre>
                      </div>

                      {/* Quality Breakdown */}
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-gray-500">Completeness</div>
                          <div className="text-sm font-semibold">{yield.quality.completeness}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Correctness</div>
                          <div className="text-sm font-semibold">{yield.quality.correctness}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Readability</div>
                          <div className="text-sm font-semibold">{yield.quality.readability}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Performance</div>
                          <div className="text-sm font-semibold">{yield.quality.performance}%</div>
                        </div>
                      </div>

                      {/* Incubation Suggestions */}
                      {yield.incubation.canIncubate && (
                        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                          <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">
                            Improvement Areas
                          </h4>
                          <ul className="space-y-1">
                            {yield.incubation.improvementAreas.map((area, i) => (
                              <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                                <ArrowUpRight className="w-3 h-3 mt-0.5 text-purple-500" />
                                {area}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Incubation Modal */}
      <AnimatePresence>
        {showIncubationModal && selectedYield && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setShowIncubationModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Incubate: {selectedYield.title}
                </h2>
                <button
                  onClick={() => setShowIncubationModal(false)}
                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Improvement Areas */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Recommended Improvements
                </h3>
                <div className="space-y-2">
                  {selectedYield.incubation.improvementAreas.map((area, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                      <TrendingUp className="w-4 h-4 text-primary-500 mt-0.5" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {area}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested Prompts */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Suggested Prompts
                </h3>
                <div className="space-y-2">
                  {selectedYield.incubation.suggestedPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setIncubationPrompt(prompt)}
                      className={clsx(
                        'w-full text-left p-3 rounded-lg border transition-all',
                        incubationPrompt === prompt
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-850'
                      )}
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {prompt}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Custom Prompt
                </h3>
                <textarea
                  value={incubationPrompt}
                  onChange={(e) => setIncubationPrompt(e.target.value)}
                  placeholder="Describe what improvements you want..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowIncubationModal(false)}
                  className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleIncubate(selectedYield, incubationPrompt)}
                  disabled={!incubationPrompt.trim()}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                    'bg-gradient-to-r from-purple-500 to-indigo-500 text-white',
                    'hover:from-purple-600 hover:to-indigo-600',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <RefreshCw className="w-4 h-4" />
                  Start Incubation
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default IntelligentYieldDisplay;