import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  ArrowRight,
  Calendar,
  Tag,
  ExternalLink,
  TrendingUp,
  Sparkles,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/services/apiClient';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface FarmNode {
  id: string;
  name: string;
  incubationVersion: number;
  createdAt: string;
  status: string;
  parentFarmId?: string;
  children?: FarmNode[];
}

interface LineageData {
  ancestors: FarmNode[];
  current: FarmNode;
  descendants: FarmNode[];
  totalGenerations: number;
}

interface LineageViewerProps {
  farmId: string;
  className?: string;
  onNavigate?: (farmId: string) => void;
}

export const LineageViewer: React.FC<LineageViewerProps> = ({
  farmId,
  className,
  onNavigate
}) => {
  const navigate = useNavigate();
  const [lineage, setLineage] = useState<LineageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([farmId]));

  useEffect(() => {
    loadLineage();
  }, [farmId]);

  const loadLineage = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/farms/${farmId}/lineage`);
      if (response.data?.success && response.data?.data) {
        setLineage(response.data.data);
      }
    } catch (error: any) {
      console.error('Failed to load lineage:', error);
      toast.error('Failed to load farm lineage');
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (node: FarmNode) => {
    if (onNavigate) {
      onNavigate(node.id);
    } else {
      navigate(`/farm/${node.id}`);
    }
  };

  const toggleExpand = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getVersionLabel = (version: number) => {
    return `v${version}.0`;
  };

  const renderFarmNode = (node: FarmNode, isCurrent: boolean = false, isAncestor: boolean = false) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <motion.div
        key={node.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="relative"
      >
        <div
          onClick={() => handleNodeClick(node)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleNodeClick(node)}
          aria-label={`View farm ${node.name}, version ${node.incubationVersion}${isCurrent ? ' (current)' : ''}`}
          className={clsx(
            'group relative p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer',
            isCurrent && 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/30 border-yellow-400 dark:border-yellow-600 shadow-lg ring-2 ring-yellow-400/50',
            !isCurrent && isAncestor && 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600',
            !isCurrent && !isAncestor && 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 hover:border-green-400 dark:hover:border-green-600',
            'hover:shadow-xl sm:hover:scale-[1.02] active:scale-[0.99]'
          )}
        >
          {/* Current Badge */}
          {isCurrent && (
            <div className="absolute -top-2 -right-2 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-yellow-500 text-white text-[10px] sm:text-xs font-bold rounded-full shadow-lg flex items-center space-x-0.5 sm:space-x-1">
              <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span>Current</span>
            </div>
          )}

          {/* Node Content */}
          <div className="flex items-start justify-between space-x-2 sm:space-x-3">
            <div className="flex-1 min-w-0">
              {/* Version & Status */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                <div className={clsx(
                  'px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold flex items-center space-x-0.5 sm:space-x-1',
                  isCurrent ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200' :
                  isAncestor ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200' :
                  'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                )}>
                  <Tag className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span>{getVersionLabel(node.incubationVersion)}</span>
                </div>

                {node.status === 'completed' && (
                  <div className="flex items-center space-x-0.5 sm:space-x-1 text-[10px] sm:text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span>Complete</span>
                  </div>
                )}
              </div>

              {/* Farm Name */}
              <h4 className={clsx(
                'font-semibold text-sm sm:text-base mb-0.5 sm:mb-1 truncate',
                isCurrent ? 'text-yellow-900 dark:text-yellow-100' : 'text-gray-900 dark:text-white'
              )}>
                {node.name}
              </h4>

              {/* Farm ID */}
              <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-mono truncate mb-1.5 sm:mb-2">
                {node.id.substring(0, 8)}...{node.id.substring(node.id.length - 4)}
              </p>

              {/* Creation Date */}
              <div className="flex items-center space-x-1 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>{formatDate(node.createdAt)}</span>
              </div>
            </div>

            {/* View Icon */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNodeClick(node);
              }}
              aria-label={`View farm ${node.name}`}
              className={clsx(
                'p-2 sm:p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors flex-shrink-0',
                isCurrent
                  ? 'hover:bg-yellow-200 dark:hover:bg-yellow-800/50'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* Expand Children Button */}
          {hasChildren && (
            <button
              onClick={(e) => toggleExpand(node.id, e)}
              aria-label={isExpanded ? 'Hide descendants' : `Show ${node.children!.length} descendants`}
              aria-expanded={isExpanded}
              className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 px-2.5 sm:px-3 py-1.5 sm:py-1 min-h-[36px] sm:min-h-[32px] bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-full text-[10px] sm:text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 transition-colors shadow-md whitespace-nowrap"
            >
              {isExpanded ? '▲ Hide' : `▼ ${node.children!.length} more`}
            </button>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-4 sm:ml-8 mt-5 sm:mt-6 pl-3 sm:pl-4 border-l-2 border-dashed border-gray-300 dark:border-gray-600 space-y-3 sm:space-y-4"
          >
            {node.children!.map((child) => renderFarmNode(child, false, false))}
          </motion.div>
        )}
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className={clsx('animate-pulse space-y-3 sm:space-y-4', className)}>
        <div className="h-24 sm:h-32 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        <div className="h-24 sm:h-32 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        <div className="h-24 sm:h-32 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    );
  }

  if (!lineage) {
    return (
      <div className={clsx('p-4 sm:p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center', className)}>
        <GitBranch className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-2 sm:mb-3" />
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          No lineage data available
        </p>
      </div>
    );
  }

  const allNodes = [...lineage.ancestors, lineage.current];

  return (
    <div className={clsx('space-y-4 sm:space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 p-3 sm:p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="p-1.5 sm:p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex-shrink-0">
            <GitBranch className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
              Incubation Lineage
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
              {lineage.totalGenerations} generation{lineage.totalGenerations > 1 ? 's' : ''} · {allNodes.length} farm{allNodes.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm flex-shrink-0">
          <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 dark:text-purple-400" />
          <span className="text-gray-700 dark:text-gray-300 font-medium">
            Evolution Path
          </span>
        </div>
      </div>

      {/* Lineage Tree */}
      <div className="space-y-4 sm:space-y-6">
        {/* Ancestors */}
        {lineage.ancestors.length > 0 && (
          <div className="space-y-3 sm:space-y-4">
            {lineage.ancestors.map((ancestor, idx) => (
              <div key={ancestor.id} className="relative">
                {renderFarmNode(ancestor, false, true)}
                {/* Arrow pointing down */}
                {idx < lineage.ancestors.length - 1 && (
                  <div className="flex items-center justify-center py-2 sm:py-3">
                    <div className="flex flex-col items-center">
                      <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 dark:text-blue-400 transform rotate-90" />
                      <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                        Incubated
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Arrow to current */}
            <div className="flex items-center justify-center py-2 sm:py-3">
              <div className="flex flex-col items-center">
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 dark:text-yellow-400 transform rotate-90" />
                <span className="text-[10px] sm:text-xs font-medium text-yellow-600 dark:text-yellow-400 mt-0.5 sm:mt-1">
                  Latest
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Current Farm */}
        <div className="relative">
          {renderFarmNode(lineage.current, true, false)}

          {/* Descendants Arrow */}
          {lineage.descendants.length > 0 && (
            <div className="flex items-center justify-center py-2 sm:py-3">
              <div className="flex flex-col items-center">
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 dark:text-green-400 transform rotate-90" />
                <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                  Descendants
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Descendants */}
        {lineage.descendants.length > 0 && (
          <div className="space-y-3 sm:space-y-4">
            {lineage.descendants.map((descendant) => renderFarmNode(descendant, false, false))}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <div className="text-center">
          <div className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
            {lineage.ancestors.length}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">
            Ancestor{lineage.ancestors.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="text-center border-x border-gray-200 dark:border-gray-700">
          <div className="text-lg sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {getVersionLabel(lineage.current.incubationVersion)}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">
            Version
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
            {lineage.descendants.length}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">
            Child{lineage.descendants.length !== 1 ? 'ren' : ''}
          </div>
        </div>
      </div>

      {/* Info Footer */}
      <div className="p-2.5 sm:p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
        <p className="text-[10px] sm:text-xs text-purple-800 dark:text-purple-300 flex items-start space-x-1.5 sm:space-x-2 leading-relaxed">
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" />
          <span>
            Each incubation evolves outputs progressively through AI-powered enhancement.
          </span>
        </p>
      </div>
    </div>
  );
};
