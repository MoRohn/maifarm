import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../database/client';
import { websocketManager } from '../websocket/websocketManager';
import { harvestService } from './harvestService';
import { BarnItem, BarnFolder, BarnStats, BarnArtifact } from '../../src/types/barn';
import { Harvest } from '../../src/types/harvest';

export class BarnService {
  private items: Map<string, BarnItem> = new Map();
  private folders: Map<string, BarnFolder> = new Map();

  constructor() {
    this.initializeDefaultFolders();
  }

  private initializeDefaultFolders() {
    const defaultFolders: BarnFolder[] = [
      {
        id: 'apps',
        name: 'Applications',
        description: 'Completed applications and tools',
        harvestIds: [],
        subFolderIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'scripts',
        name: 'Scripts',
        description: 'Utility scripts and automation',
        harvestIds: [],
        subFolderIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'workflows',
        name: 'Workflows',
        description: 'Reusable workflow templates',
        harvestIds: [],
        subFolderIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'templates',
        name: 'Templates',
        description: 'Farm configuration templates',
        harvestIds: [],
        subFolderIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultFolders.forEach(folder => {
      this.folders.set(folder.id, folder);
    });

    logger.info(`Initialized ${defaultFolders.length} default barn folders`);
  }

  async storeHarvest(harvestId: string, options?: {
    name?: string;
    description?: string;
    type?: BarnItem['type'];
    category?: string;
    tags?: string[];
    folderId?: string;
  }): Promise<BarnItem> {
    try {
      // Get harvest data
      const harvest = await harvestService.findById(harvestId);
      if (!harvest) {
        throw new Error('Harvest not found');
      }

      if (harvest.status !== 'ready') {
        throw new Error('Harvest is not ready for storage');
      }

      // Convert harvest artifacts to barn artifacts
      const barnArtifacts: BarnArtifact[] = harvest.artifacts.map(artifact => ({
        id: artifact.id,
        name: artifact.name,
        type: artifact.type as BarnArtifact['type'],
        path: `/barn/${harvestId}/${artifact.name}`,
        size: artifact.size,
        mimeType: artifact.mimeType,
        checksum: artifact.checksum
      }));

      // Create barn item
      const barnItem: BarnItem = {
        id: randomUUID(),
        harvestId: harvest.id,
        farmId: harvest.farmId,
        farmName: harvest.farmName,
        name: options?.name || `${harvest.farmName} Output`,
        description: options?.description || harvest.summary.description,
        type: options?.type || 'other',
        category: options?.category || 'general',
        tags: options?.tags || harvest.tags,
        artifacts: barnArtifacts,
        config: {
          // Extract config from harvest if available
          yaml: this.extractYamlFromHarvest(harvest)
        },
        metadata: {
          agentCount: harvest.results.length,
          taskCount: harvest.summary.totalTasks,
          duration: harvest.summary.duration,
          successRate: harvest.quality.accuracy
        },
        version: '1.0.0',
        status: 'saved',
        createdBy: 'system', // TODO: Get from auth context
        createdAt: new Date(),
        updatedAt: new Date(),
        useCount: 0
      };

      // Store item
      this.items.set(barnItem.id, barnItem);

      // Add to folder if specified
      if (options?.folderId) {
        const folder = this.folders.get(options.folderId);
        if (folder) {
          folder.harvestIds.push(barnItem.id);
          folder.updatedAt = new Date();
        }
      }

      // Persist to database if available
      if (db) {
        try {
          await this.persistBarnItem(barnItem);
        } catch (dbError) {
          logger.warn('Failed to persist barn item to database:', dbError);
        }
      }

      // Emit WebSocket event
      websocketManager.broadcast('barn:item-stored', {
        itemId: barnItem.id,
        harvestId,
        name: barnItem.name,
        type: barnItem.type
      });

      logger.info(`Stored harvest ${harvestId} in barn as item ${barnItem.id}`);
      return barnItem;
    } catch (error) {
      logger.error('Failed to store harvest in barn:', error);
      throw error;
    }
  }

  private extractYamlFromHarvest(harvest: Harvest): string | undefined {
    // Look for YAML configuration in harvest results or artifacts
    const yamlArtifact = harvest.artifacts.find(a => 
      a.name.endsWith('.yaml') || a.name.endsWith('.yml')
    );
    
    if (yamlArtifact) {
      // In a real implementation, we'd read the file content
      return `# Configuration extracted from ${harvest.farmName}\n# Generated on ${new Date().toISOString()}`;
    }

    return undefined;
  }

  private async persistBarnItem(item: BarnItem): Promise<void> {
    await db.query(
      `INSERT INTO barn_items (id, harvest_id, farm_id, farm_name, name, description,
       type, category, tags, artifacts, config, metadata, version, status,
       created_by, created_at, updated_at, use_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        item.id, item.harvestId, item.farmId, item.farmName, item.name,
        item.description, item.type, item.category, item.tags,
        JSON.stringify(item.artifacts), JSON.stringify(item.config),
        JSON.stringify(item.metadata), item.version, item.status,
        item.createdBy, item.createdAt, item.updatedAt, item.useCount
      ]
    );
  }

  async findById(id: string): Promise<BarnItem | null> {
    return this.items.get(id) || null;
  }

  async findAll(filter?: {
    type?: BarnItem['type'];
    category?: string;
    tags?: string[];
    folderId?: string;
    searchQuery?: string;
  }): Promise<BarnItem[]> {
    let items = Array.from(this.items.values());

    if (filter) {
      if (filter.type) {
        items = items.filter(item => item.type === filter.type);
      }
      if (filter.category) {
        items = items.filter(item => item.category === filter.category);
      }
      if (filter.tags && filter.tags.length > 0) {
        items = items.filter(item =>
          filter.tags!.some(tag => item.tags.includes(tag))
        );
      }
      if (filter.folderId) {
        const folder = this.folders.get(filter.folderId);
        if (folder) {
          items = items.filter(item => folder.harvestIds.includes(item.id));
        }
      }
      if (filter.searchQuery) {
        const search = filter.searchQuery.toLowerCase();
        items = items.filter(item =>
          item.name.toLowerCase().includes(search) ||
          item.description.toLowerCase().includes(search) ||
          item.tags.some(tag => tag.toLowerCase().includes(search))
        );
      }
    }

    // Sort by creation date descending
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return items;
  }

  async useItem(id: string): Promise<BarnItem> {
    const item = this.items.get(id);
    if (!item) {
      throw new Error('Barn item not found');
    }

    item.useCount++;
    item.lastUsedAt = new Date();
    this.items.set(id, item);

    // Update in database if available
    if (db) {
      try {
        await db.query(
          `UPDATE barn_items SET use_count = use_count + 1, last_used_at = $2 WHERE id = $1`,
          [id, new Date()]
        );
      } catch (dbError) {
        logger.warn('Failed to update barn item usage in database:', dbError);
      }
    }

    // Emit usage event
    websocketManager.broadcast('barn:item-used', {
      itemId: id,
      name: item.name,
      useCount: item.useCount
    });

    return item;
  }

  async updateItem(id: string, updates: Partial<BarnItem>): Promise<BarnItem> {
    const item = this.items.get(id);
    if (!item) {
      throw new Error('Barn item not found');
    }

    const updatedItem: BarnItem = {
      ...item,
      ...updates,
      id: item.id, // Ensure ID doesn't change
      updatedAt: new Date()
    };

    this.items.set(id, updatedItem);

    // Update in database if available
    if (db) {
      try {
        await db.query(
          `UPDATE barn_items SET name = $2, description = $3, tags = $4, 
           status = $5, updated_at = $6 WHERE id = $1`,
          [
            id, updatedItem.name, updatedItem.description,
            updatedItem.tags, updatedItem.status, updatedItem.updatedAt
          ]
        );
      } catch (dbError) {
        logger.warn('Failed to update barn item in database:', dbError);
      }
    }

    return updatedItem;
  }

  async deleteItem(id: string): Promise<void> {
    const item = this.items.get(id);
    if (!item) {
      throw new Error('Barn item not found');
    }

    // Remove from folders
    this.folders.forEach(folder => {
      const index = folder.harvestIds.indexOf(id);
      if (index > -1) {
        folder.harvestIds.splice(index, 1);
        folder.updatedAt = new Date();
      }
    });

    this.items.delete(id);

    // Delete from database if available
    if (db) {
      try {
        await db.query('DELETE FROM barn_items WHERE id = $1', [id]);
      } catch (dbError) {
        logger.warn('Failed to delete barn item from database:', dbError);
      }
    }

    // Emit deletion event
    websocketManager.broadcast('barn:item-deleted', { itemId: id });

    logger.info(`Deleted barn item: ${id}`);
  }

  async createFolder(name: string, description?: string, parentId?: string): Promise<BarnFolder> {
    const folder: BarnFolder = {
      id: randomUUID(),
      name,
      description,
      parentId,
      harvestIds: [],
      subFolderIds: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (parentId) {
      const parent = this.folders.get(parentId);
      if (parent) {
        parent.subFolderIds.push(folder.id);
        parent.updatedAt = new Date();
      }
    }

    this.folders.set(folder.id, folder);
    logger.info(`Created barn folder: ${folder.id} - ${name}`);
    return folder;
  }

  async getFolders(): Promise<BarnFolder[]> {
    return Array.from(this.folders.values());
  }

  async getStats(): Promise<BarnStats> {
    const items = Array.from(this.items.values());
    
    const itemsByType: Record<string, number> = {};
    items.forEach(item => {
      itemsByType[item.type] = (itemsByType[item.type] || 0) + 1;
    });

    const totalStorage = items.reduce((sum, item) => 
      sum + item.artifacts.reduce((artifactSum, artifact) => 
        artifactSum + artifact.size, 0
      ), 0
    );

    const sortedByUse = [...items].sort((a, b) => b.useCount - a.useCount);
    const mostUsedItems = sortedByUse.slice(0, 5).map(item => ({
      id: item.id,
      name: item.name,
      useCount: item.useCount
    }));

    const recentItems = [...items]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    return {
      totalItems: items.length,
      itemsByType,
      totalStorage,
      mostUsedItems,
      recentItems
    };
  }

  async createSeedFromItem(itemId: string): Promise<string> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Barn item not found');
    }

    if (!item.config.yaml) {
      throw new Error('Barn item does not have YAML configuration');
    }

    // This would integrate with seedService to create a new seed
    // For now, return the YAML that would be used
    return item.config.yaml;
  }
}

export const barnService = new BarnService();