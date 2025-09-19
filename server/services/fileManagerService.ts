import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { pathConfig, PathConfig } from '../config/paths';
import { logger } from '../utils/logger';
import { websocketManager } from '../websocket/websocketManager';

/**
 * Storage statistics interface
 */
export interface StorageStats {
  totalSize: number;
  fileCount: number;
  directoryCount: number;
  oldestFile: Date | null;
  newestFile: Date | null;
  sizeByType: Record<string, number>;
}

/**
 * File operation result
 */
export interface FileOperationResult {
  success: boolean;
  path?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Directory structure options
 */
export interface DirectoryStructure {
  path: string;
  directories?: string[];
  files?: Array<{ name: string; content: string }>;
}

/**
 * Unified File Manager Service
 * Centralizes all file operations with safety, validation, and monitoring
 */
export class FileManagerService {
  private static instance: FileManagerService;
  private paths: PathConfig;
  private operationCount: number = 0;
  private storageQuota: number = 10 * 1024 * 1024 * 1024; // 10GB default
  private fileOperationQueue: Map<string, Promise<any>> = new Map();

  private constructor() {
    this.paths = pathConfig.getPaths();
    this.initializeService();
  }

  static getInstance(): FileManagerService {
    if (!FileManagerService.instance) {
      FileManagerService.instance = new FileManagerService();
    }
    return FileManagerService.instance;
  }

  private async initializeService(): Promise<void> {
    try {
      // Ensure base maibarn directory exists
      await this.ensureDirectory(this.paths.MAIBARN_ROOT);
      
      // Create essential subdirectories
      const essentialDirs = [
        this.paths.FARM_WORKSPACES,
        this.paths.FARM_WORKSPACES_ACTIVE,
        this.paths.FARM_WORKSPACES_ARCHIVED,
        this.paths.HARVEST_STORAGE,
        this.paths.HARVEST_STORAGE_ACTIVE,
        this.paths.HARVEST_STORAGE_COMPLETED,
        this.paths.BARN_STORAGE,
        this.paths.BARN_ITEMS,
        this.paths.BARN_TEMPLATES,
        this.paths.COORDINATION_DIR,
        this.paths.COORDINATION_FARMS,
        this.paths.COORDINATION_LOCKS,
        this.paths.TEMP_DIR,
        this.paths.LOGS_DIR
      ];

      for (const dir of essentialDirs) {
        await this.ensureDirectory(dir);
      }

      logger.info('[FileManager] Initialized with maibarn at:', this.paths.MAIBARN_ROOT);
    } catch (error) {
      logger.error('[FileManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Ensure a directory exists, create if not
   */
  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Validate path is within barn and safe
   */
  validatePath(inputPath: string): string {
    // Use pathConfig's validation
    return pathConfig.validatePath(inputPath);
  }

  /**
   * Check if path is safe (within barn)
   */
  isPathSafe(checkPath: string): boolean {
    return pathConfig.isPathSafe(checkPath);
  }

  /**
   * Read file with validation
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const safePath = this.validatePath(filePath);
    
    try {
      const content = await fs.readFile(safePath, encoding);
      this.trackOperation('read', safePath);
      return content;
    } catch (error) {
      logger.error(`[FileManager] Failed to read file ${safePath}:`, error);
      throw error;
    }
  }

  /**
   * Write file with validation and atomic operation
   */
  async writeFile(
    filePath: string, 
    content: string | Buffer, 
    options?: { encoding?: BufferEncoding; atomic?: boolean }
  ): Promise<FileOperationResult> {
    const safePath = this.validatePath(filePath);
    
    try {
      // Ensure directory exists
      const dir = path.dirname(safePath);
      await this.ensureDirectory(dir);

      if (options?.atomic) {
        // Atomic write using temp file and rename
        const tempPath = `${safePath}.tmp.${Date.now()}`;
        await fs.writeFile(tempPath, content, options?.encoding || 'utf-8');
        await fs.rename(tempPath, safePath);
      } else {
        await fs.writeFile(safePath, content, options?.encoding || 'utf-8');
      }

      this.trackOperation('write', safePath);
      
      return {
        success: true,
        path: safePath,
        metadata: {
          size: Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content),
          timestamp: new Date()
        }
      };
    } catch (error) {
      logger.error(`[FileManager] Failed to write file ${safePath}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Move file within barn
   */
  async moveFile(sourcePath: string, destPath: string): Promise<FileOperationResult> {
    const safeSource = this.validatePath(sourcePath);
    const safeDest = this.validatePath(destPath);

    try {
      // Ensure destination directory exists
      const destDir = path.dirname(safeDest);
      await this.ensureDirectory(destDir);

      await fs.rename(safeSource, safeDest);
      this.trackOperation('move', safeDest);

      return {
        success: true,
        path: safeDest
      };
    } catch (error) {
      logger.error(`[FileManager] Failed to move file from ${safeSource} to ${safeDest}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Copy file within barn
   */
  async copyFile(sourcePath: string, destPath: string): Promise<FileOperationResult> {
    const safeSource = this.validatePath(sourcePath);
    const safeDest = this.validatePath(destPath);

    try {
      // Ensure destination directory exists
      const destDir = path.dirname(safeDest);
      await this.ensureDirectory(destDir);

      await fs.copyFile(safeSource, safeDest);
      this.trackOperation('copy', safeDest);

      return {
        success: true,
        path: safeDest
      };
    } catch (error) {
      logger.error(`[FileManager] Failed to copy file from ${safeSource} to ${safeDest}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete file or directory
   */
  async delete(targetPath: string, recursive: boolean = false): Promise<FileOperationResult> {
    const safePath = this.validatePath(targetPath);

    try {
      const stats = await fs.stat(safePath);
      
      if (stats.isDirectory() && recursive) {
        await fs.rm(safePath, { recursive: true, force: true });
      } else if (stats.isFile()) {
        await fs.unlink(safePath);
      } else {
        await fs.rmdir(safePath);
      }

      this.trackOperation('delete', safePath);

      return {
        success: true,
        path: safePath
      };
    } catch (error) {
      logger.error(`[FileManager] Failed to delete ${safePath}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string): Promise<string[]> {
    const safePath = this.validatePath(dirPath);
    
    try {
      const items = await fs.readdir(safePath);
      return items;
    } catch (error) {
      logger.error(`[FileManager] Failed to list directory ${safePath}:`, error);
      return [];
    }
  }

  /**
   * Get file/directory stats
   */
  async getStats(targetPath: string): Promise<fsSync.Stats | null> {
    const safePath = this.validatePath(targetPath);
    
    try {
      return await fs.stat(safePath);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if path exists
   */
  async exists(targetPath: string): Promise<boolean> {
    const safePath = this.validatePath(targetPath);
    
    try {
      await fs.access(safePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists (alias for exists method for compatibility)
   */
  async fileExists(targetPath: string): Promise<boolean> {
    return this.exists(targetPath);
  }

  /**
   * Create directory structure
   */
  async createDirectoryStructure(structure: DirectoryStructure): Promise<void> {
    const basePath = this.validatePath(structure.path);
    await this.ensureDirectory(basePath);

    // Create subdirectories
    if (structure.directories) {
      for (const dir of structure.directories) {
        const dirPath = path.join(basePath, dir);
        await this.ensureDirectory(dirPath);
      }
    }

    // Create files
    if (structure.files) {
      for (const file of structure.files) {
        const filePath = path.join(basePath, file.name);
        await this.writeFile(filePath, file.content);
      }
    }
  }

  /**
   * Calculate directory size recursively
   */
  async getDirectorySize(dirPath: string): Promise<number> {
    const safePath = this.validatePath(dirPath);
    let totalSize = 0;

    async function calculateSize(currentPath: string): Promise<void> {
      const items = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item.name);
        
        if (item.isDirectory()) {
          await calculateSize(itemPath);
        } else {
          const stats = await fs.stat(itemPath);
          totalSize += stats.size;
        }
      }
    }

    await calculateSize(safePath);
    return totalSize;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(dirPath?: string): Promise<StorageStats> {
    const targetPath = dirPath ? this.validatePath(dirPath) : this.paths.MAIBARN_ROOT;
    
    const stats: StorageStats = {
      totalSize: 0,
      fileCount: 0,
      directoryCount: 0,
      oldestFile: null,
      newestFile: null,
      sizeByType: {}
    };

    async function gatherStats(currentPath: string): Promise<void> {
      const items = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item.name);
        
        if (item.isDirectory()) {
          stats.directoryCount++;
          await gatherStats(itemPath);
        } else {
          stats.fileCount++;
          const fileStats = await fs.stat(itemPath);
          stats.totalSize += fileStats.size;
          
          // Track oldest and newest
          if (!stats.oldestFile || fileStats.mtime < stats.oldestFile) {
            stats.oldestFile = fileStats.mtime;
          }
          if (!stats.newestFile || fileStats.mtime > stats.newestFile) {
            stats.newestFile = fileStats.mtime;
          }
          
          // Track size by extension
          const ext = path.extname(item.name) || 'no-extension';
          stats.sizeByType[ext] = (stats.sizeByType[ext] || 0) + fileStats.size;
        }
      }
    }

    await gatherStats(targetPath);
    return stats;
  }

  /**
   * Clean up old files
   */
  async cleanupOldFiles(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    let deletedCount = 0;

    // Clean temp directory
    const tempItems = await this.listDirectory(this.paths.TEMP_DIR);
    for (const item of tempItems) {
      const itemPath = path.join(this.paths.TEMP_DIR, item);
      const stats = await this.getStats(itemPath);
      
      if (stats && stats.mtime < cutoffDate) {
        await this.delete(itemPath, true);
        deletedCount++;
      }
    }

    // Clean archived workspaces
    const archivedItems = await this.listDirectory(this.paths.FARM_WORKSPACES_ARCHIVED);
    for (const item of archivedItems) {
      const itemPath = path.join(this.paths.FARM_WORKSPACES_ARCHIVED, item);
      const stats = await this.getStats(itemPath);
      
      if (stats && stats.mtime < cutoffDate) {
        await this.delete(itemPath, true);
        deletedCount++;
      }
    }

    logger.info(`[FileManager] Cleaned up ${deletedCount} old items`);
    return deletedCount;
  }

  /**
   * Check storage quota
   */
  async checkQuota(): Promise<{ used: number; available: number; percentage: number }> {
    const stats = await this.getStorageStats();
    const used = stats.totalSize;
    const available = this.storageQuota - used;
    const percentage = (used / this.storageQuota) * 100;

    if (percentage > 90) {
      logger.warn(`[FileManager] Storage usage at ${percentage.toFixed(2)}%`);
      websocketManager.broadcast('storage:warning', {
        used,
        available,
        percentage
      });
    }

    return { used, available, percentage };
  }

  /**
   * Generate file checksum
   */
  async generateChecksum(filePath: string): Promise<string> {
    const safePath = this.validatePath(filePath);
    
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fsSync.createReadStream(safePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Verify file integrity
   */
  async verifyIntegrity(filePath: string, expectedChecksum: string): Promise<boolean> {
    const actualChecksum = await this.generateChecksum(filePath);
    return actualChecksum === expectedChecksum;
  }

  /**
   * Archive directory
   */
  async archiveDirectory(dirPath: string, archiveName?: string): Promise<string> {
    const safePath = this.validatePath(dirPath);
    const name = archiveName || `archive_${Date.now()}.tar.gz`;
    const archivePath = path.join(this.paths.TEMP_DIR, name);
    
    // This would typically use a library like tar or archiver
    // For now, we'll just copy to archive location
    const destPath = path.join(this.paths.FARM_WORKSPACES_ARCHIVED, path.basename(safePath));
    await this.copyDirectory(safePath, destPath);
    
    return destPath;
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, dest: string): Promise<void> {
    await this.ensureDirectory(dest);
    
    const items = await fs.readdir(source, { withFileTypes: true });
    
    for (const item of items) {
      const sourcePath = path.join(source, item.name);
      const destPath = path.join(dest, item.name);
      
      if (item.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  /**
   * Track file operation for audit
   */
  private trackOperation(type: string, filePath: string): void {
    this.operationCount++;
    
    // Log to audit file
    const auditEntry = {
      timestamp: new Date(),
      type,
      path: filePath,
      operationNumber: this.operationCount
    };
    
    // Async write to audit log (fire and forget)
    const auditPath = path.join(this.paths.LOGS_DIR, 'audit.log');
    fs.appendFile(auditPath, JSON.stringify(auditEntry) + '\n').catch(err => {
      logger.error('[FileManager] Failed to write audit log:', err);
    });
  }

  /**
   * Migrate from legacy paths
   */
  async migrateFromLegacyPaths(): Promise<{
    migrated: number;
    failed: number;
    errors: string[];
  }> {
    const result = {
      migrated: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Migrate harvests
    try {
      if (fsSync.existsSync(this.paths.LEGACY_HARVESTS)) {
        const items = await fs.readdir(this.paths.LEGACY_HARVESTS);
        for (const item of items) {
          try {
            const source = path.join(this.paths.LEGACY_HARVESTS, item);
            const dest = path.join(this.paths.HARVEST_STORAGE_COMPLETED, item);
            await this.copyDirectory(source, dest);
            result.migrated++;
          } catch (err) {
            result.failed++;
            result.errors.push(`Failed to migrate harvest ${item}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      logger.error('[FileManager] Failed to migrate harvests:', err);
    }

    // Migrate coordination files
    try {
      if (fsSync.existsSync(this.paths.LEGACY_TMP_COORDINATION)) {
        const items = await fs.readdir(this.paths.LEGACY_TMP_COORDINATION);
        for (const item of items) {
          try {
            const source = path.join(this.paths.LEGACY_TMP_COORDINATION, item);
            const dest = path.join(this.paths.COORDINATION_DIR, item);
            await fs.copyFile(source, dest);
            result.migrated++;
          } catch (err) {
            result.failed++;
            result.errors.push(`Failed to migrate coordination file ${item}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      logger.error('[FileManager] Failed to migrate coordination files:', err);
    }

    logger.info(`[FileManager] Migration complete: ${result.migrated} migrated, ${result.failed} failed`);
    return result;
  }
}

// Export singleton instance
export const fileManager = FileManagerService.getInstance();

// Export convenient helper functions
export const ensureDirectory = (dir: string) => fileManager.ensureDirectory(dir);
export const readFile = (path: string, encoding?: BufferEncoding) => fileManager.readFile(path, encoding);
export const writeFile = (path: string, content: string | Buffer, options?: any) => 
  fileManager.writeFile(path, content, options);
export const deleteFile = (path: string) => fileManager.delete(path);
export const moveFile = (source: string, dest: string) => fileManager.moveFile(source, dest);
export const copyFile = (source: string, dest: string) => fileManager.copyFile(source, dest);
export const exists = (path: string) => fileManager.exists(path);
export const fileExists = (path: string) => fileManager.fileExists(path);
export const getStorageStats = (path?: string) => fileManager.getStorageStats(path);