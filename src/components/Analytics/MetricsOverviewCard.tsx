import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import { formatNumber, formatCurrency, formatPercentage } from '@/utils/format';

interface MetricsOverviewCardProps {
  title: string;
  value: number;
  format: 'number' | 'percent' | 'currency';
  trend?: number;
  icon: LucideIcon;
  color?: string;
  subtitle?: string;
  inverse?: boolean;
  delay?: number;
}

export const MetricsOverviewCard: React.FC<MetricsOverviewCardProps> = ({
  title,
  value,
  format,
  trend,
  icon: Icon,
  color = 'blue',
  subtitle,
  inverse = false,
  delay = 0
}) => {
  const formatValue = () => {
    switch (format) {
      case 'percent':
        return formatPercentage(value);
      case 'currency':
        return formatCurrency(value);
      default:
        return formatNumber(value);
    }
  };

  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend > 0) return <ArrowUp className="w-3 h-3" />;
    if (trend < 0) return <ArrowDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const getTrendColor = () => {
    if (!trend) return 'text-gray-500';
    if (inverse) {
      return trend > 0 ? 'text-red-500' : 'text-green-500';
    }
    return trend > 0 ? 'text-green-500' : 'text-red-500';
  };

  const getIconBgColor = () => {
    const colors = {
      blue: 'bg-blue-100 dark:bg-blue-900/30',
      purple: 'bg-purple-100 dark:bg-purple-900/30',
      green: 'bg-green-100 dark:bg-green-900/30',
      orange: 'bg-orange-100 dark:bg-orange-900/30',
      red: 'bg-red-100 dark:bg-red-900/30',
      gray: 'bg-gray-100 dark:bg-gray-900/30'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  const getIconColor = () => {
    const colors = {
      blue: 'text-blue-600 dark:text-blue-400',
      purple: 'text-purple-600 dark:text-purple-400',
      green: 'text-green-600 dark:text-green-400',
      orange: 'text-orange-600 dark:text-orange-400',
      red: 'text-red-600 dark:text-red-400',
      gray: 'text-gray-600 dark:text-gray-400'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.02 }}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <div className={clsx('p-2 rounded-lg', getIconBgColor())}>
              <Icon className={clsx('w-5 h-5', getIconColor())} />
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {title}
            </h3>
          </div>
          
          <div className="mt-2">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatValue()}
              </span>
              {trend !== undefined && (
                <div className={clsx('flex items-center space-x-1', getTrendColor())}>
                  {getTrendIcon()}
                  <span className="text-sm font-medium">
                    {Math.abs(trend).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            
            {subtitle && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Subtle background gradient */}
      <div 
        className={clsx(
          'absolute inset-0 rounded-2xl opacity-5 pointer-events-none',
          color === 'blue' && 'bg-gradient-to-br from-blue-500 to-blue-600',
          color === 'purple' && 'bg-gradient-to-br from-purple-500 to-purple-600',
          color === 'green' && 'bg-gradient-to-br from-green-500 to-green-600',
          color === 'orange' && 'bg-gradient-to-br from-orange-500 to-orange-600'
        )}
      />
    </motion.div>
  );
};