import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { db } from '../database/connection';
import { fileManager } from './fileManagerService';
import { pathConfig } from '../config/paths';
import { BarnItem } from '../../src/types/barn';

export interface SyncResult {
  success: boolean;
  itemsScanned: number;
  itemsAdded: number;
  itemsUpdated: number;
  itemsArchived: number;
  orphanedCleaned: number;
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
}

export interface StorageStats {
  totalSize: number;
  totalFiles: number;
  totalDirectories: number;
  sizeByType: Record<string, number>;
  activeItems: number;
  archivedItems: number;
  orphanedItems: number;
  oldestItem: Date | null;
  newestItem: Date | null;
  largestItems: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
  }>;
}

export interface CleanupOptions {
  removeOrphaned?: boolean;
  archiveOldItems?: boolean;
  archiveDays?: number;
  compressArchived?: boolean;
  removeTempFiles?: boolean;
  removeEmptyDirectories?: boolean;
}

class BarnSyncService {
  private syncInProgress = false;
  private lastSyncResult: SyncResult | null = null;

  /**
   * Sync barn database with filesystem
   */
  async syncWithFileSystem(): Promise<SyncResult> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;
    const result: SyncResult = {
      success: false,
      itemsScanned: 0,
      itemsAdded: 0,
      itemsUpdated: 0,
      itemsArchived: 0,
      orphanedCleaned: 0,
      errors: [],
      startedAt: new Date()
    };

    try {
      logger.info('[BarnSync] Starting filesystem synchronization');

      // Scan barn items directory
      const barnItemsPath = pathConfig.getPath('BARN_ITEMS');
      const activeWorkspacesPath = pathConfig.getPath('FARM_WORKSPACES_ACTIVE');
      const archivedWorkspacesPath = pathConfig.getPath('FARM_WORKSPACES_ARCHIVED');

      // Get all items from filesystem
      const fsItems = await this.scanBarnDirectory(barnItemsPath);
      const workspaceItems = await this.scanWorkspacesDirectory(activeWorkspacesPath);
      const archivedItems = await this.scanWorkspacesDirectory(archivedWorkspacesPath);

      result.itemsScanned = fsItems.length + workspaceItems.length + archivedItems.length;

      // Get all items from database
      const dbResult = await db.query('SELECT id, farm_id, last_synced_at FROM barn_items');
      const dbItems = new Map(dbResult.rows.map(row => [row.id, row]));

      // Sync filesystem items to database
      for (const fsItem of fsItems) {
        const dbItem = dbItems.get(fsItem.id);
        
        if (!dbItem) {
          // New item found in filesystem
          await this.addItemToDatabase(fsItem);
          result.itemsAdded++;
        } else if (this.needsUpdate(fsItem, dbItem)) {
          // Item needs update
          await this.updateItemInDatabase(fsItem);
          result.itemsUpdated++;
        }
        
        // Remove from map to track orphaned DB entries
        dbItems.delete(fsItem.id);
      }

      // Handle workspace items
      for (const wsItem of workspaceItems) {
        const dbItem = dbItems.get(wsItem.id);
        if (!dbItem) {
          await this.addWorkspaceToDatabase(wsItem);
          result.itemsAdded++;
        }
        dbItems.delete(wsItem.id);
      }

      // Handle archived items
      for (const archItem of archivedItems) {
        const dbItem = dbItems.get(archItem.id);
        if (!dbItem || !dbItem.archived_at) {
          await this.markItemAsArchived(archItem.id);
          result.itemsArchived++;
        }
        dbItems.delete(archItem.id);
      }

      // Clean up orphaned database entries (exist in DB but not in filesystem)
      for (const [orphanedId, orphanedItem] of dbItems) {
        logger.warn(`[BarnSync] Orphaned DB entry found: ${orphanedId}`);
        await this.removeOrphanedDatabaseEntry(orphanedId);
        result.orphanedCleaned++;
      }

      // Log sync to database
      await this.logSyncResult(result);

      result.success = true;
      result.completedAt = new Date();
      logger.info(`[BarnSync] Sync completed: ${result.itemsAdded} added, ${result.itemsUpdated} updated, ${result.orphanedCleaned} cleaned`);

    } catch (error) {
      logger.error('[BarnSync] Sync failed:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.syncInProgress = false;
      this.lastSyncResult = result;
    }

    return result;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    const stats: StorageStats = {
      totalSize: 0,
      totalFiles: 0,
      totalDirectories: 0,
      sizeByType: {},
      activeItems: 0,
      archivedItems: 0,
      orphanedItems: 0,
      oldestItem: null,
      newestItem: null,
      largestItems: []
    };

    try {
      // Calculate storage for barn items
      const barnItemsPath = pathConfig.getPath('BARN_ITEMS');
      const barnStats = await this.calculateDirectoryStats(barnItemsPath);
      stats.totalSize += barnStats.size;
      stats.totalFiles += barnStats.files;
      stats.totalDirectories += barnStats.directories;

      // Calculate storage for active workspaces
      const activeWorkspacesPath = pathConfig.getPath('FARM_WORKSPACES_ACTIVE');
      const activeStats = await this.calculateDirectoryStats(activeWorkspacesPath);
      stats.totalSize += activeStats.size;
      stats.totalFiles += activeStats.files;
      stats.totalDirectories += activeStats.directories;
      stats.activeItems = activeStats.directories;

      // Calculate storage for archived workspaces
      const archivedWorkspacesPath = pathConfig.getPath('FARM_WORKSPACES_ARCHIVED');
      const archivedStats = await this.calculateDirectoryStats(archivedWorkspacesPath);
      stats.totalSize += archivedStats.size;
      stats.totalFiles += archivedStats.files;
      stats.totalDirectories += archivedStats.directories;
      stats.archivedItems = archivedStats.directories;

      // Get size by type from database
      const typeResult = await db.query(`
        SELECT type, SUM(file_size) as total_size 
        FROM barn_items 
        WHERE file_size IS NOT NULL 
        GROUP BY type
      `);
      
      for (const row of typeResult.rows) {
        stats.sizeByType[row.type] = parseInt(row.total_size) || 0;
      }

      // Get oldest and newest items
      const dateResult = await db.query(`
        SELECT MIN(created_at) as oldest, MAX(created_at) as newest 
        FROM barn_items
      `);
      
      if (dateResult.rows[0]) {
        stats.oldestItem = dateResult.rows[0].oldest;
        stats.newestItem = dateResult.rows[0].newest;
      }

      // Get largest items
      const largestResult = await db.query(`
        SELECT id, name, file_size, type 
        FROM barn_items 
        WHERE file_size IS NOT NULL 
        ORDER BY file_size DESC 
        LIMIT 10
      `);
      
      stats.largestItems = largestResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        size: parseInt(row.file_size) || 0,
        type: row.type
      }));

    } catch (error) {
      logger.error('[BarnSync] Failed to get storage stats:', error);
      throw error;
    }

    return stats;
  }

  /**
   * Clean up barn storage
   */
  async cleanup(options: CleanupOptions = {}): Promise<{
    success: boolean;
    orphanedRemoved: number;
    archivedCount: number;
    tempFilesRemoved: number;
    emptyDirsRemoved: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      orphanedRemoved: 0,
      archivedCount: 0,
      tempFilesRemoved: 0,
      emptyDirsRemoved: 0,
      errors: [] as string[]
    };

    try {
      logger.info('[BarnSync] Starting cleanup with options:', options);

      // Remove orphaned files
      if (options.removeOrphaned) {
        const orphaned = await this.findOrphanedFiles();
        for (const filePath of orphaned) {
          try {
            await fs.unlink(filePath);
            result.orphanedRemoved++;
          } catch (error) {
            result.errors.push(`Failed to remove ${filePath}: ${error}`);
          }
        }
      }

      // Archive old items
      if (options.archiveOldItems && options.archiveDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - options.archiveDays);
        
        const oldItemsResult = await db.query(
          'SELECT id, farm_id FROM barn_items WHERE created_at < $1 AND archived_at IS NULL',
          [cutoffDate]
        );
        
        for (const item of oldItemsResult.rows) {
          try {
            await this.archiveItem(item.id);
            result.archivedCount++;
          } catch (error) {
            result.errors.push(`Failed to archive ${item.id}: ${error}`);
          }
        }
      }

      // Remove temp files
      if (options.removeTempFiles) {
        const tempPath = pathConfig.getPath('TEMP_DIR');
        const tempFiles = await this.findTempFiles(tempPath);
        for (const filePath of tempFiles) {
          try {
            await fs.unlink(filePath);
            result.tempFilesRemoved++;
          } catch (error) {
            result.errors.push(`Failed to remove temp file ${filePath}: ${error}`);
          }
        }
      }

      // Remove empty directories
      if (options.removeEmptyDirectories) {
        const emptyDirs = await this.findEmptyDirectories(pathConfig.getPath('MAIBARN_ROOT'));
        for (const dirPath of emptyDirs) {
          try {
            await fs.rmdir(dirPath);
            result.emptyDirsRemoved++;
          } catch (error) {
            result.errors.push(`Failed to remove empty dir ${dirPath}: ${error}`);
          }
        }
      }

      result.success = result.errors.length === 0;
      logger.info('[BarnSync] Cleanup completed:', result);

    } catch (error) {
      logger.error('[BarnSync] Cleanup failed:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Bulk delete items
   */
  async bulkDelete(itemIds: string[]): Promise<{ success: boolean; deleted: number; errors: string[] }> {
    const result = { success: false, deleted: 0, errors: [] as string[] };
    
    try {
      for (const itemId of itemIds) {
        try {
          // Delete from filesystem
          const itemPath = path.join(pathConfig.getPath('BARN_ITEMS'), itemId);
          if (await fileManager.exists(itemPath)) {
            await fileManager.deleteDirectory(itemPath);
          }
          
          // Delete from database
          await db.query('DELETE FROM barn_items WHERE id = $1', [itemId]);
          result.deleted++;
        } catch (error) {
          result.errors.push(`Failed to delete ${itemId}: ${error}`);
        }
      }
      
      result.success = result.errors.length === 0;
    } catch (error) {
      logger.error('[BarnSync] Bulk delete failed:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
    
    return result;
  }

  /**
   * Bulk archive items
   */
  async bulkArchive(itemIds: string[]): Promise<{ success: boolean; archived: number; errors: string[] }> {
    const result = { success: false, archived: 0, errors: [] as string[] };
    
    try {
      for (const itemId of itemIds) {
        try {
          await this.archiveItem(itemId);
          result.archived++;
        } catch (error) {
          result.errors.push(`Failed to archive ${itemId}: ${error}`);
        }
      }
      
      result.success = result.errors.length === 0;
    } catch (error) {
      logger.error('[BarnSync] Bulk archive failed:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
    
    return result;
  }

  /**
   * Restore items from archive
   */
  async restoreFromArchive(itemIds: string[]): Promise<{ success: boolean; restored: number; errors: string[] }> {
    const result = { success: false, restored: 0, errors: [] as string[] };
    
    try {
      for (const itemId of itemIds) {
        try {
          // Move from archived to active
          const archivedPath = path.join(pathConfig.getPath('FARM_WORKSPACES_ARCHIVED'), itemId);
          const activePath = path.join(pathConfig.getPath('FARM_WORKSPACES_ACTIVE'), itemId);
          
          if (await fileManager.exists(archivedPath)) {
            await fileManager.moveDirectory(archivedPath, activePath);
          }
          
          // Update database
          await db.query(
            'UPDATE barn_items SET archived_at = NULL WHERE id = $1',
            [itemId]
          );
          
          result.restored++;
        } catch (error) {
          result.errors.push(`Failed to restore ${itemId}: ${error}`);
        }
      }
      
      result.success = result.errors.length === 0;
    } catch (error) {
      logger.error('[BarnSync] Restore failed:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
    
    return result;
  }

  // Private helper methods
  private async scanBarnDirectory(dirPath: string): Promise<any[]> {
    const items = [];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const itemPath = path.join(dirPath, entry.name);
          const stats = await fs.stat(itemPath);
          const metadata = await this.readItemMetadata(itemPath);
          
          items.push({
            id: entry.name,
            path: itemPath,
            size: await this.calculateDirectorySize(itemPath),
            modifiedAt: stats.mtime,
            createdAt: stats.birthtime,
            ...metadata
          });
        }
      }
    } catch (error) {
      logger.error('[BarnSync] Failed to scan directory:', dirPath, error);
    }
    
    return items;
  }

  private async scanWorkspacesDirectory(dirPath: string): Promise<any[]> {
    const items = [];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const itemPath = path.join(dirPath, entry.name);
          const stats = await fs.stat(itemPath);
          
          items.push({
            id: entry.name,
            path: itemPath,
            size: await this.calculateDirectorySize(itemPath),
            modifiedAt: stats.mtime,
            createdAt: stats.birthtime,
            type: 'workspace'
          });
        }
      }
    } catch (error) {
      logger.error('[BarnSync] Failed to scan workspaces:', dirPath, error);
    }
    
    return items;
  }

  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          totalSize += await this.calculateDirectorySize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      logger.error('[BarnSync] Failed to calculate size for:', dirPath, error);
    }
    
    return totalSize;
  }

  private async calculateDirectoryStats(dirPath: string): Promise<{ size: number; files: number; directories: number }> {
    const stats = { size: 0, files: 0, directories: 0 };
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          stats.directories++;
          const subStats = await this.calculateDirectoryStats(fullPath);
          stats.size += subStats.size;
          stats.files += subStats.files;
          stats.directories += subStats.directories;
        } else {
          stats.files++;
          const fileStats = await fs.stat(fullPath);
          stats.size += fileStats.size;
        }
      }
    } catch (error) {
      logger.error('[BarnSync] Failed to calculate stats for:', dirPath, error);
    }
    
    return stats;
  }

  private async readItemMetadata(itemPath: string): Promise<any> {
    try {
      const metadataPath = path.join(itemPath, 'metadata.json');
      if (await fileManager.exists(metadataPath)) {
        const content = await fs.readFile(metadataPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      logger.warn('[BarnSync] Failed to read metadata for:', itemPath, error);
    }
    return {};
  }

  private needsUpdate(fsItem: any, dbItem: any): boolean {
    // Check if filesystem item is newer than last sync
    if (!dbItem.last_synced_at) return true;
    
    const lastSync = new Date(dbItem.last_synced_at);
    const itemModified = new Date(fsItem.modifiedAt);
    
    return itemModified > lastSync;
  }

  private async addItemToDatabase(item: any): Promise<void> {
    try {
      await db.query(`
        INSERT INTO barn_items (
          id, farm_id, name, description, type, file_size, file_count, 
          created_at, updated_at, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        item.id,
        item.farmId || item.farm_id,
        item.name || path.basename(item.path),
        item.description || '',
        item.type || 'other',
        item.size,
        item.fileCount || 1,
        item.createdAt,
        item.modifiedAt,
        new Date()
      ]);
    } catch (error) {
      logger.error('[BarnSync] Failed to add item to database:', item.id, error);
      throw error;
    }
  }

  private async addWorkspaceToDatabase(item: any): Promise<void> {
    try {
      await db.query(`
        INSERT INTO barn_items (
          id, farm_id, name, type, file_size, created_at, updated_at, last_synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          file_size = $5,
          updated_at = $7,
          last_synced_at = $8
      `, [
        item.id,
        item.id, // workspace ID is same as farm ID
        `Workspace ${item.id}`,
        'workspace',
        item.size,
        item.createdAt,
        item.modifiedAt,
        new Date()
      ]);
    } catch (error) {
      logger.error('[BarnSync] Failed to add workspace to database:', item.id, error);
      throw error;
    }
  }

  private async updateItemInDatabase(item: any): Promise<void> {
    try {
      await db.query(`
        UPDATE barn_items SET
          file_size = $2,
          updated_at = $3,
          last_synced_at = $4
        WHERE id = $1
      `, [
        item.id,
        item.size,
        item.modifiedAt,
        new Date()
      ]);
    } catch (error) {
      logger.error('[BarnSync] Failed to update item in database:', item.id, error);
      throw error;
    }
  }

  private async markItemAsArchived(itemId: string): Promise<void> {
    try {
      await db.query(
        'UPDATE barn_items SET archived_at = $1 WHERE id = $2',
        [new Date(), itemId]
      );
    } catch (error) {
      logger.error('[BarnSync] Failed to mark item as archived:', itemId, error);
      throw error;
    }
  }

  private async removeOrphanedDatabaseEntry(itemId: string): Promise<void> {
    try {
      await db.query('DELETE FROM barn_items WHERE id = $1', [itemId]);
    } catch (error) {
      logger.error('[BarnSync] Failed to remove orphaned entry:', itemId, error);
      throw error;
    }
  }

  private async archiveItem(itemId: string): Promise<void> {
    // Move from active to archived
    const activePath = path.join(pathConfig.getPath('FARM_WORKSPACES_ACTIVE'), itemId);
    const archivedPath = path.join(pathConfig.getPath('FARM_WORKSPACES_ARCHIVED'), itemId);
    
    if (await fileManager.exists(activePath)) {
      await fileManager.moveDirectory(activePath, archivedPath);
    }
    
    // Update database
    await db.query(
      'UPDATE barn_items SET archived_at = $1 WHERE id = $2',
      [new Date(), itemId]
    );
  }

  private async findOrphanedFiles(): Promise<string[]> {
    const orphaned: string[] = [];
    
    // Scan barn items directory
    const barnItemsPath = pathConfig.getPath('BARN_ITEMS');
    const entries = await fs.readdir(barnItemsPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check if exists in database
        const result = await db.query(
          'SELECT id FROM barn_items WHERE id = $1',
          [entry.name]
        );
        
        if (result.rows.length === 0) {
          orphaned.push(path.join(barnItemsPath, entry.name));
        }
      }
    }
    
    return orphaned;
  }

  private async findTempFiles(tempPath: string): Promise<string[]> {
    const tempFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(tempPath, { withFileTypes: true });
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours old
      
      for (const entry of entries) {
        const fullPath = path.join(tempPath, entry.name);
        const stats = await fs.stat(fullPath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          tempFiles.push(fullPath);
        }
      }
    } catch (error) {
      logger.error('[BarnSync] Failed to find temp files:', error);
    }
    
    return tempFiles;
  }

  private async findEmptyDirectories(rootPath: string): Promise<string[]> {
    const emptyDirs: string[] = [];
    
    const checkDirectory = async (dirPath: string): Promise<boolean> => {
      try {
        const entries = await fs.readdir(dirPath);
        
        if (entries.length === 0) {
          emptyDirs.push(dirPath);
          return true;
        }
        
        let allEmpty = true;
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry);
          const stats = await fs.stat(fullPath);
          
          if (stats.isDirectory()) {
            const isEmpty = await checkDirectory(fullPath);
            if (!isEmpty) allEmpty = false;
          } else {
            allEmpty = false;
          }
        }
        
        if (allEmpty && dirPath !== rootPath) {
          emptyDirs.push(dirPath);
        }
        
        return allEmpty;
      } catch (error) {
        logger.error('[BarnSync] Failed to check directory:', dirPath, error);
        return false;
      }
    };
    
    await checkDirectory(rootPath);
    return emptyDirs;
  }

  private async logSyncResult(result: SyncResult): Promise<void> {
    try {
      await db.query(`
        INSERT INTO barn_sync_log (
          id, started_at, completed_at, items_synced, items_added, 
          items_updated, orphaned_cleaned, errors, status
        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        result.startedAt,
        result.completedAt || null,
        result.itemsScanned,
        result.itemsAdded,
        result.itemsUpdated,
        result.orphanedCleaned,
        result.errors,
        result.success ? 'completed' : 'failed'
      ]);
    } catch (error) {
      logger.error('[BarnSync] Failed to log sync result:', error);
    }
  }

  /**
   * Get last sync status
   */
  async getLastSyncStatus(): Promise<SyncResult | null> {
    return this.lastSyncResult;
  }

  /**
   * Check if sync is in progress
   */
  isSyncInProgress(): boolean {
    return this.syncInProgress;
  }
}

export const barnSyncService = new BarnSyncService();