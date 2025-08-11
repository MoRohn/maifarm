import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../database/client';
import { websocketManager } from '../websocket/websocketManager';
import { harvestService } from './harvestService';
import { BarnItem, BarnFolder, BarnStats, BarnArtifact } from '../../src/types/barn';
import { Harvest } from '../../src/types/harvest';
import { pathConfig, getBarnItemPath } from '../config/paths';
import { fileManager } from './fileManagerService';
import { barnSyncService, StorageStats, SyncResult, CleanupOptions } from './barnSyncService';
import * as path from 'path';

export class BarnService {
  private items: Map<string, BarnItem> = new Map();
  private folders: Map<string, BarnFolder> = new Map();
  private syncInterval: NodeJS.Timer | null = null;

  constructor() {
    this.initializeDefaultFolders();
    this.startAutoSync();
  }

  private async initializeDefaultFolders() {
    // Ensure barn storage directories exist
    await fileManager.ensureDirectory(pathConfig.getPath('BARN_STORAGE'));
    await fileManager.ensureDirectory(pathConfig.getPath('BARN_ITEMS'));
    await fileManager.ensureDirectory(pathConfig.getPath('BARN_TEMPLATES'));
    
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

      // Create isolated barn item directory
      const barnItemId = randomUUID();
      const barnItemPath = getBarnItemPath(barnItemId);
      // Convert to relative path for fileManager
      const relativeBarnPath = path.join('barn', 'items', barnItemId);
      await fileManager.ensureDirectory(relativeBarnPath);
      
      // Copy harvest yield to isolated barn storage
      const barnArtifacts: BarnArtifact[] = [];
      
      // If no yield but has results (common for quick tasks), create an artifact from results
      if (harvest.yield.length === 0 && harvest.results.length > 0) {
        const artifactDir = path.join(relativeBarnPath, 'artifacts');
        await fileManager.ensureDirectory(artifactDir);
        
        const outputFileName = 'task-output.txt';
        const destPath = path.join(artifactDir, outputFileName);
        const content = harvest.results.map(r => 
          `=== ${r.agentName} (${new Date(r.timestamp).toISOString()}) ===\n${r.content}\n`
        ).join('\n');
        
        await fileManager.writeFile(destPath, content);
        
        barnArtifacts.push({
          id: randomUUID(),
          name: outputFileName,
          type: 'file',
          path: destPath,
          size: Buffer.byteLength(content),
          mimeType: 'text/plain',
          checksum: ''
        });
        
        logger.info(`Created artifact from ${harvest.results.length} results for barn storage`);
      }
      
      for (const artifact of harvest.yield) {
        const artifactDir = path.join(relativeBarnPath, 'artifacts');
        await fileManager.ensureDirectory(artifactDir);
        
        const destPath = path.join(artifactDir, artifact.name);
        
        // For quick tasks, the artifacts might be virtual (just metadata)
        // so we create them from the harvest results
        if (harvest.farmId.startsWith('quick-task-')) {
          // Create file from harvest results for quick tasks
          const content = harvest.results.map(r => r.content).join('\n\n---\n\n');
          await fileManager.writeFile(destPath, content);
          
          barnArtifacts.push({
            id: artifact.id,
            name: artifact.name || 'quick-task-output.txt',
            type: 'file',
            path: destPath,
            size: Buffer.byteLength(content),
            mimeType: artifact.mimeType || 'text/plain',
            checksum: artifact.checksum || ''
          });
        } else {
          // For regular harvests, first try to use artifact data if available
          let content = '';
          let actualSize = artifact.size;
          
          if (artifact.data) {
            // Use the data field directly if available
            if (typeof artifact.data === 'string') {
              content = artifact.data;
            } else {
              content = JSON.stringify(artifact.data, null, 2);
            }
            actualSize = Buffer.byteLength(content);
            
            await fileManager.writeFile(destPath, content);
            logger.info(`[BarnService] Created artifact from data: ${artifact.name} (${actualSize} bytes)`);
          } else {
            // Try to copy from source path
            const sourcePath = artifact.location || artifact.path || 
                              path.join(pathConfig.getHarvestPath(harvestId), 'yield', artifact.name);
            
            try {
              if (await fileManager.exists(sourcePath)) {
                await fileManager.copyFile(sourcePath, destPath);
                logger.info(`[BarnService] Copied artifact from file: ${artifact.name}`);
              } else {
                // Create placeholder with metadata
                content = `Artifact: ${artifact.name}\nType: ${artifact.type}\nDescription: ${artifact.description || 'No description'}\nOriginal Size: ${artifact.size} bytes\nSource Location: ${artifact.location || 'Not specified'}\n\nNote: Original file content was not available during harvest storage.`;
                await fileManager.writeFile(destPath, content);
                actualSize = Buffer.byteLength(content);
                logger.warn(`[BarnService] Created placeholder for missing artifact: ${artifact.name}`);
              }
            } catch (error) {
              logger.warn(`Could not copy artifact ${artifact.name} from ${sourcePath}:`, error);
              // Create placeholder file with error info
              content = `Artifact: ${artifact.name}\nType: ${artifact.type}\nDescription: ${artifact.description || 'No description'}\nError: ${error}\n\nFailed to retrieve original content.`;
              await fileManager.writeFile(destPath, content);
              actualSize = Buffer.byteLength(content);
            }
          }
          
          barnArtifacts.push({
            id: artifact.id,
            name: artifact.name,
            type: artifact.type as BarnArtifact['type'],
            path: destPath,
            size: actualSize,
            mimeType: artifact.mimeType,
            checksum: artifact.checksum
          });
        }
      }

      // Create barn item metadata
      const barnItem: BarnItem = {
        id: barnItemId,
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

      // Store item metadata
      this.items.set(barnItem.id, barnItem);
      
      // Save barn item metadata to isolated storage
      const metadataPath = path.join(relativeBarnPath, 'metadata.json');
      await fileManager.writeFile(metadataPath, JSON.stringify(barnItem, null, 2));

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
    // Look for YAML configuration in harvest results or yield
    const yamlArtifact = harvest.yield.find(a => 
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
    const mostUsedHarvests = sortedByUse.slice(0, 5).map(item => ({
      id: item.id,
      name: item.name,
      useCount: item.useCount
    }));

    const recentHarvests = [...items]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    return {
      totalHarvests: items.length,  // Changed from totalItems
      totalItems: items.length,     // Keep for backward compatibility
      itemsByType,
      totalStorage,
      mostUsedHarvests,  // Changed from mostUsedItems
      mostUsedItems: mostUsedHarvests,  // Keep for backward compatibility
      recentHarvests,    // Changed from recentItems
      recentItems: recentHarvests  // Keep for backward compatibility
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

  /**
   * Get yield items with file information for a barn item
   */
  async getYieldWithFileInfo(itemId: string): Promise<BarnArtifact[]> {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error('Barn item not found');
    }

    // Return both artifacts and yield (they're the same, yield is an alias)
    const yieldItems = item.yield || item.artifacts || [];
    
    // Add additional file info if needed
    const yieldWithInfo = await Promise.all(
      yieldItems.map(async (artifact) => {
        try {
          // Check if file exists and get actual size
          const stats = await fileManager.getStats(artifact.path);
          return {
            ...artifact,
            exists: !!stats,
            actualSize: stats?.size || artifact.size,
            location: artifact.location || artifact.path // Ensure location is set
          };
        } catch {
          return {
            ...artifact,
            exists: false,
            actualSize: artifact.size,
            location: artifact.location || artifact.path
          };
        }
      })
    );

    return yieldWithInfo;
  }

  /**
   * Download a specific yield item
   */
  async downloadYieldItem(itemId: string, yieldId: string): Promise<{
    name: string;
    content: Buffer;
    mimeType: string;
  } | null> {
    const item = this.items.get(itemId);
    if (!item) {
      return null;
    }

    const yieldItem = (item.yield || item.artifacts || []).find(
      artifact => artifact.id === yieldId
    );
    
    if (!yieldItem) {
      return null;
    }

    try {
      // Read the file content
      const content = await fileManager.readFile(yieldItem.path);
      
      return {
        name: yieldItem.name,
        content: Buffer.isBuffer(content) ? content : Buffer.from(content),
        mimeType: yieldItem.mimeType || 'application/octet-stream'
      };
    } catch (error) {
      logger.error(`Failed to read yield item ${yieldId}:`, error);
      
      // If file doesn't exist, try to reconstruct from harvest
      const harvest = await harvestService.findById(item.harvestId);
      if (harvest && harvest.results.length > 0) {
        const content = harvest.results.map(r => r.content).join('\n\n---\n\n');
        return {
          name: yieldItem.name,
          content: Buffer.from(content),
          mimeType: 'text/plain'
        };
      }
      
      return null;
    }
  }

  /**
   * Download all yield items as a zip file
   */
  async downloadAllYieldItems(itemId: string): Promise<Buffer | null> {
    const item = this.items.get(itemId);
    if (!item) {
      return null;
    }

    const yieldItems = item.yield || item.artifacts || [];
    if (yieldItems.length === 0) {
      return null;
    }

    try {
      // Import archiver dynamically
      const archiver = await import('archiver');
      const { default: createArchive } = archiver;
      const archive = createArchive('zip', { zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      // Collect zip data
      archive.on('data', (chunk) => chunks.push(chunk));

      // Add each yield item to the zip
      for (const yieldItem of yieldItems) {
        try {
          const content = await fileManager.readFile(yieldItem.path);
          archive.append(content, { name: yieldItem.name });
        } catch (error) {
          logger.warn(`Could not add ${yieldItem.name} to zip:`, error);
          // Add a placeholder if file is missing
          archive.append(`File not found: ${yieldItem.name}`, { name: `${yieldItem.name}.error.txt` });
        }
      }

      // Add metadata file
      const metadata = {
        barnItemId: item.id,
        harvestId: item.harvestId,
        farmName: item.farmName,
        createdAt: item.createdAt,
        yieldCount: yieldItems.length,
        items: yieldItems.map(y => ({
          name: y.name,
          type: y.type,
          size: y.size,
          mimeType: y.mimeType
        }))
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

      await archive.finalize();

      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('Failed to create zip archive:', error);
      return null;
    }
  }

  /**
   * Start automatic synchronization
   */
  private startAutoSync(): void {
    // Auto-sync every 5 minutes
    this.syncInterval = setInterval(async () => {
      try {
        await this.syncWithFileSystem();
      } catch (error) {
        logger.error('[BarnService] Auto-sync failed:', error);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Sync with filesystem
   */
  async syncWithFileSystem(): Promise<SyncResult> {
    return barnSyncService.syncWithFileSystem();
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    return barnSyncService.getStorageStats();
  }

  /**
   * Clean up barn storage
   */
  async cleanup(options: CleanupOptions = {}): Promise<any> {
    return barnSyncService.cleanup(options);
  }

  /**
   * Bulk delete items
   */
  async bulkDelete(itemIds: string[]): Promise<{ success: boolean; deleted: number; errors: string[] }> {
    const result = await barnSyncService.bulkDelete(itemIds);
    
    // Remove from in-memory cache
    for (const itemId of itemIds) {
      if (result.errors.find(e => e.includes(itemId))) continue;
      this.items.delete(itemId);
    }
    
    // Emit WebSocket event
    websocketManager.broadcast('barn:bulk-deleted', {
      itemIds: itemIds.filter(id => !result.errors.find(e => e.includes(id))),
      deleted: result.deleted
    });
    
    return result;
  }

  /**
   * Bulk archive items
   */
  async bulkArchive(itemIds: string[]): Promise<{ success: boolean; archived: number; errors: string[] }> {
    const result = await barnSyncService.bulkArchive(itemIds);
    
    // Update in-memory cache
    for (const itemId of itemIds) {
      if (result.errors.find(e => e.includes(itemId))) continue;
      const item = this.items.get(itemId);
      if (item) {
        item.status = 'archived';
      }
    }
    
    // Emit WebSocket event
    websocketManager.broadcast('barn:bulk-archived', {
      itemIds: itemIds.filter(id => !result.errors.find(e => e.includes(id))),
      archived: result.archived
    });
    
    return result;
  }

  /**
   * Restore items from archive
   */
  async restoreFromArchive(itemIds: string[]): Promise<{ success: boolean; restored: number; errors: string[] }> {
    const result = await barnSyncService.restoreFromArchive(itemIds);
    
    // Update in-memory cache
    for (const itemId of itemIds) {
      if (result.errors.find(e => e.includes(itemId))) continue;
      const item = this.items.get(itemId);
      if (item) {
        item.status = 'saved';
      }
    }
    
    // Emit WebSocket event
    websocketManager.broadcast('barn:bulk-restored', {
      itemIds: itemIds.filter(id => !result.errors.find(e => e.includes(id))),
      restored: result.restored
    });
    
    return result;
  }

  /**
   * Get archived items
   */
  async getArchivedItems(filter?: any): Promise<BarnItem[]> {
    try {
      let query = 'SELECT * FROM barn_items WHERE archived_at IS NOT NULL';
      const params: any[] = [];
      
      if (filter?.type) {
        params.push(filter.type);
        query += ` AND type = $${params.length}`;
      }
      
      if (filter?.searchQuery) {
        params.push(`%${filter.searchQuery}%`);
        query += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
      }
      
      query += ' ORDER BY archived_at DESC';
      
      const result = await db.query(query, params);
      return result.rows.map(row => this.dbRowToBarnItem(row));
    } catch (error) {
      logger.error('[BarnService] Failed to get archived items:', error);
      return [];
    }
  }

  /**
   * Get last sync status
   */
  async getLastSyncStatus(): Promise<SyncResult | null> {
    return barnSyncService.getLastSyncStatus();
  }

  /**
   * Check if sync is in progress
   */
  isSyncInProgress(): boolean {
    return barnSyncService.isSyncInProgress();
  }

  /**
   * Convert database row to BarnItem
   */
  private dbRowToBarnItem(row: any): BarnItem {
    return {
      id: row.id,
      harvestId: row.harvest_id,
      farmId: row.farm_id,
      farmName: row.farm_name,
      name: row.name,
      description: row.description,
      type: row.type,
      category: row.category,
      tags: row.tags || [],
      artifacts: row.artifacts || [],
      yield: row.yield || [],
      config: row.config || {},
      metadata: row.metadata || {},
      version: row.version || '1.0.0',
      status: row.archived_at ? 'archived' : row.status || 'saved',
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      useCount: row.use_count || 0
    };
  }
}

export const barnService = new BarnService();