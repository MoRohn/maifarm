import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X,
  Bell,
  Sparkles,
  Package,
  Bot
} from 'lucide-react';
import { clsx } from 'clsx';

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'harvest' | 'agent';

export interface NotificationToastProps {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  onClose: (id: string) => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  timestamp?: Date;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose,
  action,
  timestamp
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return CheckCircle;
      case 'error':
        return XCircle;
      case 'warning':
        return AlertTriangle;
      case 'info':
        return Info;
      case 'harvest':
        return Package;
      case 'agent':
        return Bot;
      default:
        return Bell;
    }
  };

  const getColors = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50 dark:bg-green-900/30',
          border: 'border-green-200 dark:border-green-800',
          icon: 'text-green-600 dark:text-green-400',
          text: 'text-green-900 dark:text-green-100'
        };
      case 'error':
        return {
          bg: 'bg-red-50 dark:bg-red-900/30',
          border: 'border-red-200 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400',
          text: 'text-red-900 dark:text-red-100'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/30',
          border: 'border-yellow-200 dark:border-yellow-800',
          icon: 'text-yellow-600 dark:text-yellow-400',
          text: 'text-yellow-900 dark:text-yellow-100'
        };
      case 'harvest':
        return {
          bg: 'bg-purple-50 dark:bg-purple-900/30',
          border: 'border-purple-200 dark:border-purple-800',
          icon: 'text-purple-600 dark:text-purple-400',
          text: 'text-purple-900 dark:text-purple-100'
        };
      case 'agent':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/30',
          border: 'border-blue-200 dark:border-blue-800',
          icon: 'text-blue-600 dark:text-blue-400',
          text: 'text-blue-900 dark:text-blue-100'
        };
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-900/30',
          border: 'border-gray-200 dark:border-gray-800',
          icon: 'text-gray-600 dark:text-gray-400',
          text: 'text-gray-900 dark:text-gray-100'
        };
    }
  };

  const Icon = getIcon();
  const colors = getColors();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.3 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
      className={clsx(
        'relative w-full max-w-sm pointer-events-auto',
        'rounded-apple-xl shadow-apple-lg border',
        'backdrop-blur-xl',
        colors.bg,
        colors.border
      )}
    >
      {/* Progress bar for auto-dismiss */}
      {duration > 0 && (
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
          className="absolute top-0 left-0 right-0 h-0.5 bg-current opacity-20 origin-left rounded-t-apple-xl"
          style={{ backgroundColor: 'currentColor' }}
        />
      )}

      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <motion.div
              initial={{ rotate: -180, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
              className={clsx('p-1.5 rounded-apple', colors.icon)}
            >
              {type === 'harvest' ? (
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Icon className="w-5 h-5" />
                </motion.div>
              ) : (
                <Icon className="w-5 h-5" />
              )}
            </motion.div>
          </div>
          
          <div className="ml-3 flex-1">
            <p className={clsx('text-sm font-medium', colors.text)}>
              {title}
            </p>
            {message && (
              <p className={clsx('mt-1 text-sm opacity-90', colors.text)}>
                {message}
              </p>
            )}
            
            {(action || timestamp) && (
              <div className="mt-3 flex items-center justify-between">
                {action && (
                  <button
                    onClick={action.onClick}
                    className={clsx(
                      'text-sm font-medium hover:underline focus:outline-none',
                      colors.icon
                    )}
                  >
                    {action.label}
                  </button>
                )}
                
                {timestamp && (
                  <span className="text-xs opacity-60">
                    {new Date(timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="ml-4 flex-shrink-0">
            <button
              onClick={() => onClose(id)}
              className={clsx(
                'inline-flex rounded-apple p-1.5',
                'hover:bg-black/5 dark:hover:bg-white/5',
                'focus:outline-none focus:ring-2 focus:ring-offset-2',
                'transition-colors',
                colors.text
              )}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Special animation for harvest notifications */}
      {type === 'harvest' && (
        <div className="absolute -top-2 -right-2 pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles className="w-6 h-6 text-yellow-400" />
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

interface NotificationContainerProps {
  notifications: NotificationToastProps[];
  onClose: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({
  notifications,
  onClose,
  position = 'top-right'
}) => {
  const getPositionClasses = () => {
    switch (position) {
      case 'top-right':
        return 'top-0 right-0 items-end';
      case 'top-left':
        return 'top-0 left-0 items-start';
      case 'bottom-right':
        return 'bottom-0 right-0 items-end';
      case 'bottom-left':
        return 'bottom-0 left-0 items-start';
      case 'top-center':
        return 'top-0 left-1/2 -translate-x-1/2 items-center';
      case 'bottom-center':
        return 'bottom-0 left-1/2 -translate-x-1/2 items-center';
      default:
        return 'top-0 right-0 items-end';
    }
  };

  return (
    <div
      className={clsx(
        'fixed z-50 flex flex-col space-y-4 p-4 pointer-events-none',
        getPositionClasses()
      )}
      style={{ maxHeight: '100vh', maxWidth: '100vw' }}
    >
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <NotificationToast
            key={notification.id}
            {...notification}
            onClose={onClose}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};