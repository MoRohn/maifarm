import { BarnItem, BarnFolder, BarnStats } from '../types/barn';
import apiClient from './apiClient';
import { websocketService } from './websocket/websocketService';

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

class BarnService {
  private baseUrl = '/api/barn';

  constructor() {
    // Subscribe to barn-related WebSocket events
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    websocketService.on('barn:item-stored', this.handleItemStored.bind(this));
    websocketService.on('barn:item-used', this.handleItemUsed.bind(this));
    websocketService.on('barn:item-deleted', this.handleItemDeleted.bind(this));
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

  async getStats(): Promise<BarnStats> {
    const response = await apiClient.get<BarnStats>(`${this.baseUrl}/stats`);
    return {
      ...response.data,
      recentItems: response.data.recentItems.map(item => this.parseBarnItem(item))
    };
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
    
    const response = await apiClient.get<BarnItem[]>(url);
    return response.data.map(item => this.parseBarnItem(item));
  }

  async getById(id: string): Promise<BarnItem> {
    const response = await apiClient.get<BarnItem>(`${this.baseUrl}/items/${id}`);
    return this.parseBarnItem(response.data);
  }

  async storeHarvest(harvestId: string, options?: StoreHarvestOptions): Promise<BarnItem> {
    const response = await apiClient.post<BarnItem>(`${this.baseUrl}/store`, {
      harvestId,
      ...options
    });
    return this.parseBarnItem(response.data);
  }

  async updateItem(id: string, updates: Partial<BarnItem>): Promise<BarnItem> {
    const response = await apiClient.put<BarnItem>(`${this.baseUrl}/items/${id}`, updates);
    return this.parseBarnItem(response.data);
  }

  async useItem(id: string): Promise<BarnItem> {
    const response = await apiClient.post<BarnItem>(`${this.baseUrl}/items/${id}/use`);
    return this.parseBarnItem(response.data);
  }

  async deleteItem(id: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/items/${id}`);
  }

  async getFolders(): Promise<BarnFolder[]> {
    const response = await apiClient.get<BarnFolder[]>(`${this.baseUrl}/folders`);
    return response.data.map(folder => ({
      ...folder,
      createdAt: new Date(folder.createdAt),
      updatedAt: new Date(folder.updatedAt)
    }));
  }

  async createFolder(name: string, description?: string, parentId?: string): Promise<BarnFolder> {
    const response = await apiClient.post<BarnFolder>(`${this.baseUrl}/folders`, {
      name,
      description,
      parentId
    });
    return {
      ...response.data,
      createdAt: new Date(response.data.createdAt),
      updatedAt: new Date(response.data.updatedAt)
    };
  }

  async createSeedFromItem(itemId: string): Promise<string> {
    const response = await apiClient.post<{ yaml: string }>(
      `${this.baseUrl}/items/${itemId}/to-seed`
    );
    return response.data.yaml;
  }

  private parseBarnItem(item: any): BarnItem {
    return {
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
      lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : undefined,
      artifacts: item.artifacts || []
    };
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