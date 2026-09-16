/**
 * PremiumHarvestView - Apple-inspired professional harvest items display
 *
 * Features:
 * - Glass morphism design with elegant card layouts
 * - Real-time harvest item collection with progress indicators
 * - File type icons and preview capabilities
 * - Export and download functionality
 * - Professional insights panel integration
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  FileText,
  FileCode,
  FileJson,
  Image as ImageIcon,
  Download,
  Eye,
  Copy,
  Sparkles,
  CheckCircle,
  Clock,
  TrendingUp,
  BarChart3,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  Grid3x3,
  List,
  SortAsc,
  SortDesc,
  Zap,
  Brain,
  Lightbulb,
  Star,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { format } from 'date-fns';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface HarvestItem {
  id: string;
  name: string;
  type: 'file' | 'directory' | 'code' | 'document' | 'image' | 'data';
  path: string;
  size?: number;
  mimeType?: string;
  agentId?: number;
  agentName?: string;
  createdAt?: string;
  status?: 'collected' | 'processing' | 'pending';
  preview?: string;
  metadata?: Record<string, any>;
}

interface HarvestInsight {
  id: string;
  type: 'success' | 'improvement' | 'discovery' | 'warning';
  title: string;
  description: string;
  relevance?: number;
  agentId?: number;
}

interface HarvestSummary {
  filesGenerated: number;
  completedTasks: number;
  duration: number;
  efficiency: number;
  tokensUsed?: number;
  estimatedCost?: number;
}

interface PremiumHarvestViewProps {
  farmId: string;
  farmName: string;
  items: HarvestItem[];
  insights?: HarvestInsight[];
  summary?: HarvestSummary;
  className?: string;
  onItemView?: (item: HarvestItem) => void;
  onItemDownload?: (item: HarvestItem) => void;
  onExport?: (format: 'json' | 'markdown' | 'pdf' | 'csv') => void;
  onCreateSeed?: () => void;
}

// ============================================================================
// Animation Variants
// ============================================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25
    }
  }
};

// ============================================================================
// Component
// ============================================================================

export const PremiumHarvestView: React.FC<PremiumHarvestViewProps> = ({
  farmId,
  farmName,
  items,
  insights = [],
  summary,
  className,
  onItemView,
  onItemDownload,
  onExport,
  onCreateSeed
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // ============================================================================
  // Helpers
  // ============================================================================

  const getFileIcon = (item: HarvestItem) => {
    const ext = item.name.split('.').pop()?.toLowerCase();

    if (item.type === 'directory') {
      return expandedFolders.has(item.id)
        ? <FolderOpen className="w-5 h-5 text-amber-400" />
        : <Folder className="w-5 h-5 text-amber-400" />;
    }

    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return <FileCode className="w-5 h-5 text-blue-400" />;
      case 'json':
        return <FileJson className="w-5 h-5 text-amber-400" />;
      case 'md':
      case 'txt':
      case 'doc':
      case 'docx':
        return <FileText className="w-5 h-5 text-gray-400" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        return <ImageIcon className="w-5 h-5 text-purple-400" />;
      case 'py':
        return <FileCode className="w-5 h-5 text-green-400" />;
      case 'css':
      case 'scss':
        return <FileCode className="w-5 h-5 text-pink-400" />;
      case 'html':
        return <FileCode className="w-5 h-5 text-orange-400" />;
      default:
        return <FileText className="w-5 h-5 text-gray-400" />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'improvement':
        return <TrendingUp className="w-4 h-4 text-blue-400" />;
      case 'discovery':
        return <Lightbulb className="w-4 h-4 text-amber-400" />;
      case 'warning':
        return <Zap className="w-4 h-4 text-orange-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-purple-400" />;
    }
  };

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Search filter
    if (searchTerm) {
      result = result.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.path.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== 'all') {
      result = result.filter(item => {
        const ext = item.name.split('.').pop()?.toLowerCase();
        switch (filterType) {
          case 'code':
            return ['ts', 'tsx', 'js', 'jsx', 'py', 'css', 'scss', 'html'].includes(ext || '');
          case 'document':
            return ['md', 'txt', 'doc', 'docx', 'pdf'].includes(ext || '');
          case 'data':
            return ['json', 'yaml', 'yml', 'csv', 'xml'].includes(ext || '');
          case 'image':
            return ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '');
          default:
            return true;
        }
      });
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [items, searchTerm, filterType, sortBy, sortOrder]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // ============================================================================
  // Render Item Card (Grid View)
  // ============================================================================

  const renderItemCard = (item: HarvestItem, index: number) => (
    <motion.div
      key={item.id}
      variants={itemVariants}
      whileHover={{ scale: 1.02, y: -2 }}
      className={cn(
        'group relative',
        'backdrop-blur-xl bg-white/5 border border-white/10',
        'rounded-2xl p-4',
        'hover:bg-white/10 hover:border-white/20',
        'transition-all duration-300 cursor-pointer',
        'shadow-lg hover:shadow-xl'
      )}
      onClick={() => onItemView?.(item)}
    >
      {/* Status Indicator */}
      {item.status && (
        <div className="absolute top-3 right-3">
          <div className={cn(
            'w-2 h-2 rounded-full',
            item.status === 'collected' ? 'bg-emerald-500' :
            item.status === 'processing' ? 'bg-amber-500 animate-pulse' :
            'bg-gray-500'
          )} />
        </div>
      )}

      {/* Icon & Name */}
      <div className="flex items-center gap-3 mb-3">
        <div className={cn(
          'p-2 rounded-xl',
          'bg-gradient-to-br from-white/10 to-white/5'
        )}>
          {getFileIcon(item)}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white truncate">
            {item.name}
          </h4>
          <p className="text-xs text-gray-400 truncate">
            {item.path}
          </p>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{formatFileSize(item.size)}</span>
        {item.agentName && (
          <span className="px-2 py-0.5 bg-white/5 rounded-md">
            {item.agentName}
          </span>
        )}
      </div>

      {/* Hover Actions */}
      <div className={cn(
        'absolute inset-x-0 bottom-0 p-3',
        'bg-gradient-to-t from-black/50 to-transparent',
        'rounded-b-2xl',
        'opacity-0 group-hover:opacity-100',
        'transition-opacity duration-200',
        'flex items-center justify-center gap-2'
      )}>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => { e.stopPropagation(); onItemView?.(item); }}
          className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
        >
          <Eye className="w-4 h-4 text-white" />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => { e.stopPropagation(); onItemDownload?.(item); }}
          className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
        >
          <Download className="w-4 h-4 text-white" />
        </motion.button>
      </div>
    </motion.div>
  );

  // ============================================================================
  // Render Item Row (List View)
  // ============================================================================

  const renderItemRow = (item: HarvestItem, index: number) => (
    <motion.div
      key={item.id}
      variants={itemVariants}
      className={cn(
        'group flex items-center gap-4 p-4',
        'backdrop-blur-xl bg-white/5 border border-white/10',
        'rounded-xl',
        'hover:bg-white/10 hover:border-white/20',
        'transition-all duration-200 cursor-pointer'
      )}
      onClick={() => onItemView?.(item)}
    >
      {/* Icon */}
      <div className={cn(
        'p-2 rounded-lg',
        'bg-gradient-to-br from-white/10 to-white/5'
      )}>
        {getFileIcon(item)}
      </div>

      {/* Name & Path */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-white truncate">
          {item.name}
        </h4>
        <p className="text-xs text-gray-400 truncate">
          {item.path}
        </p>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-sm text-gray-400">
        <span className="w-20 text-right">{formatFileSize(item.size)}</span>
        {item.agentName && (
          <span className="px-2 py-1 bg-white/5 rounded-lg text-xs w-24 text-center truncate">
            {item.agentName}
          </span>
        )}
        {item.createdAt && (
          <span className="w-32 text-right text-xs">
            {format(new Date(item.createdAt), 'MMM d, HH:mm')}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => { e.stopPropagation(); onItemView?.(item); }}
          className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
        >
          <Eye className="w-4 h-4 text-white" />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => { e.stopPropagation(); onItemDownload?.(item); }}
          className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
        >
          <Download className="w-4 h-4 text-white" />
        </motion.button>
      </div>
    </motion.div>
  );

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div className={cn(
      'min-h-screen',
      'bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950',
      className
    )}>
      {/* Background Effects */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
      <div className="absolute top-40 left-20 w-96 h-96 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-40 right-20 w-96 h-96 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 mb-8 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                'p-3 rounded-2xl',
                'bg-gradient-to-br from-emerald-500 to-emerald-600',
                'shadow-lg shadow-emerald-500/25'
              )}>
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-white tracking-tight">
                  Harvest Collection
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {items.length} items collected from {farmName}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {onCreateSeed && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onCreateSeed}
                  className={cn(
                    'px-4 py-2 rounded-xl',
                    'bg-gradient-to-r from-emerald-600 to-emerald-500',
                    'text-white font-medium text-sm',
                    'shadow-lg shadow-emerald-500/25',
                    'flex items-center gap-2'
                  )}
                >
                  <Star className="w-4 h-4" />
                  Create Seed
                </motion.button>
              )}
              {onExport && (
                <div className="relative group">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      'px-4 py-2 rounded-xl',
                      'bg-white/10 hover:bg-white/20',
                      'text-white font-medium text-sm',
                      'border border-white/10',
                      'flex items-center gap-2',
                      'transition-colors'
                    )}
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </motion.button>
                  <div className={cn(
                    'absolute right-0 mt-2 w-40 py-2',
                    'bg-gray-900 border border-white/10 rounded-xl',
                    'shadow-xl',
                    'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
                    'transition-all duration-200 z-20'
                  )}>
                    {['json', 'markdown', 'pdf', 'csv'].map(format => (
                      <button
                        key={format}
                        onClick={() => onExport(format as any)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/10 transition-colors"
                      >
                        Export as {format.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Summary Stats */}
          {summary && (
            <div className="grid grid-cols-4 gap-4 pt-6 border-t border-white/10">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-2xl font-bold text-white">{summary.filesGenerated}</span>
                </div>
                <span className="text-xs text-gray-400">Files Generated</span>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-2xl font-bold text-white">
                    {Math.floor(summary.duration / 60)}m {summary.duration % 60}s
                  </span>
                </div>
                <span className="text-xs text-gray-400">Duration</span>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                  <span className="text-2xl font-bold text-white">{summary.efficiency}%</span>
                </div>
                <span className="text-xs text-gray-400">Efficiency</span>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-2xl font-bold text-white">{summary.completedTasks}</span>
                </div>
                <span className="text-xs text-gray-400">Tasks Completed</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Insights Panel */}
        {insights.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 mb-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <Brain className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold text-white">AI Insights</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.slice(0, 4).map((insight, index) => (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    'p-4 rounded-xl',
                    'bg-white/5 border border-white/10',
                    'hover:bg-white/10 transition-colors'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {getInsightIcon(insight.type)}
                    <div>
                      <h4 className="font-medium text-white mb-1">{insight.title}</h4>
                      <p className="text-sm text-gray-400">{insight.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Toolbar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-between gap-4 mb-6"
        >
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search files..."
              className={cn(
                'w-full pl-10 pr-4 py-2.5 rounded-xl',
                'bg-white/5 text-white placeholder-gray-500',
                'border border-white/10',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500/50',
                'transition-all'
              )}
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className={cn(
                'px-4 py-2.5 rounded-xl',
                'bg-white/5 text-white',
                'border border-white/10',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500/50',
                'cursor-pointer'
              )}
            >
              <option value="all" className="bg-gray-900">All Types</option>
              <option value="code" className="bg-gray-900">Code</option>
              <option value="document" className="bg-gray-900">Documents</option>
              <option value="data" className="bg-gray-900">Data</option>
              <option value="image" className="bg-gray-900">Images</option>
            </select>

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split('-');
                setSortBy(by as any);
                setSortOrder(order as any);
              }}
              className={cn(
                'px-4 py-2.5 rounded-xl',
                'bg-white/5 text-white',
                'border border-white/10',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500/50',
                'cursor-pointer'
              )}
            >
              <option value="date-desc" className="bg-gray-900">Newest First</option>
              <option value="date-asc" className="bg-gray-900">Oldest First</option>
              <option value="name-asc" className="bg-gray-900">Name A-Z</option>
              <option value="name-desc" className="bg-gray-900">Name Z-A</option>
              <option value="size-desc" className="bg-gray-900">Largest First</option>
              <option value="size-asc" className="bg-gray-900">Smallest First</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-2 rounded-lg transition-all',
                  viewMode === 'grid'
                    ? 'bg-emerald-500 text-white'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 rounded-lg transition-all',
                  viewMode === 'list'
                    ? 'bg-emerald-500 text-white'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Items Grid/List */}
        {filteredItems.length > 0 ? (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'space-y-3'
            )}
          >
            {filteredItems.map((item, index) =>
              viewMode === 'grid'
                ? renderItemCard(item, index)
                : renderItemRow(item, index)
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="p-6 bg-white/5 rounded-3xl mb-6 border border-white/10">
              <Package className="w-12 h-12 text-gray-500" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">
              {searchTerm || filterType !== 'all' ? 'No Matching Items' : 'No Items Collected'}
            </h3>
            <p className="text-sm text-gray-400 text-center max-w-md">
              {searchTerm || filterType !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Harvest items will appear here once agents complete their tasks'}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default PremiumHarvestView;
