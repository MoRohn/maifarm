import React, { memo, useMemo } from 'react';
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
import { Tooltip } from '../common/Tooltip';

interface HarvestCardProps {
  harvest: HarvestSummary;
  onClick?: () => void;
  onArchive?: () => void;
  onExport?: () => void;
  className?: string;
}

export const HarvestCard: React.FC<HarvestCardProps> = memo(({
  harvest,
  onClick,
  onArchive,
  onExport,
  className
}) => {
  // Memoize color calculations for performance
  const qualityColor = useMemo(() => {
    if (harvest.overallQuality >= 90) return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
    if (harvest.overallQuality >= 70) return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
  }, [harvest.overallQuality]);

  const successRateColor = useMemo(() => {
    if (harvest.successRate >= 95) return 'text-green-600 dark:text-green-400';
    if (harvest.successRate >= 80) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  }, [harvest.successRate]);

  // Memoize formatted date
  const formattedDate = useMemo(() => {
    if (!harvest.completedAt) return 'Unknown';
    const date = new Date(harvest.completedAt);
    return isNaN(date.getTime()) ? 'Unknown' : format(date, 'MMM d, yyyy h:mm a');
  }, [harvest.completedAt]);

  // Memoize stats array to prevent recreation on every render
  const statsArray = useMemo(() => [
    {
      value: harvest.totalTasks,
      label: 'Tasks',
      icon: CheckCircle,
      color: 'text-gray-900 dark:text-white',
      bgColor: 'bg-gray-100 dark:bg-gray-800'
    },
    {
      value: `${harvest.successRate.toFixed(0)}%`,
      label: 'Success Rate',
      icon: TrendingUp,
      color: successRateColor,
      bgColor: harvest.successRate >= 95 ? 'bg-apple-green-light/10' :
               harvest.successRate >= 80 ? 'bg-apple-yellow-DEFAULT/10' :
               'bg-apple-red-DEFAULT/10'
    },
    {
      value: harvest.yieldCount,
      label: 'Yield',
      icon: Package,
      color: 'text-apple-purple-DEFAULT dark:text-apple-purple-light',
      bgColor: 'bg-apple-purple-DEFAULT/10'
    }
  ], [harvest.totalTasks, harvest.successRate, harvest.yieldCount, successRateColor]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ 
        y: -8, 
        scale: 1.02,
        transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
      }}
      whileTap={{ 
        scale: 0.98,
        transition: { duration: 0.1 }
      }}
      className={clsx(
        'group relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-apple-xl p-8',
        'border border-gray-200/50 dark:border-gray-800/50',
        'shadow-apple-lg hover:shadow-apple-xl transition-all duration-300',
        'cursor-pointer overflow-hidden',
        className
      )}
      onClick={onClick}
    >
      {/* Apple-style subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 via-transparent to-transparent dark:from-gray-800/20 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Header */}
      <div className="relative flex items-start justify-between mb-6">
        <div className="flex items-center space-x-4">
          {/* Enhanced icon with hover animation */}
          <motion.div
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            <div className="p-3 bg-gradient-to-br from-apple-blue-light to-apple-blue-DEFAULT rounded-apple-xl shadow-apple-sm group-hover:shadow-apple-md transition-shadow duration-300">
              <Package className="w-6 h-6 text-white" />
            </div>
            {/* Success indicator */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 ${
                harvest.successRate >= 95 ? 'bg-apple-green-light' :
                harvest.successRate >= 80 ? 'bg-apple-yellow-DEFAULT' :
                'bg-apple-red-DEFAULT'
              }`}
            />
          </motion.div>
          
          <div className="space-y-1">
            <motion.h3
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-apple-blue-DEFAULT dark:group-hover:text-apple-blue-light transition-colors duration-300"
            >
              {harvest.farmName}
            </motion.h3>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center space-x-2 text-sm"
            >
              <div className="flex items-center space-x-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-apple">
                <Calendar className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  {formattedDate}
                </span>
              </div>
              {harvest.farmerTemplateName && (
                <Tooltip content={`Created using ${harvest.farmerTemplateName} farmer template`}>
                  <div className="flex items-center space-x-1 px-2 py-1 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-apple border border-green-200/50 dark:border-green-700/50">
                    <span className="text-lg">🌾</span>
                    <span className="text-xs font-medium text-green-700 dark:text-green-300 max-w-20 truncate">
                      {harvest.farmerTemplateName}
                    </span>
                  </div>
                </Tooltip>
              )}
            </motion.div>
          </div>
        </div>
        
        {/* Enhanced Quality Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className={clsx(
            'px-4 py-2 rounded-apple-lg text-sm font-bold shadow-apple-sm border flex items-center space-x-2',
            qualityColor.includes('green') 
              ? 'bg-apple-green-light/10 text-apple-green-DEFAULT border-apple-green-light/20 dark:bg-apple-green-DEFAULT/10 dark:text-apple-green-light'
              : qualityColor.includes('yellow')
              ? 'bg-apple-yellow-DEFAULT/10 text-apple-yellow-DEFAULT border-apple-yellow-DEFAULT/20 dark:bg-apple-yellow-light/10 dark:text-apple-yellow-light'
              : 'bg-apple-red-DEFAULT/10 text-apple-red-DEFAULT border-apple-red-DEFAULT/20 dark:bg-apple-red-light/10 dark:text-apple-red-light'
          )}
        >
          <div className={`w-2 h-2 rounded-full ${
            harvest.overallQuality >= 90 ? 'bg-apple-green-DEFAULT' :
            harvest.overallQuality >= 70 ? 'bg-apple-yellow-DEFAULT' :
            'bg-apple-red-DEFAULT'
          }`} />
          <span>{harvest.overallQuality.toFixed(0)}% Quality</span>
        </motion.div>
      </div>

      {/* Apple-style Stats Grid */}
      <div className="relative grid grid-cols-3 gap-6 mb-8">
        {statsArray.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + index * 0.1 }}
            whileHover={{ scale: 1.05, y: -2 }}
            className={`relative p-4 ${stat.bgColor} rounded-apple-lg group-hover:shadow-apple-sm transition-all duration-300`}
          >
            <div className="flex items-center justify-between mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <div className={`w-2 h-2 rounded-full ${stat.color.includes('apple-green') ? 'bg-apple-green-DEFAULT' :
                               stat.color.includes('apple-yellow') ? 'bg-apple-yellow-DEFAULT' :
                               stat.color.includes('apple-red') ? 'bg-apple-red-DEFAULT' :
                               stat.color.includes('apple-purple') ? 'bg-apple-purple-DEFAULT' :
                               'bg-gray-500'}`} />
            </div>
            <p className={`text-2xl font-bold ${stat.color} mb-1`}>
              {stat.value}
            </p>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Apple-style Insights Section */}
      {harvest.topInsights.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mb-6"
        >
          <div className="flex items-center space-x-2 mb-4">
            <div className="p-1.5 bg-apple-blue-DEFAULT/10 dark:bg-apple-blue-light/10 rounded-apple">
              <TrendingUp className="w-4 h-4 text-apple-blue-DEFAULT dark:text-apple-blue-light" />
            </div>
            <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
              Key Insights
            </h4>
          </div>
          <div className="space-y-3">
            {harvest.topInsights.slice(0, 2).map((insight, index) => (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
                className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-apple-lg group-hover:bg-gray-100 dark:group-hover:bg-gray-700 transition-colors duration-300"
              >
                <div className={clsx(
                  'p-1.5 rounded-apple mt-0.5 flex-shrink-0',
                  insight.type === 'warning' ? 'bg-apple-yellow-DEFAULT/10 text-apple-yellow-DEFAULT' :
                  insight.type === 'discovery' ? 'bg-apple-green-DEFAULT/10 text-apple-green-DEFAULT' :
                  'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                )}>
                  {insight.type === 'warning' ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : insight.type === 'discovery' ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">
                  {insight.title}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Apple-style Tags */}
      {harvest.tags.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex flex-wrap gap-2 mb-6"
        >
          {harvest.tags.slice(0, 3).map((tag, index) => (
            <motion.span
              key={tag}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9 + index * 0.05 }}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400 rounded-apple border border-gray-200 dark:border-gray-700 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors duration-300"
            >
              {tag}
            </motion.span>
          ))}
          {harvest.tags.length > 3 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.05 }}
              className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-apple border border-dashed border-gray-300 dark:border-gray-600"
            >
              +{harvest.tags.length - 3} more
            </motion.span>
          )}
        </motion.div>
      )}

      {/* Apple-style Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
        className="relative flex items-center justify-between pt-6 border-t border-gray-200/50 dark:border-gray-700/50"
      >
        <motion.button
          whileHover={{ scale: 1.05, x: 2 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="flex items-center space-x-2 px-4 py-2 bg-apple-blue-DEFAULT text-white rounded-apple-lg hover:bg-apple-blue-dark transition-all duration-200 shadow-apple-sm text-sm font-semibold"
        >
          <Eye className="w-4 h-4" />
          <span>View Details</span>
        </motion.button>

        <div className="flex items-center space-x-2">
          {onExport && (
            <Tooltip content="Export harvest data" position="top">
              <motion.button
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onExport();
                }}
                className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-apple-lg transition-all duration-200 shadow-apple-sm"
                aria-label="Export harvest"
              >
                <Download className="w-4 h-4" />
              </motion.button>
            </Tooltip>
          )}
          
          {onArchive && (
            <Tooltip content="Archive this harvest" position="top">
              <motion.button
                whileHover={{ scale: 1.1, rotate: -5 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive();
                }}
                className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 rounded-apple-lg transition-all duration-200 shadow-apple-sm"
                aria-label="Archive harvest"
              >
                <Archive className="w-4 h-4" />
              </motion.button>
            </Tooltip>
          )}

        </div>
      </motion.div>
    </motion.div>
  );
});

HarvestCard.displayName = 'HarvestCard';