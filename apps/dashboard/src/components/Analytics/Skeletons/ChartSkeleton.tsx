import React from 'react';
import { motion } from 'framer-motion';

interface ChartSkeletonProps {
  height?: number;
  className?: string;
  variant?: 'line' | 'bar' | 'pie' | 'area';
}

export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({
  height = 250,
  className = '',
  variant = 'line'
}) => {
  return (
    <div
      className={`relative overflow-hidden bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 ${className}`}
      style={{ height }}
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

      <div className="p-6 space-y-4">
        {/* Chart title skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3 animate-pulse" />
          <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-16 animate-pulse" />
        </div>

        {/* Chart content based on variant */}
        {variant === 'line' && <LineChartSkeleton />}
        {variant === 'bar' && <BarChartSkeleton />}
        {variant === 'pie' && <PieChartSkeleton />}
        {variant === 'area' && <AreaChartSkeleton />}

        {/* Legend skeleton */}
        <div className="flex items-center justify-center gap-6 pt-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-16 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Line chart skeleton
const LineChartSkeleton: React.FC = () => (
  <div className="space-y-2">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="h-2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"
        style={{
          width: `${Math.random() * 30 + 60}%`,
          marginLeft: `${Math.random() * 10}%`
        }}
      />
    ))}
  </div>
);

// Bar chart skeleton
const BarChartSkeleton: React.FC = () => (
  <div className="flex items-end justify-around gap-2 h-32">
    {[...Array(6)].map((_, i) => (
      <div
        key={i}
        className="w-full bg-gray-200 dark:bg-gray-800 rounded-t animate-pulse"
        style={{ height: `${Math.random() * 60 + 40}%` }}
      />
    ))}
  </div>
);

// Pie chart skeleton
const PieChartSkeleton: React.FC = () => (
  <div className="flex items-center justify-center">
    <div className="relative w-32 h-32">
      <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
      <div className="absolute inset-6 bg-gray-50 dark:bg-gray-900 rounded-full" />
    </div>
  </div>
);

// Area chart skeleton
const AreaChartSkeleton: React.FC = () => (
  <div className="relative h-32">
    <svg width="100%" height="100%" className="absolute inset-0">
      <defs>
        <linearGradient id="skeleton-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" className="text-gray-200 dark:text-gray-800" stopOpacity="0.8" />
          <stop offset="100%" className="text-gray-200 dark:text-gray-800" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <path
        d="M 0,80 Q 50,60 100,70 T 200,65 T 300,75 T 400,60 L 400,128 L 0,128 Z"
        fill="url(#skeleton-gradient)"
        className="animate-pulse"
      />
    </svg>
  </div>
);
