import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import { db } from '../../database/connection';
import { websocketManager } from '../../websocket/websocketManager';
import { pathConfig } from '../../config/paths';
import { logger } from '../../utils/logger';

export interface Harvest {
  id: string;
  farmId: string;
  farmName: string;
  status: 'collecting' | 'ready' | 'failed';
  results: HarvestResult[];
  summary: HarvestSummary;
  quality: number;
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface HarvestResult {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  taskType: string;
  content: string;
  metadata: any;
  timestamp: Date;
  processingTime: number;
  success: boolean;
}

export interface HarvestSummary {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgProcessingTime: number;
  totalProcessingTime: number;
  successRate: number;
}

interface FileCollectionResult {
  success: boolean;
  filesCollected: number;
  errors: string[];
  harvestPath: string;
}

/**
 * Unified Harvest Service - Consolidates all harvest-related operations
 * Replaces: harvestService, harvestFileCollector, harvestRecoveryService, 
 *          harvestSessionBroadcaster, harvestSessionCache
 */
export class HarvestService extends EventEmitter {
  private static instance: HarvestService;
  private activeHarvests: Map<string, Harvest> = new Map();
  private sessionCache: Map<string, any> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;

  private constructor() {
    super();
    this.initializeEventHandlers();
  }

  static getInstance(): HarvestService {
    if (!HarvestService.instance) {
      HarvestService.instance = new HarvestService();
    }
    return HarvestService.instance;
  }

  private initializeEventHandlers(): void {
    // Listen for WebSocket events
    if (websocketManager) {
      websocketManager.on('harvest:update', this.handleHarvestUpdate.bind(this));
    }
  }

  /**
   * Start a new harvest for a farm
   */
  async startHarvest(farmId: string, farmName: string, userId: string): Promise<Harvest> {
    try {
      const harvestId = uuidv4();
      const harvest: Harvest = {
        id: harvestId,
        farmId,
        farmName,
        status: 'collecting',
        results: [],
        summary: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          avgProcessingTime: 0,
          totalProcessingTime: 0,
          successRate: 0
        },
        quality: 0,
        createdBy: userId,
        createdAt: new Date()
      };

      // Store in database
      await db.query(
        `INSERT INTO harvests (id, farm_id, farm_name, status, summary, quality, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [harvestId, farmId, farmName, 'collecting', JSON.stringify(harvest.summary), 0, userId, new Date()]
      );

      // Cache in memory
      this.activeHarvests.set(harvestId, harvest);

      // Create harvest directory
      const harvestPath = pathConfig.getHarvestPath(harvestId, false);
      await fs.mkdir(harvestPath, { recursive: true });

      // Emit events
      this.emit('harvest:started', harvest);
      websocketManager.broadcast('harvest:started', {
        harvestId,
        farmId,
        farmName,
        status: 'collecting'
      });

      logger.info(`[HarvestService] Started harvest ${harvestId} for farm ${farmId}`);
      return harvest;

    } catch (error) {
      logger.error('[HarvestService] Failed to start harvest:', error);
      throw error;
    }
  }

  /**
   * Collect files from farm workspace with retry logic
   */
  async collectFiles(farmId: string, harvestId?: string): Promise<FileCollectionResult> {
    const result: FileCollectionResult = {
      success: false,
      filesCollected: 0,
      errors: [],
      harvestPath: ''
    };

    try {
      // Get or create harvest
      let harvest: Harvest;
      if (harvestId && this.activeHarvests.has(harvestId)) {
        harvest = this.activeHarvests.get(harvestId)!;
      } else {
        // Find existing harvest for farm or create new one
        const existingHarvest = Array.from(this.activeHarvests.values())
          .find(h => h.farmId === farmId && h.status === 'collecting');
        
        if (existingHarvest) {
          harvest = existingHarvest;
        } else {
          harvest = await this.startHarvest(farmId, `Farm ${farmId}`, 'system');
        }
      }

      const harvestPath = pathConfig.getHarvestPath(harvest.id, false);
      const workspacePath = pathConfig.getFarmWorkspacePath(farmId, false);
      
      result.harvestPath = harvestPath;

      // Collect files with retry logic
      for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
        try {
          logger.info(`[HarvestService] Collecting files from ${workspacePath} (attempt ${attempt}/${this.MAX_RETRIES})`);
          
          // Check if workspace exists
          try {
            await fs.access(workspacePath);
          } catch {
            logger.warn(`[HarvestService] Workspace ${workspacePath} does not exist`);
            result.errors.push('Workspace not found');
            return result;
          }

          // Read all files from workspace
          const files = await this.collectWorkspaceFiles(workspacePath, harvestPath);
          result.filesCollected = files.length;

          // Also collect from coordination directory
          const coordinationPath = path.join(pathConfig.getPath('COORDINATION_FARMS'), `farm_${farmId}.yaml`);
          try {
            await fs.access(coordinationPath);
            await fs.copyFile(
              coordinationPath,
              path.join(harvestPath, 'farm_coordination.yaml')
            );
            result.filesCollected++;
          } catch {
            // Coordination file might not exist
          }

          // Collect from maibarn coordination if exists
          const maibarnCoordPath = path.join(pathConfig.getPath('COORDINATION_DIR'), 'work_claims');
          try {
            const claimFiles = await fs.readdir(maibarnCoordPath);
            const farmClaims = claimFiles.filter(f => f.includes(farmId.substring(0, 8)));
            
            for (const claimFile of farmClaims) {
              await fs.copyFile(
                path.join(maibarnCoordPath, claimFile),
                path.join(harvestPath, claimFile)
              );
              result.filesCollected++;
            }
          } catch {
            // Work claims might not exist
          }

          result.success = true;
          logger.info(`[HarvestService] Successfully collected ${result.filesCollected} files`);
          break;

        } catch (error) {
          const errorMsg = `Collection attempt ${attempt} failed: ${error}`;
          result.errors.push(errorMsg);
          logger.error(`[HarvestService] ${errorMsg}`);
          
          if (attempt < this.MAX_RETRIES) {
            await this.delay(this.RETRY_DELAY * attempt);
          }
        }
      }

      return result;

    } catch (error) {
      logger.error('[HarvestService] File collection failed:', error);
      result.errors.push(`Fatal error: ${error}`);
      return result;
    }
  }

  /**
   * Complete a harvest and mark as ready
   */
  async completeHarvest(harvestId: string): Promise<Harvest | null> {
    try {
      const harvest = this.activeHarvests.get(harvestId);
      if (!harvest) {
        logger.warn(`[HarvestService] Harvest ${harvestId} not found in cache`);
        return null;
      }

      // Update summary
      harvest.status = 'ready';
      harvest.completedAt = new Date();
      harvest.quality = this.calculateQuality(harvest);

      // Update database
      await db.query(
        `UPDATE harvests 
         SET status = $1, completed_at = $2, quality = $3, summary = $4
         WHERE id = $5`,
        ['ready', harvest.completedAt, harvest.quality, JSON.stringify(harvest.summary), harvestId]
      );

      // Move to completed storage
      const activePath = pathConfig.getHarvestPath(harvestId, false);
      const completedPath = pathConfig.getHarvestPath(harvestId, true);
      
      try {
        await fs.rename(activePath, completedPath);
      } catch (error) {
        logger.warn(`[HarvestService] Could not move harvest to completed storage: ${error}`);
      }

      // Emit events
      this.emit('harvest:completed', harvest);
      websocketManager.broadcast('harvest:completed', {
        harvestId,
        farmId: harvest.farmId,
        quality: harvest.quality,
        summary: harvest.summary
      });

      // Remove from active cache
      this.activeHarvests.delete(harvestId);

      logger.info(`[HarvestService] Completed harvest ${harvestId} with quality ${harvest.quality}`);
      return harvest;

    } catch (error) {
      logger.error('[HarvestService] Failed to complete harvest:', error);
      return null;
    }
  }

  /**
   * Get harvest by ID
   */
  async getHarvest(harvestId: string): Promise<Harvest | null> {
    // Check cache first
    if (this.activeHarvests.has(harvestId)) {
      return this.activeHarvests.get(harvestId)!;
    }

    // Load from database
    try {
      const result = await db.query(
        'SELECT * FROM harvests WHERE id = $1',
        [harvestId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const harvest: Harvest = {
        id: row.id,
        farmId: row.farm_id,
        farmName: row.farm_name,
        status: row.status,
        results: row.results || [],
        summary: row.summary || {},
        quality: row.quality || 0,
        createdBy: row.created_by,
        createdAt: row.created_at,
        completedAt: row.completed_at
      };

      return harvest;

    } catch (error) {
      logger.error('[HarvestService] Failed to get harvest:', error);
      return null;
    }
  }

  /**
   * Add result to harvest
   */
  async addResult(harvestId: string, result: HarvestResult): Promise<void> {
    const harvest = await this.getHarvest(harvestId);
    if (!harvest) {
      throw new Error(`Harvest ${harvestId} not found`);
    }

    harvest.results.push(result);
    
    // Update summary
    harvest.summary.totalTasks++;
    if (result.success) {
      harvest.summary.completedTasks++;
    } else {
      harvest.summary.failedTasks++;
    }
    harvest.summary.totalProcessingTime += result.processingTime;
    harvest.summary.avgProcessingTime = 
      harvest.summary.totalProcessingTime / harvest.summary.totalTasks;
    harvest.summary.successRate = 
      harvest.summary.completedTasks / harvest.summary.totalTasks;

    // Update cache if active
    if (this.activeHarvests.has(harvestId)) {
      this.activeHarvests.set(harvestId, harvest);
    }

    // Broadcast update
    websocketManager.broadcast('harvest:result_added', {
      harvestId,
      result,
      summary: harvest.summary
    });
  }

  /**
   * Recover harvest from failure
   */
  async recoverHarvest(harvestId: string): Promise<boolean> {
    try {
      logger.info(`[HarvestService] Attempting to recover harvest ${harvestId}`);
      
      const harvest = await this.getHarvest(harvestId);
      if (!harvest) {
        logger.error(`[HarvestService] Harvest ${harvestId} not found for recovery`);
        return false;
      }

      // Re-collect files
      const collectionResult = await this.collectFiles(harvest.farmId, harvestId);
      
      if (collectionResult.success) {
        // Mark as ready if we got files
        if (collectionResult.filesCollected > 0) {
          await this.completeHarvest(harvestId);
          logger.info(`[HarvestService] Successfully recovered harvest ${harvestId}`);
          return true;
        }
      }

      // Mark as failed if recovery didn't work
      harvest.status = 'failed';
      await db.query(
        'UPDATE harvests SET status = $1 WHERE id = $2',
        ['failed', harvestId]
      );

      logger.error(`[HarvestService] Failed to recover harvest ${harvestId}`);
      return false;

    } catch (error) {
      logger.error('[HarvestService] Harvest recovery failed:', error);
      return false;
    }
  }

  /**
   * Clean up old harvests
   */
  async cleanupOldHarvests(daysToKeep: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // Delete from database
      const result = await db.query(
        'DELETE FROM harvests WHERE completed_at < $1 AND status = $2',
        [cutoffDate, 'ready']
      );

      const deletedCount = result.rowCount || 0;
      logger.info(`[HarvestService] Cleaned up ${deletedCount} old harvests`);
      
      return deletedCount;

    } catch (error) {
      logger.error('[HarvestService] Cleanup failed:', error);
      return 0;
    }
  }

  // Helper methods

  private async collectWorkspaceFiles(sourcePath: string, destPath: string): Promise<string[]> {
    const collectedFiles: string[] = [];
    
    async function collectRecursive(currentPath: string, relativePath: string = '') {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relPath = path.join(relativePath, entry.name);
        const destFilePath = path.join(destPath, relPath);
        
        if (entry.isDirectory()) {
          // Skip node_modules and other build directories
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            await fs.mkdir(path.dirname(destFilePath), { recursive: true });
            await collectRecursive(fullPath, relPath);
          }
        } else {
          // Copy file
          await fs.mkdir(path.dirname(destFilePath), { recursive: true });
          await fs.copyFile(fullPath, destFilePath);
          collectedFiles.push(relPath);
        }
      }
    }
    
    await collectRecursive(sourcePath);
    return collectedFiles;
  }

  private calculateQuality(harvest: Harvest): number {
    if (harvest.summary.totalTasks === 0) return 0;
    
    // Quality based on success rate and processing time
    const successScore = harvest.summary.successRate * 60; // 60% weight
    const timeScore = Math.min(30, (1000 / harvest.summary.avgProcessingTime) * 30); // 30% weight
    const completionScore = (harvest.summary.completedTasks / harvest.summary.totalTasks) * 10; // 10% weight
    
    return Math.round(successScore + timeScore + completionScore);
  }

  private handleHarvestUpdate(data: any): void {
    if (data.harvestId && this.activeHarvests.has(data.harvestId)) {
      const harvest = this.activeHarvests.get(data.harvestId)!;
      // Update harvest with new data
      Object.assign(harvest, data.updates);
      this.emit('harvest:updated', harvest);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all active harvests
   */
  getActiveHarvests(): Harvest[] {
    return Array.from(this.activeHarvests.values());
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.activeHarvests.clear();
    this.sessionCache.clear();
  }
}

// Export singleton instance
export const harvestService = HarvestService.getInstance();