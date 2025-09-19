import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useThemeStore } from '@/store/themeStore';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: 'primary' | 'green' | 'blue' | 'purple' | 'red' | 'yellow';
  className?: string;
  loading?: boolean;
  subtitle?: string;
  subtitleValue?: string | number;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  color = 'primary',
  className,
  loading = false,
  subtitle,
  subtitleValue
}) => {
  const { colorScheme } = useThemeStore();
  // Icon background colors with proper contrast - vibrant and engaging
  const iconColorClasses = {
    primary: 'bg-gradient-to-br from-apple-blue/20 to-apple-blue/10 text-apple-blue shadow-inner dark:from-apple-blue/30 dark:to-apple-blue/20 dark:text-apple-blue-light',
    green: 'bg-gradient-to-br from-apple-green/20 to-apple-green/10 text-apple-green shadow-inner dark:from-apple-green/30 dark:to-apple-green/20 dark:text-apple-green-light',
    blue: 'bg-gradient-to-br from-blue-500/20 to-blue-400/10 text-blue-600 shadow-inner dark:from-blue-500/30 dark:to-blue-400/20 dark:text-blue-400',
    purple: 'bg-gradient-to-br from-apple-purple/20 to-apple-purple/10 text-apple-purple shadow-inner dark:from-apple-purple/30 dark:to-apple-purple/20 dark:text-apple-purple-light',
    red: 'bg-gradient-to-br from-apple-red/20 to-apple-red/10 text-apple-red shadow-inner dark:from-apple-red/30 dark:to-apple-red/20 dark:text-apple-red-light',
    yellow: 'bg-gradient-to-br from-apple-yellow/20 to-apple-yellow/10 text-apple-yellow shadow-inner dark:from-apple-yellow/30 dark:to-apple-yellow/20 dark:text-apple-yellow-light',
  };

  // Dynamic card background style using theme colors
  const getCardBackgroundStyle = () => {
    // Use primary color for primary cards, accent for others
    const baseColor = color === 'primary' ? colorScheme.primary : colorScheme.accent;
    const rgb = hexToRGB(baseColor);
    
    // Check if we're in dark mode
    const isDark = document.documentElement.classList.contains('dark');
    
    if (isDark) {
      // Dark mode: subtle gradient with theme color tints
      return {
        background: `linear-gradient(135deg, 
          rgba(${rgb}, 0.15) 0%, 
          rgba(31, 41, 55, 0.95) 40%, 
          rgba(17, 24, 39, 0.98) 70%,
          rgba(${rgb}, 0.08) 100%
        )`
      } as React.CSSProperties;
    } else {
      // Light mode: very subtle gradient with theme color
      return {
        background: `linear-gradient(135deg, 
          rgba(${rgb}, 0.10) 0%, 
          rgba(255, 255, 255, 0.98) 50%, 
          rgba(${rgb}, 0.05) 100%
        )`
      } as React.CSSProperties;
    }
  };

  // Helper function to convert hex to RGB
  const hexToRGB = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `${r}, ${g}, ${b}`;
    }
    return '0, 0, 0';
  };

  const isPositiveTrend = trend?.startsWith('+');
  const TrendIcon = isPositiveTrend ? TrendingUp : TrendingDown;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      style={getCardBackgroundStyle()}
      className={clsx(
        'rounded-apple-lg p-6',
        'border border-gray-200/50 dark:border-gray-700/50',
        'shadow-sm hover:shadow-apple-sm transition-all duration-300',
        'backdrop-blur-sm',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={clsx(
          'p-3 rounded-apple-lg transition-transform duration-200 hover:scale-105',
          iconColorClasses[color]
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
        {loading ? (
          <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ) : (
          <>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {value}
            </p>
            {subtitle && subtitleValue !== undefined && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {subtitle}: {subtitleValue}
              </p>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};