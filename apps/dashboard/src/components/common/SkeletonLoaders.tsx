/**
 * SkeletonLoaders - Skeleton screens for perceived performance
 * Shows loading placeholders while content is being fetched
 */

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

interface SkeletonProps {
  className?: string;
  animate?: boolean;
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

/**
 * Base skeleton component
 */
export const Skeleton = memo<SkeletonProps>(({
  className,
  animate = true,
  rounded = 'md'
}) => {
  const roundedClasses = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  };

  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-700',
        roundedClasses[rounded],
        animate && 'animate-pulse',
        className
      )}
    />
  );
});

Skeleton.displayName = 'Skeleton';

/**
 * Text line skeleton
 */
export const SkeletonText = memo<{ lines?: number; className?: string }>(({
  lines = 1,
  className
}) => {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 && lines > 1 && 'w-3/4' // Last line shorter
          )}
        />
      ))}
    </div>
  );
});

SkeletonText.displayName = 'SkeletonText';

/**
 * Card skeleton loader
 */
export const SkeletonCard = memo<{ className?: string }>(({ className }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-8 w-20" rounded="full" />
      </div>
      <SkeletonText lines={3} className="mb-4" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
    </motion.div>
  );
});

SkeletonCard.displayName = 'SkeletonCard';

/**
 * Terminal skeleton loader
 */
export const SkeletonTerminal = memo<{ className?: string }>(({ className }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'bg-gray-900 rounded-lg p-4 font-mono text-sm',
        className
      )}
    >
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-700">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-4 w-32 ml-auto" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-4 w-8 bg-gray-700" />
            <Skeleton
              className={cn(
                'h-4 bg-gray-700',
                i % 3 === 0 ? 'w-3/4' : i % 2 === 0 ? 'w-1/2' : 'w-full'
              )}
            />
          </div>
        ))}
      </div>
    </motion.div>
  );
});

SkeletonTerminal.displayName = 'SkeletonTerminal';

/**
 * Dashboard skeleton loader
 */
export const SkeletonDashboard = memo(() => {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-8 w-24 mb-1" />
            <Skeleton className="h-3 w-32" />
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SkeletonCard className="h-96" />
        </div>
        <div className="space-y-4">
          <SkeletonCard className="h-44" />
          <SkeletonCard className="h-44" />
        </div>
      </div>
    </div>
  );
});

SkeletonDashboard.displayName = 'SkeletonDashboard';

/**
 * Farm list skeleton loader
 */
export const SkeletonFarmList = memo(() => {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <SkeletonText lines={2} className="max-w-xl" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
});

SkeletonFarmList.displayName = 'SkeletonFarmList';

/**
 * Analytics chart skeleton
 */
export const SkeletonChart = memo<{ className?: string }>(({ className }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700',
        className
      )}
    >
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-6 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      {/* Chart bars */}
      <div className="h-64 flex items-end justify-between gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 bg-gray-200 dark:bg-gray-700"
            style={{ height: `${Math.random() * 80 + 20}%` }}
          />
        ))}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-8" />
        ))}
      </div>
    </motion.div>
  );
});

SkeletonChart.displayName = 'SkeletonChart';

/**
 * Settings form skeleton
 */
export const SkeletonForm = memo(() => {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="space-y-2"
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </motion.div>
      ))}
      <div className="flex gap-3 pt-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
});

SkeletonForm.displayName = 'SkeletonForm';

/**
 * Table skeleton loader
 */
export const SkeletonTable = memo<{ rows?: number; columns?: number }>(({
  rows = 5,
  columns = 4
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4" />
          ))}
        </div>
      </div>

      {/* Rows */}
      <div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <motion.div
            key={rowIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: rowIndex * 0.05 }}
            className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 p-4"
          >
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton
                  key={colIndex}
                  className={cn(
                    'h-4',
                    colIndex === 0 && 'font-medium'
                  )}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
});

SkeletonTable.displayName = 'SkeletonTable';

/**
 * Loading overlay with skeleton
 */
export const SkeletonOverlay = memo<{
  isLoading: boolean;
  children: React.ReactNode;
  skeleton?: React.ReactNode;
}>(({ isLoading, children, skeleton }) => {
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {skeleton || <SkeletonCard />}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
});

SkeletonOverlay.displayName = 'SkeletonOverlay';