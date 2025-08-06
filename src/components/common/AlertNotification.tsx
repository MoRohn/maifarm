import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAlertStore } from '../../store/alertStore';
import { alertService, AlertType } from '../../services/alertService';

const iconMap: Record<AlertType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon,
};

const colorMap: Record<AlertType, string> = {
  success: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
  error: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
  info: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
};

const iconColorMap: Record<AlertType, string> = {
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400',
};

export const AlertNotification: React.FC = () => {
  const { alerts } = useAlertStore();

  return (
    <div
      className="fixed top-4 right-4 z-50 space-y-4 pointer-events-none"
      style={{ maxWidth: '400px' }}
    >
      <AnimatePresence>
        {alerts.map((alert) => {
          const Icon = iconMap[alert.type];
          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={`pointer-events-auto flex items-start p-4 rounded-lg shadow-lg border ${
                colorMap[alert.type]
              }`}
            >
              <Icon className={`w-5 h-5 mt-0.5 ${iconColorMap[alert.type]}`} />
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium">{alert.title}</p>
                {alert.message && (
                  <p className="mt-1 text-sm opacity-90">{alert.message}</p>
                )}
                {alert.action && (
                  <button
                    onClick={alert.action.onClick}
                    className="mt-2 text-sm font-medium underline hover:no-underline"
                  >
                    {alert.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => alertService.dismiss(alert.id)}
                className="ml-4 inline-flex text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

// Hook to show alerts from components
export const useAlert = () => {
  return {
    success: (title: string, message?: string) => alertService.success(title, message),
    error: (title: string, message?: string) => alertService.error(title, message),
    warning: (title: string, message?: string) => alertService.warning(title, message),
    info: (title: string, message?: string) => alertService.info(title, message),
    show: alertService.show.bind(alertService),
    dismiss: alertService.dismiss.bind(alertService),
    dismissAll: alertService.dismissAll.bind(alertService),
  };
};