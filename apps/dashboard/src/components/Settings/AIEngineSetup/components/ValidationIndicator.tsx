import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/solid';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import type { ValidationResult } from '../wizardTypes';

interface ValidationIndicatorProps {
  /**
   * Current validation state
   */
  validation?: ValidationResult;

  /**
   * Whether validation is in progress
   */
  isValidating?: boolean;

  /**
   * Show detailed validation breakdown
   */
  showDetails?: boolean;

  /**
   * Custom message to display when not validating
   */
  message?: string;

  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Position of the indicator
   */
  position?: 'inline' | 'absolute';
}

export const ValidationIndicator: React.FC<ValidationIndicatorProps> = ({
  validation,
  isValidating = false,
  showDetails = false,
  message,
  size = 'md',
  position = 'inline',
}) => {
  // Size classes
  const sizeClasses = {
    sm: {
      icon: 'h-4 w-4',
      text: 'text-xs',
      padding: 'px-2 py-1',
    },
    md: {
      icon: 'h-5 w-5',
      text: 'text-sm',
      padding: 'px-3 py-1.5',
    },
    lg: {
      icon: 'h-6 w-6',
      text: 'text-base',
      padding: 'px-4 py-2',
    },
  };

  const classes = sizeClasses[size];

  // Determine status
  const getStatus = () => {
    if (isValidating) return 'validating';
    if (!validation) return message ? 'info' : 'idle';
    return validation.valid ? 'valid' : 'invalid';
  };

  const status = getStatus();

  // Status configurations
  const statusConfig = {
    idle: {
      icon: null,
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      message: null,
    },
    info: {
      icon: InformationCircleIcon,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      message: message,
    },
    validating: {
      icon: ArrowPathIcon,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      message: 'Validating...',
      animate: true,
    },
    valid: {
      icon: CheckCircleIcon,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      message: validation?.message || 'Valid',
    },
    invalid: {
      icon: XCircleIcon,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      message: validation?.message || 'Invalid',
    },
    warning: {
      icon: ExclamationTriangleIcon,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      message: validation?.message || 'Warning',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  // Don't render if idle with no message
  if (status === 'idle') {
    return null;
  }

  const indicatorContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg border transition-all',
        config.bgColor,
        config.color,
        'border-current/20',
        classes.padding,
        classes.text,
        position === 'absolute' && 'absolute right-3 top-1/2 -translate-y-1/2'
      )}
    >
      {Icon && (
        <Icon
          className={clsx(
            classes.icon,
            'animate' in config && config.animate && 'animate-spin'
          )}
        />
      )}
      <span className="font-medium whitespace-nowrap">
        {config.message}
      </span>
    </motion.div>
  );

  // If showing details and validation has details
  if (showDetails && validation?.details && status === 'valid') {
    return (
      <AnimatePresence mode="wait">
        <div className="space-y-2">
          {indicatorContent}

          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className={clsx(
              'rounded-lg border p-3 text-xs',
              config.bgColor,
              'border-current/20'
            )}>
              <div className="space-y-1.5">
                {/* Format check */}
                {validation.details.format !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Format</span>
                    <span className={clsx(
                      'flex items-center gap-1 font-medium',
                      validation.details.format
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}>
                      {validation.details.format ? (
                        <>
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                          Valid
                        </>
                      ) : (
                        <>
                          <XCircleIcon className="h-3.5 w-3.5" />
                          Invalid
                        </>
                      )}
                    </span>
                  </div>
                )}

                {/* Connection check */}
                {validation.details.connection !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Connection</span>
                    <span className={clsx(
                      'flex items-center gap-1 font-medium',
                      validation.details.connection
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}>
                      {validation.details.connection ? (
                        <>
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                          Connected
                        </>
                      ) : (
                        <>
                          <XCircleIcon className="h-3.5 w-3.5" />
                          Failed
                        </>
                      )}
                    </span>
                  </div>
                )}

                {/* Permissions */}
                {validation.details.permissions && validation.details.permissions.length > 0 && (
                  <div className="pt-1.5 border-t border-current/20">
                    <div className="text-gray-700 dark:text-gray-300 mb-1">Permissions:</div>
                    <div className="flex flex-wrap gap-1">
                      {validation.details.permissions.map((permission) => (
                        <span
                          key={permission}
                          className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
                        >
                          {permission}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rate limit */}
                {validation.details.rateLimit && (
                  <div className="pt-1.5 border-t border-current/20">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700 dark:text-gray-300">Rate Limit</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {validation.details.rateLimit.remaining}/{validation.details.rateLimit.total}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait" key={status}>
      {indicatorContent}
    </AnimatePresence>
  );
};
