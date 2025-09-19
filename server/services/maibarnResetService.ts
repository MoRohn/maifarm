import { promises as fs } from 'fs';
import * as path from 'path';
import { pathConfig } from '../config/paths.js';
import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';
import { orchestratorService } from './OrchestratorService.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ResetResult {
  success: boolean;
  message: string;
  deletedItems?: {
    folders: string[];
    files: string[];
  };
  databaseCleanup?: {
    farmsDeleted: number;
    agentsDeleted: number;
    harvestsDeleted: number;
    tasksDeleted: number;
    sessionsKilled: number;
  };
  errors?: string[];
}

class MaiBarnResetService {
  private readonly preservedFolders = [
    'barn',
    'config', 
    'coordination',
    'harvests',
    'logs',
    'temp',
    'terminals',
    'workspaces'
  ];

  private readonly preservedFiles = [
    '.gitignore',
    'README.md'
  ];

  /**
   * Clean up all non-active farms from the database
   */
  async cleanupDatabase(includeAll: boolean = false): Promise<{
    farmsDeleted: number;
    agentsDeleted: number;
    harvestsDeleted: number;
    tasksDeleted: number;
    sessionsKilled: number;
  }> {
    const stats = {
      farmsDeleted: 0,
      agentsDeleted: 0,
      harvestsDeleted: 0,
      tasksDeleted: 0,
      sessionsKilled: 0
    };

    try {
      logger.info('Starting database cleanup...', { includeAll });
      
      // Kill all tmux sessions first
      try {
        const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}"');
        const sessions = stdout.trim().split('\n').filter(s => s.startsWith('farm-'));
        
        for (const session of sessions) {
          try {
            await execAsync(`tmux kill-session -t ${session}`);
            stats.sessionsKilled++;
            logger.info(`Killed tmux session: ${session}`);
          } catch (err) {
            logger.warn(`Failed to kill session ${session}:`, err);
          }
        }
      } catch (err) {
        // No sessions or tmux not available
        logger.debug('No tmux sessions to clean up');
      }

      // Start database transaction
      const client = await db.connect();
      
      try {
        await client.query('BEGIN');
        
        // Define what statuses to keep
        const statusesToDelete = includeAll 
          ? [] // Delete everything if includeAll is true
          : ['failed', 'stopped', 'terminated', 'completed', 'deleted', 'idle', 'preparing'];
        
        // Build the WHERE clause
        const whereClause = includeAll 
          ? '' 
          : `WHERE status = ANY($1::text[])`;
        
        const params = includeAll ? [] : [statusesToDelete];
        
        // Get farms to delete
        const farmsResult = await client.query(
          `SELECT id, name, status FROM farms ${whereClause}`,
          params
        );
        
        const farmIds = farmsResult.rows.map(r => r.id);
        
        if (farmIds.length > 0) {
          // Delete related records in order (foreign key constraints)
          
          // Delete tasks
          const tasksResult = await client.query(
            'DELETE FROM tasks WHERE farm_id = ANY($1::uuid[]) RETURNING id',
            [farmIds]
          );
          stats.tasksDeleted = tasksResult.rowCount || 0;
          
          // Delete agents
          const agentsResult = await client.query(
            'DELETE FROM agents WHERE farm_id = ANY($1::uuid[]) RETURNING id',
            [farmIds]
          );
          stats.agentsDeleted = agentsResult.rowCount || 0;
          
          // Delete harvests
          const harvestsResult = await client.query(
            'DELETE FROM harvests WHERE farm_id = ANY($1::uuid[]) RETURNING id',
            [farmIds]
          );
          stats.harvestsDeleted = harvestsResult.rowCount || 0;
          
          // Finally delete farms
          const farmsDeleteResult = await client.query(
            'DELETE FROM farms WHERE id = ANY($1::uuid[]) RETURNING id',
            [farmIds]
          );
          stats.farmsDeleted = farmsDeleteResult.rowCount || 0;
          
          logger.info(`Deleted farms: ${farmsResult.rows.map(r => `${r.name} (${r.status})`).join(', ')}`);
        }
        
        await client.query('COMMIT');
        logger.info('Database cleanup completed successfully', stats);
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      logger.error('Database cleanup failed:', error);
      throw error;
    }
    
    return stats;
  }

  async performCompleteReset(includeDatabase: boolean = false): Promise<ResetResult> {
    try {
      logger.info(`Starting complete MaiBarn reset... (includeDatabase: ${includeDatabase})`);
      
      const maibarnPath = pathConfig.config.MAIBARN_ROOT;
      const deletedItems = {
        folders: [] as string[],
        files: [] as string[]
      };
      let databaseCleanup = undefined;
      const errors: string[] = [];
      
      // Step 0: Clean database if requested
      if (includeDatabase) {
        try {
          logger.info('Database cleanup requested, starting cleanup...');
          databaseCleanup = await this.cleanupDatabase(true); // true = delete ALL farms
          logger.info('Database cleanup completed', databaseCleanup);
        } catch (error) {
          logger.error('Database cleanup failed:', error);
          errors.push(`Database cleanup failed: ${error}`);
          // Don't fail the entire reset if database cleanup fails
          // Just log it and continue with file cleanup
        }
      } else {
        logger.info('Database cleanup not requested')
      }

      // Step 1: Clean each preserved folder (keep folder, delete contents)
      for (const folderName of this.preservedFolders) {
        const folderPath = path.join(maibarnPath, folderName);
        
        try {
          const exists = await this.pathExists(folderPath);
          if (!exists) {
            // Create folder if it doesn't exist
            await fs.mkdir(folderPath, { recursive: true });
            logger.info(`Created missing folder: ${folderName}`);
            continue;
          }

          // Clean folder contents
          const items = await fs.readdir(folderPath);
          for (const item of items) {
            const itemPath = path.join(folderPath, item);
            try {
              const stat = await fs.stat(itemPath);
              
              // Special handling for certain folders
              if (folderName === 'barn') {
                // Clean ALL barn contents including items and any harvest data
                if (item === 'items' || item === 'harvests') {
                  // Clean the subfolder completely (including empty subdirectories)
                  await this.cleanFolderContents(itemPath, `${folderName}/${item}`, deletedItems);
                  logger.info(`Cleaned barn/${item} folder completely`);
                } else {
                  // Delete any other barn content
                  await fs.rm(itemPath, { recursive: true, force: true });
                  if (stat.isDirectory()) {
                    deletedItems.folders.push(`${folderName}/${item}`);
                  } else {
                    deletedItems.files.push(`${folderName}/${item}`);
                  }
                }
              } else if (folderName === 'harvests') {
                // Clean ALL harvest data including barn-related harvests
                await fs.rm(itemPath, { recursive: true, force: true });
                if (stat.isDirectory()) {
                  deletedItems.folders.push(`${folderName}/${item}`);
                  logger.info(`Deleted harvest folder: ${folderName}/${item}`);
                } else {
                  deletedItems.files.push(`${folderName}/${item}`);
                }
              } else if (folderName === 'workspaces' && item === 'archived') {
                // Keep archived folder but clean its contents
                const archivedContent = await fs.readdir(itemPath);
                for (const archive of archivedContent) {
                  await fs.rm(path.join(itemPath, archive), { recursive: true, force: true });
                  deletedItems.folders.push(`${folderName}/archived/${archive}`);
                }
              } else {
                // Delete the item
                await fs.rm(itemPath, { recursive: true, force: true });
                if (stat.isDirectory()) {
                  deletedItems.folders.push(`${folderName}/${item}`);
                } else {
                  deletedItems.files.push(`${folderName}/${item}`);
                }
              }
            } catch (err) {
              const errorMsg = `Failed to delete ${folderName}/${item}: ${err}`;
              logger.error(errorMsg);
              errors.push(errorMsg);
            }
          }
        } catch (err) {
          const errorMsg = `Failed to process folder ${folderName}: ${err}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Step 2: Remove any non-preserved items in root maibarn
      const rootItems = await fs.readdir(maibarnPath);
      for (const item of rootItems) {
        if (!this.preservedFolders.includes(item) && !this.preservedFiles.includes(item)) {
          const itemPath = path.join(maibarnPath, item);
          try {
            const stat = await fs.stat(itemPath);
            await fs.rm(itemPath, { recursive: true, force: true });
            
            if (stat.isDirectory()) {
              deletedItems.folders.push(item);
            } else {
              deletedItems.files.push(item);
            }
            logger.info(`Deleted non-preserved item: ${item}`);
          } catch (err) {
            const errorMsg = `Failed to delete ${item}: ${err}`;
            logger.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      }

      // Step 3: Ensure required subfolders exist
      const requiredSubfolders = [
        'barn/items',
        'barn/harvests',  // Add barn harvests folder
        'config/farms',
        'config/templates',
        'harvests/completed',
        'harvests/in-progress',
        'logs/agents',
        'logs/system',
        'workspaces/active',
        'workspaces/archived'
      ];

      for (const subfolder of requiredSubfolders) {
        const subfolderPath = path.join(maibarnPath, subfolder);
        try {
          await fs.mkdir(subfolderPath, { recursive: true });
        } catch (err) {
          logger.warn(`Could not create subfolder ${subfolder}: ${err}`);
        }
      }

      // Step 4: Create .gitkeep files in empty directories
      for (const folder of this.preservedFolders) {
        const gitkeepPath = path.join(maibarnPath, folder, '.gitkeep');
        try {
          await fs.writeFile(gitkeepPath, '');
        } catch (err) {
          // Ignore errors for .gitkeep files
        }
      }

      logger.info('MaiBarn reset completed successfully');

      return {
        success: errors.length === 0,
        message: errors.length === 0 
          ? includeDatabase 
            ? 'MaiBarn and database have been completely reset'
            : 'MaiBarn has been completely reset to its original state'
          : 'MaiBarn reset completed with some errors',
        deletedItems,
        databaseCleanup,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      logger.error('Failed to perform MaiBarn reset:', error);
      return {
        success: false,
        message: 'Failed to perform MaiBarn reset',
        errors: [`${error}`]
      };
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async cleanFolderContents(folderPath: string, folderName: string, deletedItems: { folders: string[]; files: string[] }): Promise<void> {
    try {
      const items = await fs.readdir(folderPath);
      for (const item of items) {
        const itemPath = path.join(folderPath, item);
        try {
          const stat = await fs.stat(itemPath);
          await fs.rm(itemPath, { recursive: true, force: true });
          
          if (stat.isDirectory()) {
            deletedItems.folders.push(`${folderName}/${item}`);
          } else {
            deletedItems.files.push(`${folderName}/${item}`);
          }
        } catch (err) {
          logger.warn(`Could not delete ${folderName}/${item}: ${err}`);
        }
      }
    } catch (err) {
      logger.warn(`Could not read folder contents for ${folderName}: ${err}`);
    }
  }

  async getStorageInfo(): Promise<{
    totalFiles: number;
    totalFolders: number;
    sizeEstimate: string;
  }> {
    try {
      const maibarnPath = pathConfig.config.MAIBARN_ROOT;
      logger.debug(`Getting storage info for MaiBarn path: ${maibarnPath}`);
      
      let totalFiles = 0;
      let totalFolders = 0;
      let totalSize = 0;
      
      // Define default structure that should be excluded from counts
      const defaultFolders = new Set([
        'barn', 'barn/items', 'barn/catalog',
        'config', 'coordination', 
        'harvests', 'harvests/collected', 'harvests/files', 'harvests/pending',
        'logs', 'temp', 'terminals',
        'workspaces', 'workspaces/active', 'workspaces/archived',
        'xenosync-sessions', 'tmux-logs', 'sessions'
      ]);
      
      const defaultFiles = new Set([
        '.gitignore', 'README.md', '.gitkeep'
      ]);

      // Check if maibarn directory exists
      const exists = await this.pathExists(maibarnPath);
      if (!exists) {
        logger.warn('MaiBarn directory does not exist:', maibarnPath);
        return {
          totalFiles: 0,
          totalFolders: 0,
          sizeEstimate: '0 B'
        };
      }
      
      // Verify we're in the correct directory
      const resolvedPath = path.resolve(maibarnPath);
      if (!resolvedPath.includes('maibarn')) {
        logger.error(`Path does not contain 'maibarn': ${resolvedPath}`);
        throw new Error('Invalid MaiBarn path - safety check failed');
      }

      const countItems = async (dirPath: string, relativePath: string = '') => {
        let items: string[] = [];
        try {
          items = await fs.readdir(dirPath);
        } catch (err) {
          // Silently skip inaccessible directories
          return;
        }
        
        for (const item of items) {
          // Skip hidden files and .gitkeep files
          if (item.startsWith('.') && item !== '.gitignore') continue;
          
          const itemPath = path.join(dirPath, item);
          const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
          
          try {
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
              // Only count folders that are not part of the default structure
              // and that actually contain user data
              if (!defaultFolders.has(relativeItemPath)) {
                // Check if this folder has any non-default content
                const hasContent = await folderHasUserContent(itemPath, relativeItemPath);
                if (hasContent) {
                  totalFolders++;
                }
              }
              await countItems(itemPath, relativeItemPath);
            } else {
              // Only count files that are not part of the default structure
              if (!defaultFiles.has(item) && !item.endsWith('.gitkeep')) {
                totalFiles++;
                totalSize += stat.size;
              }
            }
          } catch (err) {
            // Skip items we can't access
          }
        }
      };
      
      // Helper function to check if a folder has user-generated content
      const folderHasUserContent = async (folderPath: string, relativePath: string): Promise<boolean> => {
        try {
          const items = await fs.readdir(folderPath);
          for (const item of items) {
            // Skip hidden files and .gitkeep
            if (item.startsWith('.') || item === '.gitkeep') continue;
            
            const relativeItemPath = path.join(relativePath, item);
            const itemPath = path.join(folderPath, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isFile() && !defaultFiles.has(item)) {
              return true; // Found a user file
            }
            if (stat.isDirectory() && !defaultFolders.has(relativeItemPath)) {
              return true; // Found a user folder
            }
          }
        } catch {
          // Error reading folder
        }
        return false;
      };

      await countItems(maibarnPath);
      
      logger.info(`MaiBarn storage info calculated: Files: ${totalFiles}, Folders: ${totalFolders}, Size: ${totalSize} bytes`);

      // Format size
      let sizeEstimate = '';
      if (totalSize < 1024) {
        sizeEstimate = `${totalSize} B`;
      } else if (totalSize < 1024 * 1024) {
        sizeEstimate = `${(totalSize / 1024).toFixed(2)} KB`;
      } else if (totalSize < 1024 * 1024 * 1024) {
        sizeEstimate = `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
      } else {
        sizeEstimate = `${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      }

      return {
        totalFiles,
        totalFolders,
        sizeEstimate
      };
    } catch (error) {
      logger.error('Failed to get storage info:', error);
      return {
        totalFiles: 0,
        totalFolders: 0,
        sizeEstimate: 'Unknown'
      };
    }
  }
}

export const maiBarnResetService = new MaiBarnResetService();