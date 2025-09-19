import { Farm, Agent } from '@/types';

// Extend ServiceWorkerRegistration to include sync
declare global {
  interface ServiceWorkerRegistration {
    sync?: SyncManager;
  }
  
  interface SyncManager {
    register(tag: string): Promise<void>;
    getTags(): Promise<string[]>;
  }
}

// Database configuration
const DB_NAME = 'maifarm-offline';
const DB_VERSION = 2;

// Store names
export const STORES = {
  FARMS: 'farms',
  AGENTS: 'agents',
  SYNC_QUEUE: 'sync-queue',
  ANALYTICS: 'analytics',
  SETTINGS: 'settings',
  YAML_TEMPLATES: 'yaml-templates',
  METRICS: 'metrics',
  AUDIT_LOGS: 'audit-logs',
} as const;

// Store schemas
const STORE_SCHEMAS = {
  [STORES.FARMS]: {
    keyPath: 'id',
    indexes: [
      { name: 'status', keyPath: 'status' },
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'updatedAt', keyPath: 'updatedAt' },
    ],
  },
  [STORES.AGENTS]: {
    keyPath: 'id',
    indexes: [
      { name: 'farmId', keyPath: 'farmId' },
      { name: 'status', keyPath: 'status' },
      { name: 'type', keyPath: 'type' },
    ],
  },
  [STORES.SYNC_QUEUE]: {
    keyPath: 'id',
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'type', keyPath: 'type' },
      { name: 'status', keyPath: 'status' },
    ],
  },
  [STORES.ANALYTICS]: {
    keyPath: 'id',
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'type', keyPath: 'type' },
    ],
  },
  [STORES.SETTINGS]: {
    keyPath: 'key',
  },
  [STORES.YAML_TEMPLATES]: {
    keyPath: 'id',
    indexes: [
      { name: 'name', keyPath: 'name' },
      { name: 'category', keyPath: 'category' },
    ],
  },
  [STORES.METRICS]: {
    keyPath: 'id',
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'metricType', keyPath: 'metricType' },
    ],
  },
  [STORES.AUDIT_LOGS]: {
    keyPath: 'id',
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'action', keyPath: 'action' },
      { name: 'userId', keyPath: 'userId' },
    ],
  },
};

// Sync queue item interface
export interface SyncQueueItem {
  id: string;
  timestamp: number;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  status: 'pending' | 'syncing' | 'failed';
  entity: 'farm' | 'agent' | 'analytics' | 'settings';
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  retries: number;
  lastError?: string;
}

// Offline storage class
export class OfflineStorage {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  async initialize(): Promise<void> {
    if (this.db) return;
    
    if (!this.dbPromise) {
      this.dbPromise = this.openDatabase();
    }
    
    this.db = await this.dbPromise;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log('IndexedDB opened successfully');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        console.log(`Upgrading IndexedDB from version ${oldVersion} to ${DB_VERSION}`);

        // Create stores if they don't exist
        Object.entries(STORE_SCHEMAS).forEach(([storeName, schema]) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: schema.keyPath });
            
            // Create indexes
            if ('indexes' in schema && (schema as any).indexes) {
              (schema as any).indexes.forEach((index: any) => {
                store.createIndex(index.name, index.keyPath);
              });
            }
          }
        });
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  // Generic CRUD operations
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    const db = await this.ensureDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.ensureDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T>(storeName: string, data: T): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName: string): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Query operations
  async query<T>(
    storeName: string,
    indexName: string,
    query: IDBKeyRange | string,
    limit?: number
  ): Promise<T[]> {
    const db = await this.ensureDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    
    return new Promise((resolve, reject) => {
      const results: T[] = [];
      const request = index.openCursor(query);
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push(cursor.value);
          if (!limit || results.length < limit) {
            cursor.continue();
          } else {
            resolve(results);
          }
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // Sync queue operations
  async queueForSync(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    const queueItem: SyncQueueItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retries: 0,
    };
    
    await this.put(STORES.SYNC_QUEUE, queueItem);
    
    // Register for background sync if available
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      if (registration.sync) {
        await registration.sync.register(`sync-${item.entity}`);
      }
    }
  }

  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    return this.query<SyncQueueItem>(
      STORES.SYNC_QUEUE,
      'status',
      'pending'
    );
  }

  async updateSyncItemStatus(id: string, status: SyncQueueItem['status'], error?: string): Promise<void> {
    const item = await this.get<SyncQueueItem>(STORES.SYNC_QUEUE, id);
    if (item) {
      item.status = status;
      item.retries += 1;
      if (error) {
        item.lastError = error;
      }
      await this.put(STORES.SYNC_QUEUE, item);
    }
  }

  // Batch operations
  async batchPut<T>(storeName: string, items: T[]): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    const promises = items.map(item => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    
    await Promise.all(promises);
  }

  // Storage management
  async getStorageUsage(): Promise<{
    usage: number;
    quota: number;
    percentage: number;
  }> {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { usage: 0, quota: 0, percentage: 0 };
    }
    
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? (usage / quota) * 100 : 0;
    
    return { usage, quota, percentage };
  }

  async cleanup(olderThanDays: number = 30): Promise<void> {
    const cutoffDate = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    // Clean up old sync queue items
    const oldSyncItems = await this.query<SyncQueueItem>(
      STORES.SYNC_QUEUE,
      'timestamp',
      IDBKeyRange.upperBound(cutoffDate)
    );
    
    for (const item of oldSyncItems) {
      if (item.status !== 'pending') {
        await this.delete(STORES.SYNC_QUEUE, item.id);
      }
    }
    
    // Clean up old analytics data
    const oldAnalytics = await this.query<any>(
      STORES.ANALYTICS,
      'timestamp',
      IDBKeyRange.upperBound(cutoffDate)
    );
    
    for (const item of oldAnalytics) {
      await this.delete(STORES.ANALYTICS, item.id);
    }
    
    // Clean up old metrics
    const oldMetrics = await this.query<any>(
      STORES.METRICS,
      'timestamp',
      IDBKeyRange.upperBound(cutoffDate)
    );
    
    for (const item of oldMetrics) {
      await this.delete(STORES.METRICS, item.id);
    }
  }

  // Export/Import for backup
  async exportData(): Promise<Record<string, any[]>> {
    const db = await this.ensureDB();
    const exportData: Record<string, any[]> = {};
    
    for (const storeName of db.objectStoreNames) {
      exportData[storeName] = await this.getAll(storeName);
    }
    
    return exportData;
  }

  async importData(data: Record<string, any[]>): Promise<void> {
    const db = await this.ensureDB();
    
    for (const [storeName, items] of Object.entries(data)) {
      if (db.objectStoreNames.contains(storeName)) {
        await this.clear(storeName);
        await this.batchPut(storeName, items);
      }
    }
  }

  // Close database connection
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
    }
  }
}

// Singleton instance
export const offlineStorage = new OfflineStorage();