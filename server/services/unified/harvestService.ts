/**
 * Unified Harvest Service
 * Consolidates all harvest collection, processing, and storage functionality
 * Replaces: harvestService, harvestFileCollector, harvest-related APIs
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { db, redis } from '../../database/connection';
import { websocketManager } from '../../websocket/websocketManager';
import { logger } from '../../utils/logger';
import { pathConfig } from '../../config/paths';
import { stateCoordinator } from './stateCoordinator';
import { farmService } from './farmService';
import type { Farm, FarmStatus } from './farmService';

export enum HarvestStatus {
  PENDING = 'pending',
  COLLECTING = 'collecting',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STORED = 'stored'
}

export interface HarvestData {
  id: string;
  farmId: string;
  farmName: string;
  userId: string;
  status: HarvestStatus;
  artifacts: HarvestArtifact[];
  metadata: {
    totalAgents: number;
    completedAgents: number;
    totalFiles: number;
    totalSize: number;
    duration?: number;
  };
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface HarvestArtifact {
  id: string;
  harvestId: string;
  agentId: string;
  agentName: string;
  type: 'file' | 'code' | 'document' | 'data' | 'terminal';
  path: string;
  content?: string;
  size: number;
  mimeType?: string;
  createdAt: Date;
}

export interface HarvestFilter {
  farmId?: string;
  status?: HarvestStatus;
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'createdAt' | 'completedAt' | 'farmName';
  sortOrder?: 'asc' | 'desc';
}

export interface HarvestCreateInput {
  farmId: string;
  farmName: string;
  userId: string;
  initialData?: any;
}

class UnifiedHarvestService extends EventEmitter {
  private static instance: UnifiedHarvestService;
  private harvests: Map<string, HarvestData> = new Map();
  private activeCollections: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    super();
    this.initializeService();
  }

  public static getInstance(): UnifiedHarvestService {
    if (!UnifiedHarvestService.instance) {
      UnifiedHarvestService.instance = new UnifiedHarvestService();
    }
    return UnifiedHarvestService.instance;
  }

  private async initializeService(): Promise<void> {
    // Load existing harvests from database
    await this.loadHarvests();

    // Subscribe to farm events
    farmService.on('farm:completed', (farm: Farm) => this.handleFarmCompleted(farm));
    farmService.on('farm:failed', (farm: Farm) => this.handleFarmFailed(farm));
  }

  private async loadHarvests(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT * FROM harvests
        WHERE status != 'deleted'
        ORDER BY created_at DESC
      `);

      for (const row of result.rows) {
        this.harvests.set(row.id, this.rowToHarvest(row));
      }
    } catch (error: any) {
      // If table doesn't exist, log warning but continue
      if (error.code === '42P01') {
        logger.warn('Harvests table does not exist yet. Run database migrations.');
      } else {
        logger.error('Failed to load harvests:', error);
      }
    }
  }

  private rowToHarvest(row: any): HarvestData {
    return {
      id: row.id,
      farmId: row.farm_id,
      farmName: row.farm_name,
      userId: row.user_id,
      status: row.status,
      artifacts: row.artifacts || [],
      metadata: row.metadata || {},
      summary: row.summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at
    };
  }

  /**
   * Create a new harvest
   */
  public async createHarvest(input: HarvestCreateInput): Promise<HarvestData> {
    const harvest: HarvestData = {
      id: uuidv4(),
      farmId: input.farmId,
      farmName: input.farmName,
      userId: input.userId,
      status: HarvestStatus.PENDING,
      artifacts: [],
      metadata: {
        totalAgents: 0,
        completedAgents: 0,
        totalFiles: 0,
        totalSize: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to database
    await db.query(`
      INSERT INTO harvests (id, farm_id, farm_name, user_id, status, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [harvest.id, harvest.farmId, harvest.farmName, harvest.userId, harvest.status,
        JSON.stringify(harvest.metadata), harvest.createdAt, harvest.updatedAt]);

    this.harvests.set(harvest.id, harvest);

    // Emit event
    this.emit('harvest:created', harvest);
    websocketManager.broadcast('harvest:created', harvest);

    return harvest;
  }

  /**
   * Start harvest collection for a farm
   */
  public async startHarvest(farmId: string, farmName: string, userId: string): Promise<HarvestData> {
    // Check if harvest already exists for this farm
    const existingHarvest = Array.from(this.harvests.values()).find(
      h => h.farmId === farmId && h.status !== HarvestStatus.COMPLETED
    );

    if (existingHarvest) {
      return existingHarvest;
    }

    const harvest = await this.createHarvest({ farmId, farmName, userId });

    // Update status to collecting
    harvest.status = HarvestStatus.COLLECTING;
    harvest.updatedAt = new Date();
    await this.updateHarvestInDb(harvest);

    // Start collection process
    this.startCollection(harvest);

    return harvest;
  }

  /**
   * Start collecting files from farm workspace
   */
  private async startCollection(harvest: HarvestData): Promise<void> {
    try {
      const farm = farmService.getFarm(harvest.farmId);
      if (!farm) {
        throw new Error(`Farm ${harvest.farmId} not found`);
      }

      const workspacePath = farm.workspacePath;
      if (!workspacePath) {
        throw new Error(`No workspace path for farm ${harvest.farmId}`);
      }

      // Collect files from workspace
      const artifacts = await this.collectWorkspaceFiles(workspacePath, harvest);

      // Collect terminal outputs
      const terminalArtifacts = await this.collectTerminalOutputs(farm, harvest);
      artifacts.push(...terminalArtifacts);

      // Update harvest with artifacts
      harvest.artifacts = artifacts;
      harvest.metadata.totalFiles = artifacts.length;
      harvest.metadata.totalSize = artifacts.reduce((sum, a) => sum + a.size, 0);
      harvest.status = HarvestStatus.PROCESSING;
      harvest.updatedAt = new Date();

      await this.updateHarvestInDb(harvest);

      // Process harvest (generate summary, etc.)
      await this.processHarvest(harvest);

    } catch (error) {
      logger.error(`Failed to collect harvest for farm ${harvest.farmId}:`, error);
      harvest.status = HarvestStatus.FAILED;
      harvest.updatedAt = new Date();
      await this.updateHarvestInDb(harvest);
    }
  }

  /**
   * Collect files from workspace
   */
  private async collectWorkspaceFiles(workspacePath: string, harvest: HarvestData): Promise<HarvestArtifact[]> {
    const artifacts: HarvestArtifact[] = [];

    try {
      const files = await this.walkDirectory(workspacePath);

      for (const filePath of files) {
        if (this.shouldIgnoreFile(filePath)) continue;

        const stat = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8').catch(() => null);

        artifacts.push({
          id: uuidv4(),
          harvestId: harvest.id,
          agentId: 'workspace',
          agentName: 'Workspace',
          type: this.getFileType(filePath),
          path: path.relative(workspacePath, filePath),
          content: content || undefined,
          size: stat.size,
          mimeType: this.getMimeType(filePath),
          createdAt: new Date()
        });
      }
    } catch (error) {
      logger.error('Failed to collect workspace files:', error);
    }

    return artifacts;
  }

  /**
   * Collect terminal outputs
   */
  private async collectTerminalOutputs(farm: Farm, harvest: HarvestData): Promise<HarvestArtifact[]> {
    const artifacts: HarvestArtifact[] = [];

    for (const agent of farm.agents) {
      const terminalPath = path.join(pathConfig.getPath('LOGS_DIR'), 'terminals', `${farm.sessionName}_${agent.index}.log`);

      try {
        const content = await fs.readFile(terminalPath, 'utf-8');
        artifacts.push({
          id: uuidv4(),
          harvestId: harvest.id,
          agentId: agent.id,
          agentName: agent.name,
          type: 'terminal',
          path: `terminal/${agent.name}.log`,
          content,
          size: Buffer.byteLength(content),
          mimeType: 'text/plain',
          createdAt: new Date()
        });
      } catch (error) {
        // Terminal log might not exist
        logger.debug(`No terminal log for agent ${agent.name}`);
      }
    }

    return artifacts;
  }

  /**
   * Process harvest (generate summary, insights, etc.)
   */
  private async processHarvest(harvest: HarvestData): Promise<void> {
    // Generate summary from artifacts
    const summary = this.generateHarvestSummary(harvest);
    harvest.summary = summary;

    // Mark as completed
    harvest.status = HarvestStatus.COMPLETED;
    harvest.completedAt = new Date();
    harvest.updatedAt = new Date();

    await this.updateHarvestInDb(harvest);

    // Emit completion event
    this.emit('harvest:completed', harvest);
    websocketManager.broadcast('harvest:completed', harvest);
  }

  /**
   * Complete a harvest
   */
  public async completeHarvest(harvestId: string, userId: string, data?: any): Promise<HarvestData | null> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest || harvest.userId !== userId) {
      return null;
    }

    if (data) {
      harvest.artifacts = data.data || harvest.artifacts;
      harvest.summary = data.summary || harvest.summary;
    }

    harvest.status = HarvestStatus.COMPLETED;
    harvest.completedAt = new Date();
    harvest.updatedAt = new Date();

    await this.updateHarvestInDb(harvest);

    this.emit('harvest:completed', harvest);
    websocketManager.broadcast('harvest:completed', harvest);

    return harvest;
  }

  /**
   * Get harvest by ID
   */
  public async getHarvest(harvestId: string, userId: string): Promise<HarvestData | null> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest || harvest.userId !== userId) {
      return null;
    }
    return harvest;
  }

  /**
   * Get user's harvests with optional filtering
   */
  public async getUserHarvests(userId: string, filter?: HarvestFilter): Promise<HarvestData[]> {
    let harvests = Array.from(this.harvests.values())
      .filter(h => h.userId === userId);

    if (filter) {
      if (filter.farmId) {
        harvests = harvests.filter(h => h.farmId === filter.farmId);
      }
      if (filter.status) {
        harvests = harvests.filter(h => h.status === filter.status);
      }
      if (filter.startDate) {
        harvests = harvests.filter(h => h.createdAt >= filter.startDate);
      }
      if (filter.endDate) {
        harvests = harvests.filter(h => h.createdAt <= filter.endDate);
      }

      // Sorting
      const sortBy = filter.sortBy || 'createdAt';
      const sortOrder = filter.sortOrder || 'desc';
      harvests.sort((a, b) => {
        const aVal = a[sortBy] || new Date(0);
        const bVal = b[sortBy] || new Date(0);
        return sortOrder === 'asc' ?
          (aVal < bVal ? -1 : 1) :
          (aVal > bVal ? -1 : 1);
      });
    }

    return harvests;
  }

  /**
   * Delete a harvest
   */
  public async deleteHarvest(harvestId: string, userId: string): Promise<boolean> {
    const harvest = this.harvests.get(harvestId);
    if (!harvest || harvest.userId !== userId) {
      return false;
    }

    // Mark as deleted in database
    await db.query(`
      UPDATE harvests SET status = 'deleted', updated_at = $1
      WHERE id = $2
    `, [new Date(), harvestId]);

    this.harvests.delete(harvestId);

    this.emit('harvest:deleted', { id: harvestId });
    websocketManager.broadcast('harvest:deleted', { id: harvestId });

    return true;
  }

  /**
   * Handle farm completion
   */
  private async handleFarmCompleted(farm: Farm): Promise<void> {
    const harvest = await this.startHarvest(farm.id, farm.name, farm.createdBy);
    farm.harvestId = harvest.id;
  }

  /**
   * Handle farm failure
   */
  private async handleFarmFailed(farm: Farm): Promise<void> {
    // Still collect what we can from failed farms
    const harvest = await this.startHarvest(farm.id, farm.name, farm.createdBy);
    harvest.metadata.totalAgents = farm.agents.length;
    harvest.metadata.completedAgents = farm.agents.filter(a => a.status === 'completed').length;
  }

  /**
   * Update harvest in database
   */
  private async updateHarvestInDb(harvest: HarvestData): Promise<void> {
    await db.query(`
      UPDATE harvests
      SET status = $1, artifacts = $2, metadata = $3, summary = $4,
          updated_at = $5, completed_at = $6
      WHERE id = $7
    `, [harvest.status, JSON.stringify(harvest.artifacts), JSON.stringify(harvest.metadata),
        harvest.summary, harvest.updatedAt, harvest.completedAt, harvest.id]);
  }

  /**
   * Helper: Walk directory recursively
   */
  private async walkDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !this.shouldIgnoreDirectory(entry.name)) {
        files.push(...await this.walkDirectory(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnoreFile(filePath: string): boolean {
    const ignoredPatterns = [
      /node_modules/,
      /\.git/,
      /\.DS_Store/,
      /\.env/,
      /\.log$/,
      /\.tmp$/
    ];
    return ignoredPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Check if directory should be ignored
   */
  private shouldIgnoreDirectory(dirName: string): boolean {
    const ignoredDirs = ['node_modules', '.git', 'dist', 'build', '.next', '.cache'];
    return ignoredDirs.includes(dirName);
  }

  /**
   * Get file type from path
   */
  private getFileType(filePath: string): 'file' | 'code' | 'document' | 'data' {
    const ext = path.extname(filePath).toLowerCase();
    const codeExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h'];
    const docExts = ['.md', '.txt', '.doc', '.docx', '.pdf'];
    const dataExts = ['.json', '.xml', '.csv', '.yaml', '.yml'];

    if (codeExts.includes(ext)) return 'code';
    if (docExts.includes(ext)) return 'document';
    if (dataExts.includes(ext)) return 'data';
    return 'file';
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.css': 'text/css',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Generate harvest summary
   */
  private generateHarvestSummary(harvest: HarvestData): string {
    const codeFiles = harvest.artifacts.filter(a => a.type === 'code').length;
    const docFiles = harvest.artifacts.filter(a => a.type === 'document').length;
    const totalSize = harvest.metadata.totalSize;

    return `Harvest completed with ${harvest.artifacts.length} artifacts collected. ` +
           `${codeFiles} code files, ${docFiles} documents. ` +
           `Total size: ${this.formatBytes(totalSize)}`;
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
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    // Cancel active collections
    for (const timeout of this.activeCollections.values()) {
      clearTimeout(timeout);
    }
    this.activeCollections.clear();

    // Save any pending harvests
    for (const harvest of this.harvests.values()) {
      if (harvest.status === HarvestStatus.COLLECTING) {
        harvest.status = HarvestStatus.COMPLETED;
        harvest.completedAt = new Date();
        await this.updateHarvestInDb(harvest);
      }
    }
  }
}

// Export singleton instance and types
export const harvestService = UnifiedHarvestService.getInstance();
export const harvestFileCollector = harvestService; // Alias for compatibility