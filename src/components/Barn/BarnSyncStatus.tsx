import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Check, AlertCircle, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../../services/apiClient';

interface SyncResult {
  success: boolean;
  itemsScanned: number;
  itemsAdded: number;
  itemsUpdated: number;
  itemsArchived: number;
  orphanedCleaned: number;
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
}

interface BarnSyncStatusProps {
  onSyncComplete?: (result: SyncResult) => void;
}

export const BarnSyncStatus: React.FC<BarnSyncStatusProps> = ({ onSyncComplete }) => {
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [isInProgress, setIsInProgress] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    checkSyncStatus();
    const interval = setInterval(checkSyncStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const checkSyncStatus = async () => {
    try {
      const response = await api.barn.getSyncStatus();
      if (response.data?.success) {
        setLastSync(response.data.data.lastSync);
        setIsInProgress(response.data.data.inProgress);
      }
    } catch (error) {
      console.error('Failed to check sync status:', error);
    }
  };

  const handleSync = async () => {
    if (isSyncing || isInProgress) return;
    
    setIsSyncing(true);
    try {
      const response = await api.barn.sync();
      if (response.data?.success) {
        setLastSync(response.data.data);
        if (onSyncComplete) {
          onSyncComplete(response.data.data);
        }
      }
    } catch (error) {
      console.error('Failed to sync:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatTimestamp = (date: Date | string): string => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const getSyncStatus = () => {
    if (isInProgress || isSyncing) return 'syncing';
    if (!lastSync) return 'never';
    if (lastSync.errors.length > 0) return 'error';
    return 'success';
  };

  const status = getSyncStatus();

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleSync}
        disabled={isInProgress || isSyncing}
        className={clsx(
          'flex items-center space-x-2 px-3 py-2 rounded-apple text-sm font-medium transition-all',
          status === 'syncing' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
          status === 'success' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50',
          status === 'error' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50',
          status === 'never' && 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
          (isInProgress || isSyncing) && 'cursor-not-allowed opacity-75'
        )}
        onMouseEnter={() => setShowDetails(true)}
        onMouseLeave={() => setShowDetails(false)}
      >
        {status === 'syncing' ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : status === 'success' ? (
          <Check className="w-4 h-4" />
        ) : status === 'error' ? (
          <AlertCircle className="w-4 h-4" />
        ) : (
          <Clock className="w-4 h-4" />
        )}
        
        <span>
          {status === 'syncing' ? 'Syncing...' : 
           status === 'never' ? 'Sync Now' :
           `Synced ${formatTimestamp(lastSync!.completedAt || lastSync!.startedAt)}`}
        </span>
      </motion.button>

      <AnimatePresence>
        {showDetails && lastSync && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full mt-2 right-0 z-50 w-80 bg-white dark:bg-gray-900 rounded-apple-lg shadow-xl border border-gray-200 dark:border-gray-800 p-4"
          >
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Last Sync Details
            </h4>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Items Scanned:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {lastSync.itemsScanned}
                </span>
              </div>
              
              {lastSync.itemsAdded > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Items Added:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    +{lastSync.itemsAdded}
                  </span>
                </div>
              )}
              
              {lastSync.itemsUpdated > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Items Updated:</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {lastSync.itemsUpdated}
                  </span>
                </div>
              )}
              
              {lastSync.itemsArchived > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Items Archived:</span>
                  <span className="font-medium text-yellow-600 dark:text-yellow-400">
                    {lastSync.itemsArchived}
                  </span>
                </div>
              )}
              
              {lastSync.orphanedCleaned > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Orphaned Cleaned:</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    -{lastSync.orphanedCleaned}
                  </span>
                </div>
              )}
              
              {lastSync.completedAt && (
                <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-800">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {Math.round(
                        (new Date(lastSync.completedAt).getTime() - 
                         new Date(lastSync.startedAt).getTime()) / 1000
                      )}s
                    </span>
                  </div>
                </div>
              )}
              
              {lastSync.errors.length > 0 && (
                <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-800">
                  <div className="text-red-600 dark:text-red-400 font-medium mb-1">
                    Errors:
                  </div>
                  <div className="space-y-1">
                    {lastSync.errors.slice(0, 3).map((error, idx) => (
                      <div key={idx} className="text-xs text-red-500 dark:text-red-300">
                        • {error}
                      </div>
                    ))}
                    {lastSync.errors.length > 3 && (
                      <div className="text-xs text-red-500 dark:text-red-300">
                        • ...and {lastSync.errors.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};