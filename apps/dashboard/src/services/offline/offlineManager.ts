import { offlineStorage, STORES, SyncQueueItem } from '@/utils/offlineStorage';
import { Farm, Agent } from '@/types';

export interface OfflineState {
  isOnline: boolean;
  pendingSyncs: number;
  lastSyncTime: number | null;
  syncInProgress: boolean;
}

export interface OfflineConfig {
  syncInterval: number; // in milliseconds
  maxRetries: number;
  retryDelay: number; // in milliseconds
  enableBackgroundSync: boolean;
}

export class OfflineManager {
  private state: OfflineState = {
    isOnline: navigator.onLine,
    pendingSyncs: 0,
    lastSyncTime: null,
    syncInProgress: false,
  };

  private config: OfflineConfig = {
    syncInterval: 30000, // 30 seconds
    maxRetries: 3,
    retryDelay: 5000, // 5 seconds
    enableBackgroundSync: true,
  };

  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(state: OfflineState) => void> = new Set();

  constructor() {
    this.initialize();
  }

  private async initialize() {
    // Initialize offline storage
    await offlineStorage.initialize();

    // Set up event listeners
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Listen for service worker messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage);
    }

    // Start periodic sync
    this.startPeriodicSync();

    // Update pending sync count
    await this.updatePendingSyncCount();
  }

  private handleOnline = async () => {
    console.log('[OfflineManager] Network connection restored');
    this.updateState({ isOnline: true });
    
    // Trigger sync when coming back online
    await this.syncAll();
  };

  private handleOffline = () => {
    console.log('[OfflineManager] Network connection lost');
    this.updateState({ isOnline: false });
  };

  private handleServiceWorkerMessage = (event: MessageEvent) => {
    const { type, payload } = event.data;

    switch (type) {
      case 'SYNC_COMPLETE':
        this.handleSyncComplete(payload);
        break;
      case 'OFFLINE_STATUS':
        this.updateState({ isOnline: payload.isOnline });
        break;
    }
  };

  private handleSyncComplete = async (payload: { id: string; url: string }) => {
    // Remove from sync queue
    await offlineStorage.delete(STORES.SYNC_QUEUE, payload.id);
    await this.updatePendingSyncCount();
  };

  private updateState(partial: Partial<OfflineState>) {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }

  private async updatePendingSyncCount() {
    const pendingItems = await offlineStorage.getPendingSyncItems();
    this.updateState({ pendingSyncs: pendingItems.length });
  }

  private startPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      if (this.state.isOnline && !this.state.syncInProgress) {
        await this.syncAll();
      }
    }, this.config.syncInterval);
  }

  // Public API

  configure(config: Partial<OfflineConfig>) {
    this.config = { ...this.config, ...config };
    
    // Restart periodic sync with new interval
    if (config.syncInterval !== undefined) {
      this.startPeriodicSync();
    }
  }

  subscribe(listener: (state: OfflineState) => void): () => void {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(this.state);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): OfflineState {
    return { ...this.state };
  }

  async syncAll(): Promise<void> {
    if (!this.state.isOnline || this.state.syncInProgress) {
      return;
    }

    console.log('[OfflineManager] Starting sync...');
    this.updateState({ syncInProgress: true });

    try {
      const pendingItems = await offlineStorage.getPendingSyncItems();
      console.log(`[OfflineManager] Found ${pendingItems.length} items to sync`);

      for (const item of pendingItems) {
        if (item.retries >= this.config.maxRetries) {
          console.error(`[OfflineManager] Max retries reached for item ${item.id}`);
          await offlineStorage.updateSyncItemStatus(item.id, 'failed', 'Max retries exceeded');
          continue;
        }

        await this.syncItem(item);
        
        // Add delay between syncs to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.updateState({ 
        syncInProgress: false,
        lastSyncTime: Date.now()
      });
      
      await this.updatePendingSyncCount();
      
      console.log('[OfflineManager] Sync completed');
    } catch (error) {
      console.error('[OfflineManager] Sync failed:', error);
      this.updateState({ syncInProgress: false });
    }
  }

  private async syncItem(item: SyncQueueItem): Promise<void> {
    try {
      await offlineStorage.updateSyncItemStatus(item.id, 'syncing');

      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });

      if (response.ok) {
        // Success - remove from queue
        await offlineStorage.delete(STORES.SYNC_QUEUE, item.id);
        console.log(`[OfflineManager] Successfully synced item ${item.id}`);
      } else {
        // Server error - update status and retry later
        const error = `Server error: ${response.status} ${response.statusText}`;
        await offlineStorage.updateSyncItemStatus(item.id, 'pending', error);
        console.error(`[OfflineManager] Failed to sync item ${item.id}:`, error);
      }
    } catch (error) {
      // Network error - update status and retry later
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await offlineStorage.updateSyncItemStatus(item.id, 'pending', errorMessage);
      console.error(`[OfflineManager] Failed to sync item ${item.id}:`, error);
      
      // If network error, mark as offline
      if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
        this.updateState({ isOnline: false });
      }
    }
  }

  async queueOperation(
    entity: SyncQueueItem['entity'],
    method: string,
    url: string,
    data?: any
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Get auth token if available - safe for iOS Safari private browsing
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (storageError) {
      console.warn('[OfflineManager] localStorage unavailable for auth token:', storageError);
    }

    await offlineStorage.queueForSync({
      type: method === 'POST' ? 'CREATE' : method === 'PUT' ? 'UPDATE' : 'DELETE',
      status: 'pending',
      entity,
      method,
      url,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    await this.updatePendingSyncCount();

    // Trigger sync if online
    if (this.state.isOnline && this.config.enableBackgroundSync) {
      // Delay to batch multiple operations
      setTimeout(() => this.syncAll(), 1000);
    }
  }

  // Entity-specific offline operations

  async saveFarmOffline(farm: Farm): Promise<void> {
    await offlineStorage.put(STORES.FARMS, farm);
    
    if (this.state.isOnline) {
      await this.queueOperation('farm', 'PUT', `/api/farms/${farm.id}`, farm);
    }
  }

  async saveAgentOffline(agent: Agent): Promise<void> {
    await offlineStorage.put(STORES.AGENTS, agent);
    
    if (this.state.isOnline) {
      await this.queueOperation('agent', 'PUT', `/api/agents/${agent.id}`, agent);
    }
  }

  async getOfflineFarms(): Promise<Farm[]> {
    return offlineStorage.getAll<Farm>(STORES.FARMS);
  }

  async getOfflineAgents(farmId?: string): Promise<Agent[]> {
    if (farmId) {
      return offlineStorage.query<Agent>(STORES.AGENTS, 'farmId', farmId);
    }
    return offlineStorage.getAll<Agent>(STORES.AGENTS);
  }

  // Cache management

  async preloadForOffline(urls: string[]): Promise<void> {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const messageChannel = new MessageChannel();
      
      navigator.serviceWorker.controller.postMessage({
        type: 'CACHE_URLS',
        payload: { urls },
      }, [messageChannel.port2]);
    }
  }

  async clearOfflineData(): Promise<void> {
    await offlineStorage.clear(STORES.FARMS);
    await offlineStorage.clear(STORES.AGENTS);
    await offlineStorage.clear(STORES.ANALYTICS);
    await offlineStorage.clear(STORES.METRICS);
    
    // Clear service worker caches
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEAR_CACHE',
      });
    }
  }

  async getStorageInfo() {
    return offlineStorage.getStorageUsage();
  }

  // Cleanup

  async cleanup(olderThanDays: number = 30): Promise<void> {
    await offlineStorage.cleanup(olderThanDays);
  }

  destroy() {
    // Remove event listeners
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', this.handleServiceWorkerMessage);
    }

    // Clear interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Clear listeners
    this.listeners.clear();

    // Close database
    offlineStorage.close();
  }
}

// Singleton instance
export const offlineManager = new OfflineManager();