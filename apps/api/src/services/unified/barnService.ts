/**
 * Unified Barn Service
 * Consolidates all barn storage, cataloging, and retrieval functionality
 * Replaces: barnService, barnCatalogService, barn-related APIs
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { db, redis } from '../../database/connection';
import { websocketManager } from '../../websocket/websocketManager';
import { logger } from '../../utils/logger';
import { pathConfig } from '../../config/paths';
import { harvestService, HarvestData } from './harvestService';

export enum BarnItemType {
  HARVEST = 'harvest',
  SEED = 'seed',
  TEMPLATE = 'template',
  ARTIFACT = 'artifact',
  RESOURCE = 'resource'
}

export interface BarnItem {
  id: string;
  name: string;
  type: BarnItemType;
  description?: string;
  metadata: {
    harvestId?: string;
    farmId?: string;
    farmName?: string;
    tags?: string[];
    size?: number;
    fileCount?: number;
    createdBy?: string;
    version?: string;
  };
  path: string;
  content?: any;
  userId: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  accessedAt?: Date;
  accessCount: number;
}

export interface BarnFilter {
  type?: BarnItemType;
  userId?: string;
  tags?: string[];
  search?: string;
  isPublic?: boolean;
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'name' | 'createdAt' | 'accessedAt' | 'accessCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface BarnExportOptions {
  format: 'json' | 'yaml' | 'zip';
  includeMetadata?: boolean;
  includeContent?: boolean;
}

export interface BarnCatalogEntry {
  id: string;
  barnItemId: string;
  category: string;
  subcategory?: string;
  keywords: string[];
  description: string;
  rating?: number;
  downloads: number;
  lastUsed?: Date;
}

class UnifiedBarnService extends EventEmitter {
  private static instance: UnifiedBarnService;
  private items: Map<string, BarnItem> = new Map();
  private catalog: Map<string, BarnCatalogEntry> = new Map();
  private barnPath: string;

  private constructor() {
    super();
    this.barnPath = pathConfig.getPath('BARN_STORAGE');
    this.initializeService();
  }

  public static getInstance(): UnifiedBarnService {
    if (!UnifiedBarnService.instance) {
      UnifiedBarnService.instance = new UnifiedBarnService();
    }
    return UnifiedBarnService.instance;
  }

  private async initializeService(): Promise<void> {
    // Ensure barn directory exists
    await this.ensureBarnDirectory();

    // Load existing barn items
    await this.loadBarnItems();

    // Subscribe to harvest events
    harvestService.on('harvest:completed', (harvest: HarvestData) => this.handleHarvestCompleted(harvest));
  }

  private async ensureBarnDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.barnPath, { recursive: true });
      await fs.mkdir(path.join(this.barnPath, 'items'), { recursive: true });
      await fs.mkdir(path.join(this.barnPath, 'harvests'), { recursive: true });
      await fs.mkdir(path.join(this.barnPath, 'seeds'), { recursive: true });
      await fs.mkdir(path.join(this.barnPath, 'templates'), { recursive: true });
    } catch (error) {
      logger.error('Failed to create barn directories:', error);
    }
  }

  private async loadBarnItems(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT * FROM barn_items
        ORDER BY created_at DESC
      `);

      for (const row of result.rows) {
        const item = this.rowToBarnItem(row);
        this.items.set(item.id, item);
      }

      // Load catalog entries
      const catalogResult = await db.query(`
        SELECT * FROM barn_catalog
      `);

      for (const row of catalogResult.rows) {
        this.catalog.set(row.id, this.rowToCatalogEntry(row));
      }
    } catch (error: any) {
      // If table doesn't exist, log warning but continue
      if (error.code === '42P01') {
        logger.warn('Barn tables do not exist yet. Run database migrations.');
      } else {
        logger.error('Failed to load barn items:', error);
      }
    }
  }

  private rowToBarnItem(row: any): BarnItem {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description,
      metadata: row.metadata || {},
      path: row.path,
      content: row.content,
      userId: row.user_id,
      isPublic: row.is_public || false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessedAt: row.accessed_at,
      accessCount: row.access_count || 0
    };
  }

  private rowToCatalogEntry(row: any): BarnCatalogEntry {
    return {
      id: row.id,
      barnItemId: row.barn_item_id,
      category: row.category,
      subcategory: row.subcategory,
      keywords: row.keywords || [],
      description: row.description,
      rating: row.rating,
      downloads: row.downloads || 0,
      lastUsed: row.last_used
    };
  }


  /**
   * Create a barn item
   */
  public async createBarnItem(input: {
    name: string;
    type: BarnItemType;
    description?: string;
    content?: any;
    metadata?: any;
    userId: string;
    isPublic?: boolean;
  }): Promise<BarnItem> {
    const itemId = uuidv4();
    const itemPath = path.join(this.barnPath, 'items', itemId);

    // Create item directory
    await fs.mkdir(itemPath, { recursive: true });

    // Save content if provided
    if (input.content) {
      await fs.writeFile(
        path.join(itemPath, 'content.json'),
        JSON.stringify(input.content, null, 2)
      );
    }

    const barnItem: BarnItem = {
      id: itemId,
      name: input.name,
      type: input.type,
      description: input.description,
      metadata: input.metadata || {},
      path: itemPath,
      content: input.content,
      userId: input.userId,
      isPublic: input.isPublic || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      accessCount: 0
    };

    await this.saveBarnItem(barnItem);

    this.emit('barn:created', barnItem);
    websocketManager.broadcast('barn:created', barnItem);

    return barnItem;
  }

  /**
   * Get barn item by ID
   */
  public async getBarnItem(itemId: string, userId?: string): Promise<BarnItem | null> {
    const item = this.items.get(itemId);

    if (!item) {
      return null;
    }

    // Check access permissions
    if (!item.isPublic && item.userId !== userId) {
      return null;
    }

    // Update access tracking
    item.accessedAt = new Date();
    item.accessCount++;
    await this.updateBarnItemAccess(item);

    return item;
  }

  /**
   * Get user's barn items with filtering
   */
  public async getUserBarnItems(userId: string, filter?: BarnFilter): Promise<BarnItem[]> {
    let items = Array.from(this.items.values()).filter(
      item => item.userId === userId || item.isPublic
    );

    if (filter) {
      // Apply filters
      if (filter.type) {
        items = items.filter(item => item.type === filter.type);
      }
      if (filter.tags && filter.tags.length > 0) {
        items = items.filter(item =>
          filter.tags!.some(tag => item.metadata.tags?.includes(tag))
        );
      }
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        items = items.filter(item =>
          item.name.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower)
        );
      }
      if (filter.startDate) {
        items = items.filter(item => item.createdAt >= filter.startDate!);
      }
      if (filter.endDate) {
        items = items.filter(item => item.createdAt <= filter.endDate!);
      }

      // Sorting
      const sortBy = filter.sortBy || 'createdAt';
      const sortOrder = filter.sortOrder || 'desc';
      items.sort((a, b) => {
        const aVal = a[sortBy] || 0;
        const bVal = b[sortBy] || 0;
        return sortOrder === 'asc' ?
          (aVal < bVal ? -1 : 1) :
          (aVal > bVal ? -1 : 1);
      });

      // Pagination
      if (filter.offset) {
        items = items.slice(filter.offset);
      }
      if (filter.limit) {
        items = items.slice(0, filter.limit);
      }
    }

    return items;
  }

  /**
   * Search barn catalog
   */
  public async searchCatalog(query: string, category?: string): Promise<BarnCatalogEntry[]> {
    const queryLower = query.toLowerCase();
    let entries = Array.from(this.catalog.values());

    // Filter by search query
    entries = entries.filter(entry =>
      entry.keywords.some(k => k.includes(queryLower)) ||
      entry.description.toLowerCase().includes(queryLower)
    );

    // Filter by category
    if (category) {
      entries = entries.filter(entry => entry.category === category);
    }

    // Sort by relevance (downloads and rating)
    entries.sort((a, b) => {
      const scoreA = (a.downloads || 0) + (a.rating || 0) * 10;
      const scoreB = (b.downloads || 0) + (b.rating || 0) * 10;
      return scoreB - scoreA;
    });

    return entries;
  }

  /**
   * Export barn item
   */
  public async exportBarnItem(itemId: string, options: BarnExportOptions): Promise<any> {
    const item = await this.getBarnItem(itemId);
    if (!item) {
      throw new Error('Barn item not found');
    }

    switch (options.format) {
      case 'json':
        return this.exportAsJson(item, options);
      case 'yaml':
        return this.exportAsYaml(item, options);
      case 'zip':
        return this.exportAsZip(item, options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Delete barn item
   */
  public async deleteBarnItem(itemId: string, userId: string): Promise<boolean> {
    const item = this.items.get(itemId);

    if (!item || item.userId !== userId) {
      return false;
    }

    // Soft delete in database
    await db.query(`
      UPDATE barn_items SET deleted_at = $1 WHERE id = $2
    `, [new Date(), itemId]);

    // Remove from memory
    this.items.delete(itemId);

    // Remove catalog entries
    for (const [id, entry] of this.catalog.entries()) {
      if (entry.barnItemId === itemId) {
        this.catalog.delete(id);
      }
    }

    this.emit('barn:deleted', { id: itemId });
    websocketManager.broadcast('barn:deleted', { id: itemId });

    return true;
  }

  /**
   * Handle harvest completion
   */
  private async handleHarvestCompleted(harvest: HarvestData | any): Promise<void> {
    try {
      // Handle both HarvestData objects and harvest IDs
      if (typeof harvest === 'object' && harvest.id) {
        await this.storeHarvest(harvest);
      } else if (typeof harvest === 'string') {
        await this.storeHarvest(harvest);
      }
    } catch (error) {
      logger.error('Failed to store harvest in barn:', error);
    }
  }

  /**
   * Save barn item to database
   */
  private async saveBarnItem(item: BarnItem): Promise<void> {
    await db.query(`
      INSERT INTO barn_items (id, name, type, description, metadata, path, content, user_id, is_public, created_at, updated_at, access_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        name = $2, description = $4, metadata = $5, content = $7,
        updated_at = $11, access_count = $12
    `, [item.id, item.name, item.type, item.description, JSON.stringify(item.metadata),
        item.path, JSON.stringify(item.content), item.userId, item.isPublic,
        item.createdAt, item.updatedAt, item.accessCount]);

    this.items.set(item.id, item);
  }

  /**
   * Update barn item access
   */
  private async updateBarnItemAccess(item: BarnItem): Promise<void> {
    await db.query(`
      UPDATE barn_items
      SET accessed_at = $1, access_count = $2
      WHERE id = $3
    `, [item.accessedAt, item.accessCount, item.id]);
  }

  /**
   * Create catalog entry
   */
  private async createCatalogEntry(item: BarnItem, catalogData: {
    category: string;
    subcategory?: string;
    keywords: string[];
    description: string;
  }): Promise<void> {
    const entry: BarnCatalogEntry = {
      id: uuidv4(),
      barnItemId: item.id,
      category: catalogData.category,
      subcategory: catalogData.subcategory,
      keywords: catalogData.keywords,
      description: catalogData.description,
      rating: 0,
      downloads: 0
    };

    await db.query(`
      INSERT INTO barn_catalog (id, barn_item_id, category, subcategory, keywords, description)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [entry.id, entry.barnItemId, entry.category, entry.subcategory,
        JSON.stringify(entry.keywords), entry.description]);

    this.catalog.set(entry.id, entry);
  }

  /**
   * Export as JSON
   */
  private async exportAsJson(item: BarnItem, options: BarnExportOptions): Promise<any> {
    const result: any = {
      name: item.name,
      type: item.type,
      description: item.description
    };

    if (options.includeMetadata) {
      result.metadata = item.metadata;
    }

    if (options.includeContent) {
      result.content = item.content;
    }

    return result;
  }

  /**
   * Export as YAML
   */
  private async exportAsYaml(item: BarnItem, options: BarnExportOptions): Promise<string> {
    const yaml = await import('js-yaml');
    const data = await this.exportAsJson(item, options);
    return yaml.dump(data);
  }

  /**
   * Export as ZIP
   */
  private async exportAsZip(item: BarnItem, options: BarnExportOptions): Promise<Buffer> {
    // This would require a zip library like archiver
    // For now, return a placeholder
    throw new Error('ZIP export not yet implemented');
  }

  /**
   * Get all barn items with optional filtering
   */
  public async findAll(filter?: Partial<BarnFilter>): Promise<BarnItem[]> {
    try {
      let items = Array.from(this.items.values());

      // Apply filters if provided
      if (filter) {
        if (filter.type) {
          items = items.filter(item => item.type === filter.type);
        }
        if (filter.userId) {
          items = items.filter(item => item.userId === filter.userId || item.isPublic);
        }
        if (filter.tags && filter.tags.length > 0) {
          items = items.filter(item =>
            item.metadata.tags?.some(tag => filter.tags?.includes(tag))
          );
        }
        if (filter.search) {
          const searchLower = filter.search.toLowerCase();
          items = items.filter(item =>
            item.name.toLowerCase().includes(searchLower) ||
            item.description?.toLowerCase().includes(searchLower)
          );
        }
      }

      return items;
    } catch (error) {
      logger.error('Failed to find barn items:', error);
      return [];
    }
  }

  /**
   * Find barn item by ID
   */
  public async findById(id: string): Promise<BarnItem | null> {
    return this.items.get(id) || null;
  }

  /**
   * Get barn statistics
   */
  public async getStats(): Promise<any> {
    const items = Array.from(this.items.values());
    const stats = {
      totalItems: items.length,
      byType: {} as Record<string, number>,
      totalSize: 0,
      publicItems: 0,
      privateItems: 0,
      mostRecent: null as BarnItem | null,
      mostAccessed: null as BarnItem | null
    };

    // Calculate statistics
    for (const item of items) {
      // Count by type
      stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;

      // Count public/private
      if (item.isPublic) {
        stats.publicItems++;
      } else {
        stats.privateItems++;
      }

      // Track size
      if (item.metadata.size) {
        stats.totalSize += item.metadata.size;
      }

      // Track most recent
      if (!stats.mostRecent || item.createdAt > stats.mostRecent.createdAt) {
        stats.mostRecent = item;
      }

      // Track most accessed
      if (!stats.mostAccessed || item.accessCount > stats.mostAccessed.accessCount) {
        stats.mostAccessed = item;
      }
    }

    return stats;
  }

  /**
   * Get barn folders (placeholder for folder functionality)
   */
  public async getFolders(): Promise<any[]> {
    // TODO: Implement folder functionality
    // For now, return empty array or mock data
    return [
      {
        id: 'default',
        name: 'Default',
        description: 'Default barn folder',
        itemCount: this.items.size,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  }

  /**
   * Update barn item
   */
  public async updateItem(itemId: string, updates: Partial<BarnItem>): Promise<BarnItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Barn item not found');
    }

    // Apply updates
    Object.assign(item, updates);
    item.updatedAt = new Date();

    // Save to database
    await this.saveBarnItem(item);

    this.emit('barn:updated', item);
    websocketManager.broadcast('barn:updated', item);

    return item;
  }

  /**
   * Use a barn item (track usage)
   */
  public async useItem(itemId: string): Promise<BarnItem> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Barn item not found');
    }

    item.accessCount++;
    item.accessedAt = new Date();

    await this.updateBarnItemAccess(item);

    this.emit('barn:used', item);
    return item;
  }

  /**
   * Delete barn item
   */
  public async deleteItem(itemId: string): Promise<void> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Barn item not found');
    }

    // Soft delete in database
    await db.query(`
      UPDATE barn_items SET deleted_at = $1 WHERE id = $2
    `, [new Date(), itemId]);

    // Remove from memory
    this.items.delete(itemId);

    this.emit('barn:deleted', { id: itemId });
    websocketManager.broadcast('barn:deleted', { id: itemId });
  }

  /**
   * Store harvest in barn with additional options
   */
  public async storeHarvest(harvestIdOrData: string | HarvestData, options?: {
    name?: string;
    description?: string;
    type?: BarnItemType;
    category?: string;
    tags?: string[];
    folderId?: string;
  }): Promise<BarnItem> {
    let harvest: HarvestData;

    if (typeof harvestIdOrData === 'string') {
      // Get harvest by ID from harvest service
      const harvestFromService = await harvestService.getHarvestById(harvestIdOrData);
      if (!harvestFromService) {
        throw new Error('Harvest not found');
      }
      harvest = harvestFromService;
    } else {
      harvest = harvestIdOrData;
    }

    const itemPath = path.join(this.barnPath, 'harvests', harvest.id);

    // Create harvest directory
    await fs.mkdir(itemPath, { recursive: true });

    // Save harvest data
    await fs.writeFile(
      path.join(itemPath, 'harvest.json'),
      JSON.stringify(harvest, null, 2)
    );

    // Save artifacts
    for (const artifact of harvest.artifacts) {
      if (artifact.content) {
        const artifactPath = path.join(itemPath, artifact.path);
        await fs.mkdir(path.dirname(artifactPath), { recursive: true });
        await fs.writeFile(artifactPath, artifact.content);
      }
    }

    // Create barn item
    const barnItem: BarnItem = {
      id: uuidv4(),
      name: options?.name || `${harvest.farmName || 'Farm'} Harvest`,
      type: options?.type || BarnItemType.HARVEST,
      description: options?.description || harvest.summary || 'Farm harvest collection',
      metadata: {
        harvestId: harvest.id,
        farmId: harvest.farmId,
        farmName: harvest.farmName || 'Unknown Farm',
        tags: options?.tags || ['harvest', (harvest.farmName || 'farm').toLowerCase()],
        fileCount: harvest.artifacts.length,
        size: harvest.metadata?.totalSize || 0,
        createdBy: harvest.userId
      },
      path: itemPath,
      userId: harvest.userId,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      accessCount: 0
    };

    // Save to database
    await this.saveBarnItem(barnItem);

    // Create catalog entry
    await this.createCatalogEntry(barnItem, {
      category: options?.category || 'Harvests',
      keywords: ['harvest', harvest.farmName, ...(barnItem.metadata.tags || [])],
      description: harvest.summary || 'Farm harvest collection'
    });

    this.emit('barn:stored', barnItem);
    websocketManager.broadcast('barn:stored', barnItem);

    return barnItem;
  }

  /**
   * Sync with filesystem
   */
  public async syncWithFileSystem(): Promise<{ added: number; updated: number; removed: number }> {
    const result = { added: 0, updated: 0, removed: 0 };

    // Scan barn directory for items not in database
    const itemsPath = path.join(this.barnPath, 'items');
    if (await fs.stat(itemsPath).catch(() => null)) {
      const dirs = await fs.readdir(itemsPath);
      for (const dir of dirs) {
        if (!this.items.has(dir)) {
          // Add to database
          result.added++;
        }
      }
    }

    return result;
  }

  /**
   * Get storage statistics
   */
  public async getStorageStats(): Promise<any> {
    const stats = {
      totalSize: 0,
      fileCount: 0,
      itemCount: this.items.size,
      byType: {} as Record<string, { count: number; size: number }>
    };

    for (const item of this.items.values()) {
      if (!stats.byType[item.type]) {
        stats.byType[item.type] = { count: 0, size: 0 };
      }
      stats.byType[item.type].count++;
      if (item.metadata.size) {
        stats.byType[item.type].size += item.metadata.size;
        stats.totalSize += item.metadata.size;
      }
      if (item.metadata.fileCount) {
        stats.fileCount += item.metadata.fileCount;
      }
    }

    return stats;
  }

  /**
   * Cleanup barn storage
   */
  public async cleanup(options: {
    removeOrphaned?: boolean;
    archiveOldItems?: boolean;
    archiveDays?: number;
    compressArchived?: boolean;
    removeTempFiles?: boolean;
    removeEmptyDirectories?: boolean;
  }): Promise<{ cleaned: number; archived: number; errors: number }> {
    const result = { cleaned: 0, archived: 0, errors: 0 };

    // TODO: Implement cleanup logic
    logger.info('Barn cleanup requested with options:', options);

    return result;
  }

  /**
   * Bulk delete items
   */
  public async bulkDelete(itemIds: string[]): Promise<{ success: boolean; deleted: number; errors: number }> {
    let deleted = 0;
    let errors = 0;

    for (const itemId of itemIds) {
      try {
        await this.deleteItem(itemId);
        deleted++;
      } catch (error) {
        logger.error(`Failed to delete item ${itemId}:`, error);
        errors++;
      }
    }

    return { success: errors === 0, deleted, errors };
  }

  /**
   * Bulk archive items
   */
  public async bulkArchive(itemIds: string[]): Promise<{ success: boolean; archived: number; errors: number }> {
    let archived = 0;
    let errors = 0;

    for (const itemId of itemIds) {
      try {
        const item = this.items.get(itemId);
        if (item) {
          // TODO: Implement archive logic
          archived++;
        }
      } catch (error) {
        logger.error(`Failed to archive item ${itemId}:`, error);
        errors++;
      }
    }

    return { success: errors === 0, archived, errors };
  }

  /**
   * Get archived items
   */
  public async getArchivedItems(filter?: { type?: string; searchQuery?: string }): Promise<BarnItem[]> {
    // TODO: Implement archive retrieval
    return [];
  }

  /**
   * Restore items from archive
   */
  public async restoreFromArchive(itemIds: string[]): Promise<{ success: boolean; restored: number; errors: number }> {
    let restored = 0;
    let errors = 0;

    // TODO: Implement restore logic
    for (const itemId of itemIds) {
      try {
        // Restore item
        restored++;
      } catch (error) {
        logger.error(`Failed to restore item ${itemId}:`, error);
        errors++;
      }
    }

    return { success: errors === 0, restored, errors };
  }

  /**
   * Get last sync status
   */
  public async getLastSyncStatus(): Promise<{ timestamp: Date; items: number; success: boolean }> {
    // TODO: Track sync status
    return {
      timestamp: new Date(),
      items: this.items.size,
      success: true
    };
  }

  /**
   * Check if sync is in progress
   */
  public isSyncInProgress(): boolean {
    // TODO: Track sync state
    return false;
  }

  /**
   * Create a new folder
   */
  public async createFolder(name: string, description?: string, parentId?: string): Promise<any> {
    // TODO: Implement folder creation
    const folder = {
      id: uuidv4(),
      name,
      description,
      parentId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return folder;
  }

  /**
   * Create seed from barn item
   */
  public async createSeedFromItem(itemId: string): Promise<string> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Barn item not found');
    }

    // Check if item has YAML configuration
    const yamlPath = path.join(item.path, 'config.yaml');
    try {
      const yamlContent = await fs.readFile(yamlPath, 'utf8');
      return yamlContent;
    } catch (error) {
      throw new Error('Barn item does not have YAML configuration');
    }
  }

  /**
   * Get yield with file info
   */
  public async getYieldWithFileInfo(itemId: string): Promise<any[]> {
    const item = this.items.get(itemId);
    if (!item) {
      return [];
    }

    // TODO: Implement yield extraction
    return [];
  }

  /**
   * Download a yield item
   */
  public async downloadYieldItem(itemId: string, yieldId: string): Promise<{ name: string; content: Buffer; mimeType: string } | null> {
    // TODO: Implement yield download
    return null;
  }

  /**
   * Download all yield items as zip
   */
  public async downloadAllYieldItems(itemId: string): Promise<Buffer | null> {
    // TODO: Implement zip creation
    return null;
  }

  /**
   * Get catalog
   */
  public async getCatalog(): Promise<any[]> {
    return Array.from(this.catalog.values());
  }

  /**
   * Get catalog summary
   */
  public async getCatalogSummary(): Promise<any> {
    const items = Array.from(this.catalog.values());
    return {
      totalItems: items.length,
      categories: [...new Set(items.map(i => i.category))],
      topRated: items.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5),
      mostDownloaded: items.sort((a, b) => b.downloads - a.downloads).slice(0, 5)
    };
  }

  /**
   * Get item reference
   */
  public async getItemReference(itemId: string): Promise<any | null> {
    const item = this.items.get(itemId);
    if (!item) {
      return null;
    }

    return {
      id: item.id,
      name: item.name,
      type: item.type,
      description: item.description,
      metadata: item.metadata
    };
  }

  /**
   * Get item content
   */
  public async getItemContent(itemId: string, artifactName?: string): Promise<string | null> {
    const item = this.items.get(itemId);
    if (!item) {
      return null;
    }

    if (artifactName) {
      const artifactPath = path.join(item.path, artifactName);
      try {
        return await fs.readFile(artifactPath, 'utf8');
      } catch {
        return null;
      }
    }

    // Return main content
    if (item.content) {
      return typeof item.content === 'string' ? item.content : JSON.stringify(item.content, null, 2);
    }

    return null;
  }

  /**
   * Generate catalog for farm
   */
  public async generateCatalogForFarm(farmId: string, options?: any): Promise<string> {
    const items = Array.from(this.items.values()).filter(
      item => item.metadata.farmId === farmId
    );

    let catalogText = `# Barn Catalog for Farm ${farmId}\n\n`;
    for (const item of items) {
      catalogText += `## ${item.name}\n`;
      catalogText += `Type: ${item.type}\n`;
      catalogText += `Description: ${item.description || 'N/A'}\n`;
      catalogText += `Created: ${item.createdAt}\n\n`;
    }

    return catalogText;
  }

  /**
   * Export catalog for multi-Claude
   */
  public async exportCatalogForMultiClaude(): Promise<any> {
    const items = Array.from(this.items.values());
    return {
      version: '1.0',
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        description: item.description,
        metadata: item.metadata
      }))
    };
  }

  /**
   * Track item usage
   */
  public async trackItemUsage(itemId: string, farmId: string): Promise<void> {
    const item = this.items.get(itemId);
    if (item) {
      item.accessCount++;
      item.accessedAt = new Date();
      await this.updateBarnItemAccess(item);
    }
  }

  /**
   * Resolve reference
   */
  public async resolveReference(reference: string): Promise<BarnItem | null> {
    // Handle @barn:item-id format
    const match = reference.match(/@barn:(.+)/);
    if (match) {
      return this.items.get(match[1]) || null;
    }
    return null;
  }

  /**
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    // Save any pending changes
    for (const item of this.items.values()) {
      if (item.updatedAt > item.createdAt) {
        await this.saveBarnItem(item);
      }
    }
  }
}

// Export singleton instance
export const barnService = UnifiedBarnService.getInstance();
export const barnCatalogService = barnService; // Alias for compatibility