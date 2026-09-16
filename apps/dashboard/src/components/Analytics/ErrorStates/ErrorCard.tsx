import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorCardProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * ErrorCard Component
 *
 * Displays a friendly error state with retry functionality.
 * Used in place of skeleton screens when data fetching fails.
 */
export const ErrorCard: React.FC<ErrorCardProps> = ({
  title = 'Failed to load data',
  message = 'We encountered an error while loading this data. Please try again.',
  onRetry,
  className = ''
}) => {
  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-apple-lg p-6 border border-red-200 dark:border-red-800 shadow-sm ${className}`}
    >
      <div className="flex flex-col items-center justify-center text-center py-8">
        {/* Error Icon */}
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 rounded-full">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>

        {/* Error Title */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {title}
        </h3>

        {/* Error Message */}
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-sm">
          {message}
        </p>

        {/* Retry Button */}
        {onRetry && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </motion.button>
        )}
      </div>
    </div>
  );
};

export default ErrorCard;
