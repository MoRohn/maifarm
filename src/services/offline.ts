import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface OfflineDB extends DBSchema {
  farms: {
    key: string;
    value: {
      id: string;
      name: string;
      config: any;
      status: string;
      lastSync: string;
      localChanges: boolean;
    };
  };
  pendingOperations: {
    key: string;
    value: {
      id: string;
      type: 'farms' | 'agents' | 'analytics';
      operation: 'create' | 'update' | 'delete';
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
      timestamp: string;
      retries: number;
    };
  };
  cachedData: {
    key: string;
    value: {
      key: string;
      data: any;
      timestamp: string;
      expiry?: string;
    };
  };
}

class OfflineService {
  private db: IDBPDatabase<OfflineDB> | null = null;
  private syncInProgress = false;
  private onlineStatus = navigator.onLine;

  constructor() {
    this.initializeDB();
    this.setupEventListeners();
    this.registerServiceWorker();
  }

  private async initializeDB() {
    this.db = await openDB<OfflineDB>('maifarm-offline', 1, {
      upgrade(db) {
        // Create object stores
        if (!db.objectStoreNames.contains('farms')) {
          db.createObjectStore('farms', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pendingOperations')) {
          const pendingStore = db.createObjectStore('pendingOperations', { 
            keyPath: 'id' 
          });
          pendingStore.createIndex('type', 'type');
          pendingStore.createIndex('timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('cachedData')) {
          const cacheStore = db.createObjectStore('cachedData', { 
            keyPath: 'key' 
          });
          cacheStore.createIndex('expiry', 'expiry');
        }
      },
    });
  }

  private setupEventListeners() {
    window.addEventListener('online', () => {
      this.onlineStatus = true;
      this.syncPendingOperations();
    });

    window.addEventListener('offline', () => {
      this.onlineStatus = false;
    });
  }

  private async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register(
          '/service-worker.js'
        );
        console.log('Service Worker registered:', registration);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  // Check if online
  isOnline(): boolean {
    return this.onlineStatus;
  }

  // Save farm data for offline access
  async saveFarmOffline(farm: any): Promise<void> {
    if (!this.db) return;

    await this.db.put('farms', {
      ...farm,
      lastSync: new Date().toISOString(),
      localChanges: false,
    });
  }

  // Get offline farms
  async getOfflineFarms(): Promise<any[]> {
    if (!this.db) return [];
    return this.db.getAll('farms');
  }

  // Queue an operation for later sync
  async queueOperation(operation: {
    type: 'farms' | 'agents' | 'analytics';
    operation: 'create' | 'update' | 'delete';
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<void> {
    if (!this.db) return;

    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.db.add('pendingOperations', {
      id,
      ...operation,
      headers: operation.headers || {},
      body: operation.body ? JSON.stringify(operation.body) : undefined,
      timestamp: new Date().toISOString(),
      retries: 0,
    });

    // Request background sync if supported
    if ('sync' in self.registration) {
      await self.registration.sync.register(`sync-${operation.type}`);
    }
  }

  // Sync pending operations
  async syncPendingOperations(): Promise<void> {
    if (!this.db || this.syncInProgress || !this.onlineStatus) return;

    this.syncInProgress = true;

    try {
      const operations = await this.db.getAll('pendingOperations');
      
      for (const op of operations) {
        try {
          const response = await fetch(op.url, {
            method: op.method,
            headers: op.headers,
            body: op.body,
          });

          if (response.ok) {
            await this.db.delete('pendingOperations', op.id);
          } else if (response.status >= 400 && response.status < 500) {
            // Client error, don't retry
            await this.db.delete('pendingOperations', op.id);
            console.error('Operation failed with client error:', op.id);
          } else {
            // Server error, increment retry count
            op.retries++;
            if (op.retries > 3) {
              await this.db.delete('pendingOperations', op.id);
              console.error('Operation failed after max retries:', op.id);
            } else {
              await this.db.put('pendingOperations', op);
            }
          }
        } catch (error) {
          console.error('Failed to sync operation:', op.id, error);
          op.retries++;
          await this.db.put('pendingOperations', op);
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  // Cache data with expiration
  async cacheData(key: string, data: any, ttlMinutes?: number): Promise<void> {
    if (!this.db) return;

    const timestamp = new Date().toISOString();
    const expiry = ttlMinutes 
      ? new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
      : undefined;

    await this.db.put('cachedData', {
      key,
      data,
      timestamp,
      expiry,
    });
  }

  // Get cached data
  async getCachedData(key: string): Promise<any | null> {
    if (!this.db) return null;

    const cached = await this.db.get('cachedData', key);
    if (!cached) return null;

    // Check if expired
    if (cached.expiry && new Date(cached.expiry) < new Date()) {
      await this.db.delete('cachedData', key);
      return null;
    }

    return cached.data;
  }

  // Clear expired cache entries
  async clearExpiredCache(): Promise<void> {
    if (!this.db) return;

    const now = new Date().toISOString();
    const tx = this.db.transaction('cachedData', 'readwrite');
    const index = tx.objectStore('cachedData').index('expiry');
    
    for await (const cursor of index.iterate()) {
      if (cursor.value.expiry && cursor.value.expiry < now) {
        await cursor.delete();
      }
    }
  }

  // Get sync status
  async getSyncStatus(): Promise<{
    pendingOperations: number;
    lastSync?: string;
    cacheSize: number;
  }> {
    if (!this.db) {
      return { pendingOperations: 0, cacheSize: 0 };
    }

    const pendingOps = await this.db.count('pendingOperations');
    const cachedItems = await this.db.count('cachedData');
    
    // Get last sync time from farms
    const farms = await this.db.getAll('farms');
    const lastSync = farms
      .map(f => f.lastSync)
      .sort()
      .reverse()[0];

    return {
      pendingOperations: pendingOps,
      lastSync,
      cacheSize: cachedItems,
    };
  }

  // Clear all offline data
  async clearOfflineData(): Promise<void> {
    if (!this.db) return;

    await this.db.clear('farms');
    await this.db.clear('pendingOperations');
    await this.db.clear('cachedData');
  }
}

export const offlineService = new OfflineService();