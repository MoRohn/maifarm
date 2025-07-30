import { useState, useEffect, useCallback } from 'react';
import { offlineService } from '../services/offline';

interface OfflineStatus {
  isOnline: boolean;
  pendingOperations: number;
  lastSync?: string;
  cacheSize: number;
}

export const useOffline = () => {
  const [status, setStatus] = useState<OfflineStatus>({
    isOnline: navigator.onLine,
    pendingOperations: 0,
    cacheSize: 0,
  });

  const updateStatus = useCallback(async () => {
    const syncStatus = await offlineService.getSyncStatus();
    setStatus({
      isOnline: offlineService.isOnline(),
      ...syncStatus,
    });
  }, []);

  useEffect(() => {
    // Update status on mount
    updateStatus();

    // Listen for online/offline events
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      updateStatus();
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Update status periodically
    const interval = setInterval(updateStatus, 10000); // Every 10 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [updateStatus]);

  const syncNow = useCallback(async () => {
    await offlineService.syncPendingOperations();
    await updateStatus();
  }, [updateStatus]);

  const clearCache = useCallback(async () => {
    await offlineService.clearOfflineData();
    await updateStatus();
  }, [updateStatus]);

  const cacheData = useCallback(async (key: string, data: any, ttlMinutes?: number) => {
    await offlineService.cacheData(key, data, ttlMinutes);
    await updateStatus();
  }, [updateStatus]);

  const getCachedData = useCallback(async (key: string) => {
    return offlineService.getCachedData(key);
  }, []);

  return {
    ...status,
    syncNow,
    clearCache,
    cacheData,
    getCachedData,
  };
};