import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils/cn';

export type Status = 'idle' | 'active' | 'success' | 'warning' | 'error' | 'loading';

interface StatusIndicatorProps {
  status: Status;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

const statusConfig: Record<Status, { color: string; pulse: boolean; label: string }> = {
  idle: { color: 'bg-gray-400', pulse: false, label: 'Idle' },
  active: { color: 'bg-blue-500', pulse: true, label: 'Active' },
  success: { color: 'bg-green-500', pulse: false, label: 'Success' },
  warning: { color: 'bg-yellow-500', pulse: true, label: 'Warning' },
  error: { color: 'bg-red-500', pulse: true, label: 'Error' },
  loading: { color: 'bg-indigo-500', pulse: true, label: 'Loading' },
};

const sizeConfig = {
  sm: { dot: 'w-2 h-2', text: 'text-xs' },
  md: { dot: 'w-3 h-3', text: 'text-sm' },
  lg: { dot: 'w-4 h-4', text: 'text-base' },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  size = 'md',
  label,
  showLabel = false,
  animated = true,
  className,
}) => {
  const config = statusConfig[status];
  const sizeClass = sizeConfig[size];
  const displayLabel = label || config.label;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            className={cn(
              'rounded-full',
              sizeClass.dot,
              config.color
            )}
            initial={animated ? { scale: 0 } : undefined}
            animate={animated ? { scale: 1 } : undefined}
            exit={animated ? { scale: 0 } : undefined}
            transition={{ duration: 0.2 }}
          />
        </AnimatePresence>
        
        {config.pulse && animated && (
          <motion.div
            className={cn(
              'absolute inset-0 rounded-full',
              sizeClass.dot,
              config.color
            )}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.5, 0, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
      </div>
      
      {showLabel && (
        <motion.span
          className={cn(
            'font-medium',
            sizeClass.text,
            {
              'text-gray-600': status === 'idle',
              'text-blue-600': status === 'active',
              'text-green-600': status === 'success',
              'text-yellow-600': status === 'warning',
              'text-red-600': status === 'error',
              'text-indigo-600': status === 'loading',
            }
          )}
          initial={animated ? { opacity: 0, x: -10 } : undefined}
          animate={animated ? { opacity: 1, x: 0 } : undefined}
          transition={{ delay: 0.1 }}
        >
          {displayLabel}
        </motion.span>
      )}
    </div>
  );
};