import { BarnItem, BarnFolder, BarnStats } from '@/types/barn';
import apiClient from './apiClient';
import { websocketService } from './websocket/websocketService';
import { normalizeBarnItem, unwrapBarnApiPayload } from './barnServiceUtils';
import toast from 'react-hot-toast';

interface BarnItemFilter {
  type?: BarnItem['type'];
  category?: string;
  tags?: string[];
  folderId?: string;
  searchQuery?: string;
}

interface StoreHarvestOptions {
  name?: string;
  description?: string;
  type?: BarnItem['type'];
  category?: string;
  tags?: string[];
  folderId?: string;
}

// Track barn storage failures for UI display
interface BarnStorageFailure {
  farmId: string;
  farmName?: string;
  error: string;
  timestamp: Date;
  harvestId?: string;
}

class BarnService {
  private baseUrl = '/api/barn';
  private storageFailures: BarnStorageFailure[] = [];
  private failureListeners: ((failures: BarnStorageFailure[]) => void)[] = [];

  constructor() {
    // Subscribe to barn-related WebSocket events
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    websocketService.on('barn:item-stored', this.handleItemStored.bind(this));
    websocketService.on('barn:item-used', this.handleItemUsed.bind(this));
    websocketService.on('barn:item-deleted', this.handleItemDeleted.bind(this));

    // Subscribe to shutdown completion events to detect barn storage failures
    websocketService.on('farm:graceful_shutdown_completed', this.handleShutdownCompleted.bind(this));

    // Subscribe to explicit barn collection failures
    websocketService.on('barn:collection:failed', this.handleCollectionFailed.bind(this));
  }

  private handleItemStored(data: any) {
    console.log('Barn item stored:', data);
  }

  private handleItemUsed(data: any) {
    console.log('Barn item used:', data);
  }

  private handleItemDeleted(data: any) {
    console.log('Barn item deleted:', data);
  }

  /**
   * Handle shutdown completion events and notify user of barn storage failures
   */
  private handleShutdownCompleted(data: any) {
    const { farmId, result } = data || {};

    if (!result?.barnStored && result?.errors?.length > 0) {
      // Barn storage failed during shutdown
      const barnErrors = result.errors.filter((e: string) =>
        e.toLowerCase().includes('barn') || e.toLowerCase().includes('storage')
      );

      if (barnErrors.length > 0) {
        const failure: BarnStorageFailure = {
          farmId,
          error: barnErrors[0],
          timestamp: new Date(),
          harvestId: data.harvestId
        };

        this.storageFailures.push(failure);
        this.notifyFailureListeners();

        // Show toast notification for barn storage failure
        toast.error(
          `Barn storage failed for farm ${farmId.substring(0, 8)}. Your harvest may not have been saved to the Barn.`,
          {
            duration: 8000,
            id: `barn-failure-${farmId}`,
            icon: '\u26a0\ufe0f',
            style: {
              background: '#FEF2F2',
              border: '1px solid #EF4444',
              color: '#991B1B'
            }
          }
        );

        console.warn('Barn storage failed during shutdown:', failure);
      }
    } else if (result?.barnStored) {
      // Success - show a brief success notification
      toast.success('Harvest saved to Barn', {
        duration: 3000,
        id: `barn-success-${farmId}`,
        icon: '\ud83d\udc1a',
        style: {
          background: '#F0FDF4',
          border: '1px solid #22C55E',
          color: '#166534'
        }
      });
    }
  }

  /**
   * Handle explicit barn collection failures
   */
  private handleCollectionFailed(data: any) {
    const failure: BarnStorageFailure = {
      farmId: data.farmId || 'unknown',
      farmName: data.farmName,
      error: data.error || 'Collection failed',
      timestamp: new Date(),
      harvestId: data.harvestId
    };

    this.storageFailures.push(failure);
    this.notifyFailureListeners();

    // Show toast notification
    toast.error(
      `Failed to collect harvest${data.farmName ? ` for "${data.farmName}"` : ''}. ${data.error || ''}`,
      {
        duration: 6000,
        id: `collection-failure-${data.farmId || Date.now()}`,
        icon: '\u274c'
      }
    );
  }

  /**
   * Subscribe to storage failure events
   */
  onStorageFailure(callback: (failures: BarnStorageFailure[]) => void): () => void {
    this.failureListeners.push(callback);
    // Immediately call with current failures
    callback([...this.storageFailures]);

    return () => {
      const index = this.failureListeners.indexOf(callback);
      if (index !== -1) {
        this.failureListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get recent storage failures
   */
  getRecentFailures(): BarnStorageFailure[] {
    // Return failures from the last hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return this.storageFailures.filter(f => f.timestamp.getTime() > oneHourAgo);
  }

  /**
   * Clear storage failures
   */
  clearFailures(): void {
    this.storageFailures = [];
    this.notifyFailureListeners();
  }

  private notifyFailureListeners() {
    const failures = [...this.storageFailures];
    this.failureListeners.forEach(cb => cb(failures));
  }

  async getStats(): Promise<BarnStats> {
    const response = await apiClient.get(`${this.baseUrl}/stats`);
    const payload = unwrapBarnApiPayload<Partial<BarnStats>>(response) ?? {};

    const recentItemsRaw = Array.isArray(payload.recentItems)
      ? payload.recentItems
      : Array.isArray(payload.recentHarvests)
        ? payload.recentHarvests
        : [];
    const recentItems = recentItemsRaw.map(item => this.parseBarnItem(item));

    return {
      ...payload,
      recentItems,
      recentHarvests: recentItems
    } as BarnStats;
  }

  async getAll(filter?: BarnItemFilter): Promise<BarnItem[]> {
    const params = new URLSearchParams();
    
    if (filter) {
      if (filter.type) params.append('type', filter.type);
      if (filter.category) params.append('category', filter.category);
      if (filter.tags?.length) params.append('tags', filter.tags.join(','));
      if (filter.folderId) params.append('folderId', filter.folderId);
      if (filter.searchQuery) params.append('search', filter.searchQuery);
    }

    const queryString = params.toString();
    const url = queryString ? `${this.baseUrl}/items?${queryString}` : `${this.baseUrl}/items`;
    
    const response = await apiClient.get(url);
    const items = unwrapBarnApiPayload<BarnItem[] | null>(response) ?? [];
    return Array.isArray(items) ? items.map(item => this.parseBarnItem(item)) : [];
  }

  async getById(id: string): Promise<BarnItem> {
    const response = await apiClient.get(`${this.baseUrl}/items/${id}`);
    const payload = unwrapBarnApiPayload<BarnItem>(response);
    if (!payload) {
      throw new Error('Invalid barn item response');
    }
    return this.parseBarnItem(payload);
  }

  async storeHarvest(harvestId: string, options?: StoreHarvestOptions): Promise<BarnItem> {
    const response = await apiClient.post(`${this.baseUrl}/store`, {
      harvestId,
      ...options
    });
    const payload = unwrapBarnApiPayload<BarnItem>(response);
    if (!payload) {
      throw new Error('Invalid barn item response');
    }
    return this.parseBarnItem(payload);
  }

  async updateItem(id: string, updates: Partial<BarnItem>): Promise<BarnItem> {
    const response = await apiClient.put(`${this.baseUrl}/items/${id}`, updates);
    const payload = unwrapBarnApiPayload<BarnItem>(response);
    if (!payload) {
      throw new Error('Invalid barn item response');
    }
    return this.parseBarnItem(payload);
  }

  async useItem(id: string): Promise<BarnItem> {
    const response = await apiClient.post(`${this.baseUrl}/items/${id}/use`);
    const payload = unwrapBarnApiPayload<BarnItem>(response);
    if (!payload) {
      throw new Error('Invalid barn item response');
    }
    return this.parseBarnItem(payload);
  }

  async deleteItem(id: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/items/${id}`);
  }

  async bulkDelete(itemIds: string[]): Promise<{ success: boolean; deleted: number; errors: number }> {
    const response = await apiClient.delete(`${this.baseUrl}/items/bulk`, {
      data: { itemIds }
    });
    // Backend returns { success, data: { success, deleted, errors } }
    // Unwrap to return the inner data object
    return response.data.data || response.data;
  }

  async getFolders(): Promise<BarnFolder[]> {
    const response = await apiClient.get(`${this.baseUrl}/folders`);
    const payload = unwrapBarnApiPayload<BarnFolder[] | null>(response) ?? [];
    const folders = Array.isArray(payload) ? payload : [];
    return folders.map(folder => ({
      ...folder,
      createdAt: new Date(folder.createdAt),
      updatedAt: new Date(folder.updatedAt)
    }));
  }

  async createFolder(name: string, description?: string, parentId?: string): Promise<BarnFolder> {
    const response = await apiClient.post(`${this.baseUrl}/folders`, {
      name,
      description,
      parentId
    });
    const payload = unwrapBarnApiPayload<BarnFolder>(response);
    if (!payload) {
      throw new Error('Invalid barn folder response');
    }
    return {
      ...payload,
      createdAt: payload?.createdAt ? new Date(payload.createdAt) : new Date(),
      updatedAt: payload?.updatedAt ? new Date(payload.updatedAt) : new Date()
    } as BarnFolder;
  }

  async createSeedFromItem(itemId: string): Promise<string> {
    const response = await apiClient.post<{
      yaml: string
    }>(
      `${this.baseUrl}/items/${itemId}/to-seed`
    );
    return response.data.yaml;
  }

  private parseBarnItem(item: any): BarnItem {
    return normalizeBarnItem(item);
  }

  // Helper method to get items by type
  async getItemsByType(type: BarnItem['type']): Promise<BarnItem[]> {
    return this.getAll({ type });
  }

  // Helper method to get items in a specific folder
  async getItemsInFolder(folderId: string): Promise<BarnItem[]> {
    return this.getAll({ folderId });
  }

  // Helper method to search items
  async searchItems(query: string): Promise<BarnItem[]> {
    return this.getAll({ searchQuery: query });
  }

  // Subscribe to barn updates for a specific item
  subscribeToItem(itemId: string, callback: (item: BarnItem) => void) {
    const handler = (data: any) => {
      if (data.itemId === itemId) {
        this.getById(itemId).then(callback);
      }
    };
    
    websocketService.on('barn:item-used', handler);
    websocketService.on('barn:item-updated', handler);
    
    // Return unsubscribe function
    return () => {
      websocketService.off('barn:item-used', handler);
      websocketService.off('barn:item-updated', handler);
    };
  }
}

export const barnService = new BarnService();
export type { BarnService };
