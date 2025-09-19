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
   * Store a harvest in the barn
   */
  public async storeHarvest(harvest: HarvestData): Promise<BarnItem> {
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
      name: `${harvest.farmName} Harvest`,
      type: BarnItemType.HARVEST,
      description: harvest.summary,
      metadata: {
        harvestId: harvest.id,
        farmId: harvest.farmId,
        farmName: harvest.farmName,
        tags: ['harvest', harvest.farmName.toLowerCase()],
        fileCount: harvest.artifacts.length,
        size: harvest.metadata.totalSize,
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
      category: 'Harvests',
      keywords: ['harvest', harvest.farmName, ...(barnItem.metadata.tags || [])],
      description: harvest.summary || 'Farm harvest collection'
    });

    this.emit('barn:stored', barnItem);
    websocketManager.broadcast('barn:stored', barnItem);

    return barnItem;
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
  private async handleHarvestCompleted(harvest: HarvestData): Promise<void> {
    try {
      await this.storeHarvest(harvest);
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