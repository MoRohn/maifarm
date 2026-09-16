import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { AppleCard } from '../ui/AppleCard';

interface FarmingStatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  category?: 'seeds' | 'water' | 'growth' | 'harvest' | 'soil' | 'weather';
  className?: string;
  loading?: boolean;
  subtitle?: string;
  sparkle?: boolean;
}

export const FarmingStatsCard: React.FC<FarmingStatsCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  category = 'seeds',
  className,
  loading = false,
  subtitle,
  sparkle = false
}) => {
  // Farming-themed color mapping
  const categoryColors = {
    seeds: {
      bg: 'bg-soil-100 dark:bg-soil-900/20',
      text: 'text-soil-600 dark:text-soil-400',
      gradient: 'from-soil-400 to-soil-600'
    },
    water: {
      bg: 'bg-sky-100 dark:bg-sky-900/20',
      text: 'text-sky-600 dark:text-sky-400',
      gradient: 'from-sky-400 to-sky-600'
    },
    growth: {
      bg: 'bg-leaf-100 dark:bg-leaf-900/20',
      text: 'text-leaf-600 dark:text-leaf-400',
      gradient: 'from-leaf-400 to-leaf-600'
    },
    harvest: {
      bg: 'bg-harvest-100 dark:bg-harvest-900/20',
      text: 'text-harvest-600 dark:text-harvest-400',
      gradient: 'from-harvest-400 to-harvest-600'
    },
    soil: {
      bg: 'bg-orange-100 dark:bg-orange-900/20',
      text: 'text-orange-600 dark:text-orange-400',
      gradient: 'from-orange-400 to-orange-600'
    },
    weather: {
      bg: 'bg-purple-100 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400',
      gradient: 'from-purple-400 to-purple-600'
    }
  };

  const colors = categoryColors[category];
  const isPositiveTrend = trend?.startsWith('+');
  const TrendIcon = isPositiveTrend ? TrendingUp : TrendingDown;

  // Format large numbers with K/M suffixes
  const formatValue = (val: string | number) => {
    if (typeof val === 'number') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return val.toString();
    }
    return val;
  };

  return (
    <AppleCard
      variant="default"
      hover={true}
      padding="md"
      className={clsx('relative overflow-hidden', className)}
      whileHover={{ y: -2, scale: 1.01 }}
    >
      {/* Gradient background decoration */}
      <div 
        className={clsx(
          'absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10 dark:opacity-5',
          'bg-gradient-to-br',
          colors.gradient
        )}
      />

      <div className="relative z-10">
        {/* Header with icon */}
        <div className="flex items-start justify-between mb-4">
          <motion.div
            whileHover={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 0.5 }}
            className={clsx(
              'p-3 rounded-2xl',
              colors.bg
            )}
          >
            <Icon className={clsx('w-6 h-6', colors.text)} />
          </motion.div>
          
          {/* Trend or sparkle indicator */}
          <div className="flex items-center space-x-2">
            {sparkle && (
              <motion.div
                animate={{ 
                  rotate: [0, 180, 360],
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <Sparkles className="w-4 h-4 text-harvest-500" />
              </motion.div>
            )}
            {trend && (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className={clsx(
                  'flex items-center space-x-1 text-sm font-medium',
                  isPositiveTrend 
                    ? 'text-leaf-600 dark:text-leaf-400' 
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                <TrendIcon className="w-4 h-4" />
                <span>{trend}</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Content */}
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            {title}
          </p>
          
          {loading ? (
            <div className="space-y-2">
              <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              {subtitle && (
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              )}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {formatValue(value)}
              </p>
              {subtitle && (
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  {subtitle}
                </p>
              )}
            </motion.div>
          )}
        </div>

        {/* Progress indicator for growth metrics */}
        {category === 'growth' && typeof value === 'number' && (
          <div className="mt-4">
            <div className="h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-leaf-400 to-leaf-600"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(value, 100)}%` }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </div>
    </AppleCard>
  );
};