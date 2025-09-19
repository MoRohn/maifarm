import { useEffect, useState, useCallback } from 'react';
import { offlineSync } from '@/services/offlineSync';
import { useWebSocket } from './useWebSocket';
import toast from 'react-hot-toast';

interface UseOfflineSyncOptions {
  autoSync?: boolean;
}

interface UseOfflineSyncReturn {
  isOnline: boolean;
  pendingCount: number;
  pendingSyncs: number; // Alias for pendingCount
  syncInProgress: boolean;
  lastSyncTime: number | null;
  conflicts: any[];
  syncNow: () => Promise<void>;
  resolveConflict: (conflictId: string, resolution: 'local' | 'server' | 'merge', mergedData?: any) => Promise<void>;
  exportOfflineData: () => Promise<void>;
  importOfflineData: (file: File) => Promise<void>;
}

export function useOfflineSync(options: UseOfflineSyncOptions = {}): UseOfflineSyncReturn {
  const { autoSync = false } = options;
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  // WebSocket connection (optional, only for real-time sync updates)
  const webSocketHook = useWebSocket({ 
    url: import.meta.env.VITE_API_URL || 'http://localhost:4567'
  });
  const wsConnected = isOnline ? webSocketHook.connected : false;

  // Update online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Back online! Syncing changes...', {
        icon: '🌐',
        duration: 3000
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.error('You are offline. Changes will be synced when connection is restored.', {
        icon: '📡',
        duration: 5000
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update pending count periodically
  useEffect(() => {
    const updatePendingCount = async () => {
      try {
        const count = await offlineSync.getPendingCount();
        setPendingCount(count);
      } catch (error) {
        console.error('Failed to get pending count:', error);
      }
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);

    return () => clearInterval(interval);
  }, []);

  // Update conflicts
  useEffect(() => {
    const updateConflicts = async () => {
      try {
        const unresolvedConflicts = await offlineSync.getUnresolvedConflicts();
        setConflicts(unresolvedConflicts);
      } catch (error) {
        console.error('Failed to get conflicts:', error);
      }
    };

    updateConflicts();
    const interval = setInterval(updateConflicts, 10000);

    return () => clearInterval(interval);
  }, []);

  // Load last sync time from localStorage
  useEffect(() => {
    const savedSyncTime = localStorage.getItem('lastSyncTime');
    if (savedSyncTime) {
      setLastSyncTime(parseInt(savedSyncTime, 10));
    }
  }, []);

  // Listen for sync events
  useEffect(() => {
    const handleSyncEvent = (event: CustomEvent) => {
      const { type, data } = event.detail;

      switch (type) {
        case 'sync:completed':
          setSyncInProgress(false);
          const now = Date.now();
          setLastSyncTime(now);
          localStorage.setItem('lastSyncTime', now.toString());
          
          if (data.synced > 0) {
            toast.success(`Synced ${data.synced} operations successfully!`, {
              icon: '✅',
              duration: 3000
            });
          }
          break;

        case 'sync:conflict':
          toast.error(`Conflict detected for ${data.resource}. Please resolve manually.`, {
            icon: '⚠️',
            duration: 5000
          });
          break;
      }
    };

    window.addEventListener('offline-sync', handleSyncEvent as any);

    return () => {
      window.removeEventListener('offline-sync', handleSyncEvent as any);
    };
  }, []);

  // Manual sync
  const syncNow = useCallback(async () => {
    if (!isOnline) {
      toast.error('Cannot sync while offline', {
        icon: '🚫',
        duration: 3000
      });
      return;
    }

    setSyncInProgress(true);
    
    try {
      await offlineSync.syncPendingOperations();
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error('Sync failed. Please try again later.', {
        icon: '❌',
        duration: 3000
      });
    } finally {
      setSyncInProgress(false);
    }
  }, [isOnline]);

  // Resolve conflict
  const resolveConflict = useCallback(async (
    conflictId: string,
    resolution: 'local' | 'server' | 'merge',
    mergedData?: any
  ) => {
    try {
      await offlineSync.resolveConflict(conflictId, resolution, mergedData);
      
      toast.success('Conflict resolved successfully!', {
        icon: '✅',
        duration: 3000
      });

      // Update conflicts list
      const updatedConflicts = await offlineSync.getUnresolvedConflicts();
      setConflicts(updatedConflicts);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      toast.error('Failed to resolve conflict', {
        icon: '❌',
        duration: 3000
      });
    }
  }, []);

  // Export offline data
  const exportOfflineData = useCallback(async () => {
    try {
      const blob = await offlineSync.exportOfflineData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maifarm-offline-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Offline data exported successfully!', {
        icon: '📥',
        duration: 3000
      });
    } catch (error) {
      console.error('Failed to export data:', error);
      toast.error('Failed to export offline data', {
        icon: '❌',
        duration: 3000
      });
    }
  }, []);

  // Import offline data
  const importOfflineData = useCallback(async (file: File) => {
    try {
      await offlineSync.importOfflineData(file);
      
      toast.success('Offline data imported successfully!', {
        icon: '📤',
        duration: 3000
      });

      // Update counts
      const count = await offlineSync.getPendingCount();
      setPendingCount(count);
      
      const unresolvedConflicts = await offlineSync.getUnresolvedConflicts();
      setConflicts(unresolvedConflicts);
    } catch (error) {
      console.error('Failed to import data:', error);
      toast.error('Failed to import offline data', {
        icon: '❌',
        duration: 3000
      });
    }
  }, []);

  // Auto sync when coming back online
  useEffect(() => {
    if (isOnline && autoSync && pendingCount > 0 && !syncInProgress) {
      syncNow();
    }
  }, [isOnline, autoSync, pendingCount, syncInProgress, syncNow]);

  return {
    isOnline,
    pendingCount,
    pendingSyncs: pendingCount, // Alias for compatibility
    syncInProgress,
    lastSyncTime,
    conflicts,
    syncNow,
    resolveConflict,
    exportOfflineData,
    importOfflineData
  };
}