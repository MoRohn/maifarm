import { Farm, Agent } from '@/types';
import { OfflineCapability } from '@/types/security';

interface QueuedOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  resource: string;
  data: any;
  timestamp: Date;
  retries: number;
}

class OfflineService {
  private db: IDBDatabase | null = null;
  private syncQueue: Map<string, QueuedOperation> = new Map();
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.initializeDB();
    this.registerServiceWorker();
    this.setupEventListeners();
  }

  private async initializeDB() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('maifarm-offline', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('farms')) {
          const farmStore = db.createObjectStore('farms', { keyPath: 'id' });
          farmStore.createIndex('status', 'status', { unique: false });
          farmStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('agents')) {
          const agentStore = db.createObjectStore('agents', { keyPath: 'id' });
          agentStore.createIndex('farmId', 'farmId', { unique: false });
          agentStore.createIndex('status', 'status', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('operations')) {
          const opsStore = db.createObjectStore('operations', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          opsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      };
    });
  }

  private async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        this.serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered successfully');
        
        // Check for updates
        this.serviceWorkerRegistration.addEventListener('updatefound', () => {
          const newWorker = this.serviceWorkerRegistration!.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                this.notifyUpdate();
              }
            });
          }
        });
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  private setupEventListeners() {
    // Online/offline detection
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncPendingOperations();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Visibility change - sync when app becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncPendingOperations();
      }
    });
  }

  // Public methods
  public async saveFarm(farm: Farm): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(['farms'], 'readwrite');
    const store = tx.objectStore('farms');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(farm);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Queue sync operation if online
    if (this.isOnline) {
      this.queueOperation({
        id: `farm-${farm.id}-${Date.now()}`,
        type: 'update',
        resource: 'farms',
        data: farm,
        timestamp: new Date(),
        retries: 0
      });
    }
  }

  public async getFarm(id: string): Promise<Farm | null> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(['farms'], 'readonly');
    const store = tx.objectStore('farms');
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  public async getAllFarms(): Promise<Farm[]> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(['farms'], 'readonly');
    const store = tx.objectStore('farms');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  public async saveAgent(agent: Agent): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(['agents'], 'readwrite');
    const store = tx.objectStore('agents');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(agent);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async getAgentsByFarm(farmId: string): Promise<Agent[]> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(['agents'], 'readonly');
    const store = tx.objectStore('agents');
    const index = store.index('farmId');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(farmId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  public queueOperation(operation: QueuedOperation) {
    this.syncQueue.set(operation.id, operation);
    
    // Send to service worker
    if (this.serviceWorkerRegistration?.active) {
      this.serviceWorkerRegistration.active.postMessage({
        type: 'QUEUE_OPERATION',
        operation
      });
    }

    // Try to sync immediately if online
    if (this.isOnline && !this.syncInProgress) {
      this.syncPendingOperations();
    }
  }

  private async syncPendingOperations() {
    if (this.syncInProgress || !this.isOnline) return;
    
    this.syncInProgress = true;

    try {
      const operations = Array.from(this.syncQueue.values())
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      for (const operation of operations) {
        try {
          await this.executeOperation(operation);
          this.syncQueue.delete(operation.id);
        } catch (error) {
          console.error('Failed to sync operation:', error);
          
          // Increment retry count
          operation.retries++;
          
          // Remove if too many retries
          if (operation.retries > 3) {
            this.syncQueue.delete(operation.id);
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async executeOperation(operation: QueuedOperation): Promise<void> {
    const endpoint = `/api/${operation.resource}`;
    
    const response = await fetch(endpoint, {
      method: operation.type === 'create' ? 'POST' : 
              operation.type === 'update' ? 'PUT' : 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Offline-Sync': 'true'
      },
      body: JSON.stringify(operation.data)
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.statusText}`);
    }
  }

  public async cacheData(key: string, data: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(['cache'], 'readwrite');
    const store = tx.objectStore('cache');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put({
        key,
        data,
        timestamp: new Date()
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async getCachedData<T>(key: string): Promise<T | null> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(['cache'], 'readonly');
    const store = tx.objectStore('cache');
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async clearCache(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tx = this.db.transaction(['cache'], 'readwrite');
    const store = tx.objectStore('cache');
    
    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private notifyUpdate() {
    // Notify user about app update
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('MaiFarm Updated', {
        body: 'A new version is available. Refresh to update.',
        icon: '/assets/maifarm_logo_icon.png'
      });
    }
  }

  public async requestNotificationPermission(): Promise<boolean> {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  public getOfflineCapabilities(): OfflineCapability {
    return {
      enabled: true,
      syncStrategy: 'smart',
      cacheSize: 50, // MB
      encryptLocalData: true,
      allowedOfflineActions: [
        'view_farms',
        'view_agents',
        'create_draft',
        'edit_draft',
        'view_history'
      ],
      syncInterval: 5, // minutes
      conflictResolution: 'manual'
    };
  }

  public get online(): boolean {
    return this.isOnline;
  }

  public get hasPendingSync(): boolean {
    return this.syncQueue.size > 0;
  }
}

// Export singleton instance
export const offlineService = new OfflineService();