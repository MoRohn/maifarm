import React from 'react';
import { motion } from 'framer-motion';
import { Wifi, WifiOff, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface ConnectionStatusBadgeProps {
  isConnected: boolean;
  isConnecting?: boolean;
  error?: string | null;
  lastUpdate?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ConnectionStatusBadge: React.FC<ConnectionStatusBadgeProps> = ({
  isConnected,
  isConnecting = false,
  error = null,
  lastUpdate,
  showLabel = true,
  size = 'md',
  className
}) => {
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1.5',
    md: 'px-3 py-1.5 text-sm gap-2',
    lg: 'px-4 py-2 text-base gap-2.5'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const getStatus = () => {
    if (error) {
      return {
        label: 'Error',
        icon: AlertCircle,
        bg: 'bg-red-500/10 border-red-500/30',
        text: 'text-red-400',
        iconClass: 'text-red-400'
      };
    }

    if (isConnecting) {
      return {
        label: 'Connecting',
        icon: RefreshCw,
        bg: 'bg-yellow-500/10 border-yellow-500/30',
        text: 'text-yellow-400',
        iconClass: 'text-yellow-400 animate-spin'
      };
    }

    if (isConnected) {
      return {
        label: 'Live',
        icon: Check,
        bg: 'bg-emerald-500/10 border-emerald-500/30',
        text: 'text-emerald-400',
        iconClass: 'text-emerald-400'
      };
    }

    return {
      label: 'Disconnected',
      icon: WifiOff,
      bg: 'bg-gray-500/10 border-gray-500/30',
      text: 'text-gray-400',
      iconClass: 'text-gray-400'
    };
  };

  const status = getStatus();
  const Icon = status.icon;

  const getTimeSinceUpdate = () => {
    if (!lastUpdate) return null;
    const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'inline-flex items-center rounded-full border backdrop-blur-sm',
        sizeClasses[size],
        status.bg,
        className
      )}
      title={error || `Connection status: ${status.label}` + (lastUpdate ? ` • Last update: ${getTimeSinceUpdate()}` : '')}
    >
      {/* Status Indicator Dot */}
      <motion.div
        className={cn('rounded-full', iconSizes[size === 'sm' ? 'sm' : size === 'lg' ? 'md' : 'sm'])}
        animate={{
          opacity: isConnected ? [1, 0.5, 1] : 1,
          scale: isConnected ? [1, 1.2, 1] : 1
        }}
        transition={{
          duration: 2,
          repeat: isConnected ? Infinity : 0,
          ease: 'easeInOut'
        }}
      >
        <Icon className={cn(iconSizes[size], status.iconClass)} />
      </motion.div>

      {showLabel && (
        <>
          <span className={cn('font-medium', status.text)}>
            {status.label}
          </span>

          {isConnected && lastUpdate && (
            <span className="text-gray-500 text-xs">
              • {getTimeSinceUpdate()}
            </span>
          )}
        </>
      )}
    </motion.div>
  );
};
