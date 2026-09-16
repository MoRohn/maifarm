import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  XCircle,
  X,
  ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

interface AlertBannerProps {
  type: AlertType;
  title: string;
  message?: string;
  isVisible: boolean;
  onDismiss?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  persistent?: boolean;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  type,
  title,
  message,
  isVisible,
  onDismiss,
  action,
  className,
  persistent = false
}) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return CheckCircle;
      case 'warning':
        return AlertTriangle;
      case 'error':
        return XCircle;
      default:
        return Info;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30',
          border: 'border-green-200 dark:border-green-700',
          icon: 'text-green-600 dark:text-green-400',
          text: 'text-green-900 dark:text-green-100',
          button: 'bg-green-600 hover:bg-green-700 text-white'
        };
      case 'warning':
        return {
          bg: 'bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30',
          border: 'border-yellow-200 dark:border-yellow-700',
          icon: 'text-yellow-600 dark:text-yellow-400',
          text: 'text-yellow-900 dark:text-yellow-100',
          button: 'bg-yellow-600 hover:bg-yellow-700 text-white'
        };
      case 'error':
        return {
          bg: 'bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30',
          border: 'border-red-200 dark:border-red-700',
          icon: 'text-red-600 dark:text-red-400',
          text: 'text-red-900 dark:text-red-100',
          button: 'bg-red-600 hover:bg-red-700 text-white'
        };
      default:
        return {
          bg: 'bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30',
          border: 'border-blue-200 dark:border-blue-700',
          icon: 'text-blue-600 dark:text-blue-400',
          text: 'text-blue-900 dark:text-blue-100',
          button: 'bg-blue-600 hover:bg-blue-700 text-white'
        };
    }
  };

  const Icon = getIcon();
  const styles = getStyles();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -20, height: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={clsx(
            'relative overflow-hidden',
            'border-b backdrop-blur-xl',
            styles.bg,
            styles.border,
            className
          )}
        >
          {/* Animated background pattern */}
          <div className="absolute inset-0 opacity-5">
            <motion.div
              animate={{
                backgroundPosition: ['0% 0%', '100% 100%'],
              }}
              transition={{
                duration: 20,
                repeat: Infinity,
                repeatType: 'reverse',
              }}
              className="w-full h-full"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  45deg,
                  transparent,
                  transparent 10px,
                  currentColor 10px,
                  currentColor 20px
                )`,
              }}
            />
          </div>

          <div className="relative px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between flex-wrap">
              <div className="flex items-center flex-1">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className={clsx('flex-shrink-0', styles.icon)}
                >
                  <Icon className="w-5 h-5" />
                </motion.div>
                
                <div className="ml-3">
                  <h3 className={clsx('text-sm font-medium', styles.text)}>
                    {title}
                  </h3>
                  {message && (
                    <p className={clsx('mt-1 text-sm', styles.text, 'opacity-90')}>
                      {message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3 mt-2 sm:mt-0">
                {action && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={action.onClick}
                    className={clsx(
                      'inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-apple',
                      'transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
                      styles.button
                    )}
                  >
                    {action.label}
                    <ChevronRight className="ml-1 w-4 h-4" />
                  </motion.button>
                )}

                {!persistent && onDismiss && (
                  <button
                    onClick={onDismiss}
                    className={clsx(
                      'inline-flex rounded-apple p-1.5',
                      'hover:bg-black/10 dark:hover:bg-white/10',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2',
                      'transition-colors',
                      styles.text
                    )}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Progress indicator for auto-dismiss */}
          {!persistent && (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 5, ease: 'linear' }}
              onAnimationComplete={onDismiss}
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-current opacity-20 origin-left"
              style={{ backgroundColor: 'currentColor' }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface SystemAlertProps {
  alerts: Array<{
    id: string;
    type: AlertType;
    title: string;
    message?: string;
    persistent?: boolean;
    action?: {
      label: string;
      onClick: () => void;
    };
  }>;
  onDismiss: (id: string) => void;
  className?: string;
}

export const SystemAlerts: React.FC<SystemAlertProps> = ({
  alerts,
  onDismiss,
  className
}) => {
  return (
    <div className={clsx('space-y-2', className)}>
      <AnimatePresence>
        {alerts.map((alert) => (
          <AlertBanner
            key={alert.id}
            type={alert.type}
            title={alert.title}
            message={alert.message}
            isVisible={true}
            onDismiss={() => onDismiss(alert.id)}
            action={alert.action}
            persistent={alert.persistent}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};