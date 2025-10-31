import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface AgentActivityIndicatorProps {
  agentId: number;
  agentName: string;
  status: 'initializing' | 'active' | 'processing' | 'idle' | 'error' | 'completed';
  lastActivity?: number;
  outputLineCount?: number;
  className?: string;
  showPulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const AgentActivityIndicator: React.FC<AgentActivityIndicatorProps> = ({
  agentId,
  agentName,
  status,
  lastActivity,
  outputLineCount = 0,
  className,
  showPulse = true,
  size = 'md'
}) => {
  const [isActive, setIsActive] = useState(false);
  const [activityDelta, setActivityDelta] = useState(0);

  // Track recent activity (within last 3 seconds)
  useEffect(() => {
    if (!lastActivity) {
      setIsActive(false);
      return;
    }

    const timeSinceActivity = Date.now() - lastActivity;

    if (timeSinceActivity < 3000) {
      setIsActive(true);
      const timer = setTimeout(() => setIsActive(false), 3000 - timeSinceActivity);
      return () => clearTimeout(timer);
    } else {
      setIsActive(false);
    }
  }, [lastActivity]);

  // Calculate activity rate
  useEffect(() => {
    if (!lastActivity) return;

    const now = Date.now();
    const delta = now - lastActivity;
    setActivityDelta(delta);

    const interval = setInterval(() => {
      const currentDelta = Date.now() - lastActivity;
      setActivityDelta(currentDelta);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastActivity]);

  const getStatusConfig = () => {
    switch (status) {
      case 'active':
      case 'processing':
        return {
          icon: Activity,
          label: status === 'processing' ? 'Processing' : 'Active',
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          pulse: true
        };
      case 'initializing':
        return {
          icon: Loader2,
          label: 'Starting',
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          pulse: false,
          spin: true
        };
      case 'completed':
        return {
          icon: CheckCircle,
          label: 'Completed',
          color: 'text-gray-400',
          bg: 'bg-gray-500/10',
          border: 'border-gray-500/30',
          pulse: false
        };
      case 'error':
        return {
          icon: AlertCircle,
          label: 'Error',
          color: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          pulse: false
        };
      default:
        return {
          icon: Activity,
          label: 'Idle',
          color: 'text-gray-500',
          bg: 'bg-gray-500/5',
          border: 'border-gray-500/20',
          pulse: false
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const sizeClasses = {
    sm: {
      container: 'text-xs px-2 py-1',
      icon: 'w-3 h-3',
      dot: 'w-1.5 h-1.5'
    },
    md: {
      container: 'text-sm px-3 py-1.5',
      icon: 'w-4 h-4',
      dot: 'w-2 h-2'
    },
    lg: {
      container: 'text-base px-4 py-2',
      icon: 'w-5 h-5',
      dot: 'w-2.5 h-2.5'
    }
  };

  const getActivityLabel = () => {
    if (!lastActivity) return 'No activity';

    const seconds = Math.floor(activityDelta / 1000);
    if (seconds < 1) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border backdrop-blur-sm',
        sizeClasses[size].container,
        config.bg,
        config.border,
        className
      )}
    >
      {/* Status Icon with Activity Pulse */}
      <div className="relative">
        <Icon
          className={cn(
            sizeClasses[size].icon,
            config.color,
            config.spin && 'animate-spin'
          )}
        />

        {/* Activity Pulse Ring */}
        <AnimatePresence>
          {isActive && showPulse && config.pulse && (
            <motion.div
              className={cn(
                'absolute inset-0 rounded-full border-2',
                config.color.replace('text-', 'border-')
              )}
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Agent Info */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('font-medium truncate', config.color)}>
            {agentName}
          </span>

          {/* Active Indicator Dot */}
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className={cn(
                  'rounded-full',
                  sizeClasses[size].dot,
                  config.color.replace('text-', 'bg-')
                )}
                style={{
                  boxShadow: `0 0 10px ${config.color.replace('text-', 'rgba(').replace('400', '128,0.5)')}`
                }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Activity Stats */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{config.label}</span>
          {outputLineCount > 0 && (
            <>
              <span>•</span>
              <span>{outputLineCount} lines</span>
            </>
          )}
          {lastActivity && (
            <>
              <span>•</span>
              <span>{getActivityLabel()}</span>
            </>
          )}
        </div>
      </div>

      {/* Lightning bolt for recent activity */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 45 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          >
            <Zap className={cn('w-4 h-4', config.color)} fill="currentColor" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
