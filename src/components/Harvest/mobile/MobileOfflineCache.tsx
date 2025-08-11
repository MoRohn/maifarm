import React, { useEffect, useState, useCallback } from 'react';
import { WifiOff, Download, Trash2, HardDrive, RefreshCw, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { openDB, IDBPDatabase } from 'idb';

interface CachedData {
  id: string;
  type: 'terminal' | 'harvest' | 'farm' | 'agent';
  data: any;
  timestamp: Date;
  size: number;
}

interface OfflineQueueItem {
  id: string;
  action: 'command' | 'update' | 'create';
  payload: any;
  timestamp: Date;
  retries: number;
}

export const MobileOfflineCache: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [cacheSize, setCacheSize] = useState(0);
  const [cachedItems, setCachedItems] = useState<CachedData[]>([]);
  const [queuedActions, setQueuedActions] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [db, setDb] = useState<IDBPDatabase | null>(null);
  const [storageQuota, setStorageQuota] = useState<{ usage: number; quota: number } | null>(null);

  // Initialize IndexedDB
  useEffect(() => {
    initializeDatabase();
    checkStorageQuota();
    
    // Monitor online/offline status
    const handleOnline = () => {
      setIsOffline(false);
      syncQueuedActions();
    };
    
    const handleOffline = () => {
      setIsOffline(true);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const initializeDatabase = async () => {
    try {
      const database = await openDB('MaiFarmOfflineCache', 1, {
        upgrade(db) {
          // Create object stores
          if (!db.objectStoreNames.contains('cache')) {
            const cacheStore = db.createObjectStore('cache', { keyPath: 'id' });
            cacheStore.createIndex('type', 'type');
            cacheStore.createIndex('timestamp', 'timestamp');
          }
          
          if (!db.objectStoreNames.contains('queue')) {
            const queueStore = db.createObjectStore('queue', { keyPath: 'id' });
            queueStore.createIndex('timestamp', 'timestamp');
          }
          
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        }
      });
      
      setDb(database);
      await loadCachedData(database);
      await loadQueuedActions(database);
      
    } catch (error) {
      console.error('Failed to initialize database:', error);
    }
  };

  const checkStorageQuota = async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        setStorageQuota({
          usage: estimate.usage || 0,
          quota: estimate.quota || 0
        });
      } catch (error) {
        console.error('Failed to check storage quota:', error);
      }
    }
  };

  const loadCachedData = async (database: IDBPDatabase) => {
    try {
      const tx = database.transaction('cache', 'readonly');
      const store = tx.objectStore('cache');
      const items = await store.getAll();
      
      setCachedItems(items);
      
      // Calculate total cache size
      const totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);
      setCacheSize(totalSize);
      
    } catch (error) {
      console.error('Failed to load cached data:', error);
    }
  };

  const loadQueuedActions = async (database: IDBPDatabase) => {
    try {
      const tx = database.transaction('queue', 'readonly');
      const store = tx.objectStore('queue');
      const items = await store.getAll();
      
      setQueuedActions(items);
      
    } catch (error) {
      console.error('Failed to load queued actions:', error);
    }
  };

  // Cache terminal output
  const cacheTerminalOutput = useCallback(async (
    sessionId: string,
    agentId: number,
    output: string[]
  ) => {
    if (!db) return;
    
    try {
      const cacheItem: CachedData = {
        id: `terminal-${sessionId}-${agentId}-${Date.now()}`,
        type: 'terminal',
        data: {
          sessionId,
          agentId,
          output
        },
        timestamp: new Date(),
        size: JSON.stringify(output).length
      };
      
      const tx = db.transaction('cache', 'readwrite');
      await tx.objectStore('cache').put(cacheItem);
      
      await loadCachedData(db);
      
    } catch (error) {
      console.error('Failed to cache terminal output:', error);
    }
  }, [db]);

  // Queue action for later sync
  const queueAction = useCallback(async (
    action: 'command' | 'update' | 'create',
    payload: any
  ) => {
    if (!db) return;
    
    try {
      const queueItem: OfflineQueueItem = {
        id: `queue-${Date.now()}-${Math.random()}`,
        action,
        payload,
        timestamp: new Date(),
        retries: 0
      };
      
      const tx = db.transaction('queue', 'readwrite');
      await tx.objectStore('queue').put(queueItem);
      
      await loadQueuedActions(db);
      
      // Show notification
      showOfflineNotification('Action queued for sync');
      
    } catch (error) {
      console.error('Failed to queue action:', error);
    }
  }, [db]);

  // Sync queued actions when online
  const syncQueuedActions = useCallback(async () => {
    if (!db || isOffline || queuedActions.length === 0) return;
    
    setIsSyncing(true);
    
    try {
      for (const item of queuedActions) {
        try {
          // Process each queued action
          await processQueuedAction(item);
          
          // Remove from queue on success
          const tx = db.transaction('queue', 'readwrite');
          await tx.objectStore('queue').delete(item.id);
          
        } catch (error) {
          console.error(`Failed to sync action ${item.id}:`, error);
          
          // Update retry count
          item.retries++;
          if (item.retries < 3) {
            const tx = db.transaction('queue', 'readwrite');
            await tx.objectStore('queue').put(item);
          }
        }
      }
      
      await loadQueuedActions(db);
      showOfflineNotification('Sync completed successfully');
      
    } catch (error) {
      console.error('Sync failed:', error);
      showOfflineNotification('Sync failed, will retry later');
      
    } finally {
      setIsSyncing(false);
    }
  }, [db, isOffline, queuedActions]);

  // Process a queued action
  const processQueuedAction = async (item: OfflineQueueItem) => {
    switch (item.action) {
      case 'command':
        await fetch(`/api/harvest/terminal/${item.payload.sessionId}/${item.payload.agentId}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: item.payload.command })
        });
        break;
        
      case 'update':
        await fetch(`/api/farms/${item.payload.farmId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload.data)
        });
        break;
        
      case 'create':
        await fetch('/api/farms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });
        break;
    }
  };

  // Clear cache
  const clearCache = useCallback(async () => {
    if (!db) return;
    
    try {
      const tx = db.transaction('cache', 'readwrite');
      await tx.objectStore('cache').clear();
      
      setCachedItems([]);
      setCacheSize(0);
      
      showOfflineNotification('Cache cleared');
      
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }, [db]);

  // Clear specific cache item
  const removeCacheItem = useCallback(async (id: string) => {
    if (!db) return;
    
    try {
      const tx = db.transaction('cache', 'readwrite');
      await tx.objectStore('cache').delete(id);
      
      await loadCachedData(db);
      
    } catch (error) {
      console.error('Failed to remove cache item:', error);
    }
  }, [db]);

  // Download data for offline use
  const downloadForOffline = useCallback(async (
    type: 'terminal' | 'harvest' | 'farm',
    data: any
  ) => {
    if (!db) return;
    
    try {
      const cacheItem: CachedData = {
        id: `${type}-download-${Date.now()}`,
        type,
        data,
        timestamp: new Date(),
        size: JSON.stringify(data).length
      };
      
      const tx = db.transaction('cache', 'readwrite');
      await tx.objectStore('cache').put(cacheItem);
      
      await loadCachedData(db);
      
      showOfflineNotification(`${type} data downloaded for offline use`);
      
    } catch (error) {
      console.error('Failed to download for offline:', error);
    }
  }, [db]);

  // Show offline notification
  const showOfflineNotification = (message: string) => {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 left-4 right-4 bg-gray-800 text-white p-3 rounded-lg shadow-lg z-50';
    toast.innerHTML = `
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span>${message}</span>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  };

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="mobile-offline-cache p-4">
      {/* Offline Status Banner */}
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-yellow-600 text-white p-3 rounded-lg mb-4 flex items-center gap-3"
        >
          <WifiOff className="w-5 h-5" />
          <div className="flex-1">
            <p className="font-semibold">Offline Mode</p>
            <p className="text-sm opacity-90">
              Your actions will be synced when connection is restored
            </p>
          </div>
        </motion.div>
      )}
      
      {/* Storage Status */}
      {storageQuota && (
        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-gray-400" />
              <span className="text-white font-medium">Storage</span>
            </div>
            <span className="text-gray-400 text-sm">
              {formatBytes(storageQuota.usage)} / {formatBytes(storageQuota.quota)}
            </span>
          </div>
          
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${(storageQuota.usage / storageQuota.quota) * 100}%` }}
            />
          </div>
        </div>
      )}
      
      {/* Queued Actions */}
      {queuedActions.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">
              Queued Actions ({queuedActions.length})
            </h3>
            <button
              onClick={syncQueuedActions}
              disabled={isOffline || isSyncing}
              className="p-2 bg-blue-600 rounded disabled:bg-gray-700"
            >
              <RefreshCw className={`w-4 h-4 text-white ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          <div className="space-y-2">
            {queuedActions.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 bg-gray-800 rounded"
              >
                <div className="flex-1">
                  <p className="text-white text-sm">{item.action}</p>
                  <p className="text-gray-400 text-xs">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                {item.retries > 0 && (
                  <span className="text-yellow-400 text-xs">
                    Retry {item.retries}/3
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Cached Data */}
      <div className="bg-gray-900 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">
            Cached Data ({formatBytes(cacheSize)})
          </h3>
          <button
            onClick={clearCache}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        
        {cachedItems.length === 0 ? (
          <p className="text-gray-400 text-center py-4">No cached data</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {cachedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 bg-gray-800 rounded"
              >
                <div className="flex-1">
                  <p className="text-white text-sm capitalize">{item.type}</p>
                  <p className="text-gray-400 text-xs">
                    {formatBytes(item.size)} • {new Date(item.timestamp).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => removeCacheItem(item.id)}
                  className="text-gray-400 hover:text-white"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Download for Offline Button */}
      <button
        onClick={() => {
          // Example: Download current session for offline
          downloadForOffline('terminal', {
            sessionId: 'current',
            timestamp: new Date(),
            // Add relevant data here
          });
        }}
        className="mt-4 w-full py-3 bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2"
      >
        <Download className="w-5 h-5" />
        Download Current Session
      </button>
    </div>
  );
};

export default MobileOfflineCache;