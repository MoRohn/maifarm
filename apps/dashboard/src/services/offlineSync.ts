import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import { encryptionService } from './encryptionService';

interface OfflineDB extends DBSchema {
  pending_operations: {
    key: string;
    value: {
      id: string;
      type: 'CREATE' | 'UPDATE' | 'DELETE';
      resource: string;
      data: any;
      timestamp: number;
      retryCount: number;
      encrypted: boolean;
    };
  };
  cached_data: {
    key: string;
    value: {
      key: string;
      data: any;
      timestamp: number;
      ttl: number;
    };
  };
  conflict_queue: {
    key: string;
    value: {
      id: string;
      localData: any;
      serverData: any;
      operation: string;
      timestamp: number;
      resolved: boolean;
    };
  };
}

class OfflineSyncService {
  private db: IDBPDatabase<OfflineDB> | null = null;
  private syncInProgress = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly DB_NAME = 'maifarm-offline';
  private readonly DB_VERSION = 1;

  async initialize(): Promise<void> {
    try {
      this.db = await openDB<OfflineDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // Pending operations store
          if (!db.objectStoreNames.contains('pending_operations')) {
            const pendingStore = db.createObjectStore('pending_operations', {
              keyPath: 'id'
            });
            (pendingStore as any).createIndex('timestamp', 'timestamp');
            (pendingStore as any).createIndex('resource', 'resource');
          }

          // Cached data store
          if (!db.objectStoreNames.contains('cached_data')) {
            const cacheStore = db.createObjectStore('cached_data', {
              keyPath: 'key'
            });
            (cacheStore as any).createIndex('timestamp', 'timestamp');
          }

          // Conflict queue store
          if (!db.objectStoreNames.contains('conflict_queue')) {
            const conflictStore = db.createObjectStore('conflict_queue', {
              keyPath: 'id'
            });
            (conflictStore as any).createIndex('timestamp', 'timestamp');
            (conflictStore as any).createIndex('resolved', 'resolved');
          }
        }
      });

      // Start periodic sync
      this.startPeriodicSync();

      // Register service worker message handler
      this.registerServiceWorkerHandler();
    } catch (error) {
      console.error('Failed to initialize offline sync:', error);
      throw error;
    }
  }

  async queueOperation(
    type: 'CREATE' | 'UPDATE' | 'DELETE',
    resource: string,
    data: any,
    encrypted = false
  ): Promise<string> {
    if (!this.db) await this.initialize();

    const id = uuidv4();
    const operation = {
      id,
      type,
      resource,
      data: encrypted ? await encryptionService.encrypt(JSON.stringify(data)) : data,
      timestamp: Date.now(),
      retryCount: 0,
      encrypted
    };

    await this.db!.put('pending_operations', operation);
    
    // Trigger sync if online
    if (navigator.onLine) {
      this.triggerSync();
    }

    return id;
  }

  async getPendingOperations(): Promise<any[]> {
    if (!this.db) await this.initialize();

    const operations = await this.db!.getAll('pending_operations');
    return operations.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getPendingCount(): Promise<number> {
    if (!this.db) await this.initialize();
    return await this.db!.count('pending_operations');
  }

  async removePendingOperation(id: string): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.delete('pending_operations', id);
  }

  async cacheData(key: string, data: any, ttl = 3600000): Promise<void> {
    if (!this.db) await this.initialize();

    await this.db!.put('cached_data', {
      key,
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  async getCachedData(key: string): Promise<any | null> {
    if (!this.db) await this.initialize();

    const cached = await this.db!.get('cached_data', key);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > cached.ttl) {
      await this.db!.delete('cached_data', key);
      return null;
    }

    return cached.data;
  }

  async clearCache(): Promise<void> {
    if (!this.db) await this.initialize();
    const tx = this.db!.transaction('cached_data', 'readwrite');
    await tx.objectStore('cached_data').clear();
  }

  async syncPendingOperations(): Promise<void> {
    if (this.syncInProgress || !navigator.onLine) return;

    this.syncInProgress = true;

    try {
      const operations = await this.getPendingOperations();

      for (const operation of operations) {
        try {
          const result = await this.executeSyncOperation(operation);
          
          if (result.success) {
            await this.removePendingOperation(operation.id);
          } else if (result.conflict) {
            await this.queueConflict(operation, result.serverData);
          } else {
            // Increment retry count
            operation.retryCount++;
            if (operation.retryCount >= 3) {
              await this.moveToDeadLetter(operation);
            } else {
              await this.db!.put('pending_operations', operation);
            }
          }
        } catch (error) {
          console.error('Sync operation failed:', error);
          operation.retryCount++;
          await this.db!.put('pending_operations', operation);
        }
      }

      // Notify UI of sync completion
      this.notifyUI('sync:completed', {
        synced: operations.length,
        timestamp: Date.now()
      });
    } finally {
      this.syncInProgress = false;
    }
  }

  private async executeSyncOperation(operation: any): Promise<any> {
    const url = `/api/offline/sync`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
      'X-Offline-Operation': operation.id
    };

    let data = operation.data;
    if (operation.encrypted) {
      data = await encryptionService.decrypt(data);
      data = JSON.parse(data);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: operation.type,
        resource: operation.resource,
        data,
        timestamp: operation.timestamp
      })
    });

    const result = await response.json();

    return {
      success: response.ok,
      conflict: response.status === 409,
      serverData: result.data
    };
  }

  private async queueConflict(operation: any, serverData: any): Promise<void> {
    if (!this.db) return;

    const conflictId = uuidv4();
    await this.db.put('conflict_queue', {
      id: conflictId,
      localData: operation.data,
      serverData,
      operation: operation.resource,
      timestamp: Date.now(),
      resolved: false
    });

    // Notify UI of conflict
    this.notifyUI('sync:conflict', {
      conflictId,
      resource: operation.resource
    });
  }

  private async moveToDeadLetter(operation: any): Promise<void> {
    // In production, this would move to a dead letter queue
    console.error('Operation moved to dead letter queue:', operation);
    await this.removePendingOperation(operation.id);
  }

  async resolveConflict(
    conflictId: string,
    resolution: 'local' | 'server' | 'merge',
    mergedData?: any
  ): Promise<void> {
    if (!this.db) await this.initialize();

    const conflict = await this.db!.get('conflict_queue', conflictId);
    if (!conflict) throw new Error('Conflict not found');

    let resolvedData;
    switch (resolution) {
      case 'local':
        resolvedData = conflict.localData;
        break;
      case 'server':
        resolvedData = conflict.serverData;
        break;
      case 'merge':
        resolvedData = mergedData || { ...conflict.serverData, ...conflict.localData };
        break;
    }

    // Queue the resolved operation
    await this.queueOperation('UPDATE', conflict.operation, resolvedData);

    // Mark conflict as resolved
    conflict.resolved = true;
    await this.db!.put('conflict_queue', conflict);
  }

  async getUnresolvedConflicts(): Promise<any[]> {
    if (!this.db) await this.initialize();

    const tx = this.db!.transaction('conflict_queue', 'readonly');
    const index = (tx.objectStore('conflict_queue') as any).index('resolved');
    return await index.getAll(IDBKeyRange.only(false));
  }

  private startPeriodicSync(): void {
    // Sync every 30 seconds when online
    this.syncInterval = setInterval(() => {
      if (navigator.onLine) {
        this.syncPendingOperations();
      }
    }, 30000);

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('Back online - triggering sync');
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      console.log('Gone offline - pausing sync');
    });
  }

  private triggerSync(): void {
    // Use background sync if available
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then((registration) => {
        return registration.sync?.register('sync-farms');
      }).catch(() => {
        // Fallback to immediate sync
        this.syncPendingOperations();
      });
    } else {
      // Immediate sync fallback
      this.syncPendingOperations();
    }
  }

  private registerServiceWorkerHandler(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SYNC_REQUESTED') {
          this.syncPendingOperations();
        }
      });
    }
  }

  private notifyUI(type: string, data: any): void {
    window.dispatchEvent(new CustomEvent('offline-sync', {
      detail: { type, data }
    }));
  }

  async exportOfflineData(): Promise<Blob> {
    if (!this.db) await this.initialize();

    const data = {
      pendingOperations: await this.db!.getAll('pending_operations'),
      cachedData: await this.db!.getAll('cached_data'),
      conflicts: await this.db!.getAll('conflict_queue'),
      exportedAt: new Date().toISOString()
    };

    return new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
  }

  async importOfflineData(file: File): Promise<void> {
    if (!this.db) await this.initialize();

    const text = await file.text();
    const data = JSON.parse(text);

    // Clear existing data
    await this.db!.clear('pending_operations');
    await this.db!.clear('cached_data');
    await this.db!.clear('conflict_queue');

    // Import new data
    const tx = this.db!.transaction(
      ['pending_operations', 'cached_data', 'conflict_queue'],
      'readwrite'
    );

    for (const op of data.pendingOperations || []) {
      await tx.objectStore('pending_operations').put(op);
    }

    for (const cache of data.cachedData || []) {
      await tx.objectStore('cached_data').put(cache);
    }

    for (const conflict of data.conflicts || []) {
      await tx.objectStore('conflict_queue').put(conflict);
    }

    await tx.done;
  }

  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

export const offlineSync = new OfflineSyncService();