import React from 'react';
import { motion } from 'framer-motion';

interface StatsCardSkeletonProps {
  className?: string;
  variant?: 'default' | 'compact' | 'detailed';
}

export const StatsCardSkeleton: React.FC<StatsCardSkeletonProps> = ({
  className = '',
  variant = 'default'
}) => {
  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden ${className}`}
    >
      {/* Shimmer effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent"
        animate={{ x: ['-100%', '100%'] }}
        transition={{
          repeat: Infinity,
          duration: 1.5,
          ease: 'linear'
        }}
        style={{ width: '50%' }}
      />

      {variant === 'default' && <DefaultSkeleton />}
      {variant === 'compact' && <CompactSkeleton />}
      {variant === 'detailed' && <DetailedSkeleton />}
    </div>
  );
};

// Default stats card skeleton
const DefaultSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-3 relative z-10">
    {/* Title and icon */}
    <div className="flex items-center justify-between">
      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
      <div className="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-full" />
    </div>

    {/* Main value */}
    <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />

    {/* Trend indicator */}
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 bg-gray-200 dark:bg-gray-800 rounded" />
      <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-16" />
    </div>
  </div>
);

// Compact stats card skeleton
const CompactSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-2 relative z-10">
    <div className="flex items-center justify-between">
      <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
      <div className="h-6 w-6 bg-gray-200 dark:bg-gray-800 rounded-full" />
    </div>
    <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-2/5" />
  </div>
);

// Detailed stats card skeleton
const DetailedSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-4 relative z-10">
    {/* Header */}
    <div className="flex items-center justify-between">
      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
      <div className="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-full" />
    </div>

    {/* Main value */}
    <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />

    {/* Trend and percentage */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-16" />
      </div>
      <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-20" />
    </div>

    {/* Additional details */}
    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
      </div>
    </div>
  </div>
);

// Grid of stats card skeletons
export const StatsCardSkeletonGrid: React.FC<{
  count?: number;
  variant?: 'default' | 'compact' | 'detailed';
}> = ({ count = 4, variant = 'default' }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {[...Array(count)].map((_, i) => (
      <StatsCardSkeleton key={i} variant={variant} />
    ))}
  </div>
);
