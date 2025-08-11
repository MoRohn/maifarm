import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Package, TrendingUp, TrendingDown, Award, FileStack, BarChart3 } from 'lucide-react';
import { clsx } from 'clsx';
import { FarmYieldMetrics } from '../../../types/analytics';
import { useThemeStore } from '../../../store/themeStore';

interface FarmYieldChartProps {
  metrics: FarmYieldMetrics | null;
  isLoading?: boolean;
  className?: string;
}

export const FarmYieldChart: React.FC<FarmYieldChartProps> = ({ 
  metrics, 
  isLoading = false,
  className 
}) => {
  const { primaryColor, accentColor } = useThemeStore();
  // Calculate trend
  const yieldTrend = useMemo(() => {
    if (!metrics?.yieldTrend || metrics.yieldTrend.length < 2) return 0;
    
    const recent = metrics.yieldTrend[0].averageYield;
    const previous = metrics.yieldTrend[1].averageYield;
    return ((recent - previous) / previous) * 100;
  }, [metrics]);

  // Get yield by type percentages
  const yieldByTypeData = useMemo(() => {
    if (!metrics?.yieldByType) return [];
    
    const total = Object.values(metrics.yieldByType).reduce((sum, count) => sum + count, 0);
    if (total === 0) return [];
    
    return Object.entries(metrics.yieldByType)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => ({
        type,
        count,
        percentage: (count / total) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4); // Top 4 types
  }, [metrics]);

  if (isLoading) {
    return (
      <div className={clsx("bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg", className)}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={clsx("bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg", className)}>
        <p className="text-gray-500 dark:text-gray-400">No yield data available</p>
      </div>
    );
  }

  return (
    <div className={clsx("bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Package className="w-5 h-5" style={{ color: primaryColor }} />
          Farm Yield Metrics
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {metrics.completedFarms} farms
          </span>
        </div>
      </div>

      {/* Main Yield Metric */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mb-6 p-4 rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}10 0%, ${accentColor}10 100%)`
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Average Yield</p>
            <div className="flex items-baseline gap-2">
              <span 
                className="text-3xl font-bold bg-clip-text text-transparent"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${primaryColor} 0%, ${accentColor} 100%)`
                }}
              >
                {metrics.averageYield.toFixed(1)}
              </span>
              <span className="text-lg text-gray-600 dark:text-gray-400">Items</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              per completed farm
            </p>
          </div>
          
          {/* Trend Indicator */}
          <div className={clsx(
            "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium",
            yieldTrend >= 0 
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          )}>
            {yieldTrend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(yieldTrend).toFixed(1)}%
          </div>
        </div>
      </motion.div>

      {/* Top Farm Highlight */}
      {metrics.topFarm && (
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">Top Farm</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {metrics.topFarm.name}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                {metrics.topFarm.fileCount}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">files</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Yield by Type */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Yield Breakdown</p>
          <FileStack className="w-4 h-4 text-gray-400" />
        </div>
        
        {yieldByTypeData.map((item, index) => (
          <motion.div
            key={item.type}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: '100%', opacity: 1 }}
            transition={{ delay: 0.2 + index * 0.05 }}
            className="space-y-1"
          >
            <div className="flex justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-400 capitalize">{item.type}</span>
              <span className="font-medium">{item.count}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${item.percentage}%` }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.05 }}
                className={clsx(
                  "h-1.5 rounded-full",
                  index === 0 && "bg-emerald-500",
                  index === 1 && "bg-teal-500",
                  index === 2 && "bg-cyan-500",
                  index === 3 && "bg-blue-500"
                )}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400">Total Files</p>
            <p className="font-semibold">{metrics.totalFilesGenerated.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Farms Completed</p>
            <p className="font-semibold">{metrics.completedFarms}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FarmYieldChart;