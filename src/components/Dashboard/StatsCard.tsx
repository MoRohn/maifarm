import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: 'primary' | 'green' | 'blue' | 'purple' | 'red' | 'yellow';
  className?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  color = 'primary',
  className
}) => {
  const colorClasses = {
    primary: 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    yellow: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400',
  };

  const isPositiveTrend = trend?.startsWith('+');
  const TrendIcon = isPositiveTrend ? TrendingUp : TrendingDown;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={clsx(
        'bg-white dark:bg-gray-900 rounded-apple-lg p-6',
        'border border-gray-200 dark:border-gray-800',
        'shadow-sm hover:shadow-apple-sm transition-all duration-300',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={clsx(
          'p-3 rounded-apple',
          colorClasses[color]
        )}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <div className={clsx(
            'flex items-center space-x-1 text-sm font-medium',
            isPositiveTrend 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-red-600 dark:text-red-400'
          )}>
            <TrendIcon className="w-4 h-4" />
            <span>{trend}</span>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          {title}
        </p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {value}
        </p>
      </div>
    </motion.div>
  );
};