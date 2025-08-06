import React from 'react';
import { motion } from 'framer-motion';
import { 
  Package, 
  Calendar, 
  CheckCircle, 
  AlertCircle,
  FileText,
  TrendingUp,
  Download,
  Archive,
  Eye
} from 'lucide-react';
import { clsx } from 'clsx';
import { HarvestSummary } from '../../types';
import { format } from 'date-fns';

interface HarvestCardProps {
  harvest: HarvestSummary;
  onClick?: () => void;
  onArchive?: () => void;
  onExport?: () => void;
  className?: string;
}

export const HarvestCard: React.FC<HarvestCardProps> = ({
  harvest,
  onClick,
  onArchive,
  onExport,
  className
}) => {
  const getQualityColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
    if (score >= 70) return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600 dark:text-green-400';
    if (rate >= 80) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={clsx(
        'bg-white dark:bg-gray-900 rounded-apple-lg p-6',
        'border border-gray-200 dark:border-gray-800',
        'shadow-sm hover:shadow-apple-md transition-all duration-300',
        'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-apple">
            <Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {harvest.farmName}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center mt-1">
              <Calendar className="w-3 h-3 mr-1" />
              {format(new Date(harvest.completedAt), 'MMM d, yyyy h:mm a')}
            </p>
          </div>
        </div>
        
        {/* Quality Badge */}
        <div className={clsx(
          'px-2 py-1 rounded-full text-xs font-medium',
          getQualityColor(harvest.overallQuality)
        )}>
          {harvest.overallQuality.toFixed(0)}% Quality
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {harvest.totalTasks}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Tasks</p>
        </div>
        <div className="text-center">
          <p className={clsx('text-2xl font-bold', getSuccessRateColor(harvest.successRate))}>
            {harvest.successRate.toFixed(0)}%
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Success Rate</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {harvest.artifactCount}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Artifacts</p>
        </div>
      </div>

      {/* Top Insights */}
      {harvest.topInsights.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Key Insights
          </h4>
          <div className="space-y-1">
            {harvest.topInsights.slice(0, 2).map((insight) => (
              <div key={insight.id} className="flex items-start space-x-2">
                <div className={clsx(
                  'mt-0.5',
                  insight.type === 'warning' ? 'text-yellow-500' :
                  insight.type === 'discovery' ? 'text-blue-500' :
                  'text-gray-500'
                )}>
                  {insight.type === 'warning' ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : insight.type === 'discovery' ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                  {insight.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {harvest.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {harvest.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 rounded"
            >
              {tag}
            </span>
          ))}
          {harvest.tags.length > 3 && (
            <span className="px-2 py-0.5 text-xs text-gray-500 dark:text-gray-500">
              +{harvest.tags.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          <Eye className="w-4 h-4" />
          <span>View Details</span>
        </motion.button>

        <div className="flex items-center space-x-2">
          {onExport && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
              className="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              title="Export harvest"
            >
              <Download className="w-4 h-4" />
            </motion.button>
          )}
          
          {onArchive && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              className="p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              title="Archive harvest"
            >
              <Archive className="w-4 h-4" />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};