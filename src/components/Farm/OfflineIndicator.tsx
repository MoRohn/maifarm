import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { offlineSync } from '@/services/offlineSync';
import { useOfflineSync } from '@/hooks/useOfflineSync';

interface OfflineIndicatorProps {
  className?: string;
  showDetails?: boolean;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  className = '',
  showDetails = false,
  position = 'bottom-right'
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [conflicts, setConflicts] = useState(0);
  const { syncInProgress, syncNow } = useOfflineSync();

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    const updatePendingCount = async () => {
      const count = await offlineSync.getPendingCount();
      setPendingCount(count);
    };

    const updateConflicts = async () => {
      const unresolvedConflicts = await offlineSync.getUnresolvedConflicts();
      setConflicts(unresolvedConflicts.length);
    };

    // Set up event listeners
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Listen for sync events
    const handleSyncEvent = (event: CustomEvent) => {
      const { type, data } = event.detail;
      
      switch (type) {
        case 'sync:started':
          setSyncStatus('syncing');
          break;
        case 'sync:completed':
          setSyncStatus('idle');
          setLastSyncTime(new Date());
          updatePendingCount();
          updateConflicts();
          break;
        case 'sync:error':
          setSyncStatus('error');
          break;
        case 'sync:conflict':
          updateConflicts();
          break;
      }
    };

    window.addEventListener('offline-sync', handleSyncEvent as EventListener);

    // Initial load
    updatePendingCount();
    updateConflicts();

    // Update pending count periodically
    const interval = setInterval(() => {
      updatePendingCount();
    }, 5000);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener('offline-sync', handleSyncEvent as EventListener);
      clearInterval(interval);
    };
  }, []);

  const getPositionClasses = () => {
    const positions = {
      'top-right': 'top-4 right-4',
      'bottom-right': 'bottom-4 right-4',
      'top-left': 'top-4 left-4',
      'bottom-left': 'bottom-4 left-4'
    };
    return positions[position];
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never';
    
    const diff = Date.now() - lastSyncTime.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    
    return lastSyncTime.toLocaleDateString();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`fixed ${getPositionClasses()} z-50 ${className}`}
      >
        <div
          className={`
            rounded-lg shadow-lg backdrop-blur-md
            ${isOnline 
              ? 'bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700' 
              : 'bg-yellow-50/90 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700'
            }
            p-3 transition-all duration-300
          `}
        >
          <div className="flex items-center gap-3">
            {/* Connection Status Icon */}
            <div className="relative">
              {isOnline ? (
                <Wifi className="w-5 h-5 text-green-500" />
              ) : (
                <WifiOff className="w-5 h-5 text-yellow-500" />
              )}
              
              {/* Sync status indicator */}
              {syncStatus === 'syncing' && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="absolute -bottom-1 -right-1"
                >
                  <RefreshCw className="w-3 h-3 text-blue-500" />
                </motion.div>
              )}
            </div>

            {/* Status Text */}
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {isOnline ? 'Online' : 'Offline Mode'}
              </div>
              
              {pendingCount > 0 && (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {pendingCount} pending {pendingCount === 1 ? 'change' : 'changes'}
                </div>
              )}
              
              {conflicts > 0 && (
                <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {conflicts} {conflicts === 1 ? 'conflict' : 'conflicts'}
                </div>
              )}
            </div>

            {/* Sync Button */}
            {isOnline && pendingCount > 0 && (
              <button
                onClick={syncNow}
                disabled={syncStatus === 'syncing'}
                className={`
                  p-2 rounded-md transition-colors
                  ${syncStatus === 'syncing'
                    ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                `}
                title="Sync now"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    syncStatus === 'syncing' ? 'animate-spin text-blue-500' : 'text-gray-600 dark:text-gray-400'
                  }`}
                />
              </button>
            )}
          </div>

          {/* Expanded Details */}
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"
            >
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Last sync:</span>
                  <span className="text-gray-900 dark:text-gray-100">{formatLastSync()}</span>
                </div>
                
                {syncInProgress && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Progress:</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        In Progress...
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `50%` }}
                        className="bg-blue-500 h-1.5 rounded-full"
                      />
                    </div>
                  </div>
                )}
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Storage:</span>
                  <div className="flex items-center gap-1">
                    {isOnline ? (
                      <Cloud className="w-3 h-3 text-green-500" />
                    ) : (
                      <CloudOff className="w-3 h-3 text-yellow-500" />
                    )}
                    <span className="text-gray-900 dark:text-gray-100">
                      {isOnline ? 'Cloud synced' : 'Local only'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Toast Notification for Important Events */}
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg p-3 shadow-lg"
          >
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              You're working offline. Changes will sync when connection is restored.
            </p>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};