import React from 'react';
import { motion } from 'framer-motion';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface WizardLoadingStateProps {
  /**
   * Loading message to display
   */
  message?: string;

  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Color theme
   */
  colorScheme?: 'purple' | 'blue' | 'emerald' | 'gray';

  /**
   * Whether to show as overlay (full-screen)
   */
  overlay?: boolean;

  /**
   * Additional className
   */
  className?: string;
}

export const WizardLoadingState: React.FC<WizardLoadingStateProps> = ({
  message = 'Loading...',
  size = 'md',
  colorScheme = 'purple',
  overlay = false,
  className,
}) => {
  // Size configurations
  const sizeConfig = {
    sm: {
      spinner: 'h-4 w-4',
      text: 'text-xs',
      gap: 'gap-2',
    },
    md: {
      spinner: 'h-5 w-5',
      text: 'text-sm',
      gap: 'gap-2',
    },
    lg: {
      spinner: 'h-6 w-6',
      text: 'text-base',
      gap: 'gap-3',
    },
  };

  // Color configurations
  const colorConfig = {
    purple: 'text-purple-600 dark:text-purple-400',
    blue: 'text-blue-600 dark:text-blue-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    gray: 'text-gray-600 dark:text-gray-400',
  };

  const config = sizeConfig[size];
  const color = colorConfig[colorScheme];

  const loadingContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={clsx(
        'inline-flex items-center font-medium',
        config.gap,
        color,
        className
      )}
    >
      <ArrowPathIcon className={clsx(config.spinner, 'animate-spin')} />
      <span className={config.text}>{message}</span>
    </motion.div>
  );

  if (overlay) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      >
        <div className="rounded-2xl bg-white dark:bg-gray-800 px-8 py-6 shadow-2xl">
          {loadingContent}
        </div>
      </motion.div>
    );
  }

  return loadingContent;
};

/**
 * Spinner-only component (for buttons, small spaces)
 */
export const WizardSpinner: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  colorScheme?: 'purple' | 'blue' | 'emerald' | 'gray' | 'white';
  className?: string;
}> = ({ size = 'md', colorScheme = 'purple', className }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const colorClasses = {
    purple: 'text-purple-600 dark:text-purple-400',
    blue: 'text-blue-600 dark:text-blue-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    gray: 'text-gray-600 dark:text-gray-400',
    white: 'text-white',
  };

  return (
    <ArrowPathIcon
      className={clsx(
        'animate-spin',
        sizeClasses[size],
        colorClasses[colorScheme],
        className
      )}
    />
  );
};

/**
 * Skeleton loading component for wizard forms
 */
export const WizardSkeleton: React.FC<{
  rows?: number;
  className?: string;
}> = ({ rows = 3, className }) => {
  return (
    <div className={clsx('space-y-4 animate-pulse', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  );
};

/**
 * Button loading state (replaces button content during save)
 */
interface ButtonLoadingStateProps {
  /**
   * Loading message
   */
  message?: string;

  /**
   * Color scheme for spinner
   */
  colorScheme?: 'white' | 'purple' | 'blue' | 'emerald';
}

export const ButtonLoadingState: React.FC<ButtonLoadingStateProps> = ({
  message = 'Saving...',
  colorScheme = 'white',
}) => {
  return (
    <span className="inline-flex items-center gap-2">
      <WizardSpinner size="sm" colorScheme={colorScheme} />
      <span>{message}</span>
    </span>
  );
};
