/**
 * XenoSync-Barn Integration Service
 * Bridges XenoSync's project workspaces with MaiFarm's Barn/harvest system
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { pathConfig } from '../config/paths';
import { projectCoordinator } from './projectWorkspaceCoordinator';
import { barnService } from './unified/barnService';
import { harvestService } from './harvestService';
import { fileManager } from './fileManagerService';
import { db } from '../database/connection';

interface ProjectHarvest {
  farmId: string;
  projectPath: string;
  harvestId?: string;
  barnItemId?: string;
  filesCollected: number;
  totalSize: number;
  createdAt: Date;
}

interface BarnItem {
  id: string;
  name: string;
  type: 'project' | 'harvest' | 'artifact';
  farmId: string;
  sourcePath: string;
  barnPath: string;
  metadata: {
    agentCount?: number;
    fileCount?: number;
    totalSize?: number;
    description?: string;
    tags?: string[];
  };
  createdAt: Date;
}

export class XenoSyncBarnIntegration extends EventEmitter {
  private readonly barnRoot: string;
  private readonly harvestRoot: string;
  private activeHarvests: Map<string, ProjectHarvest> = new Map();

  constructor() {
    super();
    const paths = pathConfig.getPaths();
    // CRITICAL FIX: Use BARN_ITEMS instead of non-existent BARN_ITEMS_DIR
    this.barnRoot = path.join(paths.BARN_ITEMS);
    this.harvestRoot = path.join(paths.HARVESTS_DIR);
    
    // Listen for project merge events
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for project completion
   */
  private setupEventListeners(): void {
    // Listen for project merge completion from ProjectWorkspaceCoordinator
    projectCoordinator.on('projects:merged', async (data) => {
      logger.info('[XenoSyncBarnIntegration] Projects merged, initiating harvest collection');
      await this.collectProjectHarvest(data.farmId, data.finalProjectPath, data.agentCount);
    });
  }

  /**
   * Collect harvest from merged XenoSync projects
   */
  async collectProjectHarvest(farmId: string, projectPath: string, agentCount: number): Promise<string> {
    logger.info(`[XenoSyncBarnIntegration] Collecting harvest from ${projectPath} for farm ${farmId}`);
    
    try {
      // Create harvest record
      const harvestId = await this.createHarvestRecord(farmId);
      
      // Create harvest directory
      const harvestDir = path.join(this.harvestRoot, farmId, harvestId);
      await fs.mkdir(harvestDir, { recursive: true });
      
      // Copy project files to harvest
      const stats = await this.copyProjectToHarvest(projectPath, harvestDir);
      
      // Create barn item from harvest
      const barnItemId = await this.createBarnItem(farmId, harvestDir, {
        name: `Farm ${farmId} - XenoSync Project`,
        agentCount,
        fileCount: stats.fileCount,
        totalSize: stats.totalSize
      });
      
      // Track harvest
      const harvest: ProjectHarvest = {
        farmId,
        projectPath,
        harvestId,
        barnItemId,
        filesCollected: stats.fileCount,
        totalSize: stats.totalSize,
        createdAt: new Date()
      };
      
      this.activeHarvests.set(farmId, harvest);
      
      // Update harvest record with details
      await this.updateHarvestRecord(harvestId, harvest);
      
      // Emit harvest complete event
      this.emit('harvest:collected', {
        farmId,
        harvestId,
        barnItemId,
        filesCollected: stats.fileCount,
        totalSize: stats.totalSize
      });
      
      logger.info(`[XenoSyncBarnIntegration] Harvest ${harvestId} collected with ${stats.fileCount} files`);
      
      return harvestId;
    } catch (error) {
      logger.error('[XenoSyncBarnIntegration] Failed to collect harvest:', error);
      throw error;
    }
  }

  /**
   * Create harvest record in database
   */
  private async createHarvestRecord(farmId: string): Promise<string> {
    try {
      const result = await db.query(
        `INSERT INTO harvests (farm_id, status, created_at) 
         VALUES ($1, 'collecting', NOW()) 
         RETURNING id`,
        [farmId]
      );
      
      return result.rows[0].id;
    } catch (error) {
      logger.error('[XenoSyncBarnIntegration] Failed to create harvest record:', error);
      // Fallback to UUID if database fails
      return uuidv4();
    }
  }

  /**
   * Update harvest record with collection details
   */
  private async updateHarvestRecord(harvestId: string, harvest: ProjectHarvest): Promise<void> {
    try {
      await db.query(
        `UPDATE harvests 
         SET status = 'collected', 
             files_collected = $1, 
             total_size = $2,
             barn_item_id = $3,
             collected_at = NOW()
         WHERE id = $4`,
        [harvest.filesCollected, harvest.totalSize, harvest.barnItemId, harvestId]
      );
    } catch (error) {
      logger.error('[XenoSyncBarnIntegration] Failed to update harvest record:', error);
    }
  }

  /**
   * Copy project files to harvest directory
   */
  private async copyProjectToHarvest(sourcePath: string, destPath: string): Promise<{ fileCount: number; totalSize: number }> {
    let fileCount = 0;
    let totalSize = 0;
    
    async function copyRecursive(src: string, dest: string): Promise<void> {
      const entries = await fs.readdir(src, { withFileTypes: true });
      
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          // Skip .git directories
          if (entry.name === '.git') continue;
          
          await fs.mkdir(destPath, { recursive: true });
          await copyRecursive(srcPath, destPath);
        } else if (entry.isFile()) {
          await fs.copyFile(srcPath, destPath);
          const stats = await fs.stat(destPath);
          fileCount++;
          totalSize += stats.size;
        }
      }
    }
    
    await copyRecursive(sourcePath, destPath);
    
    // Create harvest manifest
    const manifest = {
      sourcePath,
      fileCount,
      totalSize,
      collectedAt: new Date(),
      type: 'xenosync-project'
    };
    
    await fs.writeFile(
      path.join(destPath, 'harvest-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    return { fileCount, totalSize };
  }

  /**
   * Create a barn item from harvest
   */
  async createBarnItem(farmId: string, harvestPath: string, metadata: any): Promise<string> {
    const barnItemId = uuidv4();
    const barnItemPath = path.join(this.barnRoot, barnItemId);
    
    try {
      // Create barn item directory
      await fs.mkdir(barnItemPath, { recursive: true });
      
      // Copy harvest to barn
      await this.copyHarvestToBarn(harvestPath, barnItemPath);
      
      // Create barn item metadata
      const barnItem: BarnItem = {
        id: barnItemId,
        name: metadata.name || `Project from Farm ${farmId}`,
        type: 'project',
        farmId,
        sourcePath: harvestPath,
        barnPath: barnItemPath,
        metadata: {
          agentCount: metadata.agentCount,
          fileCount: metadata.fileCount,
          totalSize: metadata.totalSize,
          description: `XenoSync multi-agent project output`,
          tags: ['xenosync', 'project', 'multi-agent']
        },
        createdAt: new Date()
      };
      
      // Write barn item metadata
      await fs.writeFile(
        path.join(barnItemPath, 'barn-metadata.json'),
        JSON.stringify(barnItem, null, 2)
      );
      
      // Register with barn service if available
      try {
        await barnService.registerItem({
          id: barnItemId,
          farmId,
          name: barnItem.name,
          type: 'project',
          path: barnItemPath,
          metadata: barnItem.metadata,
          createdAt: barnItem.createdAt
        });
      } catch (error) {
        logger.warn('[XenoSyncBarnIntegration] Could not register with barn service:', error);
      }
      
      logger.info(`[XenoSyncBarnIntegration] Created barn item ${barnItemId}`);
      
      return barnItemId;
    } catch (error) {
      logger.error('[XenoSyncBarnIntegration] Failed to create barn item:', error);
      throw error;
    }
  }

  /**
   * Copy harvest to barn storage
   */
  private async copyHarvestToBarn(sourcePath: string, destPath: string): Promise<void> {
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(sourcePath, entry.name);
      const dstPath = path.join(destPath, entry.name);
      
      if (entry.isDirectory()) {
        await fs.mkdir(dstPath, { recursive: true });
        await this.copyHarvestToBarn(srcPath, dstPath);
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, dstPath);
      }
    }
  }

  /**
   * Get barn items for a farm
   */
  async getFarmBarnItems(farmId: string): Promise<BarnItem[]> {
    const items: BarnItem[] = [];
    
    try {
      const entries = await fs.readdir(this.barnRoot, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const metadataPath = path.join(this.barnRoot, entry.name, 'barn-metadata.json');
        
        if (fsSync.existsSync(metadataPath)) {
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
          
          if (metadata.farmId === farmId) {
            items.push(metadata);
          }
        }
      }
    } catch (error) {
      logger.error('[XenoSyncBarnIntegration] Failed to get barn items:', error);
    }
    
    return items;
  }

  /**
   * Link barn item to agent workspace
   */
  async linkBarnItemToWorkspace(barnItemId: string, workspacePath: string): Promise<void> {
    const barnItemPath = path.join(this.barnRoot, barnItemId);
    
    if (!fsSync.existsSync(barnItemPath)) {
      throw new Error(`Barn item ${barnItemId} not found`);
    }
    
    // Create symlink in workspace
    const linkPath = path.join(workspacePath, 'barn', barnItemId);
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    
    try {
      await fs.symlink(barnItemPath, linkPath, 'dir');
      logger.info(`[XenoSyncBarnIntegration] Linked barn item ${barnItemId} to workspace`);
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        logger.debug(`[XenoSyncBarnIntegration] Barn item ${barnItemId} already linked`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Process barn references in prompt (@barn:item-id)
   */
  async processBarnReferences(prompt: string, workspacePath: string): Promise<string> {
    const barnPattern = /@barn:([a-f0-9-]+)/gi;
    const references = prompt.match(barnPattern) || [];
    
    for (const ref of references) {
      const barnItemId = ref.replace('@barn:', '');
      
      try {
        // Link barn item to workspace
        await this.linkBarnItemToWorkspace(barnItemId, workspacePath);
        
        // Replace reference with path
        const relativePath = path.join('barn', barnItemId);
        prompt = prompt.replace(ref, relativePath);
        
        logger.info(`[XenoSyncBarnIntegration] Processed barn reference ${barnItemId}`);
      } catch (error) {
        logger.error(`[XenoSyncBarnIntegration] Failed to process barn reference ${barnItemId}:`, error);
      }
    }
    
    return prompt;
  }

  /**
   * Export barn catalog for agent context
   */
  async exportBarnCatalog(farmId?: string): Promise<string> {
    const items = farmId ? await this.getFarmBarnItems(farmId) : [];
    
    let catalog = '# Barn Catalog\n\n';
    catalog += 'Available barn items for reference:\n\n';
    
    for (const item of items) {
      catalog += `## ${item.name} (@barn:${item.id})\n`;
      catalog += `- Type: ${item.type}\n`;
      catalog += `- Files: ${item.metadata.fileCount || 'N/A'}\n`;
      catalog += `- Size: ${this.formatBytes(item.metadata.totalSize || 0)}\n`;
      catalog += `- Description: ${item.metadata.description || 'No description'}\n`;
      catalog += `- Tags: ${item.metadata.tags?.join(', ') || 'None'}\n`;
      catalog += `- Created: ${item.createdAt}\n\n`;
    }
    
    return catalog;
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Clean up old harvests
   */
  async cleanupOldHarvests(daysToKeep: number = 7): Promise<number> {
    let cleaned = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    try {
      const farms = await fs.readdir(this.harvestRoot, { withFileTypes: true });
      
      for (const farm of farms) {
        if (!farm.isDirectory()) continue;
        
        const farmPath = path.join(this.harvestRoot, farm.name);
        const harvests = await fs.readdir(farmPath, { withFileTypes: true });
        
        for (const harvest of harvests) {
          if (!harvest.isDirectory()) continue;
          
          const harvestPath = path.join(farmPath, harvest.name);
          const stats = await fs.stat(harvestPath);
          
          if (stats.mtime < cutoffDate) {
            await fs.rm(harvestPath, { recursive: true, force: true });
            cleaned++;
            logger.info(`[XenoSyncBarnIntegration] Cleaned up old harvest ${harvest.name}`);
          }
        }
      }
    } catch (error) {
      logger.error('[XenoSyncBarnIntegration] Failed to cleanup old harvests:', error);
    }
    
    return cleaned;
  }

  /**
   * Get active harvest for a farm
   */
  getActiveHarvest(farmId: string): ProjectHarvest | undefined {
    return this.activeHarvests.get(farmId);
  }

  /**
   * Clear active harvest
   */
  clearActiveHarvest(farmId: string): void {
    this.activeHarvests.delete(farmId);
  }
}

// Export singleton instance
export const xenosyncBarnIntegration = new XenoSyncBarnIntegration();