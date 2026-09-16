/**
 * Unified Barn Service
 * Consolidates all barn storage, cataloging, and retrieval functionality
 * Replaces: barnService, barnCatalogService, barn-related APIs
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import archiver from 'archiver';
import { db, redis } from '../../database/connection';
import { unifiedWebSocketManager } from '../../websocket/UnifiedWebSocketManager';
import { logger, LogCategory } from '../../utils/logger';
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
  category?: string; // FIX: Added category field to match database schema
  harvestId?: string; // FIX: Added top-level harvestId for database foreign key
  metadata: {
    harvestId?: string;
    farmId?: string;
    farmName?: string;
    tags?: string[];
    size?: number;
    fileCount?: number;
    yieldCount?: number;
    createdBy?: string;
    version?: string;
    parentBarnItemId?: string;
    yieldItemId?: string;
    yieldType?: string;
    mimeType?: string;
    qualityScore?: number;
    source?: string;
    agentId?: string;
    agentName?: string;
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

  // MEMORY FIX: Cache eviction configuration
  private readonly MAX_CACHE_SIZE = 500; // Maximum items to keep in memory
  private readonly CACHE_EVICTION_BATCH = 100; // Remove this many items when evicting
  private itemAccessOrder: string[] = []; // Track access order for LRU eviction

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

  /**
   * MEMORY FIX: Track item access for LRU cache eviction
   */
  private trackItemAccess(itemId: string): void {
    // Remove from current position
    const idx = this.itemAccessOrder.indexOf(itemId);
    if (idx !== -1) {
      this.itemAccessOrder.splice(idx, 1);
    }
    // Add to end (most recently used)
    this.itemAccessOrder.push(itemId);
  }

  /**
   * MEMORY FIX: Evict least recently used items when cache exceeds limit
   */
  private evictOldItemsIfNeeded(): void {
    if (this.items.size <= this.MAX_CACHE_SIZE) {
      return;
    }

    const toEvict = Math.min(this.CACHE_EVICTION_BATCH, this.items.size - this.MAX_CACHE_SIZE);
    const evictedIds = this.itemAccessOrder.splice(0, toEvict);

    for (const itemId of evictedIds) {
      this.items.delete(itemId);
      // Note: We don't evict from catalog as it's smaller and needed for search
    }

    logger.debug(LogCategory.BARN, `Evicted ${evictedIds.length} items from barn cache. Cache size: ${this.items.size}`);
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
      // PERFORMANCE FIX: Added LIMIT to prevent unbounded loading on startup
      // Older items can be loaded on-demand when accessed
      const result = await db.query(`
        SELECT * FROM barn_items
        WHERE archived_at IS NULL
        ORDER BY created_at DESC
        LIMIT 500
      `);

      for (const row of result.rows) {
        const item = this.rowToBarnItem(row);
        this.items.set(item.id, item);
      }

      // Load catalog entries (limited for performance)
      const catalogResult = await db.query(`
        SELECT * FROM barn_catalog
        ORDER BY downloads DESC, rating DESC
        LIMIT 200
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
    // CRITICAL FIX: Database column is file_path, not path
    // Self-healing: Compute path from harvestId if file_path is null (legacy records)
    let itemPath = row.file_path || row.path || '';
    if (!itemPath && row.type === 'harvest' && row.metadata?.harvestId) {
      // Reconstruct path for legacy harvest items
      itemPath = path.join(this.barnPath, 'harvests', row.metadata.harvestId);
      logger.debug(LogCategory.BARN, `Reconstructed path for harvest ${row.id}: ${itemPath}`);
    } else if (!itemPath && row.id) {
      // Default path for other items
      itemPath = path.join(this.barnPath, 'items', row.id);
    }

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description,
      metadata: row.metadata || {},
      path: itemPath,
      content: row.content || row.data,
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
    unifiedWebSocketManager.broadcast('barn:created', barnItem);

    return barnItem;
  }

  /**
   * Get barn item by ID
   */
  public async getBarnItem(itemId: string, userId?: string): Promise<BarnItem | null> {
    let item = this.items.get(itemId);

    // MEMORY FIX: Try to load from database if not in cache
    if (!item) {
      item = await this.loadItemFromDb(itemId);
      if (!item) {
        return null;
      }
    }

    // Check access permissions
    if (!item.isPublic && item.userId !== userId) {
      return null;
    }

    // Update access tracking
    item.accessedAt = new Date();
    item.accessCount++;
    await this.updateBarnItemAccess(item);

    // MEMORY FIX: Track access for LRU eviction
    this.trackItemAccess(itemId);

    return item;
  }

  /**
   * MEMORY FIX: Load a single item from database if not in cache
   */
  private async loadItemFromDb(itemId: string): Promise<BarnItem | null> {
    try {
      const result = await db.query(
        'SELECT * FROM barn_items WHERE id = $1 AND archived_at IS NULL',
        [itemId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const item = this.rowToBarnItem(result.rows[0]);
      this.items.set(item.id, item);
      this.trackItemAccess(item.id);
      this.evictOldItemsIfNeeded();

      return item;
    } catch (error) {
      logger.error(LogCategory.BARN, `Failed to load barn item ${itemId} from database:`, error);
      return null;
    }
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

    // Soft delete in database using archived_at column
    await db.query(`
      UPDATE barn_items SET archived_at = $1 WHERE id = $2
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
    unifiedWebSocketManager.broadcast('barn:deleted', { id: itemId });

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
    // FIX: Get harvestId from top-level or metadata to ensure proper foreign key linkage
    const harvestId = item.harvestId || item.metadata?.harvestId || null;

    await db.query(`
      INSERT INTO barn_items (id, user_id, harvest_id, name, description, category, type, data, metadata, file_path, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        name = $4, description = $5, category = $6, type = $7, data = $8, metadata = $9,
        file_path = $10, updated_at = $12
    `, [
        item.id,
        item.userId,
        harvestId,
        item.name,
        item.description,
        item.category || 'general',
        item.type,
        JSON.stringify(item.content || {}),
        JSON.stringify(item.metadata || {}),
        item.path,
        item.createdAt,
        item.updatedAt
    ]);

    this.items.set(item.id, item);

    // MEMORY FIX: Track access and evict old items if cache is too large
    this.trackItemAccess(item.id);
    this.evictOldItemsIfNeeded();
  }

  /**
   * Update barn item access
   * TODO: Add accessed_at and access_count columns to barn_items table
   */
  private async updateBarnItemAccess(item: BarnItem): Promise<void> {
    // Skip for now - columns don't exist in database
    // await db.query(`
    //   UPDATE barn_items
    //   SET accessed_at = $1, access_count = $2
    //   WHERE id = $3
    // `, [item.accessedAt, item.accessCount, item.id]);
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
    let item = this.items.get(id);

    // MEMORY FIX: Try to load from database if not in cache
    if (!item) {
      item = await this.loadItemFromDb(id);
    }

    if (item) {
      this.trackItemAccess(id);
    }

    return item || null;
  }

  /**
   * Get barn statistics
   * MEDIUM FIX: Return fields in format expected by frontend (aliases for compatibility)
   */
  public async getStats(): Promise<any> {
    const items = Array.from(this.items.values());
    const byType: Record<string, number> = {};
    let totalSize = 0;
    let publicItems = 0;
    let privateItems = 0;

    // Calculate statistics
    for (const item of items) {
      // Count by type
      byType[item.type] = (byType[item.type] || 0) + 1;

      // Count public/private
      if (item.isPublic) {
        publicItems++;
      } else {
        privateItems++;
      }

      // Track size
      if (item.metadata.size) {
        totalSize += item.metadata.size;
      }
    }

    // Sort items by createdAt descending for recents
    const sortedByDate = [...items].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Sort items by accessCount descending for most used
    const sortedByUsage = [...items].sort((a, b) =>
      (b.accessCount || 0) - (a.accessCount || 0)
    );

    // Get top recent items (up to 10)
    const recentItems = sortedByDate.slice(0, 10);

    // Get top used items (up to 10)
    const mostUsedItems = sortedByUsage.slice(0, 10).map(item => ({
      id: item.id,
      name: item.name,
      useCount: item.accessCount || 0
    }));

    // MEDIUM FIX: Return all field aliases for frontend compatibility
    return {
      // Core stats
      totalItems: items.length,
      totalHarvests: items.length, // Alias for frontend compatibility
      byType,
      itemsByType: byType, // Alias
      harvestsByType: byType, // Alias
      totalSize,
      totalStorage: totalSize, // Alias
      publicItems,
      privateItems,

      // Single item references (legacy)
      mostRecent: recentItems[0] || null,
      mostAccessed: sortedByUsage[0] || null,

      // Array references (expected by BarnPage)
      recentItems,
      recentHarvests: recentItems, // Alias for frontend compatibility
      mostUsedItems,
      mostUsedHarvests: mostUsedItems // Alias for frontend compatibility
    };
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
    let item = this.items.get(itemId);

    // MEMORY FIX: Try to load from database if not in cache
    if (!item) {
      item = await this.loadItemFromDb(itemId);
    }

    if (!item) {
      throw new Error('Barn item not found');
    }

    // Apply updates
    Object.assign(item, updates);
    item.updatedAt = new Date();

    // Save to database (this will also track access)
    await this.saveBarnItem(item);

    this.emit('barn:updated', item);
    unifiedWebSocketManager.broadcast('barn:updated', item);

    return item;
  }

  /**
   * Use a barn item (track usage)
   */
  public async useItem(itemId: string): Promise<BarnItem> {
    let item = this.items.get(itemId);

    // MEMORY FIX: Try to load from database if not in cache
    if (!item) {
      item = await this.loadItemFromDb(itemId);
    }

    if (!item) {
      throw new Error('Barn item not found');
    }

    item.accessCount++;
    item.accessedAt = new Date();

    await this.updateBarnItemAccess(item);

    // MEMORY FIX: Track access for LRU eviction
    this.trackItemAccess(itemId);

    this.emit('barn:used', item);
    return item;
  }

  /**
   * Delete barn item
   */
  public async deleteItem(itemId: string, userId?: string): Promise<void> {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Check if item exists and get its current state
      const existing = await client.query(
        'SELECT id, archived_at, user_id FROM barn_items WHERE id = $1',
        [itemId]
      );

      if (existing.rows.length === 0) {
        throw new Error('Barn item not found');
      }

      const item = existing.rows[0];

      // Check if item is already archived
      if (item.archived_at) {
        throw new Error('Barn item already deleted');
      }

      // Validate ownership if userId provided
      if (userId && item.user_id !== userId) {
        throw new Error('Unauthorized: Item does not belong to user');
      }

      // Perform soft delete
      const result = await client.query(
        'UPDATE barn_items SET archived_at = $1, updated_at = $2 WHERE id = $3 AND archived_at IS NULL RETURNING id',
        [new Date(), new Date(), itemId]
      );

      if (result.rows.length === 0) {
        // This shouldn't happen as we checked above, but defensive programming
        throw new Error('Failed to delete barn item: concurrent modification detected');
      }

      // Commit transaction
      await client.query('COMMIT');

      // Remove from memory cache after successful database update
      this.items.delete(itemId);

      // Emit events
      this.emit('barn:deleted', { id: itemId });
      unifiedWebSocketManager.broadcast('barn:deleted', { id: itemId });

      logger.info(LogCategory.HARVEST, `Barn item deleted successfully: ${itemId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(LogCategory.HARVEST, `Failed to delete barn item ${itemId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store harvest in barn with additional options
   * ENHANCEMENT: Now also extracts and stores individual yield items as separate barn items
   * ATOMICITY FIX: Uses temp directory pattern with transactional DB operations
   */
  public async storeHarvest(harvestIdOrData: string | HarvestData, options?: {
    name?: string;
    description?: string;
    type?: BarnItemType;
    category?: string;
    tags?: string[];
    folderId?: string;
    extractYieldItems?: boolean; // NEW: Extract individual yields (default: true)
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

    const finalPath = path.join(this.barnPath, 'harvests', harvest.id);
    const tempPath = path.join(this.barnPath, 'harvests', `.tmp_${harvest.id}_${Date.now()}`);

    // ATOMICITY FIX: Track what we've created for rollback
    let filesWritten = false;
    let movedToFinal = false;

    try {
      // ATOMICITY FIX: Write all files to temp directory first
      await fs.mkdir(tempPath, { recursive: true });

      // Save harvest data to temp
      await fs.writeFile(
        path.join(tempPath, 'harvest.json'),
        JSON.stringify(harvest, null, 2)
      );

      // Save all artifacts to temp - fail fast if any write fails
      for (const artifact of harvest.artifacts) {
        if (artifact.content) {
          const artifactPath = path.join(tempPath, artifact.path);
          await fs.mkdir(path.dirname(artifactPath), { recursive: true });
          await fs.writeFile(artifactPath, artifact.content);
        }
      }

      filesWritten = true;
      logger.info(LogCategory.BARN, `All ${harvest.artifacts.length} artifacts written to temp location`);

      // ATOMICITY FIX: Move temp to final location atomically
      // First remove existing if any (idempotent re-storage)
      try {
        await fs.rm(finalPath, { recursive: true, force: true });
      } catch {
        // Ignore - directory may not exist
      }

      await fs.rename(tempPath, finalPath);
      movedToFinal = true;
      logger.info(LogCategory.BARN, `Harvest ${harvest.id} moved to final location atomically`);

      // Create main harvest barn item
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
          yieldCount: harvest.yield?.length || 0,
          size: harvest.metadata?.totalSize || 0,
          createdBy: harvest.userId
        },
        path: finalPath,
        userId: harvest.userId,
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        accessCount: 0
      };

      // ATOMICITY FIX: Use database transaction for DB operations
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        // Save to database within transaction
        await this.saveBarnItemWithClient(barnItem, client);

        // Create catalog entry within transaction
        await this.createCatalogEntryWithClient(barnItem, {
          category: options?.category || 'Harvests',
          keywords: ['harvest', harvest.farmName, ...(barnItem.metadata.tags || [])],
          description: harvest.summary || 'Farm harvest collection'
        }, client);

        await client.query('COMMIT');
        logger.info(LogCategory.BARN, `Database transaction committed for harvest ${harvest.id}`);

        // Post-transaction operations (non-critical, can fail without rollback)
        await this.completeHarvestStorage(harvest, barnItem, options);

        return barnItem;
      } catch (dbError) {
        await client.query('ROLLBACK');
        logger.error(LogCategory.BARN, `Database transaction failed, rolling back: ${dbError}`);

        // ATOMICITY FIX: Clean up files since DB failed
        if (movedToFinal) {
          try {
            await fs.rm(finalPath, { recursive: true, force: true });
            logger.info(LogCategory.BARN, `Cleaned up files after DB rollback for harvest ${harvest.id}`);
          } catch (cleanupError) {
            logger.error(LogCategory.BARN, `Failed to cleanup files after DB rollback: ${cleanupError}`);
          }
        }
        throw dbError;
      } finally {
        client.release();
      }
    } catch (error) {
      // ATOMICITY FIX: Clean up temp directory on any failure
      if (!movedToFinal && filesWritten) {
        try {
          await fs.rm(tempPath, { recursive: true, force: true });
          logger.info(LogCategory.BARN, `Cleaned up temp directory after failure`);
        } catch (cleanupError) {
          logger.error(LogCategory.BARN, `Failed to cleanup temp directory: ${cleanupError}`);
        }
      }
      throw error;
    }
  }

  /**
   * ATOMICITY FIX: Save barn item with provided client for transaction support
   * CRITICAL FIX: Use correct column name file_path (not path) to match schema
   */
  private async saveBarnItemWithClient(item: BarnItem, client: any): Promise<void> {
    await client.query(
      `INSERT INTO barn_items (id, name, type, description, category, harvest_id, metadata, file_path, data, user_id, is_public, created_at, updated_at, access_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         metadata = EXCLUDED.metadata,
         file_path = EXCLUDED.file_path,
         data = EXCLUDED.data,
         updated_at = EXCLUDED.updated_at`,
      [
        item.id,
        item.name,
        item.type,
        item.description || null,
        item.category || null,
        item.harvestId || item.metadata?.harvestId || null,
        JSON.stringify(item.metadata),
        item.path,
        item.content ? JSON.stringify(item.content) : null,
        item.userId,
        item.isPublic,
        item.createdAt,
        item.updatedAt,
        item.accessCount
      ]
    );
  }

  /**
   * ATOMICITY FIX: Create catalog entry with provided client for transaction support
   */
  private async createCatalogEntryWithClient(item: BarnItem, catalogData: {
    category?: string;
    keywords?: (string | undefined)[];
    description?: string;
  }, client: any): Promise<void> {
    const catalogId = uuidv4();
    const keywords = (catalogData.keywords || []).filter((k): k is string => typeof k === 'string' && k.length > 0);

    await client.query(
      `INSERT INTO barn_catalog (id, barn_item_id, category, keywords, description, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (barn_item_id) DO UPDATE SET
         category = EXCLUDED.category,
         keywords = EXCLUDED.keywords,
         description = EXCLUDED.description`,
      [
        catalogId,
        item.id,
        catalogData.category || 'Uncategorized',
        keywords,
        catalogData.description || item.description || ''
      ]
    );
  }

  /**
   * Continue post-transaction operations (yield extraction, events)
   * Called after successful transaction commit
   */
  private async completeHarvestStorage(harvest: HarvestData, barnItem: BarnItem, options?: {
    extractYieldItems?: boolean;
    category?: string;
  }): Promise<void> {

    // ENHANCEMENT: Extract and store individual yield items as separate barn items
    const extractYield = options?.extractYieldItems !== false; // Default to true
    if (extractYield && harvest.yield && harvest.yield.length > 0) {
      logger.info(`Extracting ${harvest.yield.length} yield items from harvest ${harvest.id} into individual barn items`);

      const yieldItemsCreated = await this.extractYieldItemsToBarn(harvest, barnItem);

      logger.info(`Successfully created ${yieldItemsCreated} individual barn items from harvest yields`);

      // Broadcast yield extraction complete
      unifiedWebSocketManager.broadcast('barn:yield_extracted', {
        harvestId: harvest.id,
        parentBarnItemId: barnItem.id,
        yieldCount: yieldItemsCreated,
        farmId: harvest.farmId
      });
    }

    this.emit('barn:stored', barnItem);
    unifiedWebSocketManager.broadcast('barn:stored', barnItem);
  }

  /**
   * Extract individual yield items from harvest and create separate barn items
   * ENHANCEMENT: Makes each yield item individually discoverable and manageable
   */
  private async extractYieldItemsToBarn(harvest: HarvestData, parentBarnItem: BarnItem): Promise<number> {
    if (!harvest.yield || harvest.yield.length === 0) {
      return 0;
    }

    let createdCount = 0;

    for (const yieldItem of harvest.yield) {
      try {
        // Determine barn item type based on yield type
        const barnType = this.mapYieldTypeToBarnType(yieldItem.type);

        // Create individual barn item for this yield
        const yieldBarnItem: BarnItem = {
          id: uuidv4(),
          name: yieldItem.name || 'Unnamed Yield',
          type: barnType,
          description: yieldItem.description || `Yield from ${harvest.farmName || 'farm'}`,
          metadata: {
            harvestId: harvest.id,
            farmId: harvest.farmId,
            farmName: harvest.farmName || 'Unknown Farm',
            parentBarnItemId: parentBarnItem.id, // Link to parent harvest
            yieldItemId: yieldItem.id,
            yieldType: yieldItem.type,
            mimeType: yieldItem.mimeType,
            size: yieldItem.size,
            qualityScore: yieldItem.qualityScore || 0.5,
            source: yieldItem.metadata?.source || 'unknown',
            agentId: yieldItem.metadata?.agentId,
            agentName: yieldItem.metadata?.agentName,
            createdBy: harvest.userId,
            tags: this.generateYieldTags(yieldItem, harvest)
          },
          path: yieldItem.metadata?.path || `yield-${yieldItem.id}`,
          content: yieldItem.content || yieldItem.metadata?.content,
          userId: harvest.userId,
          isPublic: false,
          createdAt: yieldItem.createdAt || new Date(),
          updatedAt: new Date(),
          accessCount: 0
        };

        // Save to database
        await this.saveBarnItem(yieldBarnItem);

        // Create catalog entry with appropriate categorization
        await this.createCatalogEntry(yieldBarnItem, {
          category: this.categorizeYieldItem(yieldItem),
          subcategory: yieldItem.type,
          keywords: this.generateYieldKeywords(yieldItem, harvest),
          description: yieldItem.description || yieldBarnItem.description
        });

        createdCount++;

        logger.debug(`Created barn item ${yieldBarnItem.id} for yield "${yieldItem.name}"`);
      } catch (error) {
        logger.error(`Failed to create barn item for yield ${yieldItem.id}:`, error);
      }
    }

    return createdCount;
  }

  /**
   * Map yield type to barn item type
   */
  private mapYieldTypeToBarnType(yieldType: string): BarnItemType {
    switch (yieldType) {
      case 'code':
        return BarnItemType.ARTIFACT;
      case 'documentation':
      case 'report':
        return BarnItemType.RESOURCE;
      case 'data':
      case 'model':
        return BarnItemType.ARTIFACT;
      case 'file':
      case 'farm-output':
      default:
        return BarnItemType.RESOURCE;
    }
  }

  /**
   * Categorize yield item for barn catalog
   */
  private categorizeYieldItem(yieldItem: any): string {
    const type = yieldItem.type || 'file';

    const categoryMap: Record<string, string> = {
      'code': 'Code & Scripts',
      'documentation': 'Documentation',
      'data': 'Data & Datasets',
      'report': 'Reports & Insights',
      'model': 'Models & Algorithms',
      'farm-output': 'Farm Outputs',
      'file': 'Files'
    };

    return categoryMap[type] || 'Uncategorized';
  }

  /**
   * Generate descriptive tags for yield item
   */
  private generateYieldTags(yieldItem: any, harvest: HarvestData): string[] {
    const tags: string[] = ['yield'];

    // Add type-based tags
    if (yieldItem.type) {
      tags.push(yieldItem.type);
    }

    // Add farm name tag
    if (harvest.farmName) {
      tags.push(harvest.farmName.toLowerCase().replace(/\s+/g, '-'));
    }

    // Add source tag
    if (yieldItem.metadata?.source) {
      tags.push(`source:${yieldItem.metadata.source}`);
    }

    // Add quality tag
    const quality = yieldItem.qualityScore || 0.5;
    if (quality >= 0.8) {
      tags.push('high-quality');
    } else if (quality >= 0.6) {
      tags.push('good-quality');
    }

    // Add agent tag if available
    if (yieldItem.metadata?.agentName) {
      tags.push(`agent:${yieldItem.metadata.agentName.toLowerCase().replace(/\s+/g, '-')}`);
    }

    return tags;
  }

  /**
   * Generate search keywords for yield item
   */
  private generateYieldKeywords(yieldItem: any, harvest: HarvestData): string[] {
    const keywords: string[] = [];

    // Add name tokens
    if (yieldItem.name) {
      keywords.push(...yieldItem.name.toLowerCase().split(/\s+/));
    }

    // Add description tokens
    if (yieldItem.description) {
      keywords.push(...yieldItem.description.toLowerCase().split(/\s+/).slice(0, 10));
    }

    // Add farm name
    if (harvest.farmName) {
      keywords.push(harvest.farmName.toLowerCase());
    }

    // Add type
    if (yieldItem.type) {
      keywords.push(yieldItem.type);
    }

    // Add mime type keyword
    if (yieldItem.mimeType) {
      const mimeKeyword = yieldItem.mimeType.split('/')[1];
      if (mimeKeyword) {
        keywords.push(mimeKeyword);
      }
    }

    // Deduplicate and filter
    return [...new Set(keywords.filter(k => k && k.length > 2))];
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

    logger.info(LogCategory.HARVEST, `Bulk delete initiated for ${itemIds.length} barn items`);

    for (const itemId of itemIds) {
      try {
        await this.deleteItem(itemId);
        deleted++;
      } catch (error) {
        logger.error(LogCategory.HARVEST, `Failed to delete item ${itemId}:`, error);
        errors++;
      }
    }

    logger.info(LogCategory.HARVEST, `Bulk delete completed: ${deleted} deleted, ${errors} errors`);
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
          // Archive by setting archived_at timestamp
          await db.query(`
            UPDATE barn_items SET archived_at = $1 WHERE id = $2
          `, [new Date(), itemId]);

          // Remove from memory
          this.items.delete(itemId);
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
    try {
      let query = 'SELECT * FROM barn_items WHERE archived_at IS NOT NULL';
      const params: any[] = [];
      let paramIndex = 1;

      if (filter?.type) {
        query += ` AND type = $${paramIndex++}`;
        params.push(filter.type);
      }

      if (filter?.searchQuery) {
        query += ` AND (name ILIKE $${paramIndex++} OR description ILIKE $${paramIndex})`;
        params.push(`%${filter.searchQuery}%`, `%${filter.searchQuery}%`);
        paramIndex++;
      }

      query += ' ORDER BY archived_at DESC';

      const result = await db.query(query, params);
      return result.rows.map((row: any) => this.rowToBarnItem(row));
    } catch (error) {
      logger.error('Failed to get archived items:', error);
      return [];
    }
  }

  /**
   * Restore items from archive
   */
  public async restoreFromArchive(itemIds: string[]): Promise<{ success: boolean; restored: number; errors: number }> {
    let restored = 0;
    let errors = 0;

    for (const itemId of itemIds) {
      try {
        // Restore by clearing archived_at timestamp
        const result = await db.query(`
          UPDATE barn_items SET archived_at = NULL WHERE id = $1 RETURNING *
        `, [itemId]);

        if (result.rows.length > 0) {
          // Add back to memory
          const item = this.rowToBarnItem(result.rows[0]);
          this.items.set(item.id, item);
          restored++;
        }
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
   * Get yield with file info - retrieves all yield items that belong to a parent barn item
   */
  public async getYieldWithFileInfo(itemId: string): Promise<any[]> {
    const item = this.items.get(itemId);
    if (!item) {
      return [];
    }

    // Find all barn items that have this item as their parent (yield items extracted from harvest)
    const yieldItems: any[] = [];
    for (const [id, barnItem] of this.items) {
      if (barnItem.metadata?.parentBarnItemId === itemId) {
        yieldItems.push({
          id: barnItem.metadata?.yieldItemId || id,
          barnItemId: id,
          name: barnItem.name,
          type: barnItem.metadata?.yieldType || barnItem.type,
          size: barnItem.metadata?.size || 0,
          mimeType: barnItem.metadata?.mimeType || 'application/octet-stream',
          createdAt: barnItem.createdAt,
          qualityScore: barnItem.metadata?.qualityScore,
          agentName: barnItem.metadata?.agentName,
          description: barnItem.description
        });
      }
    }

    return yieldItems;
  }

  /**
   * Download a yield item - retrieves the content of a specific yield item
   */
  public async downloadYieldItem(itemId: string, yieldId: string): Promise<{ name: string; content: Buffer; mimeType: string } | null> {
    // First try to find the yield item directly by its yieldItemId
    for (const [id, barnItem] of this.items) {
      if (barnItem.metadata?.parentBarnItemId === itemId &&
          (barnItem.metadata?.yieldItemId === yieldId || id === yieldId)) {
        // Get content from barn item
        let content: Buffer;
        if (barnItem.content) {
          content = typeof barnItem.content === 'string'
            ? Buffer.from(barnItem.content, 'utf-8')
            : Buffer.from(barnItem.content);
        } else if (barnItem.path) {
          // Try to read from file path
          try {
            const fs = await import('fs/promises');
            content = await fs.readFile(barnItem.path);
          } catch {
            // If file doesn't exist, return descriptive content
            content = Buffer.from(`Yield item: ${barnItem.name}\n\n${barnItem.description || 'No content available'}`, 'utf-8');
          }
        } else {
          content = Buffer.from(`Yield item: ${barnItem.name}\n\n${barnItem.description || 'No content available'}`, 'utf-8');
        }

        return {
          name: barnItem.name || 'yield-item',
          content,
          mimeType: barnItem.metadata?.mimeType || 'application/octet-stream'
        };
      }
    }

    return null;
  }

  /**
   * Download all yield items as zip - creates a zip archive of all yield items for a barn item
   */
  public async downloadAllYieldItems(itemId: string): Promise<Buffer | null> {
    const yieldItems = await this.getYieldWithFileInfo(itemId);
    if (yieldItems.length === 0) {
      return null;
    }

    return new Promise(async (resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', (err: Error) => {
        logger.error(LogCategory.BARN, 'ZIP archive creation failed', { error: err.message, itemId });
        reject(err);
      });

      for (const yieldItem of yieldItems) {
        const downloadData = await this.downloadYieldItem(itemId, yieldItem.id);
        if (downloadData) {
          archive.append(downloadData.content, { name: downloadData.name });
        }
      }

      archive.finalize();
    });
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
    let item = this.items.get(itemId);

    // MEMORY FIX: Try to load from database if not in cache
    if (!item) {
      item = await this.loadItemFromDb(itemId);
    }

    if (!item) {
      return null;
    }

    // MEMORY FIX: Track access for LRU eviction
    this.trackItemAccess(itemId);

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
    let item = this.items.get(itemId);

    // MEMORY FIX: Try to load from database if not in cache
    if (!item) {
      item = await this.loadItemFromDb(itemId);
    }

    if (!item) {
      return null;
    }

    // MEMORY FIX: Track access for LRU eviction
    this.trackItemAccess(itemId);

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
    let item = this.items.get(itemId);

    // MEMORY FIX: Try to load from database if not in cache
    if (!item) {
      item = await this.loadItemFromDb(itemId);
    }

    if (item) {
      item.accessCount++;
      item.accessedAt = new Date();
      await this.updateBarnItemAccess(item);

      // MEMORY FIX: Track access for LRU eviction
      this.trackItemAccess(itemId);
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