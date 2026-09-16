import React from 'react';
import { motion } from 'framer-motion';

interface ResourceCardSkeletonProps {
  className?: string;
}

export const ResourceCardSkeleton: React.FC<ResourceCardSkeletonProps> = ({
  className = ''
}) => {
  return (
    <div
      className={`rounded-lg p-3 relative overflow-hidden bg-gray-100 dark:bg-gray-800 ${className}`}
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

      <div className="animate-pulse space-y-2 relative z-10">
        {/* Header with icon and label */}
        <div className="flex items-center justify-between">
          <div className="h-4 w-4 bg-gray-300 dark:bg-gray-700 rounded" />
          <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-12" />
        </div>

        {/* Main content area */}
        <div className="relative h-20">
          {/* Percentage value */}
          <div className="absolute inset-0 flex flex-col justify-center">
            <div className="h-7 bg-gray-300 dark:bg-gray-700 rounded w-16 mb-2" />
            <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-20" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gray-300 dark:bg-gray-600 rounded-full"
            animate={{ width: ['0%', '70%'] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          />
        </div>
      </div>
    </div>
  );
};

// Grid of resource card skeletons
export const ResourceCardSkeletonGrid: React.FC<{
  count?: number;
}> = ({ count = 4 }) => (
  <div className="grid grid-cols-2 gap-3">
    {[...Array(count)].map((_, i) => (
      <ResourceCardSkeleton key={i} />
    ))}
  </div>
);
